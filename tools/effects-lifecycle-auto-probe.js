const autoIndicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
const autoForeground = autoIndicator._effectForeground;
const autoRedirect = autoForeground.set_offscreen_redirect.bind(autoForeground);
autoForeground.set_offscreen_redirect = () => autoRedirect(imports.gi.Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY);
// Fast teardown checks in a private synthetic Shell; no frame-time claims.
(async () => {
    const result = global.gaqEffectsLifecycle = {finished: false, cycles: 0, error: ''};
    const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve(); return GLib.SOURCE_REMOVE;
    }));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    try {
        Main.overview.hide(); Main.welcomeDialog?.close();
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const extension = indicator._extension;
        check(indicator._settings.get_string('data-source') === 'demo', 'Private demo only');
        extension._themes._interface.set_boolean('enable-animations', true);
        indicator._settings.set_string('effects-mode', 'full');
        indicator._settings.set_boolean('transparency-enabled', true);
        for (let index = 0; index < 100; index++) {
            const frost = index % 2 === 1;
            indicator._settings.set_string('theme', frost ? 'glassmorphism' : 'solarpunk');
            indicator._settings.set_string('effect-material', frost ? 'frosted-glass' : 'theme');
            indicator.menu.open(false);
            // Allow the theme/style allocation and short decoration transition to
            // settle before comparing visible geometry; teardown is checked immediately.
            await wait(250);
            const layers = [indicator._effectBackground, indicator._effectDecoration, indicator._effectForeground];
            const sizes = layers.map(actor => actor.get_transformed_size());
            const allocations = layers.map(actor => {
                const box = actor.get_allocation_box();
                return [box.x1, box.y1, box.x2, box.y2];
            });
            check(layers.every(actor => actor.mapped) && sizes.every(([w, h]) => w > 200 && h > 100) &&
                allocations.every(box => JSON.stringify(box) === JSON.stringify(allocations[0])) &&
                sizes.every(size => size.every((value, dimension) => Math.abs(value - sizes[0][dimension]) <= 1 / 64)),
                `Every active sibling retains the same visible viewport: ${JSON.stringify({index, sizes, allocations, mapped: layers.map(actor => actor.mapped)})}`);
            check(indicator._effectDecoration.get_preferred_width(-1).every(value => value === 0),
                'Decorations retain zero natural request');
            const opened = indicator._effects.inspect();
            check(frost ? opened.blurEffects === 1 : opened.particles === 8 && opened.sources === 1,
                'Actual active effect before teardown');
            indicator.menu.close(false);
            const closed = indicator._effects.inspect();
            check(closed.sources === 0 && closed.particles === 0 && closed.blurEffects === 0 && closed.actors === 0,
                'Every close removes owned effects');
            result.cycles++;
        }
        indicator._settings.set_string('position', 'left');
        await wait(100);
        const replacement = Object.values(Main.panel.statusArea).find(actor => actor._extension === extension);
        check(replacement && replacement !== indicator, 'Panel position rebuilds indicator');
        replacement.menu.open(false); await wait(50);
        extension.disable(); await wait(200);
        result.disabled = replacement._effects.inspect();
        check(result.disabled.sources === 0 && result.disabled.particles === 0 && result.disabled.blurEffects === 0 && result.disabled.actors === 0,
            'Disable removes owned effects');
    } catch (error) { result.error = error.message; }
    finally { result.finished = true; }
})()
; 'GAQ_EFFECTS_LIFECYCLE_STARTED'
