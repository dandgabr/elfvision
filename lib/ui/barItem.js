// One provider on the top bar: icon, number, percent sign, window suffix,
// state glyph and the mini meter under it (variation A of docs/adr/0004).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {MeterBar} from './meter.js';
import {tabularNumbers} from './numericText.js';
import {attachTooltip, hideTooltip} from './tooltip.js';

export const BarItem = GObject.registerClass(
class GaqBarItem extends St.Widget {
    /**
     * @param {string} iconPath
     * @param {(view: object) => string} tooltipFor - the tooltip text, made when it is shown
     */
    _init(iconPath, tooltipFor) {
        super._init({
            style_class: 'gaq-item',
            layout_manager: new Clutter.BinLayout(),
            y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
        });

        this._row = new St.BoxLayout({
            style_class: 'gaq-row',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._icon = new St.Icon({
            style_class: 'gaq-icon',
            gicon: Gio.icon_new_for_string(iconPath),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._number = tabularNumbers(new St.Label({style_class: 'gaq-number', y_align: Clutter.ActorAlign.CENTER}));
        this._percent = new St.Label({style_class: 'gaq-percent', text: '%', y_align: Clutter.ActorAlign.CENTER});
        this._suffix = new St.Label({style_class: 'gaq-suffix', y_align: Clutter.ActorAlign.CENTER});
        this._glyphText = new St.Label({style_class: 'gaq-glyph', y_align: Clutter.ActorAlign.CENTER});
        this._glyphIcon = new St.Icon({style_class: 'gaq-glyph-icon', y_align: Clutter.ActorAlign.CENTER});
        // The number and its percent sign sit closer together than the rest of
        // the row. St cannot take a negative margin (it wraps the preferred
        // width to 2^32), so they share a tighter box instead.
        const value = new St.BoxLayout({style_class: 'gaq-value', y_align: Clutter.ActorAlign.CENTER});
        value.add_child(this._number);
        value.add_child(this._percent);
        for (const child of [this._icon, value, this._suffix, this._glyphText, this._glyphIcon])
            this._row.add_child(child);

        this._meter = new MeterBar({thin: true});
        // BinLayout only honors an alignment for children that expand, and
        // centers the others, so the meter has to expand to sit at the bottom.
        this._meter.set({
            style_class: 'gaq-meter gaq-meter-bar',
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.END,
            x_align: Clutter.ActorAlign.FILL,
        });

        this.add_child(this._row);
        this.add_child(this._meter);

        // Hovering an item says what it says, and when it resets. The click still reaches the button.
        this._view = null;
        this._key = '';
        this.set({reactive: true, track_hover: true, can_focus: true});
        attachTooltip(this, () => (this._view ? tooltipFor(this._view) : null));
        // A tooltip pointing at an item that has just been hidden would float over nothing.
        this.connect('notify::visible', () => {
            if (!this.visible)
                hideTooltip();
        });
    }

    /**
     * @param {object} view - a barView() result
     * @param {{compact?: boolean}} [options] - compact drops the percent sign
     *   and the window suffix to save width
     */
    update(view, {compact = false} = {}) {
        // Measuring the candidate layouts calls this again and again with what is already drawn.
        const key = JSON.stringify([view, compact]);
        if (key === this._key)
            return;
        this._view = view;
        this.style_class = `gaq-item ${view.cssClass}`;
        this._number.text = view.number;
        this._percent.visible = view.showPercent && !compact;
        this._suffix.visible = view.suffix !== '' && !compact;
        this._suffix.text = view.suffix ? `·${view.suffix}` : '';

        this._glyphText.visible = Boolean(view.glyph?.text);
        this._glyphText.text = view.glyph?.text ?? '';
        this._glyphIcon.visible = Boolean(view.glyph?.icon);
        if (view.glyph?.icon)
            this._glyphIcon.icon_name = view.glyph.icon;

        this._meter.visible = view.state !== 'auth' && Number.isFinite(view.percent);
        this._meter.setValue(view.percent, {cssClass: view.cssClass});
        this.accessible_name = view.accessibleName;
        // Only now: a draw that failed halfway must be tried again, not skipped as "unchanged".
        this._key = key;
    }

    /** Forget what was drawn, so the next update draws everything again. */
    invalidate() {
        this._key = '';
    }
});
