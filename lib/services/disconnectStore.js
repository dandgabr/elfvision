// Private asynchronous metadata. A D-Bus name serializes a session; an immutable atomic
// boot-specific session pin rejects a different session bus sharing this directory. No lock
// expires by time or PID, and no compare-then-unlink recovery race is possible.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const decode = bytes => new TextDecoder().decode(bytes);
const io = (file, method, args = []) => new Promise((resolve, reject) => {
    file[`${method}_async`](...args, GLib.PRIORITY_DEFAULT, null, (source, result) => {
        try { resolve(source[`${method}_finish`](result)); } catch (error) { reject(error); }
    });
});
const load = file => new Promise((resolve, reject) => file.load_contents_async(null, (source, result) => {
    try { const [, bytes] = source.load_contents_finish(result); resolve(decode(bytes)); } catch (error) { reject(error); }
}));
const replace = (file, text) => new Promise((resolve, reject) => file.replace_contents_async(new TextEncoder().encode(text), null, false,
    Gio.FileCreateFlags.PRIVATE, null, (source, result) => {
        try { source.replace_contents_finish(result); resolve(); } catch (error) { reject(error); }
    }));
const notFound = error => error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND);
const exists = error => error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS);
export const pause = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
export async function ensurePrivateDirectory(path, {owned = true} = {}) {
    let created = false;
    const file = Gio.File.new_for_path(path);
    try { await io(file, 'make_directory'); created = true; }
    catch (error) {
        if (notFound(error)) {
            await ensurePrivateDirectory(file.get_parent().get_path(), {owned: false});
            try { await io(file, 'make_directory'); created = true; } catch (error) { if (!exists(error)) throw error; }
        }
        else if (!exists(error)) throw error;
    }
    const info = await io(file, 'query_info', ['standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS]);
    if (info.get_file_type() !== Gio.FileType.DIRECTORY) throw new Error('unsafe coordination directory');
    if (owned || created) {
        const attrs = new Gio.FileInfo(); attrs.set_attribute_uint32('unix::mode', 0o700);
        await io(file, 'set_attributes', [attrs, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS]);
    }
}
function startTime(stat) {
    const suffix = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    if (!/^\d+$/.test(suffix[19] ?? '')) throw new Error('invalid process metadata');
    return suffix[19];
}
export async function processIdentity() {
    const boot = (await load(Gio.File.new_for_path('/proc/sys/kernel/random/boot_id'))).trim();
    const stat = await load(Gio.File.new_for_path('/proc/self/stat'));
    const pid = stat.slice(0, stat.indexOf(' '));
    if (!/^[a-f\d-]{36}$/.test(boot) || !/^\d+$/.test(pid)) throw new Error('invalid process identity');
    return {id: `${pid}-${startTime(stat)}`, pid, start: startTime(stat), boot};
}
export async function processAlive(identity, currentBoot) {
    if (identity.boot !== currentBoot) return false;
    if (!/^\d+$/.test(identity.pid ?? '') || !/^\d+$/.test(identity.start ?? '')) throw new Error('invalid lease owner');
    try { return startTime(await load(Gio.File.new_for_path(`/proc/${identity.pid}/stat`))) === identity.start; }
    catch (error) { if (notFound(error)) return false; throw error; }
}

const queues = new Map();
function dbusCall(connection, method, body) {
    return new Promise((resolve, reject) => connection.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
        'org.freedesktop.DBus', method, body, new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, 3000, null,
        (source, result) => { try { resolve(source.call_finish(result).deep_unpack()[0]); } catch (error) { reject(error); } }));
}
export function createDisconnectStore({directory, identity, connection = Gio.DBus.session, lockMs = 10000}) {
    directory = GLib.canonicalize_filename(directory, null);
    const file = Gio.File.new_for_path(GLib.build_filenamev([directory, 'disconnect.json']));
    const guid = connection.get_guid();
    if (!/^[a-f\d]{32}$/i.test(guid) || !/^[a-f\d-]{36}$/i.test(identity.boot)) throw new Error('invalid coordination identity');
    const pin = Gio.File.new_for_path(GLib.build_filenamev([directory, `session-${identity.boot}`]));
    const busName = `org.gnome.Shell.Extensions.GnomeAIQuota.Lock${GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, directory, -1)}`;
    const queueKey = `${guid}:${directory}`;
    let prepared = null;
    const prepare = () => prepared ??= ensurePrivateDirectory(directory);
    async function read() {
        await prepare();
        try {
            const info = await io(file, 'query_info', ['standard::type,standard::size', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS]);
            if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_size() > 65536) throw new Error('unsafe coordination metadata');
            const value = JSON.parse(await load(file));
            if (value?.version !== 1 || typeof value.epoch !== 'string') throw new Error('invalid coordination metadata');
            return value;
        } catch (error) { if (notFound(error)) return null; throw error; }
    }
    async function establishSession() {
        await prepare();
        try { await io(pin, 'make_symbolic_link', [guid]); }
        catch (error) { if (!exists(error)) throw error; }
        const info = await io(pin, 'query_info', ['standard::type,standard::symlink-target', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS]);
        if (info.get_file_type() !== Gio.FileType.SYMBOLIC_LINK || info.get_symlink_target() !== guid)
            throw new Error('another session owns credential coordination; restart the computer to recover');
    }
    async function acquire() {
        await establishSession();
        const deadline = GLib.get_monotonic_time() + lockMs * 1000;
        while (true) {
            const result = await dbusCall(connection, 'RequestName', new GLib.Variant('(su)', [busName, 4]));
            if (result === 1) return;
            if (result === 4) throw new Error('coordination mutex reentrancy');
            if (GLib.get_monotonic_time() >= deadline) throw new Error('coordination mutex unavailable');
            await pause(10);
        }
    }
    function transact(fn) {
        const operation = (queues.get(queueKey) ?? Promise.resolve()).then(async () => {
            await acquire();
            let value, failure = null;
            try {
                const answer = await fn(await read());
                if (answer.state) {
                    const text = JSON.stringify(answer.state);
                    if (new TextEncoder().encode(text).length > 65536) throw new Error('coordination metadata limit');
                    await replace(file, text);
                }
                value = answer.value;
            } catch (error) { failure = error; }
            try {
                const released = await dbusCall(connection, 'ReleaseName', new GLib.Variant('(s)', [busName]));
                if (released !== 1) throw new Error('coordination mutex ownership changed');
            } catch (error) { failure ??= error; }
            if (failure) throw failure;
            return value;
        });
        queues.set(queueKey, operation.catch(() => {})); return operation;
    }
    function watch(fn) {
        const directoryFile = Gio.File.new_for_path(directory);
        const monitor = directoryFile.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        const id = monitor.connect('changed', (_monitor, changed) => { if (changed?.get_basename() === 'disconnect.json') fn(); });
        return () => { monitor.disconnect(id); monitor.cancel(); };
    }
    return {read, transact, watch};
}

export {replace as replaceFile, io as fileAsync};
