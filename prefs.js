import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {DEFAULT_THEME, scanThemes} from './lib/services/themeFiles.js';
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
        ], _('Compact mode'), _('Drops the percent sign and the window suffix.'), handlerIds);
        bar.add(compact);

        page.add(bar);

        const look = new Adw.PreferencesGroup({title: _('Appearance')});
        const scheme = choiceRow(settings, 'color-scheme', [
            ['system', _('Follow the system')],
            ['light', _('Light')],
            ['dark', _('Dark')],
        ], _('Light or dark'), _('Applies to the popup. The top bar always stays dark.'), handlerIds);
        look.add(scheme);

        const {themes, rejected} = scanThemes(this.path);
        const choices = themes.map(({id, name}) => [id, id === DEFAULT_THEME ? _('System (GNOME)') : name]);
        const current = settings.get_string('theme');
        // A saved theme that no longer loads must not be shown as another one.
        if (!choices.some(([id]) => id === current))
            choices.push([current, _('%s (unavailable)').format(current)]);
        look.add(choiceRow(settings, 'theme', choices, _('Theme'),
            _('Each theme has a light and a dark variant.'),
            handlerIds));

        const folder = GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-ai-quota', 'themes']);
        const folderRow = new Adw.ActionRow({
            title: _('Your themes'),
            subtitle: _('One folder per theme, with a theme.json inside: %s').format(folder),
        });
        const open = new Gtk.Button({
            label: _('Open folder'),
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Open the themes folder'),
        });
        open.connect('clicked', () => {
            GLib.mkdir_with_parents(folder, 0o755);
            Gio.AppInfo.launch_default_for_uri(`file://${folder}`, null);
        });
        folderRow.add_suffix(open);
        look.add(folderRow);

        if (rejected.length > 0) {
            const problems = new Adw.ExpanderRow({
                title: _('Some themes could not be loaded'),
                icon_name: 'dialog-warning-symbolic',
            });
            for (const {id, problem} of rejected) {
                // Show the reason, never the full path.
                problems.add_row(new Adw.ActionRow({title: id, subtitle: problem.replace(/^.*theme\.json: /, '')}));
            }
            look.add(problems);
        }
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
        ], _('Time until reset'), _('How the countdown to a reset is written.'), handlerIds);
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
