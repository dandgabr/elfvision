// Chooses which providers appear on the top bar.

import {rankOf} from './severity.js';

export const MIN_BAR_ITEMS = 1;
export const MAX_BAR_ITEMS = 5;

/**
 * Split tracked providers into "on the bar" and "hidden from the bar".
 *
 * Automatic mode picks the N worst providers, but both lists keep the fixed
 * order of `snapshots` so the bar never reorders itself between refreshes.
 *
 * @param {object[]} snapshots - provider snapshots in their fixed order
 * @param {object} [options]
 * @param {number} [options.count] - slots on the bar, clamped to 1..5
 * @param {'auto'|'manual'} [options.mode]
 * @param {string[]} [options.manual] - provider ids chosen by the user
 * @param {object} [options.limits] - severity thresholds
 * @returns {{onBar: object[], hidden: object[]}}
 */
export function selectForBar(snapshots, {count = 3, mode = 'auto', manual = [], limits} = {}) {
    const tracked = snapshots.filter(s => s.tracked !== false);
    const wanted = Number.isFinite(count) ? Math.trunc(count) : 3;
    const slots = Math.max(MIN_BAR_ITEMS, Math.min(MAX_BAR_ITEMS, wanted));

    let chosen;
    if (mode === 'manual') {
        // The order of `manual` is the user's priority when more providers are
        // marked than there are slots; drawing still follows the fixed order.
        const picked = manual
            .map(id => tracked.find(s => s.id === id))
            .filter(Boolean)
            .slice(0, slots);
        chosen = new Set(picked.map(s => s.id));
    } else {
        const ranked = [...tracked].sort((a, b) => rankOf(b, limits) - rankOf(a, limits));
        chosen = new Set(ranked.slice(0, slots).map(s => s.id));
    }

    return {
        onBar: tracked.filter(s => chosen.has(s.id)),
        hidden: tracked.filter(s => !chosen.has(s.id)),
    };
}
