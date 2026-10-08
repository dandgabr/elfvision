// Callback elapsed-work/cadence and resource measurements; these are NOT GPU frame durations.
(async () => {
    const result = global.gaqEffectsBenchmark = {finished: false, inventory: [], measurements: [], error: ''};
    const matrixOnly = GLib.getenv('GAQ_RESOURCE_MATRIX_ONLY') === '1';
    result.mode = matrixOnly ? 'resources' : 'callbacks';
    try {
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const root = indicator._extension.path;
        const {scanThemes} = await import(`file://${root}/lib/services/themeFiles.js`);
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        const check = (value, text) => { if (!value) throw new Error(text); };
        Main.overview.hide();
        Main.welcomeDialog?.close();
        // The overview's closing allocation can still enqueue the popup's owned
        // layout idle. Open only after its transition has actually completed.
        for (let attempt = 0; Main.overview.visible && attempt < 50; attempt++)
            await wait(20);
        check(!Main.overview.visible, 'overview settles before opening the resource matrix');
        indicator.menu.open(false);
        const settledResources = async () => {
            for (let attempt = 0; attempt < 25; attempt++) {
                await wait(20);
                const resources = indicator._effects.inspect();
                if (!resources.pendingLayoutSources)
                    return resources;
            }
            throw new Error('popup layout fails to settle before resource measurement');
        };
        const manager = indicator._extension._themes;
        indicator._settings.set_string('effect-material', 'theme');
        for (const theme of scanThemes(root).themes.filter(theme => theme.builtin)) {
            indicator._settings.set_string('theme', theme.id);
            let checked = 0;
            for (const scheme of ['light', 'dark']) {
                indicator._settings.set_string('color-scheme', scheme);
                for (const mode of ['off', 'subtle', 'full']) {
                    indicator._settings.set_string('effects-mode', mode);
                    for (const animations of [true, false]) {
                        manager._interface.set_boolean('enable-animations', animations);
                        indicator._settings.set_boolean('transparency-enabled', true);
                        const resources = await settledResources();
                        const state = manager.getEffectState(true);
                        check(resources.sources <= 1 && resources.particles <= 12 && resources.blurEffects <= 1, `${theme.id} bounded resources`);
                        if (mode === 'off') check(resources.active && !resources.sources && !resources.actors
                            && resources.material === state.policy.material, `${theme.id} off preserves material without decoration: ${JSON.stringify({resources, origin: state.origin, mode: state.mode, policy: state.policy, menuOpen: indicator.menu.isOpen, overviewVisible: Main.overview.visible})}`);
                        if (!animations) check(resources.sources === 0 && state.policy.motion === 'none', `${theme.id} reduced motion`);
                        indicator._settings.set_boolean('transparency-enabled', false);
                        check(indicator._effects.inspect().material === 'opaque' && indicator._effects.inspect().blurEffects === 0, `${theme.id} opaque fallback`);
                        checked++;
                    }
                }
            }
            result.inventory.push({id: theme.id, combinations: checked});
        }
        check(result.inventory.length === 22, 'all22builtinstyles tested');
        indicator._settings.set_boolean('transparency-enabled', true);
        manager._interface.set_boolean('enable-animations', true);
        for (const [name, theme, mode, material] of (matrixOnly ? [] : [['static', 'solarpunk', 'off', 'theme'], ['leaves', 'solarpunk', 'full', 'theme'], ['frost', 'glassmorphism', 'full', 'frosted-glass']])) {
            indicator.menu.close(false);
            indicator._settings.set_string('theme', theme);
            indicator._settings.set_string('effects-mode', mode);
            indicator._settings.set_string('effect-material', material);
            indicator._settings.set_boolean('transparency-enabled', name !== 'static');
            const opened = GLib.get_monotonic_time();
            indicator.menu.open(false);
            const openSynchronousUsec = GLib.get_monotonic_time() - opened;
            await wait(300);
            const before = indicator._effects.inspect();
            const began = GLib.get_monotonic_time();
            await wait(60000);
            const elapsedUsec = GLib.get_monotonic_time() - began;
            const after = indicator._effects.inspect();
            result.measurements.push({name, elapsedUsec, openSynchronousUsec, updates: after.updates - before.updates,
                callbackUsec: after.callbackUsec - before.callbackUsec, resources: after});
        }
        for (let i = 0; i < 100; i++) {
            indicator._settings.set_string('theme', i % 2 ? 'glassmorphism' : 'solarpunk');
            indicator.menu.open(false); indicator.menu.close(false);
        }
        result.closed = indicator._effects.inspect();
        check(!result.closed.sources && !result.closed.actors && !result.closed.blurEffects, 'active100cycles zero resources');
        // Position changes rebuild the indicator through the actual extension/controller path.
        const previous = indicator._effects;
        indicator._settings.set_string('position', 'left');
        await wait(200);
        check(previous.inspect().destroyed && previous.inspect().sources === 0, 'position rebuild releases previous engine');
        const current = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const final = current._effects;
        current._extension.disable();
        check(final.inspect().destroyed && !final.inspect().sources && !final.inspect().actors, 'disable releases final engine');
        result.measurementClock = 'GLib.get_monotonic_time (elapsed wall-time microseconds)';
        result.measurementNote = 'callbackUsec and openSynchronousUsec measure elapsed work, not process CPU utilization or compositor/GPU duration';
        result.frameProcessingDuration = 'unmeasured: callback elapsed work time and open synchronous work exclude compositor/GPU frame processing; cadence is not frame cost';
    } catch (error) { result.error = error.message; }
    finally {
        result.finished = true;
        GLib.file_set_contents(`${GLib.getenv('ROOT')}/.superpowers/sdd/2026-10-07-post-mvp-execution/effects-benchmark.json`, JSON.stringify(result));
    }
})()

; 'GAQ_BENCHMARK_STARTED'
