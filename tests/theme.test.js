import GLib from 'gi://GLib';

import {assertEqual, assertTrue, test} from './harness.js';
import {compileTheme, pickScheme, systemAccent, validateTheme} from '../lib/core/theme.js';

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
    assertEqual([theme.fonts.body, theme.fonts.display], [null, 'Space Grotesk']);
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
