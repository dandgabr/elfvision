// Reads the reply of the Antigravity quota endpoint (docs/adr/0002). Not documented by
// the vendor, so every field is checked and a reply with nothing usable is a change of the
// provider, never zero. Pure JavaScript, tested under `gjs -m`.
//
//   groups[].buckets[] : {bucketId, window, remainingFraction, resetTime}
//     bucketId starts with `gemini-` (the Gemini pool) or `3p-` (third-party models: Claude
//     and GPT); `window` is `5h` or `weekly`; `remainingFraction` is what is LEFT, from 0 to 1,
//     and may arrive as an integer, a float or a numeric string; `resetTime` is RFC 3339.

const POOLS = [
    {prefix: 'gemini-', pool: {id: 'gemini', name: 'Gemini', short: 'G'}},
    {prefix: '3p-', pool: {id: 'claude-gpt', name: 'Claude and GPT', short: 'C/G'}},
];
const WINDOWS = {
    '5h': {id: '5h', window: 'session', windowSecs: 5 * 3600},
    weekly: {id: 'weekly', window: 'week', windowSecs: 7 * 86400},
};

function fraction(value) {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

function bucketMetric(bucket) {
    if (!bucket || typeof bucket !== 'object' || typeof bucket.bucketId !== 'string')
        return null;
    const pool = POOLS.find(p => bucket.bucketId.startsWith(p.prefix));
    const window = WINDOWS[bucket.window];
    const remaining = fraction(bucket.remainingFraction);
    if (!pool || !window || remaining === null)
        return null;
    const metric = {
        id: `${pool.pool.id}-${window.id}`,
        kind: 'percent',
        window: window.window,
        windowSecs: window.windowSecs,
        percentUsed: Math.min(100, Math.max(0, (1 - remaining) * 100)),
        pool: pool.pool,
    };
    const resetsAt = typeof bucket.resetTime === 'string' ? Date.parse(bucket.resetTime) : NaN;
    if (Number.isFinite(resetsAt))
        metric.resetsAt = resetsAt;
    return metric;
}

/**
 * @param {*} body
 * @returns {{metrics: object[]}}
 * @throws {Error} with `code` "provider_changed" when no bucket can be read
 */
export function parseQuota(body) {
    const metrics = [];
    const seen = new Set();
    const groups = Array.isArray(body?.groups) ? body.groups : [];
    for (const group of groups) {
        for (const bucket of Array.isArray(group?.buckets) ? group.buckets : []) {
            const metric = bucketMetric(bucket);
            // The same pool and window twice would be two rows with one name: keep the first.
            if (metric && !seen.has(metric.id)) {
                seen.add(metric.id);
                metrics.push(metric);
            }
        }
    }
    if (metrics.length === 0) {
        const error = new Error('the quota reply has none of the expected fields');
        error.code = 'provider_changed';
        throw error;
    }
    return {metrics};
}
