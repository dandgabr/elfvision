import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnomeAiQuotaPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage({
            title: this.gettext('Appearance'),
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: this.gettext('Demo build'),
            description: this.gettext('Settings arrive in later milestones. This build shows demo data.'),
        });
        page.add(group);
        window.add(page);
    }
}
