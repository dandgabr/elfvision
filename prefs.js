import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {DEFAULT_THEME, scanThemes} from './lib/services/themeFiles.js';
import {buildAboutGroup} from './lib/prefs/about.js';
import {buildAccountsPage} from './lib/prefs/accounts.js';
import {buildNotificationsPage} from './lib/prefs/notifications.js';
import {builtinCatalog} from './lib/prefs/themeCatalog.js';
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
        // Only a change made here is written: following a reset must not give the key a user value.
        if (choice && settings.get_string(key) !== choice[0])
            settings.set_string(key, choice[0]);
    });
    // Follow outside changes (dconf, another window) while this window is open.
    handlerIds.push(settings.connect(`changed::${key}`, sync));
    return row;
}

/** A strip of four colors that sketches a theme. */
function swatchStrip(colors, label) {
    const area = new Gtk.DrawingArea({content_width: 76, content_height: 28, valign: Gtk.Align.CENTER});
    const outline = (cr, width, height, inset) => {
        const radius = 6 - inset;
        cr.newSubPath();
        cr.arc(width - 6, 6, radius, -Math.PI / 2, 0);
        cr.arc(width - 6, height - 6, radius, 0, Math.PI / 2);
        cr.arc(6, height - 6, radius, Math.PI / 2, Math.PI);
        cr.arc(6, 6, radius, Math.PI, 3 * Math.PI / 2);
        cr.closePath();
    };
    area.set_draw_func((drawing, cr, width, height) => {
        outline(cr, width, height, 0);
        cr.clip();
        colors.forEach((hex, index) => {
            const color = new Gdk.RGBA();
            color.parse(hex);
            cr.setSourceRGBA(color.red, color.green, color.blue, 1);
            cr.rectangle(index * width / colors.length, 0, width / colors.length + 1, height);
            cr.fill();
        });
        // A thin edge keeps a strip close to the window color visible, light or dark.
        cr.resetClip();
        outline(cr, width, height, 0.5);
        const edge = Adw.StyleManager.get_default().dark ? 1 : 0;
        cr.setSourceRGBA(edge, edge, edge, edge ? 0.4 : 0.22);
        cr.setLineWidth(1);
        cr.stroke();
        cr.$dispose();
    });
    area.update_property([Gtk.AccessibleProperty.LABEL], [label]);
    return area;
}

/** An expander that lists theme folders that could not be loaded, or null. */
function rejectedRow(rejected, _) {
    if (rejected.length === 0)
        return null;
    const row = new Adw.ExpanderRow({
        title: _('Some themes could not be loaded'),
        icon_name: 'dialog-warning-symbolic',
    });
    for (const {id, problem} of rejected) {
        // Show the reason, never the full path.
        row.add_row(new Adw.ActionRow({
            title: GLib.markup_escape_text(id, -1),
            subtitle: GLib.markup_escape_text(problem.replace(/^.*theme\.json: /, ''), -1),
        }));
    }
    return row;
}

export default class GnomeAiQuotaPreferences extends ExtensionPreferences {
    /** The theme picker: grouped rows with a color sketch of each theme. */
    _themePage(window, settings, _) {
        const {themes, rejected} = scanThemes(this.path);
        const catalog = builtinCatalog(_);
        const dark = (() => {
            const choice = settings.get_string('color-scheme');
            return choice === 'dark' || (choice === 'system' && Adw.StyleManager.get_default().dark);
        })();
        const current = settings.get_string('theme');

        const titles = [_('System'), ...catalog.groups, _('Your themes')];
        const groups = new Map(titles.map(title => [title, new Adw.PreferencesGroup({title})]));
        const used = new Set();
        for (const theme of themes) {
            const info = theme.builtin ? catalog.byId[theme.id] : null;
            const system = theme.id === DEFAULT_THEME;
            const groupTitle = system ? titles[0] : (info?.group ?? titles[titles.length - 1]);
            const name = system ? _('System (GNOME)') : theme.name;
            const row = new Adw.ActionRow({
                title: GLib.markup_escape_text(name, -1),
                subtitle: GLib.markup_escape_text(system
                    ? _('Follows the GNOME accent color and the light or dark setting.')
                    : (info?.description ?? theme.description), -1),
                activatable: true,
            });
            row.add_prefix(swatchStrip(theme.swatches[dark ? 'dark' : 'light'], name));
            if (theme.id === current)
                row.add_suffix(new Gtk.Image({icon_name: 'object-select-symbolic', valign: Gtk.Align.CENTER}));
            row.connect('activated', () => {
                settings.set_string('theme', theme.id);
                window.pop_subpage();
            });
            groups.get(groupTitle)?.add(row);
            used.add(groupTitle);
        }

        const content = new Adw.PreferencesPage();
        const problems = rejectedRow(rejected, _);
        if (problems) {
            const warning = new Adw.PreferencesGroup();
            warning.add(problems);
            content.add(warning);
        }
        for (const title of titles) {
            if (used.has(title))
                content.add(groups.get(title));
        }
        const toolbar = new Adw.ToolbarView();
        toolbar.add_top_bar(new Adw.HeaderBar());
        toolbar.set_content(content);
        return new Adw.NavigationPage({title: _('Theme'), child: toolbar});
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const _ = this.gettext.bind(this);
        const handlerIds = [];
        window.connect('close-request', () => {
            handlerIds.forEach(id => settings.disconnect(id));
            return false;
        });

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });

        const bar = new Adw.PreferencesGroup({title: _('Top bar')});
        const position = choiceRow(settings, 'position', [
            ['left', _('Left')],
            ['center', _('Center')],
            ['right', _('Right')],
        ], _('Position'), _('Where the quota items sit on the top bar.'), handlerIds);
        bar.add(position);

        const count = new Adw.SpinRow({
            title: _('Providers on the bar'),
            subtitle: _('Up to this many providers are shown (1 to 5), most critical first.'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 5, step_increment: 1, page_increment: 1}),
        });
        settings.bind('bar-count', count, 'value', 0);
        bar.add(count);

        const compact = choiceRow(settings, 'compact-mode', [
            ['auto', _('Automatic')],
            ['always', _('Always compact')],
            ['never', _('Never compact')],
        ], _('Compact mode'), _('Automatic: only when space runs out. Always: drops the % sign and the window suffix. Never: hides providers instead.'), handlerIds);
        bar.add(compact);

        page.add(bar);

        const look = new Adw.PreferencesGroup({title: _('Colors and theme')});
        const scheme = choiceRow(settings, 'color-scheme', [
            ['system', _('Follow the system')],
            ['light', _('Light')],
            ['dark', _('Dark')],
        ], _('Light or dark'), _('Applies to the popup. The top bar always stays dark.'), handlerIds);
        look.add(scheme);

        const themeName = (themes, id) => {
            if (id === DEFAULT_THEME)
                return _('System (GNOME)');
            return themes.find(theme => theme.id === id)?.name ?? _('%s (unavailable)').format(id);
        };
        const {themes: firstScan, rejected: firstRejected} = scanThemes(this.path);
        const themeRow = new Adw.ActionRow({
            title: _('Theme'),
            subtitle: _('Each theme has a light and a dark variant.'),
            activatable: true,
        });
        const themeLabel = new Gtk.Label({
            label: themeName(firstScan, settings.get_string('theme')),
            css_classes: ['dim-label'],
            ellipsize: 3,
            valign: Gtk.Align.CENTER,
        });
        themeRow.add_suffix(themeLabel);
        themeRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
        themeRow.connect('activated', () => window.push_subpage(this._themePage(window, settings, _)));
        handlerIds.push(settings.connect('changed::theme', () => {
            themeLabel.label = themeName(scanThemes(this.path).themes, settings.get_string('theme'));
        }));
        look.add(themeRow);

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
            Gio.AppInfo.launch_default_for_uri(GLib.filename_to_uri(folder, null), null);
        });
        folderRow.add_suffix(open);
        look.add(folderRow);

        const problems = rejectedRow(firstRejected, _);
        if (problems)
            look.add(problems);
        page.add(look);

        const popup = new Adw.PreferencesGroup({title: _('Popup')});
        const clock = choiceRow(settings, 'clock-format', [
            ['system', _('Follow the system')],
            ['12h', _('12 hours')],
            ['24h', _('24 hours')],
        ], _('Clock'), _('How reset times are written.'), handlerIds);
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

        const advanced = new Adw.PreferencesGroup();
        const expander = new Adw.ExpanderRow({
            title: _('Advanced'),
            subtitle: _('Demo data, to try every state without an account.'),
        });
        const source = choiceRow(settings, 'data-source', [
            ['live', _('Real providers')],
            ['demo', _('Demo data (made up)')],
        ], _('Data source'), _('Demo data queries no account.'), handlerIds);
        const scenario = choiceRow(settings, 'demo-scenario', [
            ['steady', _('Steady')],
            ['flaky', _('Flaky')],
            ['drifting', _('Drifting')],
        ].map(([value, label]) => [value === 'drifting' ? 'drift' : value, label]),
        _('Demo scenario'), _('Steady: all fine. Flaky: errors come and go. Drifting: usage climbs.'), handlerIds);
        const syncScenario = () => {
            scenario.sensitive = settings.get_string('data-source') === 'demo';
        };
        syncScenario();
        handlerIds.push(settings.connect('changed::data-source', syncScenario));
        expander.add_row(source);
        expander.add_row(scenario);
        advanced.add(expander);
        page.add(advanced);
        page.add(buildAboutGroup({window, settings, gettext: _, version: this.metadata['version-name'] ?? '', extensionPath: this.path}));
        window.add(buildAccountsPage({window, settings, gettext: _, handlerIds, extensionPath: this.path}));
        window.add(page);
        window.add(buildNotificationsPage({settings, gettext: _, handlerIds}));
    }
}
