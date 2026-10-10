import {test, assertEqual, assertTrue} from './harness.js';
import {createApiUsageProvider} from '../lib/providers/apiUsage.js';
import {createOAuthUsageProvider} from '../lib/providers/oauthUsage.js';
import {parseCostPage, parseCursorPage, parseOpenRouterKey} from '../lib/core/apiUsage.js';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const NEXT = Date.parse('2026-11-01T00:00:00Z');
const KEY = 'synthetic-key';
const reply = (json, status = 200, retryAfter = null) => ({json, status, retryAfter});
const cost = (amount, currency = 'usd', more = false, page = null) => ({data: [{results: [{amount: {value: amount, currency}}]}], has_more: more, next_page: page});
const anthropic = amount => ({data: [{results: [{amount, currency: 'USD'}]}], has_more: false, next_page: null});
async function failure(promise) {
    try { await promise; } catch (error) { return error; }
    throw new Error('expected failure');
}
function setup(id, replies, extra = {}) {
    const sent = [];
    let disposed = 0;
    const http = {request: async (url, options) => {
        sent.push({url, ...options});
        const next = replies.shift();
        if (typeof next === 'function') return next();
        if (next instanceof Error) throw next;
        if (!next) throw new Error('unexpected request');
        return next;
    }, dispose: () => disposed++};
    const provider = createApiUsageProvider({id, name: id, http, getKey: async () => KEY, now: () => NOW, ...extra});
    return {provider, sent, disposed: () => disposed};
}

test('API usage: dollars and decimal cents differ and missing amounts never become zero', async () => {
    assertEqual(parseCostPage('openai-api', cost(12.34)).amount, 12.34);
    assertEqual(parseCostPage('anthropic-api', anthropic('1234.5')).amount, 12.345);
    assertEqual(parseCostPage('openai-api', cost(0)).amount, 0);
    assertEqual(parseCostPage('openai-api', {data: [], has_more: false, next_page: null}).amount, 0);
    for (const body of [cost(null), cost(-1), cost('12'), cost(1, 'eur'), {data: [{}]}, {}])
        assertEqual((await failure(Promise.resolve().then(() => parseCostPage('openai-api', body)))).code, 'provider_changed');
    for (const value of [null, '', 'NaN', '-2', '1e3', 12])
        assertEqual((await failure(Promise.resolve().then(() => parseCostPage('anthropic-api', anthropic(value))))).code, 'provider_changed');
});

test('API usage: OpenAI paginates costs then converts optional spend limit cents', async () => {
    const t = setup('openai-api', [reply(cost(2, 'usd', true, 'next/+')), reply(cost(3)), reply({threshold_amount: 10000, currency: 'USD', interval: 'month'})]);
    assertEqual(await t.provider.fetch(), {metrics: [{id: 'api-spend', kind: 'spend', amount: 5, currency: 'USD', window: 'month', resetsAt: NEXT, limit: 100}]});
    assertTrue(t.sent[0].url.includes('start_time=1790812800&end_time=1791460800&bucket_width=1d&limit=31'));
    assertTrue(t.sent[1].url.endsWith('&page=next%2F%2B'));
    assertTrue(t.sent.every(request => request.method === 'GET' && request.maxBytes === 1024 * 1024 && !request.url.includes(KEY)));
    assertEqual(t.sent[0].headers.Authorization, `Bearer ${KEY}`);
    const optional = setup('openai-api', [reply(cost(0)), reply(null, 404)]);
    assertEqual((await optional.provider.fetch()).metrics[0].amount, 0);
    assertTrue(!('limit' in (await setup('openai-api', [reply(cost(1)), reply({threshold_amount: 0, currency: 'USD', interval: 'month'})]).provider.fetch()).metrics[0]));
});

test('API usage: Anthropic uses administrative headers and fractional cents', async () => {
    const t = setup('anthropic-api', [reply({...anthropic('100'), has_more: true, next_page: 'two'}), reply(anthropic('23.4'))]);
    assertEqual((await t.provider.fetch()).metrics, [{id: 'api-spend', kind: 'spend', amount: 1.234, currency: 'USD', window: 'month', resetsAt: NEXT}]);
    assertTrue(t.sent[0].url.includes('starting_at=2026-10-01T00%3A00%3A00.000Z&ending_at=2026-10-08T12%3A00%3A00.000Z'));
    assertEqual(t.sent[0].headers, {'x-api-key': KEY, 'anthropic-version': '2023-06-01'});
});

test('API usage: Cursor aggregates total included spend without member identities', async () => {
    const member = {overallSpendCents: 1234.5, spendCents: 34, email: 'private@example.com', userId: 'one'};
    const t = setup('cursor', [reply({teamMemberSpend: [member], totalPages: 2, totalMembers: 2}), reply({teamMemberSpend: [{...member, overallSpendCents: 765.5}], totalPages: 2, totalMembers: 2})]);
    const result = await t.provider.fetch();
    assertEqual(result, {metrics: [{id: 'api-spend', kind: 'spend', amount: 20, currency: 'USD', window: 'none'}]});
    assertEqual(t.provider.intervalMs, 3600000);
    assertEqual(t.sent.map(request => JSON.parse(request.body)), [{page: 1, pageSize: 100}, {page: 2, pageSize: 100}]);
    assertEqual(t.sent[0].headers.Authorization, 'Basic c3ludGhldGljLWtleTo=');
    assertTrue(t.sent.every(request => request.url === 'https://api.cursor.com/teams/spend' && request.method === 'POST'));
    assertTrue(!JSON.stringify(result).includes(member.email));
    assertEqual((await failure(Promise.resolve().then(() => parseCursorPage({teamMemberSpend: [{spendCents: 42}], totalPages: 1, totalMembers: 1})))).code, 'provider_changed');
});

test('API usage: OpenRouter allowance uses remaining budget and honest UTC resets', async () => {
    for (const [reset, window, resetsAt] of [['monthly', 'month', NEXT], ['daily', 'day', Date.parse('2026-10-09T00:00:00Z')], ['weekly', 'week', Date.parse('2026-10-12T00:00:00Z')], [null, 'none', null]]) {
        const metric = parseOpenRouterKey({data: {limit: 100, limit_remaining: 35, limit_reset: reset, usage: 900}}, NOW).metrics[0];
        assertEqual(metric, {id: 'key-allowance', kind: 'money', basis: 'allowance', balance: 35, budget: 100, currency: 'USD', window, ...(resetsAt ? {resetsAt} : {})});
    }
    assertEqual(parseOpenRouterKey({data: {limit: 0, limit_remaining: 0, limit_reset: null}}, NOW).metrics[0].balance, 0);
    assertEqual(parseOpenRouterKey({data: {limit: null, usage: 42}}, NOW), {metrics: [{id: 'api-spend', kind: 'spend', amount: 42, currency: 'USD', window: 'none'}]});
    const t = setup('openrouter', [reply({data: {limit: null, usage: 9, is_management_key: true}}), reply({data: {total_credits: 100, total_usage: 20}})]);
    assertEqual((await t.provider.fetch()).metrics, [{id: 'account-credits', kind: 'money', balance: 80, budget: 100, currency: 'USD'}]);
    assertTrue(t.sent.every(request => request.method === 'GET'));
});

test('API usage: duplicate cursors, oversized cursors and excessive pages fail explicitly', async () => {
    for (const responses of [[reply(cost(1, 'usd', true, 'same')), reply(cost(1, 'usd', true, 'same'))], [reply(cost(1, 'usd', true, 'a'.repeat(513)))], Array.from({length: 10}, (_, i) => reply(cost(1, 'usd', true, `p${i}`)))]) {
        const t = setup('openai-api', responses);
        assertEqual((await failure(t.provider.fetch())).code, 'provider_changed');
        assertTrue(t.sent.length <= 10);
    }
});

test('API usage: cancellation fences key lookup, request completion and disposal', async () => {
    let cancelled = true, lookups = 0;
    const context = {isCancelled: () => cancelled};
    let t = setup('anthropic-api', [], {getKey: async () => { lookups++; return KEY; }});
    assertEqual((await failure(t.provider.fetch(context))).code, 'network');
    assertEqual([lookups, t.sent.length], [0, 0]);
    cancelled = false;
    t = setup('anthropic-api', [], {getKey: async () => { cancelled = true; return KEY; }});
    assertEqual((await failure(t.provider.fetch(context))).code, 'network');
    assertEqual(t.sent.length, 0);
    cancelled = false;
    t = setup('anthropic-api', [() => { cancelled = true; return reply(anthropic('0')); }]);
    assertEqual((await failure(t.provider.fetch(context))).code, 'network');
    t.provider.dispose();
    assertEqual(t.disposed(), 1);
    cancelled = false;
    assertEqual((await failure(t.provider.fetch(context))).code, 'network');
});

test('API usage: status and transport errors keep secrets out and honor retry hints', async () => {
    for (const [response, code, reason] of [[reply({secret: KEY}, 401), 'auth_required', 'rejected'], [reply({}, 429, '4'), 'rate_limited', undefined], [new Error(KEY), 'network', undefined]]) {
        const t = setup('openrouter', [response]);
        const error = await failure(t.provider.fetch());
        assertEqual(error.code, code);
        assertEqual(error.reason, reason);
        assertTrue(!error.message.includes(KEY));
        if (code === 'rate_limited') assertEqual(error.retryAfterMs, 4000);
    }
    for (const key of [null, 'bad\nkey-value', 'short', 'x'.repeat(513)]) {
        const t = setup('openrouter', [], {getKey: async () => key});
        assertEqual((await failure(t.provider.fetch())).code, 'auth_required');
        assertEqual(t.sent.length, 0);
    }
});

test('API usage: malformed allowance and credits cannot masquerade as balances', async () => {
    for (const data of [{}, {limit: null}, {limit: 100, limit_remaining: null, limit_reset: null},
        {limit: 100, limit_remaining: 101, limit_reset: null}, {limit: 100, limit_remaining: 1, limit_reset: 'yearly'},
        {limit: '100', limit_remaining: 1, limit_reset: null}])
        assertEqual((await failure(Promise.resolve().then(() => parseOpenRouterKey({data}, NOW)))).code, 'provider_changed');
    const t = setup('openrouter', [reply({data: {limit: null, usage: 9, is_management_key: true}}), reply({data: {total_credits: 20}})]);
    assertEqual((await failure(t.provider.fetch())).code, 'provider_changed');
});

test('API usage: failed page returns no partial sum and next poll restarts the month', async () => {
    const t = setup('anthropic-api', [reply({...anthropic('100'), has_more: true, next_page: 'two'}), reply({}, 429, '3'), reply(anthropic('250'))]);
    assertEqual((await failure(t.provider.fetch())).retryAfterMs, 3000);
    assertEqual((await t.provider.fetch()).metrics[0].amount, 2.5);
    assertTrue(!t.sent[2].url.includes('&page='));
});

test('API usage: cancellation between cost pages dispatches no next page', async () => {
    let calls = 0;
    const t = setup('anthropic-api', [reply({...anthropic('100'), has_more: true, next_page: 'two'})]);
    // The fourth check follows the first response; the fifth is before page two dispatch.
    const context = {isCancelled: () => ++calls >= 5};
    assertEqual((await failure(t.provider.fetch(context))).code, 'network');
    assertEqual(t.sent.length, 1);
});

test('API usage: Cursor rejects changing page metadata and incomplete aggregates', async () => {
    for (const responses of [[reply({teamMemberSpend: [{overallSpendCents: 100}], totalPages: 2, totalMembers: 2}), reply({teamMemberSpend: [{overallSpendCents: 200}], totalPages: 1, totalMembers: 2})],
        [reply({teamMemberSpend: [], totalPages: 1, totalMembers: 1})],
        [reply({teamMemberSpend: [], totalPages: 11, totalMembers: 0})]]) {
        const t = setup('cursor', responses);
        assertEqual((await failure(t.provider.fetch())).code, 'provider_changed');
    }
    assertEqual((await setup('cursor', [reply({teamMemberSpend: [], totalPages: 0, totalMembers: 0})]).provider.fetch()).metrics[0].amount, 0);
});

test('API usage: Basic authentication pads ASCII keys without browser globals', async () => {
    for (const [key, authorization] of [['abcdefgh', 'Basic YWJjZGVmZ2g6'], ['abcdefghi', 'Basic YWJjZGVmZ2hpOg==']]) {
        const t = setup('cursor', [reply({teamMemberSpend: [], totalPages: 0, totalMembers: 0})], {getKey: async () => key});
        await t.provider.fetch();
        assertEqual(t.sent[0].headers.Authorization, authorization);
    }
    const t = setup('cursor', [], {getKey: async () => 'username:password'});
    assertEqual((await failure(t.provider.fetch())).code, 'auth_required');
    assertEqual(t.sent.length, 0);
});

test('API usage: keyring failures are resumable and never disclose lookup details', async () => {
    const t = setup('openrouter', [], {getKey: async () => { throw new Error(KEY); }});
    const error = await failure(t.provider.fetch());
    assertEqual([error.code, error.reason], ['network', 'keyring']);
    assertTrue(!error.message.includes(KEY));
    assertEqual(t.sent.length, 0);
});

test('OAuth usage: harness-owned credentials are not invalidated or retried after 401', async () => {
    let requests = 0, reads = 0, invalidations = 0;
    const provider = createOAuthUsageProvider({id: 'codex', name: 'Codex', url: 'https://chatgpt.com/usage',
        parse: () => ({metrics: []}), renewOnUnauthorized: () => false,
        http: {request: async () => { requests++; return {status: 401, json: {}}; }},
        tokens: {accessToken: async () => { reads++; return 'synthetic-token'; }, invalidate: () => { invalidations++; }}});
    let failure;
    try { await provider.fetch({isCancelled: () => false}); } catch (error) { failure = error; }
    assertEqual([failure?.code, failure?.reason, requests, reads, invalidations], ['auth_required', 'expired', 1, 1, 0]);
});
