// Only exact extension-owned live cache paths and schema attributes are removed. No network
// requests, secret reads or appearance resets. Demo deletion touches only synthetic metadata.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {getDisconnectGate} from './disconnectGate.js';
import {eraseProviderCredentials} from './secrets.js';
import {fileAsync} from './disconnectStore.js';
import {decodeConnectors} from '../core/connectors.js';

function requireWrite(result) { if (result !== true) throw new Error('local connector data unavailable'); }

export function deleteDemoConnectors(settings) {
    const ids = new Set(decodeConnectors(settings.get_string('demo-connectors'), {demo: true}).map(entry => entry.id));
    requireWrite(settings.set_strv('demo-connected-connectors', []));
    requireWrite(settings.set_strv('untracked-providers', settings.get_strv('untracked-providers').filter(id => !ids.has(id))));
    requireWrite(settings.set_string('demo-connectors', JSON.stringify({version: 1, connectors: []})));
    Gio.Settings.sync();
    return {phase: 'complete'};
}

export async function disconnectAll({settings, demo = settings.get_string?.('data-source') === 'demo', gate = null, requireShell = requireParticipatingShell, removeCredential = eraseProviderCredentials,
    directory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota'])}) {
    if (demo) return deleteDemoConnectors(settings);
    gate ??= getDisconnectGate();
    await requireShell(gate);
    return gate.disconnect({removeCredential,
        removeFile: async name => {
            if (!['snapshots', 'alerts'].includes(name)) throw new Error('invalid owned cache name');
            const file = Gio.File.new_for_path(GLib.build_filenamev([directory, `${name}.json`]));
            try {
                const info = await fileAsync(file, 'query_info', ['standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS]);
                if (info.get_file_type() !== Gio.FileType.REGULAR) return false;
                await fileAsync(file, 'delete'); return true;
            } catch (error) { if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return true; throw error; }
        },
        clearStatus: async transaction => {
            if (Object.values(transaction.credentials).some(kinds => Object.values(kinds).some(value => value !== 'absent')) ||
                Object.values(transaction.files).some(value => value !== 'absent')) throw new Error('local deletion incomplete');
            requireWrite(settings.set_value('account-status', new GLib.Variant('a{ss}', {})));
            requireWrite(settings.set_string('credentials-touched', ''));
            requireWrite(settings.set_int('credentials-revision', (settings.get_int('credentials-revision') + 1) % 2147483647));
            const ids = new Set(decodeConnectors(settings.get_string('connectors')).map(entry => entry.id));
            requireWrite(settings.set_strv('untracked-providers', settings.get_strv('untracked-providers').filter(id => !ids.has(id))));
            requireWrite(settings.set_string('connectors', JSON.stringify({version: 1, connectors: []})));
            Gio.Settings.sync();
        }});
}

export async function requireParticipatingShell(gate) {
    await gate.ready();
    const pid = await new Promise((resolve, reject) => Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
        'org.freedesktop.DBus', 'GetConnectionUnixProcessID', new GLib.Variant('(s)', ['org.gnome.Shell']),
        new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, 3000, null, (source, result) => {
            try { resolve(source.call_finish(result).deep_unpack()[0]); }
            catch (error) {
                if (Gio.DBusError.is_remote_error(error) && Gio.DBusError.get_remote_error(error) === 'org.freedesktop.DBus.Error.NameHasNoOwner') resolve(null);
                else reject(Object.assign(new Error('credential coordination unavailable'), {code: 'coordination-unavailable'}));
            }
        }));
    if (pid !== null && !await gate.hasParticipant(pid)) {
        await gate.noteLegacyWriter();
        throw Object.assign(new Error('restart the computer before disconnecting accounts'), {code: 'restart-computer-required'});
    }
}
