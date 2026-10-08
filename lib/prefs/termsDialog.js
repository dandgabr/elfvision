// The terms-of-service confirmation before a sign-in (docs/adr/0003, 0010). One implementation, used by
// every view of an account: Cancel is the default, Antigravity gets the stronger text, and the answer
// is the only thing that lets the controller write `terms-acknowledged`.

import Adw from 'gi://Adw';

import {fmt} from '../core/viewmodel.js';

/**
 * @param {object} options
 * @param {Adw.PreferencesWindow} options.window
 * @param {(msgid: string) => string} options.gettext
 * @returns {(meta: object) => Promise<boolean>} asks, and resolves true only on the explicit "go"
 */
export function termsConfirmer({window, gettext: _}) {
    const pending = new Set();
    const confirm = meta => new Promise(resolve => {
        const strong = meta.terms === 'strong';
        const dialog = new Adw.AlertDialog(meta.id === 'claude'
            ? {
                heading: fmt(_('Using %s this way breaks its terms'), meta.name),
                body: _('Anthropic does not permit third-party applications to offer Claude.ai sign-in or collect and store its session tokens. This extension uses that unofficial access. Your account could be limited or suspended. Continuing does not grant permission from Anthropic.'),
            }
            : strong
            ? {
                heading: fmt(_('Using %s this way breaks its terms'), meta.name),
                body: fmt(_('This extension signs in the way the official app does. The terms of %s forbid that, and Google could suspend your whole Google account (Gmail and Drive included), not only this service. The sign-in also gives access to your Google Cloud data. Use it only if you accept that risk.'), meta.name),
            }
            : {
                heading: fmt(_('Using %s this way may break its terms'), meta.name),
                body: _('This extension signs in the way the official app does, which the terms may not allow. Your account could be limited or suspended. Use it at your own risk.'),
            });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('go', strong ? _('Connect anyway') : _('I understand, connect'));
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        pending.add(dialog);
        dialog.connect('response', (_dialog, response) => {
            pending.delete(dialog);
            resolve(response === 'go');
        });
        dialog.present(window);
    });
    confirm.cancel = () => {
        for (const dialog of pending)
            dialog.close();
    };
    return confirm;
}
