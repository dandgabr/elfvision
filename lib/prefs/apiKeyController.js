// The state and the actions of one API-key provider's account in the preferences process
// (docs/adr/0009, 0010): whether the keyring holds a key, saving one and removing it. It draws
// nothing; the Accounts page and the first-use assistant are views over it. The key is checked and
// stored and then forgotten: it is never kept here, never logged and never part of a message.

import {KEY_PATTERN} from '../core/commandCode.js';
import {API_KEY, clearSecret, lookupSecret, storeSecret} from '../services/secrets.js';
import {announceChange} from './status.js';

/**
 * @param {object} options
 * @param {import('../providers/registry.js').ProviderMeta} options.meta
 * @param {Gio.Settings} options.settings
 * @param {(msgid: string) => string} options.gettext
 * @param {(text: string) => void} [options.toast]
 * @param {object} [options.deps] - replacements for everything that touches the system
 */
export function createApiKeyController({meta, settings, gettext: _, toast = () => {}, deps = {}}) {
    const d = {lookupSecret, storeSecret, clearSecret, announceChange, ...deps};
    const listeners = new Set();
    const state = {hasKey: null, keyringDown: false, saving: false, lastFailure: ''};   // hasKey is null until the keyring answered
    let disposed = false;
    let refreshGeneration = 0;

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

    function refresh() {
        if (disposed)
            return Promise.resolve();
        const generation = ++refreshGeneration;
        return d.lookupSecret(meta.id, API_KEY).then(key => {
            if (disposed || generation !== refreshGeneration)
                return;
            state.hasKey = !!key;
            state.keyringDown = false;
        }).catch(() => {
            if (disposed || generation !== refreshGeneration)
                return;
            state.hasKey = false;
            state.keyringDown = true;
        }).finally(emit);
    }

    return {
        snapshot() {
            return {...state, result: settings.get_value('account-status').deepUnpack()[meta.id]};
        },

        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },

        refresh,

        /**
         * Check, store and forget the key the user typed.
         *
         * @returns {Promise<'saved'|'invalid'|'keyring'>}
         */
        async save(text) {
            const key = String(text).trim();
            if (!KEY_PATTERN.test(key)) {
                say(_('That does not look like an API key.'));
                return 'invalid';
            }
            state.saving = true;
            emit();
            try {
                await d.storeSecret(meta.id, API_KEY, key, `${meta.name} API key`);
            } catch (_error) {
                state.lastFailure = _('The keyring did not accept the key.');
                say(state.lastFailure);
                return 'keyring';
            } finally {
                state.saving = false;
                refresh();
            }
            state.lastFailure = '';
            emit();
            say(_('Key saved. Checking…'));
            try {
                // The running extension watches this and asks the provider again.
                d.announceChange(settings, meta.id);
            } catch (_error) {
                // The key is stored; the extension asks again on its next poll.
            }
            return 'saved';
        },

        /** Delete the key (the view has already asked). */
        async remove() {
            try {
                await d.clearSecret(meta.id, API_KEY);
                state.lastFailure = '';
                d.announceChange(settings, meta.id);
            } catch (_error) {
                say(_('The keyring is not available.'));
            } finally {
                refresh();
            }
        },

        dispose() {
            disposed = true;
            listeners.clear();
        },
    };
}

/** The words that say how a key is doing. */
export function apiKeySubtitle(state, _) {
    if (state.lastFailure)
        return state.lastFailure;
    if (state.keyringDown)
        return _('No keyring found. Unlock it in Passwords and Keys, or install a Secret Service provider.');
    if (!state.hasKey)
        return _('No key yet. Paste one in the field below.');
    return {
        ok: _('Key accepted.'),
        rejected: _('The server rejected this key.'),
        keyring: _('Key saved. The keyring is locked, so it was not checked.'),
        unreachable: _('Key saved. Could not reach the server.'),
        changed: _('Key saved. The service replied in an unexpected way.'),
    }[state.result] ?? _('Key saved. Not checked yet.');
}
