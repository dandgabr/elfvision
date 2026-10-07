// Provider credentials in the keyring (docs/adr/0003), through libsecret.
// Nothing is kept in GSettings, in a file or in a log; when the keyring is
// locked or missing the calls fail and the caller reports `auth_required`.

import Secret from 'gi://Secret';

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

/** Store a secret (an API key, or later a token) for a provider. */
export function storeSecret(provider, kind, value, label) {
    return wrap((resolve, reject) => {
        Secret.password_store(SCHEMA, attributes(provider, kind), Secret.COLLECTION_DEFAULT, label, value, null, (_source, result) => {
            try {
                Secret.password_store_finish(result);
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
export function clearSecret(provider, kind) {
    return wrap((resolve, reject) => {
        Secret.password_clear(SCHEMA, attributes(provider, kind), null, (_source, result) => {
            try {
                Secret.password_clear_finish(result);
                resolve();
            } catch (error) {
                reject(new Error('the keyring is not available'));
            }
        });
    });
}
