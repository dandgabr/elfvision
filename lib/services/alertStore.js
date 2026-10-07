// Reads and writes the alert state (docs/adr/0010) next to the snapshot cache. Like the cache it
// is a small file replaced atomically, in a private folder, and a bad file is an empty state.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {MAX_ALERT_STATE_BYTES, emptyAlertState, parseAlertState, serializeAlertState} from '../core/alerts.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

const decoder = new TextDecoder();

export class AlertStore {
    /** @param {string} [directory] - defaults to ~/.cache/gnome-ai-quota */
    constructor(directory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota'])) {
        this._directory = directory;
        this._file = Gio.File.new_for_path(GLib.build_filenamev([directory, 'alerts.json']));
    }

    /** @returns {Promise<{state: object, problems: string[]}>} */
    async load() {
        try {
            // The size is looked at first: a huge file must not be read into memory.
            const info = this._file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
            if (info.get_size() > MAX_ALERT_STATE_BYTES)
                return {state: emptyAlertState(), problems: ['the alert state is too large; ignoring it']};
            const [contents] = await this._file.load_contents_async(null);
            return parseAlertState(decoder.decode(contents));
        } catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return {state: emptyAlertState(), problems: []};
            return {state: emptyAlertState(), problems: [`cannot read the alert state: ${error.message}`]};
        }
    }

    /** Written at once and atomically (see CacheStore.save for why). */
    save(state) {
        try {
            const bytes = new TextEncoder().encode(serializeAlertState(state));
            GLib.mkdir_with_parents(this._directory, 0o700);
            this._file.replace_contents(bytes, null, false, Gio.FileCreateFlags.PRIVATE, null);
        } catch (error) {
            console.warn(`gnome-ai-quota: cannot write the alert state: ${error.message}`);
        }
    }
}
