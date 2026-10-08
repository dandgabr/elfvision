// Integration under tools/prefs-smoke.sh's private GTK display and memory settings.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import System from 'system';
import {addPopupControls, popupPresentationPage} from '../lib/prefs/popup.js';
const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, null, false);
const app = new Adw.Application({application_id: 'io.github.dandgabr.QuotaPopupTest', flags: Gio.ApplicationFlags.NON_UNIQUE});
const wait = () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => { resolve(); return GLib.SOURCE_REMOVE; }));
const check = (value, message) => { if (!value) throw new Error(message); };
function walk(widget) {
    const widgets = [widget];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) widgets.push(...walk(child));
    return widgets;
}
let failed = false;
app.connect('activate', () => {
    app.hold();
    (async () => {
        const settings = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null);
        const window = new Adw.PreferencesWindow({application: app, default_width: 640, default_height: 600});
        const page = new Adw.PreferencesPage({title: 'General'});
        const group = new Adw.PreferencesGroup({title: 'Popup'});
        const handlerIds = [];
        addPopupControls({group, window, settings, gettext: s => s, handlerIds});
        page.add(group); window.add(page); window.present(); await wait();
        const rows = walk(group);
        const automaticWidth = rows.find(row => row instanceof Adw.SwitchRow && row.title === 'Automatic width');
        const width = rows.find(row => row instanceof Adw.SpinRow && row.title === 'Popup width');
        check(automaticWidth.active && !width.sensitive && settings.get_int('popup-width') === 0, 'Automatic width never writes its displayed fallback');
        automaticWidth.active = false; width.value = 580;
        check(settings.get_int('popup-width') === 580, 'Manual width reaches settings');
        settings.reset('popup-width');
        check(automaticWidth.active && settings.get_int('popup-width') === 0, 'Reset follows settings without writing back');
        settings.set_string('data-source', 'demo');
        const entries = ['codex', 'claude'].map(id => ({id, providerId: id, label: '', username: ''}));
        const registry = entries => JSON.stringify({version: 1, connectors: entries});
        settings.set_string('demo-connectors', registry(entries));
        const baseHandlers = handlerIds.length;
        const presentation = popupPresentationPage({window, settings, gettext: s => s, handlerIds});
        window.push_subpage(presentation); await wait();
        const connectorRows = () => walk(presentation).filter(row => row instanceof Adw.ActionRow && row.subtitle === 'Show in popup');
        const codex = connectorRows().find(row => row.title === 'Codex');
        const switchFor = row => walk(row).find(widget => widget instanceof Gtk.Switch);
        // Update after controls exist; the old Codex handler must preserve the new sibling.
        const third = {id: 'antigravity', providerId: 'antigravity', label: '', username: ''};
        settings.set_string('demo-connectors', registry([...entries, third]));
        settings.set_strv('demo-popup-hidden-connectors', ['antigravity']);
        switchFor(codex).active = false;
        check(JSON.stringify(settings.get_strv('demo-popup-hidden-connectors')) === JSON.stringify(['antigravity', 'codex']), 'Hiding preserves a newly added hidden sibling');
        const claude = connectorRows().find(row => row.title === 'Claude');
        const up = walk(claude).find(widget => widget instanceof Gtk.Button && widget.tooltip_text === 'Move up');
        up.grab_focus();
        up.emit('clicked');
        await wait();
        check(window.get_focus()?.is_ancestor(claude) && window.get_focus().sensitive, 'Moving to first row retains focus on an enabled action of the same connector');
        const down = walk(claude).find(widget => widget instanceof Gtk.Button && widget.tooltip_text === 'Move down');
        down.grab_focus(); down.emit('clicked'); await wait();
        down.grab_focus(); down.emit('clicked'); await wait();
        check(window.get_focus()?.is_ancestor(claude) && window.get_focus().sensitive, 'Moving to last row retains focus on an enabled action of the same connector');
        settings.set_strv('demo-popup-connector-order', ['claude', 'codex', 'antigravity']);

        check(settings.get_strv('demo-popup-connector-order')[0] === 'claude', 'Accessible movement changes order');
        check(settings.get_strv('untracked-providers').length === 0 && settings.get_strv('popup-hidden-connectors').length === 0, 'Presentation remains separate from polling and Live settings');
        window.pop_subpage(); await wait();
        check(handlerIds.length === baseHandlers, 'Leaving presentation disconnects owned settings handlers');
        handlerIds.splice(0).forEach(id => settings.disconnect(id));
        window.close(); await wait();
        print('GAQ_PREFS_POPUP_OK: dimensions, reset, stale-registry visibility, order, isolation and cleanup');
    })().catch(error => { printerr(error.stack); failed = true; }).finally(() => { app.release(); app.quit(); });
});
app.run([]);
System.exit(failed ? 1 : 0);
