// Individual, actual Shell screenshots for each built-in material and color scheme.
(async () => {
    const result = global.gaqMaterialCaptures = {finished: false, error: '', captures: []};
    let process;
    try {
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const root = indicator._extension.path;
        const {scanThemes} = await import(`file://${root}/lib/services/themeFiles.js`);
        const {default: Gio} = await import('gi://Gio');
        const {default: Shell} = await import('gi://Shell');
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve(); return GLib.SOURCE_REMOVE;
        }));
        const scheme = GLib.getenv('GAQ_CAPTURE_SCHEME') === 'dark' ? 'dark' : 'light';
        const offset = Number(GLib.getenv('GAQ_CAPTURE_OFFSET') ?? 0);
        Main.overview.hide(); Main.welcomeDialog?.close();
        process = Gio.Subprocess.new(['gjs', '-m', `${root}/tools/effects-window.js`], Gio.SubprocessFlags.NONE);
        await wait(1600);
        const window = global.get_window_actors().find(actor => actor.meta_window.get_title() === 'Quota effects test scene')?.meta_window;
        if (!window) throw new Error('Synthetic checkerboard backdrop missing');
        window.move_frame(true, 200, 40);
        await wait(250);
        indicator._settings.set_string('color-scheme', scheme);
        indicator._settings.set_boolean('auto-open', true);
        indicator._settings.set_string('effects-mode', 'full');
        indicator._settings.set_boolean('transparency-enabled', true);
        indicator._extension._themes._interface.set_boolean('enable-animations', true);
        indicator.menu.open(false);
        for (const theme of scanThemes(root).themes.filter(theme => theme.builtin).slice(offset, offset + 11)) {
            indicator._settings.set_string('theme', theme.id);
            for (const material of ['opaque', 'translucent', 'decorative-glass', 'frosted-glass', 'frosted-glass-off']) {
                const selected = material === 'opaque' ? 'theme' : material.replace('-off', '');
                indicator._settings.set_boolean('transparency-enabled', material !== 'opaque');
                indicator._settings.set_string('effects-mode', material.endsWith('-off') ? 'off' : 'full');
                if (!indicator._settings.set_string('effect-material', selected)) throw new Error('Material setting was rejected');
                await wait(350);
                const expected = material === 'opaque' ? 'opaque' : selected;
                if (indicator._effects.inspect().material !== expected) throw new Error(`Requested material not rendered: ${theme.id} ${material}`);
                const path = `${root}/.superpowers/sdd/2026-10-08-manual-regressions/captures/${theme.id}-${scheme}-${material}.png`;
                const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
                try { await new Shell.Screenshot().screenshot(false, stream); } finally { stream.close(null); }
                result.captures.push({theme: theme.id, name: theme.name, scheme, material, path,
                    actual: indicator._effects.inspect(), policy: indicator._extension._themes.getEffectState(true).policy,
                    position: indicator.menu.actor.get_transformed_position(), size: indicator.menu.actor.get_transformed_size(),
                    firstCard: indicator._onBarBox.get_first_child()?.get_transformed_position(),
                    footerBackground: indicator._updated.get_parent().get_theme_node().get_background_color().to_string(),
                    backgroundStyle: indicator._effectBackground.style,
                    names: [...indicator._cards.values()].map(card => ({name: card._name.text,
                        width: card._name.width, preferred: card._name.get_preferred_width(-1)}))});
            }
        }
    } catch (error) { result.error = error.message; }
    finally {
        process?.force_exit(); result.finished = true;
        GLib.file_set_contents(`${GLib.getenv('ROOT')}/.superpowers/sdd/2026-10-08-manual-regressions/captures/${GLib.getenv('GAQ_CAPTURE_SCHEME')}-${GLib.getenv('GAQ_CAPTURE_OFFSET')}.json`, JSON.stringify(result, null, 2));
    }
})();
'GAQ_MATERIAL_CAPTURES_STARTED';
