// Provider credentials in the keyring (docs/adr/0003), through libsecret.
// Nothing is kept in GSettings, in a file or in a log; when the keyring is
// locked or missing the calls fail and the caller reports `auth_required`.

import Secret from 'gi://Secret';
import {pruneConnectorCache} from './connectorCache.js';
import {providerIdForConnector} from '../core/connectors.js';
import {getDisconnectGate} from './disconnectGate.js';
import {decodeSecret} from '../oauth/secret.js';

const SCHEMA = new Secret.Schema('org.gnome.shell.extensions.gnome-ai-quota', Secret.SchemaFlags.NONE, {
    provider: Secret.SchemaAttributeType.STRING,
    kind: Secret.SchemaAttributeType.STRING,
});

/** The kinds of secret: an API key, or the JSON of an OAuth token pair. */
export const API_KEY = 'api-key';
export const OAUTH_TOKENS = 'oauth-token';

const CONNECTOR_SCHEMA = new Secret.Schema('org.gnome.shell.extensions.gnome-ai-quota.connector', Secret.SchemaFlags.NONE, {
    provider: Secret.SchemaAttributeType.STRING, connector: Secret.SchemaAttributeType.STRING, kind: Secret.SchemaAttributeType.STRING,
});
export function credentialAddress(connector, kind) {
    const provider = providerIdForConnector(connector);
    if (!provider || ![API_KEY, OAUTH_TOKENS].includes(kind)) throw new Error('invalid credential identity');
    return !connector.includes('--') ? {schema: SCHEMA, attributes: {provider: connector, kind}}
        : {schema: CONNECTOR_SCHEMA, attributes: {provider, connector, kind}};
}


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
            return (capturedGate ?? gate ?? getGate()).withCredentialWrite(providerIdForConnector(provider) ?? provider, ticket, async () => {
                if (expected) {
                    const current = decodeSecret(await lookup(provider, kind, {interactive: false}));
                    if (!current || current.gen !== expected.gen || current.refresh !== expected.refresh) return false;
                }
                await store(provider, kind, value, label);
                return true;
            });
        },
        clearSecret(provider, kind, {gate: capturedGate, ticket} = {}) {
            return (capturedGate ?? gate ?? getGate()).withCredentialWrite(providerIdForConnector(provider) ?? provider, ticket, async () => {
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
    const {schema, attributes} = credentialAddress(provider, kind);
    return wrap((resolve, reject) => {
        Secret.password_store(schema, attributes, Secret.COLLECTION_DEFAULT, label, value, null, (_source, result) => {
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
    const {schema, attributes} = credentialAddress(provider, kind);
    if (!interactive)
        return lookupWithoutUnlocking(provider, kind);
    return wrap((resolve, reject) => {
        Secret.password_lookup(schema, attributes, null, (_source, result) => {
            try {
                resolve(Secret.password_lookup_finish(result));
            } catch (error) {
                reject(new Error('the keyring is not available'));
            }
        });
    });
}

function lookupWithoutUnlocking(provider, kind) {
    const {schema, attributes} = credentialAddress(provider, kind);
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
            service.search(schema, attributes, Secret.SearchFlags.LOAD_SECRETS, null, (_s, searchResult) => {
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
export async function clearSecret(provider, kind, options = {}) {
    const {requireParticipatingShell} = await import('./disconnectAll.js');
    const gate = options.gate ?? getDisconnectGate();
    await requireParticipatingShell(gate);
    const providerId = providerIdForConnector(provider);
    if (!providerId) throw new Error('invalid credential identity');
    return gate.disconnect({removeCredential: eraseCredential, removeFile: name => pruneConnectorCache(provider, name), clearStatus: async () => {}},
        {target: {id: provider, provider: providerId, kind}}).then(result => {
        if (result.phase !== 'complete') throw new Error('the keyring did not remove the credential');
    });
}

/** Exact deletion for the disconnect transaction, whose issued lease is already durable. */
export async function eraseCredential(provider, kind) {
    const {schema, attributes} = credentialAddress(provider, kind);
    await wrap((resolve, reject) => {
        Secret.password_clear(schema, attributes, null, (_source, result) => {
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
    const {schema, attributes} = credentialAddress(provider, kind);
    return wrap((resolve, reject) => {
        Secret.Service.get(Secret.ServiceFlags.NONE, null, (_source, result) => {
            let service;
            try { service = Secret.Service.get_finish(result); } catch (_error) { reject(new Error('the keyring is not available')); return; }
            service.search(schema, attributes, Secret.SearchFlags.ALL, null, (_source, result) => {
                try {
                    const items = service.search_finish(result);
                    resolve(items.length === 0 ? 'absent' : items.some(item => item.get_locked()) ? 'locked' : 'present');
                } catch (_error) { reject(new Error('the keyring is not available')); }
            });
        });
    });
}

/** Disconnect-all covers extension-owned connector items even when their registry was lost.
 * Schema name participates in matching, so a legacy subset cannot erase connector items.
 */
export async function eraseProviderCredentials(provider, kind) {
    if (providerIdForConnector(provider) !== provider || ![API_KEY, OAUTH_TOKENS].includes(kind)) throw new Error('invalid provider credential scope');
    const legacyAbsent = await eraseCredential(provider, kind);
    await wrap((resolve, reject) => {
        Secret.password_clear(CONNECTOR_SCHEMA, {provider, kind}, null, (_source, result) => {
            try { Secret.password_clear_finish(result); resolve(); }
            catch (_error) { reject(new Error('the keyring is not available')); }
        });
    });
    const connectorAbsent = await wrap((resolve, reject) => {
        Secret.Service.get(Secret.ServiceFlags.NONE, null, (_source, result) => {
            let service;
            try { service = Secret.Service.get_finish(result); }
            catch (_error) { reject(new Error('the keyring is not available')); return; }
            service.search(CONNECTOR_SCHEMA, {provider, kind}, Secret.SearchFlags.ALL, null, (_source, found) => {
                try { resolve(service.search_finish(found).length === 0); }
                catch (_error) { reject(new Error('the keyring is not available')); }
            });
        });
    });
    return legacyAbsent && connectorAbsent;
}

/** Explicit recovery only: metadata search without LOAD_SECRETS, UNLOCK or get_secret. */
export function enumerateConnectorIdentities() {
    return wrap((resolve, reject) => {
        Secret.Service.get(Secret.ServiceFlags.NONE, null, (_source, result) => {
            let service;
            try { service = Secret.Service.get_finish(result); }
            catch (_error) { reject(new Error('the keyring is not available')); return; }
            service.search(CONNECTOR_SCHEMA, {}, Secret.SearchFlags.ALL, null, (_source, found) => {
                try {
                    const entries = [];
                    for (const item of service.search_finish(found)) {
                        const attrs = item.get_attributes();
                        if (providerIdForConnector(attrs.connector) === attrs.provider && [API_KEY, OAUTH_TOKENS].includes(attrs.kind) && !entries.some(entry => entry.id === attrs.connector))
                            entries.push({id: attrs.connector, providerId: attrs.provider});
                    }
                    resolve(entries);
                } catch (_error) { reject(new Error('the keyring is not available')); }
            });
        });
    });
}
