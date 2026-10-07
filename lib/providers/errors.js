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
