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
import {providerIdForConnector} from '../core/connectors.js';

export class AlertNotifier {
    /**
     * @param {object} options
     * @param {object} options.extension - for gettext and the path of the icons
     * @param {object} options.settings - the extension's Gio.Settings
     * @param {() => void} options.openPopup - what the "Open" action does
     * @param {(providerId: string) => void} options.openPreferences - what "Reconnect" does
     */
    constructor({extension, settings, openPopup, openPreferences}) {
        this._extension = extension;
        this._settings = settings;
        this._openPopup = openPopup;
        this._openPreferences = openPreferences;
        this._source = null;
        this._sourceDestroyedId = 0;
        this._notifications = new Map();
        this._icons = new Map();
        this._destroyed = false;
        this._t = {
            gettext: s => extension.gettext(s),
            ngettext: (singular, plural, n) => extension.ngettext(singular, plural, n),
            pgettext: (context, s) => extension.pgettext(context, s),
        };
    }

    /** @param {object} event - from the alert service */
    show(event) {
        if (this._destroyed)
            return;   // a late event after disable() must not bring a source back
        const {title, body} = alertText(event, {
            providerName: id => providerMeta(providerIdForConnector(id))?.name ?? null,
            t: this._t,
            resetStyle: this._settings.get_string('reset-format'),
        });
        const key = `${event.kind}:${event.providerId ?? ''}`;
        // A new notification replaces the old one of the same kind instead of stacking. The
        // identity check in the destroy handler below keeps this independent of the order.
        this._notifications.get(key)?.destroy();

        const notification = new MessageTray.Notification({
            source: this._ensureSource(),
            title,
            body,
            useBodyMarkup: false,   // the text is shown as typed
            gicon: this._iconFor(event.providerId ?? 'generic'),
            urgency: event.level === 'critical' ? MessageTray.Urgency.HIGH : MessageTray.Urgency.NORMAL,
            // The shell hides what a USER-scope notification says on a locked screen. The extension
            // is switched off while the screen is locked (see docs/adr/0010), so this is a second
            // layer rather than the only one.
            privacyScope: MessageTray.PrivacyScope.USER,
        });
        // A sign-in problem is solved in Preferences; anything else is a look at the popup.
        if (event.kind === 'connection' && event.cause === 'auth')
            notification.addAction(this._t.gettext('Reconnect'), () => this._whenUnlocked(() => this._openPreferences(event.providerId)));
        else
            notification.addAction(this._t.gettext('Open'), () => this._whenUnlocked(() => this._openPopup()));
        notification.connect('destroy', () => {
            if (this._notifications.get(key) === notification)
                this._notifications.delete(key);
        });
        this._notifications.set(key, notification);
        this._source.addNotification(notification);
    }

    destroy() {
        this._destroyed = true;
        this._notifications.clear();
        this._dropSource();
    }

    /** An action must not open windows over a locked screen. */
    _whenUnlocked(action) {
        if (!Main.sessionMode.isLocked)
            action();
    }

    _ensureSource() {
        if (!this._source) {
            this._source = new MessageTray.Source({
                title: this._t.gettext('AI quota'),
                icon: this._iconFor('generic'),
            });
            const source = this._source;
            this._sourceDestroyedId = source.connect('destroy', () => {
                if (this._source === source) {
                    this._source = null;
                    this._sourceDestroyedId = 0;
                    this._notifications.clear();
                }
            });
            Main.messageTray.add(source);
        }
        return this._source;
    }

    _dropSource() {
        const source = this._source;
        this._source = null;
        if (!source)
            return;
        if (this._sourceDestroyedId)
            source.disconnect(this._sourceDestroyedId);
        this._sourceDestroyedId = 0;
        source.destroy();   // takes its notifications with it
    }

    /** The provider's icon, or the generic one; looked up once per name. */
    _iconFor(name) {
        name = providerIdForConnector(name) ?? name;
        if (name !== 'generic' && !providerMeta(name))
            return this._iconFor('generic');
        if (!this._icons.has(name)) {
            const file = Gio.File.new_for_path(`${this._extension.path}/icons/${name}-symbolic.svg`);
            this._icons.set(name, file.query_exists(null) ? new Gio.FileIcon({file}) : null);
        }
        return this._icons.get(name);
    }
}
