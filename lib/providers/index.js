// Chooses the providers the extension runs: the real ones, or demo data.

import {createHttp} from '../services/http.js';
import {API_KEY, OAUTH_TOKENS, lookupSecret, storeSecret} from '../services/secrets.js';
import {COMMAND_CODE_HOST, COMMAND_CODE_ID, createCommandCodeProvider} from './commandCode.js';
import {readLocalConfig} from '../services/localConfig.js';
import {createTokenManager, TokenError} from '../oauth/tokenManager.js';
import {decodeSecret, encodeSecret} from '../oauth/secret.js';
import {parseTokenReply, refreshRequest} from '../oauth/protocol.js';
import {CLAUDE_ID, createClaudeProvider} from './claude.js';
import {CODEX_ID, createCodexProvider} from './codex.js';
import {createDemoProviders} from './demo.js';
import {LIVE_PROVIDER_IDS, providerMeta} from './registry.js';

export {LIVE_PROVIDER_IDS};

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
            http: createHttp({allowedHosts: [COMMAND_CODE_HOST]}),
            // The shell never asks the user to unlock the keyring: a locked one is a failure.
            getKey: () => lookupSecret(COMMAND_CODE_ID, API_KEY, {interactive: false}),
        });
    }
    if (id === CODEX_ID)
        return createOAuthProvider(providerMeta(id), createCodexProvider);
    if (id === CLAUDE_ID)
        return createOAuthProvider(providerMeta(id), createClaudeProvider);
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
    try {
        return Boolean(await lookupSecret(meta.id, meta.auth === 'api-key' ? API_KEY : OAUTH_TOKENS, {interactive: false}));
    } catch (_error) {
        return true;
    }
}

/**
 * An OAuth provider: its token manager works on the keyring and on the provider's token
 * endpoint, with the client id read from the user's local configuration when it renews.
 */
function createOAuthProvider(meta, create) {
    const {oauth} = meta;
    const http = createHttp({allowedHosts: [...meta.apiHosts, ...oauth.authHosts]});
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
            const config = readLocalConfig().providers[meta.id];
            if (!config)
                throw new TokenError('no_config');
            const request = refreshRequest(oauth, {clientId: config.clientId, clientSecret: config.clientSecret, refresh});
            const reply = await http.request(oauth.tokenUrl, {method: 'POST', ...request, maxBytes: 64 * 1024});
            return parseTokenReply(reply, Date.now());
        },
    });
    return create({http, tokens});
}
