// Reads the reply of the Codex usage endpoint (docs/adr/0002). Not documented by the
// vendor, so every field is checked and a reply with nothing usable is a change of the
// provider, never zero. Pure JavaScript, tested under `gjs -m`.
//
//   rate_limit.primary_window / secondary_window :
//     {used_percent, limit_window_seconds, reset_at}   reset_at is Unix time in seconds
//   plan_type : a short plan name, when present

const isNumber = value => typeof value === 'number' && Number.isFinite(value);

/** The kind of window a length in seconds stands for. */
function windowOf(seconds) {
    if (!isNumber(seconds) || seconds <= 0)
        return 'none';
    if (seconds >= 3 * 3600 && seconds <= 6 * 3600)
        return 'session';
    if (seconds >= 6 * 86400 && seconds <= 8 * 86400)
        return 'week';
    if (seconds >= 27 * 86400 && seconds <= 32 * 86400)
        return 'month';
    return 'none';
}

function windowMetric(id, entry) {
    if (!entry || typeof entry !== 'object' || !isNumber(entry.used_percent))
        return null;
    const seconds = isNumber(entry.limit_window_seconds) ? entry.limit_window_seconds : 0;
    const metric = {
        id,
        kind: 'percent',
        window: windowOf(seconds),
        windowSecs: Math.max(0, seconds),
        percentUsed: Math.min(100, Math.max(0, entry.used_percent)),
    };
    if (isNumber(entry.reset_at) && entry.reset_at > 0)
        metric.resetsAt = entry.reset_at * 1000;
    return metric;
}

/**
 * @param {*} body
 * @returns {{metrics: object[], plan?: string}}
 * @throws {Error} with `code` "provider_changed" when no window can be read
 */
export function parseUsage(body) {
    const metrics = [];
    if (body && typeof body === 'object') {
        for (const [id, key] of [['primary', 'primary_window'], ['secondary', 'secondary_window']]) {
            const metric = windowMetric(id, body.rate_limit?.[key]);
            if (metric)
                metrics.push(metric);
        }
    }
    if (metrics.length === 0) {
        const error = new Error('the usage reply has none of the expected fields');
        error.code = 'provider_changed';
        throw error;
    }
    const plan = typeof body.plan_type === 'string' && /^[A-Za-z0-9 _-]{1,24}$/.test(body.plan_type)
        ? body.plan_type.replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase())
        : undefined;
    return {metrics, ...(plan ? {plan} : {})};
}
