// Allocation-cached optical presets; only the trusted renderer selects packaged geometry.
import Atk from 'gi://Atk';
import St from 'gi://St';
import Cairo from 'cairo';
import {hexToRgb} from '../../core/theme.js';

export function opticalLayer(parent, {preset, colors}) {
    const layer = new St.DrawingArea({name: `gaq-optical-${preset}`, reactive: false, can_focus: false, x_expand: true, y_expand: true,
        accessible_role: Atk.Role.REDUNDANT_OBJECT});
    const palette = [colors.accent, colors.danger, colors.ok].map(color => hexToRgb(color).map(value => value / 255));
    layer._effectPaints = 0;
    layer.connect('repaint', () => {
        layer._effectPaints++;
        const cr = layer.get_context();
        const [width, height] = layer.get_surface_size();
        layer._effectPaintSize = [width, height];
        if (['glass', 'linear'].includes(preset)) {
            const gradient = new Cairo.LinearGradient(0, 0, 0, height);
            gradient.addColorStopRGBA(0, ...palette[0], preset === 'glass' ? 0.13 : 0.16);
            gradient.addColorStopRGBA(1, ...palette[0], 0);
            cr.setSource(gradient);
            cr.rectangle(0, 0, width, height); cr.fill();
            if (preset === 'glass') {
                cr.setSourceRGBA(1, 1, 1, 0.3);
                cr.setLineWidth(1);
                cr.moveTo(0, 0.5); cr.lineTo(width, 0.5); cr.stroke();
            }
        } else if (preset === 'pearlescent') {
            const gradient = new Cairo.LinearGradient(0, height * 0.1, width, height * 0.9);
            for (let i = 0; i < 7; i++) {
                const color = palette[i % palette.length];
                gradient.addColorStopRGBA(i / 6, ...color, i % 2 ? 0.25 : 0.13);
            }
            cr.setSource(gradient);
            cr.rectangle(0, 0, width, height); cr.fill();
            cr.setSourceRGBA(1, 1, 1, 0.13);
            cr.setLineWidth(2);
            for (let i = 0; i < 3; i++) {
                cr.moveTo(width * i / 3, 0); cr.lineTo(width * (i / 3 + 0.35), height);
            }
            cr.stroke();
        } else if (preset === 'mesh') {
            for (let i = 0; i < 3; i++) {
                const x = width * [0.2, 0.8, 0.45][i];
                const y = height * [0.15, 0.5, 0.88][i];
                const gradient = new Cairo.RadialGradient(x, y, 0, x, y, Math.max(width, height) * 0.65);
                gradient.addColorStopRGBA(0, ...palette[i], 0.25);
                gradient.addColorStopRGBA(1, ...palette[i], 0);
                cr.setSource(gradient);
                cr.rectangle(0, 0, width, height); cr.fill();
            }
        }
        cr.$dispose();
    });
    parent.add_child(layer);
    return layer;
}
