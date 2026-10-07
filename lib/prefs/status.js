// What the preferences window tells the running extension after it changes a credential
// (docs/adr/0009): which provider, and that its last result no longer holds.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * @param {Gio.Settings} settings
 * @param {string} id - the provider whose credential was stored or removed
 */
export function announceChange(settings, id) {
    // The old verdict (say, "expired") is about the old credential; the extension writes a new
    // one after its next fetch.
    const status = settings.get_value('account-status').deepUnpack();
    if (id in status) {
        delete status[id];
        settings.set_value('account-status', new GLib.Variant('a{ss}', status));
    }
    settings.set_string('credentials-touched', id);
    settings.set_int('credentials-revision', (settings.get_int('credentials-revision') + 1) % 2147483647);
    Gio.Settings.sync();
}

/** The home directory written as `~`, for a path shown to the user. */
export function homeAbbreviated(path) {
    const home = GLib.get_home_dir();
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
