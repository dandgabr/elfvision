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
// A Map, not an object: a bucket's `window` is text from the server, and "constructor"
// must not find anything.
const WINDOWS = new Map([
    ['5h', {id: '5h', window: 'session', windowSecs: 5 * 3600}],
    ['weekly', {id: 'weekly', window: 'week', windowSecs: 7 * 86400}],
]);

function fraction(value) {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

function bucketMetric(bucket) {
    if (!bucket || typeof bucket !== 'object' || typeof bucket.bucketId !== 'string')
        return null;
    const pool = POOLS.find(p => bucket.bucketId.startsWith(p.prefix));
    const window = WINDOWS.get(bucket.window);
    const resetsAt = typeof bucket.resetTime === 'string' ? Date.parse(bucket.resetTime) : NaN;
    // JSON made from a protocol buffer leaves out a zero: a bucket with a valid reset time and
    // no `remainingFraction` at all has nothing left. Present but unusable is another matter.
    const remaining = 'remainingFraction' in bucket
        ? fraction(bucket.remainingFraction)
        : (Number.isFinite(resetsAt) ? 0 : null);
    if (!pool || !window || remaining === null || remaining < 0 || remaining > 1)
        return null;
    const metric = {
        id: `${pool.pool.id}-${window.id}`,
        kind: 'percent',
        window: window.window,
        windowSecs: window.windowSecs,
        percentUsed: Math.min(100, Math.max(0, (1 - remaining) * 100)),
        pool: pool.pool,
    };
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
    const byId = new Map();
    const groups = Array.isArray(body?.groups) ? body.groups : [];
    for (const group of groups) {
        for (const bucket of Array.isArray(group?.buckets) ? group.buckets : []) {
            const metric = bucketMetric(bucket);
            if (!metric)
                continue;
            // Several models can share a pool and a window: the fullest one is what limits you.
            const known = byId.get(metric.id);
            if (!known || metric.percentUsed > known.percentUsed)
                byId.set(metric.id, metric);
        }
    }
    const metrics = [...byId.values()];
    if (metrics.length === 0) {
        const error = new Error('the quota reply has none of the expected fields');
        error.code = 'provider_changed';
        throw error;
    }
    return {metrics};
}
