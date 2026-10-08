import {assertEqual, assertTrue, test} from './harness.js';
import {effectPolicy, validateEffectProfile} from '../lib/core/themeEffects.js';
import {RESET_KEYS, KEPT_KEYS} from '../lib/core/defaults.js';

const input = {origin: 'builtin', profile: {material: 'frosted-glass', motion: 'leaves', particleCount: 8},
    mode: 'full', animationsEnabled: true, transparencyEnabled: true, popupOpen: true};
const none = {motion: 'none', material: 'opaque', particleCount: 0};

test('theme effects: a user override never acquires builtin effects', () => {
    assertEqual(effectPolicy({...input, origin: 'user', profile: {...input.profile, particleCount: 999}}), none);
    assertEqual(effectPolicy({...input, origin: 'builtin'}), {motion: 'ambient', material: 'frosted-glass', particleCount: 8});
    assertEqual(effectPolicy({...input, origin: 'unknown'}), none);
});

test('theme effects: off stops motion while the chosen material remains live', () => {
    assertEqual(effectPolicy({...input, mode: 'off'}), {motion: 'none', material: 'frosted-glass', particleCount: 0});
    assertEqual(effectPolicy({...input, mode: 'off', transparencyEnabled: false}), none);
    assertEqual(effectPolicy({...input, popupOpen: false}), none);
    assertEqual(effectPolicy({...input, mode: 'invalid'}), none);
});

test('theme effects: subtle allows interactions but never ambient particles', () => {
    assertEqual(effectPolicy({...input, mode: 'subtle'}), {motion: 'interaction', material: 'frosted-glass', particleCount: 0});
    assertEqual(effectPolicy({...input, profile: {...input.profile, motion: 'none'}}).motion, 'none');
});

test('theme effects: reduced motion wins live while transparency is independent', () => {
    assertEqual(effectPolicy({...input, animationsEnabled: false}), {motion: 'none', material: 'frosted-glass', particleCount: 0});
    assertEqual(effectPolicy({...input, transparencyEnabled: false}), {motion: 'ambient', material: 'opaque', particleCount: 8});
    assertEqual(effectPolicy({...input, mode: 'subtle', animationsEnabled: false}).motion, 'none');
});

test('theme effects: every allowlisted material and motion is a bounded preset', () => {
    for (const material of ['opaque', 'translucent', 'decorative-glass', 'frosted-glass'])
        assertEqual(effectPolicy({...input, profile: {...input.profile, material}}).material, material);
    for (const motion of ['leaves', 'gradient', 'motes', 'pulse']) {
        const result = effectPolicy({...input, profile: {...input.profile, motion, particleCount: 999}});
        assertEqual(result.motion, 'ambient');
        assertEqual(result.particleCount, ['leaves', 'motes'].includes(motion) ? 12 : 0);
    }
    assertEqual(effectPolicy({...input, profile: {...input.profile, motion: 'interaction'}}).motion, 'interaction');
});

test('theme effects: omitted profiles remain valid static data', () => {
    const result = validateEffectProfile(undefined);
    assertEqual(result.problems, []);
    assertEqual(result.profile, {material: 'opaque', motion: 'none', texture: 'none', particleCount: 0, opacity: {light: 1, dark: 1}, compatibleMaterials: ['opaque']});
    assertEqual(effectPolicy({...input, profile: undefined}), none);
});

test('theme effects: opacity and counts are finite bounded numbers, separate from hex colors', () => {
    const result = validateEffectProfile({material: 'translucent', motion: 'leaves', particleCount: 999,
        opacity: {light: 0.1, dark: 9}, texture: 'botanical'});
    assertEqual(result.problems, []);
    assertEqual([result.profile.particleCount, result.profile.opacity], [12, {light: 0.72, dark: 1}]);
    for (const value of [NaN, Infinity, -Infinity, '0.8']) {
        const bad = validateEffectProfile({opacity: {light: value}});
        assertTrue(bad.problems.length > 0);
        assertEqual(bad.profile.opacity, {light: 1, dark: 1});
    }
});

test('theme effects: executable fields, paths, URLs, unknown presets and arrays fall back safely', () => {
    for (const raw of [null, [], Array(1000).fill('leaves'), 'leaves', {shader: 'void main(){}'},
        {script: 'run()'}, {texture: '../leaves.png'}, {texture: 'https://invalid.example/leaves'},
        {motion: 'run()'}, {material: 'url(x)'}, {particleCount: NaN}, {particleCount: 2.5},
        {opacity: []}, {opacity: {light: 0.8, arbitrary: 1}}, {origin: 'builtin'}]) {
        const result = validateEffectProfile(raw);
        assertTrue(result.problems.length > 0, String(raw));
        assertEqual(effectPolicy({...input, profile: raw}), none);
    }
    for (const texture of ['none', 'paper', 'grain', 'scanlines', 'grid', 'botanical', 'strokes', 'chamfer'])
        assertEqual(validateEffectProfile({texture}).profile.texture, texture);
});

test('theme effects: preferences and first-use state reset while account terms stay kept', () => {
    assertTrue(RESET_KEYS.includes('effects-mode') && RESET_KEYS.includes('transparency-enabled'));
    assertTrue(RESET_KEYS.includes('first-use-done') && KEPT_KEYS.includes('terms-acknowledged'));
});

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
test('theme effects: stored controls have safe defaults and preserve accounts on restore', () => {
    const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
    const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, null, false);
    const schema = source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false);
    assertTrue(schema.has_key('effects-mode') && schema.has_key('transparency-enabled'));
    const settings = Gio.Settings.new_full(schema, Gio.memory_settings_backend_new(), null);
    assertEqual([settings.get_string('effects-mode'), settings.get_boolean('transparency-enabled')], ['subtle', true]);
    settings.set_boolean('first-use-done', true);
    settings.set_strv('terms-acknowledged', ['claude']);
    settings.set_string('effects-mode', 'full');
    settings.set_boolean('transparency-enabled', false);
    for (const key of RESET_KEYS)
        settings.reset(key);
    assertEqual([settings.get_string('effects-mode'), settings.get_boolean('transparency-enabled')], ['subtle', true]);
    assertEqual([settings.get_boolean('first-use-done'), settings.get_strv('terms-acknowledged')], [false, ['claude']]);
});


test('theme effects: compatible materials are a bounded unique allowlist', () => {
    const allowed = ['opaque', 'translucent', 'decorative-glass', 'frosted-glass'];
    const good = validateEffectProfile({material: 'translucent', compatibleMaterials: allowed});
    assertEqual(good.problems, []);
    assertEqual(good.profile.compatibleMaterials, allowed);
    assertEqual(validateEffectProfile({material: 'frosted-glass'}).profile.compatibleMaterials, ['frosted-glass']);
    assertEqual(effectPolicy({...input, profile: good.profile}).material, 'translucent');
    for (const list of [null, 'translucent', [], ['opaque', 'opaque'], ['shader'], [...allowed, 'opaque'], Array(1000).fill('opaque')]) {
        const bad = validateEffectProfile({material: 'frosted-glass', compatibleMaterials: list});
        assertTrue(bad.problems.length > 0);
        assertEqual(effectPolicy({...input, profile: {material: 'frosted-glass', compatibleMaterials: list}}), none);
    }
});

test('theme effects: material preference applies only to compatible trusted profiles', () => {
    const profile = {material: 'translucent', compatibleMaterials: ['translucent', 'decorative-glass', 'frosted-glass']};
    assertEqual(effectPolicy({...input, profile, materialPreference: 'frosted-glass'}).material, 'frosted-glass');
    assertEqual(effectPolicy({...input, profile, materialPreference: 'decorative-glass'}).material, 'decorative-glass');
    assertEqual(effectPolicy({...input, profile, materialPreference: 'theme'}).material, 'translucent');
    assertEqual(effectPolicy({...input, profile: {material: 'opaque'}, materialPreference: 'frosted-glass'}).material, 'opaque');
    assertEqual(effectPolicy({...input, profile, origin: 'user', materialPreference: 'frosted-glass'}).material, 'opaque');
    assertEqual(effectPolicy({...input, profile, transparencyEnabled: false, materialPreference: 'frosted-glass'}).material, 'opaque');
});
