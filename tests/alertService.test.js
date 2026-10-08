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
    const handlers = new Map();
    let next = 1;
    const settings = {
        reads: 0,
        get_boolean: key => { settings.reads++; return all[key] ?? !key.endsWith('-warning-enabled'); },
        get_int: key => { settings.reads++; return all[key] ?? (key.endsWith('-warning-percent') ? 80 : 95); },
        connect: (_signal, fn) => { handlers.set(next, fn); return next++; },
        disconnect: id => handlers.delete(id),
        handlers,
        get_string: key => all[key] ?? '',
        set_string: (key, value) => { all[key] = value; handlers.forEach(fn => fn(settings, key)); },
        change: (key, value) => { all[key] = value; handlers.forEach(fn => fn(settings, key)); },
        changeMany: values => { Object.assign(all, values); handlers.forEach(fn => fn(settings, Object.keys(values)[0])); },
    };
    return settings;
}

function fakeController(timers) {
    const controller = {snaps: [], listeners: new Set(), synced: true,
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

test('alert service: disconnect stop does not flush or later recreate erased alert state', async () => {
    const {controller, files, timers, service} = await setup();
    controller.emit(ok(80, timers.now()));
    service.stop({flush: false});
    timers.advance(10 * MIN);
    assertEqual(files.saved, []);
    assertEqual(controller.listeners.size, 0);
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
    const settings = fakeSettings({'notifications-enabled': false});
    const {controller, events, timers, service} = await setup(settings);
    controller.emit(ok(80, timers.now()));
    controller.emit(ok(96, timers.now()));
    assertEqual(events, []);
    settings.change('notifications-enabled', true);
    controller.emit(ok(97, timers.now()));
    assertEqual(events, []);                                        // it was already announced silently
    service.stop();
});

test('alert service: the switches and thresholds come from the settings, re-checked', async () => {
    const {controller, events, timers, service} = await setup(fakeSettings({'alert-session-enabled': false}));
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

test('alert service: nothing is announced until the providers are known, and the settings are read once', async () => {
    const settings = fakeSettings();
    const {controller, events, timers, service} = await setup(settings);
    controller.synced = false;
    controller.snaps = [rejected];
    controller.emit(ok(80, timers.now()));
    controller.emit(ok(96, timers.now()));
    timers.advance(30 * MIN);
    assertEqual(events, []);                                        // a cached value of a provider not confirmed yet
    controller.synced = true;
    controller.emit(ok(80, timers.now()));
    controller.emit(ok(96, timers.now()));
    controller.emit(ok(80, timers.now()));
    const reads = settings.reads;
    controller.emit(ok(97, timers.now()));
    controller.emit(ok(98, timers.now()));
    assertEqual(settings.reads, reads);                             // cached between changes
    settings.change('alert-session-percent', 99);
    controller.emit(ok(98, timers.now()));
    assertTrue(settings.reads > reads, 'read again after a change');
    service.stop();
    assertEqual(settings.handlers.size, 0);
});

test('alert service: a stop while the file is being read, or a restart, leaves nothing behind', async () => {
    const timers = fakeTimers();
    const controller = fakeController(timers);
    let release;
    const slow = {saved: [], load: () => new Promise(resolve => { release = () => resolve({state: emptyAlertState(), problems: []}); }), save() {}};
    const service = new AlertService({controller, store: slow, settings: fakeSettings(), timers, notify() {}});
    const starting = service.start();
    service.stop();
    release();
    await starting;
    assertEqual([controller.listeners.size, timers.jobs.size], [0, 0]);

    const again = new AlertService({controller, store: store(), settings: fakeSettings(), timers, notify() {}});
    await again.start();
    again.stop();
    await again.start();
    assertEqual([controller.listeners.size, timers.jobs.size], [1, 1]);
    again.stop();
    assertEqual([controller.listeners.size, timers.jobs.size], [0, 0]);
});

import {PowerWatcher} from '../lib/services/power.js';

test('power: a wake-up is reported, a suspend is told apart, and a stop ends the subscription', async () => {
    const subscribed = [];
    const connection = {signal_subscribe(...args) { subscribed.push(args); return 7; }, signal_unsubscribe(id) { subscribed.push(['off', id]); }};
    const calls = [];
    const watcher = new PowerWatcher({bus: async () => connection, onResume: () => calls.push('resume'), onSuspend: () => calls.push('suspend')});
    await watcher.start();
    const handler = subscribed[0][6];
    const parameters = value => ({deepUnpack: () => [value]});
    handler(null, null, null, null, null, parameters(true));
    handler(null, null, null, null, null, parameters(false));
    assertEqual(calls, ['suspend', 'resume']);
    assertEqual([subscribed[0][0], subscribed[0][2], subscribed[0][3]], ['org.freedesktop.login1', 'PrepareForSleep', '/org/freedesktop/login1']);
    watcher.stop();
    assertEqual(subscribed[1], ['off', 7]);
});

test('power: a stop while the bus is being reached, or no bus at all, is harmless', async () => {
    let release;
    let subscribedAfterStop = 0;
    const connection = {signal_subscribe() { subscribedAfterStop++; return 1; }, signal_unsubscribe() {}};
    const slow = new PowerWatcher({bus: () => new Promise(resolve => { release = () => resolve(connection); }), onResume() {}});
    const starting = slow.start();
    slow.stop();
    release();
    await starting;
    assertEqual(subscribedAfterStop, 0);
    const broken = new PowerWatcher({bus: async () => { throw new Error('no bus'); }, onResume() {}});
    await broken.start();                       // only a warning
    broken.stop();
});

test('alert service: rapid invalid pair edits retain cached valid rules without backlog', async () => {
    const settings=fakeSettings({'alert-session-warning-enabled':true,'alert-session-warning-percent':80,'alert-session-percent':95});
    const {controller,events,service,timers}=await setup(settings);
    controller.emit(ok(70,timers.time));
    settings.change('alert-session-percent',75);
    controller.emit(ok(81,timers.time+MIN));
    assertEqual(events.map(e=>e.level),['warning']); // invalid75 critical did not replace95
    settings.change('alert-session-warning-percent',60);
    controller.emit(ok(81,timers.time+2*MIN));
    assertEqual(events.map(e=>e.level),['warning']); // now valid60/75 is seeded quietly
    controller.emit(ok(70,timers.time+3*MIN));
    controller.emit(ok(76,timers.time+4*MIN));
    assertEqual(events.map(e=>e.level),['warning','critical']);
    service.stop();
});

test('alert service: migrated v1 records and warning opt-in seed without startup notifications', async () => {
    const {parseAlertState}=await import('../lib/core/alerts.js');
    const old=parseAlertState(JSON.stringify({version:1,levels:{'claude|five':{fired:false,resetsAt:T0+3600_000,at:T0}},connection:{},sent:[T0],capped:T0})).state;
    const settings=fakeSettings();
    const {controller,events,service,timers,files}=await setup(settings,old);
    controller.emit(ok(97,timers.time));
    settings.change('alert-session-warning-enabled',true);
    controller.emit(ok(99,timers.time+MIN));
    assertEqual(events,[]);
    service.stop();
    assertEqual(files.saved.at(-1).sent,[T0]);assertEqual(files.saved.at(-1).capped,T0);
});

test('alert service: valid settings persist before any snapshot and invalid edits survive six restarts', async () => {
    const settings=fakeSettings({'alert-session-warning-enabled':true,'alert-session-warning-percent':60,'alert-session-percent':90});
    let running=await setup(settings);
    settings.change('alert-session-warning-percent',65);
    const backup=settings.get_string('alert-valid-rules');
    assertTrue(backup.includes('65'),'valid edit saved immediately before snapshot');
    settings.change('alert-session-warning-percent',80);
    settings.change('alert-session-percent',75);
    const saved=settings.get_string('alert-valid-rules');
    running.service.stop();
    for(let i=0;i<6;i++) {
        running=await setup(settings);
        running.controller.emit(ok(70,T0));
        assertEqual(running.service._quotaRules.thresholds.session,{enabled:true,percent:90,warningEnabled:true,warningPercent:80});
        assertEqual(settings.get_string('alert-valid-rules'),saved);
        running.service.stop();
    }
});

test('alert service: atomic invalid dconf pair retains exact persisted sixty/ninety across restart', async () => {
    const settings=fakeSettings({'alert-session-warning-enabled':true,'alert-session-warning-percent':60,'alert-session-percent':90});
    const first=await setup(settings);
    settings.changeMany({'alert-session-warning-percent':80,'alert-session-percent':75});
    assertEqual(first.service._quotaRules.thresholds.session,{enabled:true,percent:90,warningEnabled:true,warningPercent:60});
    first.service.stop();
    const next=await setup(settings);
    assertEqual(next.service._quotaRules.thresholds.session,first.service._quotaRules.thresholds.session);
    next.controller.emit(ok(96,T0));assertEqual(next.events,[]);
    next.service.stop();
});
