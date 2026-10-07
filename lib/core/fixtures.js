// Static demo data used by milestone M0, before any provider exists.
// It follows the ProviderSnapshot contract of docs/adr/0002 so the UI code
// written now keeps working when real providers replace these values.

const MINUTE = 60 * 1000;
const SESSION_SECS = 5 * 3600;
const WEEK_SECS = 7 * 24 * 3600;
const MONTH_SECS = 30 * 24 * 3600;

function percentMetric(id, window, windowSecs, percentUsed, minutesToReset, nowMs, pool) {
    return {
        id,
        kind: 'percent',
        window,
        windowSecs,
        resetsAt: nowMs + minutesToReset * MINUTE,
        percentUsed,
        ...(pool ? {pool} : {}),
    };
}

/**
 * The "my day" scenario from the design mockups.
 *
 * @param {number} [nowMs] - clock reference, milliseconds since the epoch
 * @returns {object[]} snapshots in the fixed provider order
 */
export function demoSnapshots(nowMs = Date.now()) {
    const source = {kind: 'fresh', fetchedAt: nowMs - 2 * MINUTE};
    return [
        {
            id: 'command-code', name: 'Command Code', plan: 'Pro', state: 'ok', source,
            metrics: [
                percentMetric('session', 'session', SESSION_SECS, 42, 133, nowMs),
                percentMetric('week', 'week', WEEK_SECS, 18, 6120, nowMs),
                percentMetric('month', 'month', MONTH_SECS, 55, 20000, nowMs),
            ],
        },
        {
            id: 'codex', name: 'Codex', plan: 'Plus', state: 'ok', source,
            metrics: [
                percentMetric('session', 'session', SESSION_SECS, 82, 47, nowMs),
                percentMetric('week', 'week', WEEK_SECS, 40, 6120, nowMs),
            ],
        },
        {
            id: 'claude', name: 'Claude', plan: 'Max', state: 'ok', source,
            metrics: [
                percentMetric('session', 'session', SESSION_SECS, 61, 190, nowMs),
                percentMetric('week', 'week', WEEK_SECS, 97, 3000, nowMs),
            ],
        },
        {
            id: 'antigravity', name: 'Antigravity', plan: 'Pro', state: 'ok', source,
            metrics: [
                percentMetric('gemini-session', 'session', SESSION_SECS, 35, 150, nowMs,
                    {id: 'gemini', name: 'Gemini', short: 'G'}),
                percentMetric('gemini-week', 'week', WEEK_SECS, 20, 5000, nowMs,
                    {id: 'gemini', name: 'Gemini', short: 'G'}),
                percentMetric('3p-session', 'session', SESSION_SECS, 58, 95, nowMs,
                    {id: '3p', name: 'Claude and GPT', short: 'C/G'}),
                percentMetric('3p-week', 'week', WEEK_SECS, 74, 3000, nowMs,
                    {id: '3p', name: 'Claude and GPT', short: 'C/G'}),
            ],
        },
        {
            id: 'example-credits', name: 'Example Credits', plan: 'Prepaid', state: 'ok', source,
            metrics: [{
                id: 'balance', kind: 'money', window: 'none', windowSecs: 0,
                balance: 12.4, budget: 50, currency: 'USD',
                percentUsed: Math.round((1 - 12.4 / 50) * 1000) / 10,
            }],
        },
    ];
}
