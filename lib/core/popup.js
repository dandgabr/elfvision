// Presentation is independent of collection, alerts, account identity and panel ranking.
import {MAX_CONNECTORS, MAX_CONNECTOR_BYTES} from './connectors.js';

export function popupKeys(demo) {
    const prefix = demo ? 'demo-' : '';
    return {order: `${prefix}popup-connector-order`, hidden: `${prefix}popup-hidden-connectors`};
}

function boundedIds(value, known) {
    if (!Array.isArray(value) || value.length > MAX_CONNECTORS)
        return [];
    // All valid IDs are ASCII. Reject oversized input before constructing any sets.
    if (value.some(id => typeof id !== 'string' || id.length > 100) ||
        value.reduce((size, id) => size + id.length, 0) > MAX_CONNECTOR_BYTES)
        return [];
    return [...new Set(value.filter(id => known.has(id)))];
}

/** Return registry entries in user order, excluding only presentation-hidden entries. */
export function popupPresentation(entries, order = [], hidden = []) {
    const registry = entries.slice(0, MAX_CONNECTORS);
    const known = new Map(registry.map(entry => [entry.id, entry]));
    const ordered = boundedIds(order, known);
    const ids = [...ordered, ...known.keys()].filter((id, index, all) => all.indexOf(id) === index);
    const excluded = new Set(boundedIds(hidden, known));
    return ids.filter(id => !excluded.has(id)).map(id => known.get(id));
}

export function moveConnector(entries, order, id, direction) {
    const ids = popupPresentation(entries, order).map(entry => entry.id);
    const index = ids.indexOf(id);
    const target = index + (direction < 0 ? -1 : 1);
    if (index >= 0 && target >= 0 && target < ids.length)
        [ids[index], ids[target]] = [ids[target], ids[index]];
    return ids;
}

/** Work area and measured chrome are logical pixels; preferences are never rewritten. */
export function popupDimensions(area, requestedWidth, requestedHeight, chrome = {}) {
    const bounded = value => Number.isInteger(value) && value > 0 && value <= 8192 ? value : 0;
    const horizontal = Number.isFinite(chrome.horizontal) ? Math.max(0, chrome.horizontal) : 0;
    const vertical = Number.isFinite(chrome.vertical) ? Math.max(0, chrome.vertical) : 0;
    const width = Math.max(1, Math.min(Math.max(320, bounded(requestedWidth) || 420), area.width - 24));
    const height = Math.max(1, Math.min(Math.max(240, vertical + 40, bounded(requestedHeight) || Math.floor(area.height * 0.7)), area.height - 24));
    return {width, height, contentWidth: Math.max(1, width - horizontal), scrollHeight: Math.max(1, height - vertical)};
}

export function setPopupVisibility(entries, hidden, id, visible) {
    const known = new Map(entries.slice(0, MAX_CONNECTORS).map(entry => [entry.id, entry]));
    const ids = boundedIds(hidden, known).filter(other => other !== id);
    if (!visible && known.has(id))
        ids.push(id);
    return ids;
}
