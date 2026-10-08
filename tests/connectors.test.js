import {test, assertEqual, assertTrue} from './harness.js';
import {providerIdForConnector, validateConnectors, decodeConnectors} from '../lib/core/connectors.js';
import {createConnectorStore} from '../lib/services/connectorStore.js';
import {createProvider} from '../lib/providers/index.js';
import {encodeSecret} from '../lib/oauth/secret.js';

const id = 'codex--12345678-1234-4234-8234-123456789abc';
test('connectors: fresh and legacy unset registries start empty in both modes', () => {
    for (const demo of [false, true]) {
        assertEqual(decodeConnectors('', {demo}), []);
        const store = createConnectorStore(settingsFixture(false), {demo});
        assertEqual(store.list(), []);
        store.dispose();
    }
});
test('connectors: recovery with no saved identities creates no phantom accounts', async () => {
    for (const demo of [false, true]) {
        const store = createConnectorStore(settingsFixture(false), {demo, enumerate: async () => []});
        assertEqual(await store.recover(), []);
        store.dispose();
    }
});
function legacyFixture(demo = false) {
    return ['command-code', 'codex', 'claude', 'antigravity', ...(demo ? ['example-credits'] : [])]
        .map(providerId => ({id: providerId, providerId, label: '', username: ''}));
}
function settingsFixture(seed = true) {
    const values = new Map(), listeners = new Map(); let serial = 0;
    if (seed) {
        values.set('connectors', JSON.stringify({version: 1, connectors: legacyFixture()}));
        values.set('demo-connectors', JSON.stringify({version: 1, connectors: legacyFixture(true)}));
    }
    return {get_string: key => values.get(key) ?? '', set_string(key, value) { values.set(key, value); for (const entry of listeners.values()) if (entry.key === `changed::${key}`) entry.fn(); return true; },
        connect(key, fn) { listeners.set(++serial, {key, fn}); return serial; }, disconnect: key => listeners.delete(key), listeners};
}
test('connectors: validates exact provider identity and bounded plain labels', () => {
    assertEqual(providerIdForConnector(id), 'codex'); assertEqual(providerIdForConnector('codex--spoof'), null);
    assertEqual(providerIdForConnector('evil--12345678-1234-4234-8234-123456789abc'), null);
    for (const value of [[{id, providerId: 'claude', label: '', username: ''}], [{id, providerId: 'codex', label: 'a\nb', username: ''}], [{id, providerId: 'codex', label: '', username: ''}, {id, providerId: 'codex', label: '', username: ''}]]) {
        let rejected = false; try { validateConnectors(value); } catch (_) { rejected = true; } assertTrue(rejected);
    }
});
test('connectors: explicitly saved legacy identities remain stable, rename and removal isolate sibling and demo store', () => {
    const settings = settingsFixture(); const store = createConnectorStore(settings, {uuid: () => '12345678-1234-4234-8234-123456789abc'});
    const extra = store.add('codex', 'Work'); assertEqual(extra.id, id); assertEqual(store.list().filter(c => c.providerId === 'codex').length, 2);
    store.update(id, {label: 'Renamed'}); assertEqual(store.get(id).label, 'Renamed'); assertEqual(store.get('codex').id, 'codex');
    const demo = createConnectorStore(settings, {demo: true}); assertEqual(demo.list().length, 5);
    store.remove(id); assertEqual(store.list().length, 4); assertEqual(demo.list().length, 5);
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
    const recovered = await store.recover(); assertEqual(calls, 1); assertEqual(recovered.filter(c => c.providerId === 'codex').length, 1);
    assertEqual(store.get(id), {id, providerId: 'codex', label: '', username: ''});
    settings.set_string('demo-connectors', 'broken'); const demo = createConnectorStore(settings, {demo: true, enumerate: async () => { throw new Error('demo must not read keyring'); }});
    assertEqual((await demo.recover()).length, 0); store.dispose(); demo.dispose();
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
        const construct = new Function('createConnectorStore', 'createProviders', 'GLib', 'CacheStore', 'QuotaController', 'availableProviders', 'availableDemoProviders', body);
        class Controller { constructor({providers}) { running = providers; } markSynced() {} subscribe() { return () => {}; } start() { return Promise.resolve(); } }
        const extension = {_settings: settings, _disconnectGate: {}, _syncProviders() {}, _createAlerts() {}};
        construct.call(extension, createConnectorStore, () => [{id: 'example-credits'}], GLib, class {}, Controller, () => [], () => []);
        assertTrue(extension._controller !== null); assertEqual(extension._controller.registryProblem, true);
        assertEqual(running.map(provider => provider.id), []);
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
    test(`connectors: recovery preserves exactly ${count} saved identities without phantom rows`, async () => {
        const settings = settingsFixture(); settings.set_string('connectors', '{corrupt');
        const metadata = Array.from({length: count}, (_entry, index) => ({id: `codex--12345678-1234-4234-8234-${(index + 1).toString(16).padStart(12, '0')}`, providerId: 'codex'}));
        const store = createConnectorStore(settings, {enumerate: async () => metadata});
        const recovered = await store.recover();
        assertEqual(recovered.length, count); assertTrue(metadata.every(entry => recovered.some(connector => connector.id === entry.id)));
        assertEqual(recovered.filter(entry => entry.id === entry.providerId).length, 0); store.dispose();
    });
}
test('connectors: recovery exceeding the identity bound fails explicitly without modifying registry', async () => {
    const settings = settingsFixture(); settings.set_string('connectors', '{corrupt');
    const metadata = Array.from({length: 33}, (_entry, index) => ({id: `codex--12345678-1234-4234-8234-${(index + 1).toString(16).padStart(12, '0')}`, providerId: 'codex'}));
    const store = createConnectorStore(settings, {enumerate: async () => metadata});
    let rejected = false; try { await store.recover(); } catch (_) { rejected = true; }
    assertTrue(rejected); assertEqual(settings.get_string('connectors'), '{corrupt'); store.dispose();
});

test('connectors: demo credit identities persist only in the demo registry', () => {
    const settings = settingsFixture();
    const demo = createConnectorStore(settings, {demo: true, uuid: () => '12345678-1234-4234-8234-123456789abc'});
    assertEqual(demo.list().map(entry => entry.id), ['command-code', 'codex', 'claude', 'antigravity', 'example-credits']);
    const credit = demo.add('example-credits', 'Preview credits');
    assertEqual(demo.get(credit.id).providerId, 'example-credits');
    assertEqual(providerIdForConnector(credit.id), null);
    assertEqual(providerIdForConnector(credit.id, {demo: true}), 'example-credits');
    const live = createConnectorStore(settings);
    let rejected = false; try { live.add('example-credits'); } catch (_) { rejected = true; }
    assertTrue(rejected); assertEqual(live.list().length, 4);
    demo.clear(); assertEqual(createConnectorStore(settings, {demo: true}).list(), []);
    assertEqual(live.list().length, 4); live.dispose(); demo.dispose();
});

import {disconnectAll} from '../lib/services/disconnectAll.js';
test('connectors: delete all demo isolates live data and keeps an empty registry after restart', async () => {
    const settings = settingsFixture(); const arrays = new Map([
        ['demo-connected-connectors', ['codex', 'example-credits']], ['untracked-providers', ['example-credits', 'openai-api']]]);
    settings.get_strv = key => arrays.get(key) ?? [];
    settings.set_strv = (key, value) => { arrays.set(key, value); return true; };
    const live = createConnectorStore(settings); live.add('codex', 'Real'); const before = settings.get_string('connectors');
    const result = await disconnectAll({settings, demo: true, gate: {ready() { throw new Error('demo touched gate'); }},
        removeCredential() { throw new Error('demo touched credentials'); }, requireShell() { throw new Error('demo touched session'); }});
    assertEqual(result.phase, 'complete'); assertEqual(settings.get_string('connectors'), before);
    assertEqual(createConnectorStore(settings, {demo: true}).list(), []);
    assertEqual(settings.get_strv('demo-connected-connectors'), []);
    assertEqual(settings.get_strv('untracked-providers'), ['openai-api']); live.dispose();
});
test('connectors: live whole deletion retains metadata on failed credentials and failed settings writes', async () => {
    const settings = settingsFixture(); settings.get_strv = () => []; settings.set_strv = () => true;
    settings.get_int = () => 1; settings.set_int = () => true; settings.set_value = () => true;
    const live = createConnectorStore(settings); live.add('codex', 'Real'); const before = settings.get_string('connectors');
    let credential = 'failed', file = 'absent';
    const gate = {snapshot: () => ({transaction: {credentials: {codex: {'oauth-token': credential}}, files: {snapshots: file, alerts: 'absent'}}}),
        disconnect: async deps => { try { await deps.clearStatus(gate.snapshot().transaction); return {phase: 'complete'}; } catch (_) { return {phase: 'failed'}; } }};
    assertEqual((await disconnectAll({settings, demo: false, gate, requireShell: async () => {}})).phase, 'failed');
    assertEqual(settings.get_string('connectors'), before);
    credential = 'absent'; file = 'failed';
    assertEqual((await disconnectAll({settings, demo: false, gate, requireShell: async () => {}})).phase, 'failed');
    assertEqual(settings.get_string('connectors'), before); file = 'absent';
    const original = settings.set_string;
    settings.set_string = (key, value) => key === 'credentials-touched' ? false : original(key, value);
    assertEqual((await disconnectAll({settings, demo: false, gate, requireShell: async () => {}})).phase, 'failed');
    assertEqual(settings.get_string('connectors'), before);
    settings.set_string = original;
    assertEqual((await disconnectAll({settings, demo: false, gate, requireShell: async () => {}})).phase, 'complete');
    assertEqual(live.list(), []); live.dispose();
});

import * as AccountViews from '../lib/prefs/accounts.js';
import * as DemoControllers from '../lib/prefs/demoAccountController.js';
test('connectors: auth labels distinguish API keys and OAuth from fictional mode', () => {
    assertEqual(AccountViews.connectorAuth({auth: 'api-key'}, text => text), {icon: 'dialog-password-symbolic', label: 'API key'});
    assertEqual(AccountViews.connectorAuth({auth: 'api-key', quotaSupport: 'unavailable'}, text => text), {icon: 'web-browser-symbolic', label: 'Dashboard only'});
    assertEqual(AccountViews.connectorAuth({auth: 'oauth2'}, text => text), {icon: 'web-browser-symbolic', label: 'OAuth 2'});
});
test('connectors: unavailable quota controller never reads or stores a credential', async () => {
    const controller = DemoControllers.createUnavailableAccountController();
    await controller.refresh(); assertEqual(controller.snapshot().connected, true);
    assertEqual(controller.snapshot().result, 'unavailable'); assertEqual(await controller.remove(), true);
    controller.dispose();
});

test('connectors: failed demo registry write cannot report completed deletion', async () => {
    const settings = settingsFixture(); const arrays = new Map([['demo-connected-connectors', ['example-credits']], ['untracked-providers', ['example-credits']]]);
    settings.get_strv = key => arrays.get(key) ?? [];
    settings.set_strv = (key, value) => { arrays.set(key, value); return true; };
    const demo = createConnectorStore(settings, {demo: true}); demo.update('example-credits', {label: 'Kept after failure'});
    const before = settings.get_string('demo-connectors'); const original = settings.set_string;
    settings.set_string = (key, value) => key === 'demo-connectors' ? false : original(key, value);
    let failure = false; try { await disconnectAll({settings, demo: true}); } catch (_) { failure = true; }
    assertTrue(failure); assertEqual(settings.get_string('demo-connectors'), before);
    settings.set_string = original;
    assertEqual((await disconnectAll({settings, demo: true})).phase, 'complete'); assertEqual(demo.list(), []); demo.dispose();
});


import {QuotaController} from '../lib/services/controller.js';
import {createDemoProviders} from '../lib/providers/demo.js';
import {availableDemoProviders} from '../lib/providers/registry.js';
import {demoSnapshots} from '../lib/core/fixtures.js';

test('connectors: deleting Example and every demo connector prevents cache ghosts across restart and scenario changes', async () => {
    const settings = settingsFixture(); settings.set_string('data-source', 'demo');
    settings.get_strv = key => key === 'demo-connected-connectors' ? ['command-code', 'codex', 'claude', 'antigravity', 'example-credits'] : [];
    const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
    const text = new TextDecoder().decode(GLib.file_get_contents(`${root}/extension.js`)[1]);
    const body = text.match(/ {4}_createController\(\) \{([\s\S]*?)\n {4}\}\n\n {4}\/\*\*/)[1];
    const construct = new Function('createConnectorStore', 'createProviders', 'GLib', 'CacheStore', 'QuotaController', 'availableProviders', 'availableDemoProviders', body);
    const saved = [];
    class Cached {
        async load() { return {snapshots: demoSnapshots(), problems: []}; }
        save(snapshots) { saved.push(snapshots.map(snapshot => snapshot.id)); }
    }
    const store = createConnectorStore(settings, {demo: true});
    store.remove('example-credits');
    for (const clearAll of [false, true]) {
        if (clearAll) store.clear();
        for (const scenario of ['steady', 'flaky', 'drift']) {
            settings.set_string('demo-scenario', scenario);
            const extension = {_settings: settings, _createAlerts() {}};
            construct.call(extension, createConnectorStore, ({scenario: selected}) => createDemoProviders(selected), GLib, Cached, QuotaController, () => [], availableDemoProviders);
            await extension._controller.start();
            assertEqual(extension._controller.providerIds(), clearAll ? [] : ['command-code', 'codex', 'claude', 'antigravity']);
            assertTrue(!extension._controller.snapshots().some(snapshot => snapshot.id === 'example-credits'));
            if (clearAll) assertEqual(extension._controller.snapshots(), []);
            await extension._controller.stop();
            assertTrue(!saved.at(-1).includes('example-credits'));
        }
    }
    store.dispose();
});

test('connectors: new API runtimes isolate sibling keys and fence a delayed lookup before HTTP', async () => {
    for (const providerId of ['openai-api', 'anthropic-api', 'cursor', 'openrouter']) {
        const reads = [], captures = [], hosts = [], requests = [];
        let current = true;
        const gate = {capture: async provider => { captures.push(provider); return {provider}; },
            assertCurrent: async () => { if (!current) throw new Error('synthetic fenced lookup'); }};
        const deps = {lookupSecret: async key => { reads.push(key); return 'synthetic-api-key'; },
            createHttp: options => { hosts.push(options.allowedHosts); return {dispose() {}, request: async url => {
                requests.push(url);
                if (url.endsWith('/spend_limit')) return {status: 404, json: null};
                const json = providerId === 'openai-api' ? {data: [], has_more: false} :
                    providerId === 'anthropic-api' ? {data: [], has_more: false} :
                        providerId === 'cursor' ? {teamMemberSpend: [], totalMembers: 0, totalPages: 0} :
                            {data: {limit: 1, limit_remaining: 0.5, limit_reset: null}};
                return {status: 200, json};
            }}; }};
        const siblings = ['12345678-1234-4234-8234-123456789abc', 'abcdef12-1234-4234-8234-123456789abc'].map(uuid => `${providerId}--${uuid}`);
        for (const connectorId of siblings) {
            const runtime = createProvider(connectorId, {gate, deps});
            assertEqual([runtime.id, runtime.providerId], [connectorId, providerId]);
            assertTrue((await runtime.fetch()).metrics.length > 0); runtime.dispose();
        }
        assertEqual(reads, siblings); assertEqual(captures, [providerId, providerId]);
        assertTrue(hosts.every(list => list.length === 1 && requests.some(url => url.startsWith(`https://${list[0]}/`))));
        const before = requests.length;
        const runtime = createProvider(siblings[0], {gate, deps: {...deps, lookupSecret: async () => { current = false; return 'synthetic-api-key'; }}});
        let failed = false; try { await runtime.fetch(); } catch (_error) { failed = true; }
        assertTrue(failed); assertEqual(requests.length, before, 'fenced key lookup dispatches no reporting request'); runtime.dispose();
    }
});
