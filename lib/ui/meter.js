// Progress meter used on the top bar and in the popup cards: a track, a fill
// and an optional pacing tick. St has no percentage widths, so the fill and
// the tick are sized from the allocation.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

const STATE_CLASSES = ['gaq-ok', 'gaq-warning', 'gaq-critical', 'gaq-stale', 'gaq-auth', 'gaq-error'];

export const MeterBar = GObject.registerClass(
class GaqMeterBar extends St.Widget {
    _init({thin = false} = {}) {
        super._init({
            style_class: thin ? 'gaq-meter gaq-meter-thin' : 'gaq-meter',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
        });

        this._fill = new St.Widget({
            style_class: 'gaq-meter-fill',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: true,
        });
        this._tick = new St.Widget({
            style_class: 'gaq-meter-tick',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this.add_child(this._fill);
        this.add_child(this._tick);

        this._percent = 0;
        this._pace = null;
        this.connect('notify::allocation', () => this._layoutChildren());
    }

    /**
     * @param {number} percent - used percentage, 0 to 100
     * @param {object} [options]
     * @param {number|null} [options.pace] - expected percentage for the pacing tick
     * @param {string} [options.cssClass] - state class (gaq-ok, gaq-warning, ...)
     */
    setValue(percent, {pace = null, cssClass = 'gaq-ok'} = {}) {
        this._percent = Math.max(0, Math.min(100, percent));
        this._pace = pace === null ? null : Math.max(1, Math.min(99, pace));
        for (const name of STATE_CLASSES)
            this._fill.remove_style_class_name(name);
        this._fill.add_style_class_name(cssClass);
        this._tick.visible = this._pace !== null;
        this._layoutChildren();
    }

    _layoutChildren() {
        const width = this.get_allocation_box().get_width();
        if (width <= 0)
            return;

        const fillWidth = this._percent > 0 ? Math.max(2, Math.round(width * this._percent / 100)) : 0;
        if (this._fill.width !== fillWidth)
            this._fill.set_width(fillWidth);

        if (this._pace !== null) {
            const left = Math.round(width * this._pace / 100) - 1;
            if (this._tick.margin_left !== left)
                this._tick.set_margin_left(left);
        }
    }
});
