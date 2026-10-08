// Actual native screenshots and allocations; ONLY the private synthetic harness.
(async () => {
    const result = global.gaqPopupEvolution = {finished: false, error: '', captures: []};
    let backdrop;
    try {
        const work = GLib.getenv('WORK');
        if (!work || GLib.getenv('GSETTINGS_BACKEND') !== 'memory' ||
            GLib.getenv('XDG_CONFIG_HOME') !== `${work}/config`)
            throw new Error('Popup captures require isolated synthetic settings');
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const root = indicator._extension.path;
        const folder = `${GLib.getenv('ROOT')}/build/popup-evolution`;
        const {scanThemes} = await import(`file://${root}/lib/services/themeFiles.js`);
        const {default: NativeShell} = await import('gi://Shell');
        const {default: St} = await import('gi://St');
        const scheme = GLib.getenv('GAQ_CAPTURE_SCHEME') === 'dark' ? 'dark' : 'light';
        const selection = GLib.getenv('GAQ_CAPTURE_THEME');
        const themes = scanThemes(root).themes.filter(theme => theme.builtin && (!selection || theme.id === selection));
        const check = (value, message) => { if (!value) throw new Error(message); };
        check(themes.length === (selection ? 1 : 22), 'Expected built-in theme inventory');
        check(indicator._settings.get_string('data-source') === 'demo', 'Synthetic mode required');
        Main.overview.hide(); Main.welcomeDialog?.close();
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve(); return GLib.SOURCE_REMOVE;
        }));
        backdrop = Gio.Subprocess.new(['gjs', '-m', `${root}/tools/effects-window.js`], Gio.SubprocessFlags.NONE);
        await wait(1700);
        indicator._settings.set_string('color-scheme', scheme);
        indicator._settings.set_boolean('auto-open', true);
        indicator._extension._themes._interface.set_boolean('enable-animations', true);
        indicator._settings.set_strv('demo-popup-connector-order', ['codex', 'claude', 'example-credits', 'command-code', 'antigravity']);
        indicator.menu.open(false);
        await wait(1200);
        const cases = [
            {mode: 'off', material: 'theme', transparent: true},
            {mode: 'subtle', material: 'theme', transparent: true},
            {mode: 'full', material: 'theme', transparent: true},
            {mode: 'full', material: 'theme', transparent: false},
            ...['translucent', 'decorative-glass', 'frosted-glass'].map(material =>
                ({mode: 'full', material, transparent: true})),
        ];
        for (const theme of themes) {
            indicator._settings.set_string('theme', theme.id);
            let baseline;
            for (const config of cases) {
                indicator._settings.delay();
                indicator._settings.set_string('effects-mode', config.mode);
                indicator._settings.set_string('effect-material', config.material);
                indicator._settings.set_boolean('transparency-enabled', config.transparent);
                indicator._settings.apply();
                await wait(450);
                const frame = indicator._effectBackground;
                const position = frame.get_transformed_position();
                const size = frame.get_transformed_size();
                const monitor = Main.layoutManager.findMonitorForActor(indicator) ?? Main.layoutManager.primaryMonitor;
                const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
                check(position[0] >= area.x - 1 && position[0] + size[0] <= area.x + area.width + 1,
                    `${theme.id}/${scheme}: horizontal work-area bounds`);
                check(position[1] >= area.y - 1 && position[1] + size[1] <= area.y + area.height + 1,
                    `${theme.id}/${scheme}: vertical work-area bounds`);
                const cards = [...indicator._cards.values()].filter(card => card.get_parent() && card.mapped);
                check(cards.length > 0, 'Synthetic cards must be allocated');
                const first = cards.sort((a, b) => a.get_transformed_position()[1] - b.get_transformed_position()[1])[0];
                const [cx] = first.get_transformed_position();
                const [cw] = first.get_transformed_size();
                const allocation = {frame: [...position, ...size], firstCard: [cx, cw]};
                if (!baseline) baseline = allocation;
                else check(Math.abs(cw - baseline.firstCard[1]) <= 1 && Math.abs(cx - baseline.firstCard[0]) <= 1,
                    `${theme.id}/${scheme}: effects/materials changed card horizontal geometry`);
                check(cx - position[0] <= 32, `${theme.id}/${scheme}: excessive left card inset`);
                check(position[0] + size[0] - cx - cw <= 48, `${theme.id}/${scheme}: excessive right card inset`);
                // Shell 50 exposes adjustments/visibility, not a scrollbar getter.
                // Inspect its allocated native child; do not silently skip the gate.
                const bar = indicator._scroll.get_children().find(actor =>
                    actor instanceof St.ScrollBar && actor.mapped && actor.height > actor.width);
                check(indicator._scroll.get_vscrollbar_visible() && Boolean(bar), 'Native vertical scrollbar must be allocated');
                if (bar.width > 0) {
                    const [bx] = bar.get_transformed_position();
                    // Constant 6px card-paint budget plus 8px visible clearance.
                    check(bx - cx - cw >= 13, `${theme.id}/${scheme}: insufficient painted-card scrollbar clearance`);
                }
                for (const card of cards) {
                    if (card._hero?.mapped) {
                        const [tw] = card._hero.clutter_text.get_layout().get_pixel_size();
                        check(tw <= card._hero.width + 1 && !card._hero.clutter_text.get_layout().is_ellipsized(),
                            `${theme.id}/${scheme}: clipped primary value`);
                    }
                }
                const resource = indicator._effects.inspect();
                check(resource.particles <= 12 && resource.blurEffects <= 1, 'Native effect resource bounds');
                if (config.mode === 'off') check(resource.sources === 0, 'Off has no animation sources');
                if (!config.transparent) check(resource.material === 'opaque', 'Transparency off must be opaque');
                else if (config.material !== 'theme') check(resource.material === config.material ||
                    (config.material === 'frosted-glass' && resource.material === 'decorative-glass'),
                'Requested material must render or use the documented frost fallback');
                const name = `${theme.id}-${scheme}-${config.mode}-${config.material}-${config.transparent ? 'transparent' : 'opaque'}`;
                const path = `${folder}/${name}.png`;
                const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
                try { await new NativeShell.Screenshot().screenshot(false, stream); }
                finally { stream.close(null); }
                const font = first._name?.get_theme_node().get_font();
                result.captures.push({id: theme.id, scheme, ...config, path, rectangle: [...position, ...size],
                allocation, resources: resource, font: font?.to_string(),
                    resolvedFont: first._name?.clutter_text.get_layout().get_iter().get_run()?.item?.analysis?.font?.describe()?.to_string(),
                    footerBackground: indicator._updated.get_parent().get_theme_node().get_background_color().to_string(),
                    scrollbar: bar?.get_transformed_position(),
                    framePadding: frame.get_theme_node().get_padding(St.Side.LEFT)});
            }
        }
        indicator.menu.close(false);
        check(indicator._effects.inspect().sources === 0, 'Close releases ambient sources');
    } catch (error) { result.error = `${error.message}\n${error.stack ?? ''}`; }
    finally {
        backdrop?.force_exit(); result.finished = true;
        const suffix = GLib.getenv('GAQ_CAPTURE_THEME') || 'all';
        GLib.file_set_contents(`${GLib.getenv('ROOT')}/build/popup-evolution/${GLib.getenv('GAQ_CAPTURE_SCHEME')}-${suffix}.json`,
            JSON.stringify(result, null, 2));
    }
})();
'GAQ_POPUP_EVOLUTION_STARTED';
