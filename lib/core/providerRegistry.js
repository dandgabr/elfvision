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
 * @property {?object} [oauth] - for `oauth-pkce` providers, the pure spec the sign-in and the
 *   renewal need (see lib/oauth/protocol.js); the client id is never part of it
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
    {
        id: 'codex',
        name: 'Codex',
        auth: 'oauth-pkce',
        apiHosts: ['chatgpt.com'],
        available: true,
        terms: 'terms',
        keyLink: null,
        // From the open-source Codex CLI (login server and token refresh). The client id is
        // not here: it comes from the user's providers.local.json.
        oauth: {
            authorizeUrl: 'https://auth.openai.com/oauth/authorize',
            authHosts: ['auth.openai.com'],
            tokenUrl: 'https://auth.openai.com/oauth/token',
            revokeUrl: 'https://auth.openai.com/oauth/revoke',
            scopes: ['openid', 'profile', 'email', 'offline_access'],
            extraAuthParams: {id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', originator: 'codex_cli_rs'},
            redirectPath: '/auth/callback',
            defaultRedirect: {host: '127.0.0.1', port: 1455, fallbackPort: 1457},
            refreshEncoding: 'json',
        },
    },
    {
        id: 'claude',
        name: 'Claude',
        auth: 'oauth-pkce',
        apiHosts: ['api.anthropic.com'],
        available: true,
        terms: 'terms',
        keyLink: null,
        // From the installed Claude Code program (account login with a Claude.ai subscription).
        // Only the profile scope is asked: enough to read the usage, not to run the model.
        oauth: {
            authorizeUrl: 'https://claude.com/cai/oauth/authorize',
            authHosts: ['claude.com', 'platform.claude.com'],
            tokenUrl: 'https://platform.claude.com/v1/oauth/token',
            revokeUrl: null,
            scopes: ['user:profile'],
            extraAuthParams: {code: 'true'},
            redirectPath: '/callback',
            // Any free port on localhost, like the program itself does.
            defaultRedirect: {host: 'localhost', port: 0},
            exchangeEncoding: 'json',
            exchangeSendsState: true,
            refreshEncoding: 'json',
        },
    },
    {
        id: 'antigravity',
        name: 'Antigravity',
        auth: 'oauth-pkce',
        apiHosts: ['daily-cloudcode-pa.googleapis.com'],
        available: true,
        // Its terms forbid this outright, and Google may act on the whole Google account.
        terms: 'strong',
        keyLink: null,
        // From the installed program: a Google "desktop app" client, with the client secret
        // Google's desktop clients need (it is not confidential, and not in the repository either).
        oauth: {
            authorizeUrl: 'https://accounts.google.com/o/oauth2/auth',
            authHosts: ['accounts.google.com', 'oauth2.googleapis.com'],
            tokenUrl: 'https://oauth2.googleapis.com/token',
            revokeUrl: 'https://oauth2.googleapis.com/revoke',
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
            // offline + consent: without them Google gives no refresh token.
            extraAuthParams: {access_type: 'offline', prompt: 'consent'},
            redirectPath: '/oauth-callback',
            defaultRedirect: {host: '127.0.0.1', port: 0},
        },
    },
];

// Administrative keys are API credentials, separate from subscription OAuth.
// Gemini and Z.ai are deferred until a documented reporting integration is established.
PROVIDERS.push(
    {id: 'openai-api', name: 'OpenAI API', auth: 'api-key', apiHosts: ['api.openai.com'], available: true,
        terms: null, keyLink: {urlTemplate: 'https://platform.openai.com/settings/organization/admin-keys'}, credentialScope: 'organization-admin'},
    {id: 'anthropic-api', name: 'Anthropic API', auth: 'api-key', apiHosts: ['api.anthropic.com'], available: true,
        terms: null, keyLink: {urlTemplate: 'https://platform.claude.com/settings/admin-keys'}, credentialScope: 'organization-admin'},
    {id: 'cursor', name: 'Cursor', auth: 'api-key', apiHosts: ['api.cursor.com'], available: true,
        terms: null, keyLink: {urlTemplate: 'https://cursor.com/dashboard'}, credentialScope: 'team-admin'},
    {id: 'openrouter', name: 'OpenRouter', auth: 'api-key', apiHosts: ['openrouter.ai'], available: true,
        terms: null, keyLink: {urlTemplate: 'https://openrouter.ai/settings/keys'}, credentialScope: 'key'},
);

export const LEGACY_PROVIDER_IDS = ['command-code', 'codex', 'claude', 'antigravity'];
export const DEMO_PROVIDERS = [
    {id: 'example-credits', name: 'Example Credits', auth: 'demo', apiHosts: [], available: true, demoOnly: true, terms: null, keyLink: null},
];

/** @returns {ProviderMeta|undefined} */
export const providerMeta = id => [...PROVIDERS, ...DEMO_PROVIDERS].find(meta => meta.id === id);

/** Providers that can run today, in display order. */
export const availableProviders = () => PROVIDERS.filter(meta => meta.available);
export const availableDemoProviders = () => [...availableProviders(), ...DEMO_PROVIDERS];

/** Ids of the providers that can run today. */
export const LIVE_PROVIDER_IDS = availableProviders().map(meta => meta.id);
