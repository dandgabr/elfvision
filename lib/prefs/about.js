// "About" and "Restore defaults" (docs/adr/0010), the last group of the General page.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {keysToReset} from '../core/defaults.js';

// Fixed addresses, opened only through the desktop's launcher.
const WEBSITE = 'https://github.com/dandgabr/gnome-ai-quota';
const ISSUES = 'https://github.com/dandgabr/gnome-ai-quota/issues';

/**
 * @param {object} options
 * @param {Adw.PreferencesWindow} options.window
 * @param {Gio.Settings} options.settings
 * @param {(s: string) => string} options.gettext
 * @param {string} options.version - from metadata.json
 * @returns {Adw.PreferencesGroup}
 */
export function buildAboutGroup({window, settings, gettext: _, version}) {
    const group = new Adw.PreferencesGroup();

    const about = new Adw.ActionRow({title: _('About'), subtitle: version, activatable: true});
    about.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    about.connect('activated', () => {
        const dialog = new Adw.AboutDialog({
            application_name: _('AI Quota'),
            application_icon: 'utilities-system-monitor-symbolic',
            developer_name: 'dandgabr',
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

    const restore = new Adw.ActionRow({
        title: _('Restore defaults'),
        subtitle: _('Appearance, the top bar, the popup and the notifications. Your accounts are not touched.'),
    });
    const button = new Gtk.Button({label: _('Restore…'), valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
    button.connect('clicked', () => confirmRestore({window, settings, gettext: _}));
    restore.add_suffix(button);
    group.add(restore);
    return group;
}

function confirmRestore({window, settings, gettext: _}) {
    const dialog = new Adw.AlertDialog({
        heading: _('Restore the default settings?'),
        body: _('The top bar, the popup, the theme and the notifications go back to how they were at first. Your accounts stay connected, and providers you stopped tracking stay stopped.'),
    });
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('restore', _('Restore'));
    dialog.set_response_appearance('restore', Adw.ResponseAppearance.DESTRUCTIVE);
    dialog.set_default_response('cancel');
    dialog.set_close_response('cancel');
    dialog.connect('response', (_dialog, response) => {
        if (response === 'restore')
            restoreDefaults(settings);
    });
    dialog.present(window);
}

/** Put the settings listed in lib/core/defaults.js back to their defaults. */
export function restoreDefaults(settings) {
    for (const key of keysToReset(settings.list_keys()))
        settings.reset(key);
    Gio.Settings.sync();
}
