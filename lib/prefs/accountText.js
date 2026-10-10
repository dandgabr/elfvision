// The words that say how an account is doing, shared by the Accounts page and the first-use assistant.
// Pure of widgets: it takes what a controller's `snapshot()` returns.

import {fmt} from '../core/viewmodel.js';
import {harnessCredentialSource} from '../core/harnessSources.js';

export function harnessSubtitle({result = '', blocked = false}, meta, _) {
    const source = harnessCredentialSource(meta.id);
    const owner = source?.owner ?? _('local tool');
    if (blocked) return _('Account changes are blocked while local disconnection is incomplete.');
    if (result === 'ok') return fmt(_('Using credentials from %s in read-only mode.'), owner);
    if (result === 'no_key') return fmt(_('No usable credential was found. Sign in to %s, then check again.'), owner);
    if (['expired', 'rejected', 'refused'].includes(result))
        return fmt(_('The credential was rejected or expired. Open %s so it can renew, then check again.'), owner);
    if (result === 'keyring') return fmt(_('The credential source for %s is unavailable or locked.'), owner);
    if (result === 'changed') return _('The provider reply changed. The external credential was not modified.');
    if (result === 'unreachable') return _('Could not check quota. The credential was not modified.');
    return fmt(_('Using credentials from %s in read-only mode. The tool must renew its own token.'), owner);
}

/**
 * @param {object} state - an OAuth controller's snapshot
 * @param {{name: string}} meta
 * @param {(msgid: string) => string} _
 * @param {{formatPath?: (path: string) => string}} [options]
 * @returns {string}
 */
export function oauthSubtitle(state, meta, _) {
    if (state.blocked) return _('Account changes are blocked while local disconnection is incomplete.');
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
            : fmt(_('%s is not set up yet. Choose "Find configuration automatically" or copy the helper command.'), meta.name);
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
    if (state.busy || state.blocked)
        return null;
    if (!state.connected)
        return 'connect';
    return state.result === 'expired' ? 'reconnect' : null;
}
