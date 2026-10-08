// A local-only deletion action. Confirmation defaults to Cancel; opening or dismissing it
// never calls the service. Results contain fixed categories only, never backend diagnostics.
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {getDisconnectGate} from '../services/disconnectGate.js';
import {disconnectAll} from '../services/disconnectAll.js';

export function buildDisconnectGroup({window, settings, gettext: _, demo = settings.get_string('data-source') === 'demo', gate = null, run = disconnectAll, beforeDelete = () => {}, onBusyChange = () => {}}) {
    if (!demo) gate ??= getDisconnectGate();
    const group = new Adw.PreferencesGroup({title: demo ? _('Fictional connector data') : _('Local account data')});
    const row = new Adw.ActionRow({title: _('Delete all connectors'),
        subtitle: _('Remove local credentials, quota snapshots and alert history. Provider sessions stay valid on their sites.')});
    const button = new Gtk.Button({label: _('Delete all connectors'), valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
    row.add_suffix(button); group.add(row);
    let disposed = false, busy = false, dialog = null, lastFailure = '', demoResult = null;
    const render = () => {
        if (disposed) return;
        const state = demo ? {transaction: demoResult} : gate.snapshot(), result = state.transaction;
        button.sensitive = !busy && !['draining', 'deleting'].includes(result?.phase);
        const presentation = disconnectPresentation(state, _, {busy, lastFailure, demo});
        button.label = presentation.label;
        row.subtitle = presentation.subtitle;
    };
    const unsubscribe = demo ? () => {} : gate.subscribe(render);
    async function remove() {
        busy = true; lastFailure = ''; onBusyChange(true); render();
        try { beforeDelete(); const result = await run({settings, gate, demo}); if (demo) demoResult = result; }
        catch (error) {
            if (!disposed) lastFailure = demo ? _('The fictional connector list could not be cleared. Retry deletion.') : error.code === 'restart-computer-required'
                ? _('An older extension was running without credential coordination. Restart the computer, then retry local disconnection. Account changes remain blocked.')
                : _('Local disconnection could not start. Credential coordination is unavailable; no success was reported.');
        } finally { busy = false; if (!disposed) { onBusyChange(false); render(); } }
    }
    button.connect('clicked', () => {
        if (disposed || busy || dialog) return;
        dialog = new Adw.AlertDialog({heading: demo ? _('Delete all fictional connectors?') : _('Delete all live connectors locally?'),
            body: demo ? _('Remove every fictional connector, simulated connection and its tracking choice. Real connectors, credentials and cached live quota data are kept.') : _('Remove every live connector, its local API keys and OAuth sign-ins, quota snapshots, alert history and account status. Appearance, terms acknowledgements, local configuration, themes and fonts stay saved. This does not revoke provider sessions or API keys on their sites.')});
        dialog.add_response('cancel', _('Cancel')); dialog.add_response('disconnect', _('Delete all connectors'));
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
export function disconnectPresentation(state, _, {busy = false, lastFailure = '', demo = false} = {}) {
    const result = state.transaction;
    const scoped = !!result?.target;
    const label = (lastFailure || result?.phase === 'failed') && !scoped ? _('Retry deletion') : _('Delete all connectors');
    if (demo) return {label, subtitle: busy ? _('Removing fictional connectors…') : lastFailure || (result?.phase === 'complete'
        ? _('All fictional connectors were deleted. Real accounts and live quota data were kept.')
        : _('Delete fictional connectors and simulated connections. Real accounts and live quota data are kept.'))};
    let subtitle = _('Delete live connectors, local credentials, quota snapshots and alert history. Provider sessions stay valid on their sites.');
    if (busy || ['draining', 'deleting'].includes(result?.phase)) subtitle = _('Stopping pending operations and removing local data…');
    else if (lastFailure) subtitle = lastFailure;
    else if (result?.phase === 'complete') subtitle = scoped
        ? _('One connector’s credential was removed. Other accounts and cached data were kept.')
        : _('Live connectors, local credentials and cached data removed. Provider sessions stay valid on their sites.');
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
