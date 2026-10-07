// One provider on the top bar: icon, number, percent sign, window suffix,
// state glyph and the mini meter under it (variation A of docs/adr/0004).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {MeterBar} from './meter.js';

export const BarItem = GObject.registerClass(
class GaqBarItem extends St.Widget {
    _init(iconPath) {
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
        this._number = new St.Label({style_class: 'gaq-number', y_align: Clutter.ActorAlign.CENTER});
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
        this._meter.set({style_class: 'gaq-meter gaq-meter-bar', y_align: Clutter.ActorAlign.END, x_align: Clutter.ActorAlign.FILL});

        this.add_child(this._row);
        this.add_child(this._meter);
    }

    /**
     * @param {object} view - a barView() result
     * @param {{compact?: boolean}} [options] - compact drops the percent sign
     *   and the window suffix to save width
     */
    update(view, {compact = false} = {}) {
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

        this._meter.visible = view.state !== 'auth';
        this._meter.setValue(view.percent, {cssClass: view.cssClass});
        this.accessible_name = view.accessibleName;
    }
});
