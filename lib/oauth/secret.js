// The token secret as it sits in the keyring (docs/adr/0009): a small JSON
// document. Pure JavaScript. The id token and any identity claim are never part of it.

const MAX_BYTES = 8 * 1024;
const printable = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && /^[\x21-\x7e]+$/.test(value);

/**
 * @param {{gen: string, access: string, refresh: string, expiresAt: number, scope?: string}} tokens
 * @returns {string}
 */
export function encodeSecret({gen, access, refresh, expiresAt, scope = ''}) {
    const text = JSON.stringify({v: 1, gen, access, refresh, expiresAt, scope});
    if (text.length > MAX_BYTES)
        throw new Error('the token secret is too large');
    return text;
}

/**
 * @param {?string} text
 * @returns {?{gen: string, access: string, refresh: string, expiresAt: number, scope: string}}
 *   null for nothing, or anything that is not a well-formed secret of version 1
 */
export function decodeSecret(text) {
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_BYTES)
        return null;
    let data;
    try {
        data = JSON.parse(text);
    } catch (_error) {
        return null;
    }
    if (!data || data.v !== 1 || !printable(data.gen, 64) || !printable(data.access, 4096) ||
        !printable(data.refresh, 4096) || !Number.isFinite(data.expiresAt))
        return null;
    return {gen: data.gen, access: data.access, refresh: data.refresh, expiresAt: data.expiresAt,
        scope: typeof data.scope === 'string' ? data.scope.slice(0, 256) : ''};
}
