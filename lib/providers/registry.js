// Every provider the extension knows, in display order (docs/adr/0009). Pure
// JavaScript with no gi:// import, so the preferences window and the shell read
// the same list. Adding a provider means a new entry here, a runtime module, a
// parser and tests; the Accounts page is generated from this list.

/**
 * @typedef {object} ProviderMeta
 * @property {string} id
 * @property {string} name - the product name; never translated
 * @property {'api-key'|'oauth-pkce'} auth
 * @property {string[]} apiHosts - the only hosts the shell may call for this provider
 * @property {boolean} available - false until its runtime module exists; unavailable
 *   providers are neither run nor shown in Preferences
 * @property {?string} terms - set when the provider's terms may forbid this access
 * @property {?{urlTemplate: string, usernameSetting: string}} keyLink - where a key is
 *   created; `{user}` in the template is the account name the user typed
 */

/** @type {ProviderMeta[]} */
export const PROVIDERS = [
    {
        id: 'command-code',
        name: 'Command Code',
        auth: 'api-key',
        apiHosts: ['api.commandcode.ai'],
        available: true,
        terms: null,
        keyLink: {
            urlTemplate: 'https://commandcode.ai/{user}/settings/keys',
            usernameSetting: 'command-code-username',
        },
    },
    {id: 'codex', name: 'Codex', auth: 'oauth-pkce', apiHosts: ['chatgpt.com'], available: false, terms: 'terms', keyLink: null},
    {id: 'claude', name: 'Claude', auth: 'oauth-pkce', apiHosts: ['api.anthropic.com'], available: false, terms: 'terms', keyLink: null},
    {
        id: 'antigravity',
        name: 'Antigravity',
        auth: 'oauth-pkce',
        apiHosts: ['daily-cloudcode-pa.googleapis.com'],
        available: false,
        terms: 'terms',
        keyLink: null,
    },
];

/** @returns {ProviderMeta|undefined} */
export const providerMeta = id => PROVIDERS.find(meta => meta.id === id);

/** Providers that can run today, in display order. */
export const availableProviders = () => PROVIDERS.filter(meta => meta.available);

/** Ids of the providers that can run today. */
export const LIVE_PROVIDER_IDS = availableProviders().map(meta => meta.id);
