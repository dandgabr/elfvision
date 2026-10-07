// The Notifications page of the preferences window (docs/adr/0010): a master switch and a test
// button, a switch and a threshold for each kind of quota, and the connection alert. The settings
// are read live by the shell, so nothing here needs to tell it anything except the test button,
// which raises a number the shell listens to.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {fmt} from '../core/viewmodel.js';

const BIND = Gio.SettingsBindFlags.DEFAULT;
// The rows below follow the master switch from the start, not only when it changes.
const FOLLOW = GObject.BindingFlags.SYNC_CREATE;

// The titles are written out where they are translated, so the extraction can find them.
const quotas = _ => [
    ['session', _('5-hour window')],
    ['week', _('Weekly window')],
    ['month', _('Monthly window')],
    ['credits', _('Credits')],
];

/**
 * @param {object} options
 * @param {Gio.Settings} options.settings
 * @param {(s: string) => string} options.gettext
 * @param {number[]} options.handlerIds - receives the ids of the `changed` handlers, so the caller
 *   can disconnect them when the window closes
 * @returns {Adw.PreferencesPage}
 */
export function buildNotificationsPage({settings, gettext: _, handlerIds}) {
    const page = new Adw.PreferencesPage({
        title: _('Notifications'),
        icon_name: 'preferences-system-notifications-symbolic',
    });

    const main = new Adw.PreferencesGroup();
    const enabled = new Adw.SwitchRow({
        title: _('Send notifications'),
        subtitle: _('Off: nothing is sent, connection alerts included. The bar and the popup do not change.'),
    });
    settings.bind('notifications-enabled', enabled, 'active', BIND);
    main.add(enabled);

    const test = new Adw.ActionRow({
        title: _('Send a test notification'),
        subtitle: _('Do Not Disturb holds the banner; the notification still waits in the list.'),
    });
    const send = new Gtk.Button({label: _('Send'), valign: Gtk.Align.CENTER});
    send.connect('clicked', () => settings.set_int('test-notification', (settings.get_int('test-notification') + 1) % 1000000));
    test.add_suffix(send);
    enabled.bind_property('active', test, 'sensitive', FOLLOW);
    main.add(test);
    page.add(main);

    const group = new Adw.PreferencesGroup({
        title: _('Quotas'),
        description: _('A notification is sent once when a quota reaches its threshold, and again only after it falls 3 points below it or resets.'),
    });
    for (const [kind, title] of quotas(_)) {
        const row = new Adw.ExpanderRow({title, show_enable_switch: true});
        settings.bind(`alert-${kind}-enabled`, row, 'enable-expansion', BIND);
        const percent = new Adw.SpinRow({
            title: _('Notify at'),
            subtitle: _('Used percentage'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1, page_increment: 10}),
        });
        settings.bind(`alert-${kind}-percent`, percent, 'value', BIND);
        row.add_row(percent);

        // The threshold is visible without opening the row, and the rows stay usable when the
        // master switch is off: they are only dimmed.
        const refresh = () => {
            row.subtitle = settings.get_boolean(`alert-${kind}-enabled`)
                ? fmt(_('Notifies at %d%% used'), settings.get_int(`alert-${kind}-percent`))
                : _('Off');
            if (settings.get_boolean('notifications-enabled'))
                row.remove_css_class('dim-label');
            else
                row.add_css_class('dim-label');
        };
        refresh();
        for (const key of [`alert-${kind}-enabled`, `alert-${kind}-percent`, 'notifications-enabled'])
            handlerIds.push(settings.connect(`changed::${key}`, refresh));
        group.add(row);
    }
    page.add(group);

    const connection = new Adw.PreferencesGroup({title: _('Connection')});
    const alert = new Adw.SwitchRow({
        title: _('Notify about connection problems'),
        subtitle: _('Once, when an account has been rejected for ten minutes, or has had no data for fifteen minutes or more. Providers you stopped tracking never notify.'),
    });
    settings.bind('alert-connection', alert, 'active', BIND);
    // The master switch silences this one too, so it is dimmed with the others (and stays usable).
    const dim = () => {
        if (settings.get_boolean('notifications-enabled'))
            alert.remove_css_class('dim-label');
        else
            alert.add_css_class('dim-label');
    };
    dim();
    handlerIds.push(settings.connect('changed::notifications-enabled', dim));
    connection.add(alert);
    page.add(connection);

    return page;
}
