// Themes are data (docs/adr/0006): a theme.json holds tokens for a light and a
// dark scheme, and this module validates it and compiles it, together with
// lib/core/theme.template.css, into the stylesheet the extension loads.
// St has no var(), so the tokens are substituted at compile time.
//
// Pure JavaScript, tested under `gjs -m`. A theme file can come from the user's
// own folder, so everything in it is validated: colors must be hex, sizes are
// clamped, font names are reduced to safe characters, and a shadow must match
// a single, simple shape. Nothing from a theme reaches the CSS unchecked.

export const COLOR_TOKENS = ['bg', 'surface', 'surface-2', 'fg', 'muted', 'border', 'accent', 'accent-fg', 'ok', 'warn', 'danger'];
const SYSTEM_ACCENT = 'system-accent';

// libadwaita's accent palette (light variants); the dark scheme lightens them.
export const ACCENTS = {
    blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#c88800',
    orange: '#ed5b00', red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396',
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;
// One shadow: two to four lengths (offsets, blur, spread), a hex or rgba color, optional inset.
const LENGTH = '-?\\d{1,3}(\\.\\d+)?(px)?';
const SHADOW = new RegExp(`^(inset )?${LENGTH}( ${LENGTH}){1,3} (#[0-9a-f]{3,8}|rgba?\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*(,\\s*[0-9.]+\\s*)?\\))( inset)?$`, 'i');

export function hexToRgb(hex) {
    let value = hex.slice(1);
    if (value.length === 3)
        value = value.split('').map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
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

function number(value, fallback, min, max) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

/** The first family of a CSS font stack, if it is made of safe characters. */
function family(stack) {
    if (typeof stack !== 'string')
        return null;
    const first = stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    return FAMILY.test(first) && !/^(system-ui|sans-serif|serif|monospace|ui-monospace)$/i.test(first) ? first : null;
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
    // `error` is optional: a failing provider falls back to the warning color.
    scheme.error = validColor(raw.error) ? raw.error : scheme.warn;
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

    return {
        theme: {
            id: raw.id,
            name: typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 64) : raw.id,
            schemes: {light, dark},
            radius: {
                card: number(raw.radius?.card, 14, 0, 40),
                control: number(raw.radius?.control, 8, 0, 40),
            },
            border: raw.border === 'strong' ? 'strong' : 'hairline',
            fonts: {body: family(raw.fonts?.body), display: family(raw.fonts?.display)},
        },
        problems,
    };
}

function resolve(theme, scheme, token, accentName) {
    const value = theme.schemes[scheme][token];
    return value === SYSTEM_ACCENT ? systemAccent(accentName, scheme === 'dark') : value;
}

function colorWithAlpha(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const fontDeclaration = name => (name ? `font-family: "${name}", sans-serif;` : '');

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
export function compileTheme(template, theme, {scheme, accentName = 'blue'}) {
    const scalars = {
        radius: `${theme.radius.card}px`,
        'radius-sm': `${theme.radius.control}px`,
        'pill-radius': theme.radius.control >= 6 ? '99px' : `${theme.radius.control}px`,
        'menu-radius': `${theme.radius.card + 6}px`,
        bw: theme.border === 'strong' ? '2px' : '1px',
        shadow: theme.schemes[scheme].shadow,
        'font-body-decl': fontDeclaration(theme.fonts.body),
        'font-display-decl': fontDeclaration(theme.fonts.display ?? theme.fonts.body),
    };

    const missing = new Set();
    const css = template.replace(/\{\{\s*(?:([pb]):)?([a-z0-9-]+)(?:@([0-9.]+))?\s*\}\}/g, (match, kind, name, alpha) => {
        if (kind) {
            const use = kind === 'p' ? scheme : 'dark';
            if (!(name in theme.schemes[use])) {
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
