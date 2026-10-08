import Gio from 'gi://Gio';
import {assertEqual, assertTrue, test} from './harness.js';
import {cardView} from '../lib/core/viewmodel.js';
import {selectForBar} from '../lib/core/selection.js';
import {popupKeys, popupPresentation} from '../lib/core/popup.js';
import {safeText} from '../lib/core/text.js';
import {demoSnapshots} from '../lib/core/fixtures.js';

const file = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('lib/ui/indicator.js');
const [, bytes] = file.load_contents(null);
const source = new TextDecoder().decode(bytes);
function actualMethod(name, args, globals = {}) {
    const start = source.indexOf(`    ${name}(${args}) {`);
    assertTrue(start >= 0, 'Production method exists');
    const bodyStart = source.indexOf('{', start) + 1;
    const body = source.slice(bodyStart, source.indexOf('\n    }', bodyStart));
    return new Function(...Object.keys(globals), `return function(${args}) {${body}}`)(...Object.values(globals));
}

test('indicator connectors: Add connector opens Accounts even with a disconnected legacy target', () => {
    const body = source.match(/this\._addAccount = this\._button\([\s\S]*?, \(\) => \{([\s\S]*?)\n {8}\}\);/)[1];
    const action = new Function(`return function() {${body}}`)();
    const calls = [];
    action.call({_accountTarget: 'command-code', menu: {close: () => calls.push('close')},
        _settings: {set_string: (key, value) => calls.push([key, value])},
        _extension: {openPreferences: () => calls.push('open')}});
    assertEqual(calls, ['close', ['prefs-target', 'accounts'], 'open']);
});

test('indicator connectors: local labels stay out of snapshots used by panel tooltips', () => {
    const snapshot = demoSnapshots(Date.now())[0];
    const indicator = {_cleaned: false, _renderSource: 0,
        _connectorEntries: () => [{id: snapshot.id, label: 'Private workspace'}],
        _controller: {snapshots: () => [snapshot]}};
    actualMethod('_onSnapshots', '', {safeText, GLib: {PRIORITY_DEFAULT_IDLE: 0, idle_add: () => 1}}).call(indicator);
    assertEqual(indicator._snapshots[0].name, snapshot.name);
    assertEqual(indicator._snapshots[0].connectorLabel, 'Private workspace');
    assertTrue(!Object.hasOwn(snapshot, 'connectorLabel'), 'Controller snapshot is not modified');
    let drawn;
    const card = {update: view => { drawn = view; }};
    actualMethod('_syncCard', 'snapshot', {cardView, safeText}).call({
        _cards: new Map([[snapshot.id, card]]), _context: () => ({}), _isOpen: () => false,
    }, indicator._snapshots[0]);
    assertEqual(drawn.name, `${snapshot.name} · Private workspace`);
    assertEqual(snapshot.name, indicator._snapshots[0].name);
});

test('indicator connectors: popup order follows registry presentation without changing panel snapshots', () => {
    const snapshots = [{id: 'codex'}, {id: 'claude'}];
    let groups;
    const view = {_snapshots: snapshots, _connectorEntries: () => snapshots,
        _settings: {get_string: () => 'live', get_strv: key => key.includes('order') ? ['claude'] : []},
        _onBarBox: {}, _hiddenBox: {}, _onBarTitle: {}, _hiddenTitle: {}, _emptyBox: {}, _emptyTitle: {}, _emptyHint: {}, _chooseVisible: {},
        _t: {gettext: s => s, ngettext: s => s}, _isEmpty: () => false, _syncCards: value => { groups = value; }};
    actualMethod('_syncPopup', 'layout', {popupKeys, popupPresentation, selectForBar, fmt: s => s}).call(view, {count: 1});
    assertEqual(groups[0][1].map(s => s.id), ['claude', 'codex']);
    assertEqual(snapshots.map(s => s.id), ['codex', 'claude']);
    assertEqual([view._onBarTitle.visible, view._hiddenTitle.visible], [false, false]);
});
test('indicator connectors: all hidden is a presentation state with a recovery action', () => {
    const snapshots = [{id: 'codex'}];
    const view = {_snapshots: snapshots, _connectorEntries: () => snapshots,
        _settings: {get_string: () => 'live', get_strv: key => key.includes('hidden') ? ['codex'] : []},
        _onBarBox: {}, _hiddenBox: {}, _onBarTitle: {}, _hiddenTitle: {}, _emptyBox: {}, _emptyTitle: {}, _emptyHint: {}, _chooseVisible: {},
        _t: {gettext: s => s, ngettext: s => s}, _isEmpty: () => false, _syncCards: () => {}};
    actualMethod('_syncPopup', 'layout', {popupKeys, popupPresentation, selectForBar, fmt: s => s}).call(view, {count: 1});
    assertEqual([view._emptyBox.visible, view._emptyTitle.text, view._chooseVisible.visible], [true, 'No connectors shown', true]);
});

test('indicator connectors: cleanup releases detached hidden actors without touching disposed attached actors', () => {
    let destroyed = 0;
    const detached = {destroy: () => destroyed++};
    const attached = {get_parent: () => { throw new Error('C disposed actor'); }};
    const indicator = {_cleaned: false, _stopOpenTick() {}, _releaseAnchor() {},
        _renderSource: 0, _fitSource: 0, _busySource: 0, _legendSource: 0, _popupLayoutSource: 0,
        _barItems: new Map(), _cards: new Map([['codex', detached], ['claude', attached]]),
        _detachedCards: new Set([detached]), _userOpen: new Map()};
    const cleanup = actualMethod('_cleanup', '', {destroyTooltip: () => {}, GLib: {source_remove() {}}});
    cleanup.call(indicator);
    cleanup.call(indicator);
    assertEqual(destroyed, 1);
    assertEqual([indicator._cards.size, indicator._detachedCards.size], [0, 0]);
});
