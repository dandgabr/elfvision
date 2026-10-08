// Reads and writes the alert state (docs/adr/0010) next to the snapshot cache. Like the cache it
// is a small file replaced atomically, in a private folder, and a bad file is an empty state.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {getDisconnectGate} from './disconnectGate.js';
import {ensurePrivateDirectory, replaceFile, fileAsync} from './disconnectStore.js';

import {MAX_ALERT_STATE_BYTES, emptyAlertState, parseAlertState, serializeAlertState} from '../core/alerts.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

const decoder = new TextDecoder();

export class AlertStore {
    /** @param {string} [directory] - defaults to ~/.cache/gnome-ai-quota */
    constructor(directory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota']), {gate = getDisconnectGate(), ticket = null} = {}) {
        this._gate = gate;
        this._ticket = ticket;
        this._captured = null;
        this._writes = Promise.resolve();
        this._directory = directory;
        this._file = Gio.File.new_for_path(GLib.build_filenamev([directory, 'alerts.json']));
    }

    async _capture() {
        if (!this._gate) return null; // Explicit demo/isolated-test paths only.
        return this._captured ??= this._ticket ? Promise.resolve(this._ticket) : this._gate.capture();
    }

    async load() {
        try {
            const ticket = await this._capture();
            if (this._gate) await this._gate.assertCurrent(ticket);
            // The size is looked at first: a huge file must not be read into memory.
            const info = await fileAsync(this._file, 'query_info', ['standard::size,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS]);
            if (info.get_file_type() !== Gio.FileType.REGULAR)
                return {state: emptyAlertState(), problems: ['the alert state is not a regular file; ignoring it']};
            if (info.get_size() > MAX_ALERT_STATE_BYTES)
                return {state: emptyAlertState(), problems: ['the alert state is too large; ignoring it']};
            const [contents] = await this._file.load_contents_async(null);
            if (this._gate) await this._gate.assertCurrent(ticket);
            return parseAlertState(decoder.decode(contents));
        } catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return {state: emptyAlertState(), problems: []};
            return {state: emptyAlertState(), problems: [`cannot read the alert state: ${error.message}`]};
        }
    }

    /** Async atomic commits, serialized by the durable gate and retained start ticket. */
    save(state) {
        const write = this._writes.then(() => this._save(state));
        this._writes = write.catch(() => {});
        return write;
    }

    async _save(state) {
        try {
            const text = serializeAlertState(state);
            if (text === null) {
                console.warn('gnome-ai-quota: the alert state is too large to write; not saving it');
                return;
            }
            const ticket = await this._capture();
            const write = async () => { await ensurePrivateDirectory(this._directory); await replaceFile(this._file, text); };
            if (this._gate) await this._gate.guardFileWrite(ticket, write);
            else await write();
        } catch (error) {
            if (!['stale', 'blocked'].includes(error.code)) console.warn('gnome-ai-quota: cannot write the alert state');
        }
    }
}
