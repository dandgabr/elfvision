import {test, assertEqual, assertTrue} from './harness.js';
import {providerIdForConnector, validateConnectors, legacyConnectors} from '../lib/core/connectors.js';
import {createConnectorStore} from '../lib/services/connectorStore.js';
import {createProvider} from '../lib/providers/index.js';
import {encodeSecret} from '../lib/oauth/secret.js';

const id = 'codex--12345678-1234-4234-8234-123456789abc';
function settingsFixture() {
    const values = new Map(), listeners = new Map(); let serial = 0;
    return {get_string: key => values.get(key) ?? '', set_string(key, value) { values.set(key, value); for (const entry of listeners.values()) if (entry.key === `changed::${key}`) entry.fn(); return true; },
        connect(key, fn) { listeners.set(++serial, {key, fn}); return serial; }, disconnect: key => listeners.delete(key), listeners};
}
test('connectors: validates exact provider identity and bounded plain labels', () => {
    assertEqual(providerIdForConnector(id), 'codex'); assertEqual(providerIdForConnector('codex--spoof'), null);
    assertEqual(providerIdForConnector('evil--12345678-1234-4234-8234-123456789abc'), null);
    assertEqual(legacyConnectors().map(c => c.id), ['command-code', 'codex', 'claude', 'antigravity']);
    for (const value of [[{id, providerId: 'claude', label: '', username: ''}], [{id, providerId: 'codex', label: 'a\nb', username: ''}], [{id, providerId: 'codex', label: '', username: ''}, {id, providerId: 'codex', label: '', username: ''}]]) {
        let rejected = false; try { validateConnectors(value); } catch (_) { rejected = true; } assertTrue(rejected);
    }
});
test('connectors: legacy defaults remain stable, rename and removal isolate sibling and demo store', () => {
    const settings = settingsFixture(); const store = createConnectorStore(settings, {uuid: () => '12345678-1234-4234-8234-123456789abc'});
    const extra = store.add('codex', 'Work'); assertEqual(extra.id, id); assertEqual(store.list().filter(c => c.providerId === 'codex').length, 2);
    store.update(id, {label: 'Renamed'}); assertEqual(store.get(id).label, 'Renamed'); assertEqual(store.get('codex').id, 'codex');
    const demo = createConnectorStore(settings, {demo: true}); assertEqual(demo.list().length, 4);
    store.remove(id); assertEqual(store.list().length, 4); assertEqual(demo.list().length, 4);
    for (const connector of store.list()) store.remove(connector.id); assertEqual(createConnectorStore(settings).list(), []);
    store.dispose(); demo.dispose();
});
test('connectors: same-provider OAuth runtimes read independent credentials and provider-wide config', async () => {
    const reads = [], configs = [], captures = [];
    const gate = {capture: async provider => { captures.push(provider); return {provider}; }, assertCurrent: async () => {}, registerCanceller: () => () => {}};
    const deps = {configCache: {get: async provider => { configs.push(provider); return {clientId: 'synthetic'}; }},
        lookupSecret: async key => { reads.push(key); return encodeSecret({access: 'synthetic-access', refresh: 'synthetic-refresh', expiresAt: Date.now() + 1000000, gen: key}); },
        createHttp: () => ({request: async () => ({status: 200, json: {plan_type: 'plus', rate_limit: {primary_window: {used_percent: 20, limit_window_seconds: 18000, reset_at: 2000000000}}}}), dispose() {}})};
    const first = createProvider('codex', {gate, deps}); const second = createProvider(id, {gate, providerId: 'codex', deps});
    assertEqual([first.id, second.id], ['codex', id]); await Promise.all([first.fetch(), second.fetch()]);
    assertEqual(reads.sort(), ['codex', id]); assertTrue(configs.every(provider => provider === 'codex')); assertEqual(captures, ['codex', 'codex']);
    await first.dispose(); await second.dispose();
});

test('connectors: corrupt registries recover identities from metadata without copying secrets', async () => {
    const settings = settingsFixture(); settings.set_string('connectors', '{bad'); let calls = 0;
    const store = createConnectorStore(settings, {enumerate: async () => { calls++; return [{id, providerId: 'codex'}, {id: 'invalid', providerId: 'codex'}]; }});
    let rejected = false; try { store.list(); } catch (_) { rejected = true; } assertTrue(rejected);
    const recovered = await store.recover(); assertEqual(calls, 1); assertEqual(recovered.filter(c => c.providerId === 'codex').length, 2);
    assertEqual(store.get(id), {id, providerId: 'codex', label: '', username: ''});
    settings.set_string('demo-connectors', 'broken'); const demo = createConnectorStore(settings, {demo: true, enumerate: async () => { throw new Error('demo must not read keyring'); }});
    assertEqual((await demo.recover()).length, 4); store.dispose(); demo.dispose();
});

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {tmpDir} from './harness.js';
import {pruneConnectorCache} from '../lib/services/connectorCache.js';
import {credentialAddress} from '../lib/services/secrets.js';
test('connectors: exact cache pruning preserves all sibling quota and alert records', async () => {
    const directory = tmpDir();
    const snapshot = {version: 1, savedAt: 123, snapshots: [{id, metrics: [{balance: 4}]}, {id: 'codex', metrics: [{balance: 9}]}]};
    const alerts = {version: 2, levels: {[`${id}|week`]: {fired: true}, 'codex|week': {fired: true}}, connection: {[id]: {cause: 'auth'}, codex: {cause: 'auth'}}, sent: [123]};
    for (const [name, value] of [['snapshots', snapshot], ['alerts', alerts]]) {
        GLib.file_set_contents(`${directory}/${name}.json`, JSON.stringify(value)); GLib.chmod(`${directory}/${name}.json`, 0o600);
        await pruneConnectorCache(id, name, directory);
    }
    const load = name => JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${directory}/${name}.json`)[1]));
    assertEqual(load('snapshots'), {...snapshot, snapshots: [snapshot.snapshots[1]]});
    assertEqual(load('alerts'), {...alerts, levels: {'codex|week': {fired: true}}, connection: {codex: {cause: 'auth'}}});
    Gio.File.new_for_path(`${directory}/snapshots.json`).delete(null);
    assertTrue(await pruneConnectorCache(id, 'snapshots', directory));
    Gio.File.new_for_path(`${directory}/snapshots.json`).make_symbolic_link(`${directory}/alerts.json`, null);
    let refused = false; try { await pruneConnectorCache(id, 'snapshots', directory); } catch (_) { refused = true; } assertTrue(refused);
});
test('connectors: secret addressing refuses unknown provider and credential kinds before keyring access', () => {
    for (const [connector, kind] of [['unknown', 'api-key'], ['codex', 'unknown'], ['codex--spoof', 'oauth-token']]) {
        let rejected = false; try { credentialAddress(connector, kind); } catch (_) { rejected = true; } assertTrue(rejected);
    }
});

for (const source of ['live', 'demo']) {
    test(`connectors: corrupt ${source} registry keeps controller and Preferences access available`, () => {
        const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
        const text = new TextDecoder().decode(GLib.file_get_contents(`${root}/extension.js`)[1]);
        const body = text.match(/ {4}_createController\(\) \{([\s\S]*?)\n {4}\}\n\n {4}\/\*\*/)[1];
        const settings = settingsFixture(); settings.set_string('data-source', source); settings.set_string(source === 'demo' ? 'demo-connectors' : 'connectors', '{bad');
        settings.get_strv = () => [];
        let running;
        const construct = new Function('createConnectorStore', 'createProviders', 'GLib', 'CacheStore', 'QuotaController', 'availableProviders', body);
        class Controller { constructor({providers}) { running = providers; } markSynced() {} subscribe() { return () => {}; } start() { return Promise.resolve(); } }
        const extension = {_settings: settings, _disconnectGate: {}, _syncProviders() {}, _createAlerts() {}};
        construct.call(extension, createConnectorStore, () => [{id: 'example-credits'}], GLib, class {}, Controller, () => []);
        assertTrue(extension._controller !== null); assertEqual(extension._controller.registryProblem, true);
        assertEqual(running.map(provider => provider.id), source === 'demo' ? ['example-credits'] : []);
    });
}

test('connectors: multibyte metadata round trips within the byte bound and failed writes are atomic', () => {
    const settings = settingsFixture(); settings.set_string('connectors', '{"version":1,"connectors":[]}'); let serial = 0;
    const store = createConnectorStore(settings, {uuid: () => `12345678-1234-4234-8234-${(++serial).toString(16).padStart(12, '0')}`});
    for (let index = 0; index < 32; index++) store.add('command-code', '字'.repeat(64), '字'.repeat(64));
    const before = settings.get_string('connectors'); assertEqual(store.list().length, 32); assertTrue(new TextEncoder().encode(before).length <= 16384);
    let rejected = false; try { store.add('codex', 'overflow'); } catch (_) { rejected = true; }
    assertTrue(rejected); assertEqual(settings.get_string('connectors'), before); store.dispose();
});

for (const count of [29, 32]) {
    test(`connectors: recovery preserves all ${count} saved added identities before optional legacy rows`, async () => {
        const settings = settingsFixture(); settings.set_string('connectors', '{corrupt');
        const metadata = Array.from({length: count}, (_entry, index) => ({id: `codex--12345678-1234-4234-8234-${(index + 1).toString(16).padStart(12, '0')}`, providerId: 'codex'}));
        const store = createConnectorStore(settings, {enumerate: async () => metadata});
        const recovered = await store.recover();
        assertEqual(recovered.length, 32); assertTrue(metadata.every(entry => recovered.some(connector => connector.id === entry.id)));
        assertEqual(recovered.filter(entry => entry.id === entry.providerId).length, 32 - count); store.dispose();
    });
}
test('connectors: recovery exceeding the identity bound fails explicitly without modifying registry', async () => {
    const settings = settingsFixture(); settings.set_string('connectors', '{corrupt');
    const metadata = Array.from({length: 33}, (_entry, index) => ({id: `codex--12345678-1234-4234-8234-${(index + 1).toString(16).padStart(12, '0')}`, providerId: 'codex'}));
    const store = createConnectorStore(settings, {enumerate: async () => metadata});
    let rejected = false; try { await store.recover(); } catch (_) { rejected = true; }
    assertTrue(rejected); assertEqual(settings.get_string('connectors'), '{corrupt'); store.dispose();
});
