// Decides when the user is told something (docs/adr/0010): a quota that crossed its threshold, or
// a provider that has been failing for too long. Pure JavaScript, no GObject imports: the caller
// owns the clock, the persistence and the notification itself, and this module only turns
// snapshots into events and a new state.
//
// Events carry no text. The notifier turns them into translated sentences, so the wording is
// reviewed in one place and nothing a provider sent can reach a notification.

import {CRIT_AT} from './severity.js';

export const ALERT_STATE_VERSION = 2;
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
/**
 * What was seen about a metric is forgotten after this long (or three poll intervals, if longer).
 * The extension is switched off while the screen is locked, so after a long lock the first look
 * must still be compared with the last one: a quota that was below its threshold and is above it
 * now did cross it, however long ago the last look was.
 */
export const LEVEL_TTL_MS = 24 * HOUR_MS;
/** A reset time further away than this is not believed (an edited file would disable re-arming). */
const MAX_RESET_AHEAD_MS = 40 * 24 * HOUR_MS;
/** Quota notifications per hour; more are folded into one summary. */
export const MAX_PER_HOUR = 3;

export const DEFAULT_ALERT_SETTINGS = Object.freeze({
    thresholds: Object.freeze({
        session: Object.freeze({enabled: true, percent: CRIT_AT, warningEnabled: false, warningPercent: 80}),
        week: Object.freeze({enabled: true, percent: CRIT_AT, warningEnabled: false, warningPercent: 80}),
        month: Object.freeze({enabled: true, percent: CRIT_AT, warningEnabled: false, warningPercent: 80}),
        credits: Object.freeze({enabled: true, percent: CRIT_AT, warningEnabled: false, warningPercent: 80}),
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
export function validThresholdPair(warning, critical) {
    return Number.isInteger(warning) && Number.isInteger(critical) && warning >= 1 && warning < critical && critical <= 100;
}

export function normalizeAlertSettings(raw, previous) {
    const thresholds = {};
    for (const type of QUOTA_TYPES) {
        const entry = raw?.thresholds?.[type];
        const percent = Number.isFinite(entry?.percent) ? Math.round(entry.percent) : CRIT_AT;
        let critical = Math.max(1, Math.min(100, percent));
        let warning = Number.isFinite(entry?.warningPercent) ? Math.round(entry.warningPercent) : 80;
        let warningEnabled = entry?.warningEnabled === true;
        if (!validThresholdPair(warning, critical)) {
            if (warningEnabled) {
                const prior = previous?.thresholds?.[type];
                if (prior) {
                    critical = prior.percent;
                    warning = prior.warningPercent;
                    warningEnabled = prior.warningEnabled;
                } else {
                    // An invalid optional warning must never move the critical value at restart.
                    warning = Math.max(1, Math.min(99, warning));
                    warningEnabled = false;
                }
            } else {
                warning = Math.max(1, Math.min(99, warning));
            }
        }
        thresholds[type] = {enabled: entry?.enabled !== false, percent: critical, warningEnabled, warningPercent: warning};
    }
    const hysteresis = Number.isFinite(raw?.hysteresis) ? Math.round(raw.hysteresis) : DEFAULT_ALERT_SETTINGS.hysteresis;
    return {
        thresholds,
        hysteresis: Math.max(1, Math.min(20, hysteresis)),
        connection: raw?.connection !== false,
    };
}

/** Canonical last-valid settings backup; never provider/account data. */
export function parseAlertRuleBackup(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > 2048)
        return null;
    let raw;
    try { raw = JSON.parse(text); } catch { return null; }
    if (!raw || Array.isArray(raw) || typeof raw !== 'object' || Object.keys(raw).length !== QUOTA_TYPES.length)
        return null;
    const thresholds = {};
    for (const type of QUOTA_TYPES) {
        const rule = raw[type];
        if (!rule || Array.isArray(rule) || typeof rule !== 'object' || Object.keys(rule).length !== 4 ||
            !['enabled', 'percent', 'warningEnabled', 'warningPercent'].every(key => Object.hasOwn(rule, key)) ||
            typeof rule.enabled !== 'boolean' || typeof rule.warningEnabled !== 'boolean' ||
            !Number.isInteger(rule.percent) || rule.percent < 1 || rule.percent > 100 ||
            !Number.isInteger(rule.warningPercent) || rule.warningPercent < 1 || rule.warningPercent > 99 ||
            (rule.warningEnabled && !validThresholdPair(rule.warningPercent, rule.percent)))
            return null;
        thresholds[type] = {enabled: rule.enabled, percent: rule.percent, warningEnabled: rule.warningEnabled, warningPercent: rule.warningPercent};
    }
    return {thresholds};
}

export function serializeAlertRuleBackup(rules) {
    const text = JSON.stringify(rules?.thresholds);
    const validated = parseAlertRuleBackup(text);
    return validated ? JSON.stringify(validated.thresholds) : null;
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

function evaluateQuota(snapshot, state, settings, now, intervalMs, events) {
    const reading = snapshot.state === 'ok' && snapshot.source?.kind !== 'stale' && !snapshot.expired;
    if (!reading)
        return;   // an old or missing value says nothing about the quota

    // What was seen long ago (a metric that went away, a file from before a long pause) is
    // forgotten, so it is a first sight again instead of a crossing announced at startup.
    const ttl = Math.max(LEVEL_TTL_MS, OUTAGE_INTERVALS * intervalMs);
    for (const [key, entry] of Object.entries(state.levels)) {
        if (key.startsWith(`${snapshot.id}|`) && now - entry.at > ttl)
            delete state.levels[key];
    }
    const crossings = [];
    for (const metric of snapshot.metrics ?? []) {
        const type = quotaTypeOf(metric);
        if (!type || !finite(metric.percentUsed) || !METRIC_ID.test(metric.id))
            continue;
        const key = keyOf(snapshot.id, metric.id);
        const rule = settings.thresholds[type];
        if (!rule.enabled) {
            delete state.levels[key];   // turned on again later, it is seen for the first time
            continue;
        }

        const percent = metric.percentUsed;
        const resetsAt = finite(metric.resetsAt) ? metric.resetsAt : null;
        const signature = `${rule.percent}|${rule.warningEnabled}|${rule.warningPercent}`;
        let entry = state.levels[key];
        if (!entry || entry.baseline || (entry.rules !== undefined && entry.rules !== signature)) {
            // A new rule or migrated record is a baseline, never a notification backlog.
            const migratedWindowChanged = resetsAt !== null && finite(entry?.resetsAt) && resetsAt - entry.resetsAt > RESET_JITTER_MS;
            const retained = entry?.baseline && !migratedWindowChanged && entry.fired && percent > rule.percent - settings.hysteresis;
            state.levels[key] = {fired: Boolean(retained || percent >= rule.percent),
                warningFired: rule.warningEnabled && percent >= rule.warningPercent,
                rules: signature, resetsAt, at: now};
            continue;
        }
        const newWindow = resetsAt !== null && finite(entry.resetsAt) && resetsAt - entry.resetsAt > RESET_JITTER_MS;
        let criticalFired = entry.fired;
        let warningFired = entry.warningFired === true;
        if (criticalFired && (newWindow || percent <= rule.percent - settings.hysteresis))
            criticalFired = false;
        if (warningFired && (newWindow || percent <= rule.warningPercent - settings.hysteresis))
            warningFired = false;
        const criticalCrossing = !criticalFired && percent >= rule.percent;
        const warningCrossing = rule.warningEnabled && !warningFired && percent >= rule.warningPercent;
        if (criticalCrossing || warningCrossing) {
            const level = criticalCrossing ? 'critical' : 'warning';
            crossings.push({metricId: metric.id, type, window: metric.window, percent, resetsAt, level});
        }
        criticalFired ||= criticalCrossing;
        warningFired = rule.warningEnabled && (warningFired || warningCrossing || criticalCrossing);
        state.levels[key] = {fired: criticalFired, warningFired, rules: signature,
            resetsAt: resetsAt ?? entry.resetsAt ?? null, at: now};
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
    events.push({kind: 'threshold', providerId: snapshot.id,
        level: crossings.some(crossing => crossing.level === 'critical') ? 'critical' : 'warning', crossings});
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
    case 'network':
    case 'rate_limited':
    case 'parse_error':
    case 'provider_changed':
        return {cause: 'error', since: null, after: Math.max(OUTAGE_ALERT_AFTER_MS, OUTAGE_INTERVALS * (intervalMs || 0))};
    default:
        return null;   // a state this module does not know is never an outage
    }
}

function evaluateConnection(snapshot, state, settings, context, events) {
    const {now, intervalMs = 0, quietUntil = 0} = context;
    const trouble = settings.connection ? troubleOf(snapshot, now, intervalMs) : null;
    if (!trouble) {
        delete state.connection[snapshot.id];   // a success re-arms the alert
        return;
    }
    // One outage is one alert, whatever its cause turns into meanwhile; only a success re-arms it.
    let entry = state.connection[snapshot.id];
    if (!entry)
        entry = {cause: trouble.cause, since: trouble.since ?? now, alerted: false};
    else
        entry = {...entry, cause: trouble.cause, since: Math.min(entry.since, trouble.since ?? entry.since)};
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
    // A clock that went backwards, or a file edited by hand, must not leave a time in the future
    // that silences alerts for good.
    next.sent = (next.sent ?? []).filter(time => finite(time) && time <= now).slice(-MAX_PER_HOUR);
    if (!finite(next.capped) || next.capped > now)
        next.capped = 0;
    for (const entry of Object.values(next.levels ?? {})) {
        if (finite(entry.resetsAt) && entry.resetsAt > now + MAX_RESET_AHEAD_MS)
            entry.resetsAt = null;
        if (entry.at > now)
            entry.at = now;
    }
    for (const entry of Object.values(next.connection ?? {})) {
        if (entry.since > now)
            entry.since = now;
    }
    const events = [];
    if (!snapshot || snapshot.tracked === false || !PROVIDER_ID.test(snapshot.id ?? '')) {
        if (snapshot?.id)
            return {events, state: forgetProvider(next, snapshot.id)};
        return {events, state: next};
    }
    const rules = normalizeAlertSettings(settings ?? DEFAULT_ALERT_SETTINGS);
    evaluateQuota(snapshot, next, rules, now, intervalMs, events);
    evaluateConnection(snapshot, next, rules, {now, intervalMs, quietUntil}, events);
    next.levels = Object.fromEntries(Object.entries(next.levels).slice(-MAX_ENTRIES));
    next.connection = Object.fromEntries(Object.entries(next.connection).slice(-MAX_ENTRIES));
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
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_ALERT_STATE_BYTES)
        return {state: empty, problems: ['the alert state is too large; ignoring it']};
    let raw;
    try {
        raw = JSON.parse(text);
    } catch {
        return {state: empty, problems: ['the alert state is not valid JSON; ignoring it']};
    }
    if (!raw || typeof raw !== 'object' || ![1, ALERT_STATE_VERSION].includes(raw.version))
        return {state: empty, problems: ['the alert state is of another version; ignoring it']};

    const state = emptyAlertState();
    for (const [key, value] of Object.entries(raw.levels ?? {}).slice(0, MAX_ENTRIES)) {
        const parts = key.split('|');
        if (parts.length !== 2 || !PROVIDER_ID.test(parts[0]) || !METRIC_ID.test(parts[1]) || !value || typeof value !== 'object')
            continue;
        const signature = typeof value.rules === 'string' ? /^(100|[1-9]\d?)\|(true|false)\|([1-9]\d?)$/.exec(value.rules) : null;
        const trustedRules = raw.version === 2 && signature && (signature[2] === 'false' || validThresholdPair(Number(signature[3]), Number(signature[1])));
        state.levels[key] = {
            fired: value.fired === true,
            warningFired: raw.version === 2 && value.warningFired === true,
            ...(!trustedRules ? {baseline: true} : {}),
            ...(trustedRules ? {rules: value.rules} : {}),
            ...(raw.version === 2 && value.baseline === true ? {baseline: true} : {}),
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
        state.sent = raw.sent.filter(finite).slice(-MAX_PER_HOUR);
    state.capped = finite(raw.capped) ? raw.capped : 0;
    return {state, problems: []};
}

/**
 * @param {object} state
 * @returns {string|null} the text to write, or null when it would be over the size limit
 */
export function serializeAlertState(state) {
    const text = JSON.stringify({...state, version: ALERT_STATE_VERSION});
    return new TextEncoder().encode(text).length > MAX_ALERT_STATE_BYTES ? null : text;
}
