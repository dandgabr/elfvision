// Reads and writes the snapshot cache in the user's cache directory.
// Reads and commits are asynchronous; the credential gate serializes every atomic commit.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {getDisconnectGate} from './disconnectGate.js';
import {ensurePrivateDirectory, replaceFile, fileAsync} from './disconnectStore.js';

import {MAX_CACHE_BYTES, parseCache, serializeCache} from '../core/cache.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

const decoder = new TextDecoder();

export class CacheStore {
    /** @param {string} [directory] - defaults to ~/.cache/gnome-ai-quota */
    constructor(directory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota']), {gate = getDisconnectGate(), ticket = null} = {}) {
        this._gate = gate;
        this._ticket = ticket;
        this._captured = null;
        this._writes = Promise.resolve();
        this._directory = directory;
        this._file = Gio.File.new_for_path(GLib.build_filenamev([directory, 'snapshots.json']));
    }

    async _capture() {
        if (!this._gate) return null; // Explicit demo/isolated-test paths only.
        return this._captured ??= this._ticket ? Promise.resolve(this._ticket) : this._gate.capture();
    }

    async load() {
        try {
            const ticket = await this._capture();
            if (this._gate) await this._gate.assertCurrent(ticket);
            // Look at the size first: a huge file must not be read into memory.
            const info = await fileAsync(this._file, 'query_info', ['standard::size,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS]);
            if (info.get_file_type() !== Gio.FileType.REGULAR)
                return {snapshots: [], problems: ['the cache is not a regular file; ignoring it']};
            if (info.get_size() > MAX_CACHE_BYTES)
                return {snapshots: [], problems: ['the cache file is too large; ignoring it']};
            const [contents] = await this._file.load_contents_async(null);
            if (this._gate) await this._gate.assertCurrent(ticket);
            return parseCache(decoder.decode(contents));
        } catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return {snapshots: [], problems: []};
            return {snapshots: [], problems: [`cannot read the cache: ${error.message}`]};
        }
    }

    /** Commit in invocation order. The retained ticket fences data loaded before a disconnect.
     * @param {object[]} snapshots
     * @returns {Promise<void>}
     */
    save(snapshots) {
        const write = this._writes.then(() => this._save(snapshots));
        this._writes = write.catch(() => {});
        return write;
    }

    async _save(snapshots) {
        try {
            const ticket = await this._capture();
            const text = serializeCache(snapshots, Date.now());
            const write = async () => { await ensurePrivateDirectory(this._directory); await replaceFile(this._file, text); };
            if (this._gate) await this._gate.guardFileWrite(ticket, write);
            else await write();
        } catch (error) {
            if (!['stale', 'blocked'].includes(error.code)) console.warn('Elfvision: cannot write the cache');
        }
    }
}
