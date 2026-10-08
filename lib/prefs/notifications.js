// The Notifications page of the preferences window (docs/adr/0010): a master switch and a test
// button, a switch and a threshold for each kind of quota, and the connection alert. The settings
// are read live by the shell, so nothing here needs to tell it anything except the test button,
// which raises a number the shell listens to.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {validThresholdPair} from '../core/alerts.js';
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
        description: _('Warning and critical notices each rearm after usage falls 3 points below their threshold or the quota resets. A jump over both sends only critical.'),
    });
    for (const [kind, title] of quotas(_)) {
        const row = new Adw.ExpanderRow({title, show_enable_switch: true});
        settings.bind(`alert-${kind}-enabled`, row, 'enable-expansion', BIND);
        const criticalKey = `alert-${kind}-percent`;
        const warningKey = `alert-${kind}-warning-percent`;
        const warningEnabledKey = `alert-${kind}-warning-enabled`;
        const critical = new Adw.SpinRow({title: _('Critical threshold'), subtitle: _('Used percentage'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1, page_increment: 10})});
        const warningEnabled = new Adw.SwitchRow({title: _('Warning notification'),
            subtitle: _('Optional earlier notice before the critical threshold.')});
        const warning = new Adw.SpinRow({title: _('Warning threshold'), subtitle: _('Used percentage'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 99, step_increment: 1, page_increment: 10})});
        const error = new Adw.ActionRow({title: _('Warning must be lower than critical'), visible: false});
        row.add_row(critical); row.add_row(warningEnabled); row.add_row(warning); row.add_row(error);
        let syncing = false;
        const syncControls = () => {
            syncing = true;
            critical.value = settings.get_int(criticalKey);
            warning.value = settings.get_int(warningKey);
            warningEnabled.active = settings.get_boolean(warningEnabledKey);
            warning.sensitive = warningEnabled.active;
            error.visible = warningEnabled.active && !validThresholdPair(Math.round(warning.value), Math.round(critical.value));
            syncing = false;
        };
        const update = (key, value) => {
            if (syncing) return;
            // notify is non-recursive: rolling a SpinRow back can notify again
            // after syncControls returns. That unchanged value must not clear
            // the rejection feedback or write the saved setting again.
            const saved = key === warningEnabledKey ? settings.get_boolean(key) : settings.get_int(key);
            if (value === saved) return;
            const proposedCritical = key === criticalKey ? value : settings.get_int(criticalKey);
            const proposedWarning = key === warningKey ? value : settings.get_int(warningKey);
            const enabledWarning = key === warningEnabledKey ? value : settings.get_boolean(warningEnabledKey);
            if (enabledWarning && !validThresholdPair(proposedWarning, proposedCritical)) {
                syncControls();
                error.visible = true;
                return;
            }
            error.visible = false;
            if (key === warningEnabledKey) settings.set_boolean(key, value);
            else settings.set_int(key, value);
        };
        critical.connect('notify::value', () => update(criticalKey, Math.round(critical.value)));
        warning.connect('notify::value', () => update(warningKey, Math.round(warning.value)));
        warningEnabled.connect('notify::active', () => update(warningEnabledKey, warningEnabled.active));
        syncControls();
        for (const key of [criticalKey, warningKey, warningEnabledKey])
            handlerIds.push(settings.connect(`changed::${key}`, syncControls));
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
