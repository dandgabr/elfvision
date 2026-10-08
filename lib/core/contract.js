// The ProviderSnapshot contract (docs/adr/0002). Everything a provider returns
// goes through normalizeSnapshot(), so the rest of the extension can rely on
// the shape and never sees NaN, out-of-range percentages or half-built metrics.
// Pure JavaScript, tested under `gjs -m`.

export const STATES = ['ok', 'auth_required', 'rate_limited', 'network', 'parse_error', 'provider_changed'];
export const REASONS = ['no_key', 'rejected', 'keyring', 'expired', 'refused', 'no_config'];
export const WINDOWS = ['session', 'day', 'week', 'month', 'none'];

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** A snapshot older than this many poll intervals is shown as stale. */
export const STALE_AFTER_INTERVALS = 2;
/** Past this age the values are withheld rather than shown dimmed. */
export const EXPIRE_AFTER_MS = DAY_MS;

/**
 * Strip what must never reach a log, the cache or the screen from an error
 * message: URLs (they may carry query tokens) and long token-like strings.
 *
 * @param {string} message
 * @returns {string}
 */
export function redact(message) {
    return String(message)
        .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
        .replace(/[A-Za-z0-9_\-.~+/=]{24,}/g, '<redacted>')
        .slice(0, 200);
}

// Text from a provider is bounded: it ends up in the cache and in widgets.
const text = (value, fallback = '', max = 64) => (typeof value === 'string' ? value.slice(0, max) : fallback);
const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const clampPercent = value => Math.max(0, Math.min(100, value));

function normalizePool(pool) {
    if (!pool || typeof pool !== 'object')
        return undefined;
    const id = text(pool.id);
    if (!id)
        return undefined;
    return {id, name: text(pool.name, id), short: text(pool.short, id.slice(0, 3).toUpperCase(), 8)};
}

/**
 * @param {object} raw
 * @param {number} index - position, used for a fallback id
 * @returns {object|null} the cleaned metric, or null when it is unusable
 */
function normalizeMetric(raw, index) {
    if (!raw || typeof raw !== 'object')
        return null;
    const id = text(raw.id, `m${index}`);
    const window = WINDOWS.includes(raw.window) ? raw.window : 'none';

    if (raw.kind === 'money' || raw.kind === 'spend') {
        const isSpend = raw.kind === 'spend';
        const currency = isSpend || raw.basis === 'allowance' ? raw.currency : text(raw.currency, 'USD', 8);
        if ((isSpend || raw.basis === 'allowance') && (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)))
            return null;
        const value = finite(isSpend ? raw.amount : raw.balance);
        if (value === null)
            return null;
        const cap = finite(isSpend ? raw.limit : raw.budget);
        const hasCap = cap !== null && cap > 0;
        const percent = hasCap ? clampPercent((isSpend ? value / cap : 1 - value / cap) * 100) : null;
        const allowance = !isSpend && raw.basis === 'allowance';
        const metric = {
            id, kind: raw.kind,
            ...(isSpend ? {amount: value, currency} : {}),
            window: isSpend ? (window === 'month' ? 'month' : 'none') : allowance ? window : 'none',
            windowSecs: allowance ? Math.max(0, finite(raw.windowSecs) ?? 0) : 0,
            ...(!isSpend ? {balance: value, budget: hasCap ? cap : 0, currency} : {}),
            ...(isSpend && hasCap ? {limit: cap} : {}),
            ...(allowance ? {basis: 'allowance'} : {}),
            percentUsed: percent === null ? null : Math.round(percent * 10) / 10,
            ...(!isSpend && finite(raw.dailySpend) !== null ? {dailySpend: raw.dailySpend} : {}),
        };
        if ((isSpend || allowance) && finite(raw.resetsAt) !== null)
            metric.resetsAt = raw.resetsAt;
        return metric;
    }

    const percentUsed = finite(raw.percentUsed);
    if (percentUsed === null)
        return null;
    const metric = {
        id, kind: 'percent', window,
        windowSecs: Math.max(0, finite(raw.windowSecs) ?? 0),
        percentUsed: clampPercent(percentUsed),
    };
    const resetsAt = finite(raw.resetsAt);
    if (resetsAt !== null)
        metric.resetsAt = resetsAt;
    const pool = normalizePool(raw.pool);
    if (pool)
        metric.pool = pool;
    return metric;
}

/**
 * Validate and clean a raw provider snapshot.
 *
 * - An unknown `state` becomes `parse_error`.
 * - Unusable metrics are dropped and counted in `problems`.
 * - Percentages are clamped to 0..100; ids are made unique.
 *
 * @param {object} raw
 * @returns {{snapshot: object, problems: string[]}}
 */
export function normalizeSnapshot(raw) {
    const problems = [];
    const input = raw && typeof raw === 'object' ? raw : {};
    const id = text(input.id);
    if (!id)
        problems.push('missing provider id');

    let state = input.state ?? 'ok';
    if (!STATES.includes(state)) {
        problems.push(`unknown state "${state}"`);
        state = 'parse_error';
    }

    const seen = new Set();
    const metrics = [];
    (Array.isArray(input.metrics) ? input.metrics : []).forEach((rawMetric, index) => {
        const metric = normalizeMetric(rawMetric, index);
        if (!metric) {
            problems.push(`dropped metric #${index}`);
            return;
        }
        let unique = metric.id;
        for (let n = 2; seen.has(unique); n++)
            unique = `${metric.id}-${n}`;
        seen.add(unique);
        metrics.push({...metric, id: unique});
    });

    const fetchedAt = finite(input.source?.fetchedAt);
    const snapshot = {
        id,
        name: text(input.name, id),
        plan: text(input.plan),
        state,
        source: {kind: input.source?.kind === 'stale' ? 'stale' : 'fresh', ...(fetchedAt !== null ? {fetchedAt} : {})},
        metrics,
        ...(['unsupported', 'available'].includes(input.quotaAvailability) ? {quotaAvailability: input.quotaAvailability} : {}),
        ...(input.tracked === false ? {tracked: false} : {}),
        ...(input.expired ? {expired: true} : {}),
        ...(typeof input.error === 'string' ? {error: input.error.slice(0, 200)} : {}),
        ...(REASONS.includes(input.reason) ? {reason: input.reason} : {}),
        ...(finite(input.nextRetryAt) !== null ? {nextRetryAt: input.nextRetryAt} : {}),
    };
    return {snapshot, problems};
}

/**
 * Age a snapshot: stale after two poll intervals, withheld after a day.
 * Pure: returns a new snapshot and never mutates its input.
 *
 * @param {object} snapshot
 * @param {number} nowMs
 * @param {number} pollMs - the provider's poll interval
 * @returns {object}
 */
export function applyFreshness(snapshot, nowMs, pollMs) {
    const fetchedAt = snapshot.source?.fetchedAt;
    if (!Number.isFinite(fetchedAt))
        return snapshot;
    const age = nowMs - fetchedAt;
    if (age > EXPIRE_AFTER_MS)
        return {...snapshot, metrics: [], expired: true, source: {...snapshot.source, kind: 'stale'}};
    if (age > STALE_AFTER_INTERVALS * pollMs && snapshot.source.kind !== 'stale')
        return {...snapshot, source: {...snapshot.source, kind: 'stale'}};
    return snapshot;
}
