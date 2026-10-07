import {assertEqual, assertTrue, flush, test} from './harness.js';
import {OAuthError} from '../lib/oauth/protocol.js';
import {decodeSecret, encodeSecret} from '../lib/oauth/secret.js';
import {TokenError, createTokenManager} from '../lib/oauth/tokenManager.js';

const SECOND = 1000;
const HOUR = 3600 * SECOND;

/** An in-memory keyring and a scriptable token endpoint. */
function setup({stored = {gen: 'g1', access: 'a1', refresh: 'r1', expiresAt: 10 * HOUR, scope: ''}, now = 0, replies = []} = {}) {
    const state = {stored, now, refreshCalls: [], saves: [], saveFails: 0};
    const manager = createTokenManager({
        now: () => state.now,
        load: async () => (state.stored ? {...state.stored} : null),
        save: async tokens => {
            if (state.saveFails > 0) {
                state.saveFails--;
                throw new Error('keyring busy');
            }
            state.saves.push(tokens);
            state.stored = {...tokens};
        },
        refreshCall: async refresh => {
            state.refreshCalls.push(refresh);
            const next = replies.shift();
            if (typeof next === 'function')
                return next(state);
            if (next instanceof Error)
                throw next;
            return next;
        },
    });
    return {state, manager};
}

const reply = (access, refresh, expiresAt) => ({access, refresh, expiresAt, scope: ''});
const failure = async promise => {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
};

test('tokens: the secret round trips and anything malformed is nothing', () => {
    const tokens = {gen: 'g', access: 'a', refresh: 'r', expiresAt: 5, scope: 's'};
    assertEqual(decodeSecret(encodeSecret(tokens)), tokens);
    for (const bad of [null, '', 'x', '{}', '{"v":2}', JSON.stringify({v: 1, gen: 'g', access: 'a b', refresh: 'r', expiresAt: 1}),
        JSON.stringify({v: 1, gen: 'g', access: 'a', refresh: 'r', expiresAt: 'soon'}), 'x'.repeat(9000)])
        assertEqual([bad === null ? null : String(bad).slice(0, 12), decodeSecret(bad)], [bad === null ? null : String(bad).slice(0, 12), null]);
});

test('tokens: a token with time left is returned without calling the server', async () => {
    const {manager, state} = setup();
    assertEqual(await manager.accessToken(), 'a1');
    assertEqual(state.refreshCalls, []);
});

test('tokens: an expiring token is renewed, the rotated refresh token is saved', async () => {
    const {manager, state} = setup({now: 10 * HOUR - 30 * SECOND, replies: [reply('a2', 'r2', 20 * HOUR)]});
    assertEqual(await manager.accessToken(), 'a2');
    assertEqual(state.refreshCalls, ['r1']);
    assertEqual([state.stored.access, state.stored.refresh, state.stored.expiresAt, state.stored.gen], ['a2', 'r2', 20 * HOUR, 'g1']);
    // a server that does not rotate keeps the old refresh token
    state.now = 20 * HOUR;
    state.stored.expiresAt = 20 * HOUR;
    const {manager: second, state: other} = setup({stored: state.stored, now: 20 * HOUR, replies: [reply('a3', null, 30 * HOUR)]});
    assertEqual(await second.accessToken(), 'a3');
    assertEqual(other.stored.refresh, 'r2');
});

test('tokens: concurrent callers share one renewal', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const {manager, state} = setup({now: 10 * HOUR, replies: [async () => { await gate; return reply('a2', 'r2', 20 * HOUR); }]});
    const calls = [manager.accessToken(), manager.accessToken(), manager.accessToken()];
    await flush();
    release();
    assertEqual(await Promise.all(calls), ['a2', 'a2', 'a2']);
    assertEqual(state.refreshCalls.length, 1);
});

test('tokens: a new sign-in during the renewal wins and the old result is dropped', async () => {
    const {manager, state} = setup({now: 10 * HOUR, replies: [s => {
        s.stored = {gen: 'g2', access: 'b1', refresh: 'rb', expiresAt: 30 * HOUR, scope: ''};
        return reply('a2', 'r2', 20 * HOUR);
    }]});
    assertEqual(await manager.accessToken(), 'b1');
    assertEqual([state.stored.gen, state.stored.refresh, state.saves.length], ['g2', 'rb', 0]);
});

test('tokens: disconnecting during the renewal is not undone', async () => {
    const {manager, state} = setup({now: 10 * HOUR, replies: [s => { s.stored = null; return reply('a2', 'r2', 20 * HOUR); }]});
    assertEqual((await failure(manager.accessToken())).code, 'disconnected');
    assertEqual([state.stored, state.saves.length], [null, 0]);
});

test('tokens: a refused refresh token is expired, once, without a retry loop', async () => {
    const {manager, state} = setup({now: 10 * HOUR, replies: [new OAuthError('invalid_grant', 400), new OAuthError('invalid_grant', 400)]});
    const error = await failure(manager.accessToken());
    assertEqual([error instanceof TokenError, error.code, state.refreshCalls.length], [true, 'expired', 1]);
    // the user signed in again meanwhile: one more try with the new refresh token
    const {manager: second, state: other} = setup({now: 10 * HOUR, replies: [
        s => { s.stored = {gen: 'g2', access: 'b0', refresh: 'rb', expiresAt: 10 * HOUR, scope: ''}; throw new OAuthError('invalid_grant', 400); },
        reply('b1', 'rc', 20 * HOUR),
    ]});
    assertEqual(await second.accessToken(), 'b1');
    assertEqual(other.refreshCalls, ['r1', 'rb']);
});

test('tokens: a network failure or a server error does not mark the sign-in as lost', async () => {
    const {manager, state} = setup({now: 10 * HOUR, replies: [new Error('offline'), new OAuthError('temporarily_unavailable', 503), new OAuthError('unknown', 500)]});
    for (let i = 0; i < 3; i++)
        assertEqual((await failure(manager.accessToken())).code, 'network');
    assertEqual([state.stored.refresh, state.refreshCalls.length], ['r1', 3]);
});

test('tokens: not connected, and a failing keyring keeps the new pair in memory then asks to reconnect', async () => {
    assertEqual((await failure(setup({stored: null}).manager.accessToken())).code, 'not_connected');
    const {manager, state} = setup({now: 10 * HOUR, replies: [reply('a2', 'r2', 20 * HOUR)]});
    state.saveFails = 2;
    assertEqual(await manager.accessToken(), 'a2');      // saved nowhere yet, but usable
    assertEqual(state.saves.length, 0);
    assertEqual(await manager.accessToken(), 'a2');      // second failure
    assertEqual(await manager.accessToken(), 'a2');      // third attempt succeeds
    assertEqual([state.saves.length, state.stored.refresh], [1, 'r2']);

    const {manager: broken, state: gone} = setup({now: 10 * HOUR, replies: [reply('a2', 'r2', 20 * HOUR)]});
    gone.saveFails = 10;
    await broken.accessToken();
    await broken.accessToken();
    assertEqual((await failure(broken.accessToken())).code, 'reconnect');
});

test('tokens: invalidate forces a renewal even for a token that looks valid', async () => {
    const {manager, state} = setup({replies: [reply('a2', 'r2', 20 * HOUR)]});
    manager.invalidate();
    assertEqual(await manager.accessToken(), 'a2');
    assertEqual(state.refreshCalls, ['r1']);
    assertTrue(await manager.accessToken() === 'a2');
});
