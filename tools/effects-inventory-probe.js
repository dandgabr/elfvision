// Actual native light/dark inventory; separate from the 264 policy/resource combinations.
(async () => {
    const result = global.gaqEffectsInventory = {finished: false, captures: [], error: ''};
    try {
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const root = indicator._extension.path;
        const {scanThemes} = await import(`file://${root}/lib/services/themeFiles.js`);
        const {default: Gio} = await import('gi://Gio');
        const {default: Shell} = await import('gi://Shell');
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        Main.overview.hide(); Main.welcomeDialog?.close();
        indicator._settings.set_string('effects-mode', 'full');
        indicator._settings.set_string('effect-material', 'theme');
        indicator._settings.set_boolean('transparency-enabled', true);
        indicator._extension._themes._interface.set_boolean('enable-animations', true);
        indicator.menu.open(false);
        for (const scheme of ['light', 'dark']) {
            indicator._settings.set_string('color-scheme', scheme);
            for (const theme of scanThemes(root).themes.filter(theme => theme.builtin)) {
                indicator._settings.set_string('theme', theme.id);
                await wait(200);
                const path = `${root}/.superpowers/sdd/2026-10-07-post-mvp-execution/inventory-${scheme}-${theme.id}.png`;
                const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
                try { await new Shell.Screenshot().screenshot(false, stream); } finally { stream.close(null); }
                const [x, y] = indicator._effectBackground.get_transformed_position();
                result.captures.push({scheme, id: theme.id, path, rectangle: [Math.round(x), Math.round(y), Math.round(indicator._effectBackground.width), Math.round(indicator._effectBackground.height)], resources: indicator._effects.inspect()});
            }
        }
    } catch (error) { result.error = error.message; }
    finally {
        result.finished = true;
        GLib.file_set_contents(`${GLib.getenv('ROOT')}/.superpowers/sdd/2026-10-07-post-mvp-execution/effects-inventory.json`, JSON.stringify(result));
    }
})()
; 'GAQ_INVENTORY_STARTED'
