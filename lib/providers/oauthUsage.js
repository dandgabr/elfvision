// What the providers that sign in with OAuth and report usage with one GET have in common
// (docs/adr/0009): get an access token from the token manager, ask the usage endpoint, renew
// and ask once more after a 401, and turn every way it can go wrong into a provider failure.

import {TokenError} from '../oauth/tokenManager.js';
import {ProviderError, oauthErrorForStatus} from '../core/errors.js';

/** What each reason the token manager gives means for the card. */
function tokenFailure(error) {
    switch (error.code) {
    case 'network':
        return new ProviderError('network', 'cannot renew the sign-in right now');
    case 'keyring':
        // A locked keyring is fixed by the user and then polling resumes by itself.
        return new ProviderError('network', 'the keyring is not available', {reason: 'keyring'});
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
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.name
 * @param {string} options.url - the usage endpoint
 * @param {Object<string, string>|(() => Object<string, string>)} [options.headers] - extra request
 * headers, or a function that gives them for each request
 * @param {'GET'|'POST'} [options.method]
 * @param {string} [options.body] - for a POST, sent as JSON
 * @param {(body: *) => {metrics: object[], plan?: string}} options.parse - throws an error with
 *   code `provider_changed` for a reply with nothing usable
 * @param {{get: Function, dispose?: Function}} options.http
 * @param {{accessToken: () => Promise<string>, invalidate: () => void}} options.tokens
 * @param {number} [options.intervalMs]
 * @returns {import('../core/scheduler.js').Provider}
 */
export function createOAuthUsageProvider({id, name, url, headers = {}, method = 'GET', body = null, parse, http, tokens, intervalMs = 5 * 60 * 1000}) {
    const accessToken = async () => {
        try {
            return await tokens.accessToken();
        } catch (error) {
            throw error instanceof TokenError ? tokenFailure(error) : new ProviderError('network', 'cannot get a token');
        }
    };
    const extra = () => (typeof headers === 'function' ? headers() : headers);
    const ask = (context, token) => http.request(url, {
        method,
        ...(body === null ? {} : {body, contentType: 'application/json'}),
        headers: {...extra(), Authorization: `Bearer ${token}`},
        context,
    });

    // When a fresh token is refused as well, the cause is not an expired token: renewing on every
    // poll would only spend refresh tokens (which rotate). Wait before trying that again.
    const COOLDOWN_MS = 30 * 60 * 1000;
    let refusedUntil = 0;

    return {
        dispose: () => http.dispose?.(),
        id,
        name,
        plan: '',
        intervalMs,
        async fetch(context) {
            let reply = await ask(context, await accessToken());
            if (reply.status === 401 && Date.now() >= refusedUntil) {
                // The token looked valid but was refused: renew once, then ask again.
                tokens.invalidate();
                reply = await ask(context, await accessToken());
                if (reply.status === 401)
                    refusedUntil = Date.now() + COOLDOWN_MS;
            }
            const failure = oauthErrorForStatus(reply.status, reply.retryAfter);
            if (failure)
                throw failure;
            try {
                return parse(reply.json);
            } catch (error) {
                throw new ProviderError(error.code ?? 'parse_error', error.message);
            }
        },
    };
}
