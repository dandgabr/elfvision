// Isolated profiling only: glFinish serializes frames and changes normal frame scheduling.
(async () => {
    const result = global.gaqFrameProfile = {finished: false, measurements: [], error: ''};
    const perf = Shell.PerfLog.get_default();
    const oldTimestamps = global.frame_timestamps;
    const oldFinish = global.frame_finish_timestamp;
    let redraw = 0;
    try {
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        result.sourceHashes = {};
        for (const path of ['lib/ui/indicator.js', 'lib/ui/themeEffects.js', 'lib/ui/numericText.js', 'lib/ui/providerCard.js',
            'lib/core/theme.js', 'lib/core/theme.template.css', 'lib/core/themeEffects.js', 'lib/services/themeManager.js',
            'lib/ui/effects/leaves.js', 'lib/ui/effects/frost.js', 'lib/ui/effects/glass.js',
            'lib/ui/effects/readingVeil.js', 'lib/ui/effects/optics.js', 'lib/ui/effects/textures.js',
            'themes/builtin/solarpunk/theme.json', 'themes/builtin/glassmorphism/theme.json',
            'tools/effects-frame-probe.js']) {
            const [ok, bytes] = GLib.file_get_contents(`${indicator._extension.path}/${path}`);
            if (!ok) throw new Error(`Missing measurement source: ${path}`);
            result.sourceHashes[path] = GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, bytes);
        }
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve(); return GLib.SOURCE_REMOVE;
        }));
        Main.overview.hide();
        Main.welcomeDialog?.close();
        for (const dialog of Main.layoutManager.modalDialogGroup.get_children())
            dialog.close?.();
        indicator._extension._themes._interface.set_boolean('enable-animations', true);
        indicator._settings.set_boolean('transparency-enabled', true);
        indicator._settings.set_string('color-scheme', 'light');
        perf.set_enabled(true);
        global.frame_timestamps = true;
        global.frame_finish_timestamp = true;
        // Apply the same forced stage-redraw cadence in all four samples.
        redraw = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 34, () => {
            global.stage.queue_redraw(); return GLib.SOURCE_CONTINUE;
        });
        for (const [name, theme, mode, material] of [
            ['static', 'solarpunk', 'off', 'theme'],
            ['leaves', 'solarpunk', 'full', 'theme'],
            ['static-glass', 'glassmorphism', 'off', 'theme'],
            ['frost', 'glassmorphism', 'full', 'frosted-glass'],
        ]) {
            indicator.menu.close(false);
            indicator._settings.set_string('theme', theme);
            indicator._settings.set_string('effects-mode', mode);
            indicator._settings.set_string('effect-material', material);
            // Off controls motion/decoration. An opaque reference must explicitly
            // disable transparency so static-glass does not retain native frost.
            indicator._settings.set_boolean('transparency-enabled', mode !== 'off');
            const opening = GLib.get_monotonic_time();
            indicator.menu.open(false);
            const opened = GLib.get_monotonic_time();
            await wait(1500);
            const layers = mode === 'off' ? [indicator._effectForeground]
                : [indicator._effectBackground, indicator._effectForeground];
            if (layers.some(actor => {
                const [w, h] = actor.get_transformed_size();
                return w < 200 || h < 100 || !actor.mapped;
            })) throw new Error('visible effect/control viewport required for processing measurement');
            const began = GLib.get_monotonic_time();
            let firstPaint = null;
            perf.replay((time, event) => {
                if (firstPaint === null && time >= opening && time < began && event === 'clutter.paintCompletedTimestamp')
                    firstPaint = time;
            });
            await wait(60000);
            const ended = GLib.get_monotonic_time();
            const durations = [];
            let start = null;
            perf.replay((time, event) => {
                if (time < began || time > ended)
                    return;
                if (event === 'clutter.stagePaintStart')
                    start = time;
                if (event === 'clutter.paintCompletedTimestamp' && start !== null) {
                    if (time >= start)
                        durations.push((time - start) / 1000);
                    start = null;
                }
                if (event === 'clutter.stagePaintDone')
                    start = null;
            });
            durations.sort((a, b) => a - b);
            if (durations.length < 1000)
                throw new Error('insufficient complete GPU-finish paint samples');
            result.measurements.push({name, durationMs: (ended - began) / 1000,
                menuOpenWorkMs: (opened - opening) / 1000,
                firstCompletedPaintMs: firstPaint === null ? null : (firstPaint - opening) / 1000,
                sampleCount: durations.length,
                p50Ms: durations[Math.ceil(durations.length * 0.50) - 1],
                p95Ms: durations[Math.ceil(durations.length * 0.95) - 1],
                p99Ms: durations[Math.ceil(durations.length * 0.99) - 1],
                maxMs: durations[durations.length - 1], resources: indicator._effects.inspect()});
        }
        indicator.menu.close(false);
        result.closed = indicator._effects.inspect();
        result.method = 'Shell.PerfLog stagePaintStart -> paintCompletedTimestamp; Shell 50.5 frame-finish-timestamp performs cogl_context_flush + glFinish';
        result.limitations = 'Serialized CPU submission plus GPU-finish wall duration; not pure GPU timer-query time, normal frame cadence or end-to-end presentation latency. Forced redraw every 34ms; private synthetic headless session only.';
        result.budgets = result.measurements.map(sample => {
            const baselineName = sample.name === 'frost' || sample.name === 'static-glass' ? 'static-glass' : 'static';
            const baseline = result.measurements.find(value => value.name === baselineName).p95Ms;
            return {name: sample.name, baseline: baselineName,
            p95Below60HzBudget: sample.p95Ms <= 1000 / 60,
            p95AddedMs: sample.p95Ms - baseline,
            p95AddedWithin2Ms: sample.p95Ms - baseline <= 2};
        });
    } catch (error) {
        result.error = error.message;
    } finally {
        if (redraw) GLib.source_remove(redraw);
        global.frame_timestamps = oldTimestamps;
        global.frame_finish_timestamp = oldFinish;
        perf.set_enabled(false);
        result.finished = true;
        GLib.file_set_contents(`${GLib.getenv('ROOT')}/.superpowers/sdd/2026-10-07-open-items/frame-profile.json`, JSON.stringify(result));
    }
})()
; 'GAQ_FRAME_PROFILE_STARTED'
