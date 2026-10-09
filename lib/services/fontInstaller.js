// Preferences-only I/O. URLs and filenames come from the maintained manifest, never a theme.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {FONT_MANIFEST, FONT_LIMITS, FONT_REVISION, allowedFontUrl, fontPlan, hasFontHeader} from '../core/fontManifest.js';
import {fontFileIsVisible, fontSource, parseFontconfigList} from '../core/fontCoverage.js';

for (const [type, method, finish] of [[Soup.Session, 'send_async', 'send_finish'], [Gio.InputStream, 'read_bytes_async', 'read_bytes_finish'], [Gio.InputStream, 'close_async', 'close_finish'], [Gio.OutputStream, 'close_async', 'close_finish'], [Gio.File, 'read_async', 'read_finish'],
    [Gio.OutputStream, 'write_bytes_async', 'write_bytes_finish'], [Gio.File, 'load_contents_async', 'load_contents_finish'],
    [Gio.Subprocess, 'wait_check_async', 'wait_check_finish'], [Gio.Subprocess, 'communicate_utf8_async', 'communicate_utf8_finish'],
    ...['query_info', 'make_directory', 'set_attributes', 'create', 'replace_contents', 'enumerate_children', 'delete'].map(method => [Gio.File, `${method}_async`, `${method}_finish`]),
    [Gio.FileEnumerator, 'next_files_async', 'next_files_finish'], [Gio.FileEnumerator, 'close_async', 'close_finish']])
    Gio._promisify(type.prototype, method, finish);
const file = path => Gio.File.new_for_path(path);
const sha256 = bytes => GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, bytes);

async function listFontconfig(cancellable = null) {
    const executable = GLib.find_program_in_path('fc-list');
    if (!executable)
        return null;
    let timer = 0, child = null;
    try {
        const argv = [executable, '--format=%{family}\\t%{file}\\n'];
        child = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000, () => { timer = 0; child?.force_exit(); return GLib.SOURCE_REMOVE; });
        const [, stdout] = await child.communicate_utf8_async(null, cancellable);
        return child.get_successful() ? stdout : null;
    } catch (_error) {
        return null;
    } finally {
        if (timer)
            GLib.source_remove(timer);
        child?.force_exit();
    }
}
const LICENSE_HASHES = {
    'archivo-OFL.txt': '108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b',
    'archivoblack-OFL.txt': '3173acd82f8c6159b5b1037b539fcbd4edff68e65c2ea8b9412b5a5ca97b08ff',
    'caveat-OFL.txt': '1f9d81d094273d82f3898a1ee8b598a717d050ecbf5ff7bede105b704880157b',
    'courierprime-OFL.txt': '9a755af092b494944c99f471be6fddd19b006a448fefdc4717e4ee0aa09a97b0',
    'dmsans-OFL.txt': '9af36190332437f5ecd09974de43c1f7c77a310a996cdd8ceb25628b458840e1',
    'fraunces-OFL.txt': 'bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b',
    'geist-OFL.txt': '1781d2806a07d91c4edf4740b88449fab7d0eadad53f7c351b94cd4d4eb8c00f',
    'geistmono-OFL.txt': '1781d2806a07d91c4edf4740b88449fab7d0eadad53f7c351b94cd4d4eb8c00f',
    'gochihand-OFL.txt': 'b36cb03d6ddc163452d9935ce6f325741434272d3889acf42cc23584f31a85bf',
    'inter-OFL.txt': '5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57',
    'jetbrainsmono-OFL.txt': 'b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d',
    'josefinsans-OFL.txt': 'aee5a4081e8a52f80428b30f178b719d115f18dad3e1fa15a986163e1078a85b',
    'montserrat-OFL.txt': '8b7141c03fa4f8d44e6345d5d4931709290f0f67875e452e95ac1fd3a027802e',
    'newsreader-OFL.txt': 'fdfad38143ec470553cae82a1e45320bdd1b9ec70415d37bd0171051d8a4ded8',
    'nunito-OFL.txt': '580df76c95a1ec5ab878ceb25bb3d85c6a076804e9c970c8c6972aea775fdf65',
    'nunitosans-OFL.txt': 'efbb0c9e864cef973982d9a17567e6be5c3d1759695574586f3f18c7ecca064b',
    'orbitron-OFL.txt': 'ab609b0e110d622435ff337cdf233288556e011bbf9bd0550be98846c0630819',
    'patrickhand-OFL.txt': '377f4f9c19e935228552478eb68cc2ed82910988a60ba60e2ac73b09f32d02d1',
    'plusjakartasans-OFL.txt': '995c7199cab65954f545996326755daee7b63cc6b42b06c13da1f9502ab08a99',
    'poppins-OFL.txt': '6be04893d770899a015649c7aa3b582f871b272f8747a92b78b17c3e5c8b2573',
    'rajdhani-OFL.txt': 'f62ef357d3a1c3d27edd35a6e1ba350e8a8d13499797964eeadefbf0b3b15d1f',
    'robotoflex-OFL.txt': '9cbaed04b20c853f99840efe5dc96956f6f6120ed83a0ade35f9281a2b63e5d0',
    'rubik-OFL.txt': '472cbe7c25441df63e9c7864b43eb3c0f4b3df950c66a76224e6cfe1eae843fb',
    'rubikmonoone-OFL.txt': '43d530580461a574f6dfed9e15af6a74e95f7c04d9bfa1174a63ff036e8eee07',
    'sharetechmono-OFL.txt': '9d96f445b6e9c701428811d0177f894874f8d6f07ecc30d568c506542368f3ff',
    'sora-OFL.txt': 'ba0b9729c9428ba79a0459ab8ec575791b51509dbec213e383d0316d37fec299',
    'sourceserif4-OFL.txt': '5f94c3fd3a23131a417ab5a0c8452de57e70c3cfb9f604d88241f7065ebf9fd9',
    'spacegrotesk-OFL.txt': '564ce565c371c5e5bbf286006565a7c9aa55a9f56e7ca58d56e05d649dd61a72',
};
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
        manifest = FONT_MANIFEST, transport = createFontTransport(), licenses = null, refresh = null, verify = null, deadlineMs = 120000} = {}) {
        this._directory = directory;
        this._manifest = manifest;
        this._transport = transport;
        this._licenses = licenses;
        this._refresh = refresh;
        this._verify = verify;
        this._deadlineMs = Math.max(1, Math.min(120000, deadlineMs));
        this._generation = 0;
        this._active = null;
        this._child = null;
        this._inventoryCancellable = null;
        this._destroyed = false;
    }

    cancel() {
        this._generation++;
        this._active?.cancel();
        this._inventoryCancellable?.cancel();
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

    async _verifyFontconfig(path, plan, cancellable) {
        if (this._verify) {
            try { return await this._verify(path, plan, cancellable) ? 'available' : 'missing'; } catch (_error) { return 'missing'; }
        }
        const output = await listFontconfig(cancellable);
        if (output === null)
            return 'unavailable';
        const prefix = `${path.replace(/\/$/, '')}/`;
        const records = parseFontconfigList(output).filter(record => record.path.startsWith(prefix));
        return plan.files.every(entry => fontFileIsVisible(entry, records)) ? 'available' : 'missing';
    }

    async fontInventory() {
        this._inventoryCancellable?.cancel();
        const cancellable = new Gio.Cancellable(); this._inventoryCancellable = cancellable;
        try {
            const output = await listFontconfig(cancellable);
            if (output === null)
                return {status: 'unavailable', fonts: []};
            const fonts = parseFontconfigList(output).map(record => ({...record,
                source: fontSource(record.path, GLib.get_user_data_dir(), GLib.get_home_dir())}));
            return {status: 'available', fonts};
        } finally {
            if (this._inventoryCancellable === cancellable)
                this._inventoryCancellable = null;
        }
    }

    async _checkPublished(path, plan, batch, cancellable) {
        const refreshed = await this._refreshCache(path, cancellable);
        const fontconfigStatus = await this._verifyFontconfig(path, plan, cancellable);
        return {status: 'installed', batch, cacheStatus: refreshed ? 'refreshed' : 'failed',
            fontconfigStatus, restartRequired: !refreshed || fontconfigStatus !== 'available'};
    }

    async install(ids, {progress = () => {}, committed = () => {}} = {}) {
        if (this._destroyed) throw new Error('cancelled');
        if (this._active) throw new Error('busy');
        const plan = fontPlan(ids, this._manifest);
        const fingerprint = sha256(new TextEncoder().encode(plan.files.map(entry => entry.id).sort().join('\n')));
        const batch = `${FONT_REVISION.slice(0, 12)}-${fingerprint}`;
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
                return await this._checkPublished(destination, plan, batch, cancellable);
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
            return await this._checkPublished(destination, plan, batch, cancellable);
        } catch (error) {
            if (published) return {status: 'installed', batch, cacheStatus: 'failed', fontconfigStatus: 'unknown', restartRequired: true};
            if (cancellable.is_cancelled() || generation !== this._generation) throw new Error('cancelled', {cause: error});
            const known = ['unsafe_directory', 'existing_conflict', 'license_missing', 'license_mismatch', 'redirect_rejected', 'size_limit', 'digest_mismatch', 'invalid_font', 'download_failed'];
            throw new Error(known.includes(error.message) ? error.message : 'install_failed', {cause: error});
        } finally {
            if (timer) GLib.source_remove(timer);
            try { await removeStaging(staging); } finally { this._active = null; }
        }
    }
}
