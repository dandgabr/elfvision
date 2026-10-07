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
