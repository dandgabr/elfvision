// A small hover tooltip. The shell has no generic tooltip widget (the Dash
// positions its own label by hand), so this does the same: one label in
// uiGroup, shown after a short delay below an anchor actor and hidden as soon
// as the pointer leaves, the popup closes or the anchor is destroyed.

import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SHOW_DELAY_MS = 350;
const GAP_PX = 8;
const SCREEN_MARGIN_PX = 8;

let label = null;
let timeoutId = 0;

/** Hide the tooltip and cancel a pending one. Safe to call at any time. */
export function hideTooltip() {
    if (timeoutId) {
        GLib.source_remove(timeoutId);
        timeoutId = 0;
    }
    if (label) {
        label.destroy();
        label = null;
    }
}

function showTooltip(anchor, text) {
    hideTooltip();
    if (!anchor.get_stage())
        return;

    label = new St.Label({style_class: 'gaq-tooltip', text, reactive: false});
    Main.uiGroup.add_child(label);
    // Menus live in uiGroup too; the tooltip has to be drawn over them.
    Main.uiGroup.set_child_above_sibling(label, null);

    const [anchorX, anchorY] = anchor.get_transformed_position();
    const [anchorWidth, anchorHeight] = anchor.get_transformed_size();
    const [, width] = label.get_preferred_width(-1);
    const [, height] = label.get_preferred_height(-1);

    const monitor = Main.layoutManager.findMonitorForActor(anchor) ?? Main.layoutManager.primaryMonitor;
    const minX = monitor.x + SCREEN_MARGIN_PX;
    const maxX = monitor.x + monitor.width - width - SCREEN_MARGIN_PX;
    const x = Math.max(minX, Math.min(maxX, anchorX + anchorWidth / 2 - width / 2));

    // Below the anchor, or above it when there is no room underneath.
    const below = anchorY + anchorHeight + GAP_PX;
    const fitsBelow = below + height <= monitor.y + monitor.height - SCREEN_MARGIN_PX;
    const y = fitsBelow ? below : anchorY - height - GAP_PX;

    label.set_position(Math.round(x), Math.round(y));
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
