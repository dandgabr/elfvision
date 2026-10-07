// How a provider reports a failure to the scheduler.

/** Codes a provider may fail with; they map one to one to snapshot states. */
export const ERROR_CODES = ['auth_required', 'rate_limited', 'network', 'parse_error', 'provider_changed'];

export class ProviderError extends Error {
    /**
     * @param {string} code - one of ERROR_CODES
     * @param {string} [message]
     * @param {{retryAfterMs?: number}} [options] - the server's retry hint, for rate limits
     */
    constructor(code, message = code, {retryAfterMs} = {}) {
        super(message);
        this.name = 'ProviderError';
        this.code = ERROR_CODES.includes(code) ? code : 'network';
        if (Number.isFinite(retryAfterMs))
            this.retryAfterMs = retryAfterMs;
    }
}

/**
 * The failure an HTTP status stands for, or null for a success.
 *
 * @param {number} status
 * @param {string|null} [retryAfter] - the Retry-After header; only a number of seconds is honored
 * @returns {ProviderError|null}
 */
export function errorForStatus(status, retryAfter = null) {
    if (status >= 200 && status < 300)
        return null;
    if (status === 401 || status === 403)
        return new ProviderError('auth_required', `the server rejected the credential (HTTP ${status})`);
    if (status === 429) {
        const seconds = Number(retryAfter);
        return new ProviderError('rate_limited', 'rate limited (HTTP 429)',
            Number.isFinite(seconds) && seconds > 0 ? {retryAfterMs: seconds * 1000} : {});
    }
    if (status === 404 || status === 410)
        return new ProviderError('provider_changed', `the endpoint is gone (HTTP ${status})`);
    return new ProviderError('network', `unexpected reply (HTTP ${status})`);
}
