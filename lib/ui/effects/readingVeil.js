// Cached edge surfaces protect exposed reading zones without blending a full
// transparent-center texture every frame. At most two native actors; overlapping
// reading regions share one surface. Neither participates in reading layout.
import Atk from 'gi://Atk';
import St from 'gi://St';
import Cairo from 'cairo';
import {hexToRgb, readingVeilStops} from '../../core/theme.js';

export function readingVeil(parent, {color, opacity, radius = 0}) {
    const layers = [];
    let previous = '';
    const create = index => {
        const layer = new St.DrawingArea({name: index === 0 ? 'gaq-reading-veil' : 'gaq-reading-veil-bottom',
            reactive: false, can_focus: false, accessible_role: Atk.Role.REDUNDANT_OBJECT});
        layer._isReadingVeil = true;
        layer._effectPaints = 0;
        layer.connect('repaint', () => {
            layer._effectPaints++;
            const cr = layer.get_context();
            const [width, sliceHeight] = layer.get_surface_size();
            layer._effectPaintSize = [width, sliceHeight];
            const {height, offset, stops} = layer._veilSlice;
            // Keep global gradient coordinates and corner clipping identical to
            // the original full surface; only the sampled texture area changes.
            cr.translate(0, -offset);
            const rounded = Math.max(0, Math.min(radius, width / 2, height / 2));
            if (rounded > 0) {
                cr.newPath();
                cr.arc(width - rounded, rounded, rounded, -Math.PI / 2, 0);
                cr.arc(width - rounded, height - rounded, rounded, 0, Math.PI / 2);
                cr.arc(rounded, height - rounded, rounded, Math.PI / 2, Math.PI);
                cr.arc(rounded, rounded, rounded, Math.PI, Math.PI * 1.5);
                cr.closePath();
                cr.clip();
            }
            const rgb = hexToRgb(color).map(value => value / 255);
            const fade = new Cairo.LinearGradient(0, 0, 0, height);
            for (const [position, coverage] of stops)
                fade.addColorStopRGBA(position / Math.max(1, height), ...rgb, opacity * coverage);
            cr.setSource(fade);
            cr.rectangle(0, offset, width, sliceHeight);
            cr.fill();
            cr.$dispose();
        });
        parent.add_child(layer);
        layers.push(layer);
        return layer;
    };
    return {
        setLayout({width, height, bounds = {}}) {
            const key = JSON.stringify({width, height, bounds});
            if (key === previous)
                return;
            previous = key;
            const stops = readingVeilStops(height, bounds);
            const slices = stops.length === 2 ? [[0, height]]
                : [[0, stops[2][0]], [stops[3][0], height - stops[3][0]]];
            while (layers.length > slices.length)
                layers.pop().destroy();
            slices.forEach(([offset, sliceHeight], index) => {
                const layer = layers[index] ?? create(index);
                layer._readingBounds = bounds;
                layer._veilSlice = {height, offset, stops};
                layer.set_position(0, offset);
                const [, requestedWidth] = layer.get_preferred_width(-1);
                const [, requestedHeight] = layer.get_preferred_height(-1);
                if (Math.abs(requestedWidth - width) > 1 / 64 || Math.abs(requestedHeight - sliceHeight) > 1 / 64)
                    layer.set_size(width, sliceHeight);
                layer.queue_repaint();
            });
        },
    };
}
