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
import {announceChange, homeAbbreviated} from './status.js';

// A browser seen for the first time, a password manager and a second factor take a while.
const LOGIN_SECONDS = 300;

/** The fixed reasons a sign-in did not finish, in words. */
function failureText(error, _, port) {
    switch (error?.code) {
    case 'port_busy':
        return port
            ? _('The sign-in did not start: port %d is in use by another program. Close it and try again.').format(port)
            : _('The sign-in did not start: no local port could be opened.');
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
 * @param {string} context.extensionPath - where the extension is installed, for the helper's full path
 * @returns {{group: Adw.PreferencesGroup, focus: () => void}}
 */
export function oauthGroup({meta, window, settings, gettext: _, handlerIds, extensionPath}) {
    const group = new Adw.PreferencesGroup({
        title: meta.name,
        description: meta.terms === 'strong'
            ? _('Against the terms: %s forbids this, and Google could suspend your whole Google account.').format(meta.name)
            : meta.terms
                ? _('Unofficial access: %s may not allow this and could limit your account.').format(meta.name)
                : '',
    });
    const status = new Adw.ActionRow({title: _('Status'), subtitle: _('Checking the keyring…')});
    const connect = new Gtk.Button({valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
    const cancel = new Gtk.Button({label: _('Cancel'), valign: Gtk.Align.CENTER, visible: false});
    const copy = new Gtk.Button({label: _('Copy link'), valign: Gtk.Align.CENTER, visible: false});
    const copyCommand = new Gtk.Button({label: _('Copy command'), valign: Gtk.Align.CENTER, visible: false});
    const disconnect = new Gtk.Button({label: _('Disconnect'), valign: Gtk.Align.CENTER, css_classes: ['destructive-action'], visible: false});
    for (const button of [copyCommand, copy, cancel, connect, disconnect])
        status.add_suffix(button);
    group.add(status);

    // For when the browser cannot reach the local server (or took too long): paste the address
    // it ended on, or just the code.
    const paste = new Adw.EntryRow({
        title: _('Paste the address or the code'),
        show_apply_button: true,
        visible: false,
    });
    group.add(paste);

    let connected = null;       // null until the keyring answered
    let keyringDown = false;
    let login = null;           // the sign-in in progress
    let countdown = 0;
    let authUrl = '';
    let lastFailure = '';       // why the last sign-in did not finish, until the next one starts
    let removing = false;
    let closed = false;
    let pasteTimer = 0;       // the paste field waits a little: most sign-ins end by themselves

    const config = () => readLocalConfig().providers[meta.id];
    const toast = title => {
        if (!closed)
            window.add_toast(new Adw.Toast({title}));
    };
    const setConnectLabel = reconnect => {
        const label = reconnect ? _('Reconnect') : _('Connect');
        connect.label = label;
        connect.update_property([Gtk.AccessibleProperty.LABEL],
            [(reconnect ? _('Reconnect %s') : _('Connect %s')).format(meta.name)]);
    };

    const showStatus = () => {
        if (closed)
            return;
        const busy = login !== null;
        const hasConfig = !!config();
        const result = settings.get_value('account-status').deepUnpack()[meta.id];
        const reconnect = !!connected && result === 'expired';

        setConnectLabel(reconnect);
        connect.visible = !busy && (!connected || reconnect);
        connect.sensitive = !keyringDown && hasConfig;
        connect.tooltip_text = connect.sensitive ? '' : _('Set up the client id and the keyring first.');
        cancel.visible = busy;
        copy.visible = busy;
        if (!busy)
            paste.visible = false;
        copyCommand.visible = !busy && !connected && !hasConfig;
        copyCommand.tooltip_text = _('Copies the command that finds the client id (it writes to %s).').format(homeAbbreviated(localConfigPath()));
        disconnect.visible = !busy && !!connected;
        disconnect.sensitive = !removing;
        if (busy)
            return;
        if (keyringDown) {
            status.subtitle = _('No keyring found. Unlock it in Passwords and Keys, or install a Secret Service provider.');
        } else if (!connected) {
            const problem = hasConfig ? '' : readLocalConfig().problems[0];
            status.subtitle = lastFailure || (hasConfig
                ? _('Not connected.')
                : problem
                    ? _('The local configuration cannot be used: %s').format(problem)
                    : _('%s is not set up yet. Press "Copy command", run it in a terminal, then come back.').format(meta.name));
        } else {
            status.subtitle = {
                ok: _('Connected.'),
                expired: _('The sign-in expired. Reconnect to keep seeing this quota.'),
                refused: _('The provider refused access. Check your account on its site.'),
                keyring: _('Connected. The keyring is locked, so it was not checked.'),
                unreachable: _('Connected. Could not reach the server.'),
                changed: _('Connected. The service replied in an unexpected way.'),
                no_config: _('Connected, but the client id is missing from the local configuration.'),
            }[result] ?? _('Connected. Not checked yet.');
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
    // The configuration may have been written while this window was open (the helper runs in a
    // terminal): look again when the window comes back to the front.
    window.connect('notify::is-active', () => {
        if (window.is_active)
            showStatus();
    });

    const focusPrimary = () => {
        if (closed)
            return;
        for (const button of [connect, disconnect]) {
            if (button.visible && button.sensitive) {
                button.grab_focus();
                return;
            }
        }
    };

    const stopTimers = () => {
        for (const source of [countdown, pasteTimer]) {
            if (source)
                GLib.source_remove(source);
        }
        countdown = 0;
        pasteTimer = 0;
    };

    const finishLogin = () => {
        stopTimers();
        paste.text = '';
        login = null;
        authUrl = '';
        refresh().then(focusPrimary);
    };

    const begin = () => {
        const local = config();
        if (!local) {
            showStatus();
            return;
        }
        lastFailure = '';
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
            onBrowserFailed: () => {
                toast(_("Couldn't open the browser. Copy the link and open it yourself."));
                paste.visible = true;
            },
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
            lastFailure = failureText(error, _, port);
            showStatus();
            return;
        }

        login = started;
        authUrl = started.authUrl;
        paste.text = '';
        // Shown after a while, or at once if the browser would not open.
        pasteTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 20, () => {
            pasteTimer = 0;
            paste.visible = login !== null;
            return GLib.SOURCE_REMOVE;
        });
        let left = LOGIN_SECONDS;
        const tick = () => {
            status.subtitle = _('Finish signing in using your browser. %d:%02d left.').format(Math.floor(left / 60), left % 60);
            if (left-- > 0)
                return GLib.SOURCE_CONTINUE;
            countdown = 0;      // the source ends itself: it must not be removed again
            return GLib.SOURCE_REMOVE;
        };
        tick();
        countdown = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, tick);
        showStatus();
        cancel.grab_focus();

        started.done.then(tokens => {
            const secret = encodeSecret({gen: base64Url(randomBytes(16)), ...tokens});
            return storeSecret(meta.id, OAUTH_TOKENS, secret, `${meta.name} sign-in`).then(() => {
                // The extension is told first: the toast needs a window, the shell does not.
                announceChange(settings, meta.id);
                toast(_('%s connected.').format(meta.name));
            }, () => {
                lastFailure = _('The keyring did not accept the sign-in.');
            });
        }).catch(error => {
            if (error?.code === 'cancelled')
                lastFailure = _('Sign-in cancelled. Nothing was saved.');
            else
                lastFailure = failureText(error, _, port);
        }).finally(finishLogin);
    };

    connect.connect('clicked', () => {
        const acknowledged = settings.get_strv('terms-acknowledged');
        if (!meta.terms || acknowledged.includes(meta.id)) {
            begin();
            return;
        }
        const strong = meta.terms === 'strong';
        const dialog = new Adw.AlertDialog(strong
            ? {
                heading: _('Using %s this way breaks its terms').format(meta.name),
                body: _('This extension signs in the way the official app does. The terms of %s forbid that, and Google could suspend your whole Google account (Gmail and Drive included), not only this service. The sign-in also gives access to your Google Cloud data. Use it only if you accept that risk.').format(meta.name),
            }
            : {
                heading: _('Using %s this way may break its terms').format(meta.name),
                body: _('This extension signs in the way the official app does, which the terms may not allow. Your account could be limited or suspended. Use it at your own risk.'),
            });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('go', strong ? _('Connect anyway') : _('I understand, connect'));
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
    paste.connect('apply', () => {
        try {
            login?.submit(paste.text);
            paste.text = '';
        } catch (error) {
            // The sign-in has just ended by itself: nothing to correct.
            if (error?.code === 'closed')
                return;
            paste.add_css_class('error');
            toast(error?.code === 'state_mismatch'
                ? _('That address belongs to another sign-in. Start again from this window.')
                : error?.code === 'denied'
                    ? _('The sign-in was refused in the browser.')
                    : _('That is not the address or the code. Copy the full address from the browser bar, or the code shown on the page.'));
        }
    });
    paste.connect('changed', () => paste.remove_css_class('error'));
    copy.connect('clicked', () => {
        if (authUrl) {
            Gdk.Display.get_default().get_clipboard().set(authUrl);
            toast(_('Link copied.'));
        }
    });
    copyCommand.connect('clicked', () => {
        // The full path: the terminal is not necessarily in the project's folder.
        const helper = GLib.build_filenamev([extensionPath, 'tools', 'import-client-ids.py']);
        Gdk.Display.get_default().get_clipboard().set(`python3 -I ${GLib.shell_quote(helper)} ${meta.id}`);
        toast(_('Command copied.'));
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
        dialog.connect('response', async (_dialog, response) => {
            if (response !== 'disconnect' || removing)
                return;
            removing = true;
            showStatus();
            try {
                // Read the refresh token, delete the sign-in first (so the shell cannot write it
                // back), tell the extension, then ask the provider to revoke it: best effort.
                const secret = decodeSecret(await lookupSecret(meta.id, OAUTH_TOKENS));
                await clearSecret(meta.id, OAUTH_TOKENS);
                announceChange(settings, meta.id);
                toast(_('%s disconnected.').format(meta.name));
                revoke(meta, secret);
            } catch (_error) {
                toast(_('The keyring is not available.'));
            } finally {
                removing = false;
                refresh();
            }
        });
        dialog.present(window);
    });

    // A window that closes in the middle of a sign-in ends it and frees the port.
    window.connect('close-request', () => {
        closed = true;
        login?.cancel();
        stopTimers();
        return false;
    });

    refresh();
    return {
        group,
        // The first button that does something now; the page scrolls to whatever has the focus.
        focus: () => [connect, disconnect, copyCommand].find(button => button.visible && button.sensitive)?.grab_focus(),
    };
}

/**
 * Ask the provider to revoke the refresh token (RFC 7009). Best effort and short: the
 * sign-in is already deleted from the keyring, whatever happens here.
 */
async function revoke(meta, secret) {
    try {
        const local = readLocalConfig().providers[meta.id];
        if (!local || !secret || !meta.oauth.revokeUrl)
            return;
        const http = createHttp({allowedHosts: meta.oauth.authHosts, timeoutSecs: 5});
        try {
            await http.request(meta.oauth.revokeUrl, {
                method: 'POST',
                body: formBody({token: secret.refresh, token_type_hint: 'refresh_token', client_id: local.clientId, client_secret: local.clientSecret}),
            });
        } finally {
            http.dispose();
        }
    } catch (_error) {
        // Nothing to report: the credential is removed locally in any case.
    }
}
