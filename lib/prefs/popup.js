// GTK presentation controls; account credentials and polling state are never touched here.
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {decodeConnectors} from '../core/connectors.js';
import {popupKeys, popupPresentation, moveConnector, setPopupVisibility} from '../core/popup.js';
import {providerMeta} from '../core/providerRegistry.js';
import {fmt} from '../core/viewmodel.js';
import {safeText} from '../core/text.js';

function dimensionRows(group, settings, key, title, autoTitle, automaticValue, minimum, _, handlerIds) {
    const automatic = new Adw.SwitchRow({title: autoTitle, subtitle: _('Fits the available space on the current monitor.')});
    const value = new Adw.SpinRow({title, subtitle: _('Logical pixels. The screen limits the displayed size without changing this value.'),
        adjustment: new Gtk.Adjustment({lower: minimum, upper: 8192, step_increment: 10, page_increment: 100})});
    let syncing = false;
    const sync = () => {
        syncing = true;
        const configured = settings.get_int(key);
        automatic.active = configured === 0;
        value.sensitive = configured !== 0;
        value.value = configured || automaticValue;
        syncing = false;
    };
    sync();
    automatic.connect('notify::active', () => {
        if (!syncing)
            settings.set_int(key, automatic.active ? 0 : Math.round(value.value));
    });
    value.connect('notify::value', () => {
        if (!syncing && !automatic.active)
            settings.set_int(key, Math.round(value.value));
    });
    handlerIds.push(settings.connect(`changed::${key}`, sync));
    group.add(automatic);
    group.add(value);
}

export function popupPresentationPage({window, settings, gettext: _, handlerIds}) {
    const content = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({title: _('Connector order and visibility'),
        description: _('Hidden connectors keep updating, sending alerts and appearing on the top bar. Use the arrow buttons to change popup order.')});
    content.add(group);
    const rows = new Map();
    let currentRows = [];
    let registryProblem = null;
    let closed = false;
    let closeHandler = 0;
    const ownedHandlers = [];
    const dispose = () => {
        if (closed)
            return;
        closed = true;
        if (closeHandler) {
            window.disconnect(closeHandler);
            closeHandler = 0;
        }
        for (const id of ownedHandlers) {
            const index = handlerIds.indexOf(id);
            if (index >= 0) {
                handlerIds.splice(index, 1);
                settings.disconnect(id);
            }
        }
        rows.clear();
    };
    const rebuild = () => {
        if (closed)
            return;
        const focused = window.get_focus();
        const focusedControls = [...rows.values()].find(controls => focused?.is_ancestor(controls.row));
        const demo = settings.get_string('data-source') === 'demo';
        const keys = popupKeys(demo);
        let entries;
        try {
            entries = decodeConnectors(settings.get_string(demo ? 'demo-connectors' : 'connectors'), {demo});
        } catch (_error) {
            entries = [];
            registryProblem = _('Connector configuration is unavailable. Recover the list in Accounts.');
        }
        const ordered = popupPresentation(entries, settings.get_strv(keys.order));
        const hidden = new Set(settings.get_strv(keys.hidden));
        const validRows = new Set(entries.map(entry => `${demo}:${entry.id}`));
        for (const rowKey of rows.keys()) {
            if (rowKey.startsWith(`${demo}:`) && !validRows.has(rowKey))
                rows.delete(rowKey);
        }
        currentRows.forEach(row => group.remove(row));
        currentRows = [];
        for (let index = 0; index < ordered.length; index++) {
            const entry = ordered[index];
            const rowKey = `${demo}:${entry.id}`;
            let controls = rows.get(rowKey);
            if (!controls) {
                const row = new Adw.ActionRow({title: GLib.markup_escape_text(safeText(entry.label || providerMeta(entry.providerId)?.name || entry.id, 64), -1),
                    subtitle: _('Show in popup')});
                const shown = new Gtk.Switch({valign: Gtk.Align.CENTER, active: !hidden.has(entry.id)});

                const up = new Gtk.Button({icon_name: 'go-up-symbolic', valign: Gtk.Align.CENTER, tooltip_text: _('Move up')});
                const down = new Gtk.Button({icon_name: 'go-down-symbolic', valign: Gtk.Align.CENTER, tooltip_text: _('Move down')});

                row.add_suffix(up); row.add_suffix(down); row.add_suffix(shown);
                controls = {row, up, down, shown, syncing: false};
                shown.connect('notify::active', () => {
                    if (controls.syncing)
                        return;
                    try {
                        const latest = decodeConnectors(settings.get_string(demo ? 'demo-connectors' : 'connectors'), {demo});
                        settings.set_strv(keys.hidden, setPopupVisibility(latest, settings.get_strv(keys.hidden), entry.id, shown.active));
                    } catch (_error) { /* Unavailable registries are never rewritten. */ }
                });
                const move = direction => {
                    // Always read the current registry; never overwrite another process's new connector.
                    try {
                        const latest = decodeConnectors(settings.get_string(demo ? 'demo-connectors' : 'connectors'), {demo});
                        settings.set_strv(keys.order, moveConnector(latest, settings.get_strv(keys.order), entry.id, direction));
                    } catch (_error) { /* The recovery row describes unavailable configuration. */ }
                };
                up.connect('clicked', () => move(-1));
                down.connect('clicked', () => move(1));
                rows.set(rowKey, controls);
            }
            controls.row.title = GLib.markup_escape_text(safeText(entry.label || providerMeta(entry.providerId)?.name || entry.id, 64), -1);
            const name = safeText(entry.label || providerMeta(entry.providerId)?.name || entry.id, 64);
            controls.shown.update_property([Gtk.AccessibleProperty.LABEL], [fmt(_('%s: Show in popup'), name)]);
            controls.up.update_property([Gtk.AccessibleProperty.LABEL], [fmt(_('%s: Move up'), name)]);
            controls.down.update_property([Gtk.AccessibleProperty.LABEL], [fmt(_('%s: Move down'), name)]);
            controls.syncing = true;
            controls.shown.active = !hidden.has(entry.id);
            controls.syncing = false;
            controls.up.sensitive = index > 0;
            controls.down.sensitive = index < ordered.length - 1;
            group.add(controls.row);
            currentRows.push(controls.row);
        }
        if (!ordered.length) {
            const row = new Adw.ActionRow({title: registryProblem || _('No connectors'), subtitle: _('Add a connector in Accounts.')});
            group.add(row);
            currentRows.push(row);
        }
        registryProblem = null;
        if (focused?.sensitive)
            focused.grab_focus();
        else if (focusedControls && currentRows.includes(focusedControls.row))
            [focusedControls.up, focusedControls.down, focusedControls.shown].find(widget => widget.sensitive)?.grab_focus();
    };
    for (const key of ['data-source', 'connectors', 'demo-connectors', 'popup-connector-order', 'popup-hidden-connectors', 'demo-popup-connector-order', 'demo-popup-hidden-connectors'])
    {
        const id = settings.connect(`changed::${key}`, rebuild);
        ownedHandlers.push(id);
        handlerIds.push(id);
    }
    closeHandler = window.connect('close-request', () => { dispose(); return false; });
    rebuild();
    const toolbar = new Adw.ToolbarView();
    toolbar.add_top_bar(new Adw.HeaderBar());
    toolbar.set_content(content);
    const navigation = new Adw.NavigationPage({title: _('Popup connectors'), child: toolbar});
    // GTK can unmap while the navigation page is being presented. Only leaving
    // the subpage ends its settings subscription; window close is handled above.
    navigation.connect('hiding', dispose);
    return navigation;
}

export function addPopupControls({group, window, settings, gettext: _, handlerIds}) {
    dimensionRows(group, settings, 'popup-width', _('Popup width'), _('Automatic width'), 420, 320, _, handlerIds);
    dimensionRows(group, settings, 'popup-max-height', _('Maximum popup height'), _('Automatic height'), 720, 240, _, handlerIds);
    const presentation = new Adw.ActionRow({title: _('Connector order and visibility'),
        subtitle: _('Choose which connectors appear in the popup and their order.'), activatable: true});
    presentation.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    presentation.connect('activated', () => window.push_subpage(popupPresentationPage({window, settings, gettext: _, handlerIds})));
    group.add(presentation);
}
