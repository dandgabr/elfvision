// Full prefs.js integration in the smoke script's isolated bus/data/keyring; no sign-in or save.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';
import {fmt} from '../lib/core/viewmodel.js';

String.prototype.format = function (...args) { return fmt(String(this), ...args); };
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, null, false);
const metadata = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${root}/metadata.json`)[1]));
metadata.path = root;
metadata.dir = Gio.File.new_for_path(root);
const wait = () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => { resolve(); return GLib.SOURCE_REMOVE; }));
const app = new Adw.Application({application_id: 'io.github.dandgabr.QuotaStartup', flags: Gio.ApplicationFlags.NON_UNIQUE});
let failed = false;
function walk(widget) {
    const result = [widget];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) result.push(...walk(child));
    return result;
}
function check(value, message) { if (!value) throw new Error(message); }
app.connect('activate', () => {
    app.hold();
    (async () => {
        const {default: Preferences} = await import(`file://${root}/prefs.js`);
        for (const mode of ['fresh', 'target', 'demo', 'dismissed']) {
            const s = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null);
            if (mode === 'target') s.set_string('prefs-target', 'claude');
            if (mode === 'demo') s.set_string('data-source', 'demo');
            if (mode === 'dismissed') s.set_boolean('first-use-done', true);
            const preferences = new Preferences(metadata);
            preferences.getSettings = () => s;
            preferences.gettext = x => x;
            const window = new Adw.PreferencesWindow({application: app, default_width: 640, default_height: 600});
            preferences.fillPreferencesWindow(window);
            window.present();
            for (let i = 0; i < 8; i++) {
                await wait();
                if (walk(window).some(w => w instanceof Adw.NavigationPage && w.title === 'Welcome')) break;
            }
            const hasSetup = walk(window).some(w => w instanceof Adw.NavigationPage && w.title === 'Welcome');
            check(hasSetup === (mode === 'fresh'), `${mode}: correct automatic setup policy`);
            if (mode === 'fresh') {
                s.set_string('prefs-target', 'claude');
                await wait();
                check(s.get_boolean('first-use-done') && s.get_string('prefs-target') === '', 'target dismisses setup and is consumed');
                check(!walk(window).some(w => w instanceof Adw.NavigationPage && w.title === 'Welcome'), 'target removes setup');
            }
            window.close();
            await wait();
        }
        print('Full preferences startup: fresh, account target, demo, dismissed and live target change passed');
    })().catch(error => { failed = true; printerr(`${error.message}\n${error.stack}`); }).finally(() => { app.release(); app.quit(); });
});
app.run([]);
System.exit(failed ? 1 : 0);
