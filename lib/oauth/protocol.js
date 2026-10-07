// The OAuth 2 messages (docs/adr/0009): the authorization URL, the token requests
// and the reading of a token reply. Pure JavaScript; the HTTP and the browser are
// somewhere else. Nothing from a reply is kept except the fields read here, and a
// failure is reported with a code from a fixed list, never with the server's text.

/** `error` values of a token reply that are passed on; anything else is `unknown`. */
export const TOKEN_ERRORS = [
    'invalid_grant', 'invalid_client', 'invalid_request', 'invalid_scope',
    'unauthorized_client', 'unsupported_grant_type', 'temporarily_unavailable',
    // Codex says why a refresh token no longer works.
    'refresh_token_expired', 'refresh_token_reused', 'refresh_token_invalidated',
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
        // The spec's own extras come first: they can add parameters but never replace these.
        ...spec.extraAuthParams,
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: spec.scopes.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
    });
    return `${spec.authorizeUrl}?${query}`;
}

/**
 * The request that swaps the code for tokens: a form, or JSON when the provider's spec
 * says so (some also want the `state` back in the body).
 *
 * @param {{exchangeEncoding?: 'form'|'json', exchangeSendsState?: boolean}} spec
 * @returns {{body: string, contentType: string}}
 */
export function codeExchangeRequest(spec, {clientId, clientSecret, code, redirectUri, verifier, state}) {
    const fields = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: verifier,
        ...(spec.exchangeSendsState ? {state} : {}),
    };
    const defined = Object.entries(fields).filter(([, value]) => value !== undefined && value !== null);
    if (spec.exchangeEncoding === 'json')
        return {body: JSON.stringify(Object.fromEntries(defined)), contentType: 'application/json'};
    return {body: formBody(fields), contentType: 'application/x-www-form-urlencoded'};
}

/** The form that swaps the code for tokens. */
export function codeExchangeBody(fields) {
    return codeExchangeRequest({}, fields).body;
}

/**
 * The request that renews an access token: a form, or JSON when the provider's spec says so.
 *
 * @param {{refreshEncoding?: 'form'|'json'}} spec
 * @returns {{body: string, contentType: string}}
 */
export function refreshRequest(spec, {clientId, clientSecret, refresh}) {
    const fields = {grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId, client_secret: clientSecret};
    if (spec.refreshEncoding === 'json') {
        const defined = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
        return {body: JSON.stringify(defined), contentType: 'application/json'};
    }
    return {body: formBody(fields), contentType: 'application/x-www-form-urlencoded'};
}

/** The form that renews an access token. */
export function refreshBody(fields) {
    return refreshRequest({}, fields).body;
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
        // `error` is a string in RFC 6749; some servers wrap it as {code: ...}.
        const named = typeof json?.error === 'string' ? json.error : json?.error?.code;
        const code = typeof named === 'string' && TOKEN_ERRORS.includes(named.toLowerCase()) ? named.toLowerCase() : 'unknown';
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
