// Keeps an access token valid (docs/adr/0009). Only the shell renews tokens, one
// renewal at a time per provider. Refresh tokens rotate, so the rule that matters is:
// the new pair is written only if the keyring still holds the refresh token this
// renewal started from. If the user signed in again or disconnected meanwhile, the
// result is dropped. Pure JavaScript: the keyring and the network come in as
// functions, so the tests drive a fake clock and an in-memory store.

import {OAuthError} from './protocol.js';

/** Why no token could be given; the codes are what the provider reports upward. */
export const TOKEN_FAILURES = ['not_connected', 'expired', 'network', 'reconnect', 'disconnected', 'no_config'];

export class TokenError extends Error {
    constructor(code) {
        super(code);
        this.name = 'TokenError';
        this.code = code;
    }
}

// The server said the refresh token is no good: asking again cannot help.
const REJECTED = [
    'invalid_grant', 'invalid_client', 'unauthorized_client', 'unsupported_grant_type',
    'refresh_token_expired', 'refresh_token_reused', 'refresh_token_invalidated',
];
const MAX_SAVE_FAILURES = 3;

/**
 * @param {object} deps
 * @param {() => Promise<?{gen: string, access: string, refresh: string, expiresAt: number, scope: string}>} deps.load
 *   the stored tokens, or null when not connected
 * @param {(tokens: object) => Promise<void>} deps.save
 * @param {(refresh: string) => Promise<{access: string, refresh: ?string, expiresAt: number, scope: string}>} deps.refreshCall
 *   rejects with an OAuthError (or anything else for a network failure)
 * @param {() => number} deps.now
 * @param {number} [deps.marginMs] - renew when less than this is left
 */
export function createTokenManager({load, save, refreshCall, now, marginMs = 120000}) {
    let inflight = null;
    let pending = null;       // a renewed pair that could not be written yet
    let saveFailures = 0;
    let forced = false;

    const fresh = tokens => tokens.expiresAt - now() > marginMs;

    async function writePending() {
        try {
            await save(pending);
            pending = null;
            saveFailures = 0;
        } catch (_error) {
            if (++saveFailures >= MAX_SAVE_FAILURES) {
                pending = null;
                saveFailures = 0;
                throw new TokenError('reconnect');
            }
        }
    }

    async function renew(started, attempt) {
        let result;
        try {
            result = await refreshCall(started.refresh);
        } catch (error) {
            // The caller already said what is wrong (for instance a missing client id).
            if (error instanceof TokenError)
                throw error;
            if (error instanceof OAuthError && REJECTED.includes(error.code)) {
                // Maybe the user signed in again while the call was running.
                const again = await load();
                if (again && again.refresh !== started.refresh && attempt === 0)
                    return fresh(again) ? again.access : renew(again, 1);
                throw new TokenError(again ? 'expired' : 'disconnected');
            }
            throw new TokenError('network');
        }

        const current = await load();
        if (!current)
            throw new TokenError('disconnected');
        if (current.gen !== started.gen || current.refresh !== started.refresh) {
            // A new sign-in replaced the one this renewal started from: use it, not ours.
            return fresh(current) || attempt > 0 ? current.access : renew(current, 1);
        }
        const next = {
            ...current,
            access: result.access,
            // A server that does not rotate leaves the refresh token as it was.
            refresh: result.refresh ?? current.refresh,
            expiresAt: result.expiresAt,
            scope: result.scope || current.scope,
        };
        pending = next;
        await writePending();
        return next.access;
    }

    return {
        /**
         * @returns {Promise<string>} a valid access token
         * @throws {TokenError}
         */
        async accessToken() {
            if (inflight)
                return inflight;
            inflight = (async () => {
                if (pending) {
                    await writePending();
                    if (pending)
                        return pending.access;
                }
                const stored = await load();
                if (!stored)
                    throw new TokenError('not_connected');
                if (!forced && fresh(stored))
                    return stored.access;
                forced = false;
                return renew(stored, 0);
            })().finally(() => {
                inflight = null;
            });
            return inflight;
        },

        /** The server refused the access token (a 401): renew on the next call. */
        invalidate() {
            forced = true;
        },
    };
}
