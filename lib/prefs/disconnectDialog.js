// A local-only deletion action. Confirmation defaults to Cancel; opening or dismissing it
// never calls the service. Results contain fixed categories only, never backend diagnostics.
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {getDisconnectGate} from '../services/disconnectGate.js';
import {disconnectAll} from '../services/disconnectAll.js';

export function buildDisconnectGroup({window, settings, gettext: _, gate = getDisconnectGate(), run = disconnectAll}) {
    const group = new Adw.PreferencesGroup({title: _('Local account data')});
    const row = new Adw.ActionRow({title: _('Disconnect all accounts'),
        subtitle: _('Remove local credentials, quota snapshots and alert history. Provider sessions stay valid on their sites.')});
    const button = new Gtk.Button({label: _('Disconnect all'), valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
    row.add_suffix(button); group.add(row);
    let disposed = false, busy = false, dialog = null, lastFailure = '';
    const render = () => {
        if (disposed) return;
        const state = gate.snapshot(), result = state.transaction;
        button.sensitive = !busy && !['draining', 'deleting'].includes(result?.phase);
        const presentation = disconnectPresentation(state, _, {busy, lastFailure});
        button.label = presentation.label;
        row.subtitle = presentation.subtitle;
    };
    const unsubscribe = gate.subscribe(render);
    async function remove() {
        busy = true; lastFailure = ''; render();
        try { await run({settings, gate}); }
        catch (error) {
            if (!disposed) lastFailure = error.code === 'restart-computer-required'
                ? _('An older extension was running without credential coordination. Restart the computer, then retry local disconnection. Account changes remain blocked.')
                : _('Local disconnection could not start. Credential coordination is unavailable; no success was reported.');
        } finally { busy = false; render(); }
    }
    button.connect('clicked', () => {
        if (disposed || busy || dialog) return;
        dialog = new Adw.AlertDialog({heading: _('Disconnect all accounts locally?'),
            body: _('Remove this extension’s API keys and OAuth sign-ins from the keyring, its live quota snapshots, alert history and account status. Your settings, tracking choices, terms acknowledgements, local configuration, themes and fonts stay saved. This does not revoke provider sessions or API keys on their sites.')});
        dialog.add_response('cancel', _('Cancel')); dialog.add_response('disconnect', _('Disconnect all'));
        dialog.set_response_appearance('disconnect', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel'); dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => { dialog = null; if (!disposed && response === 'disconnect') remove(); });
        dialog.present(window);
    });
    const closeHandler = window.connect('close-request', () => { dispose(); return false; });
    function dispose() {
        if (disposed) return; disposed = true; unsubscribe(); dialog?.close(); dialog = null; window.disconnect(closeHandler);
    }
    render(); return {group, button, row, dispose};
}


/** Fixed copy reflects the actual durable deletion scope; it never exposes connector labels. */
export function disconnectPresentation(state, _, {busy = false, lastFailure = ''} = {}) {
    const result = state.transaction;
    const scoped = !!result?.target;
    const label = result?.phase === 'failed' && !scoped ? _('Retry disconnection') : _('Disconnect all');
    let subtitle = _('Remove local credentials, quota snapshots and alert history. Provider sessions stay valid on their sites.');
    if (busy || ['draining', 'deleting'].includes(result?.phase)) subtitle = _('Stopping pending operations and removing local data…');
    else if (lastFailure) subtitle = lastFailure;
    else if (result?.phase === 'complete') subtitle = scoped
        ? _('One connector’s credential was removed. Other accounts and cached data were kept.')
        : _('Local credentials and cached data removed. Provider sessions stay valid on their sites.');
    else if (result?.problem === 'restart-computer-required') subtitle = scoped
        ? _('An older extension was running without credential coordination. Restart the computer, then retry removal in that connector’s settings. Account changes remain blocked.')
        : _('An older extension was running without credential coordination. Restart the computer, then retry local disconnection. Account changes remain blocked.');
    else if (['orphaned-write', 'orphaned-delete'].includes(result?.problem)) subtitle = scoped
        ? _('A keyring operation lost its process before completion. Restart the computer, then retry removal in that connector’s settings. Account changes remain blocked.')
        : _('A keyring operation lost its process before completion. Restart the computer, then retry. Account changes remain blocked.');
    else if (result?.problem === 'drain-timeout') subtitle = scoped
        ? _('An operation has not acknowledged stopping. Close other Preferences windows, wait, then retry removal in that connector’s settings.')
        : _('An operation has not acknowledged stopping. Close other Preferences windows, wait for pending keyring operations, then retry. Account changes remain blocked.');
    else if (result?.phase === 'failed' && scoped) subtitle = _('One connector could not be removed. Unlock the keyring and retry removal in that connector’s settings. Other connectors were not selected for deletion.');
    else if (result?.phase === 'failed' && (Object.values(result.files ?? {}).some(value => value !== 'absent' && value !== 'preserved') || result.status === 'failed'))
        subtitle = _('Some cached data or account status could not be cleared. Check access to the extension’s cache directory and retry. Account changes remain blocked.');
    else if (result?.phase === 'failed') subtitle = _('Some credentials could not be removed. Unlock the keyring and retry. Affected accounts remain blocked.');
    return {label, subtitle};
}
