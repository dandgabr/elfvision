// Shows alert events as system notifications (docs/adr/0010). The words come from
// lib/core/alertText.js, which prints only fixed, translated templates, so nothing a provider sent
// reaches a notification. Notifications come from a source of our own, so the shell groups them
// under the extension, and one notification stands for each provider and kind: a new one replaces
// the old instead of stacking.

import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {alertText} from '../core/alertText.js';
import {providerMeta} from '../providers/registry.js';

export class AlertNotifier {
    /**
     * @param {object} options
     * @param {object} options.extension - for gettext and the path of the icons
     * @param {object} options.settings - the extension's Gio.Settings
     * @param {() => void} options.openPopup - what the "Open" action does
     */
    constructor({extension, settings, openPopup}) {
        this._extension = extension;
        this._settings = settings;
        this._openPopup = openPopup;
        this._source = null;
        this._notifications = new Map();
        this._t = {
            gettext: s => extension.gettext(s),
            ngettext: (singular, plural, n) => extension.ngettext(singular, plural, n),
            pgettext: (context, s) => extension.pgettext(context, s),
        };
    }

    /** @param {object} event - from the alert service */
    show(event) {
        const {title, body} = alertText(event, {
            providerName: id => providerMeta(id)?.name ?? null,
            t: this._t,
            resetStyle: this._settings.get_string('reset-format'),
        });
        const key = `${event.kind}:${event.providerId ?? ''}`;
        // A new notification replaces the old one of the same kind instead of stacking.
        this._notifications.get(key)?.destroy();

        const notification = new MessageTray.Notification({
            source: this._ensureSource(),
            title,
            body,
            gicon: this._iconFor(event.providerId),
            urgency: event.level === 'critical' ? MessageTray.Urgency.HIGH : MessageTray.Urgency.NORMAL,
            // The shell hides what a USER-scope notification says while the screen is locked.
            privacyScope: this._settings.get_boolean('notify-details-on-lock')
                ? MessageTray.PrivacyScope.SYSTEM : MessageTray.PrivacyScope.USER,
        });
        notification.addAction(this._t.gettext('Open'), () => this._openPopup());
        notification.connect('destroy', () => {
            if (this._notifications.get(key) === notification)
                this._notifications.delete(key);
        });
        this._notifications.set(key, notification);
        this._source.addNotification(notification);
    }

    destroy() {
        this._notifications.clear();
        this._source?.destroy();   // takes its notifications with it
        this._source = null;
    }

    _ensureSource() {
        if (!this._source) {
            this._source = new MessageTray.Source({
                title: this._t.gettext('AI quota'),
                iconName: 'dialog-information-symbolic',
            });
            this._source.connect('destroy', () => {
                this._source = null;
                this._notifications.clear();
            });
            Main.messageTray.add(this._source);
        }
        return this._source;
    }

    _iconFor(providerId) {
        if (!providerMeta(providerId))
            return null;
        const file = Gio.File.new_for_path(`${this._extension.path}/icons/${providerId}-symbolic.svg`);
        return file.query_exists(null) ? new Gio.FileIcon({file}) : null;
    }
}
