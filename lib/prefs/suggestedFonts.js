// Explicit preferences action; construction and theme selection perform no download/install.
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import {FontInstallController} from '../core/fontInstall.js';
import {FontInstaller} from '../services/fontInstaller.js';
import {fmt} from '../core/viewmodel.js';

export function createSuggestedFontsGroup({window, gettext: _, installer = new FontInstaller()}) {
    let destroyed = false;
    const dialogs = new Set();
    const group = new Adw.PreferencesGroup({title: _('Suggested fonts'),
        description: _('Optional fonts for selected themes. Themes keep using installed-font fallbacks until fonts are available.')});
    const row = new Adw.ActionRow({title: _('Install suggested fonts…'),
        subtitle: _('Poppins, Inter and JetBrains Mono. Review the source and licenses before downloading.')});
    const action = new Gtk.Button({label: _('Review…'), valign: Gtk.Align.CENTER});
    const cancel = new Gtk.Button({label: _('Cancel'), valign: Gtk.Align.CENTER, visible: false});
    row.add_suffix(action); row.add_suffix(cancel); group.add(row);
    const confirm = plan => new Promise(resolve => {
        if (destroyed) { resolve(false); return; }
        const details = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 12});
        const add = text => details.append(new Gtk.Label({label: text, wrap: true, wrap_mode: Pango.WrapMode.WORD_CHAR, max_width_chars: 48, selectable: true, xalign: 0}));
        add(fmt(_('Source: %s'), plan.host));
        add(fmt(_('Pinned revision: %s'), plan.revision));
        add(fmt(_('Total download: %d bytes'), plan.bytes));
        for (const entry of plan.files) {
            add(`${entry.family}\n${fmt(_('%d bytes · SIL Open Font License 1.1'), entry.size)}\nSHA-256: ${entry.sha256}\n${entry.licenseUrl}`);
        }
        const review = new Gtk.ScrolledWindow({child: details, max_content_height: 320, propagate_natural_height: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER});
        const dialog = new Adw.AlertDialog({heading: _('Install suggested fonts?'),
            body: _('Download four verified font files from GitHub and install them for your user account. Existing files are preserved. Choosing a theme never installs fonts.'),
            extra_child: review});
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('install', _('Download and install'));
        dialog.set_response_appearance('install', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('cancel'); dialog.set_close_response('cancel');
        dialogs.add(dialog);
        dialog.connect('response', (_dialog, response) => { dialogs.delete(dialog); resolve(!destroyed && response === 'install'); });
        dialog.present(window);
    });
    const controller = new FontInstallController({confirm, installer, changed(state) {
        if (destroyed) return;
        action.sensitive = !['reviewing', 'installing'].includes(state.status);
        cancel.visible = state.status === 'installing';
        const messages = {
            reviewing: _('Review the font sources and licenses.'),
            cancelled: _('Cancelled. Installed-font fallbacks remain available.'),
            failed: _('Fonts were not installed. Check the connection or installation permissions and try again; existing files were preserved.'),
        };
        if (state.status === 'failed' && state.reason === 'existing_conflict') row.subtitle = _('An existing font file conflicts with this version. It was preserved; no files were replaced.');
        else if (state.status === 'failed' && ['digest_mismatch', 'invalid_font', 'redirect_rejected', 'size_limit', 'license_missing', 'license_mismatch'].includes(state.reason))
            row.subtitle = _('Font verification failed. Nothing was installed; installed-font fallbacks remain available.');
        else if (state.status === 'failed' && state.reason === 'unsafe_directory') row.subtitle = _('The font installation directory is unsafe. Nothing was installed; existing files were preserved.');
        else if (state.status === 'installing') row.subtitle = fmt(_('Downloading: %d of %d bytes'), state.bytes ?? 0, state.total);
        else if (state.status === 'installed') row.subtitle = state.restartRequired
            ? _('Fonts installed. Reopen applications or sign in again if they still use a fallback.')
            : _('Fonts installed. Applications may need to be reopened to use them.');
        else if (messages[state.status]) row.subtitle = messages[state.status];
    }});
    action.connect('clicked', () => { void controller.start(); });
    cancel.connect('clicked', () => controller.cancel());
    return {group, destroy() {
        if (destroyed) return;
        destroyed = true;
        for (const dialog of dialogs) dialog.close();
        dialogs.clear(); controller.destroy(); installer.destroy();
    }};
}
