import GLib from 'gi://GLib';

import {assertEqual, assertTrue, flush, test} from './harness.js';
import {createLoginGate} from '../lib/core/firstUse.js';
import {helperCommand} from '../lib/prefs/oauthGroup.js';
import {providerMeta} from '../lib/providers/registry.js';
import {apiKeySubtitle, createApiKeyController} from '../lib/prefs/apiKeyController.js';
import {createOAuthController} from '../lib/prefs/oauthController.js';
import {oauthPrimary, oauthSubtitle} from '../lib/prefs/accountText.js';
import {encodeSecret} from '../lib/oauth/secret.js';

const _ = s => s;
const TOKENS = {access: 'a', refresh: 'r', expiresAt: Date.now() + 3600_000, scope: 's'};

function fakeSettings(initial = {}) {
    const values = {'terms-acknowledged': [], 'account-status': {}, ...initial};
    return {
        values,
        get_strv: key => [...(values[key] ?? [])],
        set_strv: (key, list) => { values[key] = [...list]; },
        get_value: key => ({deepUnpack: () => values[key]}),
    };
}

/** A controllable sign-in: the test settles it. */
function fakeLogin() {
    const login = {cancelled: 0, submitted: [], authUrl: 'https://auth.example/authorize?state=abc'};
    login.done = new Promise((resolve, reject) => { login.finish = resolve; login.fail = reject; });
    login.cancel = () => { login.cancelled++; login.fail(Object.assign(new Error('cancelled'), {code: 'cancelled'})); };
    login.submit = text => { login.submitted.push(text); };
    return login;
}

function setup({provider = 'claude', configured = true, secret = null, confirm = async () => true, settings = fakeSettings(), loginGate = null} = {}) {
    const meta = providerMeta(provider);
    const calls = {announced: [], stored: [], cleared: [], revoked: [], toasts: [], started: [], timers: {after: [], every: [], cancelled: []}};
    let stored = secret;
    const login = fakeLogin();
    const deps = {
        gate: null,
        lookupSecret: async () => { if (stored === 'ERROR') throw new Error('no keyring'); return stored; },
        storeSecret: async (id, kind, value) => { calls.stored.push([id, kind]); stored = value; },
        clearSecret: async id => { calls.cleared.push(id); stored = null; },
        announceChange: (_settings, id) => calls.announced.push(id),
        revoke: (m, s) => calls.revoked.push([m.id, s?.refresh]),
        readLocalConfig: () => (configured ? {providers: {[meta.id]: {clientId: 'client'}}, problems: []} : {providers: {}, problems: ['no file']}),
        createHttp: () => ({dispose() {}}),
        createPkce: () => ({}),
        randomBytes: n => new Uint8Array(n),
        startLogin: options => { calls.started.push(options.config.redirectPort); return login; },
        timers: {
            after: (s, fn) => { calls.timers.after.push([s, fn]); return 100 + calls.timers.after.length; },
            every: (s, fn) => { calls.timers.every.push([s, fn]); return 200 + calls.timers.every.length; },
            cancel: id => calls.timers.cancelled.push(id),
        },
    };
    const controller = createOAuthController({meta, settings, gettext: _, confirmTerms: confirm, toast: t => calls.toasts.push(t), loginGate, deps});
    return {controller, calls, login, settings, meta, setSecret: v => { stored = v; }};
}

test('oauth controller: it reads the keyring, and a keyring that is not there is said apart from not connected', async () => {
    const connected = setup({secret: encodeSecret({gen: 'g', ...TOKENS})});
    await connected.controller.refresh();
    assertEqual(connected.controller.snapshot().connected, true);
    const none = setup();
    await none.controller.refresh();
    assertEqual([none.controller.snapshot().connected, none.controller.snapshot().keyringDown], [false, false]);
    const broken = setup({secret: 'ERROR'});
    await broken.controller.refresh();
    assertEqual([broken.controller.snapshot().connected, broken.controller.snapshot().keyringDown], [false, true]);
});

test('oauth controller: the terms are asked once, and only the user\'s yes is written', async () => {
    const no = setup({confirm: async () => false});
    await no.controller.connect();
    assertEqual([no.calls.started.length, no.settings.values['terms-acknowledged']], [0, []]);

    const yes = setup();
    await yes.controller.connect();
    assertEqual(yes.settings.values['terms-acknowledged'], ['claude']);
    assertEqual(yes.calls.started.length, 1);
    yes.login.cancel();
    await flush();

    // Already acknowledged: no question, and nothing is written twice.
    let asked = 0;
    const again = setup({settings: fakeSettings({'terms-acknowledged': ['claude']}), confirm: async () => { asked++; return true; }});
    await again.controller.connect();
    assertEqual([asked, again.settings.values['terms-acknowledged']], [0, ['claude']]);
    again.login.cancel();
    await flush();

    // A provider without terms never asks.
    let askedCommand = 0;
    const plain = setup({provider: 'codex', confirm: async () => { askedCommand++; return true; }});
    await plain.controller.connect();
    assertEqual(askedCommand > 0, providerMeta('codex').terms !== null);
    plain.login.cancel();
    await flush();
});

test('oauth controller: one sign-in at a time, and it ends without leaving a timer or a port', async () => {
    const t = setup({settings: fakeSettings({'terms-acknowledged': ['claude']})});
    await t.controller.connect();
    await t.controller.connect();                      // a second press while busy
    assertEqual(t.calls.started.length, 1);
    assertEqual(t.controller.snapshot().busy, true);
    assertEqual([t.calls.timers.after.length, t.calls.timers.every.length], [1, 1]);
    t.controller.cancel();
    await flush();
    const state = t.controller.snapshot();
    assertEqual([state.busy, state.lastFailure, state.authUrl], [false, 'Sign-in cancelled. Nothing was saved.', '']);
    assertEqual(t.calls.timers.cancelled.length, 2);   // the countdown and the paste timer
});

test('oauth controller: a finished sign-in is stored, announced to the shell and shown as connected', async () => {
    const t = setup({settings: fakeSettings({'terms-acknowledged': ['claude']})});
    await t.controller.connect();
    t.login.finish(TOKENS);
    await flush(30);
    assertEqual(t.calls.stored, [['claude', 'oauth-token']]);
    assertEqual(t.calls.announced, ['claude']);
    assertTrue(t.calls.toasts.includes('Claude connected.'), t.calls.toasts.join('|'));
    const state = t.controller.snapshot();
    assertEqual([state.busy, state.connected, state.lastFailure], [false, true, '']);
});

test('oauth controller: a failure says why, plainly, and never blocks the next try', async () => {
    const t = setup({settings: fakeSettings({'terms-acknowledged': ['claude']})});
    await t.controller.connect();
    t.login.fail(Object.assign(new Error('x'), {code: 'timeout'}));
    await flush(30);
    assertEqual(t.controller.snapshot().lastFailure, 'Sign-in timed out. Nothing was saved.');
    assertEqual(t.controller.snapshot().busy, false);
});

test('oauth controller: a busy port falls back to the client\'s own port, once', async () => {
    const meta = providerMeta('codex');
    const fallback = meta.oauth.defaultRedirect.fallbackPort;
    const t = setup({provider: 'codex', settings: fakeSettings({'terms-acknowledged': ['codex']})});
    let attempts = 0;
    const deps = {
        gate: null,};
    // Rebuild with a start that refuses the first port.
    const calls = [];
    const controller = createOAuthController({
        meta, settings: fakeSettings({'terms-acknowledged': ['codex']}), gettext: _, confirmTerms: async () => true,
        deps: {gate: null,
            readLocalConfig: () => ({providers: {codex: {clientId: 'c'}}, problems: []}),
            lookupSecret: async () => null, createHttp: () => ({}), createPkce: () => ({}), randomBytes: n => new Uint8Array(n),
            timers: {after: () => 1, every: () => 2, cancel() {}},
            startLogin: options => {
                calls.push(options.config.redirectPort);
                attempts++;
                if (attempts === 1)
                    throw Object.assign(new Error('busy'), {code: 'port_busy'});
                return fakeLogin();
            },
        },
    });
    void deps; void t;
    await controller.connect();
    assertEqual(calls, [meta.oauth.defaultRedirect.port, fallback]);
    assertEqual(controller.snapshot().busy, true);
    controller.dispose();
});

test('oauth controller: without a client id nothing starts, and the state says what is missing', async () => {
    const t = setup({configured: false, settings: fakeSettings({'terms-acknowledged': ['claude']})});
    await t.controller.connect();
    assertEqual(t.calls.started.length, 0);
    const state = t.controller.snapshot();
    assertEqual([state.hasConfig, state.configProblem, state.busy], [false, 'no file', false]);
    assertEqual(oauthSubtitle(state, t.meta, _), 'The local configuration cannot be used: no file');
    assertEqual(oauthPrimary(state), 'connect');
});

test('oauth controller: a window that closes mid sign-in ends it, frees the port and goes quiet', async () => {
    const t = setup({settings: fakeSettings({'terms-acknowledged': ['claude']})});
    let changes = 0;
    t.controller.subscribe(() => changes++);
    await t.controller.connect();
    const before = changes;
    t.controller.dispose();
    await flush(30);
    assertEqual(t.login.cancelled, 1);
    assertEqual(t.calls.timers.cancelled.length, 2);
    assertEqual(changes, before);                      // nothing is drawn after the end
    await t.controller.connect();                      // and it never starts again
    assertEqual(t.calls.started.length, 1);
});

test('oauth controller: what is pasted is handed to the sign-in, and a refusal says so without keeping it', async () => {
    const t = setup({settings: fakeSettings({'terms-acknowledged': ['claude']})});
    await t.controller.connect();
    assertEqual(t.controller.submit('the-code'), true);
    assertEqual(t.login.submitted, ['the-code']);
    t.login.submit = () => { throw Object.assign(new Error('x'), {code: 'state_mismatch'}); };
    assertEqual(t.controller.submit('another'), false);
    assertTrue(t.calls.toasts.some(m => m.startsWith('That address belongs to another sign-in')), t.calls.toasts.join('|'));
    t.login.submit = () => { throw Object.assign(new Error('x'), {code: 'closed'}); };
    assertEqual(t.controller.submit('late'), true);    // the sign-in ended by itself: nothing to correct
    t.controller.cancel();
    await flush();
});

test('oauth controller: disconnecting deletes the sign-in first, tells the shell, then revokes', async () => {
    const t = setup({secret: encodeSecret({gen: 'g', ...TOKENS})});
    await t.controller.refresh();
    await t.controller.disconnect();
    await flush(30);
    assertEqual(t.calls.cleared, ['claude']);
    assertEqual(t.calls.announced, ['claude']);
    assertEqual(t.calls.revoked, [['claude', 'r']]);
    assertEqual(t.controller.snapshot().connected, false);
    assertTrue(t.calls.toasts.includes('Claude disconnected.'), t.calls.toasts.join('|'));
});

function apiSetup({secret = null, failStore = false} = {}) {
    const meta = providerMeta('command-code');
    const calls = {stored: [], announced: [], cleared: [], toasts: []};
    let stored = secret;
    const controller = createApiKeyController({
        meta, settings: fakeSettings(), gettext: _, toast: t => calls.toasts.push(t),
        deps: {gate: null,
            lookupSecret: async () => stored,
            storeSecret: async (id, kind, value) => { if (failStore) throw new Error('locked'); calls.stored.push([id, kind]); stored = value; },
            clearSecret: async id => { calls.cleared.push(id); stored = null; },
            announceChange: (_settings, id) => calls.announced.push(id),
        },
    });
    return {controller, calls};
}

test('api key controller: a key is checked, stored, announced, and never appears in a message', async () => {
    const t = apiSetup();
    const key = `user_${'a1b2c3d4'.repeat(6)}`;
    assertEqual(await t.controller.save('not a key'), 'invalid');
    assertEqual(t.calls.stored, []);
    assertEqual(await t.controller.save(`  ${key}  `), 'saved');
    assertEqual([t.calls.stored, t.calls.announced], [[['command-code', 'api-key']], ['command-code']]);
    await flush(30);
    assertEqual(t.controller.snapshot().hasKey, true);
    assertTrue(!t.calls.toasts.join('|').includes(key), 'no message carries the key');
    assertEqual(t.controller.snapshot().saving, false);
});

test('api key controller: a keyring that refuses the key is reported, and removing a key tells the shell', async () => {
    const refused = apiSetup({failStore: true});
    assertEqual(await refused.controller.save(`user_${'a1b2c3d4'.repeat(6)}`), 'keyring');
    assertTrue(refused.calls.toasts.includes('The keyring did not accept the key.'));
    assertEqual(refused.calls.announced, []);

    const t = apiSetup({secret: 'something'});
    await t.controller.refresh();
    assertEqual(t.controller.snapshot().hasKey, true);
    await t.controller.remove();
    await flush(30);
    assertEqual([t.calls.cleared, t.calls.announced, t.controller.snapshot().hasKey], [['command-code'], ['command-code'], false]);
});

test('oauth controller: leaving during the terms dialog prevents a late acceptance from starting login', async () => {
    let answer;
    const t = setup({confirm: () => new Promise(resolve => { answer = resolve; })});
    const pending = t.controller.connect();
    await flush();
    t.controller.cancel();
    answer(true);
    await pending;
    assertEqual(t.calls.started, []);
    assertEqual(t.settings.values['terms-acknowledged'], []);
});

test('oauth controller: repeated connect while terms are open asks only once', async () => {
    let answer;
    let asked = 0;
    const t = setup({confirm: () => { asked++; return new Promise(resolve => { answer = resolve; }); }});
    const pending = t.controller.connect();
    await flush();
    const repeated = t.controller.connect();
    assertEqual(asked, 1);
    answer(false);
    await Promise.all([pending, repeated]);
    assertEqual(t.calls.started, []);
});

test('oauth controller: cancellation after a reply resolves prevents a late credential write', async () => {
    const t = setup({settings: fakeSettings({'terms-acknowledged': ['claude']})});
    await t.controller.connect();
    t.login.finish(TOKENS);
    t.controller.cancel();
    await flush(30);
    assertEqual(t.calls.stored, []);
});

test('oauth controller: the browser failure exposes paste immediately', async () => {
    const t = setup({settings: fakeSettings({'terms-acknowledged': ['claude']})});
    const meta = t.meta;
    const login = fakeLogin();
    const controller = createOAuthController({meta, settings: t.settings, gettext: _, confirmTerms: async () => true,
        deps: {gate: null,
            readLocalConfig: () => ({providers: {claude: {clientId: 'c'}}, problems: []}),
            lookupSecret: async () => null, createHttp: () => ({}), createPkce: () => ({}),
            startLogin: options => { options.onBrowserFailed(); return login; },
            timers: {after: () => 1, every: () => 2, cancel() {}},
        }});
    await controller.connect();
    assertEqual(controller.snapshot().pasteVisible, true);
    controller.dispose();
    await flush();
});

test('oauth controller: an older keyring lookup cannot overwrite a newer one', async () => {
    const pending = [];
    const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings(), gettext: _, confirmTerms: async () => false,
        deps: {gate: null,lookupSecret: () => new Promise(resolve => pending.push(resolve))}});
    const old = controller.refresh();
    const latest = controller.refresh();
    pending[1](encodeSecret({gen: 'g', ...TOKENS}));
    await latest;
    pending[0](null);
    await old;
    assertEqual(controller.snapshot().connected, true);
});


test('oauth controller: shared gate prevents concurrent logins across providers and releases after cancel', async () => {
    const loginGate = createLoginGate();
    const first = setup({loginGate, settings: fakeSettings({'terms-acknowledged': ['claude']})});
    const second = setup({provider: 'codex', loginGate, settings: fakeSettings({'terms-acknowledged': ['codex']})});
    await first.controller.connect();
    await second.controller.connect();
    assertEqual(second.calls.started, []);
    assertTrue(second.calls.toasts.includes('Finish or cancel the other sign-in first.'));
    first.controller.cancel();
    await flush(30);
    await second.controller.connect();
    assertEqual(second.calls.started.length, 1);
    second.controller.dispose();
    await flush(30);
});

test('account helper: exact shell arguments survive spaces and quotes with no trailing newline', () => {
    const command = helperCommand("/tmp/a path/it's here", ['codex', 'claude']);
    const [ok, argv] = GLib.shell_parse_argv(command);
    assertTrue(ok);
    assertEqual(argv, ['python3', '-I', "/tmp/a path/it's here/tools/import-client-ids.py", 'codex', 'claude']);
    assertTrue(!command.includes('\n'));
});


test('api key controller: failed saving remains visible until successful retry without retaining the key', async () => {
    let fail = true;
    const key = `user_${'a1b2c3d4'.repeat(6)}`;
    const controller = createApiKeyController({meta: providerMeta('command-code'), settings: fakeSettings(), gettext: _,
        deps: {gate: null,lookupSecret: async () => null, storeSecret: async () => { if (fail) throw new Error(key); }, announceChange() {}}});
    await controller.save(key);
    await controller.refresh();
    const failed = controller.snapshot();
    assertEqual(failed.lastFailure, 'The keyring did not accept the key.');
    assertEqual(apiKeySubtitle(failed, _), 'The keyring did not accept the key.');
    assertTrue(!JSON.stringify(failed).includes(key));
    fail = false;
    await controller.save(key);
    assertEqual(controller.snapshot().lastFailure, '');
});

test('api key controller: newer lookup wins when an old success or failure arrives late', async () => {
    const pending = [];
    const controller = createApiKeyController({meta: providerMeta('command-code'), settings: fakeSettings(), gettext: _,
        deps: {gate: null,lookupSecret: () => new Promise((resolve, reject) => pending.push({resolve, reject}))}});
    const first = controller.refresh();
    const second = controller.refresh();
    pending[1].resolve('stored'); await second;
    pending[0].reject(new Error('old failure')); await first;
    assertEqual([controller.snapshot().hasKey, controller.snapshot().keyringDown], [true, false]);
    const third = controller.refresh();
    const fourth = controller.refresh();
    pending[3].resolve(null); await fourth;
    pending[2].resolve('old key'); await third;
    assertEqual([controller.snapshot().hasKey, controller.snapshot().keyringDown], [false, false]);
});

test('oauth controller: snapshots never read configuration and async recheck recovers the keyring', async () => {
    let reads = 0;
    let down = true;
    const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings(), gettext: _, confirmTerms: async () => false,
        deps: {gate: null,readLocalConfig: async () => { reads++; return {providers: {claude: {clientId: 'c'}}, problems: []}; },
            lookupSecret: async () => { if (down) throw new Error('locked'); return null; }}});
    controller.snapshot(); controller.snapshot();
    assertEqual(reads, 0);
    await controller.refresh();
    assertEqual([controller.snapshot().hasConfig, controller.snapshot().keyringDown], [true, true]);
    const before = reads;
    controller.snapshot(); controller.snapshot();
    assertEqual(reads, before);
    down = false;
    await controller.recheck();
    assertEqual([controller.snapshot().hasConfig, controller.snapshot().keyringDown], [true, false]);
});

test('oauth controller: stale async configuration cannot overwrite the latest recheck', async () => {
    const pending = [];
    const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings(), gettext: _, confirmTerms: async () => false,
        deps: {gate: null,readLocalConfig: () => new Promise(resolve => pending.push(resolve)), lookupSecret: async () => null}});
    const older = controller.recheck();
    const latest = controller.recheck();
    pending[1]({providers: {claude: {clientId: 'c'}}, problems: []}); await latest;
    pending[0]({providers: {}, problems: ['old failure']}); await older;
    assertEqual([controller.snapshot().hasConfig, controller.snapshot().configProblem], [true, '']);
    controller.dispose();
});

test('oauth controller: cancellation during async configuration cannot open consent or start login', async () => {
    let resolveConfig;
    let asked = 0;
    const gate = createLoginGate();
    const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings(), gettext: _, loginGate: gate,
        confirmTerms: async () => { asked++; return true; }, deps: {gate: null,readLocalConfig: () => new Promise(resolve => { resolveConfig = resolve; })}});
    const pending = controller.connect();
    controller.cancel();
    resolveConfig({providers: {claude: {clientId: 'c'}}, problems: []});
    await pending;
    assertEqual(asked, 0);
    assertEqual(gate.acquire('codex'), true);
});

for (const action of ['cancel', 'dispose']) {
    test(`oauth controller: ${action} after storage starts finishes exactly one write and announcement`, async () => {
        let resolveStore;
        let writes = 0;
        let announced = 0;
        let disposedHttp = 0;
        const login = fakeLogin();
        const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings({'terms-acknowledged': ['claude']}), gettext: _, confirmTerms: async () => true,
            deps: {gate: null,readLocalConfig: () => ({providers: {claude: {clientId: 'c'}}, problems: []}), lookupSecret: async () => null,
                createHttp: () => ({dispose() { disposedHttp++; }}), createPkce: () => ({}), randomBytes: n => new Uint8Array(n),
                startLogin: () => login, timers: {after: () => 1, every: () => 2, cancel() {}},
                storeSecret: () => { writes++; return new Promise(resolve => { resolveStore = resolve; }); }, announceChange() { announced++; }}});
        await controller.connect();
        login.finish(TOKENS);
        await flush();
        assertEqual(writes, 1);
        controller[action]();
        resolveStore();
        await flush(30);
        assertEqual([writes, announced, disposedHttp], [1, 1, 1]);
    });
}

test('oauth controller: each failed start and fallback owns a disposable HTTP client', async () => {
    let clients = 0;
    let disposedClients = 0;
    const controller = createOAuthController({meta: providerMeta('codex'), settings: fakeSettings({'terms-acknowledged': ['codex']}), gettext: _, confirmTerms: async () => true,
        deps: {gate: null,readLocalConfig: () => ({providers: {codex: {clientId: 'c'}}, problems: []}),
            createHttp: () => { clients++; return {dispose() { disposedClients++; }}; }, createPkce: () => ({}),
            startLogin: () => { throw Object.assign(new Error('busy'), {code: 'port_busy'}); }}});
    await controller.connect();
    assertEqual([clients, disposedClients], [2, 2]);
});


test('oauth controller: dispose during async configuration drops the late result and consent', async () => {
    let resolveConfig;
    let asked = 0;
    const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings(), gettext: _,
        confirmTerms: async () => { asked++; return true; }, deps: {gate: null,readLocalConfig: () => new Promise(resolve => { resolveConfig = resolve; })}});
    const pending = controller.connect();
    controller.dispose();
    resolveConfig({providers: {claude: {clientId: 'c'}}, problems: []});
    await pending;
    assertEqual([asked, controller.snapshot().hasConfig], [0, false]);
});

for (const outcome of ['success', 'failure', 'cancel']) {
    test(`oauth controller: HTTP client closes exactly once on ${outcome} before storage`, async () => {
        let disposedClients = 0;
        const login = fakeLogin();
        const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings({'terms-acknowledged': ['claude']}), gettext: _, confirmTerms: async () => true,
            deps: {gate: null,readLocalConfig: () => ({providers: {claude: {clientId: 'c'}}, problems: []}), lookupSecret: async () => null,
                storeSecret: async () => {}, announceChange() {}, createHttp: () => ({dispose() { disposedClients++; }}),
                createPkce: () => ({}), randomBytes: n => new Uint8Array(n), startLogin: () => login,
                timers: {after: () => 1, every: () => 2, cancel() {}}}});
        await controller.connect();
        if (outcome === 'success') login.finish(TOKENS);
        else if (outcome === 'failure') login.fail(new Error('provider failure'));
        else controller.cancel();
        await flush(30);
        controller.dispose();
        assertEqual(disposedClients, 1);
    });
}


test('oauth controller: disposal never starts another configuration or credential lookup', async () => {
    let configReads = 0;
    let credentialReads = 0;
    const login = fakeLogin();
    const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings({'terms-acknowledged': ['claude']}), gettext: _, confirmTerms: async () => true,
        deps: {gate: null,readLocalConfig: async () => { configReads++; return {providers: {claude: {clientId: 'c'}}, problems: []}; },
            lookupSecret: async () => { credentialReads++; return null; }, createHttp: () => ({dispose() {}}), createPkce: () => ({}),
            startLogin: () => login, timers: {after: () => 1, every: () => 2, cancel() {}}}});
    await controller.connect();
    controller.dispose();
    const before = [configReads, credentialReads];
    await controller.recheck();
    await flush(30);
    assertEqual([configReads, credentialReads], before);
});

test('oauth controller: token exchange completion closes HTTP before a pending keyring save', async () => {
    let resolveStore;
    let disposedClients = 0;
    const login = fakeLogin();
    const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings({'terms-acknowledged': ['claude']}), gettext: _, confirmTerms: async () => true,
        deps: {gate: null,readLocalConfig: () => ({providers: {claude: {clientId: 'c'}}, problems: []}), lookupSecret: async () => null,
            storeSecret: () => new Promise(resolve => { resolveStore = resolve; }), announceChange() {},
            createHttp: () => ({dispose() { disposedClients++; }}), createPkce: () => ({}), randomBytes: n => new Uint8Array(n),
            startLogin: () => login, timers: {after: () => 1, every: () => 2, cancel() {}}}});
    await controller.connect();
    login.finish(TOKENS);
    await flush();
    const closedBeforeStore = disposedClients;
    resolveStore();
    await flush(30);
    assertEqual(closedBeforeStore, 1);
});


test('api key controller: started save completes after disposal without starting a lookup or UI update', async () => {
    let resolveStore;
    let writes = 0;
    let lookups = 0;
    let announcements = 0;
    let changes = 0;
    const controller = createApiKeyController({meta: providerMeta('command-code'), settings: fakeSettings(), gettext: _,
        deps: {gate: null,storeSecret: () => { writes++; return new Promise(resolve => { resolveStore = resolve; }); },
            lookupSecret: async () => { lookups++; return null; }, announceChange() { announcements++; }}});
    controller.subscribe(() => { changes++; });
    const pending = controller.save(`user_${'a1b2c3d4'.repeat(6)}`);
    controller.dispose();
    const before = changes;
    resolveStore();
    assertEqual(await pending, 'saved');
    await controller.refresh();
    assertEqual([writes, announcements, lookups, changes], [1, 1, 0, before]);
});

for (const action of ['cancel', 'dispose']) {
    for (const boundary of ['terms', 'begin', 'store']) {
        test(`oauth controller: ${action} during gate assertion prevents late ${boundary}`, async () => {
            let release, enteredResolve;
            const entered = new Promise(resolve => { enteredResolve = resolve; });
            const hold = new Promise(resolve => { release = resolve; });
            let assertions = 0, starts = 0, stores = 0;
            const settings = fakeSettings(boundary === 'terms' ? {} : {'terms-acknowledged': ['claude']});
            const login = fakeLogin();
            const gate = {
                capture: async () => ({epoch: 'synthetic', provider: 'claude'}),
                assertCurrent: async () => {
                    assertions++;
                    if (assertions === (boundary === 'store' ? 2 : 1)) { enteredResolve(); await hold; }
                },
                subscribe: () => () => {}, registerCanceller: () => () => {}, isBlocked: () => false,
            };
            const controller = createOAuthController({meta: providerMeta('claude'), settings, gettext: _, confirmTerms: async () => true,
                deps: {gate, readLocalConfig: async () => ({providers: {claude: {clientId: 'synthetic'}}, problems: []}),
                    lookupSecret: async () => null, storeSecret: async () => { stores++; }, announceChange() {},
                    createHttp: () => ({dispose() {}}), createPkce: () => ({}), randomBytes: n => new Uint8Array(n),
                    startLogin: () => { starts++; return login; }, timers: {after: () => 1, every: () => 2, cancel() {}}}});
            const connecting = controller.connect();
            if (boundary === 'store') { await connecting; login.finish(TOKENS); }
            await entered;
            controller[action]();
            release(); await connecting; await flush(60);
            assertEqual(stores, 0, 'no storage may start after cancellation');
            assertEqual(starts, boundary === 'store' ? 1 : 0, 'no login may start after cancellation');
            if (boundary === 'terms') assertEqual(settings.values['terms-acknowledged'], [], 'late Yes must not acknowledge cancelled attempt');
            controller.dispose();
        });
    }
}

function replacementOAuthFixture() {
    let cancelFromGate, nextLogin = 0, timerId = 0, writes = 0, announcements = 0, resolveStore, rejectStore;
    const timers = new Map(), disposedClients = [0, 0];
    const logins = [fakeLogin(), fakeLogin()];
    logins.forEach((login, index) => {
        login.authUrl = `https://auth.example/synthetic-attempt-${index}`;
        // A backend can settle after cancellation; retain control over that reply.
        login.cancel = () => { login.cancelled++; };
    });
    const loginGate = createLoginGate();
    const gate = {capture: async () => ({epoch: 'synthetic', provider: 'claude'}), assertCurrent: async () => {},
        subscribe: () => () => {}, isBlocked: () => false,
        registerCanceller: fn => { cancelFromGate = fn; return () => {}; }};
    const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings({'terms-acknowledged': ['claude']}), gettext: _, confirmTerms: async () => true,
        loginGate, deps: {gate, readLocalConfig: async () => ({providers: {claude: {clientId: 'synthetic'}}, problems: []}), lookupSecret: async () => null,
            createHttp: () => { const index = nextLogin; return {dispose() { disposedClients[index]++; }}; }, createPkce: () => ({}), randomBytes: n => new Uint8Array(n),
            startLogin: () => logins[nextLogin++],
            storeSecret: () => { writes++; return new Promise((resolve, reject) => { resolveStore = resolve; rejectStore = reject; }); },
            announceChange: () => { announcements++; }, timers: {after: (_seconds, fn) => { timers.set(++timerId, fn); return timerId; },
                every: (_seconds, fn) => { timers.set(++timerId, fn); return timerId; }, cancel: id => timers.delete(id)}}});
    const assertReplacementLive = () => {
        const state = controller.snapshot();
        assertEqual([state.busy, state.authUrl, state.lastFailure], [true, logins[1].authUrl, '']);
        assertEqual(disposedClients, [1, 0], 'an old attempt must never close the new HTTP client');
        assertEqual([...timers.keys()], [3, 4], 'an old attempt must never cancel the new timers');
        assertEqual(loginGate.acquire('codex'), false, 'the replacement still owns the shared sign-in gate');
    };
    return {controller, logins, assertReplacementLive, cancelFromGate: () => cancelFromGate(),
        writes: () => writes, announcements: () => announcements,
        settleStore: accepted => accepted ? resolveStore() : rejectStore(new Error('synthetic rejected store'))};
}

for (const outcome of ['success', 'failure']) {
    test(`oauth controller: obsolete ${outcome} after gate cancellation cannot tear down a replacement attempt`, async () => {
        const t = replacementOAuthFixture();
        try {
            await t.controller.connect();
            t.cancelFromGate();
            await t.controller.connect();
            t.assertReplacementLive();
            if (outcome === 'success') t.logins[0].finish(TOKENS); else t.logins[0].fail(new Error('synthetic old failure'));
            await flush(60);
            t.assertReplacementLive();
            assertEqual([t.writes(), t.announcements()], [0, 0]);
        } finally { t.controller.dispose(); }
    });
}

for (const accepted of [true, false]) {
    test(`oauth controller: already issued store ${accepted ? 'success' : 'failure'} cannot clobber a replacement attempt`, async () => {
        const t = replacementOAuthFixture();
        try {
            await t.controller.connect();
            t.logins[0].finish(TOKENS);
            await flush(60);
            assertEqual(t.writes(), 1);
            t.cancelFromGate();
            await t.controller.connect();
            t.assertReplacementLive();
            t.settleStore(accepted);
            await flush(60);
            t.assertReplacementLive();
            assertEqual([t.writes(), t.announcements()], [1, accepted ? 1 : 0], 'issued storage still settles and announces once');
        } finally { t.controller.dispose(); }
    });
}

test('oauth controller: obsolete connecting failure cannot release a replacement consent/login reservation', async () => {
    let cancelFromGate, enteredResolve, rejectOld, releaseNew, captures = 0, assertions = 0, starts = 0;
    const entered = new Promise(resolve => { enteredResolve = resolve; });
    const oldAssertion = new Promise((_resolve, reject) => { rejectOld = reject; });
    const newCapture = new Promise(resolve => { releaseNew = resolve; });
    const gate = {capture: async () => ++captures === 2 ? newCapture : {epoch: 'synthetic'},
        assertCurrent: async () => { if (++assertions === 1) { enteredResolve(); await oldAssertion; } },
        registerCanceller: fn => { cancelFromGate = fn; return () => {}; }, subscribe: () => () => {}, isBlocked: () => false};
    const loginGate = createLoginGate(), login = fakeLogin();
    const controller = createOAuthController({meta: providerMeta('claude'), settings: fakeSettings({'terms-acknowledged': ['claude']}), gettext: _, confirmTerms: async () => true,
        loginGate, deps: {gate, readLocalConfig: async () => ({providers: {claude: {clientId: 'synthetic'}}, problems: []}), lookupSecret: async () => null,
            createHttp: () => ({dispose() {}}), createPkce: () => ({}), startLogin: () => { starts++; return login; },
            timers: {after: () => 1, every: () => 2, cancel() {}}}});
    try {
        const old = controller.connect();
        await entered;
        cancelFromGate();
        const replacement = controller.connect();
        await flush();
        rejectOld(new Error('synthetic obsolete assertion'));
        await old;
        await controller.connect();
        assertEqual(captures, 2, 'the replacement still owns confirmation and the shared gate');
        releaseNew({epoch: 'synthetic-new'});
        await replacement;
        const state = controller.snapshot();
        assertEqual([starts, state.busy, state.lastFailure], [1, true, '']);
        assertEqual(loginGate.acquire('codex'), false);
    } finally { controller.dispose(); }
});
