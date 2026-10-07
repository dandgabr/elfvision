// Reads and writes the snapshot cache in the user's cache directory.
// Reading is asynchronous; the final write on shutdown is synchronous because
// the extension is about to be disabled and the file is a few kilobytes.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {MAX_CACHE_BYTES, parseCache, serializeCache} from '../core/cache.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

const decoder = new TextDecoder();

export class CacheStore {
    /** @param {string} [directory] - defaults to ~/.cache/gnome-ai-quota */
    constructor(directory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota'])) {
        this._directory = directory;
        this._writes = 0;
        this._file = Gio.File.new_for_path(GLib.build_filenamev([directory, 'snapshots.json']));
    }

    /** @returns {Promise<{snapshots: object[], problems: string[]}>} */
    async load() {
        try {
            // Look at the size first: a huge file must not be read into memory.
            const info = this._file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
            if (info.get_size() > MAX_CACHE_BYTES)
                return {snapshots: [], problems: ['the cache file is too large; ignoring it']};
            const [contents] = await this._file.load_contents_async(null);
            return parseCache(decoder.decode(contents));
        } catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return {snapshots: [], problems: []};
            return {snapshots: [], problems: [`cannot read the cache: ${error.message}`]};
        }
    }

    /**
     * @param {object[]} snapshots
     * @param {boolean} [sync] - block until written (used on shutdown)
     * @returns {Promise<void>}
     */
    async save(snapshots, sync = false) {
        // Each write has a number: a slow asynchronous one that finishes after a newer write
        // (the last synchronous one, when the extension stops) must not be the one that stays.
        const ticket = ++this._writes;
        try {
            const bytes = new TextEncoder().encode(serializeCache(snapshots, Date.now()));
            GLib.mkdir_with_parents(this._directory, 0o700);
            if (sync) {
                // An asynchronous write still running would finish after this one: cancel it.
                this._pending?.cancel();
                this._file.replace_contents(bytes, null, false, Gio.FileCreateFlags.PRIVATE, null);
                return;
            }
            // Written to a temporary file by Gio and renamed over the cache, so an older write
            // that is still running can only be replaced, never mixed in: skip it if outdated.
            if (ticket !== this._writes)
                return;
            this._pending?.cancel();
            const cancellable = new Gio.Cancellable();
            this._pending = cancellable;
            await this._file.replace_contents_bytes_async(new GLib.Bytes(bytes), null, false,
                Gio.FileCreateFlags.PRIVATE, cancellable);
        } catch (error) {
            // A write that was cancelled on purpose is not a problem.
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.warn(`gnome-ai-quota: cannot write the cache: ${error.message}`);
        }
    }
}
