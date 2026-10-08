// Native regression for presentation settings; refuses every non-private environment.
(async () => {
    const result = global.gaqPopupPresentation = {finished: false, cases: [], error: ''};
    const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const until = async predicate => {
        for (let i = 0; i < 100; i++) { if (predicate()) return; await wait(100); }
        throw new Error('Popup presentation did not settle');
    };
    try {
        const work = GLib.getenv('WORK');
        check(work && GLib.getenv('GSETTINGS_BACKEND') === 'memory' &&
            ['CONFIG', 'CACHE', 'STATE', 'DATA'].every(name => GLib.getenv(`XDG_${name}_HOME`) === `${work}/${name.toLowerCase()}`) &&
            GLib.getenv('XDG_RUNTIME_DIR') === `${work}/runtime`, 'Requires the complete private headless harness');
        const indicator = Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io'];
        const settings = indicator._settings;
        check(settings.get_string('data-source') === 'demo', 'Requires synthetic accounts');
        await until(() => indicator._snapshots.length === 5);
        const ids = indicator._connectorEntries().map(entry => entry.id);
        indicator.menu.open(false);
        await wait(800);
        const original = new Map(indicator._cards);
        const shown = () => indicator._onBarBox.get_children().map(card => [...indicator._cards].find(([, value]) => value === card)[0]);
        const reordered = [...ids].reverse();
        original.get('codex')._toggle.grab_key_focus();
        settings.set_strv('demo-popup-connector-order', reordered);
        await until(() => JSON.stringify(shown()) === JSON.stringify(reordered));
        check([...original].every(([id, actor]) => indicator._cards.get(id) === actor), 'Reordering retains reading actors');
        check(original.get('codex').captureFocus() === 'header', 'Reordering preserves logical keyboard focus');
        result.cases.push('order');
        original.get(reordered[0])._toggle.grab_key_focus();
        settings.set_strv('demo-popup-hidden-connectors', [reordered[0]]);
        await until(() => shown().length === 4);
        await wait(200);
        check(original.get(reordered[1]).captureFocus() === 'header', 'Hiding focused card moves focus to its visible neighbor');
        settings.set_strv('demo-popup-hidden-connectors', ids);
        await until(() => shown().length === 0 && indicator._chooseVisible.visible);
        await wait(200);
        check(global.stage.get_key_focus() === indicator._chooseVisible, 'All-hidden state focuses recovery action');
        check(indicator._emptyTitle.text === 'No connectors shown', 'All-hidden message describes presentation');
        check(indicator._snapshots.length === 5 && indicator._controller.providerIds().length === 5, 'Hiding does not pause collection');
        check([...original].every(([id, actor]) => indicator._cards.get(id) === actor), 'Hidden actors retain expansion and identity');
        settings.set_strv('demo-popup-hidden-connectors', []);
        await until(() => shown().length === 5 && !indicator._emptyBox.visible);
        check([...original].every(([id, actor]) => indicator._cards.get(id) === actor), 'Showing retains reading actors');
        result.cases.push('visibility');
        const {default: St} = await import('gi://St');
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const monitor = Main.layoutManager.findMonitorForActor(indicator);
        const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        settings.set_int('popup-width', 600); settings.set_int('popup-max-height', 420);
        await wait(1000);
        check(Math.abs(indicator.menu.actor.width / scale - 600) <= 3, `Whole-popup width: ${indicator.menu.actor.width / scale}`);
        check(indicator.menu.actor.height / scale <= 423, `Whole-popup height: ${indicator.menu.actor.height / scale}`);
        result.cases.push('custom-dimensions');
        settings.set_int('popup-width', 8192); settings.set_int('popup-max-height', 8192);
        await wait(1000);
        check(indicator.menu.actor.width <= area.width - 24 * scale + 3, 'Width is limited by work area');
        check(indicator.menu.actor.height <= area.height - 24 * scale + 3, 'Height is limited by work area');
        check(settings.get_int('popup-width') === 8192 && settings.get_int('popup-max-height') === 8192, 'Clamping preserves preferences');
        result.cases.push('screen-clamp');
        settings.set_int('popup-width', 0); settings.set_int('popup-max-height', 0);
        await wait(1000);
        check(Math.abs(indicator.menu.actor.width / scale - 420) <= 3, 'Automatic width returns to 420');
        check(indicator.menu.actor.height <= area.height * 0.7 + 3, 'Automatic maximum includes footer and native chrome');
        result.cases.push('automatic-dimensions');
        settings.set_int('popup-width', 1); settings.set_int('popup-max-height', 1);
        await wait(800);
        check(Math.abs(indicator.menu.actor.width / scale - 320) <= 3, 'Tiny width preference receives an effective usable minimum');
        check(indicator.menu.actor.height / scale <= 243, 'Tiny height preference receives a whole-popup usable minimum');
        check(settings.get_int('popup-width') === 1 && settings.get_int('popup-max-height') === 1, 'Effective minima never rewrite saved preferences');
        result.cases.push('minimum-dimensions');
        settings.set_int('popup-width', 0); settings.set_int('popup-max-height', 0);
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        themeContext.scale_factor = 2;
        await wait(800);
        check(Math.abs(indicator.menu.actor.width / 2 - 420) <= 3, 'Logical width adapts to native scale changes');
        const beforeArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const panelHeight = Main.panel.height;
        Main.panel.height = panelHeight + 68;
        await wait(800);
        const reducedArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        check(reducedArea.height < beforeArea.height, 'Native panel resize changes work area');
        check(indicator.menu.actor.height <= reducedArea.height * 0.7 + 3, 'Open popup follows a changed work area');
        Main.panel.height = panelHeight; themeContext.scale_factor = scale;
        await wait(500);
        result.cases.push('scale-and-work-area');
        indicator._schedulePopupLayout();
        indicator.menu.close(false);
        await wait(500);
        check(indicator._popupLayoutSource === 0 && indicator._popupFocusSource === 0, 'Closing cancels owned geometry and focus sources');
        result.cases.push('close-cleanup');
        indicator.menu.open(false);
        indicator._schedulePopupLayout();
        indicator._extension.disable();
        await wait(300);
        check(indicator._cleaned && indicator._popupLayoutSource === 0 && indicator._popupFocusSource === 0 && indicator._detachedCards.size === 0,
            'Disabling cancels pending geometry jobs and releases detached actors');
        result.cases.push('disable-cleanup');
    } catch (error) { result.error = String(error.message); }
    result.finished = true;
})(); 'GAQ_POPUP_PRESENTATION_STARTED'
