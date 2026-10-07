// The Codex provider (docs/adr/0002, 0009): an OAuth access token, renewed by the token
// manager, sent as a bearer token to the usage endpoint of ChatGPT.

import {TokenError} from '../oauth/tokenManager.js';
import {parseUsage} from '../core/codex.js';
import {ProviderError, oauthErrorForStatus} from './errors.js';

export const CODEX_ID = 'codex';
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const POLL_MS = 5 * 60 * 1000;

/** What each reason the token manager gives means for the card. */
function tokenFailure(error) {
    switch (error.code) {
    case 'network':
        return new ProviderError('network', 'cannot renew the sign-in right now');
    case 'no_config':
        return new ProviderError('auth_required', 'the client id is not configured', {reason: 'no_config'});
    case 'not_connected':
    case 'disconnected':
        return new ProviderError('auth_required', 'not connected');
    default:   // expired, reconnect
        return new ProviderError('auth_required', 'the sign-in expired', {reason: 'expired'});
    }
}

/**
 * @param {object} deps
 * @param {{get: Function}} deps.http
 * @param {{accessToken: () => Promise<string>, invalidate: () => void}} deps.tokens
 * @returns {import('../core/scheduler.js').Provider}
 */
export function createCodexProvider({http, tokens}) {
    const accessToken = async () => {
        try {
            return await tokens.accessToken();
        } catch (error) {
            throw error instanceof TokenError ? tokenFailure(error) : new ProviderError('network', 'cannot get a token');
        }
    };
    const ask = async (context, token) => http.get(USAGE_URL, {headers: {Authorization: `Bearer ${token}`}, context});

    return {
        dispose: () => http.dispose?.(),
        id: CODEX_ID,
        name: 'Codex',
        plan: '',
        intervalMs: POLL_MS,
        async fetch(context) {
            let reply = await ask(context, await accessToken());
            if (reply.status === 401) {
                // The token looked valid but was refused: renew once, then ask again.
                tokens.invalidate();
                reply = await ask(context, await accessToken());
            }
            const failure = oauthErrorForStatus(reply.status, reply.retryAfter);
            if (failure)
                throw failure;
            try {
                return parseUsage(reply.json);
            } catch (error) {
                throw new ProviderError(error.code ?? 'parse_error', error.message);
            }
        },
    };
}
