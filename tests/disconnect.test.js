import {assertTrue, test} from './harness.js';

test('disconnect: durable cross-process gate is available', async () => {
    let module;
    try { module = await import('../lib/core/disconnect.js'); } catch (_error) { /* Feature absent in RED. */ }
    assertTrue(typeof module?.createDisconnectGate === 'function', 'disconnect gate implementation is missing');
});

import GLib from 'gi://GLib';
import {assertEqual, flush} from './harness.js';
import {createDisconnectGate} from '../lib/core/disconnect.js';
import {decodeSecret, encodeSecret} from '../lib/oauth/secret.js';

const delay = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
function fixture() {
    let state = null, serial = Promise.resolve(), n = 0;
    const listeners = new Set(), live = new Set(['one', 'two']);
    const store = {
        transact(fn) {
            const operation = serial.then(async () => {
                const draft = state ? JSON.parse(JSON.stringify(state)) : null;
                const answer = await fn(draft);
                if (answer.state) state = JSON.parse(JSON.stringify(answer.state));
                for (const fn of [...listeners]) Promise.resolve().then(fn);
                return answer.value;
            });
            serial = operation.catch(() => {});
            return operation;
        },
        read: async () => state ? JSON.parse(JSON.stringify(state)) : null,
        watch: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    };
    const make = (id, boot = 'boot-a', providers = ['codex', 'command-code']) => createDisconnectGate({store, identity: {id, boot},
        alive: async identity => live.has(identity.id), uuid: () => `id-${++n}`, sleep: delay, now: Date.now, drainMs: 40,
        providers, kinds: ['api-key', 'oauth-token']});
    return {make, live, store, state: () => state};
}
const deletion = (extra = {}) => ({removeCredential: async () => true, removeFile: async () => true, clearStatus: async () => {}, ...extra});
async function failure(fn) { try { await fn(); } catch (error) { return error.code; } return null; }

const expandedProviders = ['codex', 'command-code', 'claude'];
test('disconnect: completed durable transaction admits expanded registry without changing its fence', async () => {
    const f = fixture(), old = f.make('one'); await old.disconnect(deletion()); await old.close();
    const epoch = f.state().epoch, transactionId = f.state().transaction.id;
    const upgraded = f.make('two', 'boot-a', expandedProviders); await upgraded.ready();
    const ticket = await upgraded.capture('claude');
    assertEqual(ticket.epoch, epoch); assertEqual(f.state().transaction.id, transactionId);
    assertEqual(f.state().transaction.credentials.claude, {'api-key': 'absent', 'oauth-token': 'absent'});
    let stored = false; await upgraded.withCredentialWrite('claude', ticket, async () => { stored = true; });
    assertTrue(stored); await upgraded.close();
});

for (const phase of ['failed', 'draining', 'deleting']) {
    test(`disconnect: expanded registry preserves unfinished global ${phase} deletion and blocks added providers`, async () => {
        const f = fixture(), old = f.make('one');
        await old.disconnect(deletion({removeCredential: async () => false})); await old.close();
        await f.store.transact(state => { state.transaction.phase = phase; return {state}; });
        const epoch = f.state().epoch, transactionId = f.state().transaction.id;
        const upgraded = f.make('two', 'boot-a', expandedProviders); await upgraded.ready();
        assertEqual(f.state().epoch, epoch); assertEqual(f.state().transaction.id, transactionId);
        assertEqual(f.state().blockedProviders, expandedProviders);
        assertEqual(f.state().transaction.credentials.claude, {'api-key': 'pending', 'oauth-token': 'pending'});
        assertEqual(await failure(() => upgraded.capture('claude')), 'blocked');
        // An interrupted coordinator must be dead before a new client can retry.
        f.live.delete('one'); const removed = [];
        assertEqual((await upgraded.disconnect(deletion({removeCredential: async (id, kind) => { removed.push([id, kind]); return true; }}))).phase, 'complete');
        assertTrue(removed.some(([id, kind]) => id === 'claude' && kind === 'api-key'));
        assertTrue(removed.some(([id, kind]) => id === 'claude' && kind === 'oauth-token'));
        await upgraded.close();
    });
}

test('disconnect: expanded registry keeps a failed target scope and only its original provider blocked', async () => {
    const f = fixture(), old = f.make('one');
    const target = {id: 'codex--12345678-1234-4234-8234-123456789abc', provider: 'codex', kind: 'oauth-token'};
    await old.disconnect(deletion({removeCredential: async () => false}), {target}); await old.close();
    const upgraded = f.make('two', 'boot-a', expandedProviders); await upgraded.ready();
    assertEqual(f.state().transaction.target, target); assertEqual(f.state().blockedProviders, ['codex']);
    assertEqual(f.state().transaction.credentials.claude, {'api-key': 'preserved', 'oauth-token': 'preserved'});
    await upgraded.capture('claude'); assertEqual(await failure(() => upgraded.capture('codex')), 'blocked');
    const removed = []; await upgraded.disconnect(deletion({removeCredential: async (id, kind) => { removed.push([id, kind]); return true; }}), {target});
    assertEqual(removed, [[target.id, target.kind]]); await upgraded.close();
});

test('disconnect: expansion preserves an issued lease and stale ticket fence', async () => {
    const f = fixture(), old = f.make('one'); await old.ready();
    const ticket = await old.capture('codex'), hold = deferred(), entered = deferred();
    const writing = old.withCredentialWrite('codex', ticket, async () => { entered.resolve(); await hold.promise; });
    await entered.promise; f.live.delete('one');
    const remover = f.make('two'); await remover.disconnect(deletion()); await remover.close();
    const leases = JSON.stringify(f.state().leases), epoch = f.state().epoch;
    const upgraded = f.make('two', 'boot-a', expandedProviders); await upgraded.ready();
    assertEqual(JSON.stringify(f.state().leases), leases); assertEqual(f.state().epoch, epoch);
    assertEqual(await failure(() => upgraded.assertCurrent(ticket)), 'stale');
    const result = await upgraded.disconnect(deletion()); assertEqual(result.problem, 'orphaned-write');
    assertEqual(JSON.stringify(f.state().leases), leases);
    // Simulate only the accepted backend operation settling; the old reader fails
    // closed on a newer matrix rather than rewriting it with fewer providers.
    hold.resolve(); await failure(() => writing); await upgraded.close();
});

for (const corruption of ['unknown-provider', 'unknown-kind', 'missing-kind', 'empty-matrix']) {
    test(`disconnect: expanded registry rejects ${corruption} without persisting normalization`, async () => {
        const f = fixture(), old = f.make('one'); await old.disconnect(deletion()); await old.close();
        await f.store.transact(state => {
            const credentials = state.transaction.credentials;
            if (corruption === 'unknown-provider') credentials.unknown = {...credentials.codex};
            if (corruption === 'unknown-kind') credentials.codex.unknown = 'absent';
            if (corruption === 'missing-kind') delete credentials.codex['api-key'];
            if (corruption === 'empty-matrix') state.transaction.credentials = {};
            return {state};
        });
        const before = JSON.stringify(f.state());
        const upgraded = f.make('two', 'boot-a', expandedProviders);
        assertEqual(await failure(() => upgraded.ready()), 'invalid-state');
        assertEqual(JSON.stringify(f.state()), before); assertTrue(upgraded.isBlocked('claude'));
    });
}

test('disconnect: status clearing receives current durable deletion results', async () => {
    const f = fixture(), gate = f.make('one'); let seen = null;
    const result = await gate.disconnect(deletion({removeCredential: async id => id !== 'codex',
        clearStatus: async transaction => { seen = transaction; if (transaction.credentials.codex['api-key'] === 'failed') throw new Error('retain metadata'); }}));
    assertEqual(seen?.credentials.codex['api-key'], 'failed'); assertEqual(seen?.files.snapshots, 'absent');
    assertEqual(result.status, 'failed'); assertEqual(result.phase, 'failed');
    await gate.close();
});

test('disconnect: explicit metadata refusal retains every provider fence', async () => {
    const f = fixture(), gate = f.make('one');
    const result = await gate.disconnect(deletion({clearStatus: async () => false}));
    assertEqual(result.status, 'failed'); assertEqual(result.phase, 'failed');
    assertEqual(await failure(() => gate.capture('codex')), 'blocked');
    assertEqual(await failure(() => gate.capture('command-code')), 'blocked');
    assertEqual((await gate.disconnect(deletion())).phase, 'complete');
    await gate.capture('codex'); await gate.close();
});

test('disconnect: completion rejects old login tickets and permits explicit new ones', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready();
    const old = await gate.capture('codex');
    await gate.disconnect(deletion());
    assertEqual(await failure(() => gate.withCredentialWrite('codex', old, async () => {})), 'stale');
    const current = await gate.capture('codex');
    let writes = 0; await gate.withCredentialWrite('codex', current, async () => { writes++; });
    assertEqual(writes, 1); await gate.close();
});

test('disconnect: issued keyring write drains before deletion across two clients', async () => {
    const f = fixture(), writer = f.make('one'), remover = f.make('two');
    await Promise.all([writer.ready(), remover.ready()]);
    const hold = deferred(), ticket = await writer.capture('codex'), order = [];
    const saving = writer.withCredentialWrite('codex', ticket, async () => { order.push('store'); await hold.promise; order.push('settled'); });
    await flush(30);
    const removing = remover.disconnect(deletion({removeCredential: async () => { order.push('delete'); return true; }}));
    await delay(5); assertEqual(order, ['store']);
    hold.resolve(); await saving; await removing;
    assertTrue(order.indexOf('delete') > order.indexOf('settled'));
    await writer.close(); await remover.close();
});

test('disconnect: crashed issued write never expires within the same boot', async () => {
    const f = fixture(), writer = f.make('one'); await writer.ready();
    const hold = deferred(); writer.withCredentialWrite('codex', await writer.capture('codex'), () => hold.promise);
    await flush(30); f.live.delete('one');
    const remover = f.make('two'); await remover.ready(); let deletes = 0;
    const result = await remover.disconnect(deletion({removeCredential: async () => { deletes++; return true; }}));
    assertEqual(result.problem, 'orphaned-write'); assertEqual(deletes, 0); assertTrue(remover.isBlocked('codex'));
    const retry = await remover.disconnect(deletion()); assertEqual(retry.problem, 'orphaned-write');
    await remover.close();
});

test('disconnect: prior boot permits tombstone recovery and exact repeated deletion', async () => {
    const f = fixture(), writer = f.make('one'); await writer.ready();
    const hold = deferred(); writer.withCredentialWrite('codex', await writer.capture('codex'), () => hold.promise);
    await flush(30); f.live.delete('one');
    const recovery = f.make('two', 'boot-b'); await recovery.ready();
    const result = await recovery.disconnect(deletion()); assertEqual(result.phase, 'complete');
    assertEqual(Object.keys(f.state().leases).length, 0); await recovery.close();
});

test('disconnect: keyring refusal retains affected gate without false disconnected success', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready();
    const result = await gate.disconnect(deletion({removeCredential: async id => id !== 'codex'}));
    assertEqual(result.phase, 'failed'); assertTrue(gate.isBlocked('codex')); assertTrue(!gate.isBlocked('command-code'));
    assertEqual(result.credentials.codex['oauth-token'], 'failed');
    const retry = await gate.disconnect(deletion()); assertEqual(retry.phase, 'complete'); await gate.close();
});

test('disconnect: retry removes credentials and published data recreated after partial success', async () => {
    const f = fixture(), gate = f.make('one');
    await gate.ready();
    const credentials = new Set(['command-code:api-key']);
    const files = new Set(['snapshots', 'alerts']);
    let published = true;
    const dependencies = refusal => deletion({
        removeCredential: async (provider, kind) => {
            if (refusal && provider === 'codex') return false;
            credentials.delete(`${provider}:${kind}`);
            return true;
        },
        removeFile: async name => { files.delete(name); return true; },
        clearStatus: async () => { published = false; return true; },
    });
    assertEqual((await gate.disconnect(dependencies(true))).phase, 'failed');
    assertTrue(!gate.isBlocked('command-code'), 'a fully removed provider can reconnect after partial failure');
    await gate.withCredentialWrite('command-code', await gate.capture('command-code'), async () => {
        credentials.add('command-code:api-key');
        files.add('snapshots'); files.add('alerts'); published = true;
    });
    const retry = await gate.disconnect(dependencies(false));
    assertEqual(retry.phase, 'complete');
    assertEqual([...credentials], [], 'complete must mean no newly reconnected credential remains');
    assertEqual([...files], [], 'previous absence cannot stand in for current cache deletion');
    assertEqual(published, false, 'retry clears status published by the replacement login');
    await gate.close();
});

test('disconnect: asynchronous cache commit holds serialization until completed', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready();
    const hold = deferred(), order = [];
    const saving = gate.guardFileWrite(await gate.capture(), async () => { order.push('cache-start'); await hold.promise; order.push('cache-end'); });
    await flush(20);
    const removing = gate.disconnect(deletion({removeFile: async () => { order.push('unlink'); return true; }}));
    await delay(5); assertEqual(order, ['cache-start']);
    hold.resolve(); await saving; await removing; assertTrue(order.indexOf('unlink') > order.indexOf('cache-end')); await gate.close();
});

test('disconnect: cancellation callbacks run and stale file writers are fenced', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready(); let cancels = 0;
    gate.registerCanceller(() => { cancels++; }); const ticket = await gate.capture();
    await gate.disconnect(deletion()); assertTrue(cancels > 0);
    assertEqual(await failure(() => gate.guardFileWrite(ticket, async () => {})), 'stale'); await gate.close();
});

test('disconnect: overlapping same-process deletion is rejected without replacing transaction', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready(); const hold = deferred();
    const first = gate.disconnect(deletion({removeCredential: async () => { await hold.promise; return true; }}));
    await flush(30); const id = f.state().transaction.id;
    assertEqual(await failure(() => gate.disconnect(deletion())), 'busy'); assertEqual(f.state().transaction.id, id);
    hold.resolve(); assertEqual((await first).phase, 'complete'); await gate.close();
});

test('disconnect: crashed remote deletion holds tombstone until prior boot', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready(); const hold = deferred();
    gate.disconnect(deletion({removeCredential: () => hold.promise})); await flush(30); f.live.delete('one');
    const retry = f.make('two'); await retry.ready();
    assertEqual((await retry.disconnect(deletion())).problem, 'orphaned-delete');
    assertEqual(await failure(() => retry.capture('codex')), 'blocked'); await retry.close();
    const reboot = f.make('two', 'boot-b'); await reboot.ready(); assertEqual((await reboot.disconnect(deletion())).phase, 'complete'); await reboot.close();
});

test('disconnect: corrupt and unexpected metadata fields fail closed', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready();
    f.state().unexpected = 'untrusted';
    assertEqual(await failure(() => gate.capture('codex')), 'invalid-state');
    delete f.state().unexpected; f.state().leases.bad = {provider: 'codex'};
    assertEqual(await failure(() => gate.capture('codex')), 'invalid-state');
});

import {createTokenManager} from '../lib/oauth/tokenManager.js';
import {createApiKeyController} from '../lib/prefs/apiKeyController.js';
import {createOAuthController} from '../lib/prefs/oauthController.js';
import {providerMeta} from '../lib/providers/registry.js';
const fakeSettings = () => ({get_value: () => ({deepUnpack: () => ({})}), get_strv: () => ['codex'], set_strv() {}});

test('disconnect: token rotation completion after reset cannot issue a credential store', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready();
    const hold = deferred(); let writes = 0;
    const tokens = createTokenManager({now: () => 1000, load: async () => ({gen: 'g', access: 'synthetic', refresh: 'synthetic', expiresAt: 0, scope: ''}),
        captureTicket: () => gate.capture('codex'), assertTicket: ticket => gate.assertCurrent(ticket),
        refreshCall: () => hold.promise, save: async (_value, ticket) => gate.withCredentialWrite('codex', ticket, async () => { writes++; })});
    gate.registerCanceller(() => tokens.reset());
    const outcome = tokens.accessToken().catch(error => error.code); await flush(30);
    await gate.disconnect(deletion()); hold.resolve({access: 'synthetic-new', refresh: 'synthetic-new', expiresAt: 99999, scope: ''});
    assertEqual(await outcome, 'disconnected'); assertEqual(writes, 0); await gate.close();
});

test('disconnect: delayed OAuth configuration cannot start an old sign-in after completion', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready(); const hold = deferred(); let starts = 0;
    const controller = createOAuthController({meta: providerMeta('codex'), settings: fakeSettings(), gettext: s => s,
        confirmTerms: async () => true, deps: {gate, readLocalConfig: () => hold.promise, lookupSecret: async () => null,
            startLogin: () => { starts++; throw new Error('must not start'); }}});
    const connecting = controller.connect(); await flush(30); await gate.disconnect(deletion());
    hold.resolve({providers: {codex: {clientId: 'synthetic'}}, problems: []}); await connecting;
    assertEqual(starts, 0); controller.dispose(); await gate.close();
});

test('disconnect: API save holds a lease and its late completion cannot announce old credentials', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready(); const hold = deferred(); let announced = 0;
    const controller = createApiKeyController({meta: providerMeta('command-code'), settings: fakeSettings(), gettext: s => s,
        deps: {gate, lookupSecret: async () => null, announceChange: () => { announced++; },
            storeSecret: (id, _kind, _value, _label, {ticket}) => gate.withCredentialWrite(id, ticket, () => hold.promise)}});
    const saving = controller.save('a'.repeat(32)); await flush(30);
    const removing = gate.disconnect(deletion()); await flush(30); hold.resolve(); await saving; await removing;
    assertEqual(announced, 0); controller.dispose(); await gate.close();
});

test('disconnect: a live unacknowledged writer timeout is never treated as expired', async () => {
    const f = fixture(), writer = f.make('one'), remover = f.make('two'); await Promise.all([writer.ready(), remover.ready()]);
    const hold = deferred(); const saving = writer.withCredentialWrite('codex', await writer.capture('codex'), () => hold.promise);
    await flush(30); let deletes = 0;
    const failed = await remover.disconnect(deletion({removeCredential: async () => { deletes++; return true; }}));
    assertEqual([failed.problem, deletes, Object.keys(f.state().leases).length], ['drain-timeout', 0, 1]);
    hold.resolve(); await saving; assertEqual((await remover.disconnect(deletion())).phase, 'complete');
    await writer.close(); await remover.close();
});

test('disconnect: observed legacy Shell fence survives same-boot replacement and clears only on a new boot', async () => {
    const f = fixture(), prefs = f.make('one'); await prefs.ready();
    await prefs.noteLegacyWriter();
    let deletes = 0;
    const replacement = f.make('two'); await replacement.ready();
    const held = await replacement.disconnect(deletion({removeCredential: async () => { deletes++; return true; }}));
    assertEqual([held.problem, deletes, f.state().legacyBoot], ['restart-computer-required', 0, 'boot-a']);
    assertEqual(await failure(() => replacement.capture('codex')), 'blocked');
    await prefs.close(); await replacement.close();
    const reboot = f.make('two', 'boot-b'); await reboot.ready();
    assertEqual((await reboot.disconnect(deletion())).phase, 'complete'); assertEqual(f.state().legacyBoot, null); await reboot.close();
});

test('disconnect: a closed issued writer retires its participant after settlement across reenables', async () => {
    const f = fixture(), old = f.make('one'); await old.ready(); const hold = deferred();
    const saving = old.withCredentialWrite('codex', await old.capture('codex'), () => hold.promise); await flush(30);
    await old.close(); assertEqual(Object.keys(f.state().participants).length, 1);
    const current = f.make('one'); await current.ready(); hold.resolve(); await saving;
    assertEqual(Object.keys(f.state().participants).length, 1);
    assertEqual((await current.disconnect(deletion())).phase, 'complete');
    assertEqual((await current.disconnect(deletion())).phase, 'complete'); await current.close();
});

import {getDisconnectGate} from '../lib/services/disconnectGate.js';
test('disconnect: closing lazy facade detaches immediately and never erases its replacement singleton', async () => {
    // Neither facade is initialized: this regression performs no user metadata I/O.
    const old = getDisconnectGate(), closing = old.close(), current = getDisconnectGate();
    assertTrue(old !== current); assertEqual(await failure(() => old.ready()), 'closed');
    await closing; assertTrue(getDisconnectGate() === current); await current.close();
});

test('disconnect: closing an issued deletion retires the coordinator participant after callbacks settle', async () => {
    const f = fixture(), old = f.make('one'); await old.ready(); const hold = deferred(); let held = false;
    const removing = old.disconnect(deletion({removeCredential: async () => { if (!held) { held = true; await hold.promise; } return true; }}));
    await flush(30); await old.close(); const current = f.make('one'); await current.ready();
    assertEqual(await failure(() => current.disconnect(deletion())), 'busy'); hold.resolve(); await removing;
    assertEqual(Object.keys(f.state().participants).length, 1);
    assertEqual((await current.disconnect(deletion())).phase, 'complete'); await current.close();
});

test('disconnect: normal retirement keeps accepted writer operations alive until idle', async () => {
    const module = await import('../lib/services/disconnectGate.js');
    assertTrue(typeof module.createDisconnectFacade === 'function', 'injectable lazy facade required');
    const f = fixture(), oldCore = f.make('one'); const hold = deferred(); let detached = false;
    const facade = module.createDisconnectFacade({initialize: async () => oldCore, detach: () => { detached = true; }});
    await facade.ready(); const ticket = await facade.capture('codex');
    const retiring = facade.retire(hold.promise); assertTrue(detached);
    assertTrue(await facade.assertCurrent(ticket)); let stored = false;
    await facade.withCredentialWrite('codex', ticket, async () => { stored = true; }); assertTrue(stored);
    hold.resolve(); await retiring; assertEqual(await failure(() => facade.assertCurrent(ticket)), 'closed');
});

test('disconnect: a replacement gate still cancels a retiring accepted rotation before late storage', async () => {
    const {createDisconnectFacade} = await import('../lib/services/disconnectGate.js');
    const f = fixture(), old = createDisconnectFacade({initialize: async () => f.make('one')}); await old.ready();
    const hold = deferred(); let writes = 0, cancels = 0;
    const ticket = await old.capture('codex');
    const tokens = createTokenManager({now: () => 1000, load: async () => ({gen: 'g', access: 'synthetic', refresh: 'synthetic', expiresAt: 0, scope: ''}),
        captureTicket: async () => ticket, assertTicket: value => old.assertCurrent(value), refreshCall: () => hold.promise,
        save: (_tokens, value) => old.withCredentialWrite('codex', value, async () => { writes++; })});
    old.registerCanceller(() => { cancels++; tokens.reset(); });
    const rotating = tokens.accessToken().catch(error => error.code); await flush(30);
    const retirement = old.retire(rotating);
    const replacement = createDisconnectFacade({initialize: async () => f.make('one')}); await replacement.ready();
    await replacement.disconnect(deletion()); assertTrue(cancels > 0);
    assertEqual(await failure(() => old.assertCurrent(ticket)), 'stale');
    hold.resolve({access: 'synthetic-new', refresh: 'synthetic-new', expiresAt: 99999, scope: ''});
    assertEqual(await rotating, 'disconnected'); await retirement; assertEqual(writes, 0);
    assertEqual(Object.keys(f.state().participants).length, 1); await replacement.close();
});

test('disconnect: lazy retirement detaches singleton while idle work is still pending', async () => {
    const hold = deferred(), old = getDisconnectGate(), retirement = old.retire(hold.promise), replacement = getDisconnectGate();
    assertTrue(old !== replacement); hold.resolve(); await retirement;
    assertTrue(getDisconnectGate() === replacement); await replacement.close();
});

test('disconnect: same-provider writes exclude each other across clients without blocking metadata or other providers', async () => {
    const f = fixture(), first = f.make('one'), second = f.make('two');
    await Promise.all([first.ready(), second.ready()]);
    const hold = deferred(), entered = deferred(), order = [];
    const old = first.withCredentialWrite('codex', await first.capture('codex'), async () => {
        order.push('old-start'); entered.resolve(); await hold.promise; order.push('old-end');
    });
    await entered.promise;
    const newer = second.withCredentialWrite('codex', await second.capture('codex'), async () => { order.push('new'); });
    await second.withCredentialWrite('command-code', await second.capture('command-code'), async () => { order.push('other'); });
    await delay(15);
    const beforeRelease = [...order];
    hold.resolve(); await old; await newer;
    assertEqual(beforeRelease, ['old-start', 'other']);
    assertEqual(order, ['old-start', 'other', 'old-end', 'new']);
    await first.close(); await second.close();
});

for (const change of ['login', 'delete', 'unchanged']) {
    test(`disconnect: conditional rotation compares inside provider exclusion after ${change}`, async () => {
        const {createCredentialMutator} = await import('../lib/services/secrets.js');
        assertTrue(typeof createCredentialMutator === 'function', 'coordinated conditional credential mutation is missing');
        const f = fixture(), first = f.make('one'), second = f.make('two');
        await Promise.all([first.ready(), second.ready()]);
        const original = {gen: 'old', access: 'a', refresh: 'old-refresh', expiresAt: 1, scope: ''};
        const newer = {...original, gen: 'new', refresh: 'new-refresh'};
        let stored = encodeSecret(original), writes = 0;
        const hold = deferred(), entered = deferred();
        const mutator = gate => createCredentialMutator({gate,
            lookup: async () => stored,
            store: async (_id, _kind, value) => { writes++; stored = value; },
            erase: async () => { stored = null; return true; }});
        const replacing = first.withCredentialWrite('codex', await first.capture('codex'), async () => {
            entered.resolve(); await hold.promise;
            if (change === 'login') stored = encodeSecret(newer);
            if (change === 'delete') stored = null;
        }, {operation: change === 'delete' ? 'delete' : 'store'});
        await entered.promise;
        const rotation = mutator(second).storeSecret('codex', 'oauth-token', encodeSecret({...original, refresh: 'rotated'}), 'synthetic',
            {ticket: await second.capture('codex'), expected: {gen: original.gen, refresh: original.refresh}});
        await delay(15); hold.resolve(); await replacing;
        const accepted = await rotation;
        assertEqual(accepted, change === 'unchanged');
        assertEqual(writes, change === 'unchanged' ? 1 : 0);
        assertEqual(decodeSecret(stored)?.refresh ?? null, change === 'login' ? 'new-refresh' : change === 'delete' ? null : 'rotated');
        await first.close(); await second.close();
    });
}

for (const change of ['login', 'delete']) {
    test(`disconnect: old token manager cannot resurrect credentials after completed ${change} before lease acquisition`, async () => {
        const {createCredentialMutator} = await import('../lib/services/secrets.js');
        const {createTokenManager} = await import('../lib/oauth/tokenManager.js');
        const f = fixture(), first = f.make('one'), second = f.make('two');
        await Promise.all([first.ready(), second.ready()]);
        const original = {gen: 'old', access: 'a', refresh: 'old-refresh', expiresAt: 0, scope: ''};
        const newer = {...original, gen: 'new', access: 'new-access', refresh: 'new-refresh', expiresAt: 999999};
        let stored = encodeSecret(original), writes = 0;
        const entered = deferred(), release = deferred();
        const mutations = gate => createCredentialMutator({gate, lookup: async () => stored,
            store: async (_id, _kind, value) => { stored = value; writes++; }, erase: async () => { stored = null; return true; }});
        const ticket = await first.capture('codex');
        const manager = createTokenManager({now: () => 1, load: async () => decodeSecret(stored),
            captureTicket: async () => ticket, assertTicket: value => first.assertCurrent(value),
            refreshCall: async () => ({access: 'rotated-access', refresh: 'rotated-refresh', expiresAt: 888888, scope: ''}),
            save: async (value, captured, expected) => {
                entered.resolve(); await release.promise;
                return mutations(first).storeSecret('codex', 'oauth-token', encodeSecret(value), 'synthetic', {ticket: captured, expected});
            }});
        const rotating = manager.accessToken().catch(error => error.code);
        await entered.promise;
        const options = {ticket: await second.capture('codex')};
        if (change === 'login') await mutations(second).storeSecret('codex', 'oauth-token', encodeSecret(newer), 'synthetic', options);
        else await mutations(second).clearSecret('codex', 'oauth-token', options);
        release.resolve();
        assertEqual(await rotating, 'disconnected');
        assertEqual(stored, change === 'login' ? encodeSecret(newer) : null);
        assertEqual(writes, change === 'login' ? 1 : 0);
        const next = await manager.accessToken().catch(error => error.code);
        assertEqual(next, change === 'login' ? 'new-access' : 'not_connected', 'old pending tokens are discarded after CAS loss');
        await first.close(); await second.close();
    });
}

test('disconnect: queued mutation rechecks epoch while disconnect enters drain', async () => {
    const f = fixture(), writer = f.make('one'), other = f.make('two');
    await Promise.all([writer.ready(), other.ready()]);
    const hold = deferred(), entered = deferred(), ticket = await writer.capture('codex');
    const writing = writer.withCredentialWrite('codex', ticket, async () => { entered.resolve(); await hold.promise; });
    await entered.promise;
    let lateWrites = 0;
    const queued = failure(() => other.withCredentialWrite('codex', ticket, async () => { lateWrites++; }));
    const deleting = other.disconnect(deletion());
    await delay(15);
    const blockedDuringWrite = other.isBlocked('codex');
    hold.resolve(); await writing;
    assertEqual(await queued, 'stale');
    assertEqual((await deleting).phase, 'complete');
    assertEqual([blockedDuringWrite, lateWrites], [true, 0]);
    await writer.close(); await other.close();
});

for (const operation of ['store', 'delete']) {
    test(`disconnect: same-boot orphaned ${operation} excludes later mutation without expiry`, async () => {
        const f = fixture(), first = f.make('one'), second = f.make('two');
        await Promise.all([first.ready(), second.ready()]);
        const hold = deferred(), entered = deferred();
        const writing = first.withCredentialWrite('codex', await first.capture('codex'), async () => { entered.resolve(); await hold.promise; }, {operation});
        await entered.promise; f.live.delete('one');
        let writes = 0;
        const ticket = await second.capture('codex');
        assertEqual(await failure(() => second.withCredentialWrite('codex', ticket, async () => { writes++; })), `orphaned-${operation === 'store' ? 'write' : 'delete'}`);
        assertEqual(writes, 0);
        hold.resolve(); await writing; await first.close(); await second.close();
    });
}

test('disconnect: individual deletion registers a durable delete lease and settles before queued login', async () => {
    const {createCredentialMutator} = await import('../lib/services/secrets.js');
    const f = fixture(), first = f.make('one'), second = f.make('two');
    await Promise.all([first.ready(), second.ready()]);
    const entered = deferred(), hold = deferred();
    let stored = 'synthetic-old';
    const deletionMutator = createCredentialMutator({gate: first, lookup: async () => stored, store: async () => {},
        erase: async () => { entered.resolve(); await hold.promise; stored = null; return true; }});
    const deleting = deletionMutator.clearSecret('codex', 'oauth-token', {ticket: await first.capture('codex')});
    await entered.promise;
    const issuedOperation = Object.values(f.state().leases)[0]?.operation;
    const loginMutator = createCredentialMutator({gate: second, lookup: async () => stored, erase: async () => true,
        store: async (_id, _kind, value) => { stored = value; }});
    const login = loginMutator.storeSecret('codex', 'oauth-token', 'synthetic-new', 'synthetic', {ticket: await second.capture('codex')});
    await delay(15); const whileDeleting = stored;
    hold.resolve(); await deleting; await login;
    assertEqual([issuedOperation, whileDeleting, stored], ['delete', 'synthetic-old', 'synthetic-new']);
    assertEqual(Object.keys(f.state().leases).length, 0);
    await first.close(); await second.close();
});

test('disconnect: a provider mutation wait times out without removing the accepted lease', async () => {
    const f = fixture(), first = f.make('one'), second = f.make('two');
    await Promise.all([first.ready(), second.ready()]);
    const entered = deferred(), hold = deferred();
    const writing = first.withCredentialWrite('codex', await first.capture('codex'), async () => { entered.resolve(); await hold.promise; });
    await entered.promise;
    const ticket = await second.capture('codex');
    let writes = 0;
    const result = await failure(() => second.withCredentialWrite('codex', ticket, async () => { writes++; }));
    assertEqual([result, writes, Object.keys(f.state().leases).length], ['credential-busy', 0, 1]);
    hold.resolve(); await writing; await first.close(); await second.close();
});

test('disconnect: exact connector removal fences old tickets while preserving siblings durably', async () => {
    const f = fixture(), writer = f.make('one'), remover = f.make('two'); await writer.ready(); await remover.ready();
    const ticket = await writer.capture('codex'), removed = [];
    const result = await remover.disconnect(deletion({removeCredential: async (provider, kind) => { removed.push([provider, kind]); return true; }}),
        {target: {id: 'codex--12345678-1234-4234-8234-123456789abc', provider: 'codex', kind: 'oauth-token'}});
    assertEqual(removed, [['codex--12345678-1234-4234-8234-123456789abc', 'oauth-token']]);
    assertEqual(result.credentials['command-code']['api-key'], 'preserved'); assertEqual(result.files.snapshots, 'pruned');
    assertEqual(await failure(() => writer.withCredentialWrite('codex', ticket, async () => {})), 'stale');
    await writer.capture('codex'); await writer.close(); await remover.close();
});

test('disconnect: failed exact target deletion retries while provider is blocked and preserves sibling scope', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready();
    const target = {id: 'codex--12345678-1234-4234-8234-123456789abc', provider: 'codex', kind: 'oauth-token'};
    const failed = await gate.disconnect(deletion({removeCredential: async () => false}), {target}); assertEqual(failed.phase, 'failed');
    assertEqual(await failure(() => gate.capture('codex')), 'blocked');
    const removed = []; const retried = await gate.disconnect(deletion({removeCredential: async (id, kind) => { removed.push([id, kind]); return true; }}), {target});
    assertEqual(retried.phase, 'complete'); assertEqual(removed, [[target.id, target.kind]]);
    assertEqual(retried.credentials['command-code']['api-key'], 'preserved'); await gate.capture('codex'); await gate.close();
});

test('disconnect: unresolved scoped deletion cannot be replaced by a different connector intent', async () => {
    const f = fixture(), gate = f.make('one'); await gate.ready();
    const target = {id: 'codex--12345678-1234-4234-8234-123456789abc', provider: 'codex', kind: 'oauth-token'};
    await gate.disconnect(deletion({removeCredential: async () => false}), {target});
    const previous = JSON.stringify(f.state().transaction); const epoch = f.state().epoch;
    for (const other of [{id: 'command-code', provider: 'command-code', kind: 'api-key'}, {...target, id: 'codex--12345678-1234-4234-8234-123456789abd'}]) {
        assertEqual(await failure(() => gate.disconnect(deletion(), {target: other})), 'unfinished-connector-removal');
        assertEqual(JSON.stringify(f.state().transaction), previous); assertEqual(f.state().epoch, epoch);
        assertEqual(await failure(() => gate.capture('codex')), 'blocked');
    }
    assertEqual((await gate.disconnect(deletion(), {target})).phase, 'complete'); await gate.capture('codex'); await gate.close();
});
