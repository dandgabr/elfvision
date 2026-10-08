import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {disconnectAll} from '../lib/services/disconnectAll.js';
const call = (name, args, signature) => new Promise((resolve, reject) => Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
    'org.freedesktop.DBus', name, new GLib.Variant(signature, args), new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, 3000, null,
    (source, result) => { try { resolve(source.call_finish(result).deep_unpack()[0]); } catch (error) { reject(error); } }));
await call('RequestName', ['org.gnome.Shell', 4], '(su)');
let invoked = 0, problem = null, fenced = 0;
const gate = {ready: async () => {}, hasParticipant: async () => false, noteLegacyWriter: async () => { fenced++; }, disconnect: async () => { invoked++; return {phase: 'complete'}; }};
try { await disconnectAll({settings: {}, gate}); } catch (error) { problem = error.code; }
if (problem !== 'restart-computer-required' || invoked !== 0 || fenced !== 1) throw new Error('legacy Shell was not fenced before deletion');
await call('ReleaseName', ['org.gnome.Shell'], '(s)');
await disconnectAll({settings: {}, gate});
if (invoked !== 1) throw new Error('absent Shell should permit guarded transaction');
print('PASS legacy nonparticipating Shell rejected before delete; absent-Shell positive control succeeds');
