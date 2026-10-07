// Progress meter used on the top bar and in the popup cards: a track, a fill
// and an optional pacing tick. St has no percentage widths, so the fill and
// the tick are placed by hand from the allocation. The track has no layout
// manager: BinLayout centers its children whatever their x_align says, which
// drew the fill from the middle outwards.

import GObject from 'gi://GObject';
import St from 'gi://St';

const STATE_CLASSES = ['gaq-ok', 'gaq-warning', 'gaq-critical', 'gaq-stale', 'gaq-auth', 'gaq-error'];

export const MeterBar = GObject.registerClass(
class GaqMeterBar extends St.Widget {
    _init({thin = false} = {}) {
        super._init({
            style_class: thin ? 'gaq-meter gaq-meter-thin' : 'gaq-meter',
            x_expand: true,
        });

        this._fill = new St.Widget({style_class: 'gaq-meter-fill'});
        this._tick = new St.Widget({style_class: 'gaq-meter-tick', visible: false});
        this.add_child(this._fill);
        this.add_child(this._tick);

        this._percent = 0;
        this._pace = null;
        this.connect('notify::allocation', () => this._layoutChildren());
    }

    // The fill is sized from the allocation, so the track must not also derive
    // its own natural width from the fill; that made the measured width of a
    // layout depend on the previous layout. The parent decides the width.
    vfunc_get_preferred_width(_forHeight) {
        return [0, 0];
    }

    /** The pacing tick, which tooltips point at. */
    get tick() {
        return this._tick;
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
        const box = this.get_allocation_box();
        const width = box.get_width();
        const height = box.get_height();
        if (width <= 0 || height <= 0)
            return;

        const fillWidth = this._percent > 0 ? Math.max(2, Math.round(width * this._percent / 100)) : 0;
        if (this._fill.width !== fillWidth || this._fill.height !== height || this._fill.x !== 0 || this._fill.y !== 0) {
            this._fill.set_position(0, 0);
            this._fill.set_size(fillWidth, height);
        }

        if (this._pace !== null) {
            const left = Math.round(width * this._pace / 100) - 1;
            const [, tickHeight] = this._tick.get_preferred_height(-1);
            const top = Math.round((height - tickHeight) / 2);
            if (this._tick.x !== left || this._tick.y !== top)
                this._tick.set_position(left, top);
        }
    }
});
