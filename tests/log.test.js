import GLib from 'gi://GLib';

import {assertEqual, assertTrue, flush, test} from './harness.js';
import {EVENTS, LEVELS, TYPES, validatorFor} from '../lib/core/logEvents.js';
import {createLogger, errorName, nullLogger} from '../lib/core/log.js';
import {journalSink, setLogProcess} from '../lib/services/diagnostics.js';
import {PollScheduler} from '../lib/core/scheduler.js';
import {ERROR_CODES, ProviderError, REASONS} from '../lib/core/errors.js';

const SENTINELS = [
    'SECRET-TOKEN-1234567890', 'https://api.example.com/v1/x?code=ABCDEF&state=ZZ', '/home/daniel/.config/x',
    'daniel@example.com', 'line\r\nforged: ELFVISION_EVENT=x', '\u001b[31mred', 'a b', 'claude--123e4567-e89b-12d3-a456-426614174000',
];

const capture = options => {
    const lines = [];
    const clock = {at: 0};
    const logger = createLogger({sink: line => lines.push(line), now: () => clock.at, ...options});
    return {lines, clock, logger};
};

test('log: only catalog events are written, with only their declared fields', () => {
    const {lines, logger} = capture({level: 'debug'});
    logger.log('not.an.event', {host: 'x'});
    logger.log('http.completed', {host: 'api.openai.com', method: 'GET', status: 200, durationMs: 12, bytes: 3,
        url: 'https://api.openai.com/secret', authorization: 'Bearer abc'});
    assertEqual(lines.length, 1);
    assertEqual(lines[0], {event: 'http.completed', level: 'debug',
        fields: {host: 'api.openai.com', method: 'GET', status: 200, durationMs: 12, bytes: 3}});
});

test('log: a value of the wrong type is dropped, never coerced', () => {
    const {lines, logger} = capture({level: 'debug'});
    logger.log('http.completed', {host: 'API.example.com/path', method: 'TRACE', status: -1, durationMs: 1.5, bytes: '12'});
    assertEqual(lines[0].fields, {});
});

test('log: levels gate events and "off" writes nothing', () => {
    const {lines, logger} = capture({level: 'warn'});
    logger.log('http.completed', {host: 'api.openai.com'});          // debug
    logger.log('ext.enabled');                                       // info
    logger.log('http.failed', {host: 'api.openai.com', cause: 'timeout'});
    assertEqual(lines.map(line => line.event), ['http.failed']);
    logger.setLevel('off');
    logger.log('http.rejected', {cause: 'host'});
    assertEqual(lines.length, 1);
    logger.setLevel('nonsense');
    assertEqual(logger.level, 'off');
});

test('log: a repeating failure is written once a minute with a count', () => {
    const {lines, clock, logger} = capture({level: 'warn'});
    for (let index = 0; index < 5; index++) {
        clock.at = index * 1000;
        logger.log('provider.fetch_failed', {provider: 'codex', code: 'network', failures: index + 1});
    }
    assertEqual(lines.length, 1);
    clock.at = 61000;
    logger.log('provider.fetch_failed', {provider: 'codex', code: 'network', failures: 6});
    assertEqual(lines.length, 2);
    assertEqual(lines[1].fields.suppressed, 4);
    // Another provider or code is another key.
    logger.log('provider.fetch_failed', {provider: 'claude', code: 'network'});
    logger.log('provider.fetch_failed', {provider: 'codex', code: 'auth_required'});
    assertEqual(lines.length, 4);
});

test('log: it never throws, whatever the sink or the fields', () => {
    const logger = createLogger({sink: () => { throw new Error('sink down'); }, level: 'debug'});
    const circular = {}; circular.self = circular;
    for (const fields of [undefined, null, 5, 'x', circular, {host: circular}, {get host() { throw new Error('getter'); }}])
        logger.log('http.completed', fields);
    logger.log(undefined); logger.log(null); logger.log({});
    nullLogger.log('http.completed', {});
    assertTrue(true);
});

test('log: the catalog has no free text and keeps provider ids off routine lines', () => {
    const known = new Set(Object.keys(TYPES));
    for (const [name, spec] of Object.entries(EVENTS)) {
        assertTrue(LEVELS.includes(spec.level) && spec.level !== 'off', `${name} has a level`);
        assertTrue(/^[a-z]+(\.[a-z_]+)+$/.test(name), `${name} is a plain event name`);
        for (const [field, type] of Object.entries(spec.fields)) {
            assertTrue(typeof type === 'function' || known.has(type), `${name}.${field} has a declared type`);
            assertTrue(validatorFor(type)('x'.repeat(5000)) === false, `${name}.${field} rejects long text`);
            assertTrue(!/url|path|uri|message|label|name$|user|mail|token|secret|key|header|body|plan/i.test(field) || field === 'errorName',
                `${name}.${field} is not a field that could carry user or provider text`);
        }
        if ('provider' in spec.fields)
            assertTrue(['debug', 'warn', 'error'].includes(spec.level), `${name} must not log a provider on an info line`);
    }
});

test('log: no sentinel survives any event, and every declared value survives', () => {
    const {lines, logger} = capture({level: 'debug'});
    let clock = 0;
    const timed = createLogger({sink: line => lines.push(line), level: 'debug', now: () => (clock += 100000)});
    for (const sentinel of SENTINELS) {
        for (const [name, spec] of Object.entries(EVENTS)) {
            const hostile = {};
            for (const field of [...Object.keys(spec.fields), 'connectorId', 'url', 'path', 'message', 'label', 'username', 'email', 'token', 'code', 'state'])
                hostile[field] = sentinel;
            timed.log(name, hostile);
            logger.log(name, hostile);
        }
    }
    const text = JSON.stringify(lines);
    for (const sentinel of SENTINELS) {
        assertTrue(!text.includes(JSON.stringify(sentinel).slice(1, -1)) && !text.includes(sentinel), `a sentinel leaked: ${sentinel.slice(0, 20)}`);
    }
    // Positive control: a valid value for every field of every event is kept.
    const sample = {int: 7, bool: true, token: 'abc', host: 'api.openai.com', provider: 'codex'};
    for (const [name, spec] of Object.entries(EVENTS)) {
        const fields = {};
        const expected = {};
        for (const [field, type] of Object.entries(spec.fields)) {
            const value = typeof type === 'string' ? sample[type] : ['GET', 'timeout', 'address', 'lookup', 'locked', 'timer', 'network',
                'controller', 'cache', 'read', 'invalid', 'inventory', 'notify', 'bar', 'watch', 'Error', 'auth_required', 'no_key', 'host',
                'port_busy'].find(candidate => type(candidate));
            assertTrue(value !== undefined, `${name}.${field} has a sample`);
            fields[field] = value; expected[field] = value;
        }
        const control = capture({level: 'debug'});
        control.logger.log(name, fields);
        assertEqual(control.lines.length, 1, `${name} was written`);
        assertEqual(control.lines[0].fields, expected);
    }
});

test('log: an exception is reduced to a class, never its message', () => {
    assertEqual(errorName(new TypeError('secret https://x')), 'TypeError');
    assertEqual(errorName({name: 'Weird'}), 'other');
    assertEqual(errorName(null), 'other');
});

// log_set_writer_func can be installed once per process, so the real-writer checks share one test.
test('log: the journal sink writes string fields through the real GLib writer', () => {
    const seen = [];
    GLib.log_set_writer_func((level, fields) => {
        const record = {};
        for (const [key, value] of Object.entries(fields))
            record[key] = typeof value === 'string' ? value : new TextDecoder().decode(value);
        if (record.GLIB_DOMAIN === 'Elfvision') {
            seen.push(record);
            return GLib.LogWriterOutput.HANDLED;
        }
        return GLib.log_writer_default(level, fields);
    });
    setLogProcess('prefs');
    journalSink({event: 'http.failed', level: 'warn', fields: {host: 'api.openai.com', cause: 'timeout', durationMs: 25000}});
    journalSink({event: 'ext.enabled', level: 'info', fields: {count: 3}});
    journalSink({event: 'provider.fetch_started', level: 'debug', fields: {provider: 'codex', attempt: 1}});
    assertEqual(seen.length, 3);
    assertEqual(seen[0].MESSAGE, 'http.failed');
    assertEqual([seen[0].ELFVISION_EVENT, seen[0].ELFVISION_PROCESS, seen[0].ELFVISION_HOST, seen[0].ELFVISION_CAUSE, seen[0].ELFVISION_DURATION_MS, seen[0].PRIORITY],
        ['http.failed', 'prefs', 'api.openai.com', 'timeout', '25000', '4']);
    // Informational lines are not dropped by the default writer and keep their own priority.
    assertEqual([seen[1].ELFVISION_COUNT, seen[1].PRIORITY, seen[2].PRIORITY, seen[2].ELFVISION_PROVIDER], ['3', '6', '7', 'codex']);
    setLogProcess('shell');
});

// ---------------------------------------------------------- the scheduler's events

class Clock {
    time = 1_000_000;
    timers = new Map();
    next = 1;
    now = () => this.time;
    setTimeout = (fn, ms) => { const id = this.next++; this.timers.set(id, {at: this.time + ms, fn}); return id; };
    clearTimeout = id => { this.timers.delete(id); };
    async advance(ms) {
        const target = this.time + ms;
        for (;;) {
            await flush();
            const due = [...this.timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            this.timers.delete(due[0]);
            this.time = Math.max(this.time, due[1].at);
            due[1].fn();
        }
        this.time = target;
        await flush();
    }
}

const failing = (id, error) => ({id, name: id, plan: 'Pro', intervalMs: 300000, fetch: () => Promise.reject(error)});

test('log: every failure code a provider can raise becomes exactly one line, without its message', async () => {
    for (const code of ERROR_CODES) {
        const clock = new Clock();
        const lines = [];
        const logger = createLogger({sink: line => lines.push(line), level: 'warn', now: clock.now});
        const scheduler = new PollScheduler({timers: clock, onSnapshot: () => {}, random: () => 0.5, logger});
        scheduler.add(failing('codex', new ProviderError(code, 'SECRET-TOKEN-1234567890 https://x/?code=1', {reason: REASONS[0]})));
        scheduler.start();
        await clock.advance(5000);
        scheduler.stop();
        const failures = lines.filter(line => line.event === 'provider.fetch_failed');
        assertEqual(failures.length, 1, `${code}: one failure line`);
        assertEqual([failures[0].fields.provider, failures[0].fields.code, failures[0].fields.failures], ['codex', code, 1]);
        assertTrue(!JSON.stringify(lines).includes('SECRET-TOKEN'), `${code}: the message stays out`);
    }
});

test('log: an hour of constant failure writes at most a line a minute per provider', async () => {
    const clock = new Clock();
    const lines = [];
    const logger = createLogger({sink: line => lines.push(line), level: 'warn', now: clock.now});
    const scheduler = new PollScheduler({timers: clock, onSnapshot: () => {}, random: () => 0.5,
        settings: {backoffBaseMs: 1000, backoffMaxMs: 5000}, logger});
    scheduler.add(failing('claude', new ProviderError('network', 'down')));
    scheduler.start();
    await clock.advance(3600 * 1000 - 1);
    scheduler.stop();
    const own = lines.filter(line => line.fields.provider === 'claude');
    assertTrue(own.length > 1 && own.length <= 60, `${own.length} lines`);
    assertTrue(own.some(line => line.fields.suppressed > 0), 'the repeats are counted');
});
