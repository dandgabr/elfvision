// Run inside the isolated bus and XDG roots created by secretSessionRestart.sh.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Secret from 'gi://Secret';
import {lookupSecret, storeSecret, API_KEY} from '../lib/services/secrets.js';
import {getDisconnectGate} from '../lib/services/disconnectGate.js';

const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
function owner() {
    return bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'NameHasOwner',
        new GLib.Variant('(s)', ['org.freedesktop.secrets']), new GLib.VariantType('(b)'), Gio.DBusCallFlags.NONE, 1000, null).deep_unpack()[0];
}
function waitOwner(expected) {
    for (let i = 0; i < 200; i++) {
        if (owner() === expected) return;
        GLib.usleep(20000);
    }
    throw new Error('secret service ownership timeout');
}
function start() {
    const process = Gio.Subprocess.new(['/usr/libexec/oo7-daemon', '--login'], Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
    process.get_stdin_pipe().write_all(new TextEncoder().encode('synthetic-password\n'), null);
    process.get_stdin_pipe().close(null);
    waitOwner(true);
    return process;
}
function stop(process) { process.force_exit(); process.wait(null); waitOwner(false); }
const loop = new GLib.MainLoop(null, false);
let failure = null;
async function run() {
let daemon = start();
try {
    const gate = getDisconnectGate();
    await gate.ready();
    await storeSecret('codex', API_KEY, 'synthetic-value', 'Synthetic', {ticket: await gate.capture('codex')});
    if (await lookupSecret('codex', API_KEY, {interactive: false}) !== 'synthetic-value') throw new Error('initial lookup failed');
    print('PASS initial lookup');
    const service = await new Promise((resolve, reject) => Secret.Service.get(Secret.ServiceFlags.NONE, null, (_s, result) => {
        try { resolve(Secret.Service.get_finish(result)); } catch (error) { reject(error); }
    }));
    const path = service.get_session_dbus_path();
    if (!path) throw new Error('session path missing');
    await new Promise((resolve, reject) => bus.call('org.freedesktop.secrets', path, 'org.freedesktop.Secret.Session', 'Close', null, null, Gio.DBusCallFlags.NONE, 1000, null, (_s, result) => {
        try { bus.call_finish(result); resolve(); } catch (error) { reject(error); }
    }));
    const search = Secret.Service.prototype.search;
    const callbacks = [];
    let searchesReady;
    const allSearchesReady = new Promise(resolve => { searchesReady = resolve; });
    Secret.Service.prototype.search = function (schema, attrs, flags, cancellable, callback) {
        return search.call(this, schema, attrs, flags, cancellable, (source, result) => {
            callbacks.push(() => callback(source, result));
            if (callbacks.length === 5) searchesReady();
        });
    };
    const lookups = Array.from({length: 5}, () => lookupSecret('codex', API_KEY, {interactive: false}));
    await allSearchesReady;
    Secret.Service.prototype.search = search;
    callbacks.forEach(callback => callback());
    const results = await Promise.all(lookups);
    if (results.some(value => value !== 'synthetic-value')) throw new Error('concurrent lookup after session close failed');
    if (await lookupSecret('claude', API_KEY, {interactive: false}) !== null) throw new Error('missing credential should remain absent');
    print('PASS concurrent recovery and absent credential');
    const active = await new Promise((resolve, reject) => Secret.Service.get(Secret.ServiceFlags.NONE, null, (_s, result) => {
        try { resolve(Secret.Service.get_finish(result)); } catch (error) { reject(error); }
    }));
    await new Promise((resolve, reject) => bus.call('org.freedesktop.secrets', active.get_session_dbus_path(), 'org.freedesktop.Secret.Session', 'Close', null, null, Gio.DBusCallFlags.NONE, 1000, null, (_s, result) => {
        try { bus.call_finish(result); resolve(); } catch (error) { reject(error); }
    }));
    const originalSearch = Secret.Service.prototype.search;
    let release;
    let pending;
    const delayed = new Promise(resolve => { pending = resolve; });
    Secret.Service.prototype.search = function (schema, attrs, flags, cancellable, callback) {
        return originalSearch.call(this, schema, attrs, flags, cancellable, (source, result) => {
            Secret.Service.prototype.search = originalSearch;
            release = () => callback(source, result);
            pending();
        });
    };
    const delayedLookup = lookupSecret('codex', API_KEY, {interactive: false});
    await delayed;
    Secret.Service.disconnect();
    const replacement = await new Promise((resolve, reject) => Secret.Service.get(Secret.ServiceFlags.NONE, null, (_s, result) => {
        try { resolve(Secret.Service.get_finish(result)); } catch (error) { reject(error); }
    }));
    release();
    if (await delayedLookup !== 'synthetic-value') throw new Error('delayed lookup failed');
    const current = await new Promise((resolve, reject) => Secret.Service.get(Secret.ServiceFlags.NONE, null, (_s, result) => {
        try { resolve(Secret.Service.get_finish(result)); } catch (error) { reject(error); }
    }));
    if (current !== replacement) throw new Error('delayed callback disconnected replacement service');
    print('PASS delayed callback preserves replacement service');
    stop(daemon);
    daemon = start();
    if (await lookupSecret('codex', API_KEY, {interactive: false}) !== 'synthetic-value') throw new Error('lookup after daemon restart failed');
    print('PASS lookup after daemon restart');
} finally { stop(daemon); }
}
run().catch(error => { failure = error; }).finally(() => loop.quit());
loop.run();
if (failure) throw failure;
