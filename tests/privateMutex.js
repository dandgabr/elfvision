/* global ARGV */
import Gio from 'gi://Gio';
import {createDisconnectStore, processIdentity, pause} from '../lib/services/disconnectStore.js';

const source = new TextDecoder().decode(Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('lib').get_child('services').get_child('disconnectStore.js').load_contents(null)[1]);
if (source.includes('DBusConnection.new_for_address_sync')) throw new Error('mutex connection must open asynchronously');
const shared = Gio.DBus.session;
const owners = [];
const id = shared.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
    '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE, (_c, _sender, _path, _iface, _signal, params) => {
        const [name, oldOwner, newOwner] = params.deep_unpack();
        if (name.startsWith('org.gnome.Shell.Extensions.GnomeAIQuota.Lock') && oldOwner && !newOwner)
            owners.push(oldOwner);
    });
const store = createDisconnectStore({directory: ARGV[0], identity: await processIdentity()});
await store.transact(() => ({value: true}));
await pause(100);
shared.signal_unsubscribe(id);
if (owners.length !== 1) throw new Error(`expected mutex release signal, got ${owners.length}`);
if (owners[0] === shared.get_unique_name()) throw new Error('mutex release exposed shared client old_owner');
print('PASS mutex release uses private old_owner');
