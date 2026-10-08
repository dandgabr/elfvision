import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {assertEqual, assertTrue, flush, test, tmpDir} from './harness.js';
import * as configService from '../lib/services/localConfig.js';
import {MAX_BYTES} from '../lib/core/localConfig.js';
import {createProvider} from '../lib/providers/index.js';
import {encodeSecret} from '../lib/oauth/secret.js';

function cache(options) {
    assertTrue(typeof configService.createLocalConfigCache === 'function', 'provider configuration needs an asynchronous cache');
    return configService.createLocalConfigCache(options);
}

test('provider config: concurrent reads wait for one asynchronous read and TTL starts on completion', async () => {
    let at = 0, calls = 0, resolveRead;
    const held = new Promise(resolve => { resolveRead = resolve; });
    const reader = cache({now: () => at, readConfig: () => { calls++; return calls === 1 ? held : Promise.resolve({providers: {codex: {clientId: 'next'}}}); }});
    const first = reader.get('codex'), second = reader.get('antigravity');
    await flush(); assertEqual(calls, 1);
    at = 70000;
    resolveRead({providers: {codex: {clientId: 'first'}, antigravity: {clientId: 'google'}}});
    assertEqual(await Promise.all([first, second]), [{clientId: 'first'}, {clientId: 'google'}]);
    at = 120000; assertEqual(await reader.get('codex'), {clientId: 'first'}); assertEqual(calls, 1);
    at = 130001; assertEqual(await reader.get('codex'), {clientId: 'next'}); assertEqual(calls, 2);
});

test('provider config: a failed read gives no stale client settings and retries after TTL', async () => {
    let at = 0, calls = 0;
    const reader = cache({now: () => at, readConfig: async () => {
        if (++calls === 2) throw new Error('synthetic unavailable');
        return {providers: {codex: {clientId: calls === 1 ? 'old' : 'recovered'}}};
    }});
    assertEqual(await reader.get('codex'), {clientId: 'old'});
    at = 60001; assertEqual(await reader.get('codex'), undefined);
    at = 120002; assertEqual(await reader.get('codex'), {clientId: 'recovered'});
});

function providerFixture({expired = false, holdSecondConfig = false, holdRefresh = false} = {}) {
    let releaseConfig, releaseSecondConfig, releaseRefresh, blocked = false, configCalls = 0, at = 0;
    const held = new Promise(resolve => { releaseConfig = resolve; });
    const second = new Promise(resolve => { releaseSecondConfig = resolve; });
    const refresh = new Promise(resolve => { releaseRefresh = resolve; });
    const configCache = cache({now: () => at, readConfig: () => ++configCalls === 1 ? held : second});
    const requests = [], writes = [];
    const gate = {capture: async () => ({epoch: 'synthetic', provider: 'antigravity'}),
        assertCurrent: async () => { if (blocked) throw Object.assign(new Error('blocked'), {code: 'blocked'}); },
        registerCanceller: () => () => {}};
    let stored = {gen: 'g', access: 'old-access', refresh: 'old-refresh', expiresAt: expired ? 0 : Date.now() + 3600000};
    const provider = createProvider('antigravity', {gate, deps: {configCache,
        lookupSecret: async () => { if (holdSecondConfig) at = 60001; return encodeSecret(stored); },
        storeSecret: async (_id, _kind, value) => { writes.push(value); stored = JSON.parse(value); return true; },
        createHttp: ({allowedHosts}) => ({dispose() {}, request: async (url, options) => {
            requests.push({host: allowedHosts[0], url, options});
            if (url.endsWith('/token')) {
                if (holdRefresh) await refresh;
                return {status: 200, json: {access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600}};
            }
            return {status: 200, json: {groups: [{buckets: [{bucketId: 'gemini-synthetic', window: '5h', remainingFraction: 0.5}]}]}};
        }}),
    }});
    return {provider, requests, writes, releaseConfig, releaseSecondConfig, releaseRefresh,
        block: () => { blocked = true; }, configCalls: () => configCalls};
}

test('provider config: usage waits for asynchronous config and uses the prefetched User-Agent', async () => {
    const f = providerFixture();
    const fetch = f.provider.fetch({isCancelled: () => false});
    await flush(); assertEqual(f.requests, []);
    f.releaseConfig({providers: {antigravity: {clientId: 'synthetic-client', userAgent: 'synthetic agent'}}});
    assertEqual((await fetch).metrics[0].percentUsed, 50);
    assertEqual([f.configCalls(), f.requests[0].options.headers['User-Agent']], [1, 'synthetic agent']);
    await f.provider.dispose();
});

test('provider config: renewal uses asynchronous client settings and keeps accepted rotation storage', async () => {
    const f = providerFixture({expired: true});
    const fetch = f.provider.fetch({isCancelled: () => false});
    await flush(); assertEqual(f.requests, []);
    f.releaseConfig({providers: {antigravity: {clientId: 'synthetic-client', clientSecret: 'synthetic-secret'}}});
    await fetch;
    assertTrue(f.requests[0].options.body.includes('client_id=synthetic-client'));
    assertTrue(f.requests[0].options.body.includes('client_secret=synthetic-secret'));
    assertEqual([f.configCalls(), f.writes.length, f.requests[1].options.headers.Authorization], [1, 1, 'Bearer new-access']);
    await f.provider.dispose();
});

for (const reason of ['disconnect', 'scheduler cancellation', 'dispose']) {
    test(`provider config: held configuration cannot dispatch after ${reason}`, async () => {
        const f = providerFixture({expired: true}); let cancelled = false;
        const fetch = f.provider.fetch({isCancelled: () => cancelled}).catch(() => {});
        await flush();
        if (reason === 'disconnect') f.block();
        else if (reason === 'dispose') await f.provider.dispose();
        else cancelled = true;
        f.releaseConfig({providers: {antigravity: {clientId: 'synthetic'}}});
        await fetch; assertEqual([f.requests.length, f.writes.length], [0, 0]);
        await f.provider.dispose();
    });
}

for (const reason of ['disconnect', 'scheduler cancellation', 'dispose']) {
    test(`provider config: a renewal waiting for expired config cannot start HTTP after ${reason}`, async () => {
        const f = providerFixture({expired: true, holdSecondConfig: true}); let cancelled = false;
        const fetch = f.provider.fetch({isCancelled: () => cancelled}).catch(() => {});
        f.releaseConfig({providers: {antigravity: {clientId: 'synthetic'}}});
        await flush(30); assertEqual(f.configCalls(), 2);
        let disposed;
        if (reason === 'disconnect') f.block();
        else if (reason === 'dispose') disposed = f.provider.dispose();
        else cancelled = true;
        f.releaseSecondConfig({providers: {antigravity: {clientId: 'synthetic'}}});
        await fetch; await disposed;
        assertEqual([f.requests.length, f.writes.length], [0, 0]);
        await f.provider.dispose();
    });
}

test('provider config: disposal after renewal HTTP starts still stores the accepted rotation', async () => {
    const f = providerFixture({expired: true, holdRefresh: true});
    const fetch = f.provider.fetch({isCancelled: () => false}).catch(error => error);
    f.releaseConfig({providers: {antigravity: {clientId: 'synthetic'}}});
    await flush(30); assertEqual(f.requests.length, 1);
    const disposed = f.provider.dispose();
    f.releaseRefresh();
    const result = await fetch; await disposed;
    assertEqual(f.writes.length, 1);
    assertEqual(JSON.parse(f.writes[0]).refresh, 'new-refresh');
    assertEqual([result.code, f.requests.length], ['auth_required', 1], 'accepted storage must not start a late usage request');
});

test('provider config: async file reader accepts the byte boundary and refuses one byte more', async () => {
    const path = `${tmpDir()}/providers.local.json`;
    const json = JSON.stringify({version: 1, providers: {codex: {clientId: 'synthetic'}}});
    GLib.file_set_contents(path, json.padEnd(MAX_BYTES, ' '));
    Gio.File.new_for_path(path).set_attribute_uint32('unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);
    assertEqual((await configService.readLocalConfigAsync(path)).providers.codex.clientId, 'synthetic');
    GLib.file_set_contents(path, json.padEnd(MAX_BYTES + 1, ' '));
    assertEqual((await configService.readLocalConfigAsync(path)).providers, {});
});

function syntheticFile({openedMode = 0o600, openedType = Gio.FileType.REGULAR, openedUid = new Gio.Credentials().get_unix_user(), openedSize = null,
    stall = false, growing = false} = {}) {
    const bytes = new TextEncoder().encode(JSON.stringify({version: 1, providers: {codex: {clientId: 'synthetic'}}}));
    const info = mode => ({get_file_type: () => Gio.FileType.REGULAR, get_size: () => bytes.length,
        get_attribute_uint32: name => name === 'unix::mode' ? mode : new Gio.Credentials().get_unix_user()});
    let reads = 0, closed = false;
    const stream = {
        query_info_async(_attrs, _priority, _cancel, callback) { callback(stream, {}); },
        query_info_finish() { return {get_file_type: () => openedType, get_size: () => openedSize ?? bytes.length,
            get_attribute_uint32: name => name === 'unix::mode' ? openedMode : openedUid}; },
        read_bytes_async(amount, _priority, _cancel, callback) { callback(stream, {amount}); },
        read_bytes_finish(result) { return {toArray: () => growing ? new Uint8Array(result.amount) : reads++ === 0 ? bytes : new Uint8Array()}; },
        close_async(_priority, _cancel, callback) { closed = true; callback(stream, {}); }, close_finish() {},
    };
    const file = {
        query_info_async(_attrs, _flags, _priority, cancel, callback) {
            if (stall) cancel.connect(() => callback(file, {}));
            else callback(file, {});
        },
        query_info_finish() { if (stall) throw new Error('synthetic cancellation'); return info(0o600); },
        get_parent() { return {query_info_async(_attrs, _flags, _priority, _cancel, callback) { callback(this, {}); },
            query_info_finish: () => info(0o700)}; },
        read_async(_priority, _cancel, callback) { callback(file, {}); }, read_finish: () => stream,
    };
    return {file, closed: () => closed};
}

function validPath() {
    const path = `${tmpDir()}/providers.local.json`;
    GLib.file_set_contents(path, JSON.stringify({version: 1, providers: {codex: {clientId: 'synthetic'}}}));
    Gio.File.new_for_path(path).set_attribute_uint32('unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);
    return path;
}

test('provider config: opened-stream permissions are rechecked before reading a replaced file', async () => {
    const f = syntheticFile({openedMode: 0o644});
    const result = await configService.readLocalConfigAsync(validPath(), {file: f.file});
    assertEqual(result.providers, {});
    assertTrue(result.problems[0].includes('chmod 600'));
    assertTrue(f.closed());
});

for (const scenario of [
    {name: 'nonregular object', options: {openedType: Gio.FileType.SYMBOLIC_LINK}, problem: 'the path is not a regular file'},
    {name: 'foreign owner', options: {openedUid: new Gio.Credentials().get_unix_user() + 1}, problem: 'the file belongs to another user'},
    {name: 'oversized object', options: {openedSize: MAX_BYTES + 1}, problem: 'the file is too large'},
]) {
    test(`provider config: opened-stream policy refuses ${scenario.name}`, async () => {
        const f = syntheticFile(scenario.options);
        const result = await configService.readLocalConfigAsync(validPath(), {file: f.file});
        assertEqual([result.providers, result.problems], [{}, [scenario.problem]]);
        assertTrue(f.closed());
    });
}

test('provider config: asynchronous metadata has a total cancellation deadline', async () => {
    const f = syntheticFile({stall: true});
    const result = await configService.readLocalConfigAsync(validPath(), {file: f.file, timeoutMs: 10});
    assertEqual([result.providers, result.missing], [{}, false]);
    assertEqual(result.problems, ['the file cannot be read']);
});

test('provider config: counted async reading refuses a file growing past the initial size', async () => {
    const f = syntheticFile({growing: true});
    const result = await configService.readLocalConfigAsync(validPath(), {file: f.file});
    assertEqual(result.providers, {});
    assertEqual(result.problems, ['the file is too large']);
    assertTrue(f.closed());
});

test('provider config: a private regular opened stream retains valid configuration', async () => {
    const f = syntheticFile();
    const result = await configService.readLocalConfigAsync(validPath(), {file: f.file});
    assertEqual(result.providers, {codex: {clientId: 'synthetic'}});
    assertTrue(f.closed());
});
