// Reads the reply of the Claude usage endpoint (docs/adr/0002). Not documented by the
// vendor, so every field is checked and a reply with nothing usable is a change of the
// provider, never zero. Pure JavaScript, tested under `gjs -m`.
//
//   five_hour / seven_day : {utilization, resets_at}
//     `utilization` is already a percentage; `resets_at` is an RFC 3339 time

const isNumber = value => typeof value === 'number' && Number.isFinite(value);

const WINDOWS = [
    {id: 'session', key: 'five_hour', window: 'session', windowSecs: 5 * 3600},
    {id: 'week', key: 'seven_day', window: 'week', windowSecs: 7 * 86400},
];

function windowMetric(spec, entry) {
    if (!entry || typeof entry !== 'object' || !isNumber(entry.utilization))
        return null;
    const metric = {
        id: spec.id,
        kind: 'percent',
        window: spec.window,
        windowSecs: spec.windowSecs,
        percentUsed: Math.min(100, Math.max(0, entry.utilization)),
    };
    const resetsAt = typeof entry.resets_at === 'string' ? Date.parse(entry.resets_at) : NaN;
    if (Number.isFinite(resetsAt))
        metric.resetsAt = resetsAt;
    return metric;
}

/**
 * @param {*} body
 * @returns {{metrics: object[]}}
 * @throws {Error} with `code` "provider_changed" when no window can be read
 */
export function parseUsage(body) {
    const metrics = [];
    if (body && typeof body === 'object') {
        for (const spec of WINDOWS) {
            const metric = windowMetric(spec, body[spec.key]);
            if (metric)
                metrics.push(metric);
        }
    }
    if (metrics.length === 0) {
        const error = new Error('the usage reply has none of the expected fields');
        error.code = 'provider_changed';
        throw error;
    }
    return {metrics};
}
