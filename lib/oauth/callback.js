// Reads the redirect that ends an OAuth sign-in (docs/adr/0009). Pure JavaScript.
// Nothing from the query is ever echoed back to the browser or into a message.

const MAX_QUERY = 2048;

/** Why a callback was not accepted; the codes are the only thing reported. */
export const CALLBACK_ERRORS = ['malformed', 'state_mismatch', 'denied', 'no_code'];

export class CallbackError extends Error {
    constructor(code) {
        super(code);
        this.name = 'CallbackError';
        this.code = code;
    }
}

/** Equality that does not stop at the first different character. */
export function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length)
        return false;
    let difference = 0;
    for (let i = 0; i < a.length; i++)
        difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return difference === 0;
}

/**
 * @param {string} query - the part of the URL after `?`, still encoded
 * @returns {Map<string, string>}
 * @throws {CallbackError} `malformed` for a long query, a bad escape or a repeated name
 */
export function parseQuery(query) {
    if (typeof query !== 'string' || query.length > MAX_QUERY)
        throw new CallbackError('malformed');
    const params = new Map();
    if (query === '')
        return params;
    for (const pair of query.split('&')) {
        const index = pair.indexOf('=');
        const rawName = index === -1 ? pair : pair.slice(0, index);
        const rawValue = index === -1 ? '' : pair.slice(index + 1);
        let name;
        let value;
        try {
            name = decodeURIComponent(rawName.replace(/\+/g, ' '));
            value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
        } catch (_error) {
            throw new CallbackError('malformed');
        }
        if (params.has(name))
            throw new CallbackError('malformed');
        params.set(name, value);
    }
    return params;
}

/**
 * @param {string} query
 * @param {{state: string}} expected
 * @returns {{code: string}}
 * @throws {CallbackError} `state_mismatch` when the state is missing or wrong (checked
 *   before anything else), `denied` when the provider reports an error, `no_code`
 */
export function parseCallback(query, {state}) {
    const params = parseQuery(query);
    if (!constantTimeEqual(params.get('state') ?? '', state))
        throw new CallbackError('state_mismatch');
    if (params.has('error'))
        throw new CallbackError('denied');
    const code = params.get('code');
    if (!code || code.length > 1024)
        throw new CallbackError('no_code');
    return {code};
}

/**
 * The sign-in result pasted by hand, for when the browser could not reach the local
 * server: the whole address the browser ended on, or just the code.
 *
 * With an address, the `state` in it is checked when it is there. A bare code carries no
 * state, which is safe: the code is only good together with this sign-in's verifier, so a
 * code that came from somewhere else fails at the token exchange.
 *
 * @param {string} text
 * @param {{state: string}} expected
 * @returns {{code: string}}
 * @throws {CallbackError} `malformed`, `state_mismatch`, `denied` or `no_code`
 */
export function parseManualInput(text, {state}) {
    const value = typeof text === 'string' ? text.trim() : '';
    if (value === '' || value.length > MAX_QUERY)
        throw new CallbackError('malformed');
    if (value.includes('=') || value.includes('?')) {
        const query = value.includes('?') ? value.slice(value.indexOf('?') + 1) : value;
        const params = parseQuery(query.split('#')[0]);
        if (params.has('state') && !constantTimeEqual(params.get('state'), state))
            throw new CallbackError('state_mismatch');
        if (params.has('error'))
            throw new CallbackError('denied');
        const code = params.get('code');
        if (!code || code.length > 1024)
            throw new CallbackError('no_code');
        return {code};
    }
    if (!/^[A-Za-z0-9._~+/-]{10,1024}$/.test(value))
        throw new CallbackError('malformed');
    return {code: value};
}
