// User-reported regressions, observed in the actual private Shell with demo data.
(async () => {
    const result = global.gaqManualRegression = {finished: false, error: '', toggles: [], materials: []};
    try {
        const scheme = GLib.getenv('GAQ_NUMERIC_SCHEME') || 'light';
        const mode = GLib.getenv('GAQ_NUMERIC_MODE') || 'off';
        if (!['light', 'dark'].includes(scheme) || !['off', 'subtle', 'full'].includes(mode))
            throw new Error('Invalid synthetic numeric scenario');
        result.scheme = scheme;
        result.mode = mode;
        const prefix = `${scheme}-${mode}`;
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve(); return GLib.SOURCE_REMOVE;
        }));
        let indicator;
        for (let attempt = 0; attempt < 50 && !indicator; attempt++) {
            indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
            if (!indicator) await wait(100);
        }
        if (!indicator) throw new Error('Extension indicator did not become ready within five seconds');
        Main.overview.hide(); Main.welcomeDialog?.close();
        await wait(600);
        indicator._settings.set_string('theme', 'sistema-gnome');
        indicator._settings.set_string('color-scheme', scheme);
        indicator._settings.set_string('effects-mode', mode);
        indicator._settings.set_boolean('auto-open', false);
        indicator.menu.open(false);
        await wait(500);
        let entry;
        for (let attempt = 0; attempt < 100 && !entry; attempt++) {
            entry = [...indicator._cards].find(([, card]) => card._name.text.includes('Credits'));
            if (!entry) await wait(100);
        }
        if (!entry) throw new Error('Synthetic credits card missing');
        const [id, card] = entry;
        const {default: Clutter} = await import('gi://Clutter');
        const {ensureActorVisibleInScrollView} = await import('resource:///org/gnome/shell/misc/animationUtils.js');
        const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), 600, 700);
        await wait(200);
        Main.overview.hide();
        await wait(600);
        indicator.menu.close(false);
        await wait(450);
        indicator.menu.open(false);
        await wait(450);
        ensureActorVisibleInScrollView(indicator._scroll, card._toggle);
        await wait(300);
        for (let cycle = 0; cycle < 4; cycle++) {
            const sample = {cycle, frames: [], attributesChanged: 0, stylesChanged: 0, attributeEvents: []};
            const attrs = card._hero.clutter_text.connect('notify::attributes', () => {
                sample.attributesChanged++;
                sample.attributeEvents.push(card._hero.clutter_text.get_layout().get_attributes()?.to_string());
            });
            const styles = card._hero.connect('style-changed', () => sample.stylesChanged++);
            const [x, y] = card._toggle.get_transformed_position();
            sample.click = [x + 60, y + 12];
            sample.visible = card._toggle.mapped;
            sample.menuOpen = indicator.menu.isOpen;
            sample.menuVisible = indicator.menu.actor.visible;
            const {default: Shell} = await import('gi://Shell');
            const {default: Gio} = await import('gi://Gio');
            const stream = Gio.File.new_for_path(`${indicator._extension.path}/.superpowers/sdd/2026-10-08-manual-regressions/${prefix}-pointer-${cycle}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
            try { await new Shell.Screenshot().screenshot(false, stream); } finally { stream.close(null); }
            sample.pick = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x + 60, y + 12)?.toString();
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + 60, y + 12);
            await wait(150);
            pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            await wait(32);
            pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
            for (let frame = 0; frame < 20; frame++) {
                await wait(16);
                const box = card._hero.get_allocation_box();
                sample.frames.push({box: [box.x1, box.y1, box.x2, box.y2],
                    preferred: card._hero.get_preferred_width(-1),
                    attrs: card._hero.clutter_text.get_layout().get_attributes()?.to_string(),
                    text: card._hero.text, source: card._hero._tabularNumbersSource,
                    paintPosition: card._hero.get_transformed_position(),
                    scrollValue: indicator._scroll.vadjustment.value,
                    open: indicator._userOpen.get(id)?.open});
            }
            card._hero.clutter_text.disconnect(attrs); card._hero.disconnect(styles);
            const [heroX, heroY] = card._hero.get_transformed_position();
            sample.heroRegion = [Math.floor(heroX), Math.floor(heroY), Math.ceil(card._hero.width), Math.ceil(card._hero.height)];
            const afterStream = Gio.File.new_for_path(`${indicator._extension.path}/.superpowers/sdd/2026-10-08-manual-regressions/${prefix}-pointer-after-${cycle}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
            try { await new Shell.Screenshot().screenshot(false, afterStream); } finally { afterStream.close(null); }
            result.toggles.push(sample);
            if (!indicator._userOpen.has(id)) throw new Error('Pointer did not activate the credits header');
            if (sample.frames.some(frame => !frame.attrs?.includes('tnum=1') || frame.open !== (cycle % 2 === 0)))
                throw new Error('Numeric features or actual pointer toggling failed');
        }
        pointer.run_dispose();
        if (result.toggles.some(toggle => toggle.attributeEvents.some(attributes => !attributes?.includes('tnum=1'))))
            throw new Error('A pointer style event lost effective tabular numeric features');
        for (const theme of ['organic-biophilic', 'glassmorphism']) {
            indicator._settings.set_string('theme', theme);
            indicator._settings.set_boolean('transparency-enabled', true);
            indicator._settings.set_string('effect-material', 'frosted-glass');
            for (const mode of ['off', 'subtle', 'full']) {
                indicator._settings.set_string('effects-mode', mode);
                await wait(300);
                const node = indicator._updated.get_theme_node();
                const first = indicator._onBarBox.get_first_child();
                result.materials.push({theme, mode, actual: indicator._effects.inspect(),
                    policy: indicator._extension._themes.getEffectState(true).policy,
                    footerBackground: node.get_background_color().to_string(),
                    cardPosition: first?.get_transformed_position(),
                    framePosition: indicator._effectForeground.get_transformed_position(),
                    frameSize: indicator._effectForeground.get_transformed_size()});
            }
        }
    } catch (error) { result.error = error.message; }
    finally {
        result.finished = true;
        GLib.file_set_contents(`${GLib.getenv('ROOT')}/.superpowers/sdd/2026-10-08-manual-regressions/before.json`, JSON.stringify(result, null, 2));
    }
})();
'GAQ_MANUAL_REGRESSION_STARTED';
