import {assertEqual, assertTrue, test} from './harness.js';
import {meterGeometry} from '../lib/core/layout.js';
import {expandText, pseudoTranslations} from '../lib/core/pseudoLocale.js';

test('layout: meter fill and tick mirror as rectangles, including narrow and empty tracks', () => {
    assertEqual(meterGeometry(100, 25, 60, 2, false), {fillWidth: 25, fillX: 0, tickX: 59});
    assertEqual(meterGeometry(100, 25, 60, 2, true), {fillWidth: 25, fillX: 75, tickX: 39});
    assertEqual(meterGeometry(1, 1, null, 2, true), {fillWidth: 1, fillX: 0, tickX: null});
    assertEqual(meterGeometry(100, 0, null, 2, true), {fillWidth: 0, fillX: 100, tickX: null});
});

test('pseudo locale: expands literal text and preserves substitutions, percent escapes and context', () => {
    const source = 'Setup · %d of %d: %s, %02d%%';
    const expanded = expandText(source);
    assertTrue(expanded.length >= source.length * 1.3, 'longer text');
    assertEqual(expanded.match(/%02d|%d|%s|%%/g), ['%d', '%d', '%s', '%02d', '%%']);
    const t = pseudoTranslations({gettext: s => s, ngettext: (a, b, n) => n === 1 ? a : b, pgettext: (c, s) => `${c}: ${s}`});
    assertTrue(t.ngettext('one', 'many', 2).includes('many'));
    assertTrue(t.pgettext('context', 'name').includes('context'));
});
