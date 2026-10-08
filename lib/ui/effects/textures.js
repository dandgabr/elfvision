// Allocation-cached static decoration. Never repaints for animation or reads external assets.
import Atk from 'gi://Atk';
import St from 'gi://St';
import {hexToRgb} from '../../core/theme.js';

export function textureLayer(parent, {preset, color, geometry = 'orthogonal'}) {
    if (preset === 'none')
        return null;
    const layer = new St.DrawingArea({name: `gaq-texture-${preset}`, reactive: false, can_focus: false, accessible_role: Atk.Role.REDUNDANT_OBJECT, x_expand: true, y_expand: true});
    layer._effectPaints = 0;
    layer.connect('repaint', () => {
        layer._effectPaints++;
        const cr = layer.get_context();
        const [width, height] = layer.get_surface_size();
        layer._effectPaintSize = [width, height];
        const [r, g, b] = hexToRgb(color);
        cr.setSourceRGBA(r / 255, g / 255, b / 255, 0.09);
        cr.setLineWidth(1);
        if (['grain', 'paper'].includes(preset)) {
            for (let i = 0; i < 240; i++) {
                const x = (i * 73 % 997) / 997 * width;
                const y = (i * 127 % 991) / 991 * height;
                cr.rectangle(x, y, preset === 'paper' ? 9 : 1, 1);
            }
            cr.fill();
        } else if (preset === 'grid' && geometry === 'diamond') {
            const slope = Math.tan(Math.PI / 6);
            const extent = width * slope;
            const count = Math.min(100, Math.ceil((height + extent) / 24));
            for (let i = 0; i < count; i++) {
                const y = i * 24 - extent;
                cr.moveTo(0, y); cr.lineTo(width, y + extent);
                cr.moveTo(width, y); cr.lineTo(0, y + extent);
            }
            cr.stroke();
        } else if (['scanlines', 'grid'].includes(preset)) {
            const gap = preset === 'scanlines' ? 6 : 24;
            for (let i = 0; i < Math.min(100, height / gap); i++) { cr.moveTo(0, i * gap); cr.lineTo(width, i * gap); }
            if (preset === 'grid')
                for (let i = 0; i < Math.min(100, width / gap); i++) { cr.moveTo(i * gap, 0); cr.lineTo(i * gap, height); }
            cr.stroke();
        } else if (preset === 'botanical') {
            for (let i = 0; i < 8; i++) {
                const x = i % 2 ? width - 20 : 20;
                const y = (i + 0.5) / 8 * height;
                cr.moveTo(x, y + 14); cr.curveTo(x - 16, y, x + 16, y - 16, x, y + 14);
            }
            cr.stroke();
        } else if (preset === 'strokes') {
            for (let i = 0; i < 8; i++) {
                const y = (i + 0.5) / 8 * height;
                cr.moveTo(0, y); cr.curveTo(width * 0.3, y - 5, width * 0.6, y + 5, width, y);
            }
            cr.stroke();
        } else if (preset === 'chamfer') {
            cr.moveTo(0, 20); cr.lineTo(20, 0); cr.lineTo(width - 20, 0); cr.lineTo(width, 20);
            cr.moveTo(0, height - 20); cr.lineTo(20, height); cr.lineTo(width - 20, height); cr.lineTo(width, height - 20);
            cr.stroke();
        }
        cr.$dispose();
    });
    parent.add_child(layer);
    return layer;
}
