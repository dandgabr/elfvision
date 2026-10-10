// The Accounts group of a provider that signs in with OAuth (docs/adr/0009): status, Connect, Cancel and
// Disconnect, and the paste field. It is a view over an OAuth controller (oauthController.js), which
// holds the state and does the sign-in; the first-use assistant is another view over the same one.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {connectableProviders} from '../core/firstUse.js';
import {fmt} from '../core/viewmodel.js';
import {localConfigPath} from '../services/localConfig.js';
import {createOAuthController} from './oauthController.js';
import {harnessSubtitle, oauthPrimary, oauthSubtitle} from './accountText.js';
import {homeAbbreviated} from './status.js';
import {termsConfirmer} from './termsDialog.js';
import {createClientConfigDiscovery} from './clientConfigDiscovery.js';
import {credentialModeControl} from './credentialModeControl.js';

/**
 * The command that finds the client ids, as one line: the full path (the terminal is not necessarily in
 * the project's folder) and the providers it is for, with no newline so the user has to press Enter.
 *
 * @param {string} extensionPath
 * @param {string[]} providerIds - ids from the registry
 */
export function helperCommand(extensionPath, providerIds) {
    const helper = GLib.build_filenamev([extensionPath, 'tools', 'import-client-ids.py']);
    return `python3 -I ${GLib.shell_quote(helper)} ${providerIds.join(' ')}`;
}

/**
 * @param {object} context
 * @param {import('../providers/registry.js').ProviderMeta} context.meta
 * @param {Adw.PreferencesWindow} context.window
 * @param {Gio.Settings} context.settings
 * @param {(msgid: string) => string} context.gettext
 * @param {number[]} context.handlerIds
 * @param {string} context.extensionPath - where the extension is installed, for the helper's full path
 * @param {object} [context.controller] - the account's controller, when another view shares it
 * @returns {{group: Adw.PreferencesGroup, focus: () => void, controller: object}}
 */
export function oauthGroup({meta, window, settings, gettext: _, handlerIds, extensionPath, controller = null, connector = null, store = null}) {
    const toast = title => window.add_toast(new Adw.Toast({title}));
    const confirmTerms = termsConfirmer({window, gettext: _});
    const confirmHarnessTerms = termsConfirmer({window, gettext: _, credentialMode: 'harness'});
    const account = controller ?? createOAuthController({
        meta, settings, gettext: _, toast, confirmTerms,
    });

    const group = new Adw.PreferencesGroup({
        title: meta.name,
        description: meta.terms === 'strong'
            ? fmt(_('Against the terms: %s forbids this, and Google could suspend your whole Google account.'), meta.name)
            : meta.terms
                ? fmt(_('Unofficial access: %s may not allow this and could limit your account.'), meta.name)
                : '',
    });
    const status = new Adw.ActionRow({title: _('Status'), subtitle: _('Checking the keyring…')});
    const connect = new Gtk.Button({valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
    const cancel = new Gtk.Button({label: _('Cancel'), valign: Gtk.Align.CENTER, visible: false});
    const copy = new Gtk.Button({label: _('Copy link'), valign: Gtk.Align.CENTER, visible: false});
    const copyCommand = new Gtk.Button({label: _('Copy command'), valign: Gtk.Align.CENTER, visible: false});
    const recheck = new Gtk.Button({label: _('Check configuration again'), valign: Gtk.Align.CENTER, visible: false});
    const findConfig = new Gtk.Button({label: _('Find configuration automatically'), valign: Gtk.Align.CENTER, visible: false});
    const cancelDiscovery = new Gtk.Button({label: _('Cancel search'), valign: Gtk.Align.CENTER, visible: false});
    // WrapBox wraps between buttons; this long translated label also needs
    // height-for-width wrapping inside its button at large font sizes.
    const recheckLabel = recheck.get_child();
    recheckLabel.wrap = true;
    recheckLabel.wrap_mode = Pango.WrapMode.WORD_CHAR;
    const disconnect = new Gtk.Button({label: _('Disconnect'), valign: Gtk.Align.CENTER, css_classes: ['destructive-action'], visible: false});
    group.add(status);
    const modeControl = credentialModeControl({group, meta, connector, store, settings, window, gettext: _, toast,
        controller: account, confirmTerms: confirmHarnessTerms});
    const actions = new Adw.WrapBox({child_spacing: 8, line_spacing: 8, align: 1,
        margin_top: 8, margin_bottom: 8, margin_start: 12, margin_end: 12});
    for (const button of [findConfig, cancelDiscovery, copyCommand, recheck, copy, cancel, connect, disconnect])
        actions.append(button);
    group.add(actions);

    // For when the browser cannot reach the local server (or took too long): paste the address
    // it ended on, or just the code.
    const paste = new Adw.EntryRow({title: _('Paste the address or the code'), show_apply_button: true, visible: false});
    group.add(paste);

    let wasBusy = false;
    let discoveryBusy = false;
    let discoveryCancellable = null;
    let discoveryGeneration = 0;
    const render = () => {
        const state = account.snapshot();
        const harnessMode = modeControl.mode === 'harness';
        const primary = oauthPrimary(state);
        const reconnect = primary === 'reconnect';
        const label = reconnect ? _('Reconnect') : _('Connect');
        connect.label = label;
        connect.update_property([Gtk.AccessibleProperty.LABEL], [fmt(reconnect ? _('Reconnect %s') : _('Connect %s'), meta.name)]);
        connect.visible = primary !== null && !harnessMode;
        connect.sensitive = connectableProviders([meta], {[meta.id]: state}).length > 0;
        connect.tooltip_text = connect.sensitive ? '' : state.blocked
            ? _('Account changes are blocked while local disconnection is incomplete.')
            : _('Set up the client id and the keyring first.');
        cancel.visible = state.busy;
        copy.visible = state.busy;
        paste.visible = state.busy && state.pasteVisible;
        findConfig.visible = !state.busy && !state.hasConfig && !discoveryBusy;
        cancelDiscovery.visible = discoveryBusy;
        copyCommand.visible = !harnessMode && !state.busy && !state.hasConfig && !discoveryBusy;
        findConfig.visible = !harnessMode && !state.busy && !state.hasConfig && !discoveryBusy;
        recheck.visible = !harnessMode && !state.busy && !state.hasConfig && !discoveryBusy;
        copyCommand.tooltip_text = fmt(_('Copies the command that finds the client id (it writes to %s).'), homeAbbreviated(localConfigPath()));
        disconnect.visible = !harnessMode && !state.busy && !!state.connected;
        disconnect.sensitive = !state.blocked && !state.removing;
        status.subtitle = harnessMode
            ? harnessSubtitle({result: state.result}, meta, _)
            : oauthSubtitle(state, meta, _);
        // When a sign-in ends, put the focus on the button that does something now.
        if (!wasBusy && state.busy)
            cancel.grab_focus();
        if (wasBusy && !state.busy)
            focusPrimary();
        if (!state.busy)
            paste.text = '';
        wasBusy = state.busy;
    };
    const focusPrimary = () => [connect, disconnect, findConfig, copyCommand].find(button => button.visible && button.sensitive)?.grab_focus();

    const unsubscribe = account.subscribe(render);
    const statusHandler = settings.connect('changed::account-status', render);
    handlerIds.push(statusHandler);
    // The configuration may have been written while this window was open (the helper runs in a terminal):
    // look again when the window comes back to the front.
    const activeHandler = window.connect('notify::is-active', () => {
        if (window.is_active)
            account.recheck();
    });

    recheck.connect('clicked', () => account.recheck());
    findConfig.connect('clicked', async () => {
        if (disposed || discoveryBusy)
            return;
        const generation = ++discoveryGeneration;
        discoveryBusy = true;
        discoveryCancellable = new Gio.Cancellable();
        render();
        try {
            await createClientConfigDiscovery({extensionPath}).run(meta.id, {cancellable: discoveryCancellable});
            if (disposed || generation !== discoveryGeneration) return;
            await account.recheck();
            if (disposed || generation !== discoveryGeneration) return;
            toast(account.snapshot().hasConfig ? _('OAuth client configuration found.') : _('No supported OAuth client configuration was found.'));
        } catch (error) {
            if (!disposed && generation === discoveryGeneration && error.code !== 'cancelled')
                toast(_('Could not search for OAuth client configuration. You can use the command or enter the configuration manually.'));
        } finally {
            if (generation === discoveryGeneration) {
                discoveryBusy = false;
                discoveryCancellable = null;
                if (!disposed) render();
            }
        }
    });
    cancelDiscovery.connect('clicked', () => discoveryCancellable?.cancel());
    connect.connect('clicked', () => account.connect());
    cancel.connect('clicked', () => account.cancel());
    paste.connect('apply', () => {
        if (account.submit(paste.text))
            paste.text = '';
        else
            paste.add_css_class('error');
    });
    paste.connect('changed', () => paste.remove_css_class('error'));
    copy.connect('clicked', () => {
        const url = account.snapshot().authUrl;
        if (url) {
            Gdk.Display.get_default().get_clipboard().set(url);
            toast(_('Link copied.'));
        }
    });
    copyCommand.connect('clicked', () => {
        Gdk.Display.get_default().get_clipboard().set(helperCommand(extensionPath, [meta.id]));
        toast(_('Command copied.'));
    });

    disconnect.connect('clicked', () => {
        const dialog = new Adw.AlertDialog({
            heading: fmt(_('Disconnect %s?'), meta.name),
            body: fmt(_('The sign-in is deleted from the keyring and the extension stops reading this quota. Access already granted may stay listed in your %s account until you revoke it there.'), meta.name),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('disconnect', _('Disconnect'));
        dialog.set_response_appearance('disconnect', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            if (!disposed && response === 'disconnect')
                account.disconnect();
        });
        dialog.present(window);
    });

    let disposed = false;
    const dispose = () => {
        if (disposed)
            return;
        disposed = true;
        discoveryGeneration++;
        discoveryCancellable?.cancel();
        discoveryCancellable = null;
        unsubscribe();
        modeControl.dispose();
        const index = handlerIds.indexOf(statusHandler);
        if (index >= 0) {
            settings.disconnect(statusHandler);
            handlerIds.splice(index, 1);
        }
        window.disconnect(activeHandler);
        window.disconnect(closeHandler);
        paste.text = '';
        if (!controller)
            account.dispose();
    };
    const closeHandler = window.connect('close-request', () => {
        dispose();
        return false;
    });

    account.refresh();
    render();
    return {group, focus: focusPrimary, controller: account, dispose};
}
