// Synthetic data and instrumentation only in a throwaway headless Shell.
(() => {
    const indicator = Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io'];
    const Clutter = imports.gi.Clutter;
    const result = global.gaqIndicatorResult = {finished: false, cases: [], error: ''};
    const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const walk = actor => [actor, ...actor.get_children().flatMap(walk)];
    const tooltips = () => walk(Main.uiGroup).filter(actor => actor.style_class?.split(' ').includes('gaq-tooltip'));
    (async () => {
        Main.overview.hide();
        for (const dialog of Main.layoutManager.modalDialogGroup.get_children())
            dialog.destroy();
        for (let attempt = 0; !indicator._cards.has('codex') && attempt < 30; attempt++)
            await wait(100);
        check(indicator._cards.has('codex'), 'demo providers must be ready');
        indicator.menu.open(false);
        await wait(100);
        const controller = indicator._controller;
        indicator._unsubscribe();
        indicator._unsubscribe = null;
        const originalSnapshots = controller.snapshots;
        const originalRender = indicator._renderSnapshots;
        let renders = 0;
        let latest = originalSnapshots.call(controller);
        controller.snapshots = () => latest;
        indicator._renderSnapshots = function () {
            renders++;
            return originalRender.call(this);
        };
        try {
            const card = indicator._cards.get('codex');
            card._toggle.grab_key_focus();
            for (const percentUsed of [84, 85, 86]) {
                latest = latest.map(snapshot => snapshot.id === 'codex'
                    ? {...snapshot, metrics: snapshot.metrics.map(metric => ({...metric, percentUsed}))} : snapshot);
                indicator._onSnapshots();
            }
            check(renders === 0 && indicator._renderSource !== 0, 'burst must be queued');
            await wait(100);
            check(renders === 1, `burst must render once, got ${renders}`);
            check(indicator._barItems.get('codex')._view.number === '86', 'latest response must win');
            check(indicator._cards.get('codex') === card && global.stage.get_key_focus() === card._toggle, 'response preserves actor and actual keyboard focus');
            latest = latest.map(snapshot => snapshot.id === 'command-code'
                ? {...snapshot, metrics: snapshot.metrics.map(metric => ({...metric, percentUsed: 100}))} : snapshot);
            indicator._onSnapshots();
            await wait(100);
            check(global.stage.get_key_focus() === card._toggle, 'selection regroup preserves actual keyboard focus');
            result.cases.push('burst/latest/focus');
            const before = card._renderedKey;
            const originalNow = Date.now;
            const advancedNow = originalNow() + 60000;
            try {
                Date.now = () => advancedNow;
                indicator._onSnapshots();
                await wait(100);
                check(indicator._nowMs === advancedNow, 'clock-only redraw refreshes the rendering clock');
                check(card._renderedKey !== before, 'countdown descriptions change without a response');
                check(indicator._cards.get('codex') === card, 'clock redraw retains actor');
            } finally {
                Date.now = originalNow;
            }
            result.cases.push('clock-redraw');
            const row = card._body.get_children().find(actor => actor.can_focus);
            check(row, 'pacing row is focusable');
            row.grab_key_focus();
            latest = latest.map(snapshot => snapshot.id === 'codex'
                ? {...snapshot, metrics: snapshot.metrics.map(metric => ({...metric, percentUsed: 87}))} : snapshot);
            indicator._onSnapshots();
            await wait(100);
            const newRow = card._body.get_children().find(actor => actor.can_focus);
            check(global.stage.get_key_focus() === newRow, 'pacing row retains logical focus after response rebuild');
            latest = latest.map(snapshot => snapshot.id === 'command-code'
                ? {...snapshot, metrics: snapshot.metrics.map(metric => ({...metric, percentUsed: 10}))} : snapshot);
            indicator._onSnapshots();
            await wait(100);
            check(global.stage.get_key_focus() === card._body.get_children().find(actor => actor.can_focus), 'pacing row retains focus after regroup');
            const updateCodex = async change => {
                latest = latest.map(snapshot => snapshot.id === 'codex' ? {...snapshot, ...change} : snapshot);
                indicator._onSnapshots();
                await wait(100);
            };
            await updateCodex({state: 'network'});
            const retry = () => card._body.get_children().find(actor => actor.label === indicator._t.gettext('Try again'));
            retry().grab_key_focus();
            await updateCodex({nextRetryAt: Date.now() + 120000});
            check(global.stage.get_key_focus() === retry(), 'Retry retains logical focus after response rebuild');
            latest = latest.map(snapshot => snapshot.id === 'command-code'
                ? {...snapshot, metrics: snapshot.metrics.map(metric => ({...metric, percentUsed: 100}))} : snapshot);
            indicator._onSnapshots();
            await wait(100);
            check(global.stage.get_key_focus() === retry(), 'Retry retains focus after regroup');
            await updateCodex({state: 'ok'});
            check(global.stage.get_key_focus() === card._toggle, 'removed action falls back to surviving header');
            const originalContext = indicator._context;
            indicator._context = function () { return {...originalContext.call(this), configurable: true}; };
            try {
                await updateCodex({state: 'network'});
                retry().grab_key_focus();
                await updateCodex({state: 'auth_required', reason: 'expired'});
                const configure = () => card._body.get_children().find(actor => actor.can_focus);
                check(global.stage.get_key_focus() === configure(), 'removed Retry on authentication focuses Configure when header is disabled');
                configure().grab_key_focus();
                await updateCodex({reason: 'rejected'});
                check(global.stage.get_key_focus() === configure(), 'Configure retains logical focus when label changes');
                latest = latest.map(snapshot => snapshot.id === 'command-code'
                    ? {...snapshot, metrics: snapshot.metrics.map(metric => ({...metric, percentUsed: 10}))} : snapshot);
                indicator._onSnapshots();
                await wait(100);
                check(global.stage.get_key_focus() === configure(), 'Configure retains focus after regroup');
                indicator._legendButton.grab_key_focus();
                await updateCodex({reason: 'expired'});
                check(global.stage.get_key_focus() === indicator._legendButton, 'card response does not steal external focus');
            } finally {
                indicator._context = originalContext;
            }
            result.cases.push('body-focus');
        } finally {
            controller.snapshots = originalSnapshots;
            indicator._renderSnapshots = originalRender;
        }
        indicator.menu.close(false);
        await wait(100);
        const item = [...indicator._barItems.values()].find(actor => actor.visible);
        item.grab_key_focus();
        check(item.can_focus && global.stage.get_key_focus() === item, 'bar item accepts actual keyboard focus');
        check(tooltips().some(actor => actor.visible), 'focused bar item displays tooltip');
        indicator.grab_key_focus();
        check(!tooltips().some(actor => actor.visible), 'focus out hides tooltip');
        result.cases.push('bar-keyboard-tooltip');
        indicator.menu.open(false);
        indicator._legendButton.emit('clicked', 1);
        indicator._legendButton.grab_key_focus();
        await wait(100);
        check(indicator._legend.visible, 'legend opens');
        const keyboard = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const escape = async () => {
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
            await wait(100);
        };
        await escape();
        check(!indicator._legend.visible && !indicator._legendButton.checked && indicator.menu.isOpen, 'first Escape hides legend and keeps popup open');
        await escape();
        check(!indicator.menu.isOpen, 'second Escape uses native popup close');
        result.cases.push('two-Escape');
        indicator._onSnapshots();
        check(indicator._renderSource !== 0, 'cleanup has a queued render');
        indicator._extension.disable();
        check(indicator._renderSource === 0 && !tooltips().length, 'disable removes render source and tooltip actor');
        result.cases.push('cleanup');
        result.finished = true;
    })().catch(error => { result.error = error.message; result.finished = true; });
    return 'indicator probe started';
})()
