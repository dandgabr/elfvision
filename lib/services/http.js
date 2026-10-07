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
    // Requests in flight, so dispose() can cancel them.
    const active = new Set();

    function checkedUri(url) {
        let uri;
        try {
            uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
        } catch (_error) {
            throw new ProviderError('provider_changed', 'the request address is not valid');
        }
        // The default port only: an allowed host on another port is another service.
        const secure = uri.get_scheme() === 'https' && allowedHosts.includes(uri.get_host())
            && (uri.get_port() === -1 || uri.get_port() === 443);
        const loopback = allowLoopbackHttp && uri.get_scheme() === 'http' && uri.get_host() === '127.0.0.1';
        if (!secure && !loopback)
            throw new ProviderError('provider_changed', 'the request address is not allowed');
        return uri;
    }

    async function readLimited(stream, cancellable, limit) {
        const chunks = [];
        let total = 0;
        for (;;) {
            const bytes = await stream.read_bytes_async(16 * 1024, GLib.PRIORITY_DEFAULT, cancellable);
            if (bytes.get_size() === 0)
                break;
            total += bytes.get_size();
            if (total > limit)
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
        /** Cancel every request in flight and drop the connections. */
        dispose() {
            for (const cancellable of active)
                cancellable.cancel();
            session.abort();
        },

        /**
         * @param {string} url
         * @param {{headers?: Object<string, string>, context?: {isCancelled: () => boolean}}} [options]
         *   `context` is the scheduler's: the request is cancelled once it gives up
         * @returns {Promise<{status: number, retryAfter: ?string, json: *}>} `json` is null
         *   when the body is not JSON
         */
        get(url, options = {}) {
            return this.request(url, {...options, method: 'GET'});
        },

        /**
         * @param {string} url
         * @param {object} [options]
         * @param {'GET'|'POST'} [options.method]
         * @param {string} [options.body] - sent as is, with `contentType`
         * @param {string} [options.contentType]
         * @param {number} [options.maxBytes] - a smaller reply limit than the default
         * @param {Object<string, string>} [options.headers]
         * @param {{isCancelled: () => boolean}} [options.context]
         * @returns {Promise<{status: number, retryAfter: ?string, json: *}>}
         */
        async request(url, {method = 'GET', body = null, contentType = 'application/x-www-form-urlencoded',
            headers = {}, context = null, maxBytes: replyLimit = maxBytes} = {}) {
            const uri = checkedUri(url);
            const message = Soup.Message.new_from_uri(method, uri);
            if (body !== null)
                message.set_request_body_from_bytes(contentType, new GLib.Bytes(new TextEncoder().encode(body)));
            message.set_flags(Soup.MessageFlags.NO_REDIRECT);
            const requestHeaders = message.get_request_headers();
            requestHeaders.replace('Accept', 'application/json');
            // replace, not append: a provider may need to set the User-Agent the session already has
            for (const [name, value] of Object.entries(headers))
                requestHeaders.replace(name, value);

            // The Soup timeouts count idle time only, so a server that drips bytes
            // could hold the request open: one total deadline, and a check on the
            // scheduler's verdict, both cancel it.
            const cancellable = new Gio.Cancellable();
            active.add(cancellable);
            // A source that returned SOURCE_REMOVE is gone: its id is cleared, so the
            // cleanup below never removes it twice (GLib logs a critical for that).
            let deadline = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeoutSecs, () => {
                deadline = 0;
                cancellable.cancel();
                return GLib.SOURCE_REMOVE;
            });
            let watcher = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                if (context?.isCancelled())
                    cancellable.cancel();
                if (!cancellable.is_cancelled())
                    return GLib.SOURCE_CONTINUE;
                watcher = 0;
                return GLib.SOURCE_REMOVE;
            });

            let stream;
            let text;
            try {
                stream = await session.send_async(message, GLib.PRIORITY_DEFAULT, cancellable);
                text = await readLimited(stream, cancellable, replyLimit);
            } catch (error) {
                if (error instanceof ProviderError)
                    throw error;
                // The message of a transport error can name the host; keep it out.
                throw new ProviderError('network', 'cannot reach the server');
            } finally {
                // Cancel first: closing a stream with unread data would otherwise read it.
                cancellable.cancel();
                try {
                    stream?.close(null);
                } catch (_error) {
                    // Already closed or cancelled.
                }
                active.delete(cancellable);
                if (deadline)
                    GLib.source_remove(deadline);
                if (watcher)
                    GLib.source_remove(watcher);
            }

            let json = null;
            try {
                json = JSON.parse(text);
            } catch (_error) {
                // Not JSON: the caller decides from the status.
            }
            return {
                // status_code, not get_status(): the enum getter throws for codes Soup
                // does not know, such as 429.
                status: message.status_code,
                retryAfter: message.get_response_headers().get_one('Retry-After'),
                json,
            };
        },
    };
}
