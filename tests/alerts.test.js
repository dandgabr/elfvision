import {assertEqual, assertTrue, test} from './harness.js';
import {
    AUTH_ALERT_AFTER_MS, DEFAULT_ALERT_SETTINGS, MAX_ALERT_STATE_BYTES, MAX_PER_HOUR, OUTAGE_ALERT_AFTER_MS,
    RESET_JITTER_MS, RESUME_GRACE_MS, emptyAlertState, evaluate, forgetProvider, normalizeAlertSettings,
    parseAlertState, serializeAlertState,
} from '../lib/core/alerts.js';

const MIN = 60 * 1000;
const T0 = 1_800_000_000_000;
const metric = (percentUsed, extra = {}) => ({id: 'five', kind: 'percent', window: 'session', windowSecs: 18000, percentUsed, resetsAt: T0 + 3600_000, ...extra});
const snap = (percentUsed, extra = {}, id = 'claude') => ({
    id, name: 'Claude', plan: 'Max', state: 'ok', source: {kind: 'fresh', fetchedAt: T0}, metrics: [metric(percentUsed)], ...extra,
});

/** Feed a series of snapshots (each at a time) and collect every event. */
function run(steps, {state = emptyAlertState(), settings, intervalMs = 300_000} = {}) {
    const events = [];
    let current = state;
    for (const [snapshot, now, quietUntil] of steps) {
        const result = evaluate({snapshot, state: current, settings, now, intervalMs, quietUntil});
        events.push(...result.events);
        current = result.state;
    }
    return {events, state: current};
}

test('alerts: the first reading is never announced, even above the threshold', () => {
    assertEqual(run([[snap(50), T0]]).events, []);
    assertEqual(run([[snap(97), T0]]).events, []);          // a state that already existed
    assertEqual(run([[snap(97), T0], [snap(98), T0 + MIN], [snap(99), T0 + 2 * MIN]]).events, []);   // and it stays quiet
});

test('alerts: crossing the threshold is announced once, then stays quiet', () => {
    const {events} = run([[snap(90), T0], [snap(96), T0 + MIN], [snap(97), T0 + 2 * MIN], [snap(99), T0 + 3 * MIN]]);
    assertEqual(events.length, 1);
    assertEqual(events[0].kind, 'threshold');
    assertEqual([events[0].providerId, events[0].level, events[0].crossings[0].metricId, events[0].crossings[0].percent], ['claude', 'critical', 'five', 96]);
});

test('alerts: hysteresis re-arms only after the usage falls 3 points below the threshold', () => {
    const steps = [[snap(90), T0], [snap(96), T0 + MIN], [snap(93), T0 + 2 * MIN], [snap(95), T0 + 3 * MIN]];
    assertEqual(run(steps).events.length, 1);                // 93 is not far enough below 95
    steps.push([snap(91), T0 + 4 * MIN], [snap(96), T0 + 5 * MIN]);
    assertEqual(run(steps).events.length, 2);                // 91 re-arms it, so the next crossing counts
});

test('alerts: a window that resets re-arms the alert, even if the usage did not fall', () => {
    const later = T0 + 6 * 3600_000;
    const next = snap(97, {metrics: [metric(97, {resetsAt: later + 5 * 3600_000})]});
    const {events} = run([[snap(90), T0], [snap(96), T0 + MIN], [next, later]]);
    assertEqual(events.length, 2);
    // The reset time wobbling by seconds is not a new window.
    const wobble = snap(97, {metrics: [metric(97, {resetsAt: T0 + 3600_000 + RESET_JITTER_MS - 1000})]});
    assertEqual(run([[snap(90), T0], [snap(96), T0 + MIN], [wobble, T0 + 2 * MIN]]).events.length, 1);
});

test('alerts: the threshold and the switch are per quota type', () => {
    const week = (percent, id = 'week') => snap(percent, {metrics: [{id, kind: 'percent', window: 'week', windowSecs: 604800, percentUsed: percent}]});
    const settings = {thresholds: {week: {enabled: true, percent: 80}, session: {enabled: false, percent: 95}}};
    assertEqual(run([[week(70), T0], [week(82), T0 + MIN]], {settings}).events[0].level, 'warning');
    assertEqual(run([[snap(90), T0], [snap(99), T0 + MIN]], {settings}).events, []);      // session is off
    const credits = percent => snap(percent, {metrics: [{id: 'usd', kind: 'money', balance: 1, budget: 100, currency: 'USD', percentUsed: percent}]});
    assertEqual(run([[credits(90), T0], [credits(96), T0 + MIN]]).events[0].crossings[0].type, 'credits');
});

test('alerts: an old or failed reading says nothing about the quota', () => {
    const stale = snap(99, {source: {kind: 'stale', fetchedAt: T0}});
    assertEqual(run([[snap(90), T0], [stale, T0 + MIN]]).events, []);
    assertEqual(run([[snap(90), T0], [snap(99, {state: 'network'}), T0 + MIN]]).events, []);
    // ... and the next good reading above the threshold is still a crossing.
    assertEqual(run([[snap(90), T0], [stale, T0 + MIN], [snap(99), T0 + 2 * MIN]]).events.length, 1);
});

test('alerts: no more than three quota notices an hour, then one summary', () => {
    const steps = [];
    ['a', 'b', 'c', 'd', 'e'].forEach((id, i) => {
        steps.push([snap(90, {}, id), T0 + i * MIN]);
    });
    ['a', 'b', 'c', 'd', 'e'].forEach((id, i) => {
        steps.push([snap(99, {}, id), T0 + (10 + i) * MIN]);
    });
    const {events} = run(steps);
    assertEqual(events.map(e => e.kind), ['threshold', 'threshold', 'threshold', 'summary']);
    assertEqual(MAX_PER_HOUR, 3);
    // An hour later the room is back.
    const more = run([...steps, [snap(80, {}, 'a'), T0 + 90 * MIN], [snap(99, {}, 'a'), T0 + 95 * MIN]]);
    assertEqual(more.events.length, 5);
});

test('alerts: a provider that is paused or removed is forgotten and never alerts', () => {
    const first = run([[snap(90), T0], [snap(96), T0 + MIN]]);
    assertEqual(Object.keys(first.state.levels), ['claude|five']);
    const paused = evaluate({snapshot: snap(99, {tracked: false}), state: first.state, now: T0 + 2 * MIN});
    assertEqual([paused.events, paused.state.levels, paused.state.connection], [[], {}, {}]);
    assertEqual(forgetProvider(first.state, 'claude').levels, {});
});

test('alerts: a rejected sign-in is announced after ten minutes, once, and again only after a success', () => {
    const bad = {state: 'auth_required', metrics: [], reason: 'expired'};
    const steps = [[snap(10, bad), T0], [snap(10, bad), T0 + AUTH_ALERT_AFTER_MS - 1]];
    assertEqual(run(steps).events, []);
    steps.push([snap(10, bad), T0 + AUTH_ALERT_AFTER_MS], [snap(10, bad), T0 + 3 * AUTH_ALERT_AFTER_MS]);
    const out = run(steps);
    assertEqual(out.events, [{kind: 'connection', providerId: 'claude', cause: 'auth'}]);
    steps.push([snap(10), T0 + 4 * AUTH_ALERT_AFTER_MS], [snap(10, bad), T0 + 5 * AUTH_ALERT_AFTER_MS], [snap(10, bad), T0 + 7 * AUTH_ALERT_AFTER_MS]);
    assertEqual(run(steps).events.length, 2);   // no "connected again" notice, but a new outage counts
});

test('alerts: a locked keyring and a provider never set up are not outages', () => {
    for (const reason of ['keyring', 'no_key', 'no_config']) {
        const bad = {state: 'auth_required', metrics: [], reason};
        assertEqual(run([[snap(10, bad), T0], [snap(10, bad), T0 + 3600_000]]).events, [], reason);
    }
});

test('alerts: a network trouble waits for fifteen minutes and for three poll intervals', () => {
    const bad = {state: 'network', metrics: []};
    assertEqual(run([[snap(10, bad), T0], [snap(10, bad), T0 + OUTAGE_ALERT_AFTER_MS - 1]]).events, []);
    assertEqual(run([[snap(10, bad), T0], [snap(10, bad), T0 + OUTAGE_ALERT_AFTER_MS]]).events.length, 1);
    // A provider polled hourly needs three hours, not fifteen minutes.
    const slow = run([[snap(10, bad), T0], [snap(10, bad), T0 + 2 * 3600_000]], {intervalMs: 3600_000});
    assertEqual(slow.events, []);
    assertEqual(run([[snap(10, bad), T0], [snap(10, bad), T0 + 3 * 3600_000]], {intervalMs: 3600_000}).events.length, 1);
});

test('alerts: data that is stale counts from when it was last fresh', () => {
    const stale = {source: {kind: 'stale', fetchedAt: T0}};
    assertEqual(run([[snap(10, stale), T0 + 5 * MIN]]).events, []);
    assertEqual(run([[snap(10, stale), T0 + OUTAGE_ALERT_AFTER_MS + MIN]]).events[0].cause, 'stale');
});

test('alerts: right after a resume the connection alert waits, and still fires after the grace', () => {
    const bad = {state: 'auth_required', metrics: [], reason: 'expired'};
    const quiet = T0 + 20 * MIN + RESUME_GRACE_MS;
    const steps = [[snap(10, bad), T0], [snap(10, bad), T0 + 20 * MIN, quiet]];
    assertEqual(run(steps).events, []);
    steps.push([snap(10, bad), quiet + 1000, quiet]);
    assertEqual(run(steps).events.length, 1);
    assertEqual(run([[snap(10, bad), T0], [snap(10, bad), T0 + 20 * MIN]], {settings: {connection: false}}).events, []);
});

test('alerts: events carry no text from the provider, and the input state is not changed', () => {
    const hostile = snap(99, {name: '<b>evil</b>', plan: 'secret-plan', error: 'token abc'});
    const before = JSON.stringify(emptyAlertState());
    const first = evaluate({snapshot: snap(90), state: emptyAlertState(), now: T0});
    const result = evaluate({snapshot: hostile, state: first.state, now: T0 + MIN});
    assertEqual(JSON.stringify(emptyAlertState()), before);
    const text = JSON.stringify(result.events);
    assertTrue(result.events.length === 1 && !text.includes('evil') && !text.includes('secret-plan') && !text.includes('token'), text);
});

test('alerts: settings are re-checked, because dconf can be edited by hand', () => {
    const odd = normalizeAlertSettings({thresholds: {session: {enabled: 'yes', percent: 400}, week: {percent: -5}, month: {percent: 'x'}}, hysteresis: 99});
    assertEqual([odd.thresholds.session, odd.thresholds.week.percent, odd.thresholds.month.percent, odd.hysteresis], [{enabled: true, percent: 100}, 1, 95, 20]);
    assertEqual(normalizeAlertSettings(undefined), JSON.parse(JSON.stringify(DEFAULT_ALERT_SETTINGS)));
});

test('alerts: the saved state survives a restart, and a bad file is an empty one', () => {
    const {state} = run([[snap(90), T0], [snap(96), T0 + MIN]]);
    const back = parseAlertState(serializeAlertState(state));
    assertEqual([back.problems, back.state.levels], [[], state.levels]);
    // After the restart the same high reading is not announced again.
    assertEqual(run([[snap(97), T0 + 10 * MIN]], {state: back.state}).events, []);

    for (const bad of ['', '{', '[]', 'null', '{"version":99}', 'x'.repeat(MAX_ALERT_STATE_BYTES + 1)])
        assertEqual(parseAlertState(bad).state, emptyAlertState(), bad.slice(0, 20));
    const dirty = parseAlertState(JSON.stringify({
        version: 1,
        levels: {'claude|five': {fired: 1, resetsAt: 'soon', at: null}, '../etc|x': {fired: true}, 'claude|': {fired: true}, 'Claude|five': {fired: true}},
        connection: {codex: {cause: 'auth', since: T0, alerted: true}, claude: {cause: 'bogus', since: T0}, 'x y': {cause: 'auth', since: T0}},
        sent: [T0, 'x', null], capped: 'no',
    }));
    assertEqual(dirty.state, {version: 1, levels: {'claude|five': {fired: false, resetsAt: null, at: 0}}, connection: {codex: {cause: 'auth', since: T0, alerted: true}}, sent: [T0], capped: 0});
});
