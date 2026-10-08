// Exact local quota pruning runs only within a drained connector deletion transaction.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {fileAsync} from './disconnectStore.js';
import {MAX_CACHE_BYTES} from '../core/cache.js';
import {MAX_ALERT_STATE_BYTES} from '../core/alerts.js';
import {providerIdForConnector} from '../core/connectors.js';
export async function pruneConnectorCache(id, name, directory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota'])) {
    if (!providerIdForConnector(id) || !['snapshots', 'alerts'].includes(name)) throw new Error('invalid connector cache scope');
    const file = Gio.File.new_for_path(GLib.build_filenamev([directory, `${name}.json`]));
    const limit = name === 'snapshots' ? MAX_CACHE_BYTES : MAX_ALERT_STATE_BYTES;
    let stream;
    const attributes = 'standard::type,standard::size,unix::uid,unix::mode,etag::value';
    const safe = info => info.get_file_type() === Gio.FileType.REGULAR && info.get_attribute_uint32('unix::uid') === new Gio.Credentials().get_unix_user() && info.get_size() <= limit && (info.get_attribute_uint32('unix::mode') & 0o077) === 0;
    try {
        const info = await fileAsync(file, 'query_info', [attributes, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS]);
        if (!safe(info)) throw new Error('unsafe connector cache');
        const etag = info.get_attribute_string('etag::value');
        if (!etag) throw new Error('connector cache version unavailable');
        stream = await fileAsync(file, 'read');
        const opened = await new Promise((resolve, reject) => stream.query_info_async(attributes, GLib.PRIORITY_DEFAULT, null, (source, result) => {
            try { resolve(source.query_info_finish(result)); } catch (error) { reject(error); }
        }));
        if (!safe(opened) || opened.get_attribute_uint32('unix::uid') !== info.get_attribute_uint32('unix::uid')) throw new Error('unsafe opened connector cache');
        const chunks = []; let length = 0;
        while (true) {
            const bytes = await new Promise((resolve, reject) => stream.read_bytes_async(Math.min(4096, limit - length + 1), GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try { resolve(source.read_bytes_finish(result).toArray()); } catch (error) { reject(error); }
            }));
            if (bytes.length === 0) break;
            length += bytes.length; if (length > limit) throw new Error('connector cache exceeds bound'); chunks.push(bytes);
        }
        const contents = new Uint8Array(length); let at = 0; for (const chunk of chunks) { contents.set(chunk, at); at += chunk.length; }
        const data = JSON.parse(new TextDecoder().decode(contents));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid connector cache');
        if (name === 'snapshots') {
            if (data.version !== 1 || !Array.isArray(data.snapshots)) throw new Error('invalid snapshot cache');
            data.snapshots = data.snapshots.filter(snapshot => snapshot?.id !== id);
        } else {
            if (![1, 2].includes(data.version)) throw new Error('invalid alert cache');
            for (const section of ['levels', 'connection']) {
                if (data[section] !== undefined && (!data[section] || typeof data[section] !== 'object' || Array.isArray(data[section]))) throw new Error('invalid alert cache section');
            }
            if (data.levels) for (const key of Object.keys(data.levels)) if (key.startsWith(`${id}|`)) delete data.levels[key];
            if (data.connection) delete data.connection[id];
        }
        await new Promise((resolve, reject) => file.replace_contents_async(new TextEncoder().encode(JSON.stringify(data)), etag, false, Gio.FileCreateFlags.PRIVATE, null, (source, result) => {
            try { source.replace_contents_finish(result); resolve(); } catch (error) { reject(error); }
        }));
        return true;
    } catch (error) {
        if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return true;
        throw new Error('connector cache could not be removed', {cause: error});
    } finally {
        if (stream) await new Promise(resolve => stream.close_async(GLib.PRIORITY_DEFAULT, null, (source, result) => { try { source.close_finish(result); } catch (_) { /* Read failed; transaction reports failure. */ } resolve(); }));
    }
}
