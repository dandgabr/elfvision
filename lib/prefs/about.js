// "About" and "Restore defaults" (docs/adr/0010), the last group of the General page.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {keysToReset} from '../core/defaults.js';

// Fixed addresses, opened only through the desktop's launcher.
const WEBSITE = 'https://github.com/dandgabr/gnome-ai-quota';
const ISSUES = 'https://github.com/dandgabr/gnome-ai-quota/issues';
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
            application_name: _('AI Quota'),
            application_icon: ICON,
            developer_name: 'dandgabr',
            developers: ['dandgabr'],
            version,
            comments: _('Shows the remaining quota of your AI providers in the top bar and in a popup.'),
            website: WEBSITE,
            issue_url: ISSUES,
            license_type: Gtk.License.AGPL_3_0,
            copyright: '© 2026 dandgabr',
        });
        dialog.present(window);
    });
    group.add(about);

    const setupRow = new Adw.ActionRow({title: _('Set up again'), subtitle: _('Choose providers and review the bar and notifications.'), activatable: true});
    setupRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    setupRow.connect('activated', setup);
    group.add(setupRow);

    const restore = new Adw.ActionRow({
        title: _('Restore defaults'),
        subtitle: _('Appearance, top bar, popup and notifications. Your accounts and tracked providers are not changed.'),
    });
    // Recoverable and confirmed by a dialog, so the button is quiet; the dialog carries the warning.
    const button = new Gtk.Button({label: _('Restore…'), valign: Gtk.Align.CENTER});
    button.connect('clicked', () => confirmRestore({window, settings, gettext: _}));
    restore.add_suffix(button);
    group.add(restore);
    return group;
}

function confirmRestore({window, settings, gettext: _}) {
    const dialog = new Adw.AlertDialog({
        heading: _('Restore the default settings?'),
        body: _('Appearance, theme, top bar, popup, notification and data source settings go back to their defaults. Your accounts are not changed, and providers you stopped tracking stay stopped.'),
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
