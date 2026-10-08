// "About" and "Restore configuration" (docs/adr/0010), the last group of the General page.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {keysToReset} from '../core/defaults.js';

// Fixed addresses, opened only through the desktop's launcher.
const WEBSITE = 'https://github.com/dandgabr/elfvision';
const BUG_REPORT = 'https://github.com/dandgabr/elfvision/issues/new?template=bug_report.yml';
const VULNERABILITY_REPORT = 'https://github.com/dandgabr/elfvision/security/advisories/new';
const AUTHOR = 'https://github.com/dandgabr';
const ICON = 'gnome-ai-quota';

/**
 * @param {object} options
 * @param {Adw.PreferencesWindow} options.window
 * @param {Gio.Settings} options.settings
 * @param {(s: string) => string} options.gettext
 * @param {string} options.version - from metadata.json
 * @param {string} options.extensionPath - where the icons are
 * @returns {Adw.PreferencesGroup}
 */
export function buildAboutGroup({window, settings, gettext: _, version, extensionPath, setup = () => {}}) {
    // The application icon is looked up by name, so the extension's icon folder is added to the search.
    const display = Gdk.Display.get_default();
    if (display)
        Gtk.IconTheme.get_for_display(display).add_search_path(`${extensionPath}/icons`);

    const group = new Adw.PreferencesGroup();

    const about = new Adw.ActionRow({title: _('About'), subtitle: version, activatable: true});
    about.add_suffix(new Gtk.Image({icon_name: 'help-about-symbolic', accessible_role: Gtk.AccessibleRole.PRESENTATION}));
    about.connect('activated', () => {
        const dialog = new Adw.AboutDialog({
            application_name: _('Elfvision'),
            application_icon: ICON,
            developer_name: 'Daniel G. Araujo',
            developers: ['Daniel G. Araujo'],
            version,
            comments: _('Monitors AI quotas, reset times and API spending. This build integrates with GNOME Shell.'),
            website: WEBSITE,
            issue_url: BUG_REPORT,
            license_type: Gtk.License.AGPL_3_0,
            copyright: '© 2026 Daniel G. Araujo',
        });
        dialog.add_credit_section(_('Created by'), ['Daniel G. Araujo']);
        dialog.add_link(_('Daniel G. Araujo on GitHub'), AUTHOR);
        dialog.present(window);
    });
    group.add(about);

    for (const [title, subtitle, url] of [
        [_('Report a bug'), _('Opens a public GitHub issue form. Review anything you share.'), BUG_REPORT],
        [_('Report a vulnerability'), _('Opens a private GitHub security report. Do not report vulnerabilities in public issues.'), VULNERABILITY_REPORT],
    ]) {
        const row = new Adw.ActionRow({title, subtitle, activatable: true});
        row.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic', accessible_role: Gtk.AccessibleRole.PRESENTATION}));
        row.connect('activated', () => {
            try {
                Gio.AppInfo.launch_default_for_uri(url, null);
            } catch (_error) {
                // The private destination stays private even if its launcher fails.
                window.add_toast(new Adw.Toast({title: _('Could not open the report page')}));
            }
        });
        group.add(row);
    }

    const setupRow = new Adw.ActionRow({title: _('Set up again'), subtitle: _('Choose providers and review the bar and notifications.'), activatable: true});
    setupRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    setupRow.connect('activated', setup);
    group.add(setupRow);

    const restore = new Adw.ActionRow({
        title: _('Restore configuration'),
        subtitle: _('Appearance, top bar, popup and notifications. Saved connectors and credentials stay saved. Tracking returns to its default.'),
    });
    // Recoverable and confirmed by a dialog, so the button is quiet; the dialog carries the warning.
    const button = new Gtk.Button({label: _('Restore…'), valign: Gtk.Align.CENTER});
    button.connect('clicked', () => confirmRestore({window, settings, gettext: _}));
    restore.add_suffix(button);
    group.add(restore);
    return group;
}

export function confirmRestore({window, settings, gettext: _}) {
    const dialog = new Adw.AlertDialog({
        heading: _('Restore the default settings?'),
        body: _('Appearance, theme, top bar, popup and notification settings go back to their defaults. Saved connectors, credentials and client configuration are kept. All connectors are tracked again and setup becomes available. Your data source stays the same.'),
    });
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('restore', _('Restore'));
    dialog.set_response_appearance('restore', Adw.ResponseAppearance.DESTRUCTIVE);
    dialog.set_default_response('cancel');
    dialog.set_close_response('cancel');
    dialog.connect('response', (_dialog, response) => {
        if (response !== 'restore')
            return;
        restoreDefaults(settings);
        window.add_toast(new Adw.Toast({title: _('Defaults restored')}));
    });
    dialog.present(window);
}

/**
 * Put the settings listed in lib/core/defaults.js back to their defaults, as one batch: the shell
 * reacts to some of them (the bar's place, the theme), and one write is one reaction, not eighteen.
 */
export function restoreDefaults(settings) {
    // apply() does not leave delayed mode. Batch on a dedicated instance so later
    // edits through the shared preferences instance are still published immediately.
    const transaction = Gio.Settings.new_full(settings.settings_schema, settings.backend, settings.path);
    transaction.delay();
    for (const key of keysToReset(transaction.list_keys()))
        transaction.reset(key);
    transaction.apply();
    Gio.Settings.sync();
}
