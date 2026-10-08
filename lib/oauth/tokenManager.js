// Keeps an access token valid (docs/adr/0009). Only the shell renews tokens, one
// renewal at a time per provider. Refresh tokens rotate, so the rule that matters is:
// the new pair is written only if the keyring still holds the refresh token this
// renewal started from. If the user signed in again or disconnected meanwhile, the
// result is dropped. Pure JavaScript: the keyring and the network come in as
// functions, so the tests drive a fake clock and an in-memory store.

import {OAuthError} from './protocol.js';

/** Why no token could be given; the codes are what the provider reports upward. */
export const TOKEN_FAILURES = ['not_connected', 'expired', 'network', 'reconnect', 'disconnected', 'no_config', 'keyring'];

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
 * @param {(tokens: object, ticket: object, expected: object) => Promise<boolean|void>} deps.save
 * @param {(refresh: string) => Promise<{access: string, refresh: ?string, expiresAt: number, scope: string}>} deps.refreshCall
 *   rejects with an OAuthError (or anything else for a network failure)
 * @param {() => number} deps.now
 * @param {number} [deps.marginMs] - renew when less than this is left
 */
export function createTokenManager({load, save, refreshCall, now, marginMs = 120000,
    captureTicket = async () => null, assertTicket = async () => {}}) {
    let generation = 0;
    function disconnected(context) {
        if (pending?.context === context) {
            pending = null;
            saveFailures = 0;
        }
        throw new TokenError('disconnected');
    }
    async function check(context) {
        if (context.generation !== generation) disconnected(context);
        try { await assertTicket(context.ticket); } catch (_error) { disconnected(context); }
        if (context.generation !== generation) disconnected(context);
    }
    let inflight = null;
    let pending = null;       // a renewed pair that could not be written yet
    let saveFailures = 0;
    let forced = false;

    const fresh = tokens => tokens.expiresAt - now() > marginMs;

    /**
     * Write a renewed pair, but only if the keyring still holds the sign-in it was renewed
     * from: a new sign-in or a disconnect since then wins. A keyring that cannot be read or
     * written keeps the pair in memory for another try.
     */
    async function writePending() {
        const writing = pending;
        await check(writing.context);
        let current;
        try {
            current = await load();
        } catch (_error) {
            await check(writing.context);
            return countFailure();
        }
        await check(writing.context);
        if (!current || current.gen !== writing.tokens.gen || current.refresh !== writing.startedRefresh) {
            pending = null;      // disconnected or signed in again meanwhile: the old pair is of no use
            saveFailures = 0;
            return false;
        }
        try {
            const accepted = await save(writing.tokens, writing.context.ticket,
                {gen: writing.tokens.gen, refresh: writing.startedRefresh});
            if (accepted === false) {
                pending = null; saveFailures = 0;
                throw new TokenError('disconnected');
            }
            await check(writing.context);
            pending = null;
            saveFailures = 0;
        } catch (error) {
            await check(writing.context);
            if (error instanceof TokenError || ['stale', 'blocked'].includes(error?.code)) {
                pending = null; throw new TokenError('disconnected');
            }
            countFailure();
        }
        return null;
    }

    function countFailure() {
        if (++saveFailures >= MAX_SAVE_FAILURES) {
            pending = null;
            saveFailures = 0;
            throw new TokenError('reconnect');
        }
        return null;
    }

    async function renew(started, attempt, context) {
        await check(context);
        let result;
        try {
            result = await refreshCall(started.refresh);
        } catch (error) {
            await check(context);
            // The caller already said what is wrong (for instance a missing client id).
            if (error instanceof TokenError)
                throw error;
            // A 401 from the token endpoint means the same as a refused refresh token.
            if (error instanceof OAuthError && (REJECTED.includes(error.code) || error.status === 401)) {
                // Maybe the user signed in again while the call was running.
                let again;
                try {
                    again = await load();
                } catch (_loadError) {
                    await check(context);
                    throw new TokenError('keyring');
                }
                await check(context);
                if (again && again.refresh !== started.refresh && attempt === 0)
                    return fresh(again) ? again.access : renew(again, 1, context);
                throw new TokenError(again ? 'expired' : 'disconnected');
            }
            throw new TokenError('network');
        }

        await check(context);
        // The old refresh token is spent by now: keep the new pair before anything else can fail.
        pending = {
            context,
            startedRefresh: started.refresh,
            tokens: {
                ...started,
                access: result.access,
                // A server that does not rotate leaves the refresh token as it was.
                refresh: result.refresh ?? started.refresh,
                expiresAt: result.expiresAt,
                scope: result.scope || started.scope,
            },
        };
        let current;
        try {
            current = await load();
        } catch (_error) {
            await check(context);
            throw new TokenError('network');   // the pair stays in memory; the next call writes it
        }
        await check(context);
        if (!current)
            throw new TokenError('disconnected');
        if (current.gen !== started.gen || current.refresh !== started.refresh) {
            // A new sign-in replaced the one this renewal started from: use it, not ours.
            pending = null;
            return fresh(current) || attempt > 0 ? current.access : renew(current, 1, context);
        }
        const access = pending.tokens.access;
        if (await writePending() === false)
            throw new TokenError('disconnected');
        return access;
    }

    return {
        /**
         * @returns {Promise<string>} a valid access token
         * @throws {TokenError}
         */
        async accessToken() {
            if (inflight)
                return inflight;
            const operationGeneration = generation;
            inflight = (async () => {
                const context = {generation: operationGeneration, ticket: await captureTicket()};
                await check(context);
                if (pending) {
                    await writePending();
                    if (pending)
                        return pending.tokens.access;
                }
                let stored;
                try {
                    stored = await load();
                } catch (_error) {
                    await check(context);
                    throw new TokenError('keyring');
                }
                await check(context);
                if (!stored)
                    throw new TokenError('not_connected');
                if (!forced && fresh(stored))
                    return stored.access;
                forced = false;
                return renew(stored, 0, context);
            })().finally(() => {
                inflight = null;
            });
            return inflight;
        },

        reset() { generation++; pending = null; forced = false; },
        whenIdle() { return inflight?.catch(() => {}) ?? Promise.resolve(); },

        /** The server refused the access token (a 401): renew on the next call. */
        invalidate() {
            // A renewal already running will give a new token: forcing another one would spend
            // a second refresh token for nothing.
            if (!inflight)
                forced = true;
        },
    };
}
