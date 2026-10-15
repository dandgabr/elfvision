// Pure descriptions for the persistent panel actors; scheduling and fitting stay in the UI.
import {selectForBar} from './selection.js';
import {barView as itemView} from './viewmodel.js';

/**
 * @param {{snapshots: object[], settings?: object, now?: number}} input
 * @returns {{items: object[]}}
 */
export function barView({snapshots, settings = {}, now}) {
    const {count = 3, compact = false, headline = false, barConnectors = [], ...context} = settings;
    const slots = headline ? 1 : count;
    // A chosen list wins; with no list, or when nothing in it can be shown, the most used decide.
    const manual = Array.isArray(barConnectors) ? barConnectors : [];
    let {onBar} = manual.length ? selectForBar(snapshots, {count: slots, mode: 'manual', manual}) : {onBar: []};
    if (!onBar.length)
        ({onBar} = selectForBar(snapshots, {count: slots}));
    const shown = new Set(onBar.map(snapshot => snapshot.id));
    return {items: snapshots.filter(snapshot => snapshot.tracked !== false).map(snapshot => {
        const item = {id: snapshot.id, visible: shown.has(snapshot.id), compact: compact || headline};
        if (item.visible) {
            try {
                item.view = itemView(snapshot, {...context, nowMs: now});
            } catch (_error) {
                // Preserve the existing per-provider draw isolation.
                item.invalid = true;
            }
        }
        return item;
    })};
}
