import {assertEqual, assertTrue, test} from './harness.js';
import {popupDimensions, popupPresentation, popupKeys, moveConnector, setPopupVisibility} from '../lib/core/popup.js';
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

const connectors = [{id: 'codex'}, {id: 'claude'}, {id: 'antigravity'}];
test('popup presentation: user order ignores stale and duplicate IDs and appends new connectors', () => {
    assertEqual(popupPresentation(connectors, ['claude', 'missing', 'claude'], []).map(c => c.id), ['claude', 'codex', 'antigravity']);
});
test('popup presentation: hiding affects presentation only, and bounds untrusted metadata', () => {
    assertEqual(popupPresentation(connectors, [], ['codex', 'missing']).map(c => c.id), ['claude', 'antigravity']);
    assertEqual(connectors.map(c => c.id), ['codex', 'claude', 'antigravity']);
    assertEqual(popupPresentation(connectors, null, null).map(c => c.id), ['codex', 'claude', 'antigravity']);
    assertEqual(popupPresentation(connectors, Array(33).fill('claude'), []).map(c => c.id), ['codex', 'claude', 'antigravity']);
    assertEqual(popupKeys(true), {order: 'demo-popup-connector-order', hidden: 'demo-popup-hidden-connectors'});
    assertEqual(popupKeys(false), {order: 'popup-connector-order', hidden: 'popup-hidden-connectors'});
});
test('popup presentation: accessible movement preserves hidden entries and registry identity', () => {
    assertEqual(moveConnector(connectors, [], 'claude', -1), ['claude', 'codex', 'antigravity']);
    assertEqual(moveConnector(connectors, ['claude'], 'claude', 1), ['codex', 'claude', 'antigravity']);
    assertEqual(moveConnector(connectors, [], 'codex', -1), ['codex', 'claude', 'antigravity']);
});
test('popup dimensions: automatic uses work area and chrome, with screen-edge clearance', () => {
    assertEqual(popupDimensions({width: 1920, height: 1000}, 0, 0, {horizontal: 24, vertical: 100}),
        {width: 420, height: 700, contentWidth: 396, scrollHeight: 600});
});
test('popup dimensions: clamps effective dimensions without mutating preferences or losing chrome', () => {
    const preferences = {width: 1600, height: 1100};
    assertEqual(popupDimensions({width: 500, height: 400}, preferences.width, preferences.height, {horizontal: 24, vertical: 100}),
        {width: 476, height: 376, contentWidth: 452, scrollHeight: 276});
    assertEqual(preferences, {width: 1600, height: 1100});
    assertEqual(popupDimensions({width: 500, height: 400}, NaN, -1, {horizontal: 24, vertical: 100}),
        {width: 420, height: 280, contentWidth: 396, scrollHeight: 180});
});

test('popup presentation: visibility writes retain a newly added hidden sibling', () => {
    assertEqual(setPopupVisibility([{id: 'codex'}, {id: 'claude'}], ['claude'], 'codex', false), ['claude', 'codex']);
    assertEqual(setPopupVisibility([{id: 'codex'}, {id: 'claude'}], ['claude', 'codex'], 'codex', true), ['claude']);
    assertEqual(setPopupVisibility([{id: 'claude'}], ['claude', 'deleted'], 'deleted', false), ['claude']);
});

test('popup presentation: hostile IDs and oversized registry are bounded independently', () => {
    const oversizedId = 'x'.repeat(101);
    assertEqual(popupPresentation(connectors, ['claude', oversizedId]).map(c => c.id), ['codex', 'claude', 'antigravity']);
    const entries = Array.from({length: 33}, (_, index) => ({id: `connector-${index}`}));
    assertEqual(popupPresentation(entries, ['connector-32']).length, 32);
    assertEqual(popupPresentation(entries, ['connector-32'])[0].id, 'connector-0');
});
test('popup dimensions: supports the maximum integer and rejects overflow and fractional requests', () => {
    const area = {width: 10000, height: 10000};
    assertEqual(popupDimensions(area, 8192, 8192).width, 8192);
    assertEqual(popupDimensions(area, 8193, 8193).width, 420);
    assertEqual(popupDimensions(area, 8193, 8193).height, 7000);
    assertEqual(popupDimensions(area, 500.5, 600.5).width, 420);
    assertEqual(popupDimensions(area, 500.5, 600.5).height, 7000);
});

test('popup dimensions: tiny preferences retain a usable content area while respecting a smaller screen', () => {
    assertEqual(popupDimensions({width: 1920, height: 1000}, 1, 1, {horizontal: 24, vertical: 220}),
        {width: 320, height: 260, contentWidth: 296, scrollHeight: 40});
    assertEqual(popupDimensions({width: 300, height: 200}, 1, 1, {horizontal: 24, vertical: 100}),
        {width: 276, height: 176, contentWidth: 252, scrollHeight: 76});
});
