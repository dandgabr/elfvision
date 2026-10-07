// Chooses how much the top bar may show so it never gets clipped by the panel.
// Pure JavaScript, tested under `gjs -m`.

/**
 * Candidate layouts ordered from the richest to the leanest.
 *
 * - `auto`:   full, then compact, with fewer providers each step.
 * - `always`: compact only, with fewer providers each step.
 * - `never`:  full only (the percent sign and the suffix are kept), with fewer
 *             providers each step.
 *
 * Every list ends with the headline (the worst provider plus a "+N" badge) and
 * then a single compact provider, which is the narrowest layout there is.
 *
 * @param {number} count - the most providers the user wants on the bar
 * @param {'auto'|'always'|'never'} compactMode
 * @returns {Array<{count: number, compact: boolean, headline: boolean}>}
 */
export function candidateLayouts(count, compactMode = 'auto') {
    const layouts = [];
    const push = (n, compact, headline = false) => layouts.push({count: n, compact, headline});

    if (compactMode === 'always') {
        for (let n = count; n >= 2; n--)
            push(n, true);
    } else if (compactMode === 'never') {
        for (let n = count; n >= 1; n--)
            push(n, false);
    } else {
        push(count, false);
        for (let n = count; n >= 2; n--)
            push(n, true);
    }
    push(1, true, true);
    push(1, true);
    return layouts;
}

/**
 * The richest layout whose measured width fits, or the leanest one when
 * nothing fits.
 *
 * @param {Array<object>} layouts - from candidateLayouts()
 * @param {(layout: object) => number} measure - natural width of a layout, px
 * @param {number} budget - width the indicator may use, px
 * @returns {{layout: object, fits: boolean, width: number}}
 */
export function chooseLayout(layouts, measure, budget) {
    let last = null;
    for (const layout of layouts) {
        const width = measure(layout);
        last = {layout, fits: width <= budget, width};
        if (last.fits)
            return last;
    }
    return last;
}

/**
 * Like chooseLayout(), but steady: the layout in use is kept while it still
 * fits, and a richer one is only adopted when it fits with `margin` px to
 * spare. Neighbours that change width by a few pixels (a clock, a monitor that
 * updates every second) would otherwise make the bar flip between two layouts.
 *
 * @param {Array<object>} layouts - from candidateLayouts()
 * @param {(layout: object) => number} measure - natural width of a layout, px
 * @param {number} budget - width the indicator may use, px
 * @param {string|null} currentKey - key of the layout in use, if any
 * @param {(layout: object) => string} keyOf - stable key of a layout
 * @param {number} [margin] - extra room a richer layout needs to be adopted, px
 * @returns {{layout: object, fits: boolean, width: number}}
 */
export function chooseStickyLayout(layouts, measure, budget, currentKey, keyOf, margin = 32) {
    const index = currentKey === null ? -1 : layouts.findIndex(l => keyOf(l) === currentKey);
    if (index >= 0) {
        const width = measure(layouts[index]);
        if (width <= budget) {
            for (let i = 0; i < index; i++) {
                const richer = measure(layouts[i]);
                if (richer + margin <= budget)
                    return {layout: layouts[i], fits: true, width: richer};
            }
            return {layout: layouts[index], fits: true, width};
        }
    }
    return chooseLayout(layouts, measure, budget);
}

/**
 * Width available to the panel box that holds the extension, mirroring how
 * the shell allocates the three boxes (see panel.js).
 *
 * @param {number} panelWidth - allocated width of the panel
 * @param {number} centerNatural - natural width of the center box
 * @param {number} centerOffset - correction for work areas that do not span the monitor
 * @returns {number}
 */
export function sideWidth(panelWidth, centerNatural, centerOffset = 0) {
    return Math.max(0, (panelWidth - centerNatural + centerOffset) / 2);
}
