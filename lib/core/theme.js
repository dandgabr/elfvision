// Themes are data (docs/adr/0006): a theme.json holds tokens for a light and a
// dark scheme, and this module validates it and compiles it, together with
// lib/core/theme.template.css, into the stylesheet the extension loads.
// St has no var(), so the tokens are substituted at compile time.
//
// Pure JavaScript, tested under `gjs -m`. A theme file can come from the user's
// own folder, so everything in it is validated: colors must be hex, sizes are
// clamped, font names are reduced to safe characters, and a shadow must match
// a single, simple shape. Nothing from a theme reaches the CSS unchecked.

import {validateEffectProfile} from './themeEffects.js';

export const COLOR_TOKENS = ['bg', 'surface', 'fg', 'muted', 'border', 'accent', 'warn', 'danger'];
// Optional: a theme may leave these out and get a derived value.
const OPTIONAL_TOKENS = ['surface-2', 'accent-fg', 'ok', 'error'];
const SYSTEM_ACCENT = 'system-accent';
// A system accent in these hues would make a normal bar look like a warning or
// a critical one, so meter fills use blue instead (the accent still colors focus).
const FILL_FALLBACK = ['yellow', 'orange', 'red', 'pink'];

// libadwaita's accent palette (light variants); the dark scheme lightens them.
export const ACCENTS = {
    blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#9c6f00',
    orange: '#ed5b00', red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396',
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const SHADOW_HEX = '(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8}))';
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;
// One shadow: two to four lengths in px (offsets, blur, spread), then a hex or rgba color.
const LENGTH = '(?:-?\\d{1,3}(?:\\.\\d{1,2})?px|0)';
const SHADOW = new RegExp(`^(?:inset )?${LENGTH}(?: ${LENGTH}){1,3} (?:${SHADOW_HEX}|rgba?\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*(?:,\\s*(?:0|1|0?\\.\\d{1,3})\\s*)?\\))$`, 'i');

export function hexToRgb(hex) {
    let value = hex.slice(1);
    if (value.length === 3)
        value = value.split('').map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
}

// Worst-case compositor model for exposed reading areas. Overlapping particles
// and decorative layers can accumulate arbitrary coverage; model them as fully
// opaque black/white endpoints rather than assuming one sprite's alpha bound.
// Protect primary and secondary ink with a smooth background-colored veil.
export function readingVeilOpacity(colors, opacity, decorativeOpacity = 1) {
    const background = hexToRgb(colors.bg);
    const alpha = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1));
    const ink = [colors.fg, colors.muted ?? colors.fg].map(color => luminance(color, true));
    const blend = (front, back, amount) => front.map((value, index) => value * amount + back[index] * (1 - amount));
    const coverage = Math.max(0, Math.min(1, decorativeOpacity));
    const endpoints = [0, 255].flatMap(desktop => [0, 255].map(decoration =>
        blend([decoration, decoration, decoration], blend(background, [desktop, desktop, desktop], alpha), coverage)));
    const sufficient = amount => {
        const lights = endpoints.map(endpoint => luminance(blend(background, endpoint, amount), true));
        const minimum = Math.min(...lights), maximum = Math.max(...lights);
        // Safe black and white endpoints can lie on opposite sides of the ink.
        // Then an intermediate desktop/decorative color would erase the text.
        // The entire monotonic luminance interval must stay on one side of ink.
        return ink.every(value => !(minimum <= value && value <= maximum) && lights.every(light =>
            (Math.max(value, light) + 0.05) / (Math.min(value, light) + 0.05) >= 4.5));
    };
    for (let step = 0; step <= 100; step++) {
        if (sufficient(step / 100))
            return step / 100;
    }
    return 1;
}

// Cached gradient bands follow measured reading allocations, not assumptions
// about font size or translated footer length. Keep a transparent center unless
// the reading zones and their smooth fades consume the complete popup height.
export function readingVeilStops(height, {topEnd, bottomStart} = {}) {
    const top = Math.max(40, Number.isFinite(topEnd) ? topEnd + 4 : 40);
    const bottom = Math.min(height - 80, Number.isFinite(bottomStart) ? bottomStart - 4 : height - 80);
    if (height <= 220 || top + 50 >= bottom - 50)
        return [[0, 1], [height, 1]];
    return [[0, 1], [top, 1], [top + 50, 0], [bottom - 50, 0], [bottom, 1], [height, 1]];
}

// Decorative ink is scheme aware and independent of semantic status colors.
// Kept pure so the native texture layer and its accessibility checks agree.
export function textureInk(preset, colors, scheme) {
    const dark = scheme === 'dark';
    if (preset === 'paper' || preset === 'grain')
        return {color: colors.fg, alpha: dark ? 0.20 : 0.12};
    if (preset === 'strokes')
        return {color: colors.fg, alpha: dark ? 0.28 : 0.22};
    return {color: colors.accent, alpha: dark ? 0.16 : 0.12};
}

const toHex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** Mix a color toward white by `amount` (0 to 1). */
function lighten(hex, amount) {
    return toHex(hexToRgb(hex).map(v => v + (255 - v) * amount));
}

/**
 * The GNOME accent color for the active scheme.
 *
 * @param {string} name - an `accent-color` value from org.gnome.desktop.interface
 * @param {boolean} dark
 * @returns {string} hex color
 */
export function systemAccent(name, dark) {
    const base = ACCENTS[name] ?? ACCENTS.blue;
    return dark ? lighten(base, 0.35) : base;
}

/**
 * @param {'system'|'light'|'dark'} preference
 * @param {boolean} systemPrefersDark
 * @returns {'light'|'dark'}
 */
export function pickScheme(preference, systemPrefersDark) {
    if (preference === 'light' || preference === 'dark')
        return preference;
    return systemPrefersDark ? 'dark' : 'light';
}

function validColor(value, allowSystemAccent = false) {
    return typeof value === 'string' && (HEX.test(value) || (allowSystemAccent && value === SYSTEM_ACCENT));
}

// Whole pixels only: a tiny fraction would print as 1e-7 and St drops the rule.
function number(value, fallback, min, max) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : fallback;
}

// Preserve bounded, validated local fallback families. Selecting a theme never
// downloads a font, and every family is checked before becoming native CSS.
function family(stack) {
    if (typeof stack !== 'string' || stack.length > 512)
        return null;
    const parts = stack.split(',').map(part => part.trim().replace(/^['"]|['"]$/g, ''));
    if (parts.length > 8 || parts.some(part => !FAMILY.test(part)))
        return null;
    const generics = new Set(['system-ui', 'sans-serif', 'serif', 'monospace', 'ui-monospace', 'cursive']);
    if (generics.has(parts[0].toLowerCase()))
        return null;
    const last = parts[parts.length - 1].toLowerCase();
    const generic = last === 'ui-monospace' ? 'monospace'
        : last === 'system-ui' ? 'sans-serif' : generics.has(last) ? last : 'sans-serif';
    const names = parts.filter(part => !generics.has(part.toLowerCase()));
    return {name: names[0], generic, fallbacks: names.slice(1)};
}

function luminance(color, relative = false) {
    const rgb = Array.isArray(color) ? color : hexToRgb(color);
    const [r, g, b] = rgb.map(value => {
        const channel = value / 255;
        if (!relative)
            return channel;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function validateScheme(raw, name, problems) {
    if (!raw || typeof raw !== 'object') {
        problems.push(`missing "${name}" scheme`);
        return null;
    }
    const scheme = {};
    for (const token of COLOR_TOKENS) {
        if (!validColor(raw[token], token === 'accent')) {
            problems.push(`${name}.${token} is not a hex color`);
            return null;
        }
        scheme[token] = raw[token];
    }
    const dark = luminance(scheme.bg) < 0.4;
    for (const token of OPTIONAL_TOKENS) {
        if (validColor(raw[token]))
            scheme[token] = raw[token];
    }
    // Derived defaults: an error color distinct from warn and danger, a plain
    // second surface, an ink that reads on the accent, and the warn-free green.
    scheme.fill = scheme.accent;
    scheme.error ??= dark ? '#ffa348' : '#b04a00';
    scheme['surface-2'] ??= scheme.surface;
    scheme.ok ??= dark ? '#8ff0a4' : '#1a7f4c';
    scheme['accent-fg'] ??= scheme.accent === SYSTEM_ACCENT || luminance(scheme.accent) > 0.4 ? '#0d0d12' : '#ffffff';
    scheme.shadow = typeof raw.shadow === 'string' && SHADOW.test(raw.shadow.trim()) ? raw.shadow.trim() : 'none';
    return scheme;
}

/**
 * Validate a parsed theme.json.
 *
 * @param {object} raw
 * @returns {{theme: object|null, problems: string[]}} `theme` is null when the
 *   file cannot be used
 */
export function validateTheme(raw) {
    const problems = [];
    if (!raw || typeof raw !== 'object')
        return {theme: null, problems: ['theme is not an object']};
    if (typeof raw.id !== 'string' || !ID.test(raw.id))
        return {theme: null, problems: ['theme has no valid id (lowercase letters, digits and dashes)']};

    const light = validateScheme(raw.schemes?.light, 'light', problems);
    const dark = validateScheme(raw.schemes?.dark, 'dark', problems);
    if (!light || !dark)
        return {theme: null, problems};

    const effects = validateEffectProfile(raw.effects);
    problems.push(...effects.problems);
    return {
        theme: {
            id: raw.id,
            effects: effects.profile,
            name: typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 64) : raw.id,
            schemes: {light, dark},
            radius: {
                card: number(raw.radius?.card, 14, 0, 40),
                control: number(raw.radius?.control, 8, 0, 40),
            },
            description: typeof raw.description === 'string' ? raw.description.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) : '',
            border: raw.border === 'strong' ? 'strong' : 'hairline',
            fonts: {body: family(raw.fonts?.body), display: family(raw.fonts?.display)},
        },
        problems,
    };
}

/**
 * Four colors that sketch a theme for the picker, per scheme: background,
 * surface, accent and text.
 *
 * @returns {{light: string[], dark: string[]}}
 */
export function swatches(theme) {
    const pick = scheme => ['bg', 'surface', 'accent', 'fg'].map(token => resolve(theme, scheme, token, 'blue'));
    return {light: pick('light'), dark: pick('dark')};
}

// Focus sits beside popup/card surfaces and their hover, focus and checked tints.
// Keep the theme accent only when every adjacent background has 3:1 contrast.
function focusColor(theme, scheme, accentName) {
    const tokens = theme.schemes[scheme];
    const foreground = hexToRgb(tokens.fg);
    const accent = resolve(theme, scheme, 'accent', accentName);
    const accentLuminance = luminance(accent, true);
    const sufficient = ['bg', 'surface'].every(token => [0, 0.06, 0.08, 0.14, 0.2].every(alpha => {
        const background = hexToRgb(tokens[token]).map((channel, index) =>
            channel * (1 - alpha) + foreground[index] * alpha);
        const backgroundLuminance = luminance(background, true);
        return (Math.max(accentLuminance, backgroundLuminance) + 0.05)
            / (Math.min(accentLuminance, backgroundLuminance) + 0.05) >= 3;
    }));
    return sufficient ? accent : tokens.fg;
}

function resolve(theme, scheme, token, accentName) {
    if (token === 'focus')
        return focusColor(theme, scheme, accentName);
    const value = theme.schemes[scheme][token];
    if (token === 'fill' && value === SYSTEM_ACCENT && FILL_FALLBACK.includes(accentName))
        return systemAccent('blue', scheme === 'dark');
    return value === SYSTEM_ACCENT ? systemAccent(accentName, scheme === 'dark') : value;
}

function colorWithAlpha(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const fontDeclaration = (font, resolver) => {
    if (!font)
        return '';
    const resolved = resolver?.(font);
    if (typeof resolved === 'string' && FAMILY.test(resolved))
        return `font-family: "${resolved}";`;
    return `font-family: ${[font.name, ...(font.fallbacks ?? [])].map(name => `"${name}"`).join(', ')}, ${font.generic};`;
};

// Native card shadows are paint, not layout. Bound their footprint to the same
// compact gutter in every theme and effect mode, preserving offset direction
// and color. Broad glow belongs to the popup backdrop rather than scroll cards.
const CARD_PAINT_GUTTER = 6;
function cardShadow(shadow) {
    if (typeof shadow !== 'string' || !SHADOW.test(shadow))
        return 'none';
    if (/^inset /i.test(shadow))
        return shadow;
    const match = shadow.match(/^((?:-?[\d.]+px|0)(?: (?:-?[\d.]+px|0)){1,3}) (.+)$/i);
    const lengths = match[1].split(' ').map(parseFloat);
    const [x, y, blur = 0, spread = 0] = lengths;
    const footprint = Math.max(Math.abs(x), Math.abs(y)) + Math.max(0, blur) + Math.max(0, spread);
    if (footprint <= CARD_PAINT_GUTTER)
        return shadow;
    const scale = CARD_PAINT_GUTTER / footprint;
    // Round toward zero so rounding never expands painting past the budget.
    return `${lengths.map(value => `${Math.trunc(value * scale * 100) / 100}px`).join(' ')} ${match[2]}`;
}


/**
 * Turn a theme into a stylesheet.
 *
 * @param {string} template - the text of lib/core/theme.template.css
 * @param {object} theme - a validated theme
 * @param {{scheme: 'light'|'dark', accentName?: string}} options - `scheme` is
 *   used for the popup; the top bar always uses the dark scheme because it
 *   sits on the shell's dark panel
 * @returns {string}
 * @throws {Error} when the template names a token the theme cannot provide
 */
export function compileTheme(template, theme, {scheme, accentName = 'blue', fontResolver}) {
    const scalars = {
        radius: `${theme.radius.card}px`,
        'radius-sm': `${theme.radius.control}px`,
        'pill-radius': theme.radius.control >= 6 ? '99px' : `${theme.radius.control}px`,
        'menu-radius': `${theme.radius.card === 0 ? 0 : theme.radius.card + 6}px`,
        // Serif, monospace and handwritten faces read smaller at the same size.
        'fs-small': theme.fonts.body && theme.fonts.body.generic !== 'sans-serif' ? '12px' : '11px',
        bw: theme.border === 'strong' ? '2px' : '1px',
        shadow: cardShadow(theme.schemes[scheme].shadow),
        'shadow-gutter': `${CARD_PAINT_GUTTER}px`,
        'font-body-decl': fontDeclaration(theme.fonts.body, fontResolver),
        'font-display-decl': fontDeclaration(theme.fonts.display ?? theme.fonts.body, fontResolver),
    };

    const missing = new Set();
    const css = template.replace(/\{\{\s*(?:([pb]):)?([a-z0-9-]+)(?:@([0-9.]+))?\s*\}\}/g, (match, kind, name, alpha) => {
        if (kind) {
            const use = kind === 'p' ? scheme : 'dark';
            if (name !== 'focus' && !(name in theme.schemes[use])) {
                missing.add(match);
                return match;
            }
            const color = resolve(theme, use, name, accentName);
            return alpha === undefined ? color : colorWithAlpha(color, alpha);
        }
        if (!(name in scalars)) {
            missing.add(match);
            return match;
        }
        return scalars[name];
    });
    if (missing.size)
        throw new Error(`the template uses tokens the theme does not define: ${[...missing].join(', ')}`);
    return css;
}

/** Detached safe colors for renderer-owned surfaces. */
export function resolvedColors(theme, scheme, accentName = 'blue') {
    return Object.fromEntries([...COLOR_TOKENS, ...OPTIONAL_TOKENS, 'fill', 'focus']
        .map(token => [token, resolve(theme, scheme, token, accentName)]));
}
