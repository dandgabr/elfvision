import GLib from 'gi://GLib';

import {assertEqual, assertTrue, test} from './harness.js';
import {compileTheme, pickScheme, swatches, systemAccent, validateTheme} from '../lib/core/theme.js';

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

test('themes: the v1 set ships twenty themes and each one validates', () => {
    const ids = builtinIds();
    assertEqual(ids.length, 20);
    assertTrue(ids.includes('sistema-gnome'));
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
    const path = GLib.Dir.make_tmp('gaq-theme-test-XXXXXX');
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
