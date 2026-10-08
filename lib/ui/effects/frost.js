// One native backdrop surface; never attach blur to the popup controls or sample a full desktop clone.
import Shell from 'gi://Shell';

export const FROST_RADIUS = 18;
export function attachFrost(actor) {
    if (typeof Shell.BlurEffect !== 'function' || Shell.BlurMode?.BACKGROUND === undefined)
        return null;
    try {
        const effect = new Shell.BlurEffect({mode: Shell.BlurMode.BACKGROUND, radius: FROST_RADIUS, brightness: 1});
        actor.add_effect_with_name('gaq-backdrop', effect);
        return effect;
    } catch (_error) {
        // Renderer uses decorative glass when the native capability is unavailable.
        return null;
    }
}

export function removeFrost(actor) {
    actor.remove_effect_by_name('gaq-backdrop');
}
