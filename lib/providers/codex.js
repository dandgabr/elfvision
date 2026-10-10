// The Codex provider (docs/adr/0002, 0009): an OAuth access token, renewed by the token
// manager, sent as a bearer token to the usage endpoint of ChatGPT.

import {parseUsage} from '../core/codex.js';
import {createOAuthUsageProvider} from './oauthUsage.js';

export const CODEX_ID = 'codex';

/**
 * @param {{http: object, tokens: object}} deps
 * @returns {import('../core/scheduler.js').Provider}
 */
export function createCodexProvider({http, tokens, renewOnUnauthorized}) {
    return createOAuthUsageProvider({
        id: CODEX_ID,
        name: 'Codex',
        url: 'https://chatgpt.com/backend-api/wham/usage',
        parse: parseUsage,
        http,
        tokens,
        renewOnUnauthorized,
    });
}
