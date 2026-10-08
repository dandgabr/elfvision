// Synthetic native visual evidence in tools/headless-shell.sh; no real application data.
(async () => {
    const result = global.gaqEffectsVisual = {finished: false, screenshots: [], error: ''};
    let process, box, engine;
    try {
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const root = indicator._extension.path;
        const scheme = GLib.getenv('GAQ_EFFECTS_SCHEME') === 'dark' ? 'dark' : 'light';
        const prefix = scheme === 'dark' ? 'dark-' : '';
        result.scheme = scheme;
        const {default: Gio} = await import('gi://Gio');
        const {default: Shell} = await import('gi://Shell');
        const {default: St} = await import('gi://St');
        const {default: Clutter} = await import('gi://Clutter');
        const {ThemeEffects} = await import(`file://${root}/lib/ui/themeEffects.js`);
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        const capture = async name => {
            const path = `${root}/.superpowers/sdd/2026-10-07-post-mvp-execution/${name.replace('effects-', `effects-${prefix}`)}.png`;
            const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
            try { await new Shell.Screenshot().screenshot(false, stream); } finally { stream.close(null); }
            result.screenshots.push(path);
        };
        Main.overview.hide();
        Main.welcomeDialog?.close();
        process = Gio.Subprocess.new(['gjs', '-m', `${root}/tools/effects-window.js`], Gio.SubprocessFlags.NONE);
        await wait(1800);
        const window = global.get_window_actors().find(actor => actor.meta_window.get_title() === 'Quota effects test scene')?.meta_window;
        if (!window) throw new Error('Synthetic background window missing');
        window.move_frame(true, 170, 50);
        await wait(400);
        indicator._settings.set_string('color-scheme', scheme);
        indicator._settings.set_boolean('transparency-enabled', true);
        indicator._settings.set_string('effects-mode', 'full');
        indicator._settings.set_string('theme', 'organic-biophilic');
        indicator._settings.set_string('effect-material', 'theme');
        indicator.menu.open(false);
        await wait(800);
        await capture('effects-leaves');
        await wait(1300);
        await capture('effects-leaves-phase');
        const [px, py] = indicator._effectBackground.get_transformed_position();
        result.leafRegion = [Math.round(px + 3), Math.round(py + 40), 6, Math.round(indicator._effectBackground.height - 80)];
        indicator._settings.set_string('theme', 'glassmorphism');
        for (const material of ['translucent', 'decorative-glass', 'frosted-glass']) {
            indicator._settings.set_string('effect-material', material);
            await wait(450);
            result[material] = {resources: indicator._effects.inspect(), position: indicator._effectBackground.get_transformed_position(), size: [indicator._effectBackground.width, indicator._effectBackground.height], visible: indicator._effectBackground.visible, mapped: indicator._effectBackground.mapped, opacity: indicator._effectBackground.get_paint_opacity(), style: indicator._effectBackground.style, children: indicator._effectDecoration.get_children().map(actor => ({width: actor.width, height: actor.height, mapped: actor.mapped, opacity: actor.opacity, paints: actor._effectPaints, surface: actor._effectPaintSize}))};
            await capture(`effects-${material}`);
        }
        const [gx, gy] = indicator._effectBackground.get_transformed_position();
        result.popupRegion = [Math.round(gx + 3), Math.round(gy + 40), 6, Math.round(indicator._effectBackground.height - 80)];
        window.move_frame(true, Math.round(gx + 6 - window.get_frame_rect().width / 2), 50);
        await wait(500);
        await capture('effects-frost-moving');
        window.move_frame(true, 170, 50);
        await wait(400);
        indicator.menu.close(false);
        // A controlled empty surface isolates backdrop processing from opaque reading zones.
        box = new St.Widget({layout_manager: new Clutter.BinLayout(), clip_to_allocation: true});
        box.set_position(250, 150); box.set_size(400, 300);
        const bg = new St.Widget({x_expand: true, y_expand: true});
        const deco = new Clutter.Actor({x_expand: true, y_expand: true});
        box.add_child(bg); box.add_child(deco); Main.uiGroup.add_child(box);
        engine = new ThemeEffects({backgroundActor: bg, decorationActor: deco, extensionPath: root});
        const theme = {origin: 'builtin', colors: {bg: '#242c34', fg: '#ffffff', muted: '#ffffff', accent: '#ffffff', border: '#ffffff'},
            profile: {material: 'translucent', motion: 'none', texture: 'none', opacity: {light: 0.72, dark: 0.72}}, radius: {card: 14}};
        for (const material of ['translucent', 'frosted-glass']) {
            engine.apply({theme: {...theme, profile: {...theme.profile, material}}, scheme: 'dark', policy: {motion: 'none', material, particleCount: 0}});
            engine.setOpen(true);
            await wait(500);
            await capture(`effects-control-${material}`);
        }
        window.move_frame(true, 70, 50);
        await wait(500);
        await capture('effects-control-frost-moving');
        result.control = {rect: [250, 150, 400, 300], blurEffects: engine.inspect().blurEffects};

    } catch (error) { result.error = error.message; }
    finally {
        engine?.destroy(); box?.destroy(); process?.force_exit(); result.finished = true;
        const {default: GLibFile} = await import('gi://GLib');
        const path = GLibFile.getenv('ROOT');
        GLibFile.file_set_contents(`${path}/.superpowers/sdd/2026-10-07-post-mvp-execution/effects-${GLibFile.getenv('GAQ_EFFECTS_SCHEME') === 'dark' ? 'dark-' : ''}visual.json`, JSON.stringify(result));
    }
})()
