// HTTP for the providers (docs/adr/0003): HTTPS only, a host allowlist, no
// redirects, a timeout, a size limit, and no URL, header or body in any error
// message. Built on libsoup 3; every call is asynchronous.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {ProviderError} from '../providers/errors.js';

Gio._promisify(Soup.Session.prototype, 'send_async', 'send_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');

const MAX_BYTES = 1024 * 1024;
const decoder = new TextDecoder();

/**
 * @param {object} options
 * @param {string[]} options.allowedHosts - the only hosts this client may call
 * @param {number} [options.timeoutSecs]
 * @param {number} [options.maxBytes] - replies larger than this are refused
 * @param {boolean} [options.allowLoopbackHttp] - for tests: plain http to 127.0.0.1
 */
export function createHttp({allowedHosts, timeoutSecs = 25, maxBytes = MAX_BYTES, allowLoopbackHttp = false}) {
    const session = new Soup.Session({timeout: timeoutSecs, idle_timeout: timeoutSecs, user_agent: 'gnome-ai-quota'});

    function checkedUri(url) {
        let uri;
        try {
            uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
        } catch (_error) {
            throw new ProviderError('provider_changed', 'the request address is not valid');
        }
        const secure = uri.get_scheme() === 'https' && allowedHosts.includes(uri.get_host());
        const loopback = allowLoopbackHttp && uri.get_scheme() === 'http' && uri.get_host() === '127.0.0.1';
        if (!secure && !loopback)
            throw new ProviderError('provider_changed', 'the request address is not allowed');
        return uri;
    }

    async function readLimited(stream) {
        const chunks = [];
        let total = 0;
        for (;;) {
            const bytes = await stream.read_bytes_async(16 * 1024, GLib.PRIORITY_DEFAULT, null);
            if (bytes.get_size() === 0)
                break;
            total += bytes.get_size();
            if (total > maxBytes)
                throw new ProviderError('provider_changed', 'the reply is larger than the limit');
            chunks.push(bytes.toArray());
        }
        const all = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            all.set(chunk, offset);
            offset += chunk.length;
        }
        return decoder.decode(all);
    }

    return {
        /**
         * @param {string} url
         * @param {{headers?: Object<string, string>}} [options]
         * @returns {Promise<{status: number, retryAfter: ?string, json: *}>} `json` is null
         *   when the body is not JSON
         */
        async get(url, {headers = {}} = {}) {
            const uri = checkedUri(url);
            const message = Soup.Message.new_from_uri('GET', uri);
            message.set_flags(Soup.MessageFlags.NO_REDIRECT);
            const requestHeaders = message.get_request_headers();
            requestHeaders.append('Accept', 'application/json');
            for (const [name, value] of Object.entries(headers))
                requestHeaders.append(name, value);

            let stream;
            let text;
            try {
                stream = await session.send_async(message, GLib.PRIORITY_DEFAULT, null);
                text = await readLimited(stream);
            } catch (error) {
                if (error instanceof ProviderError)
                    throw error;
                // The message of a transport error can name the host; keep it out.
                throw new ProviderError('network', 'cannot reach the server');
            } finally {
                stream?.close(null);
            }

            let json = null;
            try {
                json = JSON.parse(text);
            } catch (_error) {
                // Not JSON: the caller decides from the status.
            }
            return {
                status: message.get_status(),
                retryAfter: message.get_response_headers().get_one('Retry-After'),
                json,
            };
        },
    };
}
