// Pure theme-effect contract. Themes choose packaged presets, never code or asset paths.
export const MATERIAL_PRESETS = ['opaque', 'translucent', 'decorative-glass', 'frosted-glass'];
export const MOTION_PRESETS = ['none', 'interaction', 'leaves', 'gradient', 'motes', 'pulse'];
export const TEXTURE_PRESETS = ['none', 'paper', 'grain', 'scanlines', 'grid', 'botanical', 'strokes', 'chamfer'];
export const MAX_PARTICLES = 12;
export const MIN_BACKGROUND_OPACITY = 0.72;
const FIELDS = ['material', 'motion', 'texture', 'particleCount', 'opacity', 'compatibleMaterials'];
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const staticProfile = () => ({material: 'opaque', motion: 'none', texture: 'none', particleCount: 0, opacity: {light: 1, dark: 1}, compatibleMaterials: ['opaque']});

/** Invalid optional data disables its whole profile, while old token-only themes stay valid. */
export function validateEffectProfile(raw) {
    const profile = staticProfile();
    if (raw === undefined)
        return {profile, problems: []};
    const problems = [];
    if (!plainObject(raw))
        return {profile, problems: ['effects must be an object']};
    // Only names are reported. Hostile values never enter messages or a renderer.
    if (Object.keys(raw).some(key => !FIELDS.includes(key)))
        problems.push('effects has unknown fields');
    for (const [key, presets] of [['material', MATERIAL_PRESETS], ['motion', MOTION_PRESETS], ['texture', TEXTURE_PRESETS]]) {
        if (raw[key] === undefined)
            continue;
        if (!presets.includes(raw[key]))
            problems.push(`effects.${key} is not an allowed preset`);
        else
            profile[key] = raw[key];
    }
    profile.compatibleMaterials = [profile.material];
    if (raw.compatibleMaterials !== undefined) {
        const materials = raw.compatibleMaterials;
        if (!Array.isArray(materials) || materials.length < 1 || materials.length > MATERIAL_PRESETS.length ||
            materials.some(material => !MATERIAL_PRESETS.includes(material)) || new Set(materials).size !== materials.length)
            problems.push('effects.compatibleMaterials must be a unique list of one to four allowed materials');
        else
            profile.compatibleMaterials = [...materials];
    }
    if (raw.particleCount !== undefined) {
        if (!Number.isSafeInteger(raw.particleCount))
            problems.push('effects.particleCount must be a finite integer');
        else
            profile.particleCount = Math.max(0, Math.min(MAX_PARTICLES, raw.particleCount));
    } else if (['leaves', 'motes'].includes(profile.motion)) {
        profile.particleCount = 8;
    }
    if (raw.opacity !== undefined) {
        if (!plainObject(raw.opacity) || Object.keys(raw.opacity).some(key => !['light', 'dark'].includes(key))) {
            problems.push('effects.opacity must contain only light and dark numeric values');
        } else {
            for (const scheme of ['light', 'dark']) {
                if (raw.opacity[scheme] === undefined)
                    continue;
                const value = raw.opacity[scheme];
                if (typeof value !== 'number' || !Number.isFinite(value))
                    problems.push(`effects.opacity.${scheme} must be a finite number`);
                else
                    profile.opacity[scheme] = Math.max(MIN_BACKGROUND_OPACITY, Math.min(1, value));
            }
        }
    }
    return {profile: problems.length ? staticProfile() : profile, problems};
}

/** Runtime permissions. Origin is set by the loader, never read from theme JSON. */
export function effectPolicy({origin, profile, mode, animationsEnabled, transparencyEnabled, popupOpen, materialPreference = 'theme'}) {
    const quiet = {motion: 'none', material: 'opaque', particleCount: 0};
    if (origin !== 'builtin' || !popupOpen || !['off', 'subtle', 'full'].includes(mode))
        return quiet;
    const {profile: safe, problems} = validateEffectProfile(profile);
    if (problems.length)
        return quiet;
    let motion = 'none';
    if (mode !== 'off' && animationsEnabled === true && safe.motion !== 'none')
        motion = mode === 'full' && safe.motion !== 'interaction' ? 'ambient' : 'interaction';
    const material = safe.compatibleMaterials.includes(materialPreference) ? materialPreference : safe.material;
    return {
        motion,
        material: transparencyEnabled === true ? material : 'opaque',
        particleCount: motion === 'ambient' && ['leaves', 'motes'].includes(safe.motion) ? safe.particleCount : 0,
    };
}
