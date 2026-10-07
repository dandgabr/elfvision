// A small hover tooltip. The shell has no generic tooltip widget (the Dash
// positions its own label by hand), so this does the same: one label in
// uiGroup, shown after a short delay below an anchor actor and hidden as soon
// as the pointer leaves, the popup closes or the anchor is destroyed.

import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {safeText} from '../core/text.js';

const SHOW_DELAY_MS = 350;
const GAP_PX = 8;
const SCREEN_MARGIN_PX = 8;
const MAX_WIDTH_PX = 260;

let label = null;
let timeoutId = 0;

/** Hide the tooltip and cancel a pending one. Safe to call at any time. */
export function hideTooltip() {
    if (timeoutId) {
        GLib.source_remove(timeoutId);
        timeoutId = 0;
    }
    label?.hide();
}

/** Called by the indicator's cleanup; ordinary focus changes reuse the label. */
export function destroyTooltip() {
    hideTooltip();
    const oldLabel = label;
    label = null;
    oldLabel?.destroy();
}

function showTooltip(anchor, text) {
    hideTooltip();
    // An item that was hidden or removed while the delay ran has no place to point at.
    if (!anchor.get_stage() || !anchor.mapped)
        return;

    if (!label) {
        label = new St.Label({style_class: 'gaq-tooltip', reactive: false, visible: false, style: `max-width: ${MAX_WIDTH_PX}px;`});
        label.clutter_text.line_wrap = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        Main.uiGroup.add_child(label);
    }
    // Destroying/recreating labels during focus changes can leave Clutter's
    // pending layout traversing a destroyed actor. Keep one until cleanup.
    const tooltip = label;
    tooltip.text = safeText(text);
    if (label !== tooltip)
        return;
    // Menus live in uiGroup too; the tooltip has to be drawn over them.
    Main.uiGroup.set_child_above_sibling(tooltip, null);
    if (label !== tooltip)
        return;

    const [anchorX, anchorY] = anchor.get_transformed_position();
    const [anchorWidth, anchorHeight] = anchor.get_transformed_size();
    const [, width] = tooltip.get_preferred_width(-1);
    if (label !== tooltip)
        return;
    const [, height] = tooltip.get_preferred_height(-1);
    if (label !== tooltip)
        return;

    const monitor = Main.layoutManager.findMonitorForActor(anchor) ?? Main.layoutManager.primaryMonitor;
    const minX = monitor.x + SCREEN_MARGIN_PX;
    const maxX = monitor.x + monitor.width - width - SCREEN_MARGIN_PX;
    const x = Math.max(minX, Math.min(maxX, anchorX + anchorWidth / 2 - width / 2));

    // Below the anchor, or above it when there is no room underneath.
    const below = anchorY + anchorHeight + GAP_PX;
    const fitsBelow = below + height <= monitor.y + monitor.height - SCREEN_MARGIN_PX;
    const y = fitsBelow ? below : anchorY - height - GAP_PX;

    tooltip.set_position(Math.round(x), Math.round(y));
    tooltip.show();
}

/**
 * Show `text()` under `anchor()` while the pointer rests on `actor`.
 *
 * @param {St.Widget} actor - the widget whose hover state is tracked; it must
 *   have `reactive` and `track_hover` set, and `can_focus` for keyboard users
 * @param {() => string|null} text - tooltip text, or null for none
 * @param {() => St.Widget} [anchor] - widget the tooltip points at (default: actor)
 */
export function attachTooltip(actor, text, anchor = () => actor) {
    actor.connect('notify::hover', () => {
        if (!actor.hover) {
            hideTooltip();
            return;
        }
        const content = text();
        if (!content)
            return;
        hideTooltip();
        timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SHOW_DELAY_MS, () => {
            timeoutId = 0;
            showTooltip(anchor(), content);
            return GLib.SOURCE_REMOVE;
        });
    });
    // Keyboard users get the same tooltip when the widget takes focus.
    actor.connect('key-focus-in', () => {
        const content = text();
        if (content)
            showTooltip(anchor(), content);
    });
    actor.connect('key-focus-out', () => hideTooltip());
    actor.connect('destroy', () => hideTooltip());
}
