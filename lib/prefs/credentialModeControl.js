import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {fmt} from '../core/viewmodel.js';
import {harnessCredentialSource} from '../core/harnessSources.js';
import {announceChange} from './status.js';

/** A connector-scoped opt-in; the external credential remains owned by its source application. */
export function credentialModeControl({group, meta, connector, store, settings, window, gettext: _, toast, controller, confirmTerms = null}) {
    if (!connector || !store)
        return {dispose() {}};
    const source = harnessCredentialSource(meta.id);
    if (!source) {
        group.add(new Adw.ActionRow({title: _('Use credentials from a local tool'),
            subtitle: _('No verified local credential source is available for this provider.')}));
        return {dispose() {}};
    }

    let mode = store.get(connector.id)?.credentialMode ?? connector.credentialMode ?? 'extension';
    let disposed = false, syncing = false, dialog = null;
    const row = new Adw.SwitchRow({title: _('Use credentials from a local tool'),
        subtitle: source.path
            ? fmt(_('Off (default): Elfvision manages its own credential. On: read %s for quota checks; the tool keeps and renews it.'), source.path)
            : fmt(_('Off (default): Elfvision manages its own credential. On: read the %s keyring item for quota checks; the tool keeps and renews it.'), source.service),
        active: mode === 'harness'});
    group.add(row);
    const retryRow = new Adw.ActionRow({title: fmt(_('Check quota using %s again'), source.owner),
        subtitle: _('Use this after the tool renews an expired token.'), visible: mode === 'harness'});
    const retry = new Gtk.Button({label: _('Check now'), valign: Gtk.Align.CENTER});
    retryRow.add_suffix(retry);
    group.add(retryRow);
    retry.connect('clicked', () => {
        if (disposed || mode !== 'harness') return;
        announceChange(settings, connector.id);
        controller?.refresh();
    });

    const sync = () => {
        syncing = true;
        row.active = mode === 'harness';
        syncing = false;
    };
    const unsubscribeStore = store.subscribe(() => {
        if (disposed) return;
        const next = store.get(connector.id)?.credentialMode ?? 'extension';
        if (next === mode) return;
        mode = next;
        retryRow.visible = mode === 'harness';
        sync();
        controller?.refresh();
    });
    const save = value => {
        try {
            store.update(connector.id, {credentialMode: value});
            mode = value;
            retryRow.visible = mode === 'harness';
            announceChange(settings, connector.id);
            controller?.refresh();
            if (value === 'harness')
                toast(fmt(_('Using credentials from %s. If its token expires, open %s to renew it.'), source.owner, source.owner));
        } catch (_error) {
            toast(_('The credential mode could not be changed.'));
        }
        sync();
    };
    row.connect('notify::active', () => {
        if (syncing || disposed || dialog)
            return;
        if (row.active && mode !== 'harness') {
            sync();
            dialog = new Adw.AlertDialog({heading: fmt(_('Use credentials from %s?'), source.owner),
                body: source.path
                    ? fmt(_('Elfvision will read the selected credential from %s and send it to %s only to check quota. It will not copy, renew or remove it. If %s does not renew an expired token, quota checks will stop until you sign in there again.'), source.path, meta.apiHosts[0], source.owner)
                    : fmt(_('Elfvision will read the selected credential from the %s keyring item and send it to %s only to check quota. It will not copy, renew or remove it. If %s does not renew an expired token, quota checks will stop until you sign in there again.'), source.service, meta.apiHosts[0], source.owner)});
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('use', _('Use this credential'));
            dialog.set_default_response('cancel');
            dialog.set_close_response('cancel');
            dialog.connect('response', (_dialog, response) => {
                dialog = null;
                if (!disposed && response === 'use') {
                    (async () => {
                        if (meta.terms && confirmTerms && !await confirmTerms(meta)) return;
                        if (!disposed) save('harness');
                    })();
                }
            });
            dialog.present(window);
        } else if (!row.active && mode === 'harness') {
            save('extension');
        }
    });
    return {get mode() { return mode; }, dispose() { if (disposed) return; disposed = true; unsubscribeStore(); dialog?.close(); dialog = null; confirmTerms?.cancel?.(); }};
}
