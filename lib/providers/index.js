// Chooses the providers the extension runs: the real ones, or demo data.

import GLib from 'gi://GLib';

import {createHttp} from '../services/http.js';
import {API_KEY, OAUTH_TOKENS, lookupSecret, storeSecret} from '../services/secrets.js';
import {COMMAND_CODE_ID, createCommandCodeProvider} from './commandCode.js';
import {readLocalConfig} from '../services/localConfig.js';
import {createTokenManager, TokenError} from '../oauth/tokenManager.js';
import {decodeSecret, encodeSecret} from '../oauth/secret.js';
import {parseTokenReply, refreshRequest} from '../oauth/protocol.js';
import {ANTIGRAVITY_ID, createAntigravityProvider} from './antigravity.js';
import {CLAUDE_ID, createClaudeProvider} from './claude.js';
import {CODEX_ID, createCodexProvider} from './codex.js';
import {createDemoProviders} from './demo.js';
import {providerMeta} from './registry.js';

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
export function createProvider(id) {
    if (id === COMMAND_CODE_ID) {
        return createCommandCodeProvider({
            http: createHttp({allowedHosts: providerMeta(id).apiHosts}),
            // The shell never asks the user to unlock the keyring: a locked one is a failure.
            getKey: () => lookupSecret(COMMAND_CODE_ID, API_KEY, {interactive: false}),
        });
    }
    if (id === CODEX_ID)
        return createOAuthProvider(providerMeta(id), createCodexProvider);
    if (id === CLAUDE_ID)
        return createOAuthProvider(providerMeta(id), createClaudeProvider);
    if (id === ANTIGRAVITY_ID) {
        return createOAuthProvider(providerMeta(id), deps => createAntigravityProvider({
            ...deps,
            userAgent: () => localConfigFor(ANTIGRAVITY_ID)?.userAgent ?? null,
        }));
    }
    throw new Error(`no runtime for provider "${id}"`);
}

/**
 * Whether a credential is stored for a provider. A keyring that cannot be read counts as
 * connected, so the provider shows up and says what is wrong.
 *
 * @param {import('./registry.js').ProviderMeta} meta
 * @returns {Promise<boolean>}
 */
export async function isConnected(meta) {
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
        const lookup = lookupSecret(meta.id, meta.auth === 'api-key' ? API_KEY : OAUTH_TOKENS, {interactive: false})
            .then(Boolean, () => true);
        return await Promise.race([lookup, silence]);
    } finally {
        if (timer)
            GLib.source_remove(timer);
    }
}

const CONFIG_TTL_MS = 60 * 1000;
let configRead = {at: -Infinity, providers: {}};

/**
 * The local configuration of one provider. The file is small, but it is read in the shell's
 * main loop, and the Antigravity User-Agent is asked for at every request: keep what was
 * read for a minute.
 */
function localConfigFor(id) {
    if (Date.now() - configRead.at > CONFIG_TTL_MS)
        configRead = {at: Date.now(), providers: readLocalConfig().providers};
    return configRead.providers[id];
}

/**
 * An OAuth provider: its token manager works on the keyring and on the provider's token
 * endpoint, with the client id read from the user's local configuration when it renews.
 */
function createOAuthProvider(meta, create) {
    const {oauth} = meta;
    // Two clients with one host list each. The usage client is cancelled when the provider
    // stops (a screen lock stops everything). The renewal client is not: a renewal that was
    // cut off after the server had already issued the new refresh token would lose it, and the
    // user would have to sign in again. It finishes, writes to the keyring, and is done.
    const http = createHttp({allowedHosts: meta.apiHosts});
    const refreshHttp = createHttp({allowedHosts: oauth.authHosts});
    const tokens = createTokenManager({
        now: Date.now,
        load: async () => {
            try {
                return decodeSecret(await lookupSecret(meta.id, OAUTH_TOKENS, {interactive: false}));
            } catch (_error) {
                throw new TokenError('keyring');
            }
        },
        save: tokens => storeSecret(meta.id, OAUTH_TOKENS, encodeSecret(tokens), `${meta.name} sign-in`),
        refreshCall: async refresh => {
            const config = localConfigFor(meta.id);
            if (!config)
                throw new TokenError('no_config');
            const request = refreshRequest(oauth, {clientId: config.clientId, clientSecret: config.clientSecret, refresh});
            const reply = await refreshHttp.request(oauth.tokenUrl, {method: 'POST', ...request, maxBytes: 64 * 1024});
            return parseTokenReply(reply, Date.now());
        },
    });
    return create({http, tokens});
}
