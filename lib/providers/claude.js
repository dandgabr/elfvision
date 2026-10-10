// The Claude provider (docs/adr/0002, 0009): an OAuth access token, renewed by the token
// manager, sent as a bearer token to the usage endpoint, with the beta header it asks for.

import {parseUsage} from '../core/claude.js';
import {createOAuthUsageProvider} from './oauthUsage.js';

export const CLAUDE_ID = 'claude';

/**
 * @param {{http: object, tokens: object}} deps
 * @returns {import('../core/scheduler.js').Provider}
 */
export function createClaudeProvider({http, tokens, renewOnUnauthorized}) {
    return createOAuthUsageProvider({
        id: CLAUDE_ID,
        name: 'Claude',
        url: 'https://api.anthropic.com/api/oauth/usage',
        headers: {'anthropic-beta': 'oauth-2025-04-20'},
        parse: parseUsage,
        http,
        tokens,
        renewOnUnauthorized,
    });
}
