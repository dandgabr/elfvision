import GLib from 'gi://GLib';

import {assertEqual, assertTrue, test, tmpDir} from './harness.js';
import {effectPolicy, validateEffectProfile} from '../lib/core/themeEffects.js';
import {builtinCatalog} from '../lib/prefs/themeCatalog.js';
import {ACCENTS, compileTheme, hexToRgb, pickScheme, swatches, systemAccent, validateTheme, resolvedColors} from '../lib/core/theme.js';

const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const read = path => new TextDecoder().decode(GLib.file_get_contents(`${root}/${path}`)[1]);
const TEMPLATE = read('lib/core/theme.template.css');
const builtinIds = () => {
    const dir = GLib.Dir.open(`${root}/themes/builtin`, 0);
    const ids = [];
    for (let name = dir.read_name(); name !== null; name = dir.read_name())
        ids.push(name);
    return ids.sort();
};
const loadTheme = id => validateTheme(JSON.parse(read(`themes/builtin/${id}/theme.json`)));

const EXPECTED_THEME_IDS = [
    'ai-native-generative-ui', 'analog-newspaper-broadsheet', 'aurora-mesh-gradient',
    'bento-grid', 'card-based-ui', 'cyberpunk', 'de-stijl', 'expressive-variable-typography',
    'flat-design', 'glassmorphism', 'hand-drawn-sketch', 'holographic-foil-iridescent',
    'isometric', 'linear-saas', 'lunarpunk', 'mid-century-modern', 'nanopunk',
    'organic-biophilic', 'sistema-gnome', 'solarpunk', 'terminal-tui', 'web-brutalism',
];

test('themes: the reviewed inventory ships the exact expected theme slugs and each validates', () => {
    const ids = builtinIds();
    assertEqual(ids, EXPECTED_THEME_IDS);
    for (const id of ids) {
        const {theme, problems} = loadTheme(id);
        assertEqual([id, problems, theme?.id], [id, [], id]);
    }
});

test('themes: every theme compiles in both schemes with no placeholder left', () => {
    for (const id of builtinIds()) {
        const {theme} = loadTheme(id);
        for (const scheme of ['light', 'dark']) {
            const css = compileTheme(TEMPLATE, theme, {scheme});
            assertTrue(!css.includes('{{'), `${id}/${scheme} still has a placeholder`);
            assertTrue(css.includes('.gaq-card {') && css.includes('.gaq-meter-fill'), `${id}/${scheme} lost its rules`);
            assertTrue(!/rgba\(NaN|undefined|NaN/.test(css), `${id}/${scheme} has a bad value`);
        }
    }
});

test('themes: the popup follows the scheme, the top bar always uses the dark one', () => {
    const {theme} = loadTheme('sistema-gnome');
    const light = compileTheme(TEMPLATE, theme, {scheme: 'light', accentName: 'blue'});
    const dark = compileTheme(TEMPLATE, theme, {scheme: 'dark', accentName: 'blue'});
    assertTrue(light.includes('background-color: #fafafa;'), 'light popup surface');
    assertTrue(dark.includes('background-color: #36363a;'), 'dark popup surface');
    // The warning color of the bar is the dark scheme's in both.
    for (const css of [light, dark]) {
        const rule = css.slice(css.indexOf('.gaq-item.gaq-warning .gaq-number'));
        assertTrue(rule.slice(0, 120).includes('#f5c211'), 'bar warning color');
    }
});

test('themes: the system accent follows the GNOME color and brightens in the dark scheme', () => {
    const {theme} = loadTheme('sistema-gnome');
    const teal = compileTheme(TEMPLATE, theme, {scheme: 'light', accentName: 'teal'});
    assertTrue(teal.includes('background-color: #2190a4;'), 'teal fill in light');
    const tealDark = compileTheme(TEMPLATE, theme, {scheme: 'dark', accentName: 'teal'});
    assertTrue(tealDark.includes(systemAccent('teal', true)));
    assertEqual(systemAccent('nonsense', false), '#3584e4');
    assertTrue(systemAccent('blue', true) !== systemAccent('blue', false));
});

test('themes: alpha placeholders become rgba values', () => {
    const {theme} = loadTheme('sistema-gnome');
    const css = compileTheme('a {{b:fg@0.5}} b {{p:bg}} c {{radius}}', theme, {scheme: 'dark'});
    assertEqual(css, 'a rgba(255, 255, 255, 0.5) b #36363a c 14px');
});

test('themes: a template that asks for an unknown token fails loudly', () => {
    const {theme} = loadTheme('sistema-gnome');
    let message = '';
    try {
        compileTheme('x {{p:nonexistent}}', theme, {scheme: 'dark'});
    } catch (error) {
        message = error.message;
    }
    assertTrue(message.includes('{{p:nonexistent}}'), message);
});

test('themes: files that are not themes, or that try to inject CSS, are rejected', () => {
    const good = JSON.parse(read('themes/builtin/linear-saas/theme.json'));
    const withColor = color => ({...good, schemes: {...good.schemes, dark: {...good.schemes.dark, fg: color}}});
    assertEqual(validateTheme(null).theme, null);
    assertEqual(validateTheme({...good, id: 'Bad Id!'}).theme, null);
    assertEqual(validateTheme({id: 'x', schemes: {}}).theme, null);
    assertEqual(validateTheme(withColor('red;} body {display:none')).theme, null);
    assertEqual(validateTheme(withColor('url(http://evil)')).theme, null);
    const missing = {...good, schemes: {...good.schemes, light: undefined}};
    assertEqual(validateTheme(missing).theme, null);
    assertTrue(validateTheme(missing).problems[0].includes('light'));
});

test('themes: fonts, sizes and shadows are sanitized', () => {
    const good = JSON.parse(read('themes/builtin/linear-saas/theme.json'));
    const hostile = {...good,
        fonts: {body: "Evil';}body{display:none", display: "'Space Grotesk',sans-serif"},
        radius: {card: 9999, control: -4},
        schemes: {...good.schemes, dark: {...good.schemes.dark, shadow: '0 0 0 1px red; background:url(x)'}}};
    const {theme} = validateTheme(hostile);
    assertEqual([theme.fonts.body, theme.fonts.display?.name], [null, 'Space Grotesk']);
    assertEqual([theme.radius.card, theme.radius.control], [40, 0]);
    assertEqual(theme.schemes.dark.shadow, 'none');
    const css = compileTheme(TEMPLATE, theme, {scheme: 'dark'});
    assertTrue(css.includes('font-family: "Space Grotesk", sans-serif;') && !css.includes('Evil'));
});

test('themes: a hard offset shadow and a strong border survive (neo-brutalism)', () => {
    const {theme} = loadTheme('web-brutalism');
    assertTrue(theme.border === 'strong' || theme.border === 'hairline');
    const withShadow = {...JSON.parse(read('themes/builtin/linear-saas/theme.json'))};
    withShadow.schemes.light.shadow = '5px 5px 0 0 #000';
    withShadow.border = 'strong';
    const parsed = validateTheme(withShadow).theme;
    const css = compileTheme(TEMPLATE, parsed, {scheme: 'light'});
    assertTrue(css.includes('box-shadow: 5px 5px 0 0 #000;') && css.includes('border: 2px solid'));
});

test('themes: scheme choice honors the preference, then the system', () => {
    assertEqual([pickScheme('light', true), pickScheme('dark', false)], ['light', 'dark']);
    assertEqual([pickScheme('system', true), pickScheme('system', false)], ['dark', 'light']);
    assertEqual(pickScheme('anything', true), 'dark');
});

// ---- theme files (hostile input from the filesystem)

import Gio from 'gi://Gio';
import {loadTheme as loadThemeFile, scanThemes} from '../lib/services/themeFiles.js';

function sandbox() {
    const path = tmpDir();
    GLib.mkdir_with_parents(`${path}/themes/builtin`, 0o755);
    return path;
}
const writeTheme = (sandboxPath, id, text) => {
    GLib.mkdir_with_parents(`${sandboxPath}/themes/builtin/${id}`, 0o755);
    GLib.file_set_contents(`${sandboxPath}/themes/builtin/${id}/theme.json`, text);
};
const goodJson = id => read('themes/builtin/linear-saas/theme.json').replace('"linear-saas"', `"${id}"`);

test('theme files: a good theme loads, a mismatched id and bad ids do not', () => {
    const dir = sandbox();
    writeTheme(dir, 'mine', goodJson('mine'));
    writeTheme(dir, 'liar', goodJson('someone-else'));
    assertEqual(loadThemeFile(dir, 'mine').theme?.id, 'mine');
    const liar = loadThemeFile(dir, 'liar');
    assertEqual(liar.theme, null);
    assertTrue(liar.problems.some(p => p.includes('does not match')), JSON.stringify(liar.problems));
    for (const id of ['../../etc', 'a\n', 'ABC', 'a/b', '', '-x'])
        assertEqual([id, loadThemeFile(dir, id).theme], [id, null]);
});

test('theme files: symlinks to endless files, pipes and huge files are refused without blocking', () => {
    const dir = sandbox();
    GLib.mkdir_with_parents(`${dir}/themes/builtin/zero`, 0o755);
    Gio.File.new_for_path(`${dir}/themes/builtin/zero/theme.json`).make_symbolic_link('/dev/zero', null);
    GLib.mkdir_with_parents(`${dir}/themes/builtin/pipe`, 0o755);
    GLib.spawn_command_line_sync(`mkfifo ${dir}/themes/builtin/pipe/theme.json`);
    writeTheme(dir, 'huge', ' '.repeat(70 * 1024));
    for (const id of ['zero', 'pipe', 'huge'])
        assertEqual([id, loadThemeFile(dir, id).theme], [id, null]);
});

test('theme files: scanThemes lists good themes first and reports rejected folders', () => {
    const dir = sandbox();
    writeTheme(dir, 'sistema-gnome', goodJson('sistema-gnome'));
    writeTheme(dir, 'aaa', goodJson('aaa'));
    writeTheme(dir, 'broken', '{not json');
    const {themes, rejected} = scanThemes(dir);
    assertEqual(themes.map(t => t.id).filter(id => ['sistema-gnome', 'aaa'].includes(id)), ['sistema-gnome', 'aaa']);
    assertTrue(rejected.some(r => r.id === 'broken'), JSON.stringify(rejected));
});

test('themes: hostile numbers, shadows and optional tokens', () => {
    const good = JSON.parse(read('themes/builtin/linear-saas/theme.json'));
    for (const shadow of ['0 0 0 #12345', '0 4 8 #000', '0 0 0 1px #000 inset', '0 0 0 rgba(0,0,0,1.2.3)'])
        assertEqual([shadow, validateTheme({...good, schemes: {...good.schemes, dark: {...good.schemes.dark, shadow}}}).theme.schemes.dark.shadow], [shadow, 'none']);
    const ok = validateTheme({...good, schemes: {...good.schemes, dark: {...good.schemes.dark, shadow: '4px 4px 0 #000'}}});
    assertEqual(ok.theme.schemes.dark.shadow, '4px 4px 0 #000');
    const tiny = validateTheme({...good, radius: {card: 1e-7, control: 'Infinity'}}).theme;
    assertEqual([tiny.radius.card, tiny.radius.control], [0, 8]);
    const slim = JSON.parse(JSON.stringify(good));
    for (const sc of ['light', 'dark'])
        for (const token of ['surface-2', 'accent-fg', 'ok', 'error'])
            delete slim.schemes[sc][token];
    const result = validateTheme(slim);
    assertEqual(result.problems, []);
    assertTrue(!compileTheme(TEMPLATE, result.theme, {scheme: 'dark'}).includes('{{'));
});

test('themes: a font keeps its generic family', () => {
    const good = JSON.parse(read('themes/builtin/linear-saas/theme.json'));
    const mono = validateTheme({...good, fonts: {body: "'JetBrains Mono', ui-monospace, monospace"}}).theme;
    assertTrue(compileTheme(TEMPLATE, mono, {scheme: 'dark'}).includes('font-family: "JetBrains Mono", monospace;'));
});

test('themes: a warning-like system accent does not color the meter fills', () => {
    const {theme} = loadTheme('sistema-gnome');
    for (const name of ['yellow', 'orange', 'red', 'pink']) {
        const css = compileTheme(TEMPLATE, theme, {scheme: 'light', accentName: name});
        assertTrue(css.includes('background-color: #3584e4;'), `${name} fill`);
    }
    assertTrue(compileTheme(TEMPLATE, theme, {scheme: 'light', accentName: 'green'}).includes('background-color: #3a944a;'));
});

test('themes: every generated theme has its own error color and a visible accent', () => {
    for (const id of builtinIds().filter(x => x !== 'sistema-gnome')) {
        const {theme} = loadTheme(id);
        for (const scheme of ['light', 'dark']) {
            const tokens = theme.schemes[scheme];
            assertTrue(tokens.error !== tokens.warn && tokens.error !== tokens.danger, `${id}/${scheme} error`);
        }
    }
});

test('themes: serif and monospace themes get larger small text, with a description kept', () => {
    const serif = loadTheme('web-brutalism').theme;
    const sans = loadTheme('linear-saas').theme;
    assertTrue(compileTheme(TEMPLATE, serif, {scheme: 'light'}).includes('font-size: 12px;'));
    assertTrue(!compileTheme(TEMPLATE, sans, {scheme: 'light'}).includes('{{fs-small}}'));
    assertTrue(loadTheme('sistema-gnome').theme.description.length > 0);
});

test('themes: swatches give four hex colors per scheme, even for the system accent', () => {
    for (const id of builtinIds()) {
        const {light, dark} = swatches(loadTheme(id).theme);
        for (const colors of [light, dark])
            assertTrue(colors.length === 4 && colors.every(c => /^#[0-9a-f]{6}$/i.test(c) || /^#[0-9a-f]{3}$/i.test(c)), `${id}: ${colors}`);
    }
});

test('themes: optional effects validate without weakening hex colors or old theme compatibility', () => {
    const raw = JSON.parse(read('themes/builtin/linear-saas/theme.json'));
    const legacy = {...raw};
    delete legacy.effects;
    assertEqual(validateTheme(legacy).theme.effects.motion, 'none');
    const good = validateTheme({...raw, effects: {material: 'frosted-glass', motion: 'leaves', opacity: {light: 0.8, dark: 0.9}}});
    assertEqual(good.problems, []);
    assertEqual([good.theme.effects.material, good.theme.effects.particleCount], ['frosted-glass', 8]);
    const bad = validateTheme({...raw, effects: {shader: 'void main(){}'}});
    assertTrue(bad.theme !== null && bad.problems.some(p => p.includes('effects')));
    assertEqual(bad.theme.effects.motion, 'none');
    const alphaColor = {...raw, schemes: {...raw.schemes, light: {...raw.schemes.light, bg: '#ffffffcc'}}};
    assertEqual(validateTheme(alphaColor).theme, null);
});

test('theme files: origin is loader-owned and a user override never gains builtin provenance', () => {
    const dir = sandbox();
    const userDirectory = tmpDir();
    const raw = JSON.parse(goodJson('mine'));
    raw.effects = {material: 'frosted-glass', motion: 'leaves'};
    raw.origin = 'builtin';
    writeTheme(dir, 'mine', JSON.stringify(raw));
    const options = {userDirectory};
    const trusted = loadThemeFile(dir, 'mine', options);
    assertEqual(trusted.theme.origin, 'builtin');
    GLib.mkdir_with_parents(`${userDirectory}/mine`, 0o700);
    GLib.file_set_contents(`${userDirectory}/mine/theme.json`, JSON.stringify(raw));
    const overridden = loadThemeFile(dir, 'mine', options);
    assertEqual(overridden.theme.origin, 'user');
    assertEqual(scanThemes(dir, options).themes.find(t => t.id === 'mine').builtin, false);
    assertEqual(scanThemes(dir, options).themes.find(t => t.id === 'mine').origin, 'user');
});


test('themes: renderer colors are resolved hex values detached from theme data', () => {
    const {theme} = loadTheme('sistema-gnome');
    const colors = resolvedColors(theme, 'light', 'teal');
    assertEqual(colors.accent, '#2190a4');
    assertTrue(Object.values(colors).every(c => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)));
    colors.bg = '#000';
    assertEqual(resolvedColors(theme, 'light', 'teal').bg, '#fafafa');
});

test('themes: keyboard focus has 3:1 contrast across all themes and every System accent', () => {
    const luminance = rgb => rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (first, second) => (Math.max(luminance(first), luminance(second)) + 0.05)
        / (Math.min(luminance(first), luminance(second)) + 0.05);
    let cases = 0;
    let accentCases = 0;
    let fallbackCases = 0;
    for (const id of builtinIds()) {
        const {theme} = loadTheme(id);
        const before = JSON.stringify(theme);
        for (const scheme of ['light', 'dark']) {
            for (const accentName of id === 'sistema-gnome' ? Object.keys(ACCENTS) : ['blue']) {
                const colors = resolvedColors(theme, scheme, accentName);
                const foreground = hexToRgb(colors.fg);
                const backgrounds = ['bg', 'surface'].flatMap(token => [0, 0.06, 0.08, 0.14, 0.2].map(alpha =>
                    hexToRgb(colors[token]).map((channel, index) => channel * (1 - alpha) + foreground[index] * alpha)));
                assertTrue(typeof colors.focus === 'string', `${id}/${scheme}/${accentName} is missing its derived focus color`);
                const ring = hexToRgb(colors.focus);
                for (const background of backgrounds)
                    assertTrue(contrast(ring, background) >= 3, `${id}/${scheme}/${accentName} focus contrast ${contrast(ring, background)}`);
                const accentIsSafe = backgrounds.every(background => contrast(hexToRgb(colors.accent), background) >= 3);
                assertEqual(colors.focus, accentIsSafe ? colors.accent : colors.fg, `${id}/${scheme}/${accentName} focus choice`);
                accentIsSafe ? accentCases++ : fallbackCases++;
                assertEqual(colors.accent, theme.schemes[scheme].accent === 'system-accent'
                    ? systemAccent(accentName, scheme === 'dark') : theme.schemes[scheme].accent, 'focus must preserve the theme accent');
                const css = compileTheme(TEMPLATE, theme, {scheme, accentName});
                for (const selector of ['gaq-card-toggle', 'gaq-window', 'gaq-button', 'gaq-untracked-toggle']) {
                    let border;
                    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                        if (rule[1].split(',').map(value => value.trim()).includes(`.${selector}:focus`))
                            border = rule[2].match(/border-color:\s*([^;]+);/)?.[1] ?? border;
                    }
                    assertEqual(border, colors.focus, `${selector} uses the resolved focus color`);
                }
                assertEqual(compileTheme('{{p:accent}}|{{p:fill}}|{{p:focus}}', theme, {scheme, accentName}),
                    `${colors.accent}|${colors.fill}|${colors.focus}`, 'focus must not replace accent or meter fill');
                cases++;
            }
        }
        assertEqual(JSON.stringify(theme), before, 'focus resolution must not mutate theme data');
    }
    assertEqual(cases, 60);
    assertTrue(accentCases > 0 && fallbackCases > 0, 'safe accents stay accented and unsafe accents use foreground');
});


const canonicalProfiles = () => {
    assertTrue(GLib.file_test(`${root}/tools/theme-effect-profiles.json`, GLib.FileTest.IS_REGULAR), 'canonical effect-profile source must exist');
    return JSON.parse(read('tools/theme-effect-profiles.json'));
};

test('themes: every reviewed source profile validates exactly and matches the shipped effect data', () => {
    const profiles = canonicalProfiles();
    assertEqual(Object.keys(profiles).sort(), EXPECTED_THEME_IDS);
    const catalog = builtinCatalog(text => text);
    assertEqual(Object.keys(catalog.byId).sort(), EXPECTED_THEME_IDS.filter(id => id !== 'sistema-gnome'));
    for (const id of EXPECTED_THEME_IDS) {
        const {profile, problems} = validateEffectProfile(profiles[id]);
        assertEqual([id, problems, profile], [id, [], profiles[id]]);
        assertEqual(JSON.parse(read(`themes/builtin/${id}/theme.json`)).effects, profile);
        const options = {origin: 'builtin', profile, mode: 'full', animationsEnabled: true, transparencyEnabled: true, popupOpen: true};
        for (const override of [{origin: 'user'}, {popupOpen: false}])
            assertEqual(effectPolicy({...options, ...override}), {motion: 'none', material: 'opaque', particleCount: 0});
        assertEqual(effectPolicy({...options, mode: 'off'}), {motion: 'none', material: profile.material, particleCount: 0});
        assertEqual(effectPolicy({...options, animationsEnabled: false}).motion, 'none');
        assertEqual(effectPolicy({...options, mode: 'subtle'}).particleCount, 0);
        assertEqual(effectPolicy({...options, transparencyEnabled: false}).material, 'opaque');
        for (const materialPreference of profile.compatibleMaterials)
            assertEqual(effectPolicy({...options, materialPreference}).material, materialPreference);
        if (profile.compatibleMaterials.every(material => material === 'opaque'))
            assertEqual(effectPolicy({...options, materialPreference: 'frosted-glass'}).material, 'opaque');
    }
    for (const id of EXPECTED_THEME_IDS)
        assertEqual(profiles[id].compatibleMaterials, ['opaque', 'translucent', 'decorative-glass', 'frosted-glass']);
    assertEqual(profiles['sistema-gnome'].particleCount, 0);
    assertEqual(profiles['sistema-gnome'].texture, 'none');
});

function runGenerator({fixture, output, profiles}) {
    const [, stdout, stderr, status] = GLib.spawn_sync(root, ['python3', '-I', 'tools/gen-themes.py',
        '--styles', fixture, '--out', output, '--only', `${fixture}/wanted.txt`, '--effect-profiles', profiles],
    null, GLib.SpawnFlags.SEARCH_PATH, null);
    return {stdout: new TextDecoder().decode(stdout), stderr: new TextDecoder().decode(stderr), status};
}

function galleryFixture() {
    const fixture = tmpDir();
    GLib.mkdir_with_parents(`${fixture}/styles`, 0o755);
    GLib.file_set_contents(`${fixture}/styles/linear-saas.css`, '#stage[data-style="linear-saas"] { --bg: #101018; --surface: #202028; --fg: #fafafa; --accent: #9090ff; }');
    GLib.file_set_contents(`${fixture}/styles/registry.js`, '');
    GLib.file_set_contents(`${fixture}/wanted.txt`, 'linear-saas');
    return fixture;
}

test('themes: generator applies the canonical valid profile deterministically', () => {
    const fixture = galleryFixture();
    const profiles = `${root}/tools/theme-effect-profiles.json`;
    const first = runGenerator({fixture, output: `${fixture}/first`, profiles});
    assertEqual(first.status, 0, first.stderr);
    const second = runGenerator({fixture, output: `${fixture}/second`, profiles});
    assertEqual(second.status, 0, second.stderr);
    const text = path => new TextDecoder().decode(GLib.file_get_contents(path)[1]);
    const firstText = text(`${fixture}/first/linear-saas/theme.json`);
    assertEqual(firstText, text(`${fixture}/second/linear-saas/theme.json`));
    assertEqual(JSON.parse(firstText).effects, canonicalProfiles()['linear-saas']);
});

test('themes: generator rejects unknown profile fields and presets before writing output', () => {
    const fixture = galleryFixture();
    const profile = canonicalProfiles()['linear-saas'];
    for (const [name, change, reason] of [
        ['preset', {motion: 'unknown'}, 'effects.motion'],
        ['field', {shader: 'not executable'}, 'unknown fields'],
        ['materials', {compatibleMaterials: ['opaque', 'unknown']}, 'compatibleMaterials'],
    ]) {
        const source = `${fixture}/${name}.json`;
        GLib.file_set_contents(source, JSON.stringify({'linear-saas': {...profile, ...change}}));
        const output = `${fixture}/${name}`;
        const result = runGenerator({fixture, output, profiles: source});
        assertTrue(result.status !== 0, `${name} must be rejected`);
        assertTrue(result.stderr.includes(reason), result.stderr);
        assertTrue(!GLib.file_test(output, GLib.FileTest.EXISTS), 'invalid profiles must not write output');
    }
});


test('themes: effect headings expose the material while reading cards and controls remain opaque', () => {
    const properties = (css, selector) => {
        const result = {};
        for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            if (!rule[1].split(',').map(value => value.trim()).includes(selector)) continue;
            for (const declaration of rule[2].split(';')) {
                const colon = declaration.indexOf(':');
                if (colon > 0) result[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
            }
        }
        return result;
    };
    for (const id of builtinIds()) {
        const {theme} = loadTheme(id);
        for (const scheme of ['light', 'dark']) {
            const css = compileTheme(TEMPLATE, theme, {scheme});
            const colors = resolvedColors(theme, scheme);
            for (const selector of ['.gaq-effects-active .gaq-summary', '.gaq-effects-active .gaq-section']) {
                const rule = properties(css, selector);
                assertEqual(rule['background-color'], 'transparent', `${id}/${scheme} ${selector} hides the material behind a solid strip`);
                assertEqual(rule.color, colors.fg, `${id}/${scheme} headings need readable primary text`);
                assertTrue(rule['text-shadow']?.includes(colors.bg), `${id}/${scheme} heading contrast must be local to the text`);
            }
            assertEqual(properties(css, '.gaq-card')['background-color'], colors.surface, `${id}/${scheme} quota reading surface lost opacity`);
            assertEqual(properties(css, '.gaq-effects-active .gaq-button')['background-color'], colors.surface, `${id}/${scheme} controls lost opacity`);
        }
    }
});


test('themes: card scroll gutters reserve the validated shadow footprint without changing its identity', () => {
    for (const id of builtinIds()) {
        const {theme} = loadTheme(id);
        for (const scheme of ['light', 'dark']) {
            const shadow = theme.schemes[scheme].shadow;
            const css = compileTheme(TEMPLATE, theme, {scheme});
            const padding = css.match(/\.gaq-cards\s*\{[^}]*padding:\s*([^;]+);/s)?.[1]?.trim();
            let expected = [0, 0, 0, 0];
            if (shadow !== 'none' && !shadow.startsWith('inset ')) {
                const values = shadow.match(/^((?:-?[\d.]+px|0)(?: (?:-?[\d.]+px|0)){1,3}) /)[1].split(' ').map(parseFloat);
                const [x, y, blur = 0, spread = 0] = values;
                const radius = Math.max(0, blur) + spread;
                expected = [radius - y, radius + x, radius + y, radius - x]
                    .map(value => Math.min(64, Math.max(0, Math.ceil(value))));
            }
            assertEqual(padding, expected.map(value => `${value}px`).join(' '), `${id}/${scheme} scroll clip must reserve its shadow footprint`);
            assertTrue(css.includes(`box-shadow: ${shadow};`), `${id}/${scheme} shadow identity changed`);
        }
    }
    const {theme} = loadTheme('glassmorphism');
    assertTrue(compileTheme(TEMPLATE, theme, {scheme: 'dark'}).includes('padding: 24px 32px 40px 32px;'), 'dark glass needs the full 32px lateral blur extent');
    for (const [shadow, padding] of [
        ['none', '0px 0px 0px 0px'],
        ['inset 0 0 999px #000', '0px 0px 0px 0px'],
        ['INSET 0 0 10PX #000', '0px 0px 0px 0px'],
        ['2PX -3PX 5PX 4PX #000', '12px 11px 6px 7px'],
        ['-3px 4px 0 #000', '0px 0px 4px 3px'],
        ['0 0 999px #000', '64px 64px 64px 64px'],
        ['0 0 12px -6px #000', '6px 6px 6px 6px'],
        ['2px -3px 5px 4px #000', '12px 11px 6px 7px'],
        ['0.5px 0 1.25px #000', '2px 2px 2px 1px'],
        ['0 0 12px #000; padding: 999px', '0px 0px 0px 0px'],
    ]) {
        const raw = JSON.parse(read('themes/builtin/glassmorphism/theme.json'));
        raw.schemes.dark.shadow = shadow;
        const {theme: custom} = validateTheme(raw);
        assertTrue(compileTheme(TEMPLATE, custom, {scheme: 'dark'}).includes(`padding: ${padding};`), `${shadow} must reserve bounded safe geometry`);
    }
    assertTrue(!TEMPLATE.includes('clip-to-allocation: false'), 'gutters must not disable popup clipping');
});


test('themes: explicit materials work in every theme independently of the motion mode', () => {
    let cases = 0;
    for (const id of builtinIds()) {
        const {theme, problems} = loadTheme(id);
        assertEqual(problems, []);
        for (const scheme of ['light', 'dark']) {
            assertTrue(theme.effects.opacity[scheme] >= 0.72 && theme.effects.opacity[scheme] <= 0.8,
                `${id}/${scheme} must transmit enough of the background for explicit translucent materials`);
            for (const mode of ['off', 'subtle', 'full']) {
                const options = {origin: 'builtin', profile: theme.effects, mode, popupOpen: true,
                    animationsEnabled: true, transparencyEnabled: true};
                assertEqual(effectPolicy({...options, materialPreference: 'theme'}).material, theme.effects.material, `${id} retains its default material`);
                for (const material of ['opaque', 'translucent', 'decorative-glass', 'frosted-glass']) {
                    const policy = effectPolicy({...options, materialPreference: material});
                    assertEqual(policy.material, material, `${id}/${scheme}/${mode}: the explicit material must apply`);
                    if (mode === 'off')
                        assertEqual([policy.motion, policy.particleCount], ['none', 0], `${id} off disables motion only`);
                    assertEqual(effectPolicy({...options, transparencyEnabled: false, materialPreference: material}).material,
                        'opaque', `${id} transparency off has priority`);
                    assertEqual(effectPolicy({...options, origin: 'user', materialPreference: material}),
                        {motion: 'none', material: 'opaque', particleCount: 0}, `${id} retains the builtin trust boundary`);
                    cases++;
                }
            }
        }
    }
    assertEqual(cases, 528);
});


test('themes: Cyberpunk light has visible structural framing on its reading surface', () => {
    const {theme} = loadTheme('cyberpunk');
    const colors = resolvedColors(theme, 'light');
    const luminance = color => hexToRgb(color).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const values = [luminance(colors.border), luminance(colors.surface)].sort((a, b) => b - a);
    assertTrue((values[0] + 0.05) / (values[1] + 0.05) >= 3, 'daylight HUD outlines must remain distinguishable');
});
