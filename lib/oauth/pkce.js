// PKCE (RFC 7636) and the `state` of an OAuth sign-in (docs/adr/0009). Pure
// JavaScript: the random source and the hash come in from lib/oauth/crypto.js, so
// the tests can check the exact vectors of the RFC.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Base64 with the URL alphabet and no padding.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base64Url(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += ALPHABET[(chunk >> 18) & 63] + ALPHABET[(chunk >> 12) & 63];
        if (i + 1 < bytes.length)
            out += ALPHABET[(chunk >> 6) & 63];
        if (i + 2 < bytes.length)
            out += ALPHABET[chunk & 63];
    }
    return out;
}

/**
 * @param {object} deps
 * @param {(count: number) => Uint8Array} deps.randomBytes - must return exactly `count`
 *   bytes from a cryptographic source, or throw
 * @param {(data: Uint8Array) => Uint8Array} deps.sha256
 * @returns {{verifier: () => string, challenge: (verifier: string) => string, state: () => string}}
 */
export function createPkce({randomBytes, sha256}) {
    const random32 = () => {
        const bytes = randomBytes(32);
        // A short or missing read would make the secret guessable: fail instead.
        if (!(bytes instanceof Uint8Array) || bytes.length !== 32)
            throw new Error('the random source returned too few bytes');
        return base64Url(bytes);
    };
    return {
        /** 43 characters from 32 random bytes. */
        verifier: random32,
        /** The `S256` challenge of a verifier. */
        challenge: verifier => base64Url(sha256(new TextEncoder().encode(verifier))),
        /** An anti-forgery value, from bytes independent of the verifier. */
        state: random32,
    };
}
