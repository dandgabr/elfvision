// The OAuth 2 messages (docs/adr/0009): the authorization URL, the token requests
// and the reading of a token reply. Pure JavaScript; the HTTP and the browser are
// somewhere else. Nothing from a reply is kept except the fields read here, and a
// failure is reported with a code from a fixed list, never with the server's text.

/** `error` values of a token reply that are passed on; anything else is `unknown`. */
export const TOKEN_ERRORS = [
    'invalid_grant', 'invalid_client', 'invalid_request', 'invalid_scope',
    'unauthorized_client', 'unsupported_grant_type', 'temporarily_unavailable',
];

export class OAuthError extends Error {
    constructor(code, status = 0) {
        super(code);
        this.name = 'OAuthError';
        this.code = code;
        this.status = status;
    }
}

const HTTPS_URL = /^https:\/\/([a-z0-9.-]+)(\/[^\s?#]*)?$/;
const DEFAULT_LIFETIME_SECS = 3600;

const encode = value => encodeURIComponent(String(value));

/** @param {Object<string, string|number>} fields */
export function formBody(fields) {
    return Object.entries(fields)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([name, value]) => `${encode(name)}=${encode(value)}`)
        .join('&');
}

/**
 * The page the browser is sent to. Built from constants of the provider's spec:
 * https, an allowed host, no user info, the default port, every value escaped.
 *
 * @param {{authorizeUrl: string, authHosts: string[], scopes: string[], extraAuthParams?: object}} spec
 * @param {{clientId: string, redirectUri: string, challenge: string, state: string}} values
 * @returns {string}
 */
export function buildAuthUrl(spec, {clientId, redirectUri, challenge, state}) {
    const match = HTTPS_URL.exec(spec.authorizeUrl);
    if (!match || !spec.authHosts.includes(match[1]))
        throw new OAuthError('blocked_url');
    const query = formBody({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: spec.scopes.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        ...spec.extraAuthParams,
    });
    return `${spec.authorizeUrl}?${query}`;
}

/** The form that swaps the code for tokens. */
export function codeExchangeBody({clientId, clientSecret, code, redirectUri, verifier}) {
    return formBody({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: verifier,
    });
}

/** The form that renews an access token. */
export function refreshBody({clientId, clientSecret, refresh}) {
    return formBody({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: clientId,
        client_secret: clientSecret,
    });
}

const printable = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && /^[\x21-\x7e]+$/.test(value);

/**
 * @param {{status: number, json: *}} reply
 * @param {number} nowMs
 * @returns {{access: string, refresh: ?string, expiresAt: number, scope: string}}
 * @throws {OAuthError} with the server's `error` when it is on the list, else `unknown`
 *   (or `bad_reply` for a success whose body cannot be used)
 */
export function parseTokenReply({status, json}, nowMs) {
    const ok = status >= 200 && status < 300;
    if (!ok) {
        const code = TOKEN_ERRORS.includes(json?.error) ? json.error : 'unknown';
        throw new OAuthError(code, status);
    }
    if (!json || typeof json !== 'object' || !printable(json.access_token, 4096))
        throw new OAuthError('bad_reply', status);
    const lifetime = Number.isFinite(json.expires_in) && json.expires_in > 0 ? json.expires_in : DEFAULT_LIFETIME_SECS;
    return {
        access: json.access_token,
        refresh: printable(json.refresh_token, 4096) ? json.refresh_token : null,
        expiresAt: nowMs + Math.min(lifetime, 400 * 86400) * 1000,
        scope: typeof json.scope === 'string' ? json.scope.slice(0, 256) : '',
    };
}
