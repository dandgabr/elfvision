// Stateful GTK regressions. Run only in tools/prefs-smoke.sh's private display and memory settings.
import {buildDisconnectGroup} from '../lib/prefs/disconnectDialog.js';
import {createSuggestedFontsGroup} from '../lib/prefs/suggestedFonts.js';
import {buildNotificationsPage} from '../lib/prefs/notifications.js';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import System from 'system';
import {expandText} from '../lib/core/pseudoLocale.js';
import {availableProviders, providerMeta} from '../lib/providers/registry.js';
import {apiKeyGroup} from '../lib/prefs/accounts.js';
import {openFirstUse} from '../lib/prefs/firstUse.js';
import {oauthGroup} from '../lib/prefs/oauthGroup.js';
import {termsConfirmer} from '../lib/prefs/termsDialog.js';

const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, null, false);
const rtl = ARGV.includes('rtl');
const _ = ARGV.includes('expanded') ? expandText : s => s;
Gtk.Widget.set_default_direction(rtl ? Gtk.TextDirection.RTL : Gtk.TextDirection.LTR);
const wait = () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => { resolve(); return GLib.SOURCE_REMOVE; }));
function check(value, message) { if (!value) throw new Error(message); }
function walk(widget) {
    const result = [widget];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) result.push(...walk(child));
    return result;
}
function settings() { return Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null); }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; }
function fakeController(s, id, initial = {}) {
    const state = {connected: false, hasKey: false, hasConfig: true, busy: false, keyringDown: false, removing: false, saving: false, pasteVisible: false, secondsLeft: 299, ...initial};
    const listeners = new Set();
    return {
        state, listeners,
        snapshot: () => ({...state, result: s.get_value('account-status').deepUnpack()[id]}),
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        update(patch) { Object.assign(state, patch); [...listeners].forEach(fn => fn()); },
        refresh: async () => {}, recheck: async () => {}, save: async () => 'saved',
        connect() { throw new Error('Unexpected sign-in'); }, cancel() {}, dispose() {},
        submit: () => false, remove() { throw new Error('Unexpected removal'); }, disconnect() { throw new Error('Unexpected disconnect'); },
    };
}
function button(rootWidget, label) { return walk(rootWidget).find(w => w instanceof Gtk.Button && w.label === _(label)); }
function containment(window, widget, name) {
    const [ok, bounds] = widget.compute_bounds(window);
    check(ok && widget.get_width() > 0, `${name}: allocated`);
    check(bounds.get_x() >= -1 && bounds.get_x() + bounds.get_width() <= window.get_width() + 1,
        `${name}: viewport containment x=${bounds.get_x()} width=${bounds.get_width()} viewport=${window.get_width()}`);
    const parent = widget.get_parent();
    const [inParent, local] = widget.compute_bounds(parent);
    check(inParent && local.get_x() >= -1 && local.get_x() + local.get_width() <= parent.get_width() + 1, `${name}: parent containment`);
}
const app = new Adw.Application({application_id: 'io.github.dandgabr.QuotaStates', flags: Gio.ApplicationFlags.NON_UNIQUE});
let failed = 0;
app.connect('activate', () => {
    app.hold();
    if (ARGV.includes('large-font')) Gtk.Settings.get_default().gtk_font_name = 'Sans 22';
    const newWindow = () => new Adw.PreferencesWindow({application: app, default_width: 360, default_height: 600});
    const run = async (name, fn) => {
        try { await fn(); print(`ok    preferences states: ${name}`); }
        catch (error) { failed++; printerr(`FAIL  preferences states: ${name}: ${error.message}\n${error.stack}`); }
    };
    (async () => {
        await run('empty selection does not claim accounts connected', async () => {
            const window = newWindow(); window.add(new Adw.PreferencesPage({title: 'General'}));
            const s = settings();
            const accounts = {cancel() {}, show() {}, controllers: new Map(availableProviders().map(m => [m.id, fakeController(s, m.id)]))};
            const setup = openFirstUse({window, settings: s, gettext: _, accounts, extensionPath: root});
            try {
                window.present(); await wait();
                button(setup.page, 'Continue').emit('clicked'); button(setup.page, 'Continue').emit('clicked'); await wait();
                check(walk(setup.page).some(w => w instanceof Adw.PreferencesGroup && w.title === _('No providers selected')), 'empty-state guidance');
                check(!walk(setup.page).some(w => w instanceof Adw.PreferencesGroup && w.title === _('Connect your accounts')), 'empty selection must omit connection progress');
            } finally { setup.close(); window.close(); }
        });
        await run('Done follows late save and server rejection without replacing focused row', async () => {
            const window = newWindow(); window.add(new Adw.PreferencesPage({title: 'General'}));
            const s = settings();
            const controllers = new Map(availableProviders().map(m => [m.id, fakeController(s, m.id)]));
            const setup = openFirstUse({window, settings: s, gettext: _, accounts: {controllers, cancel() {}, show() {}}, extensionPath: root});
            try {
                window.present(); await wait();
                button(setup.page, 'Continue').emit('clicked');
                walk(setup.page).find(w => w instanceof Adw.SwitchRow && w.title === 'Command Code').active = true;
                for (let i = 0; i < 4; i++) button(setup.page, 'Continue').emit('clicked');
                await wait();
                const row = walk(setup.page).find(w => w instanceof Adw.ActionRow && w.title.startsWith('Command Code'));
                row.grab_focus();
                const focus = window.get_focus();
                controllers.get('command-code').update({lastFailure: 'The keyring did not accept the key.'});
                check(row.title.includes(_('Needs attention')), 'late failed key save updates Done');
                controllers.get('command-code').update({hasKey: true, lastFailure: ''});
                check(row.title.includes(_('Connected')), 'late completed key save updates Done');
                check(window.get_focus() === focus, 'state update preserves keyboard focus');
                s.set_value('account-status', new GLib.Variant('a{ss}', {'command-code': 'rejected'}));
                check(row.title.includes(_('Needs attention')), 'server rejection updates Done');
                controllers.get('claude').update({keyringDown: true});
                check(walk(setup.page).find(w => w instanceof Adw.ActionRow && w.title.startsWith('Claude')).title.includes(_('Needs attention')), 'keyring recovery/failure updates all summary rows');
                setup.close();
                check([...controllers.values()].every(c => c.listeners.size === 0), 'Done releases all subscriptions');
            } finally { window.close(); }
        });
        await run('disposed key view ignores initial refresh and queued save UI callbacks', async () => {
            const window = newWindow(); const s = settings(); const ids = [];
            const controller = fakeController(s, 'command-code');
            const lookup = deferred(); const save = deferred(); controller.refresh = () => lookup.promise; controller.save = () => save.promise;
            const view = apiKeyGroup({meta: {...providerMeta('command-code'), keyLink: null}, window, settings: s, gettext: _, handlerIds: ids, controller});
            const page = new Adw.PreferencesPage(); page.add(view.group); window.add(page); window.present(); await wait();
            try {
                const entry = walk(view.group).find(w => w instanceof Adw.PasswordEntryRow);
                let focusCalls = 0; const grabFocus = entry.grab_focus.bind(entry); entry.grab_focus = () => { focusCalls++; return grabFocus(); };
                entry.text = 'pending'; entry.emit('apply'); view.dispose();
                lookup.resolve(); save.resolve('invalid'); await wait();
                check(focusCalls === 0, 'disposed view must not regain focus after lookup');
                check(!entry.has_css_class('error'), 'disposed view must not apply a late save error');
                check(entry.text === '' && ids.length === 0 && controller.listeners.size === 0, 'disposal clears entry and handlers');
            } finally { window.close(); }
        });
        await run('keyring recovery on window activation enables API entry', async () => {
            const window = newWindow(); const s = settings(); const ids = [];
            const controller = fakeController(s, 'command-code', {keyringDown: true});
            const view = apiKeyGroup({meta: {...providerMeta('command-code'), keyLink: null}, window, settings: s, gettext: _, handlerIds: ids, controller});
            const page = new Adw.PreferencesPage(); page.add(view.group); window.add(page); window.present(); await wait();
            try {
                const entry = walk(view.group).find(w => w instanceof Adw.PasswordEntryRow);
                check(!entry.sensitive, 'entry disabled while keyring unavailable');
                controller.refresh = async () => controller.update({keyringDown: false});
                // Headless compositor focus is not deterministic; drive the real activation handler.
                Object.defineProperty(window, 'is_active', {value: true});
                window.notify('is-active'); await wait();
                check(entry.sensitive, 'activation refresh enables entry after keyring unlock');
            } finally { view.dispose(); window.close(); }
        });
        await run('live key view reports invalid save and clears successful retry', async () => {
            const window = newWindow(); const s = settings(); const ids = [];
            const controller = fakeController(s, 'command-code');
            controller.save = async () => 'invalid';
            const view = apiKeyGroup({meta: {...providerMeta('command-code'), keyLink: null}, window, settings: s, gettext: _, handlerIds: ids, controller});
            const page = new Adw.PreferencesPage(); page.add(view.group); window.add(page); window.present(); await wait();
            try {
                const entry = walk(view.group).find(w => w instanceof Adw.PasswordEntryRow);
                entry.text = 'invalid'; entry.emit('apply'); await wait();
                check(entry.has_css_class('error'), 'live failed validation is displayed');
                controller.save = async () => 'saved'; entry.text = 'retry'; entry.emit('apply'); await wait();
                check(!entry.has_css_class('error') && entry.text === '', 'live successful retry clears entry/error');
            } finally { view.dispose(); window.close(); }
        });
        await run('initial lookup focuses only absent keys', async () => {
            for (const hasKey of [false, true]) {
                const window = newWindow(); const s = settings(); const ids = [];
                const controller = fakeController(s, 'command-code', {hasKey});
                const lookup = deferred(); controller.refresh = () => lookup.promise;
                const view = apiKeyGroup({meta: {...providerMeta('command-code'), keyLink: null}, window, settings: s, gettext: _, handlerIds: ids, controller});
                const page = new Adw.PreferencesPage(); page.add(view.group); window.add(page); window.present(); await wait();
                try {
                    const entry = walk(view.group).find(w => w instanceof Adw.PasswordEntryRow);
                    let focusCalls = 0; const grabFocus = entry.grab_focus.bind(entry); entry.grab_focus = () => { focusCalls++; return grabFocus(); };
                    lookup.resolve(); await wait();
                    check(focusCalls === (hasKey ? 0 : 1), `hasKey=${hasKey}: lookup only focuses a missing key entry`);
                } finally { view.dispose(); window.close(); }
            }
        });
        await run('OAuth account states fit viewport and move focus to available actions', async () => {
            const window = newWindow(); const s = settings(); const ids = [];
            const controller = fakeController(s, 'claude');
            const view = oauthGroup({meta: providerMeta('claude'), window, settings: s, gettext: _, handlerIds: ids, extensionPath: root, controller});
            const page = new Adw.PreferencesPage(); page.add(view.group); window.add(page); window.present(); await wait();
            try {
                const cases = [
                    ['ready', {connected: false, busy: false, hasConfig: true}, 'Connect'],
                    ['busy', {busy: true, pasteVisible: false}, 'Cancel'],
                    ['paste', {busy: true, pasteVisible: true}, null],
                    ['connected', {busy: false, connected: true, hasConfig: true}, 'Disconnect'],
                    ['expired', {connected: true}, 'Reconnect'],
                    ['refused', {connected: true}, 'Disconnect'],
                    ['keyring', {connected: false, keyringDown: true}, null],
                    ['missing-client', {keyringDown: false, hasConfig: false}, 'Copy command'],
                ];
                for (const [name, state, focusLabel] of cases) {
                    s.set_value('account-status', new GLib.Variant('a{ss}', name === 'expired' || name === 'refused' ? {claude: name} : {}));
                    controller.update(state); await wait();
                    check(window.get_width() <= 360, `${name}: actual window fits 360px`);
                    for (const action of walk(view.group).filter(w => w instanceof Gtk.Button && w.get_mapped() && w.label))
                        containment(window, action, `${name}/${action.label}`);
                    if (name === 'paste') {
                        const paste = walk(view.group).find(w => w instanceof Adw.EntryRow);
                        check(paste.visible, 'paste fallback shown'); containment(window, paste, 'paste fallback');
                        paste.text = 'bad'; paste.emit('apply'); check(paste.has_css_class('error'), 'paste refusal visible');
                        check(paste.child_focus(Gtk.DirectionType.TAB_FORWARD), 'native focus navigation enters paste editor');
                        check(window.get_focus()?.is_ancestor(paste), 'paste editor receives GTK keyboard focus');
                    }
                    if (focusLabel) {
                        if (name !== 'busy' && name !== 'paste') view.focus();
                        const target = button(view.group, focusLabel);
                        check(target.visible && target.sensitive, `${name}: available action`);
                        check(window.get_focus() === target || window.get_focus()?.is_ancestor(target), `${name}: keyboard focus reaches ${focusLabel}`);
                    }
                }
                let rechecks = 0;
                controller.recheck = async () => { rechecks++; controller.update({hasConfig: true, keyringDown: false}); };
                const recheck = button(view.group, 'Check configuration again');
                check(recheck.visible && recheck.sensitive, 'missing-client configuration has an available recheck action');
                containment(window, recheck, 'translated configuration recheck');
                recheck.emit('clicked'); await wait();
                check(rechecks === 1 && button(view.group, 'Connect').sensitive && !recheck.visible,
                    'explicit recheck recovers configuration and enables Connect');
                controller.update({hasConfig: false, keyringDown: true});
                Object.defineProperty(window, 'is_active', {value: true}); window.notify('is-active'); await wait();
                check(button(view.group, 'Connect').sensitive, 'OAuth activation recovers configuration and keyring');
                controller.update({connected: true}); await wait();
                button(view.group, 'Disconnect').emit('clicked'); await wait();
                const dialog = window.get_visible_dialog();
                check(dialog instanceof Adw.AlertDialog && dialog.default_response === 'cancel' && dialog.close_response === 'cancel', 'disconnect dialog defaults to Cancel');
                containment(window, dialog, 'disconnect dialog'); dialog.close(); await wait();
            } finally { view.dispose(); window.close(); }
        });
        await run('API states and removal dialog fit viewport with safe default', async () => {
            const window = newWindow(); const s = settings(); const ids = [];
            const controller = fakeController(s, 'command-code');
            const view = apiKeyGroup({meta: {...providerMeta('command-code'), keyLink: null}, window, settings: s, gettext: _, handlerIds: ids, controller});
            const page = new Adw.PreferencesPage(); page.add(view.group); window.add(page); window.present(); await wait();
            try {
                for (const [name, state, result] of [
                    ['absent', {hasKey: false}, ''], ['saving', {saving: true}, ''],
                    ['connected', {saving: false, hasKey: true}, 'ok'], ['rejected', {hasKey: true}, 'rejected'],
                    ['keyring', {keyringDown: true}, ''], ['recovered', {keyringDown: false}, 'ok'],
                ]) {
                    s.set_value('account-status', new GLib.Variant('a{ss}', result ? {'command-code': result} : {}));
                    controller.update(state); await wait();
                    check(window.get_width() <= 360, `${name}: actual window fits 360px`);
                    for (const action of walk(view.group).filter(w => w instanceof Gtk.Button && w.get_mapped() && w.label))
                        containment(window, action, `API ${name}/${action.label}`);
                }
                button(view.group, 'Remove key').emit('clicked'); await wait();
                const dialog = window.get_visible_dialog();
                check(dialog instanceof Adw.AlertDialog && dialog.default_response === 'cancel' && dialog.close_response === 'cancel', 'remove dialog defaults to Cancel');
                containment(window, dialog, 'remove dialog'); dialog.close(); await wait();
            } finally { view.dispose(); window.close(); }
        });
        await run('terms dialogs fit viewport and closing never accepts consent', async () => {
            const window = newWindow(); window.add(new Adw.PreferencesPage({title: 'General'})); window.present(); await wait();
            try {
                const confirm = termsConfirmer({window, gettext: _});
                for (const id of ['claude', 'antigravity']) {
                    const answer = confirm(providerMeta(id)); await wait();
                    const dialog = window.get_visible_dialog();
                    check(dialog instanceof Adw.AlertDialog && dialog.default_response === 'cancel' && dialog.close_response === 'cancel', `${id}: consent defaults to Cancel`);
                    containment(window, dialog, `${id} terms dialog`);
                    for (const action of walk(dialog).filter(w => w instanceof Gtk.Button && w.get_mapped() && w.label))
                        containment(window, action, `${id} terms/${action.label}`);
                    dialog.close(); check(await answer === false, `${id}: close refuses consent`); await wait();
                }
            } finally { window.close(); }
        });
        await run('destructive confirmations cannot act through disposed account views', async () => {
            for (const kind of ['api', 'oauth']) {
                for (const disposeBeforeResponse of [false, true]) {
                    const window = newWindow(); const s = settings(); const ids = [];
                    const id = kind === 'api' ? 'command-code' : 'claude';
                    const controller = fakeController(s, id, {hasKey: true, connected: true});
                    let removed = 0; controller.remove = controller.disconnect = () => { removed++; };
                    const context = {meta: {...providerMeta(id), keyLink: null}, window, settings: s, gettext: _, handlerIds: ids, controller, extensionPath: root};
                    const view = kind === 'api' ? apiKeyGroup(context) : oauthGroup(context);
                    const page = new Adw.PreferencesPage(); page.add(view.group); window.add(page); window.present(); await wait();
                    try {
                        button(view.group, kind === 'api' ? 'Remove key' : 'Disconnect').emit('clicked'); await wait();
                        const dialog = window.get_visible_dialog();
                        if (disposeBeforeResponse) view.dispose();
                        dialog.emit('response', kind === 'api' ? 'remove' : 'disconnect');
                        check(removed === (disposeBeforeResponse ? 0 : 1), `${kind}: only a live view can accept destructive confirmation`);
                        dialog.close(); await wait();
                    } finally { view.dispose(); window.close(); }
                }
            }
        });
        await run('disconnect-all confirmation is inert until explicit confirmation and defaults to Cancel', async () => {
            for (const action of ['cancel', 'dispose', 'confirm']) {
                const window = newWindow(); const s = settings(); let calls = 0;
                let transaction = null, failNext = false; const listeners = new Set();
                const gate = {snapshot: () => ({ready: true, blocked: false, transaction}),
                    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }};
                const view = buildDisconnectGroup({window, settings: s, gettext: _, gate, run: async () => {
                    calls++; if (failNext) throw Object.assign(new Error('synthetic restart guard'), {code: 'restart-computer-required'});
                    transaction = {phase: 'complete'}; for (const fn of [...listeners]) fn(); return transaction;
                }});
                const page = new Adw.PreferencesPage(); page.add(view.group); window.add(page); window.present(); await wait();
                try {
                    view.button.emit('clicked'); await wait(); const dialog = window.get_visible_dialog();
                    check(calls === 0, 'opening disconnect confirmation performs no deletion');
                    check(dialog.default_response === 'cancel' && dialog.close_response === 'cancel', 'disconnect defaults and closes to Cancel');
                    containment(window, dialog, 'disconnect-all dialog');
                    if (action === 'dispose') view.dispose();
                    dialog.emit('response', action === 'cancel' ? 'cancel' : 'disconnect'); dialog.close(); await wait();
                    check(calls === (action === 'confirm' ? 1 : 0), `${action}: only live explicit confirmation deletes`);
                    if (action === 'confirm') {
                        check(view.row.subtitle.includes('removed') && view.button.sensitive, 'verified completion shown and action available');
                        transaction = {phase: 'failed', problem: 'orphaned-write'}; for (const fn of [...listeners]) fn();
                        check(view.row.subtitle.includes('Restart the computer'), 'orphan restart requirement is explicit');
                        transaction = {phase: 'failed', problem: 'drain-timeout'}; for (const fn of [...listeners]) fn();
                        check(view.row.subtitle.includes('Close other Preferences windows') && !view.row.subtitle.includes('Unlock'), 'drain timeout explains acknowledgement instead of keyring absence');
                        transaction = {phase: 'failed', problem: 'deletion-incomplete', files: {snapshots: 'failed', alerts: 'absent'}, status: 'cleared'}; for (const fn of [...listeners]) fn();
                        check(view.row.subtitle.includes('cache directory') && !view.row.subtitle.includes('Unlock'), 'cache failure has a storage-specific explanation');
                        transaction = {phase: 'complete'}; for (const fn of [...listeners]) fn();
                        failNext = true; view.button.emit('clicked'); await wait();
                        const retryDialog = window.get_visible_dialog(); retryDialog.emit('response', 'disconnect'); retryDialog.close(); await wait();
                        check(view.row.subtitle.includes('Restart the computer') && !view.row.subtitle.includes('removed'), 'failed attempt cannot reuse prior success message');
                        transaction = {phase: 'failed', problem: 'orphaned-write'}; for (const fn of [...listeners]) fn();
                        check(view.button.label === _('Retry disconnection') && view.button.sensitive,
                            'persisted failure offers an enabled, localized retry action');
                    }
                } finally { view.dispose(); window.close(); }
                check(listeners.size === 0, 'disconnect view releases gate subscriptions');
            }
        });
        await run('suggested fonts review preserves consent and cancellation at narrow width', async () => {
            for (const action of ['cancel', 'close', 'dispose', 'install', 'busy-cancel']) {
                const window = newWindow(); let installed = 0, cancelled = 0, destroyed = 0; const hold = deferred();
                let requested = [];
                const installer = {install: async ids => {
                    installed++; requested = [...ids];
                    return action === 'busy-cancel' ? hold.promise : {restartRequired: true};
                }, cancel() { cancelled++; }, destroy() { destroyed++; }};
                const view = createSuggestedFontsGroup({window, gettext: _, installer});
                const page = new Adw.PreferencesPage(); page.add(view.group); window.add(page); window.present(); await wait();
                const row = walk(view.group).find(w => w instanceof Adw.ActionRow);
                try {
                    check(installed === 0, 'constructing font preferences performs no installation');
                    button(view.group, 'Review…').emit('clicked'); await wait(); const dialog = window.get_visible_dialog();
                    check(installed === 0, 'opening font review performs no installation');
                    check(dialog.default_response === 'cancel' && dialog.close_response === 'cancel', 'font review defaults and closes to Cancel');
                    containment(window, dialog, 'font review dialog');
                    for (const widget of walk(dialog).filter(w => w.get_mapped() &&
                        ((w instanceof Gtk.Button && w.label) || (w instanceof Gtk.Label && w.label))))
                        containment(window, widget, 'font review mapped text/action');
                    if (action === 'dispose') { view.destroy(); dialog.emit('response', 'install'); }
                    else if (action === 'close') dialog.close(); // Escape maps to the declared close response.
                    else { dialog.emit('response', action === 'cancel' ? 'cancel' : 'install'); dialog.close(); }
                    await wait();
                    check(installed === (['install', 'busy-cancel'].includes(action) ? 1 : 0), `${action}: only explicit live consent invokes one installation`);
                    if (action === 'install') {
                        check(requested.length === 4 && new Set(requested).size === 4, 'one install receives exactly the maintained four file IDs');
                        check(row.subtitle.includes('Fonts installed') && row.subtitle.includes('Reopen applications'), 'verified installation reports refresh/restart guidance');
                    } else if (action === 'busy-cancel') {
                        const cancel = button(view.group, 'Cancel'); check(cancel.visible, 'busy installation exposes Cancel');
                        cancel.emit('clicked'); hold.resolve({restartRequired: true}); await wait();
                        check(cancelled > 0 && row.subtitle.includes('Cancelled') && !row.subtitle.includes('Fonts installed'), 'cancelled pending installation cannot publish late installed success');
                    }
                } finally { view.destroy(); window.close(); }
                check(destroyed === 1, 'font installer is destroyed exactly once');
            }
        });
        await run('reopened setup rejects incompatible warning thresholds as one batch', async () => {
            const window = newWindow(), s = settings();
            window.add(new Adw.PreferencesPage({title: 'General'}));
            const kinds = ['session', 'week', 'month', 'credits'];
            for (const kind of kinds) s.set_int(`alert-${kind}-percent`, 95);
            s.set_boolean('alert-week-warning-enabled', true);
            s.set_int('alert-week-warning-percent', 80);
            const accounts = {cancel() {}, show() {}, controllers: new Map(availableProviders().map(m => [m.id, fakeController(s, m.id)]))};
            const setup = openFirstUse({window, settings: s, gettext: _, accounts, extensionPath: root});
            try {
                window.present(); await wait();
                for (let i = 0; i < 4; i++) button(setup.page, 'Continue').emit('clicked');
                const critical = walk(setup.page).find(w => w instanceof Adw.SpinRow && w.title === _('Notify at'));
                check(critical, 'setup threshold exists');
                critical.value = 70; await wait();
                check(kinds.every(kind => s.get_int(`alert-${kind}-percent`) === 95), 'invalid setup edit preserves every quota threshold');
                check(critical.value === 95, 'invalid setup edit rolls control back');
                check(walk(setup.page).some(w => w instanceof Adw.ActionRow && w.title === _('Warning must be lower than critical') && w.visible), 'invalid setup edit explains rejection');
                let partialBatch = false;
                const changed = s.connect('changed', (_settings, key) => {
                    if (kinds.some(kind => key === `alert-${kind}-percent`))
                        partialBatch ||= !kinds.every(kind => s.get_int(`alert-${kind}-percent`) === 90);
                });
                try { critical.value = 90; await wait(); }
                finally { s.disconnect(changed); }
                check(kinds.every(kind => s.get_int(`alert-${kind}-percent`) === 90), 'valid setup edit commits all quota thresholds');
                check(!partialBatch, 'settings observers see the complete threshold batch');
                check(s.get_boolean('alert-week-warning-enabled') && s.get_int('alert-week-warning-percent') === 80, 'setup preserves customized warning');
                s.set_int('alert-session-percent', 96); await wait();
                check(critical.value === 96, 'setup follows externally changed threshold');
                s.set_boolean('notifications-enabled', false);
                check(!s.get_boolean('notifications-enabled'), 'shared settings remain immediate after batch');
                containment(window, critical, 'setup threshold');
            } finally { setup.close(); window.close(); }
            const reopenedWindow = newWindow();
            reopenedWindow.add(new Adw.PreferencesPage({title: 'General'}));
            const reopened = openFirstUse({window: reopenedWindow, settings: s, gettext: _, accounts, extensionPath: root});
            try {
                reopenedWindow.present(); await wait();
                for (let i = 0; i < 4; i++) button(reopened.page, 'Continue').emit('clicked');
                const critical = walk(reopened.page).find(w => w instanceof Adw.SpinRow && w.title === _('Notify at'));
                check(critical.value === 96, 'reopening setup reloads the persisted threshold');
                check(s.get_int('alert-week-percent') === 90 && s.get_int('alert-week-warning-percent') === 80, 'opening setup leaves independent quota rules unchanged');
            } finally { reopened.close(); reopenedWindow.close(); }
        });
        await run('warning and critical controls reject invalid pairs and expose external invalid configuration', async () => {
            for (const externalBad of [false, true]) {
                const window = newWindow(), s = settings(), ids = [];
                s.set_boolean('notifications-enabled', true); s.set_boolean('alert-session-enabled', true);
                s.set_boolean('alert-session-warning-enabled', true);
                s.set_int('alert-session-warning-percent', 80); s.set_int('alert-session-percent', externalBad ? 80 : 95);
                const page = buildNotificationsPage({settings: s, gettext: _, handlerIds: ids});
                window.add(page); window.present(); await wait();
                const quota = walk(page).find(w => w instanceof Adw.ExpanderRow && w.title === _('5-hour window'));
                quota.expanded = true; await wait();
                const critical = walk(quota).find(w => w instanceof Adw.SpinRow && w.title === _('Critical threshold'));
                const warning = walk(quota).find(w => w instanceof Adw.SpinRow && w.title === _('Warning threshold'));
                const error = walk(quota).find(w => w instanceof Adw.ActionRow && w.title === _('Warning must be lower than critical'));
                try {
                    check(critical && warning && error, 'paired threshold and error controls exist');
                    if (externalBad) {
                        check(error.visible, 'invalid pair from external settings is visible immediately');
                        check(s.get_int('alert-session-percent') === 80, 'opening preferences does not silently rewrite external settings');
                        critical.value = 95; await wait();
                        check(!error.visible && s.get_int('alert-session-percent') === 95, 'valid user correction clears error');
                    } else {
                        critical.value = 80; await wait();
                        check(critical.value === 95 && s.get_int('alert-session-percent') === 95 && error.visible,
                            `invalid critical edit reverts and exposes error: row=${critical.value} saved=${s.get_int('alert-session-percent')} error=${error.visible}`);
                        warning.value = 96; await wait();
                        check(warning.value === 80 && s.get_int('alert-session-warning-percent') === 80 && error.visible,
                            `invalid warning edit reverts and exposes error: row=${warning.value} saved=${s.get_int('alert-session-warning-percent')} error=${error.visible}`);
                        critical.value = 94; await wait();
                        check(critical.value === 94 && s.get_int('alert-session-percent') === 94 && !error.visible,
                            'a valid critical edit persists and clears rejection feedback');
                        critical.value = 80; await wait();
                        check(critical.value === 94 && s.get_int('alert-session-percent') === 94 && error.visible,
                            'a repeated invalid critical edit preserves the latest valid pair and feedback');
                        warning.value = 79; await wait();
                        check(!error.visible && s.get_int('alert-session-warning-percent') === 79, 'valid pair clears error and persists');
                    }
                    for (const widget of [critical, warning]) containment(window, widget, 'paired threshold row');
                } finally { for (const id of ids) s.disconnect(id); window.close(); }
            }
        });
        print(`Preferences state matrix: ${rtl ? 'RTL' : 'LTR'}, ${ARGV.includes('expanded') ? 'expanded' : 'normal'}${ARGV.includes('large-font') ? ', Sans 22' : ''}, ${failed ? 'failed' : 'passed'}`);
    })().finally(() => { app.release(); app.quit(); });
});
app.run([]);
System.exit(failed ? 1 : 0);
