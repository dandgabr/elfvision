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
