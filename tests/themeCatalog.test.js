import GLib from 'gi://GLib';
import {assertEqual, test, tmpDir} from './harness.js';
import * as catalog from '../lib/prefs/themeCatalog.js';
import {scanThemes} from '../lib/services/themeFiles.js';

const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const _ = text => text;

test('theme catalog: on-disk System override is presented as a user theme in both views', () => {
    const userDirectory = tmpDir();
    const raw = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${root}/themes/builtin/sistema-gnome/theme.json`)[1]));
    raw.name = 'My private paper'; raw.description = 'Custom paper colors';
    GLib.mkdir_with_parents(`${userDirectory}/sistema-gnome`, 0o700);
    GLib.file_set_contents(`${userDirectory}/sistema-gnome/theme.json`, JSON.stringify(raw));
    const themes = scanThemes(root, {userDirectory}).themes;
    const override = themes.find(theme => theme.id === 'sistema-gnome');
    assertEqual([override.origin, override.builtin], ['user', false]);
    assertEqual(catalog.themePresentation(override, _), {
        group: 'Your themes', name: 'My private paper', description: 'Custom paper colors',
    });
    assertEqual(catalog.selectedThemeName(themes, 'sistema-gnome', _), 'My private paper');
});

test('theme catalog: genuine System, other built-ins and unavailable selections remain distinct', () => {
    const themes = scanThemes(root, {userDirectory: tmpDir()}).themes;
    const system = themes.find(theme => theme.id === 'sistema-gnome');
    assertEqual(catalog.themePresentation(system, _), {
        group: 'System', name: 'System (GNOME)', description: 'Follows the GNOME accent color and the light or dark setting.',
    });
    assertEqual(catalog.selectedThemeName(themes, system.id, _), 'System (GNOME)');
    assertEqual(catalog.themePresentation(themes.find(theme => theme.id === 'glassmorphism'), _).group, 'Surface and materials');
    assertEqual(catalog.selectedThemeName(themes, 'missing', _), 'missing (unavailable)');
});
