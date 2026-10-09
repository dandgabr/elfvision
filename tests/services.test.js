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
import {createCommandCodeProvider} from '../lib/providers/commandCode.js';

Gio._promisify(Gio.SocketClient.prototype, 'connect_async', 'connect_finish');
Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async', 'write_bytes_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');

const MESSAGES = {ok: 'Done.', failed: 'Not done.'};
const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
const portOf = loopback => Number(loopback.redirectUri.split(':')[2].split('/')[0]);

for (const stop of ['cancel', 'dispose']) {
    test(`command code: ${stop} during key lookup prevents credential dispatch`, async () => {
        let releaseKey, cancelled = false, requests = 0, disposals = 0;
        const key = new Promise(resolve => { releaseKey = resolve; });
        // Only the keyring and transport boundary are substituted; provider lifecycle
        // guards must work even when the injected transport has no cancellation logic.
        const provider = createCommandCodeProvider({getKey: () => key, http: {
            get: async () => { requests++; return {status: 200, json: {credits: {monthlyCredits: 7}}}; },
            dispose: () => { disposals++; },
        }});
        const pending = provider.fetch({isCancelled: () => cancelled}).then(() => null, error => error);
        if (stop === 'cancel')
            cancelled = true;
        else
            provider.dispose();
        releaseKey('synthetic-key');
        const error = await pending;
        assertEqual(requests, 0, 'stopped provider must not send the bearer credential');
        assertEqual(error?.code, 'network');
        assertEqual(disposals, stop === 'dispose' ? 1 : 0);
    });
}

test('command code: a current fetch sends its key and parses the credit balance', async () => {
    const sent = [];
    const context = {isCancelled: () => false};
    const provider = createCommandCodeProvider({getKey: async () => 'synthetic-key', http: {
        get: async (url, options) => {
            sent.push({url, headers: options.headers, context: options.context});
            return {status: 200, json: {credits: {monthlyCredits: 7}}};
        },
    }});
    assertEqual(await provider.fetch(context), {metrics: [{id: 'monthly-credits', kind: 'money', balance: 7, currency: 'USD'}]});
    assertEqual(sent, [{url: 'https://api.commandcode.ai/alpha/billing/credits', headers: {Authorization: 'Bearer synthetic-key'}, context}]);
});

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
    const store = new CacheStore(directory, {gate: null});
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
    const store = new CacheStore(directory, {gate: null});
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
    const store = new AlertStore(directory, {gate: null});
    assertEqual(await store.load(), {state: emptyAlertState(), problems: []});
    const state = {...emptyAlertState(), levels: {'claude|five': {fired: true, warningFired: false, rules: '95|false|80', resetsAt: 123, at: 456}}};
    await store.save(state);
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
    const result = await new AlertStore(directory, {gate: null}).load();
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

test('restore defaults: tracking and setup reset while connector data and credentials stay', () => {
    const source = Gio.SettingsSchemaSource.new_from_directory(`${GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')))}/schemas`, null, false);
    const settings = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null);
    // Change one of each kind that is restored, including the enum ones.
    settings.set_string('position', 'left');
    settings.set_string('compact-mode', 'always');
    settings.set_int('bar-count', 5);
    settings.set_string('theme', 'terminal-tui');
    settings.set_boolean('notifications-enabled', false);
    settings.set_int('alert-week-percent', 50);
    settings.set_boolean('alert-session-enabled', false);
    settings.set_string('data-source', 'demo');
    // ... and every one that is kept.
    const kept = {
        'credentials-revision': ['i', 7], 'credentials-touched': ['s', 'codex'], 'command-code-username': ['s', 'someone'],
        'font-refresh-request': ['i', 5], 'font-refresh-ack': ['i', 4], 'font-refresh-status': ['s', 'available'],
        'connectors': ['s', '{"version":1,"connectors":[]}'], 'demo-connectors': ['s', '{"version":1,"connectors":[]}'], 'demo-connected-connectors': ['as', ['codex']], 'terms-acknowledged': ['as', ['claude']], 'prefs-target': ['s', 'claude'],
        'test-notification': ['i', 3], 'demo-scenario': ['s', 'flaky'],
    };
    for (const [key, [type, value]] of Object.entries(kept))
        settings.set_value(key, new GLib.Variant(type, value));
    settings.set_strv('untracked-providers', ['codex']);
    settings.set_boolean('first-use-done', true);
    settings.set_value('account-status', new GLib.Variant('a{ss}', {claude: 'rejected'}));

    restoreDefaults(settings);

    for (const key of RESET_KEYS)
        assertTrue(settings.get_user_value(key) === null, `${key} was reset`);
    assertEqual([settings.get_string('position'), settings.get_string('compact-mode'), settings.get_int('bar-count'), settings.get_string('theme'),
        settings.get_boolean('notifications-enabled'), settings.get_int('alert-week-percent'), settings.get_boolean('alert-session-enabled'), settings.get_string('data-source')],
    ['right', 'auto', 3, 'sistema-gnome', true, 95, true, 'demo']);
    for (const key of KEPT_KEYS)
        assertTrue(settings.get_user_value(key) !== null, `${key} was kept`);
    assertEqual([settings.get_strv('untracked-providers'), settings.get_strv('terms-acknowledged'), settings.get_string('command-code-username'),
        settings.get_int('credentials-revision'), settings.get_value('account-status').deepUnpack()],
    [[], ['claude'], 'someone', 7, {claude: 'rejected'}]);
});

test('restore defaults: the shell is told once, not once for every key', () => {
    const source = Gio.SettingsSchemaSource.new_from_directory(`${GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')))}/schemas`, null, false);
    const settings = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null);
    settings.set_string('position', 'left');
    settings.set_string('theme', 'terminal-tui');
    settings.set_string('color-scheme', 'dark');
    const changes = [];
    settings.connect('changed::position', () => changes.push(`position=${settings.get_string('position')}`));
    settings.connect('changed::theme', () => changes.push(`theme=${settings.get_string('theme')}`));
    restoreDefaults(settings);
    // Each key that changed is announced once, with its final value; no key is announced as changed twice.
    assertEqual(changes, ['position=right', 'theme=sistema-gnome']);
});

test('restore defaults: later edits and setup dismissal reach an independent observer', () => {
    const source = Gio.SettingsSchemaSource.new_from_directory(`${GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')))}/schemas`, null, false);
    const schema = source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false);
    const backend = Gio.memory_settings_backend_new();
    const settings = Gio.Settings.new_full(schema, backend, null);
    const observer = Gio.Settings.new_full(schema, backend, null);
    settings.set_string('position', 'left');
    restoreDefaults(settings);
    assertEqual(observer.get_string('position'), 'right');
    settings.set_string('position', 'center');
    settings.set_boolean('first-use-done', true);
    assertEqual([observer.get_string('position'), observer.get_boolean('first-use-done')], ['center', true]);
    assertEqual(settings.get_has_unapplied(), false);
    restoreDefaults(settings);
    assertEqual([observer.get_string('position'), observer.get_boolean('first-use-done')], ['right', false]);
    settings.set_int('bar-count', 5);
    assertEqual(observer.get_int('bar-count'), 5);
});


test('cache: creating a private owned directory preserves existing ancestor permissions', async () => {
    const parent = `${tmpDir()}/public-parent`;
    GLib.mkdir_with_parents(parent, 0o755); GLib.chmod(parent, 0o755);
    const directory = `${parent}/new-parent/cache`;
    await new CacheStore(directory, {gate: null}).save([]);
    const mode = path => Gio.File.new_for_path(path).query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') & 0o777;
    assertEqual([mode(parent), mode(`${parent}/new-parent`), mode(directory)], [0o755, 0o700, 0o700]);
});

test('cache: a store retains its load ticket and cannot recreate a file after disconnection', async () => {
    const directory = `${tmpDir()}/guarded-cache`; let epoch = 'old', captures = 0;
    const check = ticket => { if (ticket.epoch !== epoch) throw Object.assign(new Error('stale'), {code: 'stale'}); };
    const gate = {capture: async () => { captures++; return {epoch, provider: null}; },
        assertCurrent: async ticket => check(ticket), guardFileWrite: async (ticket, fn) => { check(ticket); return fn(); }};
    const store = new CacheStore(directory, {gate}); await store.load(); await store.save([]);
    const file = Gio.File.new_for_path(`${directory}/snapshots.json`); file.delete(null); epoch = 'new';
    await store.save([]);
    assertEqual([captures, file.query_exists(null)], [1, false]);
});


test('credentials: retired rotation uses its captured gate without creating a replacement participant', async () => {
    const {createCredentialMutator} = await import('../lib/services/secrets.js');
    const {createDisconnectFacade} = await import('../lib/services/disconnectGate.js');
    let singleton = null, created = 0, writes = 0, release;
    const active = new Set(), leases = [];
    const getGate = () => singleton ??= createDisconnectFacade({
        detach: facade => { if (singleton === facade) singleton = null; },
        initialize: async () => {
            const id = ++created; active.add(id);
            return {ready: async () => {}, subscribe: () => {}, registerCanceller: () => {},
                withCredentialWrite: async (provider, ticket, fn) => { leases.push({provider, ticket}); return fn(); },
                close: async () => { active.delete(id); }};
        },
    });
    const captured = getGate(); await captured.ready();
    const pending = new Promise(resolve => { release = resolve; });
    const retirement = captured.retire(pending);
    const ticket = {epoch: 'accepted', provider: 'claude'};
    const service = createCredentialMutator({getGate, lookup: async () => null,
        store: async () => { writes++; }, erase: async () => true});
    try {
        assertEqual(await service.storeSecret('claude', 'oauth-token', 'synthetic', 'test', {gate: captured, ticket}), true);
        assertEqual([created, writes, leases], [1, 1, [{provider: 'claude', ticket}]]);
    } finally { release(); await retirement; await singleton?.close(); }
    assertEqual(active.size, 0);
});

test('credentials: lazy default gate and explicit delete gate retain conditional mutation semantics', async () => {
    const {createCredentialMutator} = await import('../lib/services/secrets.js');
    let defaults = 0, writes = 0; const calls = [];
    const gate = name => ({withCredentialWrite: async (provider, ticket, fn, options) => {
        calls.push({name, provider, ticket, operation: options?.operation ?? 'write'}); return fn();
    }});
    const captured = gate('captured'), fallback = gate('default');
    const service = createCredentialMutator({getGate: () => { defaults++; return fallback; },
        lookup: async () => JSON.stringify({v: 1, gen: 'new', refresh: 'same', access: 'synthetic', expiresAt: 1000}),
        store: async () => { writes++; }, erase: async () => true});
    const ticket = {epoch: 'accepted'};
    assertEqual(await service.storeSecret('claude', 'oauth-token', 'synthetic', 'test',
        {gate: captured, ticket, expected: {gen: 'old', refresh: 'same'}}), false);
    await service.clearSecret('claude', 'oauth-token', {gate: captured, ticket});
    await service.storeSecret('claude', 'api-key', 'synthetic', 'test');
    assertEqual([defaults, writes, calls.map(call => [call.name, call.operation])],
        [1, 1, [['captured', 'write'], ['captured', 'delete'], ['default', 'write']]]);
});
