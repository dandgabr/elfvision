// Compiles the active theme and keeps its stylesheet loaded (docs/adr/0006).
// The stylesheet follows the settings: the chosen theme, the light or dark
// preference, the system color scheme and the GNOME accent color.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {compileTheme, pickScheme} from '../core/theme.js';
import {DEFAULT_THEME, loadTheme, readTemplate} from './themeFiles.js';

export class ThemeManager {
    /**
     * @param {object} options
     * @param {string} options.extensionPath
     * @param {Gio.Settings} options.settings - the extension's settings
     */
    constructor({extensionPath, settings}) {
        this._path = extensionPath;
        this._settings = settings;
        this._directory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota']);
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._hasAccent = this._interface.settings_schema.has_key('accent-color');
        this._loaded = null;      // {file, css}
        this._serial = 0;
        this._template = null;
    }

    enable() {
        this._template = readTemplate(this._path);
        const apply = () => this.apply();
        this._settings.connectObject('changed::theme', apply, 'changed::color-scheme', apply, this);
        this._interface.connectObject('changed::color-scheme', apply, this);
        if (this._hasAccent)
            this._interface.connectObject('changed::accent-color', apply, this);
        this.apply();
    }

    disable() {
        this._settings.disconnectObject(this);
        this._interface.disconnectObject(this);
        this._unload();
        this._template = null;
    }

    /** Compile and load the stylesheet for the current settings. */
    apply() {
        const id = this._settings.get_string('theme');
        let {theme, problems} = loadTheme(this._path, id);
        problems.forEach(problem => console.warn(`gnome-ai-quota: ${problem}`));
        if (!theme) {
            // A broken or missing theme must never leave the extension unstyled.
            ({theme} = loadTheme(this._path, DEFAULT_THEME));
            if (!theme)
                throw new Error(`the built-in theme "${DEFAULT_THEME}" cannot be loaded`);
        }

        const scheme = pickScheme(this._settings.get_string('color-scheme'),
            this._interface.get_string('color-scheme') === 'prefer-dark');
        const accentName = this._hasAccent ? this._interface.get_string('accent-color') : 'blue';
        const css = compileTheme(this._template, theme, {scheme, accentName});
        if (this._loaded?.css === css)
            return;

        this._load(css);
    }

    _load(css) {
        // Two file names alternate so the new sheet never shares a path with the old one.
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._directory, `theme-${this._serial++ % 2}.css`]));
        GLib.mkdir_with_parents(this._directory, 0o700);
        file.replace_contents(new TextEncoder().encode(css), null, false, Gio.FileCreateFlags.PRIVATE, null);

        const previous = this._loaded;
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        theme.load_stylesheet(file);
        if (previous)
            theme.unload_stylesheet(previous.file);
        this._loaded = {file, css};
    }

    _unload() {
        if (!this._loaded)
            return;
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        theme.unload_stylesheet(this._loaded.file);
        try {
            this._loaded.file.delete(null);
        } catch (_error) {
            // The cache file is already gone.
        }
        this._loaded = null;
    }
}
