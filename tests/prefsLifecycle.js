// GTK lifecycle checks in the private shell used by tools/prefs-smoke.sh.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import System from 'system';
import {openFirstUse} from '../lib/prefs/firstUse.js';
import {availableProviders} from '../lib/providers/registry.js';

const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, null, false);
function settings() { return Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null); }
function check(value, message) { if (!value) throw new Error(message); }
function walk(widget) {
    const result = [widget];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) result.push(...walk(child));
    return result;
}
let failed = false;
const app = new Adw.Application({application_id: 'io.github.dandgabr.QuotaLifecycle', flags: Gio.ApplicationFlags.NON_UNIQUE});
const wait = () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => { resolve(); return GLib.SOURCE_REMOVE; }));
app.connect('activate', () => {
    app.hold();
    (async () => {
        for (const mode of ['skip', 'escape', 'back', 'close', 'account']) {
            const window = new Adw.PreferencesWindow({application: app, default_width: 640, default_height: 600});
            window.add(new Adw.PreferencesPage({title: 'General'}));
            const s = settings();
            let cancel = 0;
            let closed = 0;
            let shown = '';
            const accounts = {cancel: () => { cancel++; }, show: id => { shown = id; },
                controllers: new Map(availableProviders().map(meta => [meta.id, {
                    snapshot: () => ({connected: false, hasKey: false}), subscribe: () => () => {},
                }]))};
            const setup = openFirstUse({window, settings: s, gettext: x => x, accounts, extensionPath: root,
                notificationsPage: null, onClosed: () => { closed++; }});
            window.present();
            await wait();
            if (mode === 'skip') {
                walk(setup.page).find(w => w instanceof Gtk.Button && w.label === 'Set up later').emit('clicked');
            } else if (mode === 'escape') {
                const list = setup.page.observe_controllers();
                for (let i = 0; i < list.get_n_items(); i++) {
                    const controller = list.get_item(i);
                    if (controller instanceof Gtk.EventControllerKey)
                        check(controller.emit('key-pressed', Gdk.KEY_Escape, 0, 0), 'Escape consumed');
                }
            } else if (mode === 'back') {
                window.pop_subpage();
            } else if (mode === 'close') {
                window.close();
            } else {
                for (let i = 0; i < 5; i++) {
                    walk(setup.page).find(w => w instanceof Gtk.Button && w.label === 'Continue').emit('clicked');
                    await wait();
                }
                walk(setup.page).find(w => w instanceof Adw.ActionRow && w.title.startsWith('Claude')).emit('activated');
                check(shown === 'claude', 'summary opens selected account');
            }
            await wait();
            check(s.get_boolean('first-use-done') && closed === 1 && cancel >= 2, `${mode}: closes once, records dismissal and cancels`);
            check(s.get_strv('terms-acknowledged').length === 0 && s.get_int('test-notification') === 0, `${mode}: no credential/notification action`);
            window.close();
        }
        print('Preferences lifecycle: Skip, Escape, header back, window close and summary account passed');
    })().catch(error => { failed = true; printerr(`${error.message}\n${error.stack}`); }).finally(() => { app.release(); app.quit(); });
});
app.run([]);
System.exit(failed ? 1 : 0);
