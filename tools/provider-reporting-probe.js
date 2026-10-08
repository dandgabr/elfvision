// Synthetic API monetary cards and empty-registry regression in the private test shell only.
(async () => {
    const result = global.gaqProviderReports = {finished: false, cases: [], error: ''};
    const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
    const check = (value, message) => { if (!value) throw new Error(message); };
    try {
        let indicator = Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io'];
        check(indicator, 'private extension missing');
        const settings = indicator._settings;
        check(settings.get_string('data-source') === 'demo', 'probe requires the private demo source');
        const Shell = imports.gi.Shell;
        const St = imports.gi.St;
        const {MeterBar} = await import(`file://${indicator._extension.path}/lib/ui/meter.js`);
        Main.overview.hide(); Main.welcomeDialog?.close(); await wait(500);
        settings.set_boolean('auto-open', false);
        settings.set_string('theme', 'sistema-gnome'); settings.set_string('color-scheme', 'light');
        settings.set_string('effects-mode', 'off');
        const directory = `${indicator._extension.path}/docs/temp/reviews/assets/provider-expansion`;
        const folder = Gio.File.new_for_path(directory);
        if (!folder.query_exists(null)) folder.make_directory_with_parents(null);
        for (const [id, capped] of [['openai-api', true], ['anthropic-api', false], ['cursor', false], ['openrouter', true]]) {
            indicator.menu.close(false);
            settings.set_strv('demo-connected-connectors', [id]);
            settings.set_string('demo-connectors', JSON.stringify({version: 1, connectors: [{id, providerId: id, label: '', username: ''}]}));
            indicator = Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io'];
            for (let attempt = 0; attempt < 50; attempt++) {
                if (indicator._controller.snapshots().some(s => s.id === id)) break;
                await wait(100);
            }
            indicator.menu.open(false); await wait(300);
            const current = Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io'];
            const snapshot = current._controller.snapshots().find(s => s.id === id);
            const card = current._cards.get(id);
            check(snapshot && card && current._cards.size === 1, `${id}: only selected connector rendered`);
            check(Gio.File.new_for_path(current._iconPath(id)).query_exists(null), `${id}: packaged icon exists`);
            check(Number.isFinite(snapshot.metrics[0].percentUsed) === capped, `${id}: cap semantics`);
            check(current._barItems.get(id)._meter.visible === capped, `${id}: top-bar meter requires a known cap`);
            check(card._hero.text.includes(id === 'openrouter' ? '7.80' : id === 'openai-api' ? '24.80' : id === 'anthropic-api' ? '37.60' : '62.40'), `${id}: complete currency reading`);
            const [textWidth] = card._hero.clutter_text.get_layout().get_pixel_size();
            check(textWidth <= card._hero.width + 1, `${id}: hero text is not clipped`);
            // Uncapped spending must have no fictional summary percentage meter.
            if (!capped) check(!card._summaryMeter.visible, `${id}: unknown cap has no percentage meter`);
            const walk = actor => [actor, ...actor.get_children().flatMap(walk)];
            check(!walk(card).some(a => a instanceof St.Label && /NaN|undefined/.test(a.text)), `${id}: no invalid text`);
            const stream = Gio.File.new_for_path(`${directory}/${id}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
            try { await new Shell.Screenshot().screenshot(false, stream); } finally { stream.close(null); }
            card._toggle.emit('clicked', 1); await wait(250);
            check(card._body.visible, `${id}: expanded report body is visible`);
            check(walk(card._body).filter(a => a instanceof MeterBar).length === (capped ? 1 : 0), `${id}: expanded meter matches cap availability`);
            check(!walk(card).some(a => a instanceof St.Label && /NaN|undefined/.test(a.text)), `${id}: expanded amounts are valid`);
            const expanded = Gio.File.new_for_path(`${directory}/${id}-expanded.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
            try { await new Shell.Screenshot().screenshot(false, expanded); } finally { expanded.close(null); }
            result.cases.push(id);
        }
        settings.set_strv('demo-connected-connectors', []);
        settings.set_string('demo-connectors', JSON.stringify({version: 1, connectors: []}));
        await wait(900);
        indicator = Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io'];
        check(indicator._controller.snapshots().length === 0 && indicator._cards.size === 0, 'empty demo has no Example Credits ghost');
        check(indicator._emptyBox.visible && indicator._addAccount.visible && indicator._emptyIcon.visible, 'empty demo offers Add account instead of waiting for nonexistent data');
        settings.set_string('demo-scenario', 'drift'); await wait(900);
        indicator = Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io'];
        check(indicator._controller.snapshots().length === 0 && indicator._cards.size === 0, 'empty demo remains empty after scenario change');
        result.finished = true;
    } catch (error) { result.error = String(error.message); result.finished = true; }
})(); 'GAQ_PROVIDER_REPORTS_STARTED'
