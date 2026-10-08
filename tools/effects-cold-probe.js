(async () => {
    const result = global.gaqEffectsCold = {finished: false, cases: [], error: ''};
    try {
        const Clutter = imports.gi.Clutter;
        Main.overview.hide(); Main.welcomeDialog?.close();
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const control = GLib.getenv('GAQ_COLD_CACHE') ?? 'normal';
        const foreground = indicator._effectForeground;
        if (control === 'foreground-auto') {
            const redirect = foreground.set_offscreen_redirect.bind(foreground);
            foreground.set_offscreen_redirect = () => redirect(Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY);
        }
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        indicator._settings.set_string('effects-mode', 'full');
        indicator._settings.set_boolean('transparency-enabled', true);
        for (let index = 0; index < 5; index++) {
            indicator._settings.set_string('theme', index % 2 ? 'glassmorphism' : 'solarpunk');
            indicator._settings.set_string('effect-material', index % 2 ? 'frosted-glass' : 'theme');
            indicator.menu.open(false);
            await wait(250);
            const target = [...indicator._cards.values()][0]._toggle;
            const layers = [indicator._effectBackground, indicator._effectDecoration, foreground];
            result.cases.push({index, control, focus: global.stage.get_key_focus() === target,
                valid: layers.map(actor => actor.has_allocation()), sizes: layers.map(actor => actor.get_transformed_size()),
                foregroundRedirect: foreground.get_offscreen_redirect(), menuRedirect: indicator.menu.actor.get_offscreen_redirect()});
            target.grab_key_focus();
            result.cases[result.cases.length - 1].focus = global.stage.get_key_focus() === target;
            indicator.menu.close(false);
        }
    } catch (error) { result.error = error.message; }
    finally { result.finished = true; }
})();
'GAQ_COLD_STARTED'
