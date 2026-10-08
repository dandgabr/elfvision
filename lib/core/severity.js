// Severity rules shared by the panel bar, the popup and the notifications.
// Pure JavaScript: no GObject imports, so it runs under `gjs -m` in the tests.

export const WARN_AT = 80;
export const CRIT_AT = 95;

/**
 * Severity of a used percentage.
 *
 * @param {number} percent - used percentage, 0 to 100
 * @param {{warn: number, crit: number}} [limits] - thresholds
 * @returns {'ok'|'warning'|'critical'}
 */
export function severityOf(percent, limits = {warn: WARN_AT, crit: CRIT_AT}) {
    if (percent >= limits.crit)
        return 'critical';
    if (percent >= limits.warn)
        return 'warning';
    return 'ok';
}

/**
 * The metric that decides what the bar shows: the highest used percentage,
 * ties going to the shorter window.
 *
 * @param {Array<{percentUsed: number, windowSecs?: number}>} metrics
 * @returns {object|null}
 */
export function mostCriticalMetric(metrics) {
    let best = null;
    for (const metric of metrics ?? []) {
        const known = Number.isFinite(metric.percentUsed);
        const bestKnown = Number.isFinite(best?.percentUsed);
        if (!best ||
            (known && !bestKnown) ||
            (known && bestKnown && metric.percentUsed > best.percentUsed) ||
            (known && bestKnown && metric.percentUsed === best.percentUsed &&
             (metric.windowSecs ?? Infinity) < (best.windowSecs ?? Infinity)))
            best = metric;
    }
    return best;
}

/**
 * Display state of a provider. Failures are reported before percentages so a
 * broken provider is never drawn as "0%".
 *
 * @param {object} snapshot - a ProviderSnapshot
 * @param {object} [limits] - severity thresholds
 * @returns {'ok'|'warning'|'critical'|'stale'|'auth'|'error'}
 */
export function displayState(snapshot, limits) {
    switch (snapshot.state) {
    case 'auth_required':
        return 'auth';
    case 'network':
    case 'rate_limited':
    case 'parse_error':
    case 'provider_changed':
        return 'error';
    default:
        break;
    }
    if (snapshot.source?.kind === 'stale')
        return 'stale';
    const worst = mostCriticalMetric(snapshot.metrics);
    return worst ? severityOf(worst.percentUsed, limits) : 'ok';
}

const RANK = {critical: 4, warning: 3, error: 2, auth: 2, stale: 1, ok: 0};

/**
 * Sort key used to pick the "N worst" providers. Failures rank below real
 * warnings and criticals but above healthy providers.
 *
 * @param {object} snapshot
 * @param {object} [limits]
 * @returns {number}
 */
export function rankOf(snapshot, limits) {
    const worst = mostCriticalMetric(snapshot.metrics);
    return RANK[displayState(snapshot, limits)] * 1000 + (worst?.percentUsed ?? 0);
}
