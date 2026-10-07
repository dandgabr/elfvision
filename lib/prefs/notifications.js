// The Notifications page of the preferences window (docs/adr/0010): a master switch, a switch and
// a threshold for each kind of quota, and the connection alert. The settings are read live by the
// shell, so nothing here needs to tell it anything.

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

// The rows below follow the master switch from the start, not only when it changes.
const FOLLOW = GObject.BindingFlags.SYNC_CREATE;

// The texts are written out where they are translated, so the extraction can find them.
const quotas = _ => [
    ['session', _('5-hour window'), _('A quota that resets every five hours.')],
    ['week', _('Weekly window'), _('A quota that resets every week.')],
    ['month', _('Monthly window'), _('A quota that resets every month.')],
    ['credits', _('Credits'), _('A money balance with a budget, shown as the share of it already spent.')],
];

/**
 * @param {object} options
 * @param {Gio.Settings} options.settings
 * @param {(s: string) => string} options.gettext
 * @returns {Adw.PreferencesPage}
 */
export function buildNotificationsPage({settings, gettext: _}) {
    const page = new Adw.PreferencesPage({
        title: _('Notifications'),
        icon_name: 'preferences-system-notifications-symbolic',
    });

    const main = new Adw.PreferencesGroup({
        title: _('Notifications'),
        description: _('A notification is sent once when a quota reaches its threshold, and again only after it falls a little below it or resets. The bar and the popup always show the state.'),
    });
    const enabled = new Adw.SwitchRow({
        title: _('Send notifications'),
        subtitle: _('Turning this off keeps the bar and the popup as they are.'),
    });
    settings.bind('notifications-enabled', enabled, 'active', 0);
    main.add(enabled);
    page.add(main);

    const quotaGroup = new Adw.PreferencesGroup({
        title: _('Quotas'),
        description: _('Choose which kinds of quota notify and at what used percentage.'),
    });
    for (const [kind, title, subtitle] of quotas(_)) {
        const row = new Adw.ExpanderRow({title, subtitle, show_enable_switch: true});
        settings.bind(`alert-${kind}-enabled`, row, 'enable-expansion', 0);
        const percent = new Adw.SpinRow({
            title: _('Notify at'),
            subtitle: _('Used percentage'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1, page_increment: 5}),
        });
        settings.bind(`alert-${kind}-percent`, percent, 'value', 0);
        row.add_row(percent);
        quotaGroup.add(row);
        enabled.bind_property('active', row, 'sensitive', FOLLOW);
    }
    page.add(quotaGroup);

    const connection = new Adw.PreferencesGroup({title: _('Connection')});
    const alert = new Adw.SwitchRow({
        title: _('Notify about connection problems'),
        subtitle: _('Once, when an account has been rejected or has gone without data for a while. Providers you stopped tracking never notify.'),
    });
    settings.bind('alert-connection', alert, 'active', 0);
    enabled.bind_property('active', alert, 'sensitive', FOLLOW);
    connection.add(alert);
    page.add(connection);

    return page;
}
