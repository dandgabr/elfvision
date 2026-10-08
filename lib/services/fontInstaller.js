// Preferences-only I/O. URLs and filenames come from the maintained manifest, never a theme.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {FONT_MANIFEST, FONT_LIMITS, FONT_REVISION, allowedFontUrl, fontPlan, hasFontHeader} from '../core/fontManifest.js';

for (const [type, method, finish] of [[Soup.Session, 'send_async', 'send_finish'], [Gio.InputStream, 'read_bytes_async', 'read_bytes_finish'], [Gio.InputStream, 'close_async', 'close_finish'], [Gio.OutputStream, 'close_async', 'close_finish'], [Gio.File, 'read_async', 'read_finish'],
    [Gio.OutputStream, 'write_bytes_async', 'write_bytes_finish'], [Gio.File, 'load_contents_async', 'load_contents_finish'],
    [Gio.Subprocess, 'wait_check_async', 'wait_check_finish'],
    ...['query_info', 'make_directory', 'set_attributes', 'create', 'replace_contents', 'enumerate_children', 'delete'].map(method => [Gio.File, `${method}_async`, `${method}_finish`]),
    [Gio.FileEnumerator, 'next_files_async', 'next_files_finish'], [Gio.FileEnumerator, 'close_async', 'close_finish']])
    Gio._promisify(type.prototype, method, finish);
const file = path => Gio.File.new_for_path(path);
const sha256 = bytes => GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, bytes);
const LICENSE_HASHES = {'poppins-OFL.txt': '6be04893d770899a015649c7aa3b582f871b272f8747a92b78b17c3e5c8b2573',
    'inter-OFL.txt': '5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57',
    'jetbrainsmono-OFL.txt': 'b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d'};
const sourceDirectory = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);

export function createFontTransport() {
    const session = new Soup.Session({timeout: 25, idle_timeout: 25});
    return {
        async open(url, cancellable) {
            const message = Soup.Message.new('GET', url);
            message.set_flags(Soup.MessageFlags.NO_REDIRECT);
            message.get_request_headers().replace('User-Agent', 'gnome-ai-quota-font-installer');
            const stream = await session.send_async(message, GLib.PRIORITY_DEFAULT, cancellable);
            const headers = message.get_response_headers();
            const length = headers.get_one('Content-Length');
            return {stream, status: message.status_code, location: headers.get_one('Location'),
                contentLength: length === null ? null : Number(length)};
        },
        destroy() { session.abort(); },
    };
}

async function directoryInfo(path, cancellable = null) {
    try { return await file(path).query_info_async('standard::type,unix::mode', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancellable); }
    catch (error) { if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return null; throw error; }
}

// Only our newly created staging tree is removed. No-follow traversal never reaches another tree.
async function removeStaging(path) {
    if (!path) return;
    const entry = file(path); const info = await directoryInfo(path);
    if (!info) return;
    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
        const children = await entry.enumerate_children_async('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null);
        try {
            for (;;) {
                const batch = await children.next_files_async(32, GLib.PRIORITY_DEFAULT, null);
                if (!batch.length) break;
                for (const child of batch) await removeStaging(`${path}/${child.get_name()}`);
            }
        } finally { await children.close_async(GLib.PRIORITY_DEFAULT, null); }
    }
    await entry.delete_async(GLib.PRIORITY_DEFAULT, null);
}

async function makeParents(path, cancellable) {
    try { await file(path).make_directory_async(GLib.PRIORITY_DEFAULT, cancellable); }
    catch (error) {
        if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) return;
        if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) throw error;
        const parent = GLib.path_get_dirname(path);
        if (parent === path) throw error;
        await makeParents(parent, cancellable);
        await file(path).make_directory_async(GLib.PRIORITY_DEFAULT, cancellable);
    }
}

async function privateDirectory(path, cancellable) {
    const attributes = new Gio.FileInfo(); attributes.set_attribute_uint32('unix::mode', 0o700);
    await file(path).set_attributes_async(attributes, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancellable);
}

async function readLimited(target, limit, cancellable) {
    const stream = await target.read_async(GLib.PRIORITY_DEFAULT, cancellable);
    const chunks = []; let size = 0;
    try {
        for (;;) {
            const chunk = await stream.read_bytes_async(16384, GLib.PRIORITY_DEFAULT, cancellable);
            if (!chunk.get_size()) break;
            size += chunk.get_size();
            if (size > limit) throw new Error('size_limit');
            chunks.push(chunk.toArray());
        }
    } finally { await stream.close_async(GLib.PRIORITY_DEFAULT, null); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
}

export class FontInstaller {
    constructor({directory = GLib.build_filenamev([GLib.get_user_data_dir(), 'fonts', 'gnome-ai-quota']),
        manifest = FONT_MANIFEST, transport = createFontTransport(), licenses = null, refresh = null, deadlineMs = 45000} = {}) {
        this._directory = directory;
        this._manifest = manifest;
        this._transport = transport;
        this._licenses = licenses;
        this._refresh = refresh;
        this._deadlineMs = Math.max(1, Math.min(45000, deadlineMs));
        this._generation = 0;
        this._active = null;
        this._child = null;
        this._destroyed = false;
    }

    cancel() {
        this._generation++;
        this._active?.cancel();
        this._child?.force_exit();
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.cancel();
        this._transport.destroy?.();
    }

    async _ensureDirectory(cancellable) {
        let info = await directoryInfo(this._directory, cancellable);
        if (!info) {
            await makeParents(this._directory, cancellable);
            info = await directoryInfo(this._directory, cancellable);
        }
        if (info.get_file_type() !== Gio.FileType.DIRECTORY)
            throw new Error('unsafe_directory');
        // Only the app-owned directory; existing user font parents/files are never chmod'ed.
        await privateDirectory(this._directory, cancellable);
    }

    async _license(name, cancellable) {
        if (this._licenses) {
            if (typeof this._licenses[name] !== 'string') throw new Error('license_missing');
            return new TextEncoder().encode(this._licenses[name]);
        }
        const path = GLib.build_filenamev([sourceDirectory, '..', '..', 'licenses', 'fonts', name]);
        const info = await file(path).query_info_async('standard::type,standard::size', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancellable);
        if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_size() > 16384) throw new Error('license_missing');
        const contents = await readLimited(file(path), 16384, cancellable);
        if (sha256(contents) !== LICENSE_HASHES[name]) throw new Error('license_mismatch');
        return contents;
    }

    async _sameBatch(path, plan, cancellable) {
        const info = await directoryInfo(path, cancellable);
        if (!info) return false;
        if (info.get_file_type() !== Gio.FileType.DIRECTORY) throw new Error('existing_conflict');
        try {
            for (const entry of plan.files) {
                const target = file(`${path}/${entry.filename}`);
                const item = await target.query_info_async('standard::type,standard::size', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancellable);
                if (item.get_file_type() !== Gio.FileType.REGULAR || item.get_size() !== entry.size) throw new Error('existing_conflict');
                const contents = await readLimited(target, entry.size, cancellable);
                if (sha256(contents) !== entry.sha256) throw new Error('existing_conflict');
            }
            for (const name of new Set(plan.files.map(entry => entry.licenseFile))) {
                const target = file(`${path}/${name}`);
                const item = await target.query_info_async('standard::type,standard::size', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancellable);
                if (item.get_file_type() !== Gio.FileType.REGULAR || item.get_size() > 16384) throw new Error('existing_conflict');
                const contents = await readLimited(target, 16384, cancellable);
                if (sha256(contents) !== sha256(await this._license(name, cancellable))) throw new Error('existing_conflict');
            }
        } catch (error) {
            if (cancellable.is_cancelled()) throw new Error('cancelled', {cause: error});
            if (['license_missing', 'license_mismatch'].includes(error.message)) throw error;
            throw new Error('existing_conflict', {cause: error});
        }
        return true;
    }

    async _download(entry, destination, cancellable, check, progress, count) {
        let url = entry.url, response;
        for (let redirect = 0; ; redirect++) {
            if (!allowedFontUrl(url, this._manifest)) throw new Error('redirect_rejected');
            check();
            response = await this._transport.open(url, cancellable);
            if (response.status >= 300 && response.status < 400) {
                await response.stream?.close_async(GLib.PRIORITY_DEFAULT, null);
                if (redirect >= FONT_LIMITS.redirects || !allowedFontUrl(response.location, this._manifest)) throw new Error('redirect_rejected');
                url = response.location; continue;
            }
            break;
        }
        const stream = response.stream;
        let output;
        try {
            if (response.status !== 200) throw new Error('download_failed');
            if (response.contentLength !== null && (!Number.isSafeInteger(response.contentLength) || response.contentLength !== entry.size))
                throw new Error('size_limit');
            output = await destination.create_async(Gio.FileCreateFlags.PRIVATE, GLib.PRIORITY_DEFAULT, cancellable);
            const digest = new GLib.Checksum(GLib.ChecksumType.SHA256);
            let total = 0, header = [];
            for (;;) {
                check();
                const chunk = await stream.read_bytes_async(16384, GLib.PRIORITY_DEFAULT, cancellable);
                const size = chunk.get_size();
                if (!size) break;
                total += size; count.bytes += size;
                if (total > entry.size || total > FONT_LIMITS.fileBytes || count.bytes > FONT_LIMITS.actionBytes) throw new Error('size_limit');
                const data = chunk.toArray();
                if (header.length < 4) header.push(...data.slice(0, 4 - header.length));
                digest.update(data);
                let written = 0;
                while (written < size) {
                    check();
                    const amount = await output.write_bytes_async(new GLib.Bytes(data.slice(written)), GLib.PRIORITY_DEFAULT, cancellable);
                    if (amount <= 0 || amount > size - written) throw new Error('install_failed');
                    written += amount;
                }
                progress({bytes: count.bytes});
            }
            if (total !== entry.size) throw new Error('size_limit');
            if (digest.get_string() !== entry.sha256) throw new Error('digest_mismatch');
            if (!hasFontHeader(header)) throw new Error('invalid_font');
            check();
        } finally {
            try { await output?.close_async(GLib.PRIORITY_DEFAULT, null); } finally { await stream?.close_async(GLib.PRIORITY_DEFAULT, null); }
        }
    }

    async _refreshCache(path, cancellable) {
        if (this._refresh) return this._refresh(path, cancellable);
        const executable = GLib.find_program_in_path('fc-cache');
        if (!executable) return false;
        let timer = 0;
        try {
            this._child = Gio.Subprocess.new([executable, '-f', path], Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
            timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000, () => { timer = 0; this._child?.force_exit(); return GLib.SOURCE_REMOVE; });
            return await this._child.wait_check_async(cancellable);
        } catch (_error) { return false; }
        finally { if (timer) GLib.source_remove(timer); this._child?.force_exit(); this._child = null; }
    }

    async install(ids, {progress = () => {}, committed = () => {}} = {}) {
        if (this._destroyed) throw new Error('cancelled');
        if (this._active) throw new Error('busy');
        const plan = fontPlan(ids, this._manifest);
        const batch = `${FONT_REVISION}-${plan.files.map(entry => entry.id).sort().join('-')}`;
        const destination = `${this._directory}/${batch}`;
        const cancellable = new Gio.Cancellable(); this._active = cancellable;
        const generation = ++this._generation;
        const check = () => { if (cancellable.is_cancelled() || generation !== this._generation || this._destroyed) throw new Error('cancelled'); };
        let published = false;
        let staging = null, timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._deadlineMs, () => { timer = 0; cancellable.cancel(); return GLib.SOURCE_REMOVE; });
        try {
            await this._ensureDirectory(cancellable);
            if (await this._sameBatch(destination, plan, cancellable)) {
                check(); published = true; committed();
                return {status: 'installed', batch, restartRequired: false};
            }
            staging = `${this._directory}/.stage-${GLib.uuid_string_random()}`;
            await file(staging).make_directory_async(GLib.PRIORITY_DEFAULT, cancellable);
            await privateDirectory(staging, cancellable);
            const count = {bytes: 0};
            for (const entry of plan.files) await this._download(entry, file(`${staging}/${entry.filename}`), cancellable, check, progress, count);
            for (const name of new Set(plan.files.map(entry => entry.licenseFile))) {
                check(); const contents = await this._license(name, cancellable);
                await file(`${staging}/${name}`).replace_contents_async(contents, null, false, Gio.FileCreateFlags.PRIVATE, cancellable);
            }
            await this._ensureDirectory(cancellable); check();
            // Same-filesystem atomic rename. No overwrite/copy fallback and no await between the
            // final cancellation check and commit; cancellation can never publish a late batch.
            file(staging).move(file(destination), Gio.FileCopyFlags.NO_FALLBACK_FOR_MOVE, null, null);
            staging = null; published = true; committed();
            const refreshed = await this._refreshCache(destination, cancellable);
            return {status: 'installed', batch, restartRequired: !refreshed};
        } catch (error) {
            if (published) return {status: 'installed', batch, restartRequired: true};
            if (cancellable.is_cancelled() || generation !== this._generation) throw new Error('cancelled', {cause: error});
            const known = ['unsafe_directory', 'existing_conflict', 'license_missing', 'license_mismatch', 'redirect_rejected', 'size_limit', 'digest_mismatch', 'invalid_font', 'download_failed'];
            throw new Error(known.includes(error.message) ? error.message : 'install_failed', {cause: error});
        } finally {
            if (timer) GLib.source_remove(timer);
            try { await removeStaging(staging); } finally { this._active = null; }
        }
    }
}
