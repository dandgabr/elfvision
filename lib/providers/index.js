// Chooses the providers the extension runs: the real ones, or demo data.

import GLib from 'gi://GLib';

import {createHttp} from '../services/http.js';
import {API_KEY, OAUTH_TOKENS, lookupSecret, storeSecret} from '../services/secrets.js';
import {COMMAND_CODE_ID, createCommandCodeProvider} from './commandCode.js';
import {createLocalConfigCache} from '../services/localConfig.js';
import {createTokenManager, TokenError} from '../oauth/tokenManager.js';
import {decodeSecret, encodeSecret} from '../oauth/secret.js';
import {parseTokenReply, refreshRequest} from '../oauth/protocol.js';
import {ANTIGRAVITY_ID, createAntigravityProvider} from './antigravity.js';
import {CLAUDE_ID, createClaudeProvider} from './claude.js';
import {CODEX_ID, createCodexProvider} from './codex.js';
import {createDemoProviders} from './demo.js';
import {providerMeta} from './registry.js';
import {providerIdForConnector} from '../core/connectors.js';
import {getDisconnectGate} from '../services/disconnectGate.js';

/**
 * @param {{source: 'live'|'demo', scenario: string}} options
 * @returns {Array<import('../core/scheduler.js').Provider>} the demo providers, or none
 *   for live data: real providers are added one by one, as their accounts are connected
 */
export function createProviders({source, scenario}) {
    return source === 'demo' ? createDemoProviders(scenario) : [];
}

/**
 * @param {string} id - a provider of the registry that is available
 * @returns {import('../core/scheduler.js').Provider}
 */
export function createProvider(connectorId, {providerId = providerIdForConnector(connectorId), gate = getDisconnectGate(), ticket = null, deps = {}} = {}) {
    if (!providerId || providerIdForConnector(connectorId) !== providerId) throw new Error('invalid connector identity');
    const provider = createProviderRuntime(providerId, connectorId, {gate, ticket, deps});
    provider.id = connectorId;
    provider.providerId = providerId;
    return provider;
}

function createProviderRuntime(id, connectorId, {gate, ticket, deps}) {
    const captured = ticket ? Promise.resolve(ticket) : gate.capture(id);
    const assertCurrent = async () => { const current = await captured; await gate.assertCurrent(current); return current; };
    if (id === COMMAND_CODE_ID) {
        return createCommandCodeProvider({
            http: (deps.createHttp ?? createHttp)({allowedHosts: providerMeta(id).apiHosts}),
            // The shell never asks the user to unlock the keyring: a locked one is a failure.
            getKey: async () => { await assertCurrent(); const key = await (deps.lookupSecret ?? lookupSecret)(connectorId, API_KEY, {interactive: false}); await assertCurrent(); return key; },
        });
    }
    if (id === CODEX_ID)
        return createOAuthProvider(providerMeta(id), createCodexProvider, gate, captured, deps, connectorId);
    if (id === CLAUDE_ID)
        return createOAuthProvider(providerMeta(id), createClaudeProvider, gate, captured, deps, connectorId);
    if (id === ANTIGRAVITY_ID)
        return createOAuthProvider(providerMeta(id), createAntigravityProvider, gate, captured, deps, connectorId);
    throw new Error(`no runtime for provider "${id}"`);
}

/**
 * Whether a credential is stored for a provider. A keyring that cannot be read counts as
 * connected, so the provider shows up and says what is wrong.
 *
 * @param {import('./registry.js').ProviderMeta} meta
 * @returns {Promise<boolean>}
 */
export async function isConnected(meta, {gate = getDisconnectGate(), ticket = null, connectorId = meta.id} = {}) {
    if (providerIdForConnector(connectorId) !== meta.id) throw new Error('invalid connector identity');
    const current = ticket ?? await gate.capture(meta.id);
    await gate.assertCurrent(current);
    // A keyring that never answers must not leave the extension waiting for ever.
    let timer = 0;
    const silence = new Promise(resolve => {
        timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
            timer = 0;
            resolve(true);
            return GLib.SOURCE_REMOVE;
        });
    });
    try {
        const lookup = lookupSecret(connectorId, meta.auth === 'api-key' ? API_KEY : OAUTH_TOKENS, {interactive: false})
            .then(Boolean, () => true);
        const connected = await Promise.race([lookup, silence]);
        await gate.assertCurrent(current);
        return connected;
    } finally {
        if (timer)
            GLib.source_remove(timer);
    }
}

// Obtaining the cache performs no user I/O. Each provider awaits its asynchronous reads.
const configCache = createLocalConfigCache();

/**
 * An OAuth provider: its token manager works on the keyring and on the provider's token
 * endpoint, with the client id read from the user's local configuration when it renews.
 */
function createOAuthProvider(meta, create, gate, captured, deps, connectorId) {
    const {oauth} = meta;
    const d = {createHttp, lookupSecret, storeSecret, configCache, ...deps};
    let currentConfig = null, fetchContext = null, disposed = false;
    const assertFetching = context => {
        if (disposed || context?.isCancelled()) throw new TokenError('disconnected');
    };
    // Two clients with one host list each. The usage client is cancelled when the provider
    // stops (a screen lock stops everything). The renewal client is not: a renewal that was
    // cut off after the server had already issued the new refresh token would lose it, and the
    // user would have to sign in again. It finishes, writes to the keyring, and is done.
    const http = d.createHttp({allowedHosts: meta.apiHosts});
    const refreshHttp = d.createHttp({allowedHosts: oauth.authHosts});
    const tokens = createTokenManager({
        now: Date.now,
        captureTicket: () => captured,
        assertTicket: ticket => gate.assertCurrent(ticket),
        load: async () => {
            try {
                await gate.assertCurrent(await captured);
                return decodeSecret(await d.lookupSecret(connectorId, OAUTH_TOKENS, {interactive: false}));
            } catch (_error) {
                throw new TokenError('keyring');
            }
        },
        save: (tokens, ticket, expected) => d.storeSecret(connectorId, OAUTH_TOKENS, encodeSecret(tokens), `${meta.name} sign-in`, {gate, ticket, expected}),
        refreshCall: async refresh => {
            const context = fetchContext;
            const config = await d.configCache.get(meta.id);
            await gate.assertCurrent(await captured);
            assertFetching(context);
            if (!config)
                throw new TokenError('no_config');
            const request = refreshRequest(oauth, {clientId: config.clientId, clientSecret: config.clientSecret, refresh});
            const reply = await refreshHttp.request(oauth.tokenUrl, {method: 'POST', ...request, maxBytes: 64 * 1024});
            return parseTokenReply(reply, Date.now());
        },
    });
    const unguard = gate.registerCanceller(() => { tokens.reset(); refreshHttp.dispose(); });
    const usageTokens = {
        accessToken: async () => {
            const context = fetchContext;
            const access = await tokens.accessToken();
            // An accepted rotation still settles after disable, but its old usage request stops.
            assertFetching(context);
            return access;
        },
        invalidate: () => tokens.invalidate(),
    };
    const provider = create({http, tokens: usageTokens, userAgent: () => currentConfig?.userAgent ?? null});
    const fetch = provider.fetch.bind(provider);
    provider.fetch = async context => {
        currentConfig = await d.configCache.get(meta.id);
        await gate.assertCurrent(await captured);
        assertFetching(context);
        fetchContext = context;
        return fetch(context);
    };
    const dispose = provider.dispose?.bind(provider);
    provider.dispose = () => { disposed = true; dispose?.(); return tokens.whenIdle().finally(unguard); };
    return provider;
}
