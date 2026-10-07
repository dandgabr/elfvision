// The state and the actions of one OAuth provider's account in the preferences process
// (docs/adr/0009, 0010): what the keyring holds, the sign-in in progress, the terms notice, the
// paste fallback and the disconnect. It draws nothing: the Accounts page and the first-use assistant
// are two views over the same controller, so there is one sign-in implementation, one sign-in at a
// time per provider and one place to review.
//
// Everything outside this file is injected through `deps`, so the tests drive it with fakes and no
// keyring, no port and no browser.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {startLogin} from '../oauth/flow.js';
import {randomBytes, sha256} from '../oauth/crypto.js';
import {createPkce, base64Url} from '../oauth/pkce.js';
import {formBody} from '../oauth/protocol.js';
import {decodeSecret, encodeSecret} from '../oauth/secret.js';
import {createHttp} from '../services/http.js';
import {readLocalConfigAsync} from '../services/localConfig.js';
import {OAUTH_TOKENS, clearSecret, lookupSecret, storeSecret} from '../services/secrets.js';
import {fmt} from '../core/viewmodel.js';
import {announceChange} from './status.js';

// A browser seen for the first time, a password manager and a second factor take a while.
export const LOGIN_SECONDS = 300;
// The paste field waits a little: most sign-ins end by themselves.
const PASTE_AFTER_SECONDS = 20;

/** The fixed reasons a sign-in did not finish, in words. */
export function failureText(error, _, port) {
    switch (error?.code) {
    case 'port_busy':
        return port
            ? fmt(_('The sign-in did not start: port %d is in use by another program. Close it and try again.'), port)
            : _('The sign-in did not start: no local port could be opened.');
    case 'timeout':
        return _('Sign-in timed out. Nothing was saved.');
    case 'denied':
        return _('Sign-in was cancelled. Nothing was saved.');
    case 'malformed':
    case 'state_mismatch':
    case 'no_code':
        return _('The sign-in reply was not valid. Nothing was saved.');
    case 'blocked_url':
        return _('The sign-in address was not allowed. Nothing was saved.');
    default:
        return error?.name === 'OAuthError'
            ? _('The provider did not accept the sign-in. Nothing was saved.')
            : _('Sign-in failed. Nothing was saved.');
    }
}

const glibTimers = {
    every: (seconds, fn) => GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, fn),
    after: (seconds, fn) => GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
        fn();
        return GLib.SOURCE_REMOVE;
    }),
    cancel: id => GLib.source_remove(id),
};

/**
 * Ask the provider to revoke the refresh token (RFC 7009). Best effort and short: the sign-in is
 * already deleted from the keyring, whatever happens here.
 */
export async function revoke(meta, secret, deps = {}) {
    try {
        const local = (await (deps.readLocalConfig ?? readLocalConfigAsync)()).providers[meta.id];
        if (!local || !secret || !meta.oauth.revokeUrl)
            return;
        const http = (deps.createHttp ?? createHttp)({allowedHosts: meta.oauth.authHosts, timeoutSecs: 5});
        try {
            await http.request(meta.oauth.revokeUrl, {
                method: 'POST',
                body: formBody({token: secret.refresh, token_type_hint: 'refresh_token', client_id: local.clientId, client_secret: local.clientSecret}),
            });
        } finally {
            http.dispose();
        }
    } catch (_error) {
        // Nothing to report: the credential is removed locally in any case.
    }
}

/**
 * @param {object} options
 * @param {import('../providers/registry.js').ProviderMeta} options.meta
 * @param {Gio.Settings} options.settings
 * @param {(msgid: string) => string} options.gettext
 * @param {(meta: object) => Promise<boolean>} options.confirmTerms - asks the user; true to go on
 * @param {(text: string) => void} [options.toast]
 * @param {object} [options.deps] - replacements for everything that touches the system
 */
export function createOAuthController({meta, settings, gettext: _, confirmTerms, toast = () => {}, loginGate = null, deps = {}}) {
    const d = {
        lookupSecret, storeSecret, clearSecret, startLogin, createHttp, announceChange, revoke,
        randomBytes, sha256, createPkce, timers: glibTimers, now: Date.now,
        readLocalConfig: readLocalConfigAsync,
        openUri: url => Gio.AppInfo.launch_default_for_uri(url, null),
        ...deps,
    };
    const listeners = new Set();
    const state = {
        connected: null,        // null until the keyring answered
        keyringDown: false,
        busy: false,            // a sign-in is in progress
        removing: false,
        lastFailure: '',        // why the last sign-in did not finish, until the next one starts
        secondsLeft: 0,
        authUrl: '',
        pasteVisible: false,
    };
    let login = null;
    let countdown = 0;
    let pasteTimer = 0;
    let disposed = false;
    let refreshGeneration = 0;
    let attempt = 0;
    let confirming = false;
    let retainedConfig = {providers: {}, problems: []};
    let configGeneration = 0;
    let disposeHttp = () => {};

    const config = () => retainedConfig.providers[meta.id];
    async function refreshConfig() {
        if (disposed)
            return;
        const generation = ++configGeneration;
        let result;
        try {
            result = await d.readLocalConfig();
        } catch (_error) {
            result = {providers: {}, problems: ['the file cannot be read']};
        }
        if (!disposed && generation === configGeneration) {
            retainedConfig = result;
            emit();
        }
    }
    const emit = () => {
        if (disposed)
            return;
        for (const listener of [...listeners])
            listener();
    };
    const say = title => {
        if (!disposed)
            toast(title);
    };
    const stopTimers = () => {
        for (const source of [countdown, pasteTimer]) {
            if (source)
                d.timers.cancel(source);
        }
        countdown = 0;
        pasteTimer = 0;
    };

    function refresh() {
        if (disposed)
            return Promise.resolve();
        const configuration = refreshConfig();
        const generation = ++refreshGeneration;
        const credentials = d.lookupSecret(meta.id, OAUTH_TOKENS).then(text => {
            if (disposed || generation !== refreshGeneration)
                return;
            state.connected = decodeSecret(text) !== null;
            state.keyringDown = false;
        }).catch(() => {
            if (disposed || generation !== refreshGeneration)
                return;
            state.connected = false;
            state.keyringDown = true;
        }).finally(emit);
        return Promise.all([configuration, credentials]);
    }

    function finishLogin() {
        disposeHttp();
        stopTimers();
        login = null;
        loginGate?.release(meta.id);
        state.busy = false;
        state.authUrl = '';
        state.pasteVisible = false;
        return refresh();
    }

    function begin(generation) {
        const local = config();
        if (!local) {
            emit();
            return;
        }
        state.lastFailure = '';
        const redirect = {host: local.redirectHost ?? meta.oauth.defaultRedirect.host,
            port: local.redirectPort ?? meta.oauth.defaultRedirect.port};
        const messages = {
            ok: _('You can close this tab and go back to Preferences.'),
            failed: _('Sign-in did not finish. You can close this tab.'),
        };
        const options = port => ({
            spec: meta.oauth,
            config: {clientId: local.clientId, clientSecret: local.clientSecret, redirectPort: port, redirectHost: redirect.host},
            http: null,
            pkce: d.createPkce({randomBytes: d.randomBytes, sha256: d.sha256}),
            openUri: d.openUri,
            now: d.now,
            messages,
            timeoutSecs: LOGIN_SECONDS,
            onBrowserFailed: () => {
                say(_("Couldn't open the browser. Copy the link and open it yourself."));
                state.pasteVisible = true;
                emit();
            },
        });
        const start = port => {
            const opts = options(port);
            const http = d.createHttp({allowedHosts: meta.oauth.authHosts});
            opts.http = http;
            let closed = false;
            disposeHttp = () => {
                if (!closed) { closed = true; http.dispose?.(); }
            };
            try {
                return d.startLogin(opts);
            } catch (error) {
                disposeHttp();
                throw error;
            }
        };
        let port = redirect.port;
        let started;
        try {
            try {
                started = start(port);
            } catch (error) {
                // The client's own fallback port, when the first one is taken.
                const fallback = meta.oauth.defaultRedirect.fallbackPort;
                if (error.code !== 'port_busy' || !fallback || local.redirectPort !== undefined)
                    throw error;
                port = fallback;
                started = start(port);
            }
        } catch (error) {
            state.lastFailure = failureText(error, _, port);
            loginGate?.release(meta.id);
            emit();
            return;
        }

        login = started;
        state.busy = true;
        state.authUrl = started.authUrl;
        // onBrowserFailed may already have made the paste field visible.
        pasteTimer = d.timers.after(PASTE_AFTER_SECONDS, () => {
            pasteTimer = 0;
            state.pasteVisible = login !== null;
            emit();
        });
        let left = LOGIN_SECONDS;
        const tick = () => {
            state.secondsLeft = left;
            emit();
            if (left-- > 0)
                return GLib.SOURCE_CONTINUE;
            countdown = 0;      // the source ends itself: it must not be cancelled again
            return GLib.SOURCE_REMOVE;
        };
        tick();
        countdown = d.timers.every(1, tick);

        started.done.then(tokens => {
            disposeHttp();
            if (disposed || generation !== attempt)
                return;
            const secret = encodeSecret({gen: base64Url(d.randomBytes(16)), ...tokens});
            return d.storeSecret(meta.id, OAUTH_TOKENS, secret, `${meta.name} sign-in`).then(() => {
                // The extension is told first: the toast needs a window, the shell does not.
                d.announceChange(settings, meta.id);
                say(fmt(_('%s connected.'), meta.name));
            }, () => {
                state.lastFailure = _('The keyring did not accept the sign-in.');
            });
        }).catch(error => {
            state.lastFailure = error?.code === 'cancelled'
                ? _('Sign-in cancelled. Nothing was saved.')
                : failureText(error, _, port);
        }).finally(finishLogin);
    }

    return {
        /** What the views draw: a copy, with what is derived from the local configuration. */
        snapshot() {
            const local = config();
            const problems = local ? [] : retainedConfig.problems;
            return {
                ...state,
                hasConfig: !!local,
                configProblem: problems[0] ?? '',
                result: settings.get_value('account-status').deepUnpack()[meta.id],
            };
        },

        /** @param {() => void} fn - called after every change of state; returns an unsubscribe */
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },

        refresh,

        /** Look at the local configuration again (the helper writes it from a terminal). */
        recheck: refresh,

        /**
         * Start a sign-in. The terms notice comes first, once per provider: the user's answer is the
         * only thing that writes `terms-acknowledged`.
         */
        async connect() {
            if (state.busy || confirming || disposed || state.removing)
                return;
            if (loginGate && !loginGate.acquire(meta.id)) {
                say(_('Finish or cancel the other sign-in first.'));
                return;
            }
            const generation = ++attempt;
            confirming = true;
            try {
                await refreshConfig();
                if (disposed || generation !== attempt || !config())
                    return;
                if (meta.terms && !settings.get_strv('terms-acknowledged').includes(meta.id)) {
                    const accepted = await confirmTerms(meta);
                    if (!accepted || disposed || generation !== attempt)
                        return;
                    const now = settings.get_strv('terms-acknowledged');
                    if (!now.includes(meta.id))
                        settings.set_strv('terms-acknowledged', [...now, meta.id]);
                }
                if (!disposed && generation === attempt)
                    begin(generation);
            } finally {
                confirming = false;
                if (!state.busy)
                    loginGate?.release(meta.id);
            }
        },

        cancel() {
            attempt++;
            login?.cancel();
            disposeHttp();
            if (!login)
                loginGate?.release(meta.id);
        },

        /**
         * The address or the code the user pasted.
         *
         * @returns {boolean} false when it was refused (a message was shown), true when it was
         *   taken or the sign-in had just ended by itself
         */
        submit(text) {
            try {
                login?.submit(text);
                return true;
            } catch (error) {
                if (error?.code === 'closed')
                    return true;
                say(error?.code === 'state_mismatch'
                    ? _('That address belongs to another sign-in. Start again from this window.')
                    : error?.code === 'denied'
                        ? _('The sign-in was refused in the browser.')
                        : _('That is not the address or the code. Copy the full address from the browser bar, or the code shown on the page.'));
                return false;
            }
        },

        /** Delete the sign-in (the view has already asked). The refresh token is revoked best effort. */
        async disconnect() {
            if (state.removing)
                return;
            state.removing = true;
            emit();
            try {
                // Read the refresh token, delete the sign-in first (so the shell cannot write it
                // back), tell the extension, then ask the provider to revoke it: best effort.
                const secret = decodeSecret(await d.lookupSecret(meta.id, OAUTH_TOKENS));
                await d.clearSecret(meta.id, OAUTH_TOKENS);
                d.announceChange(settings, meta.id);
                say(fmt(_('%s disconnected.'), meta.name));
                d.revoke(meta, secret);
            } catch (_error) {
                say(_('The keyring is not available.'));
            } finally {
                state.removing = false;
                refresh();
            }
        },

        /** The window closed, or the view went away: end a sign-in, free the port, stop the timers. */
        dispose() {
            if (disposed)
                return;
            attempt++;
            login?.cancel();
            disposeHttp();
            loginGate?.release(meta.id);
            stopTimers();
            disposed = true;
            retainedConfig = {providers: {}, problems: []};
            listeners.clear();
        },
    };
}
