// The Accounts page of the preferences window, generated from the provider
// registry (docs/adr/0009). It runs in the preferences process, so it may use
// Adw and Gtk; nothing here is imported by the shell.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {createLoginGate} from '../core/firstUse.js';
import {fmt} from '../core/viewmodel.js';
import {availableProviders} from '../providers/registry.js';
import {apiKeySubtitle, createApiKeyController} from './apiKeyController.js';
import {oauthGroup} from './oauthGroup.js';
import {createOAuthController} from './oauthController.js';
import {termsConfirmer} from './termsDialog.js';

/**
 * The Accounts page: one group per provider, each a view over that provider's controller. The
 * controllers are returned too, so the first-use assistant draws the same accounts over the same state.
 *
 * @param {object} context
 * @param {Adw.PreferencesWindow} context.window
 * @param {Gio.Settings} context.settings
 * @param {(msgid: string) => string} context.gettext
 * @param {number[]} context.handlerIds - receives settings handlers, disconnected on close
 * @param {string} context.extensionPath
 * @returns {{page: Adw.PreferencesPage, controllers: Map<string, object>, show: (id: string) => void}}
 */
export function buildAccountsPage({window, settings, gettext: _, handlerIds, extensionPath, onShow = () => {}}) {
    const page = new Adw.PreferencesPage({title: _('Accounts'), icon_name: 'avatar-default-symbolic'});
    const toast = title => window.add_toast(new Adw.Toast({title}));
    const confirmTerms = termsConfirmer({window, gettext: _});
    const controllers = new Map();
    const loginGate = createLoginGate();
    const focusers = new Map();
    for (const meta of availableProviders()) {
        const controller = meta.auth === 'api-key'
            ? createApiKeyController({meta, settings, gettext: _, toast})
            : createOAuthController({meta, settings, gettext: _, toast, confirmTerms, loginGate});
        const {group, focus} = meta.auth === 'api-key'
            ? apiKeyGroup({meta, window, settings, gettext: _, handlerIds, controller})
            : oauthGroup({meta, window, settings, gettext: _, handlerIds, extensionPath, controller});
        group.add(trackRow({meta, settings, _, handlerIds}));
        page.add(group);
        controllers.set(meta.id, controller);
        focusers.set(meta.id, focus);
    }
    // The controllers end with the window: a sign-in in progress is cancelled and the port freed.
    window.connect('close-request', () => {
        for (const controller of controllers.values())
            controller.dispose();
        return false;
    });

    // The popup asks for one account to be shown: go to it, then forget the request.
    const show = id => {
        if (!availableProviders().some(meta => meta.id === id))
            return;
        onShow();
        window.set_visible_page(page);
        focusers.get(id)?.();
    };
    const showTarget = () => {
        const id = settings.get_string('prefs-target');
        if (!id)
            return;
        settings.set_string('prefs-target', '');
        show(id);
    };
    handlerIds.push(settings.connect('changed::prefs-target', showTarget));
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        showTarget();
        return GLib.SOURCE_REMOVE;
    });
    return {page, controllers, show, cancel: () => {
        confirmTerms.cancel();
        for (const controller of controllers.values())
            controller.cancel?.();
    }};
}

/** A provider that signs in with a key: status, key entry, where to get one. A view over its controller. */
export function apiKeyGroup({meta, window, settings, gettext: _, handlerIds, controller}) {
    const group = new Adw.PreferencesGroup({
        title: meta.name,
        description: fmt(_('The key is kept in the system keyring and sent only to %s.'), meta.apiHosts[0]),
    });
    const status = new Adw.ActionRow({title: _('Status'), subtitle: _('Checking the keyring…')});
    const remove = new Gtk.Button({
        label: _('Remove key'),
        tooltip_text: fmt(_('Remove the %s key'), meta.name),
        valign: Gtk.Align.CENTER,
        css_classes: ['destructive-action'],
        visible: false,
    });
    status.add_suffix(remove);
    const entry = new Adw.PasswordEntryRow({title: _('API key'), show_apply_button: true});
    group.add(status);

    // The page that creates keys may live under the user's own name on the site: the name and
    // the link come first, then the field the key goes in.
    if (meta.keyLink) {
        for (const row of keyLinkRows({meta, settings, _}))
            group.add(row);
    }
    group.add(entry);

    let disposed = false;
    const render = () => {
        if (disposed)
            return;
        const state = controller.snapshot();
        remove.visible = !!state.hasKey;
        entry.sensitive = !state.keyringDown && !state.saving;
        status.subtitle = apiKeySubtitle(state, _);
    };
    const unsubscribe = controller.subscribe(render);
    const statusHandler = settings.connect('changed::account-status', render);
    handlerIds.push(statusHandler);

    entry.connect('apply', async () => {
        if (disposed)
            return;
        const result = await controller.save(entry.text);
        if (disposed)
            return;
        if (result === 'invalid') {
            entry.add_css_class('error');
            return;
        }
        entry.remove_css_class('error');
        if (result === 'saved')
            entry.text = '';
        entry.grab_focus();
    });
    entry.connect('changed', () => entry.remove_css_class('error'));

    remove.connect('clicked', () => {
        const dialog = new Adw.AlertDialog({
            heading: fmt(_('Remove the %s key?'), meta.name),
            body: fmt(_('It is deleted from the keyring. The key stays valid on the %s site.'), meta.name),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('remove', _('Remove'));
        dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            if (!disposed && response === 'remove')
                controller.remove();
        });
        dialog.present(window);
    });

    controller.refresh().then(() => {
        if (disposed)
            return;
        const state = controller.snapshot();
        if (!state.hasKey && !state.keyringDown)
            entry.grab_focus();
    });
    const activeHandler = window.connect('notify::is-active', () => {
        if (!disposed && window.is_active)
            controller.refresh();
    });
    const dispose = () => {
        if (disposed)
            return;
        disposed = true;
        unsubscribe();
        const index = handlerIds.indexOf(statusHandler);
        if (index >= 0) {
            settings.disconnect(statusHandler);
            handlerIds.splice(index, 1);
        }
        window.disconnect(activeHandler);
        window.disconnect(closeHandler);
        entry.text = '';
    };
    const closeHandler = window.connect('close-request', () => { dispose(); return false; });
    render();
    return {group, focus: () => !disposed && entry.grab_focus(), dispose};
}

/** The switch that pauses a provider without forgetting its credential. */
function trackRow({meta, settings, _, handlerIds}) {
    const row = new Adw.SwitchRow({
        title: fmt(_('Track %s'), meta.name),
        subtitle: _('Off stops fetching and hides it from the bar. Your credentials stay saved.'),
    });
    const read = () => !settings.get_strv('untracked-providers').includes(meta.id);
    row.active = read();
    row.connect('notify::active', () => {
        const others = settings.get_strv('untracked-providers').filter(id => id !== meta.id);
        settings.set_strv('untracked-providers', row.active ? others : [...others, meta.id]);
    });
    handlerIds.push(settings.connect('changed::untracked-providers', () => {
        if (row.active !== read())
            row.active = read();
    }));
    return row;
}

/** The account-name field and the link to the page that creates keys. */
function keyLinkRows({meta, settings, _}) {
    const {urlTemplate, usernameSetting} = meta.keyLink;
    const username = new Adw.EntryRow({title: fmt(_('Your %s username'), meta.name)});
    username.text = settings.get_string(usernameSetting) || GLib.get_user_name();
    const link = new Adw.ActionRow({
        title: _('Where do I get a key?'),
        subtitle: fmt(_('Opens your keys page. Enter your %s username above first.'), meta.name),
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
