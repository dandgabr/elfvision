// The per-user provider configuration (docs/adr/0009): the client id of each OAuth
// provider and a few optional values, kept in ~/.config/gnome-ai-quota/providers.local.json
// and never in the repository. This module only checks the text; reading the file and
// its permissions is lib/services/localConfig.js. Pure JavaScript.
//
// {"version": 1, "providers": {"codex": {"clientId": "...", "redirectPort": 1455,
//   "redirectHost": "localhost", "clientSecret": "...", "userAgent": "..."}}}
// Only clientId is required; the redirect port and host default to what the provider's
// own client uses (the registry).

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const PRINTABLE = /^[\x21-\x7e]+$/;
const KNOWN = ['clientId', 'redirectPort', 'redirectHost', 'clientSecret', 'userAgent'];
export const MAX_BYTES = 16 * 1024;

const token = (value, max) => typeof value === 'string' && value.length >= 1 && value.length <= max && PRINTABLE.test(value);

/**
 * @param {string} text
 * @returns {{providers: Object<string, {clientId: string, redirectPort?: number, redirectHost?: string,
 *   clientSecret?: string, userAgent?: string}>, problems: string[]}} an entry that does not
 *   pass is left out and named in `problems`; no value is ever copied into a problem
 */
export function parseLocalConfig(text) {
    const problems = [];
    const providers = {};
    let data;
    if (typeof text !== 'string' || text.length > MAX_BYTES) {
        return {providers, problems: ['the file is missing or too large']};
    }
    try {
        data = JSON.parse(text);
    } catch (_error) {
        return {providers, problems: ['the file is not valid JSON']};
    }
    if (!data || data.version !== 1 || !data.providers || typeof data.providers !== 'object' || Array.isArray(data.providers))
        return {providers, problems: ['the file has no "providers" of version 1']};

    for (const [id, entry] of Object.entries(data.providers)) {
        if (!ID.test(id) || !entry || typeof entry !== 'object') {
            problems.push('an entry has an invalid id');
            continue;
        }
        const unknown = Object.keys(entry).filter(key => !KNOWN.includes(key));
        if (unknown.length)
            problems.push(`${id}: unknown fields are ignored`);
        const {clientId, redirectPort, redirectHost, clientSecret, userAgent} = entry;
        if (!token(clientId, 300)) {
            problems.push(`${id}: clientId is missing or not printable ASCII`);
            continue;
        }
        if (redirectPort !== undefined && (!Number.isInteger(redirectPort) || redirectPort < 1024 || redirectPort > 65535)) {
            problems.push(`${id}: redirectPort must be a whole number from 1024 to 65535`);
            continue;
        }
        if (redirectHost !== undefined && redirectHost !== 'localhost' && redirectHost !== '127.0.0.1') {
            problems.push(`${id}: redirectHost must be localhost or 127.0.0.1`);
            continue;
        }
        if (clientSecret !== undefined && !token(clientSecret, 300)) {
            problems.push(`${id}: clientSecret is not printable ASCII`);
            continue;
        }
        // A header value: printable ASCII and spaces, never a line break.
        if (userAgent !== undefined && !(typeof userAgent === 'string' && userAgent.length >= 1 && userAgent.length <= 200 && /^[\x20-\x7e]+$/.test(userAgent))) {
            problems.push(`${id}: userAgent is not printable ASCII`);
            continue;
        }
        providers[id] = {clientId,
            ...(redirectPort !== undefined ? {redirectPort} : {}), ...(redirectHost !== undefined ? {redirectHost} : {}),
            ...(clientSecret !== undefined ? {clientSecret} : {}), ...(userAgent !== undefined ? {userAgent} : {})};
    }
    return {providers, problems};
}
