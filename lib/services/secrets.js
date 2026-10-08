// Provider credentials in the keyring (docs/adr/0003), through libsecret.
// Nothing is kept in GSettings, in a file or in a log; when the keyring is
// locked or missing the calls fail and the caller reports `auth_required`.

import Secret from 'gi://Secret';
import {getDisconnectGate} from './disconnectGate.js';
import {decodeSecret} from '../oauth/secret.js';

const SCHEMA = new Secret.Schema('org.gnome.shell.extensions.gnome-ai-quota', Secret.SchemaFlags.NONE, {
    provider: Secret.SchemaAttributeType.STRING,
    kind: Secret.SchemaAttributeType.STRING,
});

/** The kinds of secret: an API key, or the JSON of an OAuth token pair. */
export const API_KEY = 'api-key';
export const OAUTH_TOKENS = 'oauth-token';

const attributes = (provider, kind) => ({provider, kind});

function wrap(start) {
    return new Promise((resolve, reject) => {
        try {
            start(resolve, reject);
        } catch (error) {
            reject(error);
        }
    });
}

/** Credential mutation policy over a coordinated gate and injected keyring operations. */
export function createCredentialMutator({gate, getGate, lookup, store, erase}) {
    return {
        storeSecret(provider, kind, value, label, {gate: capturedGate, ticket, expected} = {}) {
            return (capturedGate ?? gate ?? getGate()).withCredentialWrite(provider, ticket, async () => {
                if (expected) {
                    const current = decodeSecret(await lookup(provider, kind, {interactive: false}));
                    if (!current || current.gen !== expected.gen || current.refresh !== expected.refresh) return false;
                }
                await store(provider, kind, value, label);
                return true;
            });
        },
        clearSecret(provider, kind, {gate: capturedGate, ticket} = {}) {
            return (capturedGate ?? gate ?? getGate()).withCredentialWrite(provider, ticket, async () => {
                if (!await erase(provider, kind)) throw new Error('the keyring did not remove the credential');
            }, {operation: 'delete'});
        },
    };
}
// Resolve the default lazily: an accepted rotation retains its retiring facade.
const mutations = createCredentialMutator({getGate: getDisconnectGate, lookup: lookupSecret, store: writeSecret, erase: eraseCredential});

/** Store a secret; conditional OAuth replacement compares under the provider lease. */
export function storeSecret(provider, kind, value, label, options = {}) {
    return mutations.storeSecret(provider, kind, value, label, options);
}
function writeSecret(provider, kind, value, label) {
    return wrap((resolve, reject) => {
        Secret.password_store(SCHEMA, attributes(provider, kind), Secret.COLLECTION_DEFAULT, label, value, null, (_source, result) => {
            try {
                if (!Secret.password_store_finish(result)) throw new Error('refused');
                resolve();
            } catch (error) {
                reject(new Error('the keyring refused the secret'));
            }
        });
    });
}

/**
 * @param {string} provider
 * @param {string} kind
 * @param {{interactive?: boolean}} [options] - the shell passes `interactive: false`: a
 *   locked keyring then fails at once instead of asking the user to unlock it from
 *   inside the shell
 * @returns {Promise<?string>} the secret, or null when none is stored
 */
export function lookupSecret(provider, kind, {interactive = true} = {}) {
    if (!interactive)
        return lookupWithoutUnlocking(provider, kind);
    return wrap((resolve, reject) => {
        Secret.password_lookup(SCHEMA, attributes(provider, kind), null, (_source, result) => {
            try {
                resolve(Secret.password_lookup_finish(result));
            } catch (error) {
                reject(new Error('the keyring is not available'));
            }
        });
    });
}

function lookupWithoutUnlocking(provider, kind) {
    return wrap((resolve, reject) => {
        Secret.Service.get(Secret.ServiceFlags.NONE, null, (_source, serviceResult) => {
            let service;
            try {
                service = Secret.Service.get_finish(serviceResult);
            } catch (error) {
                reject(new Error('the keyring is not available'));
                return;
            }
            // LOAD_SECRETS without UNLOCK: a locked item is found but has no secret.
            service.search(SCHEMA, attributes(provider, kind), Secret.SearchFlags.LOAD_SECRETS, null, (_s, searchResult) => {
                try {
                    const [item] = service.search_finish(searchResult);
                    if (!item) {
                        resolve(null);
                        return;
                    }
                    const value = item.get_secret();
                    if (!value) {
                        reject(new Error('the keyring is locked'));
                        return;
                    }
                    resolve(value.get_text());
                } catch (error) {
                    reject(new Error('the keyring is not available'));
                }
            });
        });
    });
}

/** Delete a stored secret; deleting one that is not there is not an error. */
export function clearSecret(provider, kind, options = {}) {
    return mutations.clearSecret(provider, kind, options);
}

/** Exact deletion for the disconnect transaction, whose issued lease is already durable. */
export async function eraseCredential(provider, kind) {
    await wrap((resolve, reject) => {
        Secret.password_clear(SCHEMA, attributes(provider, kind), null, (_source, result) => {
            try {
                Secret.password_clear_finish(result);
                resolve();
            } catch (error) {
                reject(new Error('the keyring is not available'));
            }
        });
    });
    return (await credentialPresence(provider, kind)) === 'absent';
}

/** Presence only, including locked items; never load or unlock a credential. */
export function credentialPresence(provider, kind) {
    return wrap((resolve, reject) => {
        Secret.Service.get(Secret.ServiceFlags.NONE, null, (_source, result) => {
            let service;
            try { service = Secret.Service.get_finish(result); } catch (_error) { reject(new Error('the keyring is not available')); return; }
            service.search(SCHEMA, attributes(provider, kind), Secret.SearchFlags.ALL, null, (_source, result) => {
                try {
                    const items = service.search_finish(result);
                    resolve(items.length === 0 ? 'absent' : items.some(item => item.get_locked()) ? 'locked' : 'present');
                } catch (_error) { reject(new Error('the keyring is not available')); }
            });
        });
    });
}
