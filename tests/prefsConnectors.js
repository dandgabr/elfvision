// Native GTK scenario; use a private compositor and memory settings, never the user's session.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import System from 'system';
import {buildAccountsPage, apiKeyGroup} from '../lib/prefs/accounts.js';
import {createConnectorStore} from '../lib/services/connectorStore.js';
import {availableProviders, availableDemoProviders} from '../lib/core/providerRegistry.js';
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
        for (const meta of availableProviders().filter(entry => entry.credentialScope)) {
            const synthetic = {snapshot: () => ({hasKey: false, blocked: false, saving: false, keyringDown: false}),
                subscribe: () => () => {}, refresh: async () => {}};
            const localHandlers = [];
            const view = apiKeyGroup({meta, window, settings, gettext: _, handlerIds: localHandlers, controller: synthetic});
            check(walk(view.group).filter(item => item instanceof Adw.PasswordEntryRow).length === 1, `${meta.name} offers one key field`);
            check(!walk(view.group).some(item => item instanceof Adw.EntryRow && !(item instanceof Adw.PasswordEntryRow)), `${meta.name} does not ask for Command Code username`);
            if (meta.credentialScope === 'organization-admin' || meta.credentialScope === 'team-admin')
                check(walk(view.group).some(item => item instanceof Adw.ActionRow && item.title.includes('Admin API key')), `${meta.name} explains admin credential requirement`);
            view.dispose();
        }
        check(accounts.controllers.size === 5, 'five independent default demo connectors including credits');
        check(walk(accounts.page).some(item => item instanceof Adw.ActionRow && item.title === _('Demo connectors')), 'explicit synthetic notice');
        check(!walk(accounts.page).some(item => item instanceof Adw.PasswordEntryRow), 'demo cannot expose a live credential entry');
        const add = button(accounts.page, 'Add connector…'); contained(add, window); add.emit('clicked');
        await wait();
        const dialog = window.get_visible_dialog();
        check(dialog instanceof Adw.AlertDialog && dialog.close_response === 'cancel', 'Add is cancellable');
        const provider = walk(dialog).find(item => item instanceof Adw.ComboRow);
        check(provider.model.get_n_items() === availableDemoProviders().length, 'Add lists every available synthetic provider dynamically');
        provider.selected = 1;
        const name = walk(dialog).find(item => item instanceof Adw.EntryRow);
        name.text = 'Work Codex';
        dialog.emit('response', 'add'); dialog.close(); await wait();
        const work = store.list().find(item => item.label === 'Work Codex');
        check(work && work.providerId === 'codex' && work.id !== 'codex', 'second provider connector created with independent identity');
        check(accounts.controllers.size === 6, 'new controller added without replacing default');
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
        check(!button(accounts.page, 'Restore…'), 'Accounts has no configuration restore action');
        const credit = store.get('example-credits');
        check(credit && accounts.controllers.has(credit.id), 'credits is an ordinary persisted connector');
        settings.set_strv('demo-connected-connectors', store.list().map(entry => entry.id));
        settings.set_strv('untracked-providers', ['example-credits', 'unrelated-live']);
        settings.set_string('theme', 'glassmorphism');
        const liveBefore = settings.get_string('connectors');
        const deleteAll = button(accounts.page, 'Delete all connectors'); contained(deleteAll, window);
        deleteAll.emit('clicked'); await wait(); let deletion = window.get_visible_dialog();
        check(deletion.default_response === 'cancel' && deletion.close_response === 'cancel', 'bulk deletion defaults to Cancel');
        check(deletion.heading === _('Delete all fictional connectors?'), 'bulk confirmation identifies fictional scope');
        deletion.emit('response', 'cancel'); deletion.close(); await wait();
        check(store.list().length === 5 && settings.get_strv('demo-connected-connectors').length === 5, 'bulk Cancel preserves every connector and connection');
        deleteAll.emit('clicked'); await wait(); deletion = window.get_visible_dialog();
        deletion.emit('response', 'disconnect'); deletion.close(); await wait();
        check(store.list().length === 0 && accounts.controllers.size === 0, 'bulk deletion removes all five demo connectors including credits');
        check(settings.get_strv('demo-connected-connectors').length === 0, 'bulk deletion clears every simulated connection');
        check(settings.get_strv('untracked-providers').join(',') === 'unrelated-live', 'bulk deletion removes only selected tracking references');
        check(settings.get_string('connectors') === liveBefore && settings.get_string('theme') === 'glassmorphism', 'live registry and appearance survive demo deletion');
        const reopened = createConnectorStore(settings, {demo: true});
        check(reopened.list().length === 0, 'empty registry stays empty on reopening'); reopened.dispose();
        settings.set_string('demo-scenario', 'drift'); await wait();
        check(store.list().length === 0 && accounts.controllers.size === 0, 'scenario changes do not recreate deleted connectors');
        settings.set_string('demo-connectors', 'synthetic corrupt registry'); await wait();
        const recover = button(accounts.page, 'Recover list…');
        check(recover && recover.sensitive && !button(accounts.page, 'Add connector…').sensitive, 'invalid metadata exposes a recovery action instead of silent reset');
        recover.emit('clicked'); await wait(); let recovery = window.get_visible_dialog();
        check(recovery.default_response === 'cancel' && recovery.close_response === 'cancel', 'metadata recovery defaults to Cancel');
        recovery.emit('response', 'cancel'); recovery.close(); await wait();
        check(settings.get_string('demo-connectors') === 'synthetic corrupt registry', 'cancel does not reconstruct metadata');
        recover.emit('clicked'); await wait(); recovery = window.get_visible_dialog();
        recovery.emit('response', 'recover'); recovery.close(); await wait();
        check(store.list().length === 5 && button(accounts.page, 'Add connector…').sensitive, 'confirmed demo recovery reconstructs safe fictional metadata');
        check(settings.get_string('connectors') === '', 'demo recovery never rewrites live connector metadata');
        const demoBefore = settings.get_string('demo-connectors');
        settings.set_string('connectors', JSON.stringify({version: 1, connectors: []}));
        settings.set_string('data-source', 'live'); await wait();
        check(accounts.controllers.size === 0, 'live and demo lists remain independent');
        button(accounts.page, 'Add connector…').emit('clicked'); await wait();
        const liveAdd = window.get_visible_dialog();
        const livePicker = walk(liveAdd).find(item => item instanceof Adw.ComboRow);
        check(livePicker.model.get_n_items() === availableProviders().length, 'live Add lists all live providers and excludes demo credits');
        liveAdd.emit('response', 'cancel'); liveAdd.close(); await wait();
        check(!availableProviders().some(meta => ['gemini-api', 'zai'].includes(meta.id)), 'deferred providers absent');
        settings.set_string('data-source', 'demo'); await wait();
        check(settings.get_string('demo-connectors') === demoBefore && accounts.controllers.size === 5, 'switching mode keeps recovered demo identities');
        print(`Native connectors: add/connect/rename/cancel/remove/bulk-delete/restart/recovery passed (${ARGV.join(' ') || 'LTR'})`);
    })().catch(error => { failed = true; printerr(`FAIL native connectors: ${error.message}\n${error.stack}`); })
        .finally(() => { window.close(); handlers.forEach(id => settings.disconnect(id)); store.dispose(); app.release(); app.quit(); });
});
app.run([]);
System.exit(failed ? 1 : 0);
