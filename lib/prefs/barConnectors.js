// GTK controls that choose which connectors take the slots of the top bar; account credentials and
// polling state are never touched here.
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {decodeConnectors} from '../core/connectors.js';
import {barKeys, setBarSelected} from '../core/popup.js';
import {providerMeta} from '../core/providerRegistry.js';
import {fmt} from '../core/viewmodel.js';
import {safeText} from '../core/text.js';

export function barConnectorsPage({window, settings, gettext: _, handlerIds}) {
    const content = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({title: _('Connectors on the top bar'),
        description: _('Choose which connectors take the slots of the top bar. If more are chosen than there are slots, the first ones in the list are shown.')});
    content.add(group);
    const automatic = new Adw.SwitchRow({title: _('Choose automatically'),
        subtitle: _('Shows the most used connectors, worst first.')});
    group.add(automatic);

    let closed = false;
    let syncing = false;
    let closeHandler = 0;
    let currentRows = [];
    const switches = new Map();
    const ownedHandlers = [];

    const registry = demo => {
        try {
            return decodeConnectors(settings.get_string(demo ? 'demo-connectors' : 'connectors'), {demo});
        } catch (_error) {
            return null;
        }
    };
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
    };
    const rebuild = () => {
        if (closed)
            return;
        const demo = settings.get_string('data-source') === 'demo';
        const key = barKeys(demo).selected;
        const entries = registry(demo);
        const selected = settings.get_strv(key);
        syncing = true;
        automatic.active = selected.length === 0;
        syncing = false;
        // Rebuilding removes the focused switch: remember which one it was and focus its replacement.
        let focusedId = null;
        for (const [id, widget] of switches) {
            if (widget.has_focus) focusedId = id;
        }
        switches.clear();
        currentRows.forEach(row => group.remove(row));
        currentRows = [];
        for (const entry of entries ?? []) {
            const name = safeText(entry.label || providerMeta(entry.providerId)?.name || entry.id, 64);
            const row = new Adw.ActionRow({title: GLib.markup_escape_text(name, -1), subtitle: _('Show on the top bar')});
            const shown = new Gtk.Switch({valign: Gtk.Align.CENTER, active: selected.includes(entry.id)});
            shown.update_property([Gtk.AccessibleProperty.LABEL], [fmt(_('%s: Show on the top bar'), name)]);
            row.add_suffix(shown);
            row.activatable_widget = shown;
            switches.set(entry.id, shown);
            row.sensitive = !automatic.active;
            shown.connect('notify::active', () => {
                if (syncing)
                    return;
                // Read the latest registry and choice; never overwrite another process's change.
                const latest = registry(demo);
                if (!latest)
                    return;
                settings.set_strv(key, setBarSelected(latest, settings.get_strv(key), entry.id, shown.active));
            });
            group.add(row);
            currentRows.push(row);
        }
        if (focusedId !== null)
            switches.get(focusedId)?.grab_focus();
        if (!entries?.length) {
            const row = new Adw.ActionRow({
                title: entries === null ? _('Connector configuration is unavailable. Recover the list in Accounts.') : _('No connectors'),
                subtitle: _('Add a connector in Accounts.')});
            group.add(row);
            currentRows.push(row);
        }
    };
    automatic.connect('notify::active', () => {
        if (syncing)
            return;
        const demo = settings.get_string('data-source') === 'demo';
        const key = barKeys(demo).selected;
        if (automatic.active) {
            settings.set_strv(key, []);
            return;
        }
        // Leaving automatic starts from every connector; the user then switches some off.
        const latest = registry(demo);
        if (latest?.length)
            settings.set_strv(key, latest.map(entry => entry.id));
        else
            rebuild();
    });
    for (const key of ['data-source', 'connectors', 'demo-connectors', 'bar-connectors', 'demo-bar-connectors']) {
        const id = settings.connect(`changed::${key}`, rebuild);
        ownedHandlers.push(id);
        handlerIds.push(id);
    }
    closeHandler = window.connect('close-request', () => { dispose(); return false; });
    rebuild();

    const toolbar = new Adw.ToolbarView();
    toolbar.add_top_bar(new Adw.HeaderBar());
    toolbar.set_content(content);
    const navigation = new Adw.NavigationPage({title: _('Top bar connectors'), child: toolbar});
    navigation.connect('hiding', dispose);
    return navigation;
}

export function addBarConnectorsRow({group, window, settings, gettext: _, handlerIds}) {
    const row = new Adw.ActionRow({title: _('Connectors on the bar'),
        subtitle: _('Choose which connectors take the slots, or let the most used ones show.'), activatable: true});
    row.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    row.connect('activated', () => window.push_subpage(barConnectorsPage({window, settings, gettext: _, handlerIds})));
    group.add(row);
}
