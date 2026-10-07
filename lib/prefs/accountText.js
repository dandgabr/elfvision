// The words that say how an account is doing, shared by the Accounts page and the first-use assistant.
// Pure of widgets: it takes what a controller's `snapshot()` returns.

import {fmt} from '../core/viewmodel.js';

/**
 * @param {object} state - an OAuth controller's snapshot
 * @param {{name: string}} meta
 * @param {(msgid: string) => string} _
 * @param {{formatPath?: (path: string) => string}} [options]
 * @returns {string}
 */
export function oauthSubtitle(state, meta, _) {
    if (state.busy) {
        const left = state.secondsLeft;
        return fmt(_('Finish signing in using your browser. %d:%02d left.'), Math.floor(left / 60), left % 60);
    }
    if (state.keyringDown)
        return _('No keyring found. Unlock it in Passwords and Keys, or install a Secret Service provider.');
    if (!state.connected) {
        if (state.lastFailure)
            return state.lastFailure;
        if (state.hasConfig)
            return _('Not connected.');
        return state.configProblem
            ? fmt(_('The local configuration cannot be used: %s'), state.configProblem)
            : fmt(_('%s is not set up yet. Press "Copy command", run it in a terminal, then come back.'), meta.name);
    }
    return {
        ok: _('Connected.'),
        expired: _('The sign-in expired. Reconnect to keep seeing this quota.'),
        refused: _('The provider refused access. Check your account on its site.'),
        keyring: _('Connected. The keyring is locked, so it was not checked.'),
        unreachable: _('Connected. Could not reach the server.'),
        changed: _('Connected. The service replied in an unexpected way.'),
        no_config: _('Connected, but the client id is missing from the local configuration.'),
    }[state.result] ?? _('Connected. Not checked yet.');
}

/** What the primary button of an OAuth account says, or null when it has none to show. */
export function oauthPrimary(state) {
    if (state.busy)
        return null;
    if (!state.connected)
        return 'connect';
    return state.result === 'expired' ? 'reconnect' : null;
}
