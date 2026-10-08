// Reads providers.local.json (docs/adr/0009). The file holds client ids and maybe a
// client secret, so it is refused unless only its owner can read it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {MAX_BYTES, parseLocalConfig} from '../core/localConfig.js';

/** Concurrent callers share one bounded read; successful or failed results expire after a minute. */
export function createLocalConfigCache({readConfig = readLocalConfigAsync, now = Date.now, ttlMs = 60000} = {}) {
    let cached = {at: -Infinity, providers: {}}, pending = null;
    return {
        async get(id) {
            if (now() - cached.at > ttlMs) {
                pending ??= Promise.resolve().then(readConfig).catch(() => ({providers: {}}))
                    .then(result => { cached = {at: now(), providers: result.providers}; })
                    .finally(() => { pending = null; });
                await pending;
            }
            return cached.providers[id];
        },
    };
}

/** @returns {string} where the file lives */
export function localConfigPath() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-ai-quota', 'providers.local.json']);
}

/**
 * @param {string} [path]
 * @returns {{providers: object, problems: string[], missing: boolean}} `missing` is true when
 *   the file does not exist; an unsafe file gives no providers and a problem that says so
 */
export function readLocalConfig(path = localConfigPath()) {
    const file = Gio.File.new_for_path(path);
    let info;
    try {
        info = file.query_info('standard::type,standard::size,unix::mode,unix::uid', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    } catch (error) {
        if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return {providers: {}, problems: [], missing: true};
        return {providers: {}, problems: ['the file cannot be read'], missing: false};
    }
    // The directory too: others must not be able to swap the file for another.
    try {
        const directory = file.get_parent().query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null);
        if ((directory.get_attribute_uint32('unix::mode') & 0o022) !== 0)
            return {providers: {}, problems: ['the folder can be changed by others: run chmod 700 on it'], missing: false};
    } catch (_error) {
        return {providers: {}, problems: ['the file cannot be read'], missing: false};
    }
    if (info.get_file_type() !== Gio.FileType.REGULAR)
        return {providers: {}, problems: ['the path is not a regular file'], missing: false};
    if ((info.get_attribute_uint32('unix::mode') & 0o077) !== 0)
        return {providers: {}, problems: ['the file can be read by others: run chmod 600 on it'], missing: false};
    if (info.get_attribute_uint32('unix::uid') !== new Gio.Credentials().get_unix_user())
        return {providers: {}, problems: ['the file belongs to another user'], missing: false};
    if (info.get_size() > MAX_BYTES)
        return {providers: {}, problems: ['the file is too large'], missing: false};
    try {
        const [, bytes] = file.load_contents(null);
        return {...parseLocalConfig(new TextDecoder().decode(bytes)), missing: false};
    } catch (_error) {
        return {providers: {}, problems: ['the file cannot be read'], missing: false};
    }
}


/** Shell and preferences use bounded asynchronous reads with the same private-file policy. */
export async function readLocalConfigAsync(path = localConfigPath(), {file = Gio.File.new_for_path(path), timeoutMs = 5000} = {}) {
    const unavailable = {providers: {}, problems: ['the file cannot be read'], missing: false};
    const cancellable = new Gio.Cancellable();
    const duration = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(5000, timeoutMs)) : 5000;
    let timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
        timer = 0; cancellable.cancel(); return GLib.SOURCE_REMOVE;
    });
    const query = (target, attributes, flags) => new Promise((resolve, reject) => {
        target.query_info_async(attributes, flags, GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
            try { resolve(source.query_info_finish(result)); } catch (error) { reject(error); }
        });
    });
    const attributes = 'standard::type,standard::size,unix::mode,unix::uid';
    const rejectInfo = info => {
        let problem = null;
        if (info.get_file_type() !== Gio.FileType.REGULAR) problem = 'the path is not a regular file';
        else if ((info.get_attribute_uint32('unix::mode') & 0o077) !== 0) problem = 'the file can be read by others: run chmod 600 on it';
        else if (info.get_attribute_uint32('unix::uid') !== new Gio.Credentials().get_unix_user()) problem = 'the file belongs to another user';
        else if (info.get_size() > MAX_BYTES) problem = 'the file is too large';
        return problem ? {providers: {}, problems: [problem], missing: false} : null;
    };
    let stream;
    try {
        let info;
        try { info = await query(file, attributes, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS); }
        catch (error) {
            return error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)
                ? {providers: {}, problems: [], missing: true} : unavailable;
        }
        const directory = await query(file.get_parent(), 'unix::mode', Gio.FileQueryInfoFlags.NONE);
        if ((directory.get_attribute_uint32('unix::mode') & 0o022) !== 0)
            return {providers: {}, problems: ['the folder can be changed by others: run chmod 700 on it'], missing: false};
        const rejected = rejectInfo(info);
        if (rejected) return rejected;
        stream = await new Promise((resolve, reject) => file.read_async(GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
            try { resolve(source.read_finish(result)); } catch (error) { reject(error); }
        }));
        // Verify the opened object too: the path can be replaced while asynchronous checks wait.
        const opened = await new Promise((resolve, reject) => stream.query_info_async(attributes, GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
            try { resolve(source.query_info_finish(result)); } catch (error) { reject(error); }
        }));
        const rejectedOpened = rejectInfo(opened);
        if (rejectedOpened) return rejectedOpened;
        const chunks = [];
        let total = 0;
        while (true) {
            const bytes = await new Promise((resolve, reject) => stream.read_bytes_async(Math.min(4096, MAX_BYTES + 1 - total), GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
                try { resolve(source.read_bytes_finish(result).toArray()); } catch (error) { reject(error); }
            }));
            if (!bytes.length)
                break;
            total += bytes.length;
            if (total > MAX_BYTES)
                return {providers: {}, problems: ['the file is too large'], missing: false};
            chunks.push(bytes);
        }
        const contents = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { contents.set(chunk, offset); offset += chunk.length; }
        return {...parseLocalConfig(new TextDecoder().decode(contents)), missing: false};
    } catch (_error) {
        return unavailable;
    } finally {
        if (timer) GLib.source_remove(timer);
        cancellable.cancel();
        if (stream) {
            await new Promise(resolve => stream.close_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try { source.close_finish(result); } catch (_error) { /* Already closed. */ }
                resolve();
            }));
        }
    }
}
