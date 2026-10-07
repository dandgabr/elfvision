import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {assertEqual, assertTrue, test} from './harness.js';
import {createHttp} from '../lib/services/http.js';

/** A local server that answers by path; returns its base URL and a way to stop it. */
function serve(routes) {
    const server = new Soup.Server();
    const seen = [];
    server.add_handler('/', (_server, message, path) => {
        seen.push({path, authorization: message.get_request_headers().get_one('Authorization')});
        const route = routes[path] ?? {status: 404, body: ''};
        message.set_status(route.status, null);
        for (const [name, value] of Object.entries(route.headers ?? {}))
            message.get_response_headers().append(name, value);
        message.set_response('application/json', Soup.MemoryUse.COPY, route.body);
    });
    server.listen_local(0, Soup.ServerListenOptions.IPV4_ONLY);
    const port = server.get_uris()[0].get_port();
    return {base: `http://127.0.0.1:${port}`, seen, stop: () => server.disconnect()};
}

async function failureOf(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

test('http: a JSON reply, its status and the headers sent', async () => {
    const server = serve({'/ok': {status: 200, body: '{"a":1}'}, '/limit': {status: 503, headers: {'Retry-After': '45'}, body: 'slow down'}});
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true});
    const ok = await http.get(`${server.base}/ok`, {headers: {Authorization: 'Bearer k'}});
    assertEqual([ok.status, ok.json], [200, {a: 1}]);
    assertEqual(server.seen[0].authorization, 'Bearer k');
    const limited = await http.get(`${server.base}/limit`);
    assertEqual([limited.status, limited.retryAfter, limited.json], [503, '45', null]);
    server.stop();
});

test('http: other hosts, plain http and bad addresses are refused before any request', async () => {
    const http = createHttp({allowedHosts: ['api.example.com']});
    for (const url of ['http://api.example.com/x', 'https://evil.example.org/x', 'https://api.example.com.evil.org/x', 'file:///etc/passwd', 'not a url'])
        assertEqual([url, (await failureOf(http.get(url)))?.code], [url, 'provider_changed']);
});

test('http: a reply over the size limit and a closed port are provider failures without the address', async () => {
    const server = serve({'/big': {status: 200, body: JSON.stringify({pad: 'x'.repeat(5000)})}});
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true, maxBytes: 1000});
    assertEqual((await failureOf(http.get(`${server.base}/big`))).code, 'provider_changed');
    const port = server.base.split(':')[2];
    server.stop();
    const error = await failureOf(createHttp({allowedHosts: [], allowLoopbackHttp: true, timeoutSecs: 3}).get(`http://127.0.0.1:${port}/x`));
    assertEqual(error.code, 'network');
    assertTrue(!error.message.includes('127.0.0.1') && !error.message.includes(port), error.message);
});

test('http: redirects are not followed', async () => {
    const server = serve({'/old': {status: 302, headers: {Location: '/new'}, body: ''}, '/new': {status: 200, body: '{}'}});
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true});
    const reply = await http.get(`${server.base}/old`);
    assertEqual(reply.status, 302);
    assertEqual(server.seen.map(s => s.path), ['/old']);
    server.stop();
});

/** A raw TCP server that sends `head` at once, then `drip` one byte at a time. */
function rawServer(head, {drip = false} = {}) {
    const listener = new Gio.SocketListener();
    const port = listener.add_any_inet_port(null);
    let closedAt = 0;
    const accept = () => listener.accept_async(null, (_listener, result) => {
        let connection;
        try {
            [connection] = listener.accept_finish(result);
        } catch (_error) {
            return;
        }
        const out = connection.get_output_stream();
        try {
            out.write_all(new TextEncoder().encode(head), null);
            out.flush(null);
        } catch (_error) {
            return;
        }
        if (!drip) {
            connection.close(null);
            return;
        }
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            try {
                out.write_all(new TextEncoder().encode('x'), null);
                out.flush(null);
                return GLib.SOURCE_CONTINUE;
            } catch (_error) {
                closedAt = GLib.get_monotonic_time();
                return GLib.SOURCE_REMOVE;
            }
        });
    });
    accept();
    return {port, closedAt: () => closedAt, stop: () => listener.close()};
}

test('http: a status Soup has no name for (429) is read, with its Retry-After', async () => {
    const server = rawServer('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 7\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true});
    const reply = await http.get(`http://127.0.0.1:${server.port}/x`);
    assertEqual([reply.status, reply.retryAfter], [429, '7']);
    server.stop();
});

test('http: a server that drips bytes is cut at the total deadline, and by the scheduler giving up', async () => {
    const dripHead = 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n';
    let server = rawServer(dripHead, {drip: true});
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true, timeoutSecs: 2});
    let started = GLib.get_monotonic_time();
    const error = await failureOf(http.get(`http://127.0.0.1:${server.port}/x`));
    const seconds = (GLib.get_monotonic_time() - started) / 1e6;
    assertEqual(error.code, 'network');
    assertTrue(seconds < 4, `took ${seconds} s`);
    server.stop();

    server = rawServer(dripHead, {drip: true});
    let cancelled = false;
    started = GLib.get_monotonic_time();
    const slow = http.get(`http://127.0.0.1:${server.port}/x`, {context: {isCancelled: () => cancelled}});
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => { cancelled = true; return GLib.SOURCE_REMOVE; });
    assertEqual((await failureOf(slow)).code, 'network');
    assertTrue((GLib.get_monotonic_time() - started) / 1e6 < 2.5, 'cancelled by the context');
    server.stop();
});

test('http: dispose cancels what is in flight; another port on the allowed host is refused', async () => {
    const server = rawServer('HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n\r\n', {drip: true});
    const http = createHttp({allowedHosts: ['127.0.0.1'], allowLoopbackHttp: true, timeoutSecs: 20});
    const pending = http.get(`http://127.0.0.1:${server.port}/x`);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => { http.dispose(); return GLib.SOURCE_REMOVE; });
    assertEqual((await failureOf(pending)).code, 'network');
    server.stop();
    const strict = createHttp({allowedHosts: ['api.example.com']});
    assertEqual((await failureOf(strict.get('https://api.example.com:8443/x'))).code, 'provider_changed');
});
