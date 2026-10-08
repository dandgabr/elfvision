// Private synthetic scene. Compare identical geometry with/without the card's
// original shadow, so backdrop content alone cannot count as a lateral shadow.
(() => {
    global.gaqCardShadow = {finished: false, cases: [], error: ''};
    const result = global.gaqCardShadow;
    const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve(); return GLib.SOURCE_REMOVE;
    }));
    (async () => {
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const root = indicator._extension.path;
        Main.overview.hide();
        Main.welcomeDialog?.close();
        await wait(600);
        indicator._settings.set_string('theme', 'glassmorphism');
        indicator._settings.set_string('effects-mode', 'subtle');
        indicator._settings.set_string('effect-material', 'decorative-glass');
        indicator._settings.set_boolean('transparency-enabled', true);
        for (const scheme of ['light', 'dark']) {
            indicator.menu.close(false);
            indicator._settings.set_string('color-scheme', scheme);
            indicator.menu.open(false);
            await wait(600);
            const card = indicator._cards.values().next().value;
            const [x, y] = card.get_transformed_position();
            const [width, height] = card.get_transformed_size();
            const [sx, sy] = indicator._scroll.get_transformed_position();
            const [sw, sh] = indicator._scroll.get_transformed_size();
            const node = card.get_parent().get_theme_node();
            const left = Math.min(12, node.get_padding(imports.gi.St.Side.LEFT));
            const right = Math.min(12, node.get_padding(imports.gi.St.Side.RIGHT));
            if (left <= 1 || right <= 1)
                throw new Error('Glass must reserve lateral shadow space');
            if (x - left < sx || x + width + right > sx + sw || y + 15 < sy || y + height - 15 > sy + sh)
                throw new Error(`Lateral shadow samples must stay inside the scroll viewport: ${JSON.stringify({card: [x, y, width, height], scroll: [sx, sy, sw, sh], padding: [left, right]})}`);
            const entry = {scheme, card: [x, y, width, height], stage: [global.stage.width, global.stage.height],
                strips: {left: [x - left, y + 15, x - 1, y + height - 15],
                    right: [x + width + 1, y + 15, x + width + right, y + height - 15]}, paths: []};
            for (const shadow of ['original', 'none']) {
                card.set_style(shadow === 'none' ? 'box-shadow: none;' : null);
                await wait(200);
                const bounds = [...card.get_transformed_position(), ...card.get_transformed_size()];
                if (bounds.some((value, index) => Math.abs(value - entry.card[index]) > 1))
                    throw new Error('Shadow control must preserve card geometry');
                const path = `${root}/.superpowers/sdd/2026-10-07-open-items/card-shadow-${scheme}-${shadow}.png`;
                const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
                try { await new Shell.Screenshot().screenshot(false, stream); }
                finally { stream.close(null); }
                entry.paths.push(path);
            }
            card.set_style(null);
            result.cases.push(entry);
        }
        indicator.menu.close(false);
        result.finished = true;
        GLib.file_set_contents(`${root}/.superpowers/sdd/2026-10-07-open-items/card-shadow.json`, JSON.stringify(result));
    })().catch(error => { result.error = error.message; result.finished = true; });
    return 'GAQ_CARD_SHADOW_STARTED';
})()
