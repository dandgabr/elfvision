// The Accounts page of the preferences window, generated from the provider
// registry (docs/adr/0009). It runs in the preferences process, so it may use
// Adw and Gtk; nothing here is imported by the shell.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {KEY_PATTERN} from '../providers/commandCode.js';
import {availableProviders} from '../providers/registry.js';
import {API_KEY, clearSecret, lookupSecret, storeSecret} from '../services/secrets.js';

/**
 * @param {object} context
 * @param {Adw.PreferencesWindow} context.window
 * @param {Gio.Settings} context.settings
 * @param {(msgid: string) => string} context.gettext
 * @param {number[]} context.handlerIds - receives settings handlers, disconnected on close
 * @returns {Adw.PreferencesPage}
 */
export function buildAccountsPage({window, settings, gettext: _, handlerIds}) {
    const page = new Adw.PreferencesPage({title: _('Accounts'), icon_name: 'avatar-default-symbolic'});
    for (const meta of availableProviders()) {
        if (meta.auth === 'api-key')
            page.add(apiKeyGroup({meta, window, settings, _, handlerIds}));
    }
    return page;
}

/** A provider that signs in with a key: status, key entry, where to get one. */
function apiKeyGroup({meta, window, settings, _, handlerIds}) {
    const group = new Adw.PreferencesGroup({
        title: meta.name,
        description: _('The key is kept in the system keyring and sent only to %s.').format(meta.apiHosts[0]),
    });
    const status = new Adw.ActionRow({title: _('Status'), subtitle: _('Checking the keyring…')});
    const remove = new Gtk.Button({
        label: _('Remove key'),
        tooltip_text: _('Remove the %s key').format(meta.name),
        valign: Gtk.Align.CENTER,
        css_classes: ['destructive-action'],
        visible: false,
    });
    status.add_suffix(remove);
    const entry = new Adw.PasswordEntryRow({title: _('API key'), show_apply_button: true});
    group.add(status);
    group.add(entry);

    // The page that creates keys may live under the user's own name on the site.
    if (meta.keyLink) {
        for (const row of keyLinkRows({meta, settings, _}))
            group.add(row);
    }

    let hasKey = null;       // null until the keyring answered
    let keyringDown = false;
    const showStatus = () => {
        if (keyringDown) {
            status.subtitle = _('No keyring found. Unlock it in Passwords and Keys, or install a Secret Service provider.');
            return;
        }
        if (!hasKey) {
            status.subtitle = _('No key yet. Paste one below.');
            return;
        }
        const result = settings.get_value('account-status').deepUnpack()[meta.id];
        status.subtitle = {
            ok: _('Key accepted.'),
            rejected: _('The server rejected this key.'),
            keyring: _('Key saved. The keyring is locked, so it was not checked.'),
            unreachable: _('Key saved. Could not reach the server.'),
            changed: _('Key saved. The service replied in an unexpected way.'),
        }[result] ?? _('Key saved. Not checked yet.');
    };

    // The running extension watches this number and asks the provider again.
    const announce = () => {
        settings.set_int('credentials-revision', (settings.get_int('credentials-revision') + 1) % 2147483647);
        Gio.Settings.sync();
    };
    const refresh = () => lookupSecret(meta.id, API_KEY).then(key => {
        hasKey = !!key;
        keyringDown = false;
    }).catch(() => {
        hasKey = false;
        keyringDown = true;
    }).finally(() => {
        remove.visible = !!hasKey;
        entry.sensitive = !keyringDown;
        showStatus();
    });
    handlerIds.push(settings.connect('changed::account-status', showStatus));

    entry.connect('apply', () => {
        const key = entry.text.trim();
        if (!KEY_PATTERN.test(key)) {
            entry.add_css_class('error');
            window.add_toast(new Adw.Toast({title: _('That does not look like an API key.')}));
            return;
        }
        entry.remove_css_class('error');
        entry.sensitive = false;
        storeSecret(meta.id, API_KEY, key, `${meta.name} API key`).then(() => {
            entry.text = '';
            window.add_toast(new Adw.Toast({title: _('Key saved. Checking…')}));
            try {
                announce();
            } catch (_error) {
                // The key is stored; the extension asks again on its next poll.
            }
        }).catch(() => {
            window.add_toast(new Adw.Toast({title: _('The keyring did not accept the key.')}));
        }).finally(() => {
            entry.sensitive = true;
            entry.grab_focus();
            refresh();
        });
    });
    entry.connect('changed', () => entry.remove_css_class('error'));

    remove.connect('clicked', () => {
        const dialog = new Adw.AlertDialog({
            heading: _('Remove the %s key?').format(meta.name),
            body: _('It is deleted from the keyring. The key stays valid on the %s site.').format(meta.name),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('remove', _('Remove'));
        dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            if (response !== 'remove')
                return;
            clearSecret(meta.id, API_KEY).then(announce).catch(() => {
                window.add_toast(new Adw.Toast({title: _('The keyring is not available.')}));
            }).finally(refresh);
        });
        dialog.present(window);
    });

    refresh().then(() => {
        if (!hasKey && !keyringDown)
            entry.grab_focus();
    });
    return group;
}

/** The account-name field and the link to the page that creates keys. */
function keyLinkRows({meta, settings, _}) {
    const {urlTemplate, usernameSetting} = meta.keyLink;
    const username = new Adw.EntryRow({title: _('Your %s username').format(meta.name)});
    username.text = settings.get_string(usernameSetting) || GLib.get_user_name();
    const link = new Adw.ActionRow({
        title: _('Where do I get a key?'),
        subtitle: _('Opens your keys page. Enter your %s username above first.').format(meta.name),
        activatable: true,
    });
    link.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
    const validName = () => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(username.text.trim());
    const syncLink = () => {
        link.sensitive = validName();
        if (username.text.trim() && !validName())
            username.add_css_class('error');
        else
            username.remove_css_class('error');
    };
    username.connect('changed', () => {
        syncLink();
        if (validName())
            settings.set_string(usernameSetting, username.text.trim());
    });
    syncLink();
    link.connect('activated', () => {
        if (!validName())
            return;
        const user = GLib.uri_escape_string(username.text.trim(), null, false);
        Gio.AppInfo.launch_default_for_uri(urlTemplate.replace('{user}', user), null);
    });
    return [username, link];
}
