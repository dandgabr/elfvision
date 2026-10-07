import {assertEqual, assertTrue, flush, test} from './harness.js';
import {AUTH_ALERT_AFTER_MS, emptyAlertState} from '../lib/core/alerts.js';
import {AlertService, readAlertSettings} from '../lib/services/alertService.js';

const T0 = 1_800_000_000_000;
const MIN = 60 * 1000;

function fakeTimers() {
    const timers = {time: T0, jobs: new Map(), next: 1, now: () => timers.time,
        setTimeout(fn, ms) { const id = timers.next++; timers.jobs.set(id, {at: timers.time + ms, fn}); return id; },
        clearTimeout(id) { timers.jobs.delete(id); },
        advance(ms) {
            const end = timers.time + ms;
            for (;;) {
                const due = [...timers.jobs.entries()].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due)
                    break;
                timers.jobs.delete(due[0]);
                timers.time = Math.max(timers.time, due[1].at);
                due[1].fn();
            }
            timers.time = end;
        }};
    return timers;
}

function fakeSettings(values = {}) {
    const all = {'notifications-enabled': true, 'alert-connection': true, ...values};
    return {
        get_boolean: key => all[key] ?? true,
        get_int: key => all[key] ?? 95,
    };
}

function fakeController(timers) {
    const controller = {snaps: [], listeners: new Set(),
        subscribeChanges(l) { controller.listeners.add(l); return () => controller.listeners.delete(l); },
        snapshots: () => controller.snaps, intervalOf: () => 5 * MIN,
        emit(next, id = next?.id) { controller.listeners.forEach(l => l({id, previous: null, next})); }};
    return controller;
}

const store = (initial = emptyAlertState()) => ({saved: [], load: async () => ({state: initial, problems: []}), save(state) { this.saved.push(state); }});
const ok = (percent, now) => ({id: 'claude', name: 'Claude', plan: '', state: 'ok', source: {kind: 'fresh', fetchedAt: now},
    metrics: [{id: 'five', kind: 'percent', window: 'session', windowSecs: 18000, percentUsed: percent, resetsAt: now + 3600_000}]});
const rejected = {id: 'claude', name: 'Claude', plan: '', state: 'auth_required', reason: 'expired', source: {kind: 'fresh'}, metrics: []};

async function setup(settings = fakeSettings(), initial) {
    const timers = fakeTimers();
    const controller = fakeController(timers);
    const events = [];
    const files = store(initial);
    const service = new AlertService({controller, store: files, settings, notify: event => events.push(event), timers});
    await service.start();
    return {timers, controller, events, files, service};
}

test('alert service: a crossing reported by the controller is announced once', async () => {
    const {controller, events, timers, service} = await setup();
    controller.emit(ok(80, timers.now()));
    controller.emit(ok(96, timers.now()));
    controller.emit(ok(97, timers.now()));
    assertEqual(events.map(e => [e.kind, e.providerId, e.level]), [['threshold', 'claude', 'critical']]);
    service.stop();
});

test('alert service: a rejected sign-in produces one snapshot, and the timer is what announces it', async () => {
    const {controller, events, timers, service} = await setup();
    controller.snaps = [rejected];
    controller.emit(rejected);
    assertEqual(events, []);
    timers.advance(AUTH_ALERT_AFTER_MS + 2 * MIN);               // the minute timer re-evaluates the snapshots
    assertEqual(events, [{kind: 'connection', providerId: 'claude', cause: 'auth'}]);
    timers.advance(60 * MIN);
    assertEqual(events.length, 1);                                  // once per outage
    service.stop();
});

test('alert service: the quiet window after a resume holds the connection alert back', async () => {
    const {controller, events, timers, service} = await setup();
    controller.snaps = [rejected];
    controller.emit(rejected);
    timers.advance(AUTH_ALERT_AFTER_MS - 2 * MIN);                // just before the ten minutes are over
    service.quietFor(5 * MIN);                                      // ... the computer wakes up
    timers.advance(3 * MIN);                                        // past the ten minutes, inside the quiet window
    assertEqual(events, []);
    timers.advance(3 * MIN);                                        // the window is over, the sign-in is still rejected
    assertEqual(events.length, 1);
    service.stop();
});

test('alert service: with notifications off nothing is shown, and turning them on does not replay the past', async () => {
    const values = {'notifications-enabled': false};
    const {controller, events, timers, service} = await setup(fakeSettings(values));
    controller.emit(ok(80, timers.now()));
    controller.emit(ok(96, timers.now()));
    assertEqual(events, []);
    values['notifications-enabled'] = true;
    controller.emit(ok(97, timers.now()));
    assertEqual(events, []);                                        // it was already announced silently
    service.stop();
});

test('alert service: the switches and thresholds come from the settings, re-checked', async () => {
    const values = {'alert-session-enabled': false};
    const {controller, events, timers, service} = await setup(fakeSettings(values));
    controller.emit(ok(80, timers.now()));
    controller.emit(ok(99, timers.now()));
    assertEqual(events, []);
    assertEqual(readAlertSettings(fakeSettings({'alert-week-percent': 5000, 'alert-month-percent': -3})).thresholds.week.percent, 100);
    assertEqual(readAlertSettings(fakeSettings({'alert-month-percent': -3})).thresholds.month.percent, 1);
    service.stop();
});

test('alert service: a removed provider is forgotten, and the state is saved after a short wait and on stop', async () => {
    const {controller, events, files, timers, service} = await setup();
    controller.emit(ok(80, timers.now()));
    controller.emit(ok(96, timers.now()));
    assertEqual(files.saved.length, 0);                              // debounced
    timers.advance(3000);
    assertEqual(files.saved.length, 1);
    assertTrue(Object.keys(files.saved[0].levels).includes('claude|five'));
    controller.emit(null, 'claude');                                  // the provider was paused or removed
    service.stop();
    assertEqual(files.saved[files.saved.length - 1].levels, {});
    assertEqual(events.length, 1);
});

test('alert service: a notifier that throws does not stop the others, and stop is final', async () => {
    const timers = fakeTimers();
    const controller = fakeController(timers);
    let calls = 0;
    const service = new AlertService({controller, store: store(), settings: fakeSettings(), timers, notify: () => { calls++; throw null; }});
    await service.start();
    controller.emit(ok(80, timers.now()));
    controller.emit(ok(96, timers.now()));
    assertEqual(calls, 1);
    service.stop();
    controller.emit(ok(10, timers.now()));
    controller.emit(ok(96, timers.now()));
    assertEqual([calls, controller.listeners.size, timers.jobs.size], [1, 0, 0]);
    await flush();
});
