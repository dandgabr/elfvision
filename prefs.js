import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {listThemes} from './lib/services/themeFiles.js';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * A combo row backed by a string setting whose values are `choices`.
 *
 * @param {Gio.Settings} settings
 * @param {string} key
 * @param {Array<[string, string]>} choices - [value, label] pairs
 * @param {string} title
 * @param {string} subtitle
 * @param {number[]} handlerIds - receives the id of the `changed` handler, so the
 *   caller can disconnect it when the window closes
 * @returns {Adw.ComboRow}
 */
function choiceRow(settings, key, choices, title, subtitle, handlerIds) {
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
    // Follow outside changes (dconf, another window) while this window is open.
    handlerIds.push(settings.connect(`changed::${key}`, sync));
    return row;
}

export default class GnomeAiQuotaPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const _ = this.gettext.bind(this);
        const handlerIds = [];
        window.connect('close-request', () => {
            handlerIds.forEach(id => settings.disconnect(id));
            return false;
        });

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
        ], _('Position'), _('Where the quota items sit on the top bar.'), handlerIds);
        bar.add(position);

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
        ], _('Compact mode'), _('Compact drops the percent sign and the window suffix.'), handlerIds);
        bar.add(compact);

        page.add(bar);

        const look = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('The theme styles the popup and the top bar. Your own themes go in ~/.local/share/gnome-ai-quota/themes.'),
        });
        const themes = choiceRow(settings, 'theme',
            listThemes(this.path).map(({id, name}) => [id, name]),
            _('Theme'), _('How the popup looks. Every theme has a light and a dark variant.'), handlerIds);
        look.add(themes);
        const scheme = choiceRow(settings, 'color-scheme', [
            ['system', _('Follow the system')],
            ['light', _('Light')],
            ['dark', _('Dark')],
        ], _('Light or dark'), _('Follow the GNOME setting, or force one.'), handlerIds);
        look.add(scheme);
        page.add(look);

        const popup = new Adw.PreferencesGroup({title: _('Popup')});
        const clock = new Adw.SwitchRow({
            title: _('24-hour clock'),
            subtitle: _('Show reset times on a 24-hour clock.'),
        });
        settings.bind('clock-24h', clock, 'active', 0);
        popup.add(clock);
        const reset = choiceRow(settings, 'reset-format', [
            ['long', _('1h 20min')],
            ['short', _('1h20')],
        ], _('Time until reset'), _('How long until a quota resets is written.'), handlerIds);
        popup.add(reset);
        const autoOpen = new Adw.SwitchRow({
            title: _('Open cards that need attention'),
            subtitle: _('Cards in warning, critical or error states open on their own.'),
        });
        settings.bind('auto-open', autoOpen, 'active', 0);
        popup.add(autoOpen);
        page.add(popup);

        const demo = new Adw.PreferencesGroup({
            title: _('Demo build'),
            description: _('More settings arrive in later milestones. This build shows demo data.'),
        });
        page.add(demo);
        window.add(page);
    }
}
