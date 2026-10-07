// Chooses the providers the extension runs: the real ones, or demo data.

import {createHttp} from '../services/http.js';
import {API_KEY, lookupSecret} from '../services/secrets.js';
import {COMMAND_CODE_HOST, COMMAND_CODE_ID, createCommandCodeProvider} from './commandCode.js';
import {createDemoProviders} from './demo.js';

/** Ids of the real providers, in display order. */
export const LIVE_PROVIDER_IDS = [COMMAND_CODE_ID];

/**
 * @param {{source: 'live'|'demo', scenario: string}} options
 * @returns {Array<import('../core/scheduler.js').Provider>}
 */
export function createProviders({source, scenario}) {
    if (source === 'demo')
        return createDemoProviders(scenario);
    return [
        createCommandCodeProvider({
            http: createHttp({allowedHosts: [COMMAND_CODE_HOST]}),
            getKey: () => lookupSecret(COMMAND_CODE_ID, API_KEY),
        }),
    ];
}
