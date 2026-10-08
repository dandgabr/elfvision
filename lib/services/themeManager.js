// Compiles the active theme and keeps its stylesheet loaded (docs/adr/0006).
// The stylesheet follows the settings: the chosen theme, the light or dark
// preference, the system color scheme and the GNOME accent color.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

import {compileTheme, pickScheme, resolvedColors} from '../core/theme.js';
import {effectPolicy, validateEffectProfile} from '../core/themeEffects.js';
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
        this._template = null;
        this._activeTheme = null;
        this._scheme = 'dark';
        this._enabled = false;
        this._effectListeners = new Set();
        this._fontResolver = font => this._resolveFont(font);
    }

    enable() {
        this._template = readTemplate(this._path);
        const apply = () => this.apply();
        // Apply first: if it throws, nothing stays connected.
        this._enabled = true;
        try {
            this.apply();
        } catch (error) {
            this._enabled = false;
            this._activeTheme = null;
            throw error;
        }
        const effectsChanged = () => this._notifyEffects();
        this._settings.connectObject('changed::effects-mode', effectsChanged, 'changed::transparency-enabled', effectsChanged, 'changed::effect-material', effectsChanged, this);
        this._interface.connectObject('changed::enable-animations', effectsChanged, this);
        this._settings.connectObject('changed::theme', apply, 'changed::color-scheme', apply, this);
        this._interface.connectObject('changed::color-scheme', apply, this);
        if (this._hasAccent)
            this._interface.connectObject('changed::accent-color', apply, this);
    }

    disable() {
        this._settings.disconnectObject(this);
        this._interface.disconnectObject(this);
        this._unload();
        this._template = null;
        this._enabled = false;
        this._activeTheme = null;
        this._notifyEffects();
        this._effectListeners.clear();
    }

    /** A detached snapshot: no credentials, account state or mutable renderer-owned data. */
    getEffectState(popupOpen = false) {
        const profile = validateEffectProfile(this._activeTheme?.effects).profile;
        const state = {
            themeId: this._activeTheme?.id ?? DEFAULT_THEME,
            origin: this._activeTheme?.origin ?? 'user',
            profile,
            scheme: this._scheme,
            colors: this._activeTheme ? resolvedColors(this._activeTheme, this._scheme,
                this._hasAccent ? this._interface.get_string('accent-color') : 'blue') : null,
            radius: this._activeTheme ? {...this._activeTheme.radius} : null,
            mode: this._settings.get_string('effects-mode'),
            materialPreference: this._settings.get_string('effect-material'),
            animationsEnabled: this._interface.get_boolean('enable-animations'),
            transparencyEnabled: this._settings.get_boolean('transparency-enabled'),
            enabled: this._enabled,
        };
        return {...state, policy: effectPolicy({...state, popupOpen: popupOpen && this._enabled})};
    }

    /** Callers read getEffectState(theirPopupIsOpen) when notified; no immediate callback. */
    subscribeEffects(callback) {
        this._effectListeners.add(callback);
        return () => this._effectListeners.delete(callback);
    }

    _notifyEffects() {
        for (const callback of [...this._effectListeners]) {
            try {
                callback(this.getEffectState());
            } catch (_error) {
                console.warn('Elfvision: a theme effect listener failed');
            }
        }
    }

    // Resolve installed families before emitting native CSS. Fontconfig may
    // choose the shell sans face for an absent first family in a compound stack.
    // Pango's generic map gives the locally installed serif/cursive/mono face.
    // No font is downloaded or installed by theme selection.
    _resolveFont(font) {
        const map = PangoCairo.FontMap.get_default();
        const available = new Map(map.list_families().map(family => [family.get_name().toLowerCase(), family.get_name()]));
        for (const candidate of [font.name, ...(font.fallbacks ?? [])]) {
            if (available.has(candidate.toLowerCase()))
                return available.get(candidate.toLowerCase());
        }
        return map.create_context().load_font(Pango.FontDescription.from_string(`${font.generic} 12`))?.describe().get_family();
    }

    /** Compile and load the stylesheet for the current settings. */
    apply() {
        const id = this._settings.get_string('theme');
        let {theme, problems} = loadTheme(this._path, id);
        problems.forEach(problem => console.warn(`Elfvision: ${problem}`));
        if (!theme) {
            // A broken or missing theme must never leave the extension unstyled.
            ({theme} = loadTheme(this._path, DEFAULT_THEME));
            if (!theme)
                throw new Error(`the built-in theme "${DEFAULT_THEME}" cannot be loaded`);
        }

        const scheme = pickScheme(this._settings.get_string('color-scheme'),
            this._interface.get_string('color-scheme') === 'prefer-dark');
        const accentName = this._hasAccent ? this._interface.get_string('accent-color') : 'blue';
        // Refresh the map after explicit local font installation, not only at enable.
        PangoCairo.FontMap.get_default().changed();
        const css = compileTheme(this._template, theme, {scheme, accentName, fontResolver: this._fontResolver});
        if (this._loaded?.css === css) {
            this._activeTheme = theme;
            this._scheme = scheme;
            this._notifyEffects();
            return;
        }

        try {
            this._load(css);
        } catch (error) {
            console.warn(`Elfvision: cannot load theme "${theme.id}": ${error.message}`);
            if (theme.id === DEFAULT_THEME)
                throw error;
            const fallback = loadTheme(this._path, DEFAULT_THEME).theme;
            this._load(compileTheme(this._template, fallback, {scheme, accentName, fontResolver: this._fontResolver}));
            theme = fallback;
        }
        this._activeTheme = theme;
        this._scheme = scheme;
        this._notifyEffects();
    }

    _load(css) {
        // Two file names alternate so the new sheet never shares a path with the
        // old one: take the one the loaded sheet is not using.
        const previous = this._loaded;
        const slot = previous?.slot === 0 ? 1 : 0;
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._directory, `theme-${slot}.css`]));
        GLib.mkdir_with_parents(this._directory, 0o700);
        file.replace_contents(new TextEncoder().encode(css), null, false, Gio.FileCreateFlags.PRIVATE, null);

        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        try {
            theme.load_stylesheet(file);
        } catch (error) {
            this._remove(file);
            throw error;
        }
        if (previous) {
            theme.unload_stylesheet(previous.file);
            this._remove(previous.file);
        }
        this._loaded = {file, css, slot};
    }

    _unload() {
        if (!this._loaded)
            return;
        try {
            St.ThemeContext.get_for_stage(global.stage).get_theme()?.unload_stylesheet(this._loaded.file);
        } catch (_error) {
            // The shell is already tearing its theme down.
        }
        this._remove(this._loaded.file);
        this._loaded = null;
    }

    _remove(file) {
        try {
            file.delete(null);
        } catch (_error) {
            // The cache file is already gone.
        }
    }
}
