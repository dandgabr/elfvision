// The services that touch the file system and the network, tested against real ones in
// temporary places: the sign-in's local server, the cache on disk and the GLib timers.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {assertEqual, assertTrue, test, tmpDir} from './harness.js';
import {MAX_CACHE_BYTES} from '../lib/core/cache.js';
import {normalizeSnapshot} from '../lib/core/contract.js';
import {startLoopback} from '../lib/oauth/loopback.js';
import {MAX_ALERT_STATE_BYTES, emptyAlertState} from '../lib/core/alerts.js';
import {AlertStore} from '../lib/services/alertStore.js';
import {CacheStore} from '../lib/services/cacheStore.js';
import {glibTimers} from '../lib/services/timers.js';

Gio._promisify(Gio.SocketClient.prototype, 'connect_async', 'connect_finish');
Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async', 'write_bytes_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');

const MESSAGES = {ok: 'Done.', failed: 'Not done.'};
const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
const portOf = loopback => Number(loopback.redirectUri.split(':')[2].split('/')[0]);

/** A hand-written HTTP request, to say what a browser would never say (a foreign Host, a POST). */
async function raw(port, text) {
    const connection = await new Gio.SocketClient().connect_async(Gio.InetSocketAddress.new_from_string('127.0.0.1', port), null);
    await connection.get_output_stream().write_bytes_async(new GLib.Bytes(new TextEncoder().encode(text)), GLib.PRIORITY_DEFAULT, null);
    const reply = new TextDecoder().decode((await connection.get_input_stream().read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null)).toArray());
    connection.close(null);
    return {status: Number(reply.split(' ')[1]), text: reply};
}

const request = (method, path, host) => `${method} ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`;

test('loopback: it listens on the loopback addresses only, never on the network', () => {
    const loopback = startLoopback({port: 0, path: '/cb', state: 's', messages: MESSAGES});
    assertTrue(loopback.addresses.length > 0);
    assertTrue(loopback.addresses.every(host => host === '127.0.0.1' || host === '::1'), JSON.stringify(loopback.addresses));
    loopback.cancel();
    loopback.result.catch(() => {});
});

test('loopback: a foreign Host, another method and another path are turned away, and the sign-in goes on', async () => {
    const loopback = startLoopback({port: 0, path: '/cb', state: 'S', messages: MESSAGES, redirectHost: '127.0.0.1'});
    const port = portOf(loopback);
    const good = `127.0.0.1:${port}`;
    assertEqual((await raw(port, request('GET', '/cb?code=CODE12345&state=S', 'evil.example.org'))).status, 400);
    assertEqual((await raw(port, request('GET', '/cb?code=CODE12345&state=S', `evil.example.org:${port}`))).status, 400);
    assertEqual((await raw(port, request('POST', '/cb?code=CODE12345&state=S', good))).status, 405);
    assertEqual((await raw(port, request('GET', '/other?code=CODE12345&state=S', good))).status, 404);
    const valid = await raw(port, request('GET', '/cb?code=CODE12345&state=S', `localhost:${port}`));
    assertEqual(valid.status, 200);
    assertEqual((await loopback.result).code, 'CODE12345');
});

test('cache: what is saved comes back, privately, and a missing file is not a problem', async () => {
    const directory = `${tmpDir()}/cache`;
    const store = new CacheStore(directory);
    assertEqual(await store.load(), {snapshots: [], problems: []});
    const snapshot = normalizeSnapshot({id: 'a', name: 'A', plan: 'Pro', metrics: [{id: 'm', kind: 'percent', percentUsed: 42}],
        source: {kind: 'fresh', fetchedAt: Date.now()}}).snapshot;
    await store.save([snapshot], true);
    const loaded = await store.load();
    assertEqual(loaded.snapshots.map(s => [s.id, s.metrics[0].percentUsed]), [['a', 42]]);
    const mode = path => Gio.File.new_for_path(path).query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') & 0o777;
    assertEqual([mode(directory), mode(`${directory}/snapshots.json`)], [0o700, 0o600]);
});

test('cache: a huge file and a corrupt one are ignored, and the last write is the one that stays', async () => {
    const directory = tmpDir();
    const store = new CacheStore(directory);
    GLib.file_set_contents(`${directory}/snapshots.json`, 'x'.repeat(MAX_CACHE_BYTES + 10));
    const huge = await store.load();
    assertEqual([huge.snapshots.length, huge.problems.length], [0, 1]);
    GLib.file_set_contents(`${directory}/snapshots.json`, '{not json');
    assertEqual((await store.load()).snapshots.length, 0);

    // two writes one right after the other (a debounced save, then the final one on shutdown)
    const older = normalizeSnapshot({id: 'old', name: 'Old', metrics: [{id: 'm', kind: 'percent', percentUsed: 1}], source: {kind: 'fresh', fetchedAt: Date.now()}}).snapshot;
    const newer = normalizeSnapshot({id: 'new', name: 'New', metrics: [{id: 'm', kind: 'percent', percentUsed: 2}], source: {kind: 'fresh', fetchedAt: Date.now()}}).snapshot;
    const slow = store.save([older]);
    await store.save([newer]);
    await slow;
    await wait(100);
    assertEqual((await store.load()).snapshots.map(s => s.id), ['new']);
});

test('alert store: the state comes back, privately; a missing, huge or corrupt file is an empty state', async () => {
    const directory = `${tmpDir()}/state`;
    const store = new AlertStore(directory);
    assertEqual(await store.load(), {state: emptyAlertState(), problems: []});
    const state = {...emptyAlertState(), levels: {'claude|five': {fired: true, resetsAt: 123, at: 456}}};
    store.save(state);
    assertEqual((await store.load()).state, state);
    const mode = path => Gio.File.new_for_path(path).query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') & 0o777;
    assertEqual([mode(directory), mode(`${directory}/alerts.json`)], [0o700, 0o600]);

    GLib.file_set_contents(`${directory}/alerts.json`, 'x'.repeat(MAX_ALERT_STATE_BYTES + 10));
    const huge = await store.load();
    assertEqual([huge.state, huge.problems.length], [emptyAlertState(), 1]);
    GLib.file_set_contents(`${directory}/alerts.json`, '{not json');
    assertEqual((await store.load()).state, emptyAlertState());
});

test('alert store: a symbolic link in place of the file is not followed', async () => {
    const directory = tmpDir();
    GLib.file_set_contents(`${directory}/elsewhere.json`, serializeText());
    Gio.File.new_for_path(`${directory}/alerts.json`).make_symbolic_link(`${directory}/elsewhere.json`, null);
    const result = await new AlertStore(directory).load();
    assertEqual([result.state, result.problems.length], [emptyAlertState(), 1]);
});

function serializeText() {
    return JSON.stringify({version: 1, levels: {'claude|five': {fired: true, resetsAt: null, at: 1}}});
}

test('timers: a bad delay never fires at once or overflows, and a timer can be cleared', async () => {
    let fired = 0;
    const ids = [];
    for (const ms of [NaN, Infinity, 1e12, undefined])
        ids.push(glibTimers.setTimeout(() => { fired++; }, ms));
    assertTrue(ids.every(id => id > 0));
    await wait(80);
    assertEqual(fired, 0);                           // not at once: they fall back to a minute, or the cap
    ids.forEach(id => glibTimers.clearTimeout(id));
    let soon = 0;
    glibTimers.setTimeout(() => { soon++; }, -5);    // a negative delay is the shortest one
    await wait(80);
    assertEqual(soon, 1);
});

import {restoreDefaults} from '../lib/prefs/about.js';
import {KEPT_KEYS, RESET_KEYS} from '../lib/core/defaults.js';

test('restore defaults: looks and notifications go back, accounts and tracking stay', () => {
    const source = Gio.SettingsSchemaSource.new_from_directory(`${GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')))}/schemas`, null, false);
    const settings = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null);
    // Change one of each kind.
    settings.set_string('position', 'left');
    settings.set_int('bar-count', 5);
    settings.set_string('theme', 'terminal-tui');
    settings.set_boolean('notifications-enabled', false);
    settings.set_int('alert-week-percent', 50);
    settings.set_boolean('alert-session-enabled', false);
    settings.set_strv('untracked-providers', ['codex']);
    settings.set_strv('terms-acknowledged', ['claude']);
    settings.set_string('command-code-username', 'someone');
    settings.set_int('credentials-revision', 7);
    settings.set_string('data-source', 'demo');

    restoreDefaults(settings);

    for (const key of RESET_KEYS)
        assertTrue(settings.get_user_value(key) === null, `${key} was reset`);
    assertEqual([settings.get_string('position'), settings.get_int('bar-count'), settings.get_string('theme'),
        settings.get_boolean('notifications-enabled'), settings.get_int('alert-week-percent'), settings.get_boolean('alert-session-enabled')],
    ['right', 3, 'sistema-gnome', true, 95, true]);
    // What belongs to the accounts is untouched.
    assertEqual([settings.get_strv('untracked-providers'), settings.get_strv('terms-acknowledged'),
        settings.get_string('command-code-username'), settings.get_int('credentials-revision'), settings.get_string('data-source')],
    [['codex'], ['claude'], 'someone', 7, 'demo']);
    for (const key of KEPT_KEYS.filter(k => ['untracked-providers', 'terms-acknowledged', 'command-code-username', 'credentials-revision', 'data-source'].includes(k)))
        assertTrue(settings.get_user_value(key) !== null, `${key} was kept`);
});
