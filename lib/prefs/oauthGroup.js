// The Accounts group of a provider that signs in with OAuth (docs/adr/0009): status,
// Connect, Cancel and Disconnect, the terms notice and the sign-in itself. It runs in
// the preferences process; the tokens go to the keyring and the shell renews them.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {startLogin} from '../oauth/flow.js';
import {randomBytes, sha256} from '../oauth/crypto.js';
import {createPkce, base64Url} from '../oauth/pkce.js';
import {formBody} from '../oauth/protocol.js';
import {decodeSecret, encodeSecret} from '../oauth/secret.js';
import {createHttp} from '../services/http.js';
import {localConfigPath, readLocalConfig} from '../services/localConfig.js';
import {OAUTH_TOKENS, clearSecret, lookupSecret, storeSecret} from '../services/secrets.js';

const LOGIN_SECONDS = 180;

/** The fixed reasons a sign-in did not finish, in words. */
function failureText(error, _, port) {
    switch (error?.code) {
    case 'port_busy':
        return _('Port %d is in use by another program. Close it and try again.').format(port);
    case 'timeout':
        return _('Sign-in timed out. Nothing was saved.');
    case 'denied':
        return _('Sign-in was cancelled. Nothing was saved.');
    case 'malformed':
    case 'state_mismatch':
    case 'no_code':
        return _('The sign-in reply was not valid. Nothing was saved.');
    case 'blocked_url':
        return _('The sign-in address was not allowed. Nothing was saved.');
    default:
        return error?.name === 'OAuthError'
            ? _('The provider did not accept the sign-in. Nothing was saved.')
            : _('Sign-in failed. Nothing was saved.');
    }
}

/**
 * @param {object} context
 * @param {import('../providers/registry.js').ProviderMeta} context.meta
 * @param {Adw.PreferencesWindow} context.window
 * @param {Gio.Settings} context.settings
 * @param {(msgid: string) => string} context.gettext
 * @param {number[]} context.handlerIds
 * @returns {Adw.PreferencesGroup}
 */
export function oauthGroup({meta, window, settings, gettext: _, handlerIds}) {
    const group = new Adw.PreferencesGroup({
        title: meta.name,
        description: meta.terms
            ? _('Unofficial access: %s may not allow this and could limit your account.').format(meta.name)
            : '',
    });
    const status = new Adw.ActionRow({title: _('Status'), subtitle: _('Checking the keyring…')});
    const connect = new Gtk.Button({label: _('Connect'), valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
    const cancel = new Gtk.Button({label: _('Cancel'), valign: Gtk.Align.CENTER, visible: false});
    const copy = new Gtk.Button({label: _('Copy link'), valign: Gtk.Align.CENTER, visible: false});
    const disconnect = new Gtk.Button({label: _('Disconnect'), valign: Gtk.Align.CENTER, visible: false});
    for (const button of [copy, cancel, connect, disconnect])
        status.add_suffix(button);
    connect.update_property([Gtk.AccessibleProperty.LABEL], [_('Connect %s').format(meta.name)]);
    disconnect.update_property([Gtk.AccessibleProperty.LABEL], [_('Disconnect %s').format(meta.name)]);
    group.add(status);

    let connected = null;       // null until the keyring answered
    let keyringDown = false;
    let login = null;           // the sign-in in progress
    let countdown = 0;
    let authUrl = '';

    const config = () => readLocalConfig().providers[meta.id];
    const showStatus = () => {
        const busy = login !== null;
        connect.visible = !busy && !connected;
        connect.sensitive = !keyringDown && !!config();
        cancel.visible = busy;
        copy.visible = busy;
        disconnect.visible = !busy && !!connected;
        if (busy)
            return;
        if (keyringDown) {
            status.subtitle = _('No keyring found. Unlock it in Passwords and Keys, or install a Secret Service provider.');
        } else if (!connected) {
            status.subtitle = config()
                ? _('Not connected.')
                : _('The client id for %s is missing. Add it to %s, then connect.').format(meta.name, localConfigPath());
        } else {
            const result = settings.get_value('account-status').deepUnpack()[meta.id];
            status.subtitle = {
                ok: _('Connected.'),
                expired: _('The sign-in expired. Reconnect to keep seeing this quota.'),
                refused: _('The provider refused access. Check your account on its site.'),
                keyring: _('Connected. The keyring is locked, so it was not checked.'),
                unreachable: _('Connected. Could not reach the server.'),
                changed: _('Connected. The service replied in an unexpected way.'),
                no_config: _('Connected, but the client id is missing from the local configuration.'),
            }[result] ?? _('Connected. Not checked yet.');
            // An expired sign-in is fixed by connecting again, not by disconnecting.
            connect.visible = result === 'expired';
            connect.label = _('Reconnect');
        }
    };
    const refresh = () => lookupSecret(meta.id, OAUTH_TOKENS).then(text => {
        connected = decodeSecret(text) !== null;
        keyringDown = false;
    }).catch(() => {
        connected = false;
        keyringDown = true;
    }).finally(showStatus);
    handlerIds.push(settings.connect('changed::account-status', showStatus));

    const announce = () => {
        settings.set_string('credentials-touched', meta.id);
        settings.set_int('credentials-revision', (settings.get_int('credentials-revision') + 1) % 2147483647);
        Gio.Settings.sync();
    };
    const toast = title => window.add_toast(new Adw.Toast({title}));

    const finishLogin = () => {
        if (countdown) {
            GLib.source_remove(countdown);
            countdown = 0;
        }
        login = null;
        authUrl = '';
        refresh();
    };

    const begin = () => {
        const local = config();
        if (!local) {
            showStatus();
            return;
        }
        const redirect = {host: local.redirectHost ?? meta.oauth.defaultRedirect.host,
            port: local.redirectPort ?? meta.oauth.defaultRedirect.port};
        const messages = {
            ok: _('You can close this tab and go back to Preferences.'),
            failed: _('Sign-in did not finish. You can close this tab.'),
        };
        const options = port => ({
            spec: meta.oauth,
            config: {clientId: local.clientId, clientSecret: local.clientSecret, redirectPort: port, redirectHost: redirect.host},
            http: createHttp({allowedHosts: meta.oauth.authHosts}),
            pkce: createPkce({randomBytes, sha256}),
            openUri: url => Gio.AppInfo.launch_default_for_uri(url, null),
            now: Date.now,
            messages,
            timeoutSecs: LOGIN_SECONDS,
            onBrowserFailed: () => toast(_("Couldn't open the browser. Copy the link and open it yourself.")),
        });
        let port = redirect.port;
        let started;
        try {
            try {
                started = startLogin(options(port));
            } catch (error) {
                // The client's own fallback port, when the first one is taken.
                const fallback = meta.oauth.defaultRedirect.fallbackPort;
                if (error.code !== 'port_busy' || !fallback || local.redirectPort !== undefined)
                    throw error;
                port = fallback;
                started = startLogin(options(port));
            }
        } catch (error) {
            toast(failureText(error, _, port));
            return;
        }

        login = started;
        authUrl = started.authUrl;
        let left = LOGIN_SECONDS;
        const tick = () => {
            status.subtitle = _('Waiting for the browser… %d:%02d').format(Math.floor(left / 60), left % 60);
            return left-- > 0 ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        };
        tick();
        countdown = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, tick);
        showStatus();

        started.done.then(tokens => {
            const secret = encodeSecret({gen: base64Url(randomBytes(16)), ...tokens});
            return storeSecret(meta.id, OAUTH_TOKENS, secret, `${meta.name} sign-in`)
                .then(() => {
                    toast(_('%s connected.').format(meta.name));
                    announce();
                }, () => toast(_('The keyring did not accept the sign-in.')));
        }).catch(error => {
            if (error?.code !== 'cancelled')
                toast(failureText(error, _, port));
        }).finally(finishLogin);
    };

    connect.connect('clicked', () => {
        const acknowledged = settings.get_strv('terms-acknowledged');
        if (!meta.terms || acknowledged.includes(meta.id)) {
            begin();
            return;
        }
        const dialog = new Adw.AlertDialog({
            heading: _('Use of %s may break its terms').format(meta.name),
            body: _('This extension signs in the way the %s app does, which its terms may not allow. %s could limit or suspend your account. Use it at your own risk.').format(meta.name, meta.name),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('go', _('I understand, connect'));
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            if (response !== 'go')
                return;
            settings.set_strv('terms-acknowledged', [...acknowledged, meta.id]);
            begin();
        });
        dialog.present(window);
    });
    cancel.connect('clicked', () => login?.cancel());
    copy.connect('clicked', () => {
        if (authUrl) {
            Gdk.Display.get_default().get_clipboard().set(authUrl);
            toast(_('Link copied.'));
        }
    });

    disconnect.connect('clicked', () => {
        const dialog = new Adw.AlertDialog({
            heading: _('Disconnect %s?').format(meta.name),
            body: _('The sign-in is deleted from the keyring and the extension stops reading this quota. Access already granted may stay listed in your %s account until you revoke it there.').format(meta.name),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('disconnect', _('Disconnect'));
        dialog.set_response_appearance('disconnect', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            if (response !== 'disconnect')
                return;
            revoke(meta, local => local).finally(() => {
                clearSecret(meta.id, OAUTH_TOKENS).then(announce).catch(() => toast(_('The keyring is not available.')))
                    .finally(refresh);
            });
        });
        dialog.present(window);
    });

    // A window that closes in the middle of a sign-in ends it and frees the port.
    window.connect('close-request', () => {
        login?.cancel();
        return false;
    });

    refresh();
    return group;
}

/**
 * Ask the provider to revoke the refresh token. Best effort and short: the sign-in is
 * deleted from the keyring either way. The request follows RFC 7009.
 */
async function revoke(meta) {
    try {
        const local = readLocalConfig().providers[meta.id];
        const secret = decodeSecret(await lookupSecret(meta.id, OAUTH_TOKENS));
        if (!local || !secret || !meta.oauth.revokeUrl)
            return;
        const http = createHttp({allowedHosts: meta.oauth.authHosts, timeoutSecs: 5});
        await http.request(meta.oauth.revokeUrl, {
            method: 'POST',
            body: formBody({token: secret.refresh, token_type_hint: 'refresh_token', client_id: local.clientId, client_secret: local.clientSecret}),
        });
    } catch (_error) {
        // Nothing to report: the credential is removed locally in any case.
    }
}
