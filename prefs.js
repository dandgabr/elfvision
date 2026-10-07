import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * A combo row backed by a string setting whose values are `choices`.
 *
 * @param {Gio.Settings} settings
 * @param {string} key
 * @param {Array<[string, string]>} choices - [value, label] pairs
 * @param {string} title
 * @param {string} subtitle
 * @returns {{row: Adw.ComboRow, sync: Function}} the row and a function that re-reads the setting
 */
function choiceRow(settings, key, choices, title, subtitle) {
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: Gtk.StringList.new(choices.map(([, label]) => label)),
    });
    const sync = () => {
        const index = choices.findIndex(([value]) => value === settings.get_string(key));
        if (index >= 0 && row.selected !== index)
            row.selected = index;
    };
    sync();
    row.connect('notify::selected', () => {
        const choice = choices[row.selected];
        if (choice)
            settings.set_string(key, choice[0]);
    });
    return {row, sync};
}

export default class GnomeAiQuotaPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const _ = this.gettext.bind(this);

        const page = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'preferences-desktop-appearance-symbolic',
        });

        const bar = new Adw.PreferencesGroup({
            title: _('Top bar'),
            description: _('The bar shrinks, then shows fewer providers, when other extensions leave it little room.'),
        });
        const position = choiceRow(settings, 'position', [
            ['left', _('Left')],
            ['center', _('Center')],
            ['right', _('Right')],
        ], _('Position'), _('Where the quota items sit on the top bar.'));
        bar.add(position.row);

        const count = new Adw.SpinRow({
            title: _('Providers on the bar'),
            subtitle: _('The most providers shown, from 1 to 5.'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 5, step_increment: 1, page_increment: 1}),
        });
        settings.bind('bar-count', count, 'value', 0);
        bar.add(count);

        const compact = choiceRow(settings, 'compact-mode', [
            ['auto', _('Automatic')],
            ['always', _('Always compact')],
            ['never', _('Never compact')],
        ], _('Compact mode'), _('Compact drops the percent sign and the window suffix.'));
        bar.add(compact.row);

        // Follow outside changes (dconf, another window) while this window is open.
        const ids = ['position', 'compact-mode'].map((key, i) =>
            settings.connect(`changed::${key}`, [position, compact][i].sync));
        window.connect('close-request', () => {
            ids.forEach(id => settings.disconnect(id));
            return false;
        });
        page.add(bar);

        const demo = new Adw.PreferencesGroup({
            title: _('Demo build'),
            description: _('More settings arrive in later milestones. This build shows demo data.'),
        });
        page.add(demo);
        window.add(page);
    }
}
