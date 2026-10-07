// The Antigravity provider (docs/adr/0002, 0009): a Google OAuth access token, renewed by
// the token manager, sent to the quota endpoint with a User-Agent that names the program the
// endpoint expects (it checks only that it contains `antigravity`).

import {parseQuota} from '../core/antigravity.js';
import {createOAuthUsageProvider} from './oauthUsage.js';

export const ANTIGRAVITY_ID = 'antigravity';

/** Says what it is: the product token the endpoint wants, then this extension. */
export const DEFAULT_USER_AGENT = 'antigravity/1.0 gnome-ai-quota';

/**
 * @param {{http: object, tokens: object, userAgent?: () => ?string}} deps - `userAgent` gives the
 *   one from the local configuration, if the user set one
 * @returns {import('../core/scheduler.js').Provider}
 */
export function createAntigravityProvider({http, tokens, userAgent = () => null}) {
    return createOAuthUsageProvider({
        id: ANTIGRAVITY_ID,
        name: 'Antigravity',
        url: 'https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary',
        method: 'POST',
        body: '{}',
        headers: () => ({'User-Agent': userAgent() || DEFAULT_USER_AGENT}),
        parse: parseQuota,
        http,
        tokens,
    });
}
