// Pacing: how much of a quota window should have been used by now if the
// consumption were perfectly even.

/**
 * @param {number} windowSecs - length of the window in seconds
 * @param {number} resetsAtMs - reset time, milliseconds since the epoch
 * @param {number} nowMs - current time, milliseconds since the epoch
 * @returns {number|null} expected used percentage, 0 to 100, or null when unknown
 */
export function expectedPercent(windowSecs, resetsAtMs, nowMs) {
    if (!windowSecs || !Number.isFinite(resetsAtMs))
        return null;
    const remaining = (resetsAtMs - nowMs) / 1000;
    const elapsed = 1 - remaining / windowSecs;
    return Math.max(0, Math.min(100, elapsed * 100));
}

/**
 * A pacing hint is only worth showing when the user is clearly ahead of the
 * even pace.
 *
 * @param {number} percentUsed
 * @param {number|null} expected
 * @param {number} [minDelta] - smallest deviation worth a message, in points
 * @returns {number|null} points above the expected pace, or null
 */
export function aheadOfPace(percentUsed, expected, minDelta = 10) {
    if (expected === null)
        return null;
    const delta = percentUsed - expected;
    return delta >= minDelta ? Math.round(delta) : null;
}
