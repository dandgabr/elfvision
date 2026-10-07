import {assertEqual, assertTrue, test} from './harness.js';
import {CallbackError, constantTimeEqual, parseCallback, parseQuery} from '../lib/oauth/callback.js';
import {randomBytes, sha256} from '../lib/oauth/crypto.js';
import {base64Url, createPkce} from '../lib/oauth/pkce.js';

const failureOf = fn => {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return null;
};

test('pkce: the challenge of the RFC 7636 appendix B verifier', () => {
    const pkce = createPkce({randomBytes, sha256});
    assertEqual(pkce.challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('pkce: base64url has no padding and uses the URL alphabet', () => {
    assertEqual(base64Url(new Uint8Array([0xfb, 0xff, 0xfe])), '-__-');
    assertEqual(base64Url(new Uint8Array([1])), 'AQ');
    assertEqual(base64Url(new Uint8Array([1, 2])), 'AQI');
    assertEqual(base64Url(new Uint8Array(0)), '');
    // the RFC's octet sequence for the example verifier
    const octets = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121];
    assertEqual(base64Url(new Uint8Array(octets)), 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
});

test('pkce: verifier and state are 43 characters, differ and never repeat', () => {
    const pkce = createPkce({randomBytes, sha256});
    const values = new Set();
    for (let i = 0; i < 20; i++) {
        for (const value of [pkce.verifier(), pkce.state()]) {
            assertTrue(/^[A-Za-z0-9_-]{43}$/.test(value), value);
            values.add(value);
        }
    }
    assertEqual(values.size, 40);
});

test('pkce: a short or missing random read fails instead of weakening the secret', () => {
    for (const bad of [() => new Uint8Array(16), () => null, () => [1, 2, 3]]) {
        const pkce = createPkce({randomBytes: bad, sha256});
        assertTrue(failureOf(() => pkce.verifier()) !== null);
        assertTrue(failureOf(() => pkce.state()) !== null);
    }
    assertEqual(randomBytes(32).length, 32);
});

test('callback: a valid redirect gives the code; the state is checked first', () => {
    assertEqual(parseCallback('code=abc123&state=s1', {state: 's1'}), {code: 'abc123'});
    assertEqual(parseCallback('state=s1&code=a%2Bb', {state: 's1'}), {code: 'a+b'});
    assertEqual(failureOf(() => parseCallback('code=abc&state=other', {state: 's1'})).code, 'state_mismatch');
    assertEqual(failureOf(() => parseCallback('code=abc', {state: 's1'})).code, 'state_mismatch');
    assertEqual(failureOf(() => parseCallback('error=access_denied&state=other', {state: 's1'})).code, 'state_mismatch');
    assertEqual(failureOf(() => parseCallback('error=access_denied&state=s1', {state: 's1'})).code, 'denied');
    assertEqual(failureOf(() => parseCallback('state=s1', {state: 's1'})).code, 'no_code');
    assertEqual(failureOf(() => parseCallback('code=&state=s1', {state: 's1'})).code, 'no_code');
});

test('callback: long, repeated and badly escaped queries are malformed, and nothing is echoed', () => {
    assertEqual(failureOf(() => parseQuery('a=' + 'x'.repeat(3000))).code, 'malformed');
    assertEqual(failureOf(() => parseQuery('code=1&code=2')).code, 'malformed');
    assertEqual(failureOf(() => parseQuery('code=%E0%A4%A')).code, 'malformed');
    const error = failureOf(() => parseCallback('state=s1&error=<script>alert(1)</script>', {state: 's1'}));
    assertTrue(error instanceof CallbackError && !error.message.includes('script'));
    assertEqual([...parseQuery('').keys()], []);
    assertTrue(constantTimeEqual('abc', 'abc') && !constantTimeEqual('abc', 'abd') && !constantTimeEqual('abc', 'ab'));
});

// ---- protocol, loopback and the whole sign-in against local servers

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {startLoopback} from '../lib/oauth/loopback.js';
import {startLogin} from '../lib/oauth/flow.js';
import {OAuthError, buildAuthUrl, formBody, parseTokenReply, refreshBody} from '../lib/oauth/protocol.js';
import {createHttp} from '../lib/services/http.js';

const SPEC = {
    authorizeUrl: 'https://auth.example.test/authorize',
    authHosts: ['auth.example.test'],
    scopes: ['read', 'offline'],
    extraAuthParams: {audience: 'a b'},
    redirectPath: '/cb',
    tokenUrl: '',
};
const MESSAGES = {ok: 'Done.', failed: 'Not done.'};
const queryOf = url => Object.fromEntries(url.split('?')[1].split('&').map(p => p.split('=').map(decodeURIComponent)));

async function rejection(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

/** A token endpoint that records the form it was sent and answers with `reply`. */
function tokenServer(reply) {
    const server = new Soup.Server();
    const seen = [];
    server.add_handler('/token', (_server, message) => {
        const body = new TextDecoder().decode(message.get_request_body().flatten().get_data());
        seen.push(Object.fromEntries(body.split('&').map(p => p.split('=').map(decodeURIComponent))));
        message.set_status(reply.status ?? 200, null);
        message.set_response('application/json', Soup.MemoryUse.COPY, JSON.stringify(reply.body));
    });
    server.listen_local(0, Soup.ServerListenOptions.IPV4_ONLY);
    return {url: `http://127.0.0.1:${server.get_uris()[0].get_port()}/token`, seen, stop: () => server.disconnect()};
}

function login({reply, browser, timeoutSecs}) {
    const token = tokenServer(reply);
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true});
    const pkce = createPkce({randomBytes, sha256});
    const started = startLogin({
        spec: {...SPEC, tokenUrl: token.url},
        config: {clientId: 'client-123', clientSecret: 'secret-456', redirectPort: 0, redirectHost: '127.0.0.1'},
        http, pkce, now: () => 1000000, messages: MESSAGES, timeoutSecs,
        openUri: url => {
            const params = queryOf(url);
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                browser?.(params);
                return GLib.SOURCE_REMOVE;
            });
        },
    });
    return {...started, token};
}

const visit = (http, redirectUri, query) => http.get(`${redirectUri}?${query}`);

test('oauth protocol: the authorization url is built from constants and escaped', () => {
    const url = buildAuthUrl(SPEC, {clientId: 'c', redirectUri: 'http://localhost:1/cb', challenge: 'ch', state: 'st'});
    const params = queryOf(url);
    assertEqual([url.startsWith('https://auth.example.test/authorize?'), params.scope, params.audience], [true, 'read offline', 'a b']);
    assertEqual([params.response_type, params.code_challenge_method, params.redirect_uri], ['code', 'S256', 'http://localhost:1/cb']);
    for (const bad of ['http://auth.example.test/a', 'https://evil.test/a', 'https://auth.example.test@evil.test/a', 'file:///x', 'https://auth.example.test:8443/a'])
        assertEqual(failureOf(() => buildAuthUrl({...SPEC, authorizeUrl: bad}, {clientId: 'c', redirectUri: 'r', challenge: 'c', state: 's'})).code, 'blocked_url');
    assertEqual(formBody({a: 'x y', b: undefined, c: 'é&='}), 'a=x%20y&c=%C3%A9%26%3D');
    assertEqual(refreshBody({clientId: 'c', refresh: 'r'}), 'grant_type=refresh_token&refresh_token=r&client_id=c');
});

test('oauth protocol: token replies are read strictly and errors keep only a known code', () => {
    const ok = parseTokenReply({status: 200, json: {access_token: 'a1', refresh_token: 'r1', expires_in: 60, scope: 's'}}, 1000);
    assertEqual(ok, {access: 'a1', refresh: 'r1', expiresAt: 61000, scope: 's'});
    assertEqual(parseTokenReply({status: 200, json: {access_token: 'a1'}}, 0).expiresAt, 3600000);
    assertEqual(parseTokenReply({status: 200, json: {access_token: 'a1', refresh_token: 'has space'}}, 0).refresh, null);
    assertEqual(failureOf(() => parseTokenReply({status: 400, json: {error: 'invalid_grant', error_description: 'secret detail'}}, 0)).code, 'invalid_grant');
    assertEqual(failureOf(() => parseTokenReply({status: 400, json: {error: '<b>x</b>'}}, 0)).code, 'unknown');
    assertEqual(failureOf(() => parseTokenReply({status: 500, json: null}, 0)).code, 'unknown');
    for (const json of [null, {}, {access_token: ''}, {access_token: 'a b'}, {access_token: 'x'.repeat(5000)}, 'text'])
        assertEqual(failureOf(() => parseTokenReply({status: 200, json}, 0)).code, 'bad_reply');
    const message = failureOf(() => parseTokenReply({status: 400, json: {error: 'invalid_grant', error_description: 'secret detail'}}, 0)).message;
    assertTrue(!message.includes('secret'));
});

test('oauth sign-in: the code is exchanged with the verifier, the secret and the redirect', async () => {
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true});
    const sign = login({
        reply: {body: {access_token: 'acc', refresh_token: 'ref', expires_in: 100}},
        browser: params => visit(http, params.redirect_uri, `code=THECODE&state=${encodeURIComponent(params.state)}`),
    });
    const tokens = await sign.done;
    assertEqual(tokens, {access: 'acc', refresh: 'ref', expiresAt: 1100000, scope: ''});
    const sent = sign.token.seen[0];
    const params = queryOf(sign.authUrl);
    assertEqual([sent.grant_type, sent.code, sent.client_id, sent.client_secret, sent.redirect_uri],
        ['authorization_code', 'THECODE', 'client-123', 'secret-456', params.redirect_uri]);
    // the verifier sent now hashes to the challenge that went to the browser
    assertEqual(createPkce({randomBytes, sha256}).challenge(sent.code_verifier), params.code_challenge);
    assertTrue(!sign.authUrl.includes(sent.code_verifier) && !sign.authUrl.includes('secret-456'));
    sign.token.stop();
});

test('oauth sign-in: a forged request does not end it, and the page reflects nothing', async () => {
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true});
    let page = '';
    const sign = login({
        reply: {body: {access_token: 'acc', refresh_token: 'ref'}},
        browser: async params => {
            const forged = await http.get(`${params.redirect_uri}?code=EVIL&state=wrong<script>`);
            page = JSON.stringify(forged);
            const stray = await http.get(params.redirect_uri.replace('/cb', '/other'));
            page += stray.status;
            await visit(http, params.redirect_uri, `code=GOOD&state=${encodeURIComponent(params.state)}`);
        },
    });
    const tokens = await sign.done;
    assertEqual(tokens.access, 'acc');
    assertEqual(sign.token.seen[0].code, 'GOOD');
    assertTrue(!page.includes('script') && page.includes('404'), page);
    sign.token.stop();
});

test('oauth sign-in: denied, cancelled, timeout and five bad requests each end it with a code', async () => {
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true});
    const denied = login({reply: {body: {}}, browser: p => visit(http, p.redirect_uri, `error=access_denied&state=${encodeURIComponent(p.state)}`)});
    assertEqual((await rejection(denied.done)).code, 'denied');
    denied.token.stop();

    const cancelled = login({reply: {body: {}}});
    cancelled.cancel();
    assertEqual((await rejection(cancelled.done)).code, 'cancelled');
    cancelled.token.stop();

    const slow = login({reply: {body: {}}, timeoutSecs: 1});
    assertEqual((await rejection(slow.done)).code, 'timeout');
    slow.token.stop();

    const flood = login({reply: {body: {}}, browser: async p => { for (let i = 0; i < 5; i++) await http.get(`${p.redirect_uri}?state=x${i}`); }});
    assertEqual((await rejection(flood.done)).code, 'malformed');
    flood.token.stop();
});

test('oauth sign-in: a token error, a missing refresh token and a busy port are reported plainly', async () => {
    const http = createHttp({allowedHosts: [], allowLoopbackHttp: true});
    const go = p => visit(http, p.redirect_uri, `code=C&state=${encodeURIComponent(p.state)}`);
    const refused = login({reply: {status: 400, body: {error: 'invalid_grant'}}, browser: go});
    const error = await rejection(refused.done);
    assertEqual([error instanceof OAuthError, error.code], [true, 'invalid_grant']);
    refused.token.stop();
    const noRefresh = login({reply: {body: {access_token: 'only'}}, browser: go});
    assertEqual((await rejection(noRefresh.done)).code, 'no_refresh');
    noRefresh.token.stop();

    const first = startLoopback({port: 0, path: '/cb', state: 's', messages: MESSAGES});
    const port = Number(first.redirectUri.split(':')[2].split('/')[0]);
    assertEqual(failureOf(() => startLoopback({port, path: '/cb', state: 's', messages: MESSAGES})).code, 'port_busy');
    first.cancel();
    await rejection(first.result);
});

import {refreshRequest} from '../lib/oauth/protocol.js';

test('oauth protocol: a refresh is a form, or JSON when the provider wants it', () => {
    const fields = {clientId: 'c1', refresh: 'r1'};
    assertEqual(refreshRequest({}, fields), {body: 'grant_type=refresh_token&refresh_token=r1&client_id=c1', contentType: 'application/x-www-form-urlencoded'});
    const json = refreshRequest({refreshEncoding: 'json'}, {...fields, clientSecret: undefined});
    assertEqual([JSON.parse(json.body), json.contentType], [{grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'c1'}, 'application/json']);
    assertEqual(failureOf(() => parseTokenReply({status: 400, json: {error: 'refresh_token_reused'}}, 0)).code, 'refresh_token_reused');
});
