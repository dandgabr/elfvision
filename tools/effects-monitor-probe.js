// Private two-monitor fractional-scale evidence; only demo/synthetic actors are captured.
(async () => {
    const result = global.gaqMonitorEffects = {finished: false, cases: [], error: ''};
    let scene;
    let evidenceFile;
    try {
        const {default: Gio} = await import('gi://Gio');
        const {default: Clutter} = await import('gi://Clutter');
        const {default: Shell} = await import('gi://Shell');
        const {default: St} = await import('gi://St');
        const {default: GdkPixbuf} = await import('gi://GdkPixbuf');
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const call = (method, parameters) => new Promise((resolve, reject) => Gio.DBus.session.call(
            'org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig',
            method, parameters, null, Gio.DBusCallFlags.NONE, 10000, null, (connection, response) => {
                try { resolve(connection.call_finish(response).deep_unpack()); } catch (error) { reject(error); }
            }));
        const [serial, monitors] = await call('GetCurrentState', null);
        check(monitors.length === 2, 'Exactly two private virtual monitors required');
        const configs = monitors.map((monitor, index) => {
            const mode = monitor[1].find(candidate => candidate[6]['is-current']?.deep_unpack());
            check(mode && mode[5].includes(1.25), 'Fractional 1.25 must be advertised');
            return [index ? Math.round(monitors[0][1][0][1] / 1.25) : 0, 0, 1.25, 0, index === 1,
                [[monitor[0][0], mode[0], {}]]];
        });
        await call('ApplyMonitorsConfig', new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})',
            [serial, 1, configs, {'layout-mode': new GLib.Variant('u', 1)}]));
        await wait(1200);
        const monitor = Main.layoutManager.primaryMonitor;
        check(Main.layoutManager.monitors.length === 2 && monitor.x > 0, 'Primary popup monitor must have nonzero origin');
        result.monitors = Main.layoutManager.monitors.map(m => ({x: m.x, y: m.y, width: m.width, height: m.height}));
        result.configuredScale = 1.25;
        Main.overview.hide(); Main.welcomeDialog?.close();
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        check(indicator && indicator._settings.get_string('data-source') === 'demo', 'Synthetic demo only');
        const root = indicator._extension.path;
        const output = `${root}/.superpowers/sdd/2026-10-07-open-items`;
        GLib.mkdir_with_parents(output, 0o700);
        evidenceFile = Gio.File.new_for_path(`${output}/monitor-effects.json`);
        scene = Gio.Subprocess.new(['gjs', '-m', `${root}/tools/effects-window.js`], Gio.SubprocessFlags.NONE);
        await wait(1600);
        const window = global.get_window_actors().find(actor => actor.meta_window.get_title() === 'Quota effects test scene')?.meta_window;
        check(window, 'Synthetic detailed window exists');
        window.move_to_monitor(Main.layoutManager.monitors.indexOf(monitor));
        window.move_frame(true, monitor.x, monitor.y + 35);
        indicator._settings.set_string('theme', 'glassmorphism');
        indicator._settings.set_string('effects-mode', 'subtle');
        indicator._settings.set_boolean('transparency-enabled', true);
        for (const [scheme, rtl, large] of [['light', false, false], ['light', true, true], ['dark', false, true], ['dark', true, false]]) {
            indicator.menu.close(false);
            indicator._settings.set_string('color-scheme', scheme);
            indicator._extension._themes._interface.set_double('text-scaling-factor', large ? 1.5 : 1);
            indicator.menu.actor.set_text_direction(rtl ? Clutter.TextDirection.RTL : Clutter.TextDirection.LTR);
            indicator.menu.open(false);
            await wait(500);
            const target = [...indicator._cards.values()].find(card => card._toggle.can_focus)?._toggle;
            check(target, 'Focusable persistent card'); target.grab_key_focus();
            const labels = [];
            const visit = actor => {
                actor.set_text_direction(rtl ? Clutter.TextDirection.RTL : Clutter.TextDirection.LTR);
                if (actor instanceof St.Label) labels.push(actor);
                for (const child of actor.get_children()) visit(child);
            };
            visit(indicator.menu.actor);
            const styles = new Map(labels.map(label => [label, label.get_style()]));
            const hero = [...indicator._cards.values()][0]._hero;
            const baseTextHeight = hero.clutter_text.get_layout().get_pixel_size()[1];
            if (large) {
                for (const label of labels) {
                    const size = label.get_theme_node().get_font().get_size() / 1024;
                    label.set_style(`${styles.get(label) ?? ''} font-size: ${size * 1.5}px;`);
                }
                await wait(300);
                check(hero.clutter_text.get_layout().get_pixel_size()[1] > baseTextHeight, 'Large label font actually increases rendered glyph height');
            }
            const item = {scheme, rtl, large, baseTextHeight, renderedTextHeight: hero.clutter_text.get_layout().get_pixel_size()[1], captures: []};
            result.cases.push(item);
            for (const material of ['translucent', 'frosted-glass']) {
                indicator._settings.set_string('effect-material', material);
                await wait(400);
                check(global.stage.get_key_focus() === target, 'Material switch preserves actual keyboard focus');
                const background = indicator._effectBackground;
                const decoration = indicator._effectDecoration;
                const box = background.get_allocation_box(); const other = decoration.get_allocation_box();
                check([box.x1, box.x2, box.y1, box.y2].every(Number.isFinite) && box.x2 > 200 && box.y2 > 100, 'Finite allocated backdrop');
                check(JSON.stringify([box.x1, box.x2, box.y1, box.y2]) === JSON.stringify([other.x1, other.x2, other.y1, other.y2]), 'Decorative sibling shares viewport');
                const [x, y] = background.get_transformed_position();
                const [w, h] = background.get_transformed_size();
                item.geometry = {siblings: [background, decoration, indicator._effectForeground].map(actor => ({hasAllocation: actor.has_allocation(), width: actor.width, height: actor.height, transformed: actor.get_transformed_size(), allocation: (() => { const a = actor.get_allocation_box(); return [a.x1, a.y1, a.x2, a.y2]; })()})), menuOpen: indicator.menu.isOpen, mapped: background.mapped, local: [box.x1, box.y1, box.x2, box.y2], ancestors: []};
                for (let actor = background; actor; actor = actor.get_parent()) {
                    const bounds = actor.get_allocation_box();
                    item.geometry.ancestors.push({type: actor.constructor.name, mapped: actor.mapped, visible: actor.visible, width: actor.width, height: actor.height, scale: [actor.scale_x, actor.scale_y], transformed: actor.get_transformed_size(), box: [bounds.x1, bounds.y1, bounds.x2, bounds.y2]});
                }
                check(decoration.get_transformed_size().every((value, dimension) => Math.abs(value - [w, h][dimension]) <= 1 / 64), 'Decoration transformed viewport matches backdrop within native subpixel precision');
                check(w > 200 && h > 100, 'Transformed popup must remain visibly allocated after font changes');
                check(x >= monitor.x && y >= monitor.y && x + w <= monitor.x + monitor.width + 1 && y + h <= monitor.y + monitor.height + 1, 'Popup clipped to fractional nonzero-origin monitor');
                check(indicator._effects.inspect().blurEffects === (material === 'frosted-glass' ? 1 : 0), 'Actual native material');
                const path = `${output}/monitor-${scheme}-${rtl ? 'rtl' : 'ltr'}-${large ? 'large' : 'normal'}-${material}.png`;
                const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
                try { await new Shell.Screenshot().screenshot(false, stream); } finally { stream.close(null); }
                const image = GdkPixbuf.Pixbuf.new_from_file(path);
                const sceneBox = window.get_frame_rect();
                // effects-window.js paints a flat 36px central stripe. The fixed
                // right gutter samples the checkerboard, away from that stripe
                // and from opaque foreground controls, in every case.
                const sampleRegion = [x + w - 9, y + 40, 6, h - 80];
                item.captures.push({material, path, popup: [x, y, w, h], image: [image.width, image.height], stage: [global.stage.width, global.stage.height],
                    scene: [sceneBox.x, sceneBox.y, sceneBox.width, sceneBox.height],
                    sceneStripe: [sceneBox.x + sceneBox.width / 2 - 18, sceneBox.y, 36, sceneBox.height], sampleRegion});
            }
            if (!result.cacheValue) {
                const [px, py] = indicator._effectBackground.get_transformed_position();
                const [pw, ph] = indicator._effectBackground.get_transformed_size();
                const value = [...indicator._cards.values()].map(card => card._hero).find(label => {
                    const [lx, ly] = label.get_transformed_position();
                    const [lw, lh] = label.get_transformed_size();
                    return label.mapped && lx >= px && lx + lw <= px + pw && ly >= py + 15 && ly + lh < py + ph - 50;
                });
                check(value, 'Synthetic value target must be inside visible foreground');
                const original = value.text;
                const [vx, vy] = value.get_transformed_position();
                const [vw, vh] = value.get_transformed_size();
                const paths = [];
                for (const text of [original, '73']) {
                    value.text = text;
                    await wait(180);
                    const path = `${output}/monitor-cache-value-${paths.length}.png`;
                    const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
                    try { await new Shell.Screenshot().screenshot(false, stream); } finally { stream.close(null); }
                    paths.push(path);
                }
                value.text = original;
                result.cacheValue = {paths, region: [vx, vy, vw, vh], original, changed: '73', scale: 1.25};
            }
            for (const [label, style] of styles) label.set_style(style);
        }
        indicator.menu.close(false);
        check(!indicator._effects.inspect().sources && !indicator._effects.inspect().blurEffects, 'Close removes effects');
        result.finished = true;
        Gio.File.new_for_path(`${output}/monitor-effects.json`).replace_contents(JSON.stringify(result), null, false, Gio.FileCreateFlags.NONE, null);
    } catch (error) { result.error = error.message; }
    finally { scene?.force_exit(); result.finished = true; evidenceFile?.replace_contents(JSON.stringify(result), null, false, 0, null); }
})()
