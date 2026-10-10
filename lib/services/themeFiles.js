// Where themes live and how to read them. Shared by the shell side
// (themeManager.js) and the preferences window, so it only needs Gio and GLib.
//
// Built-in themes ship in themes/builtin/<id>/theme.json; the user's own go in
// ~/.local/share/gnome-ai-quota/themes/<id>/theme.json and win over a built-in
// theme with the same id. The reads are synchronous on purpose: a theme file is
// a few kilobytes and is read when the extension starts or the theme changes.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {swatches, validateTheme} from '../core/theme.js';
import {opticalPreset} from '../core/themeEffects.js';

export const DEFAULT_THEME = 'sistema-gnome';
const MAX_THEME_BYTES = 64 * 1024;
const decoder = new TextDecoder();

/** @returns {string[]} theme folders, the user's first */
export function themeDirectories(extensionPath, {userDirectory = null} = {}) {
    return [
        userDirectory ?? GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-ai-quota', 'themes']),
        GLib.build_filenamev([extensionPath, 'themes', 'builtin']),
    ];
}

function readText(path, maxBytes) {
    try {
        const file = Gio.File.new_for_path(path);
        // Only regular files: a FIFO or a link to /dev/zero would block the shell.
        const info = file.query_info('standard::type', Gio.FileQueryInfoFlags.NONE, null);
        if (info.get_file_type() !== Gio.FileType.REGULAR)
            return {text: null, problem: `${path} is not a regular file`};
        const stream = file.read(null);
        try {
            // Read one byte more than allowed, so a file that grows is caught too.
            const bytes = stream.read_bytes(maxBytes + 1, null).toArray();
            if (bytes.length > maxBytes)
                return {text: null, problem: `${path} is larger than ${maxBytes} bytes`};
            return {text: decoder.decode(bytes), problem: null};
        } finally {
            stream.close(null);
        }
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

/** Keep the template paired with the JavaScript modules loaded in one Shell session. */
export class ThemeTemplateSnapshot {
    constructor() {
        this._template = null;
    }

    read(extensionPath) {
        if (this._template === null)
            this._template = readTemplate(extensionPath);
        return this._template;
    }
}

/**
 * Find and validate a theme by id.
 *
 * @param {string} extensionPath
 * @param {string} id
 * @returns {{theme: object|null, problems: string[]}}
 */
export function loadTheme(extensionPath, id, options = {}) {
    const problems = [];
    // An id from settings must never become a path outside the theme folders.
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
        return {theme: null, problems: [`"${id}" is not a valid theme id`]};

    const directories = themeDirectories(extensionPath, options);
    for (const [index, directory] of directories.entries()) {
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
        if (result.theme && result.theme.id !== id) {
            problems.push(`${path}: the id "${result.theme.id}" does not match the folder name`);
            continue;
        }
        if (result.theme)
            return {theme: {...result.theme, origin: index === 0 ? 'user' : 'builtin'}, problems};
    }
    return {theme: null, problems: [...problems, `theme "${id}" was not found`]};
}

/**
 * Every usable theme, sorted by name with the default first (a user theme replaces a
 * built-in one with the same id), and which theme folders were rejected and why.
 *
 * @returns {{themes: Array<{id: string, name: string, description: string, builtin: boolean,
 *   swatches: {light: string[], dark: string[]}, effects: object,
 *   defaultFeatures: {transparency: boolean, effects: boolean}}>, rejected: Array<{id: string, problem: string}>}}
 */
export function scanThemes(extensionPath, options = {}) {
    const found = new Map();
    const rejected = [];
    for (const directory of [...themeDirectories(extensionPath, options)].reverse()) {
        let enumerator;
        try {
            enumerator = Gio.File.new_for_path(directory).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        } catch (_error) {
            continue;   // the folder does not exist
        }
        for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
            const id = info.get_name();
            const {theme, problems} = loadTheme(extensionPath, id, options);
            if (theme) {
                found.set(id, {
                    id, name: theme.name, description: theme.description,
                    origin: theme.origin, builtin: theme.origin === 'builtin', swatches: swatches(theme),
                    effects: theme.effects,
                    defaultFeatures: {
                        transparency: theme.origin === 'builtin' && theme.effects.material !== 'opaque',
                        effects: theme.origin === 'builtin' && (opticalPreset(theme.id, theme.effects.material) !== null || theme.effects.texture !== 'none' ||
                            ['gradient', 'pulse'].includes(theme.effects.motion) ||
                            (['leaves', 'motes'].includes(theme.effects.motion) && theme.effects.particleCount > 0)),
                    },
                });
            }
            else
                rejected.push({id, problem: problems[problems.length - 2] ?? problems[0] ?? 'unusable'});
        }
        enumerator.close(null);
    }
    const themes = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
    // The default theme leads the list.
    const index = themes.findIndex(theme => theme.id === DEFAULT_THEME);
    if (index > 0)
        themes.unshift(...themes.splice(index, 1));
    return {themes, rejected};
}
