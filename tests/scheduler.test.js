import {assertEqual, assertTrue, flush, test} from './harness.js';
import {EXPIRE_AFTER_MS, applyFreshness, normalizeSnapshot, redact} from '../lib/core/contract.js';
import {CACHE_VERSION, MAX_CACHE_BYTES, MAX_METRICS, MAX_SNAPSHOTS, MAX_TEXT, parseCache, serializeCache} from '../lib/core/cache.js';
import {PollScheduler} from '../lib/core/scheduler.js';
import {ProviderError} from '../lib/core/errors.js';
import {createDemoProviders} from '../lib/providers/demo.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** A virtual clock: timers fire when `advance` moves time past them. */
class FakeClock {
    constructor(start = 1_000_000) {
        this.time = start;
        this.timers = new Map();
        this.nextId = 1;
    }

    now = () => this.time;

    setTimeout = (fn, ms) => {
        const id = this.nextId++;
        this.timers.set(id, {at: this.time + ms, fn});
        return id;
    };

    clearTimeout = id => {
        this.timers.delete(id);
    };

    get pending() {
        return this.timers.size;
    }

    async advance(ms) {
        const target = this.time + ms;
        for (;;) {
            await flush();
            const due = [...this.timers.entries()]
                .filter(([, t]) => t.at <= target)
                .sort((a, b) => a[1].at - b[1].at)[0];
            if (!due)
                break;
            this.timers.delete(due[0]);
            this.time = Math.max(this.time, due[1].at);
            due[1].fn();
        }
        this.time = target;
        await flush();
    }
}

/** A provider whose fetch outcomes are scripted; counts its calls. */
function scripted(id, outcomes, intervalMs = 5 * MINUTE) {
    const provider = {
        id, name: id.toUpperCase(), plan: 'Pro', intervalMs, calls: 0,
        fetch() {
            const outcome = outcomes[Math.min(provider.calls, outcomes.length - 1)];
            provider.calls++;
            if (outcome instanceof Error)
                return Promise.reject(outcome);
            if (outcome === 'hang')
                return new Promise(() => {});
            return Promise.resolve(outcome);
        },
    };
    return provider;
}

const body = percent => ({metrics: [{id: 'w', kind: 'percent', window: 'week', windowSecs: 604800, percentUsed: percent}]});

function setup(providers, settings = {}, random = () => 0.5) {
    const clock = new FakeClock();
    const emitted = [];
    const problems = [];
    // random() = 0.5 makes jitter zero and the initial spread 1 s.
    const scheduler = new PollScheduler({
        timers: clock, onSnapshot: s => emitted.push(s), random,
        onProblem: m => problems.push(m), settings,
    });
    providers.forEach(p => scheduler.add(p));
    return {clock, scheduler, emitted, problems};
}

// ------------------------------------------------------------ contract

test('contract: unknown states and unusable metrics are cleaned, not trusted', () => {
    const {snapshot, problems} = normalizeSnapshot({
        id: 'x', name: 'X', state: 'weird',
        metrics: [
            {id: 'a', kind: 'percent', window: 'week', percentUsed: 130},
            {id: 'a', kind: 'percent', window: 'bogus', percentUsed: -4},
            {id: 'b', kind: 'percent', percentUsed: 'many'},
            {id: 'c', kind: 'money', balance: 10, budget: 40, currency: 'EUR'},
            {id: 'd', kind: 'money', balance: 'x'},
            null,
        ],
    });
    assertEqual(snapshot.state, 'parse_error');
    assertEqual(snapshot.metrics.map(m => [m.id, m.percentUsed, m.window]),
        [['a', 100, 'week'], ['a-2', 0, 'none'], ['c', 75, 'none']]);
    assertEqual(problems.length, 4);
});

test('contract: a snapshot without an id is reported', () => {
    assertEqual(normalizeSnapshot({}).problems.includes('missing provider id'), true);
    assertEqual(normalizeSnapshot(null).snapshot.id, '');
});

test('contract: freshness turns stale after two intervals and expires after a day', () => {
    const base = normalizeSnapshot({id: 'x', metrics: [{id: 'a', kind: 'percent', percentUsed: 50}],
        source: {kind: 'fresh', fetchedAt: 0}}).snapshot;
    assertEqual(applyFreshness(base, 9 * MINUTE, 5 * MINUTE).source.kind, 'fresh');
    assertEqual(applyFreshness(base, 11 * MINUTE, 5 * MINUTE).source.kind, 'stale');
    const expired = applyFreshness(base, EXPIRE_AFTER_MS + 1, 5 * MINUTE);
    assertEqual([expired.metrics.length, expired.expired], [0, true]);
    assertEqual(base.metrics.length, 1, 'the input is not mutated');
});

// --------------------------------------------------------------- cache

test('cache: a round trip keeps the numbers and drops error messages', () => {
    const {snapshot} = normalizeSnapshot({id: 'x', name: 'X', state: 'network', error: 'secret url',
        metrics: [{id: 'a', kind: 'percent', window: 'week', percentUsed: 42}], source: {kind: 'stale', fetchedAt: 5}});
    const text = serializeCache([snapshot], 99);
    assertTrue(!text.includes('secret url'));
    const result = parseCache(text);
    assertEqual(result.snapshots.length, 1);
    assertEqual([result.snapshots[0].metrics[0].percentUsed, result.snapshots[0].state], [42, 'network']);
});

test('cache: garbage, another version and entries without an id are ignored', () => {
    assertEqual(parseCache('not json').snapshots, []);
    assertEqual(parseCache(JSON.stringify({version: CACHE_VERSION + 1, snapshots: []})).snapshots, []);
    assertEqual(parseCache(JSON.stringify({version: CACHE_VERSION, snapshots: [{name: 'no id'}, {id: 'ok'}]})).snapshots
        .map(s => s.id), ['ok']);
});

// ----------------------------------------------------------- scheduler

test('scheduler: providers are spread, fetched once and stamped fresh', async () => {
    const codex = scripted('codex', [body(40)]);
    const {clock, scheduler, emitted} = setup([codex]);
    scheduler.start();
    await clock.advance(999);
    assertEqual(codex.calls, 0);
    await clock.advance(2);
    assertEqual(codex.calls, 1);
    assertEqual([emitted[0].id, emitted[0].state, emitted[0].source.kind, emitted[0].plan], ['codex', 'ok', 'fresh', 'Pro']);
    assertEqual(emitted[0].source.fetchedAt, 1_000_000 + SECOND, 'stamped with the time of the fetch');
});

test('scheduler: a success is followed by the next poll one interval later', async () => {
    const codex = scripted('codex', [body(40)], 5 * MINUTE);
    const {clock, scheduler} = setup([codex]);
    scheduler.start();
    await clock.advance(SECOND + 1);
    await clock.advance(5 * MINUTE - 10);
    assertEqual(codex.calls, 1);
    await clock.advance(20);
    assertEqual(codex.calls, 2);
});

test('scheduler: failures back off exponentially and are capped', async () => {
    const fail = new ProviderError('network');
    const codex = scripted('codex', [fail]);
    const {clock, scheduler} = setup([codex], {backoffBaseMs: 30 * SECOND, backoffMaxMs: 100 * SECOND});
    scheduler.start();
    await clock.advance(SECOND + 1);          // 1st attempt at t = 1 s
    assertEqual(codex.calls, 1);
    await clock.advance(29 * SECOND);         // t = 30 s: still waiting
    assertEqual(codex.calls, 1);
    await clock.advance(2 * SECOND);          // 2nd attempt at t = 31 s (+30 s)
    assertEqual(codex.calls, 2);
    await clock.advance(58 * SECOND);         // t = 90 s: still waiting
    assertEqual(codex.calls, 2);
    await clock.advance(2 * SECOND);          // 3rd attempt at t = 91 s (+60 s)
    assertEqual(codex.calls, 3);
    await clock.advance(98 * SECOND);         // the next wait is capped at 100 s, not 120 s
    assertEqual(codex.calls, 3);
    await clock.advance(2 * SECOND);
    assertEqual(codex.calls, 4);
});

test('scheduler: a failure keeps the last metrics and the original timestamp', async () => {
    const codex = scripted('codex', [body(61), new ProviderError('network')], 5 * SECOND);
    const {clock, scheduler, emitted} = setup([codex], {backoffBaseMs: SECOND});
    scheduler.start();
    await clock.advance(SECOND + 1);
    const fetchedAt = emitted[0].source.fetchedAt;
    await clock.advance(10 * SECOND);
    const failed = emitted[1];
    assertEqual([failed.state, failed.source.kind, failed.source.fetchedAt], ['network', 'stale', fetchedAt]);
    assertEqual(failed.metrics[0].percentUsed, 61);
});

test('scheduler: a rate limit honors a longer retry hint', async () => {
    const codex = scripted('codex', [new ProviderError('rate_limited', 'slow down', {retryAfterMs: 10 * MINUTE}), body(10)]);
    const {clock, scheduler, emitted} = setup([codex], {backoffBaseMs: 30 * SECOND});
    scheduler.start();
    await clock.advance(SECOND + 1);
    assertEqual(emitted[0].state, 'rate_limited');
    await clock.advance(9 * MINUTE);
    assertEqual(codex.calls, 1);
    await clock.advance(2 * MINUTE);
    assertEqual(codex.calls, 2);
});

for (const random of [0, 1]) {
    const cap = 60 * MINUTE;
    const scenarios = [
        {name: 'uncapped backoff', base: 30 * SECOND, expected: random ? 33 * SECOND : 27 * SECOND},
        {name: 'capped backoff', base: cap, expected: random ? cap : 54 * MINUTE},
        {name: 'long positive hint', base: 30 * SECOND, hint: 10 * MINUTE, expected: random ? 11 * MINUTE : 10 * MINUTE},
        {name: 'short positive hint', base: 30 * SECOND, hint: 29 * SECOND, expected: random ? 33 * SECOND : 29 * SECOND},
        {name: 'hint at cap', base: 30 * SECOND, hint: cap, expected: cap},
        {name: 'hint above cap', base: 30 * SECOND, hint: cap * 2, expected: cap},
        {name: 'zero hint', base: 30 * SECOND, hint: 0, expected: random ? 33 * SECOND : 27 * SECOND},
        {name: 'negative hint', base: 30 * SECOND, hint: -SECOND, expected: random ? 33 * SECOND : 27 * SECOND},
    ];
    for (const scenario of scenarios) {
        test(`scheduler: retry jitter ${random} respects ${scenario.name}`, async () => {
            const failure = new ProviderError('rate_limited', 'synthetic', {retryAfterMs: scenario.hint});
            const provider = scripted('synthetic', [failure, body(10)]);
            const {clock, scheduler, emitted} = setup([provider], {initialSpreadMs: 0, backoffBaseMs: scenario.base}, () => random);
            scheduler.start();
            await clock.advance(0);
            assertEqual(provider.calls, 1);
            assertEqual(emitted[0].nextRetryAt - clock.now(), scenario.expected, 'published retry must respect server floor and hard cap');
            await clock.advance(scenario.expected - 1);
            assertEqual(provider.calls, 1, 'the actual scheduled request must not start before its published retry');
            await clock.advance(1);
            assertEqual(provider.calls, 2, 'the actual scheduled request starts at its published retry');
            assertEqual(emitted[1].state, 'ok');
            scheduler.stop();
            assertEqual(clock.pending, 0);
        });
    }
}

test('scheduler: auth_required stops polling until credentials change', async () => {
    const claude = scripted('claude', [new ProviderError('auth_required'), body(20)]);
    const {clock, scheduler, emitted} = setup([claude]);
    scheduler.start();
    await clock.advance(SECOND + 1);
    assertEqual(emitted[0].state, 'auth_required');
    await clock.advance(10 * 60 * MINUTE);
    assertEqual(claude.calls, 1, 'no retry loop against a rejected credential');
    assertEqual(clock.pending, 0);
    await scheduler.credentialsChanged('claude');
    assertEqual([claude.calls, emitted[1].state], [2, 'ok']);
    assertEqual(clock.pending, 1, 'polling resumed');
});

test('scheduler: only one fetch runs at a time per provider', async () => {
    let release;
    const codex = {id: 'codex', name: 'Codex', intervalMs: MINUTE, calls: 0,
        fetch() {
            codex.calls++;
            return new Promise(resolve => (release = () => resolve(body(5))));
        }};
    const {clock, scheduler} = setup([codex]);
    const first = scheduler.refresh('codex');
    await flush();
    const second = scheduler.refresh('codex');
    await flush();
    assertEqual(codex.calls, 1, 'the second request joins the fetch in flight');
    release();
    await Promise.all([first, second]);
    await clock.advance(0);
    assertEqual(codex.calls, 1);
});

test('scheduler: manual refreshes are rate limited, except for a signed-out provider', async () => {
    const codex = scripted('codex', [body(1)]);
    const claude = scripted('claude', [new ProviderError('auth_required'), body(2)]);
    const {clock, scheduler} = setup([codex, claude]);
    await scheduler.refresh();
    await scheduler.refresh();
    assertEqual(codex.calls, 1, 'a second click inside the gap is ignored');
    assertEqual(claude.calls, 2, 'a provider waiting for credentials is retried at once');
    await clock.advance(6 * SECOND);
    await scheduler.refresh();
    assertEqual([codex.calls, claude.calls], [2, 3]);
});

test('scheduler: a fetch that never answers times out as a network error', async () => {
    const codex = scripted('codex', ['hang']);
    const {clock, scheduler, emitted} = setup([codex], {timeoutMs: 10 * SECOND});
    scheduler.start();
    await clock.advance(SECOND + 1);
    assertEqual(emitted.length, 0);
    await clock.advance(10 * SECOND);
    assertEqual(emitted[0].state, 'network');
});

test('scheduler: invalid provider output is cleaned and reported', async () => {
    const codex = scripted('codex', [{metrics: [{id: 'a', kind: 'percent', percentUsed: 250}, {id: 'b'}]}]);
    const {clock, scheduler, emitted, problems} = setup([codex]);
    scheduler.start();
    await clock.advance(SECOND + 1);
    assertEqual(emitted[0].metrics.map(m => m.percentUsed), [100]);
    assertEqual(problems, ['codex: dropped metric #1']);
});

test('scheduler: stop cancels every timer, remove forgets a provider', async () => {
    const codex = scripted('codex', [body(1)]);
    const claude = scripted('claude', [body(2)]);
    const {clock, scheduler} = setup([codex, claude]);
    scheduler.start();
    scheduler.remove('claude');
    assertEqual(clock.pending, 1);
    scheduler.stop();
    assertEqual(clock.pending, 0);
    await clock.advance(10 * MINUTE);
    assertEqual([codex.calls, claude.calls], [0, 0]);
});

test('scheduler: a provider added while running is scheduled, duplicates are rejected', async () => {
    const {clock, scheduler} = setup([]);
    scheduler.start();
    const codex = scripted('codex', [body(1)]);
    scheduler.add(codex);
    await clock.advance(SECOND + 1);
    assertEqual(codex.calls, 1);
    let message = '';
    try {
        scheduler.add(codex);
    } catch (error) {
        message = error.message;
    }
    assertTrue(message.includes('already registered'), message);
});

test('scheduler: seeded snapshots are returned in registration order', () => {
    const {scheduler} = setup([scripted('a', [body(1)]), scripted('b', [body(2)])]);
    scheduler.seed(normalizeSnapshot({id: 'b', name: 'B', metrics: []}).snapshot);
    scheduler.seed(normalizeSnapshot({id: 'a', name: 'A', metrics: []}).snapshot);
    assertEqual(scheduler.snapshots().map(s => s.id), ['a', 'b']);
});

// ------------------------------------------------------ demo providers

test('demo: the steady scenario always answers with metrics that match the fixtures', async () => {
    const providers = createDemoProviders('steady', () => 5_000_000);
    assertEqual(providers.map(p => p.id), ['command-code', 'codex', 'claude', 'antigravity', 'example-credits']);
    const claude = providers.find(p => p.id === 'claude');
    const result = await claude.fetch();
    assertEqual(result.metrics.map(m => m.percentUsed), [61, 97]);
    assertTrue(result.metrics[0].resetsAt > 5_000_000, 'reset times are relative to now');
});

test('demo: the flaky scenario walks through every failure code', async () => {
    const byId = id => createDemoProviders('flaky').find(p => p.id === id);
    const codex = byId('codex');
    const codes = [];
    for (let i = 0; i < 6; i++) {
        try {
            await codex.fetch();
            codes.push('ok');
        } catch (error) {
            codes.push(error.code + (error.retryAfterMs ? `:${error.retryAfterMs}` : ''));
        }
    }
    assertEqual(codes, ['ok', 'ok', 'network', 'ok', 'rate_limited:20000', 'ok']);
    const claude = byId('claude');
    await claude.fetch();
    let code = '';
    try {
        await claude.fetch();
    } catch (error) {
        code = error.code;
    }
    assertEqual(code, 'auth_required');
});

test('demo: the drift scenario climbs toward the limit', async () => {
    const codex = createDemoProviders('drift').find(p => p.id === 'codex');
    const first = (await codex.fetch()).metrics[0].percentUsed;
    await codex.fetch();
    const third = (await codex.fetch()).metrics[0].percentUsed;
    assertTrue(third > first, `${third} should be above ${first}`);
    assertEqual(createDemoProviders('nonsense').length, 5, 'an unknown scenario falls back to steady');
});

// ------------------------------------------- review fixes (M1, part 1)

test('contract: redact removes URLs and token-like strings', () => {
    assertEqual(redact('GET https://api.example.com/v1?key=abc123 failed'), 'GET <url> failed');
    assertEqual(redact('bad token sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA end'), 'bad token <redacted> end');
    assertTrue(redact('x'.repeat(500)).length <= 200);
});

test('cache: limits protect against oversized or hostile files', () => {
    assertEqual(parseCache('x'.repeat(MAX_CACHE_BYTES + 1)).problems, ['cache is too large']);
    const many = Array.from({length: MAX_SNAPSHOTS + 10}, (_, i) => ({id: `p${i}`, name: 'n'.repeat(500),
        metrics: Array.from({length: MAX_METRICS + 5}, (_m, j) => ({id: `m${j}`, kind: 'percent', percentUsed: 1}))}));
    const result = parseCache(JSON.stringify({version: CACHE_VERSION, snapshots: many}));
    assertEqual(result.snapshots.length, MAX_SNAPSHOTS);
    assertEqual(result.snapshots[0].metrics.length, MAX_METRICS);
    assertEqual(result.snapshots[0].name.length, MAX_TEXT);
});

test('scheduler: a manual refresh of a signed-out provider resumes its schedule', async () => {
    const claude = scripted('claude', [new ProviderError('auth_required'), body(20)], 5 * MINUTE);
    const {clock, scheduler, emitted} = setup([claude]);
    scheduler.start();
    await clock.advance(SECOND + 1);
    assertEqual(emitted[0].state, 'auth_required');
    await scheduler.refresh('claude');
    assertEqual(emitted[1].state, 'ok');
    assertEqual(clock.pending, 1, 'the next poll is scheduled again');
    await clock.advance(6 * MINUTE);
    assertEqual(claude.calls, 3);
});

test('scheduler: removing a provider during a fetch leaves no timer and no emission', async () => {
    let release;
    const codex = {id: 'codex', name: 'Codex', intervalMs: MINUTE, fetch: () => new Promise(r => (release = () => r(body(5))))};
    const {clock, scheduler, emitted} = setup([codex]);
    scheduler.start();
    await clock.advance(SECOND + 1);
    scheduler.remove('codex');
    release();
    await clock.advance(10 * MINUTE);
    assertEqual([emitted.length, clock.pending], [0, 0]);
    scheduler.add(scripted('codex', [body(1)]));   // the id can be reused
    assertEqual(scheduler.snapshots(), []);
});

test('scheduler: new credentials during a fetch in flight cause one more fetch', async () => {
    const releases = [];
    const claude = {id: 'claude', name: 'Claude', intervalMs: 5 * MINUTE, calls: 0,
        fetch() {
            claude.calls++;
            return new Promise(resolve => releases.push(() => resolve(body(7))));
        }};
    const {clock, scheduler} = setup([claude]);
    const first = scheduler.refresh('claude');
    await flush();
    scheduler.credentialsChanged('claude');
    releases[0]();
    await first;
    await flush();
    assertEqual(claude.calls, 2, 'the fetch that used the old credential is followed by a new one');
    releases[1]();
    await clock.advance(0);
});

for (const outcome of ['success', 'failure']) {
    test(`scheduler: credential changes suppress an old ${outcome} and cancel its context`, async () => {
        const pending = [];
        const provider = {id: 'codex', name: 'Codex', intervalMs: MINUTE,
            fetch(context) {
                return new Promise((resolve, reject) => pending.push({context, resolve, reject}));
            }};
        const {clock, scheduler, emitted, problems} = setup([provider]);
        const first = scheduler.refresh('codex');
        await flush();
        assertTrue(!pending[0].context.isCancelled());
        scheduler.credentialsChanged('codex');
        const oldContextCancelled = pending[0].context.isCancelled();
        if (outcome === 'success')
            pending[0].resolve(body(7));
        else
            pending[0].reject(new ProviderError('auth_required', 'old account rejected'));
        await first;
        await flush();
        assertEqual(emitted, [], 'old quota or auth status must never reach snapshot/cache listeners');
        assertTrue(oldContextCancelled, 'the previous credential is obsolete immediately');
        assertEqual(problems, []);
        assertEqual(pending.length, 2, 'the replacement fetch starts after old work settles');
        assertTrue(!pending[1].context.isCancelled());
        pending[1].resolve(body(91));
        await clock.advance(0);
        assertEqual(emitted.map(snapshot => [snapshot.state, snapshot.metrics[0].percentUsed]), [['ok', 91]]);
        assertEqual(scheduler.snapshots(), emitted);
        assertEqual(clock.pending, 0, 'a stopped scheduler leaves no polling timer');
    });
}

test('scheduler: a bad interval cannot make a tight loop, a huge retry hint is capped', async () => {
    const zero = scripted('zero', [body(1)], 0);
    const nan = scripted('nan', [body(1)], NaN);
    const slow = scripted('slow', [new ProviderError('rate_limited', 'x', {retryAfterMs: 1e12}), body(1)]);
    const {clock, scheduler} = setup([zero, nan, slow], {backoffMaxMs: 10 * MINUTE});
    scheduler.start();
    await clock.advance(SECOND + 1);
    await clock.advance(4 * SECOND);
    assertEqual(zero.calls, 1, 'an interval of 0 is raised to the minimum');
    await clock.advance(2 * SECOND);
    assertEqual(zero.calls, 2);
    assertEqual(nan.calls, 1, 'NaN falls back to the default interval');
    await clock.advance(11 * MINUTE);
    assertEqual(slow.calls, 2, 'the hint of 1e12 ms was cut to the 10-minute cap');
});

test('scheduler: a seed never overwrites data the provider already has', async () => {
    const codex = scripted('codex', [body(40)]);
    const {clock, scheduler} = setup([codex]);
    scheduler.seed(normalizeSnapshot({id: 'codex', name: 'old name', plan: 'old', metrics: []}).snapshot);
    assertEqual(scheduler.snapshots()[0].name, 'CODEX', 'the provider owns its name');
    scheduler.start();
    await clock.advance(SECOND + 1);
    const fresh = scheduler.snapshots()[0].metrics[0].percentUsed;
    scheduler.seed(normalizeSnapshot({id: 'codex', name: 'x', metrics: [{id: 'a', kind: 'percent', percentUsed: 99}]}).snapshot);
    assertEqual(scheduler.snapshots()[0].metrics[0].percentUsed, fresh);
});

test('scheduler: a listener that throws is reported and does not count as a failed fetch', async () => {
    const codex = scripted('codex', [body(40)]);
    const clock = new FakeClock();
    const problems = [];
    const scheduler = new PollScheduler({timers: clock, random: () => 0.5, onProblem: m => problems.push(m),
        onSnapshot: () => { throw new Error('boom'); }});
    scheduler.add(codex);
    scheduler.start();
    await clock.advance(SECOND + 1);
    assertEqual(scheduler.snapshots()[0].state, 'ok');
    assertTrue(problems.some(m => m.includes('boom')), problems.join('|'));
});

test('scheduler: a reply with only unusable metrics keeps the last good data', async () => {
    const codex = scripted('codex', [body(61), {metrics: [{id: 'x'}, {id: 'y', kind: 'percent'}]}], 5 * SECOND);
    const {clock, scheduler, emitted} = setup([codex]);
    scheduler.start();
    await clock.advance(SECOND + 1);
    await clock.advance(10 * SECOND);
    assertEqual([emitted[1].state, emitted[1].metrics[0].percentUsed], ['parse_error', 61]);
});

test('scheduler: unknown error codes become network errors; retry time and redaction are recorded', async () => {
    const odd = Object.assign(new Error('GET https://x.test/?token=abcdefghijklmnopqrstuvwxyz failed'), {code: 'ENOENT'});
    const codex = scripted('codex', [odd]);
    const {clock, scheduler, emitted} = setup([codex]);
    scheduler.start();
    await clock.advance(SECOND + 1);
    assertEqual(emitted[0].state, 'network');
    assertEqual(emitted[0].error, 'GET <url> failed');
    assertEqual(emitted[0].nextRetryAt, 1_000_000 + SECOND + 30 * SECOND, 'fetch time plus the first backoff');
    const claude = scripted('claude', [new ProviderError('auth_required')]);
    const second = setup([claude]);
    second.scheduler.start();
    await second.clock.advance(SECOND + 1);
    assertEqual(second.emitted[0].nextRetryAt, undefined, 'a signed-out provider is not retried');
});

test('scheduler: the fetch is told when it was abandoned after a timeout', async () => {
    let context;
    const codex = {id: 'codex', name: 'Codex', intervalMs: MINUTE, fetch: c => { context = c; return new Promise(() => {}); }};
    const {clock, scheduler} = setup([codex], {timeoutMs: 5 * SECOND});
    scheduler.start();
    await clock.advance(SECOND + 1);
    assertEqual(context.isCancelled(), false);
    await clock.advance(6 * SECOND);
    assertEqual(context.isCancelled(), true, 'the fetch is told nobody is waiting');
    await clock.advance(40 * SECOND);
    assertEqual(context.isCancelled(), true);
    scheduler.remove('codex');
    assertEqual(context.isCancelled(), true);
});

test('scheduler: a provider with a recent cached value is not fetched again at once (a screen lock restarts everything)', async () => {
    const fresh = scripted('a', [{metrics: [{id: 'm', kind: 'percent', percentUsed: 1}]}]);
    const retry = scripted('b', [{metrics: [{id: 'm', kind: 'percent', percentUsed: 1}]}]);
    const none = scripted('c', [{metrics: [{id: 'm', kind: 'percent', percentUsed: 1}]}]);
    const {clock, scheduler} = setup([fresh, retry, none]);
    const now = clock.now();
    scheduler.seed({...normalizeSnapshot({id: 'a', name: 'A', metrics: []}).snapshot, source: {kind: 'fresh', fetchedAt: now - MINUTE}});
    scheduler.seed({...normalizeSnapshot({id: 'b', name: 'B', state: 'network', metrics: []}).snapshot, nextRetryAt: now + 2 * MINUTE});
    scheduler.start();
    await clock.advance(3 * SECOND);
    assertEqual([fresh.calls, retry.calls, none.calls], [0, 0, 1]);      // only the one with nothing yet
    await clock.advance(4 * MINUTE);                                      // a is due 4 minutes from now
    assertEqual(fresh.calls, 1);
    assertEqual(retry.calls, 1);                                          // b waited for its own retry time
});

test('scheduler: when the network is back, providers that failed for lack of it are tried at once', async () => {
    const down = scripted('a', [new ProviderError('network', 'offline'), {metrics: [{id: 'm', kind: 'percent', percentUsed: 1}]}]);
    const bad = scripted('b', [new ProviderError('auth_required', 'no'), {metrics: [{id: 'm', kind: 'percent', percentUsed: 1}]}]);
    const {clock, scheduler} = setup([down, bad]);
    scheduler.start();
    await clock.advance(3 * SECOND);
    assertEqual([down.calls, bad.calls], [1, 1]);
    await scheduler.retryNetworkFailures();
    assertEqual([down.calls, bad.calls], [2, 1]);      // the signed-out one is not retried
    assertEqual(scheduler.snapshots().find(s => s.id === 'a').state, 'ok');
});

test('contract: text from a provider is bounded before it reaches the cache or a widget', () => {
    const long = 'x'.repeat(5000);
    const {snapshot} = normalizeSnapshot({id: long, name: long, plan: long, error: long, metrics: [
        {id: long, kind: 'percent', percentUsed: 5, pool: {id: long, name: long, short: long}},
        {id: 'm2', kind: 'money', balance: 1, currency: long},
    ]});
    assertTrue(snapshot.id.length <= 64 && snapshot.name.length <= 64 && snapshot.plan.length <= 64);
    assertTrue(snapshot.error.length <= 200);
    assertTrue(snapshot.metrics[0].id.length <= 64 && snapshot.metrics[0].pool.name.length <= 64 && snapshot.metrics[0].pool.short.length <= 8);
    assertTrue(snapshot.metrics[1].currency.length <= 8);
});
