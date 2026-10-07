// Disposable setup subpage (ADR 0010). Accounts owns credentials and controllers; this run owns views.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {SETUP_STEPS, connectionSummary, selectedProviders, stepComplete} from '../core/firstUse.js';
import {fmt} from '../core/viewmodel.js';
import {availableProviders} from '../providers/registry.js';
import {apiKeyGroup} from './accounts.js';
import {helperCommand, oauthGroup} from './oauthGroup.js';

export function openFirstUse({window, settings, gettext: _, accounts, extensionPath, notificationsPage, onClosed = () => {}}) {
    const providers = availableProviders();
    const selected = new Set();
    const handlerIds = [];
    let views = [];
    let index = 0;
    let disposed = false;
    const navigation = new Adw.NavigationView({pop_on_escape: false});
    const toolbar = new Adw.ToolbarView();
    toolbar.add_top_bar(new Adw.HeaderBar());
    toolbar.set_content(navigation);
    const outer = new Adw.NavigationPage({title: _('Setup'), child: toolbar});
    const footer = new Adw.WrapBox({child_spacing: 12, line_spacing: 8, justify: Adw.JustifyMode.SPREAD, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12});
    const skip = new Gtk.Button({label: _('Skip this step'), css_classes: ['flat']});
    const back = new Gtk.Button({label: _('Back')});
    const next = new Gtk.Button({label: _('Continue'), css_classes: ['suggested-action']});
    footer.append(skip);
    footer.append(back);
    footer.append(next);
    toolbar.add_bottom_bar(footer);

    const clearViews = () => {
        accounts.cancel();
        for (const view of views)
            view.dispose?.();
        views = [];
        for (const id of handlerIds.splice(0))
            settings.disconnect(id);
    };
    function dispose() {
        if (disposed)
            return;
        disposed = true;
        settings.set_boolean('first-use-done', true);
        clearViews();
        window.disconnect(closeHandler);
        onClosed();
    }
    function close() {
        dispose();
        window.pop_subpage();
    }
    const closeHandler = window.connect('close-request', () => { dispose(); return false; });
    outer.connect('hiding', dispose);
    const keys = new Gtk.EventControllerKey();
    keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
    keys.connect('key-pressed', (_controller, key) => {
        if (key !== Gdk.KEY_Escape)
            return false;
        close();
        return true;
    });
    outer.add_controller(keys);

    function group(page, title, description = '') {
        const result = new Adw.PreferencesGroup({title, description});
        page.add(result);
        return result;
    }
    function action(parent, title, callback) {
        const row = new Adw.ActionRow({title, activatable: true});
        row.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
        row.connect('activated', callback);
        parent.add(row);
        return row;
    }
    function show() {
        clearViews();
        const step = SETUP_STEPS[index];
        outer.title = index === 0 ? _('Welcome') : fmt(_('Setup · %d of 5'), index);
        back.visible = index > 0;
        skip.visible = step !== 'done';
        skip.label = step === 'welcome' ? _('Set up later') : _('Skip this step');
        next.label = step === 'done' ? _('Close setup') : _('Continue');
        const page = new Adw.PreferencesPage();
        if (step === 'welcome') {
            group(page, _('Your AI quotas at a glance'), _('See remaining usage in the top bar and details in the popup. Nothing changes until you press a button. Keys and sign-ins stay in the system keyring. You can skip any step and set up again from General.'));
        } else if (step === 'providers') {
            const choices = group(page, _('Choose providers'), _('Every provider is optional. Choosing one here does not connect it or change which providers are tracked.'));
            for (const meta of providers) {
                const row = new Adw.SwitchRow({
                    title: meta.name,
                    subtitle: meta.terms === 'strong'
                        ? _('OAuth sign-in · Against the terms; your whole Google account could be suspended. Skip unless you accept this risk.')
                        : meta.terms ? _('OAuth sign-in · Unofficial access; your account could be limited or suspended.')
                            : _('API key · Paste a key from the provider’s site.'),
                    active: selected.has(meta.id),
                });
                if (meta.terms)
                    row.add_prefix(new Gtk.Image({icon_name: 'dialog-warning-symbolic'}));
                row.connect('notify::active', () => row.active ? selected.add(meta.id) : selected.delete(meta.id));
                choices.add(row);
            }
        } else if (step === 'connect') {
            const chosen = selectedProviders(providers, [...selected]);
            if (!chosen.length)
                group(page, _('No providers selected'), _('You can continue now and connect accounts later in Accounts.'));
            if (chosen.length) {
                const progress = group(page, _('Connect your accounts'));
                const refreshProgress = () => {
                    const states = Object.fromEntries([...accounts.controllers].map(([id, controller]) => [id, controller.snapshot()]));
                    progress.description = stepComplete('connect', chosen.map(meta => meta.id), states)
                        ? _('All chosen accounts are connected.')
                        : _('Connect one provider at a time. A failed sign-in does not stop you from continuing.');
                };
                for (const meta of chosen) {
                    const unsubscribe = accounts.controllers.get(meta.id).subscribe(refreshProgress);
                    views.push({dispose: unsubscribe});
                }
                handlerIds.push(settings.connect('changed::account-status', refreshProgress));
                refreshProgress();
            }
            const oauth = chosen.filter(meta => meta.auth === 'oauth-pkce');
            if (oauth.some(meta => !accounts.controllers.get(meta.id).snapshot().hasConfig)) {
                const helper = group(page, _('Set up the public client ids'), _('Run this command in a terminal, then come back. The helper looks for public client ids in installed programs using PATH and writes providers.local.json. This extension does not run it.'));
                const command = helperCommand(extensionPath, oauth.map(meta => meta.id));
                const label = new Gtk.Label({label: command, selectable: true, xalign: 0, css_classes: ['monospace']});
                // Preserve the one-line command; horizontal scrolling keeps narrow windows usable.
                const scroll = new Gtk.ScrolledWindow({hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                    vscrollbar_policy: Gtk.PolicyType.NEVER, child: label, margin_top: 8, margin_bottom: 8});
                helper.add(scroll);
                const copy = new Gtk.Button({label: _('Copy command'), halign: Gtk.Align.END});
                copy.connect('clicked', () => {
                    Gdk.Display.get_default().get_clipboard().set(command);
                    window.add_toast(new Adw.Toast({title: _('Command copied.')}));
                });
                helper.add(copy);
            }
            for (const meta of chosen) {
                const context = {meta, window, settings, gettext: _, handlerIds, extensionPath, controller: accounts.controllers.get(meta.id)};
                const view = meta.auth === 'api-key' ? apiKeyGroup(context) : oauthGroup(context);
                views.push(view);
                page.add(view.group);
            }
        } else if (step === 'bar') {
            const bar = group(page, _('Top bar'), _('Choose where quotas appear and how many providers are shown. Changes apply as you make them.'));
            const positions = ['left', 'center', 'right'];
            const position = new Adw.ComboRow({title: _('Position'), model: Gtk.StringList.new([_('Left'), _('Center'), _('Right')]), selected: positions.indexOf(settings.get_string('position'))});
            position.connect('notify::selected', () => settings.set_string('position', positions[position.selected]));
            handlerIds.push(settings.connect('changed::position', () => { position.selected = positions.indexOf(settings.get_string('position')); }));
            bar.add(position);
            const count = new Adw.SpinRow({title: _('Providers on the bar'), adjustment: new Gtk.Adjustment({lower: 1, upper: 5, step_increment: 1})});
            settings.bind('bar-count', count, 'value', Gio.SettingsBindFlags.DEFAULT);
            views.push({dispose: () => Gio.Settings.unbind(count, 'value')});
            bar.add(count);
        } else if (step === 'notifications') {
            const alerts = group(page, _('Notifications'), _('Notifications are on by default. One notice is sent when a quota crosses its threshold. Do Not Disturb holds banners. This setup sends no test notification.'));
            const enabled = new Adw.SwitchRow({title: _('Send notifications')});
            settings.bind('notifications-enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
            alerts.add(enabled);
            const percent = new Adw.SpinRow({title: _('Notify at'), subtitle: _('Used percentage · applies to all quota types'), adjustment: new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1}), value: settings.get_int('alert-session-percent')});
            percent.connect('notify::value', () => {
                for (const kind of ['session', 'week', 'month', 'credits'])
                    settings.set_int(`alert-${kind}-percent`, percent.value);
            });
            alerts.add(percent);
            views.push({dispose: () => Gio.Settings.unbind(enabled, 'active')});
            action(alerts, _('More notification settings'), () => { close(); window.set_visible_page(notificationsPage); });
        } else {
            const summary = group(page, _('Setup complete'), _('You can change these choices later. Select an account to review it.'));
            const rows = new Map(providers.map(meta => [meta.id,
                action(summary, meta.name, () => { close(); accounts.show(meta.id); })]));
            const labels = {connected: _('Connected'), failed: _('Needs attention'), 'not-connected': _('Not connected'), skipped: _('Skipped')};
            const refreshSummary = () => {
                const states = Object.fromEntries([...accounts.controllers].map(([id, controller]) => [id, controller.snapshot()]));
                for (const item of connectionSummary(providers, [...selected], states))
                    rows.get(item.id).title = fmt(_('%s · %s'), item.name, labels[item.status]);
            };
            for (const controller of accounts.controllers.values())
                views.push({dispose: controller.subscribe(refreshSummary)});
            handlerIds.push(settings.connect('changed::account-status', refreshSummary));
            refreshSummary();
        }
        navigation.replace([new Adw.NavigationPage({title: outer.title, child: page})]);
        next.grab_focus();
    }
    back.connect('clicked', () => { index--; show(); });
    next.connect('clicked', () => { if (index === SETUP_STEPS.length - 1) close(); else { index++; show(); } });
    skip.connect('clicked', () => {
        if (index === 0) { close(); return; }
        if (SETUP_STEPS[index] === 'providers')
            selected.clear();
        index++;
        show();
    });
    show();
    window.push_subpage(outer);
    return {close, page: outer};
}
