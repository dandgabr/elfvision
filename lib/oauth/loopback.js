// The temporary web server that receives the redirect of an OAuth sign-in
// (docs/adr/0009). It listens on 127.0.0.1 only, answers one exact path, accepts
// the first valid callback and closes. It runs in the preferences process.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {CallbackError, parseCallback} from './callback.js';

const PAGE = text => `<!doctype html><meta charset="utf-8"><title>gnome-ai-quota</title><p>${text}</p>`;
const SECURITY_HEADERS = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function respond(message, status, text) {
    message.set_status(status, null);
    const headers = message.get_response_headers();
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
        headers.append(name, value);
    message.set_response('text/html; charset=utf-8', Soup.MemoryUse.COPY, PAGE(text));
}

/**
 * @param {object} options
 * @param {number} options.port - 0 picks a free one (tests)
 * @param {string} options.path - the only path that is answered, e.g. `/auth/callback`
 * @param {string} options.state - the expected `state`
 * @param {number} [options.timeoutSecs]
 * @param {string} [options.redirectHost] - the host written in the redirect address; it is
 *   `localhost` unless the client id was registered with another one
 * @param {{ok: string, failed: string}} options.messages - the two fixed pages (already translated)
 * @returns {{redirectUri: string, result: Promise<{code: string}>, cancel: () => void}}
 * @throws {Error} with `code` "port_busy" when the port cannot be bound
 */
export function startLoopback({port, path, state, timeoutSecs = 180, redirectHost = 'localhost', messages}) {
    const server = new Soup.Server();
    try {
        server.listen(Gio.InetSocketAddress.new_from_string('127.0.0.1', port), 0);
    } catch (_error) {
        const error = new Error('port_busy');
        error.code = 'port_busy';
        throw error;
    }
    const boundPort = server.get_uris()[0].get_port();
    const allowedHosts = [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`];

    let finish;
    const result = new Promise((resolve, reject) => {
        finish = {resolve, reject};
    });
    let closed = false;
    let timer = 0;
    const close = () => {
        if (closed)
            return;
        closed = true;
        if (timer) {
            GLib.source_remove(timer);
            timer = 0;
        }
        // Let the reply to the last request leave before the socket goes.
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            server.disconnect();
            return GLib.SOURCE_REMOVE;
        });
    };
    const fail = code => {
        const error = new CallbackError(code);
        close();
        finish.reject(error);
    };

    server.add_handler(null, (_server, message, requestPath) => {
        try {
            handle(message, requestPath);
        } catch (_error) {
            // Whatever went wrong, the sign-in must not hang until the timeout.
            fail('malformed');
        }
    });

    function handle(message, requestPath) {
        if (closed) {
            respond(message, 410, messages.failed);
            return;
        }
        if (requestPath !== path) {
            respond(message, 404, messages.failed);
            return;
        }
        if (message.get_method() !== 'GET') {
            respond(message, 405, messages.failed);
            return;
        }
        if (!allowedHosts.includes(message.get_request_headers().get_one('Host'))) {
            respond(message, 400, messages.failed);
            return;
        }
        let code;
        try {
            ({code} = parseCallback(message.get_uri().get_query() ?? '', {state}));
        } catch (error) {
            if (error instanceof CallbackError && error.code === 'denied') {
                respond(message, 200, messages.failed);
                fail('denied');
                return;
            }
            // Any web page can send a request to this port, so a request with a wrong state is
            // only turned away: it must never be able to end the sign-in. The timeout ends it.
            respond(message, 400, messages.failed);
            return;
        }
        respond(message, 200, messages.ok);
        close();
        finish.resolve({code});
    }

    timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeoutSecs, () => {
        timer = 0;
        fail('timeout');
        return GLib.SOURCE_REMOVE;
    });

    return {
        redirectUri: `http://${redirectHost}:${boundPort}${path}`,
        result,
        cancel: () => fail('cancelled'),
    };
}
