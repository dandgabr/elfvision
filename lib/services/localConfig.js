// Reads providers.local.json (docs/adr/0009). The file holds client ids and maybe a
// client secret, so it is refused unless only its owner can read it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {MAX_BYTES, parseLocalConfig} from '../core/localConfig.js';

/** @returns {string} where the file lives */
export function localConfigPath() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-ai-quota', 'providers.local.json']);
}

/**
 * @param {string} [path]
 * @returns {{providers: object, problems: string[], missing: boolean}} `missing` is true when
 *   the file does not exist; an unsafe file gives no providers and a problem that says so
 */
export function readLocalConfig(path = localConfigPath()) {
    const file = Gio.File.new_for_path(path);
    let info;
    try {
        info = file.query_info('standard::type,standard::size,unix::mode,unix::uid', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    } catch (error) {
        if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return {providers: {}, problems: [], missing: true};
        return {providers: {}, problems: ['the file cannot be read'], missing: false};
    }
    // The directory too: others must not be able to swap the file for another.
    try {
        const directory = file.get_parent().query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null);
        if ((directory.get_attribute_uint32('unix::mode') & 0o022) !== 0)
            return {providers: {}, problems: ['the folder can be changed by others: run chmod 700 on it'], missing: false};
    } catch (_error) {
        return {providers: {}, problems: ['the file cannot be read'], missing: false};
    }
    if (info.get_file_type() !== Gio.FileType.REGULAR)
        return {providers: {}, problems: ['the path is not a regular file'], missing: false};
    if ((info.get_attribute_uint32('unix::mode') & 0o077) !== 0)
        return {providers: {}, problems: ['the file can be read by others: run chmod 600 on it'], missing: false};
    if (info.get_attribute_uint32('unix::uid') !== new Gio.Credentials().get_unix_user())
        return {providers: {}, problems: ['the file belongs to another user'], missing: false};
    if (info.get_size() > MAX_BYTES)
        return {providers: {}, problems: ['the file is too large'], missing: false};
    try {
        const [, bytes] = file.load_contents(null);
        return {...parseLocalConfig(new TextDecoder().decode(bytes)), missing: false};
    } catch (_error) {
        return {providers: {}, problems: ['the file cannot be read'], missing: false};
    }
}
