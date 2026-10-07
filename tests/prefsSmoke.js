// Run in an isolated Wayland session with tools/prefs-smoke.sh. No credential I/O or browser.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import System from 'system';
import {expandText} from '../lib/core/pseudoLocale.js';
import {openFirstUse} from '../lib/prefs/firstUse.js';
import {availableProviders} from '../lib/providers/registry.js';

const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, null, false);
const settings = Gio.Settings.new_full(source.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null);
const rtl = ARGV.includes('rtl');
const expanded = ARGV.includes('expanded');
const translate = expanded ? expandText : s => s;
Gtk.Widget.set_default_direction(rtl ? Gtk.TextDirection.RTL : Gtk.TextDirection.LTR);
let failed = false;
const app = new Adw.Application({application_id: 'io.github.dandgabr.QuotaSmoke', flags: Gio.ApplicationFlags.NON_UNIQUE});
function check(condition, message) { if (!condition) throw new Error(message); }
function walk(widget) {
    const result = [widget];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        result.push(...walk(child));
    return result;
}
app.connect('activate', () => {
    if (ARGV.includes('large-font'))
        Gtk.Settings.get_default().gtk_font_name = 'Sans 22';
    const window = new Adw.PreferencesWindow({application: app, default_width: 360, default_height: 600});
    window.add(new Adw.PreferencesPage({title: 'General'}));
    const states = new Map(availableProviders().map(meta => [meta.id, {connected: false, hasKey: false, hasConfig: false, keyringDown: false, configProblem: ''}]));
    let cancelled = 0;
    let subscriptions = 0;
    const signalIds = new Set();
    const connectWindow = window.connect.bind(window);
    const disconnectWindow = window.disconnect.bind(window);
    window.connect = (name, fn) => {
        const id = connectWindow(name, fn);
        signalIds.add(id);
        return id;
    };
    window.disconnect = id => { signalIds.delete(id); disconnectWindow(id); };
    const controllers = new Map(availableProviders().map(meta => [meta.id, {
        snapshot: () => ({...states.get(meta.id)}), subscribe: () => { subscriptions++; return () => { subscriptions--; }; }, refresh: async () => {}, recheck() {},
        connect() { throw new Error('A sign-in must not start during traversal'); },
    }]));
    const accounts = {controllers, cancel: () => { cancelled++; }, show() {}};
    let assistant;
    let step = 0;
    let run = 0;
    const start = () => {
        assistant = openFirstUse({window, settings, gettext: translate, accounts, extensionPath: root, notificationsPage: null});
        window.present();
    };
    start();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
        try {
            const widgets = walk(assistant.page);
            const button = text => widgets.find(w => w instanceof Gtk.Button && w.label === translate(text));
            if (step === 1) {
                const rows = widgets.filter(w => w instanceof Adw.SwitchRow);
                check(rows.length === 4 && rows.every(w => !w.active), 'providers must be opt-in');
                rows.forEach(w => { w.active = true; });
            }
            if (step === 2) {
                const command = widgets.find(w => w instanceof Gtk.Label && w.label.includes('python3 -I'));
                check(command && command.selectable && !command.wrap && !command.label.includes('\n'), 'missing-client command is selectable and one line');
                let scroll = command.get_parent();
                while (scroll && !(scroll instanceof Gtk.ScrolledWindow)) scroll = scroll.get_parent();
                check(scroll && scroll.get_hadjustment().get_upper() > scroll.get_hadjustment().get_page_size(), 'long command can be read by horizontal scrolling');
                const [commandAllocated, commandBounds] = scroll.compute_bounds(window);
                check(commandAllocated && commandBounds.get_x() >= -1 && commandBounds.get_x() + commandBounds.get_width() <= window.get_width() + 1,
                    'command viewport stays inside actual window');
                check(widgets.filter(w => w instanceof Adw.PreferencesGroup).length === 6, 'all four chosen provider groups');
            }
            if (step === 3) {
                const count = widgets.find(w => w instanceof Adw.SpinRow);
                count.value = 4;
                check(settings.get_int('bar-count') === 4, 'bar setting applied');
            }
            if (step === 4) {
                const toggle = widgets.find(w => w instanceof Adw.SwitchRow);
                toggle.active = false;
                check(!settings.get_boolean('notifications-enabled'), 'notification setting applied');
                const threshold = widgets.find(w => w instanceof Adw.SpinRow);
                threshold.value = 87;
                check(['session', 'week', 'month', 'credits'].every(kind => settings.get_int(`alert-${kind}-percent`) === 87), 'all quota thresholds applied');
            }
            if (assistant.page.measure(Gtk.Orientation.HORIZONTAL, -1)[0] > 360) {
                for (const widget of widgets) {
                    const min = widget.measure(Gtk.Orientation.HORIZONTAL, -1)[0];
                    if (min > 300)
                        printerr(`${widget.constructor.name} ${widget.title ?? widget.label ?? ''}: min=${min}`);
                }
            }
            check(assistant.page.measure(Gtk.Orientation.HORIZONTAL, -1)[0] <= 360, `step ${step}: minimum ${assistant.page.measure(Gtk.Orientation.HORIZONTAL, -1)[0]} must fit 360px window`);
            const primary = button(step === 5 ? 'Close setup' : 'Continue');
            check(primary?.get_width() > 0, `step ${step}: action allocated`);
            const [allocated, bounds] = primary.compute_bounds(window);
            check(allocated && bounds.get_x() >= -1 && bounds.get_x() + bounds.get_width() <= window.get_width() + 1,
                `step ${step}: primary action stays inside actual viewport`);
            const parent = primary.get_parent();
            const [parentAllocated, parentBounds] = primary.compute_bounds(parent);
            check(parentAllocated && parentBounds.get_x() >= -1 && parentBounds.get_x() + parentBounds.get_width() <= parent.get_width() + 1,
                `step ${step}: primary action stays inside its parent`);
            primary.emit('clicked');
            step++;
            if (step === 6) {
                check(subscriptions === 0, 'account subscriptions released');
                check(signalIds.size === 0, 'window handlers released');
                check(settings.get_boolean('first-use-done'), 'finish records dismissal');
                check(settings.get_int('test-notification') === 0, 'setup sends no test notice');
                check(settings.get_strv('terms-acknowledged').length === 0, 'setup never acknowledges terms');
                check(settings.get_strv('untracked-providers').length === 0, 'selection never changes tracking');
                if (++run < 3) { step = 0; start(); return GLib.SOURCE_CONTINUE; }
                check(cancelled >= 18, 'navigation cancels active requests');
                print(`Preferences traversal: ${rtl ? 'RTL' : 'LTR'}, ${expanded ? 'expanded text' : 'normal text'}${ARGV.includes('large-font') ? ', Sans 22' : ''}, 3 runs, all steps passed`);
                window.close();
                app.quit();
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        } catch (error) {
            printerr(`${error.message}\n${error.stack}`);
            failed = true;
            app.quit();
            return GLib.SOURCE_REMOVE;
        }
    });
});
app.run([]);
System.exit(failed ? 1 : 0);
