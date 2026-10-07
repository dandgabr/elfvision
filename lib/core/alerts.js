// Decides when the user is told something (docs/adr/0010): a quota that crossed its threshold, or
// a provider that has been failing for too long. Pure JavaScript, no GObject imports: the caller
// owns the clock, the persistence and the notification itself, and this module only turns
// snapshots into events and a new state.
//
// Events carry no text. The notifier turns them into translated sentences, so the wording is
// reviewed in one place and nothing a provider sent can reach a notification.

import {CRIT_AT, severityOf} from './severity.js';

export const ALERT_STATE_VERSION = 1;
export const MAX_ALERT_STATE_BYTES = 64 * 1024;
const MAX_ENTRIES = 256;

export const QUOTA_TYPES = ['session', 'week', 'month', 'credits'];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** A reset time that moves forward by more than this is a new window (APIs wobble by seconds). */
export const RESET_JITTER_MS = 5 * MINUTE_MS;
/** How long a rejected or expired sign-in has to last before the user is told. */
export const AUTH_ALERT_AFTER_MS = 10 * MINUTE_MS;
/** Data that is stale or failing for this long (and for three poll intervals) is an outage. */
export const OUTAGE_ALERT_AFTER_MS = 15 * MINUTE_MS;
export const OUTAGE_INTERVALS = 3;
/** After waking from suspend, a connection alert stays quiet for this long. */
export const RESUME_GRACE_MS = 90 * 1000;
/** Quota notifications per hour; more are folded into one summary. */
export const MAX_PER_HOUR = 3;

export const DEFAULT_ALERT_SETTINGS = Object.freeze({
    thresholds: Object.freeze({
        session: Object.freeze({enabled: true, percent: CRIT_AT}),
        week: Object.freeze({enabled: true, percent: CRIT_AT}),
        month: Object.freeze({enabled: true, percent: CRIT_AT}),
        credits: Object.freeze({enabled: true, percent: CRIT_AT}),
    }),
    hysteresis: 3,
    connection: true,
});

/**
 * Settings can be edited by hand in dconf, so they are re-checked whenever they are read.
 *
 * @param {object} [raw]
 * @returns {{thresholds: object, hysteresis: number, connection: boolean}}
 */
export function normalizeAlertSettings(raw) {
    const thresholds = {};
    for (const type of QUOTA_TYPES) {
        const entry = raw?.thresholds?.[type];
        const percent = Number.isFinite(entry?.percent) ? Math.round(entry.percent) : CRIT_AT;
        thresholds[type] = {
            enabled: entry?.enabled !== false,
            percent: Math.max(1, Math.min(100, percent)),
        };
    }
    const hysteresis = Number.isFinite(raw?.hysteresis) ? Math.round(raw.hysteresis) : DEFAULT_ALERT_SETTINGS.hysteresis;
    return {
        thresholds,
        hysteresis: Math.max(0, Math.min(20, hysteresis)),
        connection: raw?.connection !== false,
    };
}

export const emptyAlertState = () => ({version: ALERT_STATE_VERSION, levels: {}, connection: {}, sent: [], capped: 0});

const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const METRIC_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

/** The kind of quota a metric is, for the settings; null for one that never alerts. */
export function quotaTypeOf(metric) {
    if (metric.kind === 'money')
        return 'credits';
    return metric.window === 'session' || metric.window === 'week' || metric.window === 'month' ? metric.window : null;
}

const keyOf = (providerId, metricId) => `${providerId}|${metricId}`;

/** Forget everything about a provider that is no longer tracked. */
export function forgetProvider(state, providerId) {
    const next = clone(state);
    for (const key of Object.keys(next.levels)) {
        if (key.startsWith(`${providerId}|`))
            delete next.levels[key];
    }
    delete next.connection[providerId];
    return next;
}

function evaluateQuota(snapshot, state, settings, now, events) {
    const reading = snapshot.state === 'ok' && snapshot.source?.kind !== 'stale' && !snapshot.expired;
    if (!reading)
        return;   // an old or missing value says nothing about the quota

    const seen = new Set();
    const crossings = [];
    for (const metric of snapshot.metrics ?? []) {
        const type = quotaTypeOf(metric);
        if (!type || !finite(metric.percentUsed) || !METRIC_ID.test(metric.id))
            continue;
        const key = keyOf(snapshot.id, metric.id);
        seen.add(key);
        const rule = settings.thresholds[type];
        if (!rule.enabled) {
            delete state.levels[key];   // turned on again later, it is seen for the first time
            continue;
        }

        const percent = metric.percentUsed;
        const resetsAt = finite(metric.resetsAt) ? metric.resetsAt : null;
        let entry = state.levels[key];
        if (!entry) {
            // First sight, or the first run after a restart with no file: a state that already
            // existed is shown by the bar and the popup, and is not announced.
            state.levels[key] = {fired: percent >= rule.percent, resetsAt, at: now};
            continue;
        }
        const newWindow = resetsAt !== null && finite(entry.resetsAt) && resetsAt - entry.resetsAt > RESET_JITTER_MS;
        if (entry.fired && (newWindow || percent <= rule.percent - settings.hysteresis))
            entry = {...entry, fired: false};
        if (!entry.fired && percent >= rule.percent) {
            entry = {...entry, fired: true};
            crossings.push({metricId: metric.id, type, window: metric.window, percent, resetsAt});
        }
        state.levels[key] = {fired: entry.fired, resetsAt: resetsAt ?? entry.resetsAt ?? null, at: now};
    }
    // A metric the provider stopped reporting is forgotten, so it is a first sight if it returns.
    for (const key of Object.keys(state.levels)) {
        if (key.startsWith(`${snapshot.id}|`) && !seen.has(key))
            delete state.levels[key];
    }

    if (!crossings.length)
        return;
    state.sent = state.sent.filter(time => now - time < HOUR_MS);
    if (state.sent.length >= MAX_PER_HOUR) {
        // The crossings stay marked as announced; one summary says that more happened.
        if (!state.capped || now - state.capped >= HOUR_MS) {
            state.capped = now;
            events.push({kind: 'summary'});
        }
        return;
    }
    state.sent.push(now);
    const worst = Math.max(...crossings.map(crossing => crossing.percent));
    events.push({kind: 'threshold', providerId: snapshot.id, level: severityOf(worst) === 'critical' ? 'critical' : 'warning', crossings});
}

/** What kind of trouble a snapshot is, or null when it is healthy or not worth a notice. */
function troubleOf(snapshot, now, intervalMs) {
    switch (snapshot.state) {
    case 'ok': {
        const fetchedAt = snapshot.source?.fetchedAt;
        if (snapshot.source?.kind === 'stale' && finite(fetchedAt))
            return {cause: 'stale', since: fetchedAt, after: Math.max(OUTAGE_ALERT_AFTER_MS, OUTAGE_INTERVALS * (intervalMs || 0))};
        return null;
    }
    case 'auth_required':
        // A locked keyring clears itself, and a provider that was never set up is not an outage.
        if (snapshot.reason === 'keyring' || snapshot.reason === 'no_key' || snapshot.reason === 'no_config')
            return null;
        return {cause: 'auth', since: null, after: AUTH_ALERT_AFTER_MS};
    default:
        return {cause: 'error', since: null, after: Math.max(OUTAGE_ALERT_AFTER_MS, OUTAGE_INTERVALS * (intervalMs || 0))};
    }
}

function evaluateConnection(snapshot, state, settings, context, events) {
    const {now, intervalMs = 0, quietUntil = 0} = context;
    const trouble = settings.connection ? troubleOf(snapshot, now, intervalMs) : null;
    if (!trouble) {
        delete state.connection[snapshot.id];   // a success re-arms the alert
        return;
    }
    let entry = state.connection[snapshot.id];
    if (!entry || entry.cause !== trouble.cause)
        entry = {cause: trouble.cause, since: trouble.since ?? now, alerted: entry?.alerted && entry.cause === trouble.cause};
    state.connection[snapshot.id] = entry;
    if (entry.alerted || now < quietUntil || now - entry.since < trouble.after)
        return;
    entry.alerted = true;
    events.push({kind: 'connection', providerId: snapshot.id, cause: trouble.cause});
}

/**
 * Look at one provider's snapshot and say what the user should be told.
 *
 * @param {object} options
 * @param {object} options.snapshot - the provider's current snapshot, aged by the current time
 * @param {object} options.state - the alert state from the last call (or `emptyAlertState()`)
 * @param {object} [options.settings] - see `normalizeAlertSettings`
 * @param {number} options.now - ms since the epoch
 * @param {number} [options.intervalMs] - the provider's poll interval
 * @param {number} [options.quietUntil] - connection alerts wait until this time (after a resume)
 * @returns {{events: object[], state: object}} the input state is never changed
 */
export function evaluate({snapshot, state, settings, now, intervalMs = 0, quietUntil = 0}) {
    const next = clone(state ?? emptyAlertState());
    const events = [];
    if (!snapshot || snapshot.tracked === false || !PROVIDER_ID.test(snapshot.id ?? '')) {
        if (snapshot?.id)
            return {events, state: forgetProvider(next, snapshot.id)};
        return {events, state: next};
    }
    const rules = normalizeAlertSettings(settings ?? DEFAULT_ALERT_SETTINGS);
    evaluateQuota(snapshot, next, rules, now, events);
    evaluateConnection(snapshot, next, rules, {now, intervalMs, quietUntil}, events);
    return {events, state: next};
}

/**
 * Read the alert state file. A missing, oversized, foreign or malformed file is an empty state:
 * the worst result is one notice repeated or one skipped, never a failure to start.
 *
 * @param {string} text
 * @returns {{state: object, problems: string[]}}
 */
export function parseAlertState(text) {
    const empty = emptyAlertState();
    if (typeof text !== 'string' || text.length > MAX_ALERT_STATE_BYTES)
        return {state: empty, problems: ['the alert state is too large; ignoring it']};
    let raw;
    try {
        raw = JSON.parse(text);
    } catch {
        return {state: empty, problems: ['the alert state is not valid JSON; ignoring it']};
    }
    if (!raw || typeof raw !== 'object' || raw.version !== ALERT_STATE_VERSION)
        return {state: empty, problems: ['the alert state is of another version; ignoring it']};

    const state = emptyAlertState();
    for (const [key, value] of Object.entries(raw.levels ?? {}).slice(0, MAX_ENTRIES)) {
        const [providerId, metricId] = key.split('|');
        if (!PROVIDER_ID.test(providerId ?? '') || !METRIC_ID.test(metricId ?? '') || !value || typeof value !== 'object')
            continue;
        state.levels[key] = {
            fired: value.fired === true,
            resetsAt: finite(value.resetsAt) ? value.resetsAt : null,
            at: finite(value.at) ? value.at : 0,
        };
    }
    for (const [providerId, value] of Object.entries(raw.connection ?? {}).slice(0, MAX_ENTRIES)) {
        if (!PROVIDER_ID.test(providerId) || !value || typeof value !== 'object' || !finite(value.since))
            continue;
        if (!['auth', 'stale', 'error'].includes(value.cause))
            continue;
        state.connection[providerId] = {cause: value.cause, since: value.since, alerted: value.alerted === true};
    }
    if (Array.isArray(raw.sent))
        state.sent = raw.sent.filter(finite).slice(-MAX_PER_HOUR * 2);
    state.capped = finite(raw.capped) ? raw.capped : 0;
    return {state, problems: []};
}

/** @param {object} state @returns {string} */
export function serializeAlertState(state) {
    return JSON.stringify({...state, version: ALERT_STATE_VERSION});
}
