// Full preferences with private memory settings/demo and empty private keyring; no sign-in.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {fmt} from '../lib/core/viewmodel.js';
String.prototype.format = function (...args) { return fmt(String(this), ...args); };
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, null, false);
const metadata = JSON.parse(decodeURIComponent(Array.from(GLib.file_get_contents(`${root}/metadata.json`)[1], byte => `%${byte.toString(16).padStart(2, '0')}`).join('')));
metadata.path = root; metadata.dir = Gio.File.new_for_path(root);
const app = new Adw.Application({application_id: 'io.github.dandgabr.QuotaA11y', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    app.hold();
    (async () => {
        const {default: Preferences} = await import(`file://${root}/prefs.js`);
        const settings = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null);
        settings.set_string('data-source', 'demo'); settings.set_boolean('first-use-done', true);
        const preferences = new Preferences(metadata);
        preferences.getSettings = () => settings; preferences.gettext = text => text;
        const window = new Adw.PreferencesWindow({application: app, title: 'Quota Automated Accessibility', default_width: 800, default_height: 740});
        const pages = [];
        const addPage = window.add.bind(window);
        window.add = page => { pages.push(page); addPage(page); };
        preferences.fillPreferencesWindow(window);
        const general = pages.find(page => page.title === 'General');
        if (general) window.set_visible_page(general);
        window.present();
        const output = `${root}/.superpowers/sdd/2026-10-07-open-items/a11y-gtk-focus.json`;
        let keyCount = 0;
        const keyboard = new Gtk.EventControllerKey({propagation_phase: Gtk.PropagationPhase.CAPTURE});
        keyboard.connect('key-pressed', () => { keyCount++; return false; });
        window.add_controller(keyboard);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            let focus = window.get_focus();
            let name = '';
            while (focus && !name) {
                name = focus instanceof Adw.PreferencesRow ? focus.title : focus instanceof Gtk.Button ? focus.label : '';
                focus = focus.get_parent();
            }
            Gio.File.new_for_path(output).replace_contents(JSON.stringify({name, active: window.is_active, keys: keyCount}), null, false, Gio.FileCreateFlags.PRIVATE, null);
            return GLib.SOURCE_CONTINUE;
        });
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 75, () => { window.close(); app.release(); app.quit(); return GLib.SOURCE_REMOVE; });
    })().catch(error => { GLib.log_structured("gaq-a11y", GLib.LogLevelFlags.LEVEL_WARNING, {MESSAGE: error.message}); app.release(); app.quit(); });
});
app.run([]);
