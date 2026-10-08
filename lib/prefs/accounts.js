// The Accounts page of the preferences window, generated from the provider
// registry (docs/adr/0009). It runs in the preferences process, so it may use
// Adw and Gtk; nothing here is imported by the shell.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {createLoginGate} from '../core/firstUse.js';
import {fmt} from '../core/viewmodel.js';
import {availableProviders, availableDemoProviders, providerMeta} from '../core/providerRegistry.js';
import {createConnectorStore} from '../services/connectorStore.js';
import {createDemoAccountController, createUnavailableAccountController} from './demoAccountController.js';
import {oauthSubtitle} from './accountText.js';
import {apiKeySubtitle, createApiKeyController} from './apiKeyController.js';
import {oauthGroup} from './oauthGroup.js';
import {createOAuthController} from './oauthController.js';
import {termsConfirmer} from './termsDialog.js';
import {buildDisconnectGroup} from './disconnectDialog.js';

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
    let store = null, unsubscribeStore = () => {}, groups = [], rowSubscriptions = [], rowRefreshers = [], editor = null, adding = null, disposed = false;
    let demo = false, deleting = false;
    const header = new Adw.PreferencesGroup({description: _('Create separate connectors for each account, including more than one account with the same provider.')});
    const addRow = new Adw.ActionRow({title: _('Add connector'), subtitle: _('Choose an AI service to track.')});
    const addButton = new Gtk.Button({label: _('Add connector…'), valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
    addRow.add_suffix(addButton); header.add(addRow); page.add(header);
    const mode = new Adw.PreferencesGroup();
    const modeRow = new Adw.ActionRow({title: _('Demo connectors'), subtitle: _('Fictional accounts. Connect and remove are simulated; no browser, keyring or provider request is used.')});
    mode.add(modeRow); page.add(mode);
    const registryProblem = new Adw.PreferencesGroup({title: _('Connector configuration is unavailable'), description: _('The local connector list is invalid. Saved credentials have not been changed.'), visible: false});
    const recoverRow = new Adw.ActionRow({title: _('Recover connector list'), subtitle: _('Rebuild the list from saved credential identities. Credentials are kept; connector names may need to be entered again.')});
    const recoverButton = new Gtk.Button({label: _('Recover list…'), valign: Gtk.Align.CENTER});
    let recovering = false, recoverDialog = null;
    recoverRow.add_suffix(recoverButton); registryProblem.add(recoverRow);
    recoverButton.connect('clicked', async () => {
        if (disposed || deleting || recovering || recoverDialog) return;
        const selectedStore = store;
        const confirm = () => new Promise(resolve => {
            recoverDialog = new Adw.AlertDialog({heading: _('Recover the connector list?'),
                body: demo ? _('Rebuild the fictional connector list. No real credential is read or changed. Connector names may need to be entered again.')
                    : _('Read saved credential identities to rebuild the connector list. Secret values are not read or deleted. Connector names and usernames may need to be entered again.')});
            recoverDialog.add_response('cancel', _('Cancel')); recoverDialog.add_response('recover', _('Recover list'));
            recoverDialog.set_default_response('cancel'); recoverDialog.set_close_response('cancel');
            recoverDialog.connect('response', (_dialog, response) => { recoverDialog = null; resolve(response === 'recover' && !disposed && selectedStore === store); });
            recoverDialog.present(window);
        });
        try {
            recovering = true; recoverButton.sensitive = false;
            await recoverConnectorRegistry({store: selectedStore, confirm});
        } catch (_error) {
            if (!disposed) toast(_('The connector list could not be recovered. Saved credentials were kept. Unlock the keyring and retry.'));
        } finally { recovering = false; if (!disposed) recoverButton.sensitive = true; }
    });
    page.add(registryProblem);
    const entries = () => {
        try { const result = store.list(); registryProblem.visible = false; addButton.sensitive = !deleting; return result; }
        catch (_error) { registryProblem.visible = true; addButton.sensitive = false; return []; }
    };
    const labelFor = connector => connector.label || providerMeta(connector.providerId).name;
    const empty = new Adw.PreferencesGroup({title: _('No connectors'), description: _('Add a connector to start tracking an account.')});
    page.add(empty);
    let disconnectView = null;

    const create = connector => {
        const meta = providerMeta(connector.providerId);
        const context = {meta, connectorId: connector.id, settings, gettext: _, toast};
        return demo ? createDemoAccountController(context) : meta.quotaSupport === 'unavailable' ? createUnavailableAccountController() : meta.auth === 'api-key'
            ? createApiKeyController(context) : createOAuthController({...context, confirmTerms, loginGate});
    };
    const cancel = () => {
        confirmTerms.cancel();
        for (const controller of controllers.values()) controller.cancel?.();
    };
    const closeEditor = () => {
        if (!editor) return;
        const current = editor; editor = null;
        current.dispose();
        window.pop_subpage();
    };
    const stateText = (connector, state) => {
        if (settings.get_strv('untracked-providers').includes(connector.id)) return _('Paused');
        if (demo) return state.connected ? _('Demo connected') : _('Demo not connected');
        if (providerMeta(connector.providerId).quotaSupport === 'unavailable') return _('Quota unavailable. Open the provider dashboard for usage.');
        return providerMeta(connector.providerId).auth === 'api-key'
            ? apiKeySubtitle(state, _) : oauthSubtitle(state, providerMeta(connector.providerId), _);
    };
    const render = () => {
        if (disposed || !store) return;
        for (const unsubscribe of rowSubscriptions.splice(0)) unsubscribe();
        rowRefreshers = [];
        for (const group of groups.splice(0)) page.remove(group);
        const connectors = entries();
        if (registryProblem.visible) closeEditor();
        const wanted = new Set(connectors.map(connector => connector.id));
        for (const [id, controller] of controllers) {
            if (!wanted.has(id)) { controller.dispose(); controllers.delete(id); }
        }
        empty.visible = !connectors.length;
        for (const meta of (demo ? availableDemoProviders() : availableProviders())) {
            const entries = connectors.filter(connector => connector.providerId === meta.id);
            if (!entries.length) continue;
            const group = new Adw.PreferencesGroup({title: meta.name});
            group.sensitive = !deleting; groups.push(group); page.add(group);
            for (const connector of entries) {
                if (!controllers.has(connector.id)) controllers.set(connector.id, create(connector));
                const controller = controllers.get(connector.id);
                const row = new Adw.ActionRow({title: labelFor(connector), activatable: true, use_markup: false});
                const auth = connectorAuth(meta, _);
                const icon = new Gtk.Image({icon_name: auth.icon, tooltip_text: auth.label});
                icon.update_property([Gtk.AccessibleProperty.LABEL], [auth.label]); row.add_prefix(icon);
                if (demo) row.add_suffix(new Gtk.Label({label: _('Fictional'), css_classes: ['dim-label']}));
                const edit = new Gtk.Button({icon_name: 'document-edit-symbolic', tooltip_text: fmt(_('Configure %s'), labelFor(connector)), valign: Gtk.Align.CENTER});
                edit.update_property([Gtk.AccessibleProperty.LABEL], [fmt(_('Configure %s'), labelFor(connector))]);
                edit.connect('clicked', () => show(connector.id));
                row.add_suffix(edit); row.connect('activated', () => show(connector.id));
                const update = () => { row.subtitle = stateText(connector, controller.snapshot()); };
                rowSubscriptions.push(controller.subscribe(update)); rowRefreshers.push(update); update();
                group.add(row); group.add(trackRow({meta: {...meta, id: connector.id, name: connector.label ? `${meta.name} · ${connector.label}` : meta.name}, settings, _, handlerIds, subscriptions: rowSubscriptions}));
                controller.refresh();
            }
        }
        if (disconnectView) { page.remove(disconnectView.group); page.add(disconnectView.group); }
    };
    const show = id => {
        if (disposed || deleting) return;
        const connector = entries().find(item => item.id === id) ?? entries().find(item => item.providerId === id);
        if (!connector) { openAdd(); return; }
        onShow(); closeEditor(); window.set_visible_page(page);
        const controller = controllers.get(connector.id);
        editor = openConnectorEditor({connector, store, controller, demo, window, settings, gettext: _, extensionPath,
            toast, onClosed: () => { editor = null; }, onRemoved: () => { closeEditor(); addButton.grab_focus(); }});
    };
    function openAdd() {
        if (disposed || deleting || adding) return;
        onShow(); closeEditor();
        adding = openAddConnector({window, store, demo, gettext: _, onAdded: connector => show(connector.id), onClosed: () => { adding = null; }, toast});
    }
    addButton.connect('clicked', openAdd);
    const changeSource = () => {
        deleting = false;
        recoverDialog?.close(); recoverDialog = null; adding?.close(); adding = null; closeEditor(); cancel(); unsubscribeStore(); store?.dispose();
        for (const controller of controllers.values()) controller.dispose(); controllers.clear();
        demo = settings.get_string('data-source') === 'demo';
        store = createConnectorStore(settings, {demo}); mode.visible = demo;
        if (disconnectView) { page.remove(disconnectView.group); disconnectView.dispose(); disconnectView = null; }
        disconnectView = buildDisconnectGroup({window, settings, demo, gettext: _, onBusyChange: busy => { deleting = busy; addButton.sensitive = !busy && !registryProblem.visible; recoverButton.sensitive = !busy && !recovering; groups.forEach(group => { group.sensitive = !busy; }); }, beforeDelete: () => { recoverDialog?.close(); recoverDialog = null; adding?.close(); adding = null; closeEditor(); cancel(); }}); page.add(disconnectView.group);
        unsubscribeStore = store.subscribe(render); render();
    };
    handlerIds.push(settings.connect('changed::data-source', changeSource));
    handlerIds.push(settings.connect('changed::account-status', () => rowRefreshers.forEach(fn => fn())));
    handlerIds.push(settings.connect('changed::untracked-providers', () => rowRefreshers.forEach(fn => fn())));
    const showTarget = () => {
        const id = settings.get_string('prefs-target');
        if (!id || id === 'popup') return;
        settings.set_string('prefs-target', '');
        if (id === 'accounts') {
            adding?.close(); adding = null; recoverDialog?.close(); recoverDialog = null;
            onShow(); closeEditor(); window.set_visible_page(page);
        }
        else if (id === 'add') openAdd(); else show(id);
    };
    handlerIds.push(settings.connect('changed::prefs-target', showTarget));
    changeSource();
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => { if (!disposed) showTarget(); return GLib.SOURCE_REMOVE; });
    window.connect('close-request', () => {
        disposed = true; recoverDialog?.close(); recoverDialog = null; adding?.close(); adding = null; editor?.dispose(); editor = null; cancel(); unsubscribeStore(); store.dispose();
        rowSubscriptions.splice(0).forEach(fn => fn()); controllers.forEach(controller => controller.dispose());
        disconnectView?.dispose(); return false;
    });
    return {page, controllers, show, cancel, add: openAdd,
        registryUnavailable: () => registryProblem.visible,
        contextForProvider: id => ({connector: entries().find(item => item.providerId === id), store}),
        controllerForProvider: id => {
            const connector = entries().find(item => item.providerId === id);
            return connector ? controllers.get(connector.id) : null;
        },
        ensureProvider: id => {
            let connector = entries().find(item => item.providerId === id);
            if (!connector) connector = store.add(id);
            return {connector, controller: controllers.get(connector.id)};
        }};
}

/** The user must confirm metadata reconstruction before the store can enumerate identities. */
export async function recoverConnectorRegistry({store, confirm}) {
    if (!await confirm()) return false;
    await store.recover();
    return true;
}

function openAddConnector({window, store, demo, gettext: _, onAdded, onClosed, toast}) {
    const providers = demo ? availableDemoProviders() : availableProviders();
    const dialog = new Adw.AlertDialog({heading: _('Add connector'), body: _('Choose a provider and a name that helps you distinguish this account. Creating a connector does not sign in.')});
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
    const list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list']});
    const provider = new Adw.ComboRow({title: _('Provider'), model: Gtk.StringList.new(providers.map(meta => meta.name))});
    const name = new Adw.EntryRow({title: _('Connector name')});
    const defaultName = () => {
        const meta = providers[provider.selected];
        const count = store.list().filter(connector => connector.providerId === meta.id).length;
        return count ? `${meta.name} ${count + 1}` : meta.name;
    };
    name.text = defaultName(); provider.connect('notify::selected', () => { name.text = defaultName(); });
    list.append(provider); list.append(name); box.append(list); dialog.extra_child = box;
    dialog.add_response('cancel', _('Cancel')); dialog.add_response('add', _('Add connector'));
    dialog.set_response_appearance('add', Adw.ResponseAppearance.SUGGESTED);
    dialog.set_default_response('add'); dialog.set_close_response('cancel');
    dialog.connect('response', (_dialog, response) => {
        onClosed();
        if (response !== 'add') return;
        try { onAdded(store.add(providers[provider.selected].id, name.text)); }
        catch (_error) { toast(_('The connector could not be created. Check the name and the number of connectors.')); }
    });
    dialog.present(window);
    return dialog;
}

function openConnectorEditor({connector, store, controller, demo, window, settings, gettext: _, extensionPath, toast, onRemoved, onClosed}) {
    const handlerIds = [];
    let disposed = false, removalDialog = null;
    const page = new Adw.PreferencesPage();
    const details = new Adw.PreferencesGroup({title: providerMeta(connector.providerId).name});
    const name = new Adw.EntryRow({title: _('Connector name'), text: connector.label || providerMeta(connector.providerId).name, show_apply_button: true});
    name.connect('apply', () => {
        try { store.update(connector.id, {label: name.text}); name.remove_css_class('error'); }
        catch (_error) { name.add_css_class('error'); toast(_('Enter a valid connector name.')); }
    });
    details.add(name);
    details.add(trackRow({meta: {...providerMeta(connector.providerId), id: connector.id, name: connector.label || providerMeta(connector.providerId).name}, settings, _, handlerIds}));
    page.add(details);
    const context = {meta: providerMeta(connector.providerId), connector, store, window, settings, gettext: _, handlerIds, extensionPath, controller};
    const view = demo ? demoGroup(context) : context.meta.quotaSupport === 'unavailable' ? unavailableQuotaGroup(context) : context.meta.auth === 'api-key' ? apiKeyGroup(context) : oauthGroup(context);
    page.add(view.group);
    const removeGroup = new Adw.PreferencesGroup();
    const remove = new Adw.ActionRow({title: _('Remove connector'), subtitle: demo ? _('Delete this fictional connector. Other fictional accounts are kept.') : _('Delete this connector and its local credential. Other accounts are kept.')});
    const button = new Gtk.Button({label: _('Remove…'), valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
    button.connect('clicked', () => {
        if (removalDialog) return;
        const dialog = removalDialog = new Adw.AlertDialog({heading: fmt(_('Remove %s?'), store.get(connector.id)?.label || providerMeta(connector.providerId).name),
            body: demo ? _('This removes only this fictional connector. No real credential is changed.') : _('Its local credential and quota data are removed. Access may remain valid on the provider’s site. Other connectors are kept.')});
        dialog.add_response('cancel', _('Cancel')); dialog.add_response('remove', _('Remove connector'));
        dialog.set_default_response('cancel'); dialog.set_close_response('cancel'); dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', async (_dialog, response) => {
            removalDialog = null;
            if (response !== 'remove' || disposed) return;
            button.sensitive = false; controller.cancel?.();
            const removed = await (context.meta.auth === 'api-key' ? controller.remove() : controller.disconnect());
            if (disposed) return;
            if (removed) {
                try {
                    const paused = settings.get_strv('untracked-providers').filter(id => id !== connector.id);
                    if (!settings.set_strv('untracked-providers', paused)) throw new Error('tracking unavailable');
                    store.remove(connector.id); onRemoved();
                }
                catch (_error) { button.sensitive = true; toast(demo ? _('The fictional connector list could not be updated. Retry removing the connector.') : _('The credential was removed, but the connector list could not be updated. Retry removing the connector.')); }
            }
            else { button.sensitive = true; toast(demo ? _('The fictional connector could not be removed. Retry removing the connector.') : _('The credential could not be removed. The connector was kept. Unlock the keyring and retry.')); }
        });
        dialog.present(window);
    });
    remove.add_suffix(button); removeGroup.add(remove); page.add(removeGroup);
    const toolbar = new Adw.ToolbarView({content: page}); toolbar.add_top_bar(new Adw.HeaderBar());
    const outer = new Adw.NavigationPage({title: connector.label || providerMeta(connector.providerId).name, child: toolbar});
    const unsubscribe = store.subscribe(() => {
        if (disposed) return;
        let current;
        try { current = store.get(connector.id); } catch (_error) { return; }
        if (current) outer.title = current.label || providerMeta(current.providerId).name;
    });
    function dispose() {
        if (disposed) return; disposed = true; removalDialog?.close(); removalDialog = null; unsubscribe(); controller.cancel?.(); view.dispose?.(); onClosed();
        for (const id of handlerIds.splice(0)) settings.disconnect(id);
    }
    outer.connect('hiding', dispose); window.push_subpage(outer); view.focus?.();
    return {dispose, page: outer};
}

export function demoGroup({meta, gettext: _, controller}) {
    const group = new Adw.PreferencesGroup({title: meta.name, description: _('Simulation only. No real account, browser or keyring is used.')});
    const status = new Adw.ActionRow({title: _('Status')});
    const button = new Gtk.Button({valign: Gtk.Align.CENTER}); status.add_suffix(button); group.add(status);
    const render = () => {
        const state = controller.snapshot();
        status.subtitle = state.connected ? _('Demo connected') : _('Demo not connected');
        button.label = state.connected ? _('Simulate disconnect') : _('Simulate connect');
    };
    button.connect('clicked', () => controller.snapshot().connected ? controller.disconnect() : controller.connect());
    const unsubscribe = controller.subscribe(render); render();
    return {group, focus: () => button.grab_focus(), dispose: unsubscribe};
}

/** A provider that signs in with a key: status, key entry, where to get one. A view over its controller. */
export function apiKeyGroup({meta, window, settings, gettext: _, handlerIds, controller, connector = null, store = null}) {
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
        for (const row of keyLinkRows({meta, settings, _, connector, store}))
            group.add(row);
    }
    const credentialHint = meta.credentialScope === 'organization-admin' ? _('Use an organization Admin API key. A personal inference key cannot read organization costs.')
        : meta.credentialScope === 'team-admin' ? _('Use a Team Admin API key. A personal subscription sign-in cannot read team spending.') : meta.credentialHint ? _(meta.credentialHint) : '';
    if (credentialHint) group.add(new Adw.ActionRow({title: credentialHint, use_markup: false}));
    group.add(entry);

    let disposed = false, removalDialog = null;
    const render = () => {
        if (disposed)
            return;
        const state = controller.snapshot();
        remove.visible = !!state.hasKey;
        entry.sensitive = !state.blocked && !state.keyringDown && !state.saving;
        remove.sensitive = !state.blocked && !state.saving;
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
        if (removalDialog) return;
        const dialog = removalDialog = new Adw.AlertDialog({
            heading: fmt(_('Remove the %s key?'), meta.name),
            body: fmt(_('It is deleted from the keyring. The key stays valid on the %s site.'), meta.name),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('remove', _('Remove'));
        dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            removalDialog = null;
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
        removalDialog?.close(); removalDialog = null;
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
function trackRow({meta, settings, _, handlerIds, subscriptions = null}) {
    const row = new Adw.SwitchRow({
        title: fmt(_('Track %s'), meta.name), use_markup: false,
        subtitle: _('Off stops fetching and hides it from the bar. Your credentials stay saved.'),
    });
    const read = () => !settings.get_strv('untracked-providers').includes(meta.id);
    row.active = read();
    row.connect('notify::active', () => {
        if (row.active === read()) return;
        const others = settings.get_strv('untracked-providers').filter(id => id !== meta.id);
        settings.set_strv('untracked-providers', row.active ? others : [...others, meta.id]);
    });
    const handler = settings.connect('changed::untracked-providers', () => {
        if (row.active !== read()) row.active = read();
    });
    if (subscriptions) subscriptions.push(() => settings.disconnect(handler));
    else handlerIds.push(handler);
    return row;
}

/** The account-name field and the link to the page that creates keys. */
function keyLinkRows({meta, settings, _, connector = null, store = null}) {
    const {urlTemplate, usernameSetting} = meta.keyLink;
    if (!usernameSetting) {
        const link = new Adw.ActionRow({title: _('Where do I get a key?'), subtitle: _('Open the provider’s API key settings.'), activatable: true});
        link.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        link.connect('activated', () => Gio.AppInfo.launch_default_for_uri(urlTemplate, null));
        return [link];
    }
    const username = new Adw.EntryRow({title: fmt(_('Your %s username'), meta.name)});
    username.text = connector?.username || (!connector || connector.id === meta.id ? settings.get_string(usernameSetting) : '') || GLib.get_user_name();
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
        if (!validName()) return;
        if (connector && store) store.update(connector.id, {username: username.text.trim()});
        else settings.set_string(usernameSetting, username.text.trim());
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

export function connectorAuth(meta, _) {
    if (meta.quotaSupport === 'unavailable') return {icon: 'web-browser-symbolic', label: _('Dashboard only')};
    if (meta.auth === 'api-key') return {icon: 'dialog-password-symbolic', label: _('API key')};
    if (meta.auth === 'demo') return {icon: 'applications-games-symbolic', label: _('Fictional account')};
    return {icon: 'web-browser-symbolic', label: _('OAuth 2')};
}

export function unavailableQuotaGroup({meta, gettext: _}) {
    const group = new Adw.PreferencesGroup({title: meta.name,
        description: _('Automatic quota reporting is unavailable for this service. No API key is requested or stored. Check usage in the provider dashboard.')});
    const row = new Adw.ActionRow({title: _('Open provider dashboard'), activatable: !!meta.dashboardUrl});
    row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
    row.connect('activated', () => { if (meta.dashboardUrl) Gio.AppInfo.launch_default_for_uri(meta.dashboardUrl, null); });
    group.add(row); return {group};
}
