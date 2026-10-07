// Chooses the providers the extension runs: the real ones, or demo data.

import {createHttp} from '../services/http.js';
import {API_KEY, OAUTH_TOKENS, lookupSecret} from '../services/secrets.js';
import {COMMAND_CODE_HOST, COMMAND_CODE_ID, createCommandCodeProvider} from './commandCode.js';
import {createDemoProviders} from './demo.js';
import {LIVE_PROVIDER_IDS} from './registry.js';

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
