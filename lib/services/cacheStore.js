// Reads and writes the snapshot cache in the user's cache directory.
// Reading is asynchronous; writing is synchronous and atomic, because the file is a
// few kilobytes.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {MAX_CACHE_BYTES, parseCache, serializeCache} from '../core/cache.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

const decoder = new TextDecoder();

export class CacheStore {
    /** @param {string} [directory] - defaults to ~/.cache/gnome-ai-quota */
    constructor(directory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota'])) {
        this._directory = directory;
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
     * Write the cache. The file is a few kilobytes and Gio replaces it atomically (a temporary
     * file, then a rename), so this is done at once: an asynchronous write that can still be
     * running when another begins is exactly how a file ends up empty.
     *
     * @param {object[]} snapshots
     * @returns {Promise<void>}
     */
    async save(snapshots) {
        try {
            const bytes = new TextEncoder().encode(serializeCache(snapshots, Date.now()));
            GLib.mkdir_with_parents(this._directory, 0o700);
            this._file.replace_contents(bytes, null, false, Gio.FileCreateFlags.PRIVATE, null);
        } catch (error) {
            console.warn(`gnome-ai-quota: cannot write the cache: ${error.message}`);
        }
    }
}
