import {assertEqual, assertTrue, flush, test} from './harness.js';
import {EXPIRE_AFTER_MS, applyFreshness, normalizeSnapshot} from '../lib/core/contract.js';
import {CACHE_VERSION, parseCache, serializeCache} from '../lib/core/cache.js';
import {PollScheduler} from '../lib/core/scheduler.js';
import {ProviderError} from '../lib/providers/errors.js';
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

function setup(providers, settings = {}) {
    const clock = new FakeClock();
    const emitted = [];
    const problems = [];
    // random() = 0.5 makes jitter zero and the initial spread 1 s.
    const scheduler = new PollScheduler({
        timers: clock, onSnapshot: s => emitted.push(s), random: () => 0.5,
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
