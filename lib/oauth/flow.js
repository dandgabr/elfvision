// An OAuth 2 sign-in with PKCE (docs/adr/0009), run by the preferences window:
// start the loopback server, send the browser to the provider, wait for the code
// and swap it for tokens. It returns the tokens; storing them is the caller's job.

import {CallbackError} from './callback.js';
import {startLoopback} from './loopback.js';
import {OAuthError, buildAuthUrl, codeExchangeBody, parseTokenReply} from './protocol.js';

const TOKEN_REPLY_LIMIT = 64 * 1024;

/**
 * @param {object} options
 * @param {object} options.spec - the provider's OAuth spec (registry)
 * @param {{clientId: string, clientSecret?: string, redirectPort: number, redirectHost?: string}} options.config
 *   from the local configuration file
 * @param {{request: Function}} options.http - restricted to the provider's hosts
 * @param {{verifier: () => string, challenge: (v: string) => string, state: () => string}} options.pkce
 * @param {(url: string) => void} options.openUri - opens the browser; may throw
 * @param {() => number} options.now
 * @param {{ok: string, failed: string}} options.messages - the pages the browser shows
 * @param {number} [options.timeoutSecs]
 * @param {(url: string) => void} [options.onBrowserFailed] - called with the address to copy
 *   when the browser could not be opened
 * @returns {{authUrl: string, cancel: () => void, done: Promise<{access: string, refresh: string, expiresAt: number, scope: string}>}}
 * @throws {Error} synchronously with code `port_busy` or `blocked_url`
 */
export function startLogin({spec, config, http, pkce, openUri, now, messages, timeoutSecs, onBrowserFailed = () => {}}) {
    const verifier = pkce.verifier();
    const state = pkce.state();
    const loopback = startLoopback({
        port: config.redirectPort,
        path: spec.redirectPath,
        redirectHost: config.redirectHost,
        state,
        timeoutSecs,
        messages,
    });
    let authUrl;
    try {
        authUrl = buildAuthUrl(spec, {
            clientId: config.clientId,
            redirectUri: loopback.redirectUri,
            challenge: pkce.challenge(verifier),
            state,
        });
    } catch (error) {
        loopback.cancel();
        loopback.result.catch(() => {});
        throw error;
    }

    // Cancel works at every step: before the callback, and while the code is being swapped.
    let cancelled = false;
    const stop = () => {
        cancelled = true;
        loopback.cancel();
    };
    const gone = () => new CallbackError('cancelled');

    const done = (async () => {
        try {
            openUri(authUrl);
        } catch (_error) {
            onBrowserFailed(authUrl);
        }
        const {code} = await loopback.result;
        if (cancelled)
            throw gone();
        const reply = await http.request(spec.tokenUrl, {
            method: 'POST',
            body: codeExchangeBody({
                clientId: config.clientId,
                clientSecret: config.clientSecret,
                code,
                redirectUri: loopback.redirectUri,
                verifier,
            }),
            maxBytes: TOKEN_REPLY_LIMIT,
            context: {isCancelled: () => cancelled},
        }).catch(error => {
            throw cancelled ? gone() : error;
        });
        if (cancelled)
            throw gone();
        const tokens = parseTokenReply(reply, now());
        // Without a refresh token the connection would end within the hour.
        if (!tokens.refresh)
            throw new OAuthError('no_refresh', reply.status);
        return tokens;
    })();
    return {authUrl, cancel: stop, done};
}
