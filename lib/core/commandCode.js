// Reads the reply of Command Code's credits endpoint (docs/adr/0002). The
// endpoint is not documented by the vendor, so every field is checked and a
// reply that does not look like the expected one is reported as a change of the
// provider rather than shown as zero. Pure JavaScript, tested under `gjs -m`.
//
// The fields below are the ones the extension relies on:
//   windowLimits.fiveHour / windowLimits.weekly : {used, cap, resetAt}
//     `used` and `cap` are absolute amounts, `resetAt` is Unix time in milliseconds
//   credits.monthlyCredits : the remaining balance for the month

const WINDOWS = [
    {id: 'five-hour', key: 'fiveHour', window: 'session', windowSecs: 5 * 3600},
    {id: 'weekly', key: 'weekly', window: 'week', windowSecs: 7 * 86400},
];

const isNumber = value => typeof value === 'number' && Number.isFinite(value);

function windowMetric(spec, limits) {
    const entry = limits?.[spec.key];
    if (!entry || typeof entry !== 'object' || !isNumber(entry.used) || !isNumber(entry.cap) || entry.cap <= 0)
        return null;
    const metric = {
        id: spec.id,
        kind: 'percent',
        window: spec.window,
        windowSecs: spec.windowSecs,
        percentUsed: Math.min(100, Math.max(0, entry.used / entry.cap * 100)),
    };
    if (isNumber(entry.resetAt) && entry.resetAt > 0)
        metric.resetsAt = entry.resetAt;
    return metric;
}

/**
 * @param {*} body - the parsed JSON of the credits reply
 * @returns {{metrics: object[]}} metrics in the provider contract's raw form
 * @throws {Error} with `code` "provider_changed" when nothing usable is in the reply
 */
export function parseCredits(body) {
    const metrics = [];
    if (body && typeof body === 'object') {
        for (const spec of WINDOWS) {
            const metric = windowMetric(spec, body.windowLimits);
            if (metric)
                metrics.push(metric);
        }
        const credits = body.credits?.monthlyCredits;
        if (isNumber(credits) && credits >= 0)
            metrics.push({id: 'monthly-credits', kind: 'money', balance: credits, currency: 'USD'});
    }
    if (metrics.length === 0) {
        const error = new Error('the credits reply has none of the expected fields');
        error.code = 'provider_changed';
        throw error;
    }
    return {metrics};
}
