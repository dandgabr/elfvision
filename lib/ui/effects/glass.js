// Alpha belongs to the background tint. Control actors never inherit reduced opacity.
import {opticalLayer} from './optics.js';
import {hexToRgb} from '../../core/theme.js';

export function tint(color, alpha) {
    const safe = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '#36363a';
    const [r, g, b] = hexToRgb(safe);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyMaterial(actor, {colors, opacity, radius, glass}) {
    actor.opacity = 255;
    actor.set_style(`background-color: ${tint(colors.bg, opacity)}; border-radius: ${radius}px; border: 1px solid ${tint(colors.border, glass ? 0.8 : 0.5)};`);
}

export function glassHighlight(decoration, colors) {
    return opticalLayer(decoration, {preset: 'glass', colors});
}
