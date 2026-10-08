// Native About/report and stale-view tests. Run only in tools/prefs-smoke.sh's private session.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';
import {buildAboutGroup} from '../lib/prefs/about.js';
import {buildDisconnectGroup} from '../lib/prefs/disconnectDialog.js';
const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const schema = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, null, false);
const settings = Gio.Settings.new_full(schema.lookup('org.gnome.shell.extensions.gnome-ai-quota', false), Gio.memory_settings_backend_new(), null);
const check = (value, message) => { if (!value) throw new Error(message); };
const wait = () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => { resolve(); return GLib.SOURCE_REMOVE; }));
function walk(widget) {
    const result = [widget];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) result.push(...walk(child));
    return result;
}
const app = new Adw.Application({application_id: 'io.github.dandgabr.QuotaReportTests', flags: Gio.ApplicationFlags.NON_UNIQUE});
let failed = false;
app.connect('activate', () => {
    app.hold();
    const window = new Adw.PreferencesWindow({application: app, default_width: 500, default_height: 650});
    const page = new Adw.PreferencesPage();
    const group = buildAboutGroup({window, settings, gettext: s => s, version: '0.1', extensionPath: root});
    page.add(group); window.add(page); window.present();
    const originalLaunch = Gio.AppInfo.launch_default_for_uri;
    const launched = [];
    Gio.AppInfo.launch_default_for_uri = uri => { launched.push(uri); return true; };
    (async () => {
        await wait();
        const row = title => walk(group).find(w => w instanceof Adw.ActionRow && w.title === title);
        row('About').emit('activated'); await wait();
        const about = window.get_visible_dialog();
        check(about instanceof Adw.AboutDialog, 'native About opens');
        check(about.application_name === 'Gnome AI Quota' && about.developer_name === 'Daniel G. Araujo', 'project and contributor names');
        check(about.developers.includes('Daniel G. Araujo'), 'contributor credit');
        check(about.issue_url.endsWith('issues/new?template=bug_report.yml'), 'About selects bug form');
        about.close(); await wait();
        row('Report a bug').emit('activated'); row('Report a vulnerability').emit('activated');
        check(JSON.stringify(launched) === JSON.stringify([
            'https://github.com/dandgabr/gnome-ai-quota/issues/new?template=bug_report.yml',
            'https://github.com/dandgabr/gnome-ai-quota/security/advisories/new',
        ]), 'public/private fixed destinations, no account or log payload');
        Gio.AppInfo.launch_default_for_uri = () => { throw new Error('synthetic launcher failure'); };
        row('Report a vulnerability').emit('activated');
        check(launched.length === 2, 'failed private launcher has no public fallback');
        let finish, calls = 0;
        const pending = new Promise(resolve => { finish = resolve; });
        const view = buildDisconnectGroup({window, settings, gettext: s => s, demo: true,
            run: () => pending, onBusyChange: () => { calls++; }});
        page.add(view.group); view.button.emit('clicked'); await wait();
        const dialog = window.get_visible_dialog();
        check(dialog.default_response === 'cancel' && dialog.close_response === 'cancel', 'delete defaults to Cancel');
        dialog.emit('response', 'disconnect'); dialog.close(); await wait();
        check(calls === 1, 'deletion starts one busy callback');
        view.dispose(); finish({phase: 'complete'}); await wait();
        check(calls === 1, 'disposed view cannot mutate new page controls after deletion settles');
        print('Native About/report: names, destinations, private failure and disposed deletion passed');
    })().catch(error => { failed = true; printerr(`FAIL native reports: ${error.message}\n${error.stack}`); })
        .finally(() => { Gio.AppInfo.launch_default_for_uri = originalLaunch; window.close(); app.release(); app.quit(); });
});
app.run([]);
System.exit(failed ? 1 : 0);
