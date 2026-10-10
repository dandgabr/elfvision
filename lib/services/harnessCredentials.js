// Read-only access to exact, documented credential locations owned by supported tools.
// No source is enumerated and this module never writes or refreshes another tool's item.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Secret from 'gi://Secret';

import {harnessCredentialSource} from '../core/harnessSources.js';

const MAX_BYTES = 1024 * 1024;
const MAX_SECRET_CHARS = 8192;
const READ_TIMEOUT_MS = 5000;
const GENERIC_SCHEMA = new Secret.Schema('org.freedesktop.Secret.Generic', Secret.SchemaFlags.NONE, {
    service: Secret.SchemaAttributeType.STRING,
});

export class HarnessCredentialError extends Error {
    constructor(code) {
        super(code);
        this.name = 'HarnessCredentialError';
        this.code = code;
    }
}

function selectPath(value, path) {
    let current = value;
    for (const part of path) {
        if (!current || typeof current !== 'object' || !Object.hasOwn(current, part))
            return null;
        current = current[part];
    }
    return typeof current === 'string' && current.length > 0 && current.length <= MAX_SECRET_CHARS && !/[\u0000-\u001f\u007f]/.test(current)
        ? current : null;
}

function unavailable(code) {
    return new HarnessCredentialError(code);
}

function queryInfo(file, cancellable, flags = Gio.FileQueryInfoFlags.NONE) {
    return new Promise((resolve, reject) => file.query_info_async(
        'standard::type,standard::size,unix::mode,unix::uid', flags, GLib.PRIORITY_DEFAULT, cancellable,
        (source, result) => { try { resolve(source.query_info_finish(result)); } catch (error) { reject(error); } }));
}

function readStream(stream, cancellable) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        const next = () => stream.read_bytes_async(Math.min(16384, MAX_BYTES + 1 - total), GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
            try {
                const bytes = source.read_bytes_finish(result).toArray();
                if (!bytes.length) {
                    const contents = new Uint8Array(total);
                    let offset = 0;
                    for (const chunk of chunks) { contents.set(chunk, offset); offset += chunk.length; }
                    resolve(new TextDecoder().decode(contents));
                    return;
                }
                total += bytes.length;
                if (total > MAX_BYTES) {
                    reject(unavailable('unreadable'));
                    return;
                }
                chunks.push(bytes);
                next();
            } catch (_error) {
                reject(unavailable('unreadable'));
            }
        });
        next();
    });
}

function privateRegularFile(info) {
    return info.get_file_type() === Gio.FileType.REGULAR && info.get_size() <= MAX_BYTES &&
        info.get_attribute_uint32('unix::uid') === new Gio.Credentials().get_unix_user() &&
        (info.get_attribute_uint32('unix::mode') & 0o077) === 0;
}

function privateDirectory(info) {
    return info.get_file_type() === Gio.FileType.DIRECTORY &&
        info.get_attribute_uint32('unix::uid') === new Gio.Credentials().get_unix_user() &&
        (info.get_attribute_uint32('unix::mode') & 0o022) === 0;
}

async function readJsonCredential(path, source, {cancellable = new Gio.Cancellable()} = {}) {
    const file = Gio.File.new_for_path(path);
    let stream = null;
    let timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, READ_TIMEOUT_MS, () => {
        timeout = 0;
        cancellable.cancel();
        return GLib.SOURCE_REMOVE;
    });
    try {
        let info;
        try { info = await queryInfo(file, cancellable, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS); }
        catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) throw unavailable('missing');
            throw unavailable('unreadable');
        }
        let parentInfo;
        try { parentInfo = await queryInfo(file.get_parent(), cancellable, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS); }
        catch (_error) { throw unavailable('unreadable'); }
        if (!privateDirectory(parentInfo)) throw unavailable('unreadable');
        if (!privateRegularFile(info)) throw unavailable('unreadable');
        stream = await new Promise((resolve, reject) => file.read_async(GLib.PRIORITY_DEFAULT, cancellable,
            (target, result) => { try { resolve(target.read_finish(result)); } catch (_error) { reject(unavailable('unreadable')); } }));
        const opened = await new Promise((resolve, reject) => stream.query_info_async(
            'standard::type,standard::size,unix::mode,unix::uid', GLib.PRIORITY_DEFAULT, cancellable,
            (target, result) => { try { resolve(target.query_info_finish(result)); } catch (_error) { reject(unavailable('unreadable')); } }));
        if (!privateRegularFile(opened)) throw unavailable('unreadable');
        const text = await readStream(stream, cancellable);
        let json;
        try { json = JSON.parse(text); } catch (_error) { throw unavailable('unreadable'); }
        return selectPath(json, source.select);
    } finally {
        if (timeout) GLib.source_remove(timeout);
        cancellable.cancel();
        if (stream) await new Promise(resolve => stream.close_async(GLib.PRIORITY_DEFAULT, null, (target, result) => {
            try { target.close_finish(result); } catch (_error) { /* already closed */ }
            resolve();
        }));
    }
}

async function readKeyringCredential(serviceName, {cancellable = new Gio.Cancellable()} = {}) {
    let timeout = 0;
    const operation = (async () => {
        const service = await new Promise((resolve, reject) => Secret.Service.get(Secret.ServiceFlags.NONE, cancellable,
            (_source, result) => { try { resolve(Secret.Service.get_finish(result)); } catch (_error) { reject(unavailable('unavailable')); } }));
        // Search metadata only. ALL detects ambiguity without loading every matching token.
        const items = await new Promise((resolve, reject) => service.search(GENERIC_SCHEMA, {service: serviceName},
            Secret.SearchFlags.ALL, cancellable, (_source, result) => {
                try { resolve(service.search_finish(result)); } catch (_error) { reject(unavailable('unavailable')); }
            }));
        if (items.length === 0) return null;
        if (items.length !== 1) throw unavailable('ambiguous');
        const item = items[0];
        if (item.get_locked()) throw unavailable('locked');
        await new Promise((resolve, reject) => item.load_secret(cancellable,
            (_source, result) => { try { resolve(item.load_secret_finish(result)); } catch (_error) { reject(unavailable('unavailable')); } }));
        const secret = item.get_secret();
        if (!secret) throw unavailable('locked');
        try {
            const payload = JSON.parse(secret.get_text());
            return selectPath(payload, ['token', 'access_token']);
        } catch (_error) { throw unavailable('unreadable'); }
    })();
    try {
        const deadline = new Promise((_resolve, reject) => {
            timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, READ_TIMEOUT_MS, () => {
                timeout = 0;
                cancellable.cancel();
                reject(unavailable('unavailable'));
                return GLib.SOURCE_REMOVE;
            });
        });
        return await Promise.race([operation, deadline]);
    } finally {
        if (timeout) GLib.source_remove(timeout);
        cancellable.cancel();
    }
}

/**
 * Return one credential value for immediate use by an allowlisted provider. Callers must not
 * persist or log the returned value. A null result means the expected source has no credential.
 */
export async function lookupHarnessCredential(providerId, {homeDirectory = GLib.get_home_dir(), readFile = readJsonCredential,
    readKeyring = readKeyringCredential, isCancelled = () => false} = {}) {
    const source = harnessCredentialSource(providerId);
    if (!source) throw unavailable('unsupported');
    const cancellable = new Gio.Cancellable();
    let monitor = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        if (!isCancelled()) return GLib.SOURCE_CONTINUE;
        cancellable.cancel();
        monitor = 0;
        return GLib.SOURCE_REMOVE;
    });
    try {
        if (isCancelled()) cancellable.cancel();
        const value = source.path
            ? await readFile(GLib.build_filenamev([homeDirectory, source.path.slice(2)]), source, {cancellable})
            : await readKeyring(source.service, {cancellable});
        if (isCancelled()) throw unavailable('cancelled');
        if (value === null || value === undefined || value === '') return null;
        if (typeof value !== 'string' || value.length > MAX_SECRET_CHARS || /[\u0000-\u001f\u007f]/.test(value))
            throw unavailable('unreadable');
        return value;
    } finally {
        if (monitor) GLib.source_remove(monitor);
        cancellable.cancel();
    }
}

export const HARNESS_CREDENTIAL_MAX_BYTES = MAX_BYTES;
export const HARNESS_CREDENTIAL_READ_TIMEOUT_MS = READ_TIMEOUT_MS;
