// Actual virtual pointer input in the private demo Shell; no provider/network access.
(async () => {
    const result = global.gaqEffectsCloseRegression = {finished: false, cases: [], error: ''};
    let pointer;
    try {
        const {default: Clutter} = await import('gi://Clutter');
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve(); return GLib.SOURCE_REMOVE;
        }));
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        check(indicator?._settings.get_string('data-source') === 'demo', 'Private demo only');
        Main.overview.hide(); Main.welcomeDialog?.close();
        // The test starts on the desktop. Overview transitions close panel menus;
        // finish that fixture preparation before exercising the actual close path.
        for (let tick = 0; tick < 30 && Main.overview.visible; tick++)
            await wait(100);
        check(!Main.overview.visible, 'Desktop is ready before pointer scenarios');
        await wait(450);
        pointer = Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        // A newly created virtual pointer starts at the hot corner. Move it
        // before input so the fixture does not reopen Overview during the click.
        const monitor = Main.layoutManager.primaryMonitor;
        pointer.notify_absolute_motion(GLib.get_monotonic_time(),
            monitor.x + monitor.width / 2, monitor.y + monitor.height / 2);
        await wait(200);
        Main.overview.hide();
        for (let tick = 0; tick < 30 && Main.overview.visible; tick++)
            await wait(100);
        check(!Main.overview.visible, 'Virtual pointer fixture settles on desktop');
        await wait(450);
        const click = (x, y) => {
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
            pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        };
        indicator._extension._themes._interface.set_boolean('enable-animations', true);
        indicator._settings.set_string('effects-mode', 'full');
        indicator._settings.set_boolean('transparency-enabled', true);
        for (const theme of ['bento-grid', 'glassmorphism']) {
            indicator._settings.set_string('theme', theme);
            indicator._settings.set_string('effect-material', theme === 'glassmorphism' ? 'frosted-glass' : 'theme');
            for (const action of ['outside-click', 'other-popup']) {
                Main.panel.statusArea.dateMenu.menu.close();
                await wait(250);
                // Changing the theme also restyles the panel button. Click its
                // allocated hit target, rather than a dirty natural-size estimate.
                for (let tick = 0; tick < 100 && (!indicator.has_allocation() || !indicator.mapped); tick++)
                    await wait(16);
                check(indicator.has_allocation() && indicator.mapped, 'Panel button has a valid mapped hit target');
                const [buttonX, buttonY] = indicator.get_transformed_position();
                const [buttonWidth, buttonHeight] = indicator.get_transformed_size();
                check(buttonWidth > 0 && buttonHeight > 0, 'Visible panel button can be clicked');
                click(buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
                await wait(450);
                const actor = indicator.menu.actor;
                const anchor = indicator._anchor;
                const [openedX] = actor.get_transformed_position();
                const [openedWidth] = actor.get_transformed_size();
                const openedCenterX = openedX + openedWidth / 2;
                const menuRedirect = actor.get_offscreen_redirect();
                const foregroundRedirect = indicator._effectForeground.get_offscreen_redirect();
                const entry = {theme, action, openedX, openedCenterX, anchor: Boolean(anchor), visible: actor.visible, open: indicator.menu.isOpen,
                    buttonPosition: indicator.get_transformed_position(), buttonSize: indicator.get_transformed_size(),
                    buttonAllocated: indicator.has_allocation(), buttonMapped: indicator.mapped,
                    samples: [], closed: false};
                result.cases.push(entry);
                check(anchor && actor.visible && openedX > 100, 'Visible popup has a pinned non-corner origin');
                if (action === 'outside-click') {
                    const monitor = Main.layoutManager.primaryMonitor;
                    click(monitor.x + 30, monitor.y + monitor.height - 30);
                } else {
                    const button = Main.panel.statusArea.dateMenu;
                    const [x, y] = button.get_transformed_position();
                    const [width, height] = button.get_transformed_size();
                    click(x + width / 2, y + height / 2);
                }
                for (let tick = 0; tick < 50; tick++) {
                    await wait(16);
                    if (actor.visible && actor.opacity > 0) {
                        const [x, y] = actor.get_transformed_position();
                        const [width, height] = actor.get_transformed_size();
                        entry.samples.push({x, y, width, height, opacity: actor.opacity, open: indicator.menu.isOpen});
                        check([x, y, width, height].every(Number.isFinite) && width > 200 && height > 100,
                            'Visible closing popup retains finite positive geometry');
                        // Shell's close animation shrinks around the center. Its
                        // left edge legitimately moves; the horizontal center stays pinned.
                        check(Math.abs(x + width / 2 - openedCenterX) <= 2,
                            'Closing popup must not flash at the left corner');
                        if (!indicator.menu.isOpen) {
                            check(indicator._anchor === anchor, 'Closing fade retains its position anchor');
                            check(actor.get_offscreen_redirect() === menuRedirect &&
                                indicator._effectForeground.get_offscreen_redirect() === foregroundRedirect,
                            'Closing fade retains its rendering policy');
                        }
                    }
                    if (!indicator.menu.isOpen) {
                        const effects = indicator._effects.inspect();
                        check(effects.sources === 0 && effects.particles === 0 && effects.blurEffects === 0 && effects.actors === 0,
                            'Closing immediately removes owned decorative work');
                        entry.closed = true;
                    }
                    if (entry.closed && !actor.visible) break;
                }
                check(entry.closed && !actor.visible, 'Actual pointer action closes the popup');
                check(!indicator._anchor, 'Hidden popup releases its anchor');
                if (action === 'other-popup') {
                    entry.otherPopupClicks = 1;
                    // The existing menu grab may consume the first outside click.
                    // Its closing fade has already been checked above; finish
                    // opening the other popup through actual pointer input too.
                    if (!Main.panel.statusArea.dateMenu.menu.isOpen) {
                        const button = Main.panel.statusArea.dateMenu;
                        const [x, y] = button.get_transformed_position();
                        const [width, height] = button.get_transformed_size();
                        click(x + width / 2, y + height / 2);
                        entry.otherPopupClicks++;
                        await wait(200);
                    }
                    check(Main.panel.statusArea.dateMenu.menu.isOpen, 'Pointer opens the other panel popup');
                }
            }
        }
    } catch (error) { result.error = error.message; }
    finally {
        pointer = null;
        Main.panel.statusArea.dateMenu.menu.close();
        result.finished = true;
    }
})()
; 'GAQ_CLOSE_REGRESSION_STARTED'
