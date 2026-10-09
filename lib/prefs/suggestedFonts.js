// Explicit preferences action; construction and theme selection perform no download/install.
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import {FontInstallController} from '../core/fontInstall.js';
import {themeFontCoverage} from '../core/fontCoverage.js';
import {FontInstaller} from '../services/fontInstaller.js';
import {fmt} from '../core/viewmodel.js';

function shellRefreshRequest(settings, resolveWait) {
    if (!settings)
        return Promise.resolve('unknown');
    const key = 'font-refresh-request';
    let request = (settings.get_int(key) + 1) % 2147483647;
    if (request === settings.get_int('font-refresh-ack'))
        request = (request + 1) % 2147483647;
    return new Promise(resolve => {
        let timer = 0, handler = 0, finished = false;
        const finish = status => {
            if (finished)
                return;
            finished = true;
            if (timer)
                GLib.source_remove(timer);
            if (handler)
                settings.disconnect(handler);
            resolveWait(null);
            resolve(status);
        };
        resolveWait(finish);
        const check = () => {
            if (settings.get_int('font-refresh-ack') !== request)
                return;
            const status = settings.get_string('font-refresh-status');
            finish(['available', 'missing', 'failed'].includes(status) ? status : 'failed');
        };
        handler = settings.connect('changed::font-refresh-ack', check);
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => { timer = 0; finish('timeout'); return GLib.SOURCE_REMOVE; });
        settings.set_string('font-refresh-status', 'pending');
        settings.set_int(key, request);
        check();
    });
}

export function createSuggestedFontsGroup({window, gettext: _, settings = null, themes = [], installer = new FontInstaller()}) {
    let destroyed = false;
    const dialogs = new Set();
    let cancelShellWait = null, inventoryGeneration = 0;
    const group = new Adw.PreferencesGroup({title: _('Suggested fonts'),
        description: _('Optional fonts used by the built-in themes. Fonts are checked in the current user and system font directories.')});
    const row = new Adw.ActionRow({title: _('Install suggested fonts…'),
        subtitle: _('Install the reviewed fonts used by all built-in themes. Review the source and licenses before downloading.')});
    const action = new Gtk.Button({label: _('Review…'), valign: Gtk.Align.CENTER});
    const cancel = new Gtk.Button({label: _('Cancel'), valign: Gtk.Align.CENTER, visible: false});
    row.add_suffix(action); row.add_suffix(cancel); group.add(row);
    const coverage = new Adw.ExpanderRow({title: _('Font coverage by theme'), subtitle: _('Checking the fonts visible to this user…')});
    const coverageRows = new Map();
    for (const theme of themes) {
        const child = new Adw.ActionRow({title: theme.name ?? theme.id, subtitle: _('Font status has not been checked.')});
        coverage.add_row(child); coverageRows.set(theme.id, {theme, row: child});
    }
    group.add(coverage);
    const updateCoverage = async () => {
        const generation = ++inventoryGeneration;
        if (typeof installer.fontInventory !== 'function') {
            for (const {row: child} of coverageRows.values()) child.subtitle = _('Fontconfig check is unavailable.');
            return;
        }
        let inventory;
        try { inventory = await installer.fontInventory(); } catch (_error) { inventory = {status: 'unavailable'}; }
        if (destroyed || generation !== inventoryGeneration)
            return;
        if (inventory.status !== 'available') {
            coverage.subtitle = _('Fontconfig could not inspect the fonts for this user.');
            for (const {row: child} of coverageRows.values()) child.subtitle = _('Font status is unavailable.');
            return;
        }
        coverage.subtitle = _('Fontconfig inventory for this user and the system.');
        const sourceText = {user: _('user'), system: _('system'), other: _('other visible directory'),
            'system+user': _('user and system'), 'other+system': _('system and other directory'), 'other+user': _('user and other directory'),
            'other+system+user': _('user, system, and other directory')};
        const roleText = {body: _('Body'), display: _('Display'), mono: _('Monospace')};
        for (const {theme, row: child} of coverageRows.values()) {
            const state = themeFontCoverage(theme, inventory.fonts);
            child.subtitle = ['body', 'display', 'mono'].map(role => {
                const value = state[role];
                if (value.status === 'system')
                    return fmt(_('%s: system default'), roleText[role]);
                if (value.status === 'available')
                    return fmt(_('%s: %s (%s)'), roleText[role], value.family, sourceText[value.source] ?? sourceText.other);
                if (value.status === 'fallback')
                    return fmt(_('%s: using %s fallback (%s)'), roleText[role], value.family, sourceText[value.source] ?? sourceText.other);
                return fmt(_('%s: %s is missing'), roleText[role], value.family ?? _('font'));
            }).join(' · ');
        }
    };
    void updateCoverage();
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
            body: _('Download the reviewed font files from GitHub and install them for your user account. Existing files are preserved. Choosing a theme never installs fonts.'),
            extra_child: review});
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('install', _('Download and install'));
        dialog.set_response_appearance('install', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('cancel'); dialog.set_close_response('cancel');
        dialogs.add(dialog);
        dialog.connect('response', (_dialog, response) => { dialogs.delete(dialog); resolve(!destroyed && response === 'install'); });
        dialog.present(window);
    });
    const controller = new FontInstallController({confirm, installer,
        refreshShell: () => shellRefreshRequest(settings, finish => { cancelShellWait = finish; }),
        cancelShellRefresh: () => { cancelShellWait?.('cancelled'); cancelShellWait = null; }, changed(state) {
        if (destroyed) return;
        action.sensitive = !['reviewing', 'installing', 'verifying'].includes(state.status);
        cancel.visible = ['installing', 'verifying'].includes(state.status);
        const messages = {
            reviewing: _('Review the font sources and licenses.'),
            verifying: _('Files are installed. Checking Fontconfig and the running GNOME Shell.'),
            cancelled: _('Cancelled. Installed-font fallbacks remain available.'),
            failed: _('Fonts were not installed. Check the connection or installation permissions and try again; existing files were preserved.'),
        };
        if (state.status === 'failed' && state.reason === 'existing_conflict') row.subtitle = _('An existing font file conflicts with this version. It was preserved; no files were replaced.');
        else if (state.status === 'failed' && ['digest_mismatch', 'invalid_font', 'redirect_rejected', 'size_limit', 'license_missing', 'license_mismatch'].includes(state.reason))
            row.subtitle = _('Font verification failed. Nothing was installed; installed-font fallbacks remain available.');
        else if (state.status === 'failed' && state.reason === 'unsafe_directory') row.subtitle = _('The font installation directory is unsafe. Nothing was installed; existing files were preserved.');
        else if (state.status === 'installing') row.subtitle = fmt(_('Downloading: %d of %d bytes'), state.bytes ?? 0, state.total);
        else if (state.status === 'installed' && state.cacheStatus === 'failed') row.subtitle = _('Font files are installed, but the Fontconfig cache could not be refreshed. Retry the check or sign in again.');
        else if (state.status === 'installed' && state.fontconfigStatus === 'unavailable') row.subtitle = _('Fontconfig could not run its font inventory. Check that Fontconfig tools are available in this session.');
        else if (state.status === 'installed' && state.fontconfigStatus !== 'available') row.subtitle = _('Fontconfig did not find all installed font families. Check the current user font directory and permissions.');
        else if (state.status === 'installed' && state.shellStatus === 'available') row.subtitle = _('Fontconfig and GNOME Shell both see the suggested fonts. The active theme has been refreshed.');
        else if (state.status === 'installed' && state.shellStatus === 'missing') row.subtitle = _('Fontconfig sees the fonts, but the GNOME Shell Pango map is missing a family. Reopen the session if the theme still uses a fallback.');
        else if (state.status === 'installed' && state.shellStatus === 'failed') row.subtitle = _('Fontconfig sees the fonts, but GNOME Shell could not refresh the active theme. Reopen the session if the theme still uses a fallback.');
        else if (state.status === 'installed' && state.shellStatus === 'timeout') row.subtitle = _('Fontconfig sees the fonts, but GNOME Shell did not answer the refresh request. Reopen the session if the theme still uses a fallback.');
        else if (state.status === 'installed' && state.shellStatus === 'cancelled') row.subtitle = _('Font files are installed. The GNOME Shell refresh check was cancelled; reopen the session if the theme still uses a fallback.');
        else if (state.status === 'installed') row.subtitle = _('Fontconfig sees the fonts. GNOME Shell did not confirm a refresh; reopen the session if the theme still uses a fallback.');
        else if (messages[state.status]) row.subtitle = messages[state.status];
        if (state.status === 'installed') void updateCoverage();
    }});
    action.connect('clicked', () => { void controller.start(); });
    cancel.connect('clicked', () => controller.cancel());
    return {group, destroy() {
        if (destroyed) return;
        destroyed = true;
        inventoryGeneration++;
        cancelShellWait?.('cancelled'); cancelShellWait = null;
        for (const dialog of dialogs) dialog.close();
        dialogs.clear(); controller.destroy(); installer.destroy();
    }};
}
