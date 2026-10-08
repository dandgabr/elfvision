// Native GTK scenario; use a private compositor and memory settings, never the user's session.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import System from 'system';
import {buildAccountsPage} from '../lib/prefs/accounts.js';
import {createConnectorStore} from '../lib/services/connectorStore.js';
import {expandText} from '../lib/core/pseudoLocale.js';

const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, null, false);
const settings = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null);
settings.set_string('data-source', 'demo');
settings.set_strv('demo-connected-connectors', []);
const _ = ARGV.includes('expanded') ? expandText : text => text;
Gtk.Widget.set_default_direction(ARGV.includes('rtl') ? Gtk.TextDirection.RTL : Gtk.TextDirection.LTR);
const wait = () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 220, () => { resolve(); return GLib.SOURCE_REMOVE; }));
const check = (condition, message) => { if (!condition) throw new Error(message); };
function walk(widget) {
    const result = [widget];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) result.push(...walk(child));
    return result;
}
const button = (widget, label) => walk(widget).find(item => item instanceof Gtk.Button && item.label === _(label));
function contained(widget, window) {
    const [allocated, bounds] = widget.compute_bounds(window);
    check(allocated && widget.get_width() > 0 && bounds.get_x() >= -1 && bounds.get_x() + bounds.get_width() <= window.get_width() + 1,
        `action contained: ${widget.label ?? widget.title ?? widget.constructor.name}`);
}
const app = new Adw.Application({application_id: 'io.github.dandgabr.QuotaConnectorTests', flags: Gio.ApplicationFlags.NON_UNIQUE});
let failed = false;
app.connect('activate', () => {
    app.hold();
    const window = new Adw.PreferencesWindow({application: app, default_width: 360, default_height: 600});
    const handlers = [];
    const accounts = buildAccountsPage({window, settings, gettext: _, handlerIds: handlers, extensionPath: root});
    const store = createConnectorStore(settings, {demo: true});
    window.add(accounts.page); window.present();
    (async () => {
        await wait();
        check(accounts.controllers.size === 4, 'four independent legacy default connectors');
        check(walk(accounts.page).some(item => item instanceof Adw.ActionRow && item.title === _('Demo connectors')), 'explicit synthetic notice');
        check(!walk(accounts.page).some(item => item instanceof Adw.PasswordEntryRow), 'demo cannot expose a live credential entry');
        const add = button(accounts.page, 'Add connector…'); contained(add, window); add.emit('clicked');
        await wait();
        const dialog = window.get_visible_dialog();
        check(dialog instanceof Adw.AlertDialog && dialog.close_response === 'cancel', 'Add is cancellable');
        const provider = walk(dialog).find(item => item instanceof Adw.ComboRow);
        provider.selected = 1;
        const name = walk(dialog).find(item => item instanceof Adw.EntryRow);
        name.text = 'Work Codex';
        dialog.emit('response', 'add'); dialog.close(); await wait();
        const work = store.list().find(item => item.label === 'Work Codex');
        check(work && work.providerId === 'codex' && work.id !== 'codex', 'second provider connector created with independent identity');
        check(accounts.controllers.size === 5, 'new controller added without replacing default');
        let connect = button(window, 'Simulate connect'); contained(connect, window); connect.emit('clicked'); await wait();
        check(accounts.controllers.get(work.id).snapshot().connected, 'second connector connected');
        check(!accounts.controllers.get('codex').snapshot().connected, 'first connector unchanged');
        const rename = walk(window).find(item => item instanceof Adw.EntryRow && item.title === _('Connector name'));
        rename.text = 'Renamed Codex'; rename.emit('apply'); await wait();
        check(store.get(work.id).label === 'Renamed Codex', 'rename preserves the ID');
        button(window, 'Remove…').emit('clicked'); await wait();
        let remove = window.get_visible_dialog();
        check(remove.default_response === 'cancel' && remove.close_response === 'cancel', 'removal defaults to Cancel');
        remove.emit('response', 'cancel'); remove.close(); await wait();
        check(store.get(work.id) && accounts.controllers.get(work.id).snapshot().connected, 'cancel retains connector and connection');
        button(window, 'Remove…').emit('clicked'); await wait(); remove = window.get_visible_dialog();
        remove.emit('response', 'remove'); remove.close(); await wait();
        check(!store.get(work.id) && store.get('codex'), 'confirmed removal affects only the chosen connector');
        check(!settings.get_strv('demo-connected-connectors').includes(work.id), 'simulated credential state removed');
        settings.set_string('theme', 'glassmorphism'); settings.set_strv('untracked-providers', ['codex']); settings.set_boolean('first-use-done', true);
        button(accounts.page, 'Restore…').emit('clicked'); await wait(); const restore = window.get_visible_dialog();
        check(restore.default_response === 'cancel', 'restore defaults to Cancel');
        restore.emit('response', 'restore'); restore.close(); await wait();
        check(settings.get_string('theme') === 'sistema-gnome' && !settings.get_strv('untracked-providers').length && !settings.get_boolean('first-use-done'),
            'confirmed reset restores actual appearance/tracking/setup values');
        check(store.list().length === 4 && settings.get_string('data-source') === 'demo', 'reset preserves connector list and synthetic source');
        accounts.show('codex'); await wait();
        connect = button(window, 'Simulate connect'); check(connect && connect.sensitive, 'configuration remains available after reset');
        window.pop_subpage(); await wait();
        settings.set_string('demo-connectors', 'synthetic corrupt registry'); await wait();
        const recover = button(accounts.page, 'Recover list…');
        check(recover && recover.sensitive && !button(accounts.page, 'Add connector…').sensitive, 'invalid metadata exposes a recovery action instead of silent reset');
        recover.emit('clicked'); await wait(); let recovery = window.get_visible_dialog();
        check(recovery.default_response === 'cancel' && recovery.close_response === 'cancel', 'metadata recovery defaults to Cancel');
        recovery.emit('response', 'cancel'); recovery.close(); await wait();
        check(settings.get_string('demo-connectors') === 'synthetic corrupt registry', 'cancel does not reconstruct metadata');
        recover.emit('clicked'); await wait(); recovery = window.get_visible_dialog();
        recovery.emit('response', 'recover'); recovery.close(); await wait();
        check(store.list().length === 4 && button(accounts.page, 'Add connector…').sensitive, 'confirmed demo recovery reconstructs safe fictional metadata');
        check(settings.get_string('connectors') === '', 'demo recovery never rewrites live connector metadata');
        print(`Native connectors: add/connect/rename/cancel/remove/reset/reconfigure/recovery passed (${ARGV.join(' ') || 'LTR'})`);
    })().catch(error => { failed = true; printerr(`FAIL native connectors: ${error.message}\n${error.stack}`); })
        .finally(() => { window.close(); handlers.forEach(id => settings.disconnect(id)); store.dispose(); app.release(); app.quit(); });
});
app.run([]);
System.exit(failed ? 1 : 0);
