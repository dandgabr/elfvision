// The Command Code provider (docs/adr/0002): an API key the user pasted in the
// preferences window, kept in the keyring, sent as a bearer token to one endpoint.

import {KEY_PATTERN, parseCredits} from '../core/commandCode.js';
import {ProviderError, errorForStatus} from '../core/errors.js';

export const COMMAND_CODE_ID = 'command-code';
export const COMMAND_CODE_HOST = 'api.commandcode.ai';
const CREDITS_URL = `https://${COMMAND_CODE_HOST}/alpha/billing/credits`;
const POLL_MS = 5 * 60 * 1000;

/**
 * @param {object} deps
 * @param {{get: (url: string, options: object) => Promise<{status: number, retryAfter: ?string, json: *}>}} deps.http
 * @param {(context: object) => Promise<?string>} deps.getKey - the stored API key, or null
 * @returns {import('../core/scheduler.js').Provider}
 */
export function createCommandCodeProvider({http, getKey}) {
    let disposed = false;
    return {
        /** Cancel requests in flight when the extension stops. */
        dispose() {
            disposed = true;
            http.dispose?.();
        },
        id: COMMAND_CODE_ID,
        name: 'Command Code',
        plan: '',
        intervalMs: POLL_MS,
        async fetch(context) {
            let key;
            try {
                key = await getKey(context);
            } catch (error) {
                // A locked keyring can be unlocked later: keep polling instead of pausing.
                throw new ProviderError('network', 'the keyring is not available', {reason: 'keyring'});
            }
            // A keyring lookup can settle after the scheduler or extension stops.
            if (disposed || context?.isCancelled())
                throw new ProviderError('network', 'the request was cancelled');
            if (!key)
                throw new ProviderError('auth_required', 'no API key is stored', {reason: 'no_key'});
            // A value that could not be a header must never be sent.
            if (!KEY_PATTERN.test(key))
                throw new ProviderError('auth_required', 'the stored key has characters a key cannot have', {reason: 'rejected'});

            const reply = await http.get(CREDITS_URL, {headers: {Authorization: `Bearer ${key}`}, context});
            const failure = errorForStatus(reply.status, reply.retryAfter);
            if (failure)
                throw failure;
            try {
                return parseCredits(reply.json);
            } catch (error) {
                throw new ProviderError(error.code ?? 'parse_error', error.message);
            }
        },
    };
}
