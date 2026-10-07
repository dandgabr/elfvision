// Where themes live and how to read them. Shared by the shell side
// (themeManager.js) and the preferences window, so it only needs Gio and GLib.
//
// Built-in themes ship in themes/builtin/<id>/theme.json; the user's own go in
// ~/.local/share/gnome-ai-quota/themes/<id>/theme.json and win over a built-in
// theme with the same id. The reads are synchronous on purpose: a theme file is
// a few kilobytes and is read when the extension starts or the theme changes.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {validateTheme} from '../core/theme.js';

export const DEFAULT_THEME = 'sistema-gnome';
const MAX_THEME_BYTES = 64 * 1024;
const decoder = new TextDecoder();

/** @returns {string[]} theme folders, the user's first */
export function themeDirectories(extensionPath) {
    return [
        GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-ai-quota', 'themes']),
        GLib.build_filenamev([extensionPath, 'themes', 'builtin']),
    ];
}

function readText(path, maxBytes) {
    try {
        const file = Gio.File.new_for_path(path);
        const size = file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null).get_size();
        if (size > maxBytes)
            return {text: null, problem: `${path} is larger than ${maxBytes} bytes`};
        const [, contents] = file.load_contents(null);
        return {text: decoder.decode(contents), problem: null};
    } catch (error) {
        if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return {text: null, problem: null};
        return {text: null, problem: `cannot read ${path}: ${error.message}`};
    }
}

/** Read the stylesheet template that ships with the extension. */
export function readTemplate(extensionPath) {
    const {text, problem} = readText(GLib.build_filenamev([extensionPath, 'lib', 'core', 'theme.template.css']), 256 * 1024);
    if (text === null)
        throw new Error(problem ?? 'theme.template.css is missing');
    return text;
}

/**
 * Find and validate a theme by id.
 *
 * @param {string} extensionPath
 * @param {string} id
 * @returns {{theme: object|null, problems: string[]}}
 */
export function loadTheme(extensionPath, id) {
    const problems = [];
    // An id from settings must never become a path outside the theme folders.
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
        return {theme: null, problems: [`"${id}" is not a valid theme id`]};

    for (const directory of themeDirectories(extensionPath)) {
        const path = GLib.build_filenamev([directory, id, 'theme.json']);
        const {text, problem} = readText(path, MAX_THEME_BYTES);
        if (problem)
            problems.push(problem);
        if (text === null)
            continue;
        let raw;
        try {
            raw = JSON.parse(text);
        } catch (error) {
            problems.push(`${path} is not valid JSON`);
            continue;
        }
        const result = validateTheme(raw);
        problems.push(...result.problems.map(p => `${path}: ${p}`));
        if (result.theme && result.theme.id === id)
            return {theme: result.theme, problems};
    }
    return {theme: null, problems: [...problems, `theme "${id}" was not found`]};
}

/**
 * @param {string} extensionPath
 * @returns {Array<{id: string, name: string}>} every usable theme, sorted by name;
 *   a user theme replaces a built-in one with the same id
 */
export function listThemes(extensionPath) {
    const found = new Map();
    for (const directory of [...themeDirectories(extensionPath)].reverse()) {
        let enumerator;
        try {
            enumerator = Gio.File.new_for_path(directory).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        } catch (_error) {
            continue;   // the folder does not exist
        }
        for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
            const id = info.get_name();
            const {theme} = loadTheme(extensionPath, id);
            if (theme)
                found.set(id, {id, name: theme.name});
        }
    }
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
