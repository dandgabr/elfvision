// Pure descriptions for the persistent panel actors; scheduling and fitting stay in the UI.
import {selectForBar} from './selection.js';
import {barView as itemView} from './viewmodel.js';

/**
 * @param {{snapshots: object[], settings?: object, now?: number}} input
 * @returns {{items: object[]}}
 */
export function barView({snapshots, settings = {}, now}) {
    const {count = 3, compact = false, headline = false, ...context} = settings;
    const {onBar} = selectForBar(snapshots, {count: headline ? 1 : count});
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
