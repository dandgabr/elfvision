import {assertEqual, assertTrue, test} from './harness.js';
import {
    AUTH_ALERT_AFTER_MS, DEFAULT_ALERT_SETTINGS, MAX_ALERT_STATE_BYTES, MAX_PER_HOUR, OUTAGE_ALERT_AFTER_MS,
    RESET_JITTER_MS, RESUME_GRACE_MS, emptyAlertState, evaluate, forgetProvider, normalizeAlertSettings,
    parseAlertState, serializeAlertState, parseAlertRuleBackup, serializeAlertRuleBackup,
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
    // Polls every 50 minutes, as a real provider would, so nothing is forgotten in between.
    const between = [1, 2, 3, 4, 5, 6, 7].map(n => [snap(96), T0 + n * 50 * MIN]);
    const {events} = run([[snap(90), T0], ...between, [next, later]]);
    assertEqual(events.length, 2);
    // The reset time wobbling by seconds is not a new window.
    const wobble = snap(97, {metrics: [metric(97, {resetsAt: T0 + 3600_000 + RESET_JITTER_MS - 1000})]});
    assertEqual(run([[snap(90), T0], [snap(96), T0 + MIN], [wobble, T0 + 2 * MIN]]).events.length, 1);
});

test('alerts: the threshold and the switch are per quota type', () => {
    const week = (percent, id = 'week') => snap(percent, {metrics: [{id, kind: 'percent', window: 'week', windowSecs: 604800, percentUsed: percent}]});
    const settings = {thresholds: {week: {enabled: true, percent: 80}, session: {enabled: false, percent: 95}}};
    assertEqual(run([[week(70), T0], [week(82), T0 + MIN]], {settings}).events[0].level, 'critical');
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

test('alerts: the production network keyring failure stays quiet across repeated checks', () => {
    const locked = snap(10, {state: 'network', metrics: [], reason: 'keyring'});
    const result = run([[locked, T0], [locked, T0 + OUTAGE_ALERT_AFTER_MS], [locked, T0 + 3600_000]]);
    assertEqual(result.events, []);
    assertEqual(result.state.connection, {}, 'keyring availability must not establish an outage');
});

test('alerts: entering keyring failure clears an outage and ordinary network recovery starts a fresh wait', () => {
    const network = snap(10, {state: 'network', metrics: []});
    const locked = snap(10, {state: 'network', metrics: [], reason: 'keyring'});
    const prior = run([[network, T0], [network, T0 + OUTAGE_ALERT_AFTER_MS]]);
    assertEqual(prior.events, [{kind: 'connection', providerId: 'claude', cause: 'error'}], 'ordinary network trouble still alerts');
    const quiet = run([[locked, T0 + OUTAGE_ALERT_AFTER_MS + 1], [locked, T0 + 3600_000]], {state: prior.state});
    assertEqual([quiet.events, quiet.state.connection], [[], {}], 'entering and remaining in keyring failure clears the old outage');
    const resumedAt = T0 + 3600_000 + 1;
    const waiting = run([[network, resumedAt], [network, resumedAt + OUTAGE_ALERT_AFTER_MS - 1]], {state: quiet.state});
    assertEqual(waiting.events, [], 'time spent waiting for keyring does not shorten the new network outage delay');
    const later = run([[network, resumedAt + OUTAGE_ALERT_AFTER_MS], [network, resumedAt + 2 * OUTAGE_ALERT_AFTER_MS]], {state: waiting.state});
    assertEqual(later.events, [{kind: 'connection', providerId: 'claude', cause: 'error'}], 'ordinary network trouble rearms and announces once');
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
    assertEqual([odd.thresholds.session, odd.thresholds.week.percent, odd.thresholds.month.percent, odd.hysteresis], [{enabled: true, percent: 100, warningEnabled: false, warningPercent: 80}, 1, 95, 20]);
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
    assertEqual(dirty.state, {version: 2, levels: {'claude|five': {fired: false, warningFired: false, baseline: true, resetsAt: null, at: 0}}, connection: {codex: {cause: 'auth', since: T0, alerted: true}}, sent: [T0], capped: 0});
});

test('alerts: a threshold exactly at the limit, and the edges of the hysteresis', () => {
    // Exactly at the threshold counts; one point under does not.
    assertEqual(run([[snap(90), T0], [snap(94.9), T0 + MIN]]).events.length, 0);
    assertEqual(run([[snap(90), T0], [snap(95), T0 + MIN]]).events.length, 1);
    // Exactly threshold - hysteresis re-arms; one tenth above does not.
    const base = [[snap(90), T0], [snap(96), T0 + MIN]];
    assertEqual(run([...base, [snap(92.1), T0 + 2 * MIN], [snap(96), T0 + 3 * MIN]]).events.length, 1);
    assertEqual(run([...base, [snap(92), T0 + 2 * MIN], [snap(96), T0 + 3 * MIN]]).events.length, 2);
});

test('alerts: a hysteresis of zero cannot make an alert fire on every poll', () => {
    const settings = {hysteresis: 0};
    assertEqual(normalizeAlertSettings(settings).hysteresis, 1);
    const steps = [[snap(90), T0]];
    for (let i = 1; i <= 5; i++)
        steps.push([snap(95), T0 + i * MIN]);
    assertEqual(run(steps, {settings}).events.length, 1);
});

test('alerts: one outage is one alert, whatever its cause turns into', () => {
    const net = {state: 'network', metrics: []};
    const auth = {state: 'auth_required', metrics: [], reason: 'expired'};
    const steps = [[snap(10, net), T0], [snap(10, net), T0 + OUTAGE_ALERT_AFTER_MS], [snap(10, auth), T0 + OUTAGE_ALERT_AFTER_MS + MIN],
        [snap(10, net), T0 + OUTAGE_ALERT_AFTER_MS + 2 * MIN], [snap(10, auth), T0 + 2 * OUTAGE_ALERT_AFTER_MS]];
    assertEqual(run(steps).events.length, 1);
    // The clock keeps running across a change of cause: auth after the network trouble is not a fresh ten minutes.
    const flip = [[snap(10, net), T0], [snap(10, auth), T0 + MIN], [snap(10, auth), T0 + AUTH_ALERT_AFTER_MS]];
    assertEqual(run(flip).events.length, 1);
});

test('alerts: a time in the future in the state cannot silence alerts', () => {
    const future = T0 + 400 * 24 * 3600_000;
    const state = {...emptyAlertState(), sent: [future, future, future], capped: future,
        levels: {'claude|five': {fired: true, resetsAt: future, at: future}},
        connection: {claude: {cause: 'auth', since: future, alerted: false}}};
    const out = run([[snap(80), T0], [snap(99), T0 + MIN]], {state});
    assertEqual(out.events.length, 1);                 // the cap did not hold it back, and the re-arm worked
    const bad = {state: 'auth_required', metrics: [], reason: 'expired'};
    // A start time in the future is taken as now, so the ten minutes count from the first look.
    assertEqual(run([[snap(10, bad), T0], [snap(10, bad), T0 + AUTH_ALERT_AFTER_MS]], {state}).events.length, 1);
});

test('alerts: what was seen long ago is forgotten, so a restart does not announce an old state', () => {
    const old = {...emptyAlertState(), levels: {'claude|five': {fired: false, resetsAt: T0 + 3600_000, at: T0 - 30 * 3600_000}}};
    assertEqual(run([[snap(97), T0]], {state: old}).events, []);                          // too old: a first sight
    // A few hours (a long lock, a night) is not too old: below before and above now is a crossing.
    const lunch = {...emptyAlertState(), levels: {'claude|five': {fired: false, resetsAt: T0 + 3600_000, at: T0 - 5 * 3600_000}}};
    assertEqual(run([[snap(97), T0]], {state: lunch}).events.length, 1);
    const recent = {...emptyAlertState(), levels: {'claude|five': {fired: false, resetsAt: T0 + 3600_000, at: T0 - 5 * MIN}}};
    assertEqual(run([[snap(97), T0]], {state: recent}).events.length, 1);                  // recent: a real crossing
    // A provider polled once a day keeps its memory for three intervals.
    const daily = {...emptyAlertState(), levels: {'claude|five': {fired: false, resetsAt: null, at: T0 - 50 * 3600_000}}};
    assertEqual(run([[snap(97), T0]], {state: daily, intervalMs: 24 * 3600_000}).events.length, 1);
});

test('alerts: a metric that is briefly missing keeps its memory, and a removed provider starts over', () => {
    const empty = {metrics: []};
    const {events} = run([[snap(90), T0], [snap(96), T0 + MIN], [snap(10, empty), T0 + 2 * MIN], [snap(97), T0 + 3 * MIN]]);
    assertEqual(events.length, 1);                      // it was announced once and is still "fired" when it returns
    const gone = forgetProvider(run([[snap(90), T0], [snap(96), T0 + MIN]]).state, 'claude');
    assertEqual(run([[snap(97), T0 + 2 * MIN]], {state: gone}).events, []);              // a first sight again
});

test('alerts: a state this module does not know is never an outage', () => {
    assertEqual(run([[snap(10, {state: 'loading', metrics: []}), T0], [snap(10, {state: 'loading', metrics: []}), T0 + 3600_000]]).events, []);
});

const dual = {thresholds: {session: {enabled: true, percent: 95, warningEnabled: true, warningPercent: 80}}};
test('alerts: warning escalates once to critical; jumping both announces only critical', () => {
    assertEqual(run([[snap(70), T0], [snap(80), T0+MIN], [snap(95), T0+2*MIN], [snap(96), T0+3*MIN]], {settings: dual}).events.map(e=>e.level), ['warning','critical']);
    assertEqual(run([[snap(70), T0], [snap(98), T0+MIN], [snap(99), T0+2*MIN]], {settings: dual}).events.map(e=>e.level), ['critical']);
});
test('alerts: independent warning and critical hysteresis rearms each level', () => {
    assertEqual(run([[snap(70),T0],[snap(95),T0+MIN],[snap(92.1),T0+2*MIN],[snap(95),T0+3*MIN],[snap(92),T0+4*MIN],[snap(95),T0+5*MIN]], {settings:dual}).events.map(e=>e.level),['critical','critical']);
    assertEqual(run([[snap(70),T0],[snap(80),T0+MIN],[snap(77.1),T0+2*MIN],[snap(80),T0+3*MIN],[snap(77),T0+4*MIN],[snap(80),T0+5*MIN]], {settings:dual}).events.map(e=>e.level),['warning','warning']);
});
test('alerts: settings edits seed a fresh baseline instead of announcing backlog', () => {
    const first=evaluate({snapshot:snap(70),state:emptyAlertState(),settings:dual,now:T0});
    const edited={thresholds:{session:{enabled:true,percent:75,warningEnabled:true,warningPercent:60}}};
    const baseline=evaluate({snapshot:snap(80),state:first.state,settings:edited,now:T0+MIN});
    assertEqual(baseline.events,[]);
    assertEqual(evaluate({snapshot:snap(81),state:baseline.state,settings:edited,now:T0+2*MIN}).events,[]);
});
test('alerts: v1 migration retains cap/connection and suppresses initial backlog', () => {
    const old={version:1,levels:{'claude|five':{fired:false,resetsAt:T0+3600_000,at:T0}},connection:{codex:{cause:'auth',since:T0,alerted:true}},sent:[T0],capped:T0};
    const migrated=parseAlertState(JSON.stringify(old));
    assertEqual(migrated.problems,[]);assertEqual(migrated.state.version,2);
    assertEqual([migrated.state.sent,migrated.state.capped,migrated.state.connection],[old.sent,old.capped,old.connection]);
    assertEqual(run([[snap(98),T0+MIN],[snap(99),T0+2*MIN]],{state:migrated.state,settings:dual}).events,[]);
});
test('alerts: invalid enabled pair keeps previous valid thresholds', () => {
    const previous=normalizeAlertSettings(dual);
    const bad=normalizeAlertSettings({thresholds:{session:{enabled:true,percent:70,warningEnabled:true,warningPercent:80}}},previous);
    assertEqual([bad.thresholds.session.percent,bad.thresholds.session.warningPercent],[95,80]);
});

test('alerts: stale input cannot establish a settings baseline or create warning backlog', () => {
    const low=evaluate({snapshot:snap(70),state:emptyAlertState(),settings:dual,now:T0});
    const changed={thresholds:{session:{enabled:true,percent:90,warningEnabled:true,warningPercent:60}}};
    const stale=evaluate({snapshot:snap(99,{source:{kind:'stale',fetchedAt:T0}}),state:low.state,settings:changed,now:T0+MIN});
    assertEqual(stale.state.levels,low.state.levels);
    assertEqual(evaluate({snapshot:snap(99),state:stale.state,settings:changed,now:T0+2*MIN}).events,[]);
});
test('alerts: saved dual latches dedupe after restart and window reset rearms both', () => {
    const fired=run([[snap(70),T0],[snap(96),T0+MIN]],{settings:dual});
    const saved=parseAlertState(serializeAlertState(fired.state));
    assertEqual(run([[snap(99),T0+2*MIN]],{settings:dual,state:saved.state}).events,[]);
    const reset=snap(96,{metrics:[metric(96,{resetsAt:T0+7200_000})]});
    assertEqual(run([[reset,T0+3*MIN]],{settings:dual,state:saved.state}).events.map(e=>e.level),['critical']);
});
test('alerts: several metrics coalesce at the highest newly crossed level', () => {
    const s=(a,b)=>snap(a,{metrics:[metric(a),metric(b,{id:'other'})]});
    const result=run([[s(70,70),T0],[s(82,96),T0+MIN]],{settings:dual});
    assertEqual(result.events.length,1);assertEqual(result.events[0].level,'critical');
    assertEqual(result.events[0].crossings.map(c=>c.level),['warning','critical']);
});
test('alerts: live records remain bounded even for many valid synthetic metrics', () => {
    const metrics=Array.from({length:400},(_,i)=>metric(50,{id:`m${i}`}));
    const result=evaluate({snapshot:snap(50,{metrics}),state:emptyAlertState(),settings:dual,now:T0});
    assertEqual(Object.keys(result.state.levels).length,256);
    assertTrue(serializeAlertState(result.state)!==null);
});

test('alerts: invalid warning enable preserves a critical-only custom threshold of one', () => {
    const previous=normalizeAlertSettings({thresholds:{session:{percent:1,warningEnabled:false,warningPercent:80}}});
    const next=normalizeAlertSettings({thresholds:{session:{percent:1,warningEnabled:true,warningPercent:80}}},previous);
    assertEqual(next.thresholds.session,previous.thresholds.session);
});

test('alerts: migrated fired latch belongs only to its known reset window', () => {
    const old=parseAlertState(JSON.stringify({version:1,levels:{'claude|five':{fired:true,resetsAt:T0+3600_000,at:T0}}})).state;
    const newWindow=(percent)=>snap(percent,{metrics:[metric(percent,{resetsAt:T0+7200_000})]});
    assertEqual(run([[newWindow(94),T0+MIN],[newWindow(95),T0+2*MIN]],{state:old,settings:dual}).events.map(e=>e.level),['critical']);
});

test('alerts: invalid warning pair preserves customized critical on restart without previous state', () => {
    const rule=normalizeAlertSettings({thresholds:{session:{enabled:true,percent:1,warningEnabled:true,warningPercent:80}}}).thresholds.session;
    assertEqual(rule,{enabled:true,percent:1,warningEnabled:false,warningPercent:80});
});
test('alerts: missing malformed or impossible v2 rule signatures require a quiet fresh baseline', () => {
    for (const rules of [undefined,'bad','999|true|999','95|true|95','0|false|80','95|false|0','95|true|080']) {
        const state=parseAlertState(JSON.stringify({version:2,levels:{'claude|five':{fired:false,warningFired:false,rules,resetsAt:T0+3600_000,at:T0}}})).state;
        assertEqual(state.levels['claude|five'].baseline,true);
        assertEqual(evaluate({snapshot:snap(96),state,settings:dual,now:T0+MIN}).events,[]);
    }
});

test('alerts: persisted valid rule backup is canonical bounded and rejects foreign/invalid data', () => {
    const rules=normalizeAlertSettings(dual);
    const text=serializeAlertRuleBackup(rules);
    assertEqual(serializeAlertRuleBackup(parseAlertRuleBackup(text)),text);
    for(const bad of ['',null,'null','[]','x'.repeat(2049),JSON.stringify({session:rules.thresholds.session})])
        assertEqual(parseAlertRuleBackup(bad),null);
    for(const [key,value] of [['percent',0],['percent',101],['percent',2.5],['warningPercent',0],['warningPercent',100],['warningEnabled','true'],['enabled',1],['script','x']]) {
        const copy=JSON.parse(text);copy.session[key]=value;assertEqual(parseAlertRuleBackup(JSON.stringify(copy)),null);
    }
    const invalid=JSON.parse(text);invalid.session.percent=75;assertEqual(parseAlertRuleBackup(JSON.stringify(invalid)),null);
});
