// Evaluated only inside tools/headless-shell.sh; all changes belong to its throwaway session.
(() => {
    const uuid = 'gnome-ai-quota@dandgabr.github.io';
    const initial = Main.panel.statusArea[uuid];
    const extension = initial._extension;
    const St = imports.gi.St;
    const Clutter = imports.gi.Clutter;
    global.gaqLayoutResult = {finished: false, cases: [], labels: 0, actions: 0, error: ''};
    const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const walk = actor => [actor, ...actor.get_children().flatMap(walk)];
    const checkContents = (root, monitor) => {
        for (const actor of walk(root)) {
            if (!actor.mapped || !actor.visible || actor.width <= 0 || !(actor instanceof St.Label || actor instanceof St.Button))
                continue;
            const [x] = actor.get_transformed_position();
            const [width] = actor.get_transformed_size();
            const parent = actor.get_parent();
            const [px] = parent.get_transformed_position();
            const [pw] = parent.get_transformed_size();
            check(x >= monitor.x - 1 && x + width <= monitor.x + monitor.width + 1,
                `text/action outside monitor: ${actor.style_class} x=${x} width=${width}`);
            check(x >= px - 1 && x + width <= px + pw + 1,
                `text/action outside parent: ${actor.style_class} x=${x} width=${width} parent=${px}/${pw}`);
            if (actor instanceof St.Label) {
                if (actor === [...Main.panel.statusArea[uuid]._cards.values()].find(card => card._hero === actor)?._hero ||
                    actor.style_class?.includes('gaq-hero-small')) {
                    const [textWidth, textHeight] = actor.clutter_text.get_layout().get_pixel_size();
                    check(textWidth <= actor.width + 1 && textHeight <= actor.height + 1,
                        `primary reading clipped: ${actor.text} text=${textWidth}/${textHeight} actor=${actor.width}/${actor.height}`);
                }
                global.gaqLayoutResult.labels++;
            }
            if (actor instanceof St.Button)
                global.gaqLayoutResult.actions++;
        }
    };
    const original = {gettext: extension.gettext.bind(extension), ngettext: extension.ngettext.bind(extension), pgettext: extension.pgettext.bind(extension)};
    (async () => {
        const {pseudoTranslations} = await import(`file://${extension.path}/lib/core/pseudoLocale.js`);
        const {MeterBar} = await import(`file://${extension.path}/lib/ui/meter.js`);
        const {UntrackedSection} = await import(`file://${extension.path}/lib/ui/popupExtras.js`);
        Main.overview.hide();
        for (const dialog of Main.layoutManager.modalDialogGroup.get_children())
            dialog.destroy();
        const desktop = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        for (const rtl of [false, true]) {
            for (const expanded of [false, true]) {
                let normalTextHeight = 0;
                for (const large of [false, true]) {
                    desktop.set_double('text-scaling-factor', large ? 1.5 : 1);
                    extension.disable();
                    check(!walk(Main.uiGroup).some(actor => actor.style_class?.split(' ').includes('gaq-tooltip')), 'disable releases tooltip actor');
                    Object.assign(extension, expanded ? pseudoTranslations(original) : original);
                    extension.enable();
                    await wait(800);
                    const indicator = Main.panel.statusArea[uuid];
                    indicator.menu.open(false);
                    indicator._legend.toggle();
                    const direction = rtl ? Clutter.TextDirection.RTL : Clutter.TextDirection.LTR;
                    walk(indicator.menu.actor).forEach(actor => actor.set_text_direction(direction));
                    walk(indicator).forEach(actor => actor.set_text_direction(direction));
                    if (large) {
                        // Theme tokens use explicit pixel fonts; enlarge those too, and
                        // verify actual rendered height rather than merely changing a setting.
                        for (const actor of walk(indicator.menu.actor)) {
                            if (actor instanceof St.Label) {
                                const size = actor.get_theme_node().get_font().get_size() / 1024;
                                actor.set_style(`${actor.get_style() ?? ''} font-size: ${size * 1.5}px;`);
                            }
                        }
                    }
                    await wait(250);
                    const menuWidth = indicator.menu.actor.width;
                    const monitor = Main.layoutManager.primaryMonitor;
                    check(menuWidth > 0 && menuWidth <= monitor.width, 'popup must fit the narrow monitor');
                    checkContents(indicator.menu.actor, monitor);
                    for (const card of indicator._cards.values()) {
                        check(card.width > 0 && card.width <= menuWidth, 'card fits popup');
                        check(card._toggle.width > 0, 'card keyboard target allocated');
                        check(!card._hero.clutter_text.get_layout().is_ellipsized(),
                            `primary value must remain complete: ${card._name.text} ${card._hero.text}`);
                    }
                    const card = indicator._cards.values().next().value;
                    const [, textHeight] = card._hero.clutter_text.get_layout().get_pixel_size();
                    if (large)
                        check(textHeight > normalTextHeight, `larger font must affect rendered text: ${textHeight}/${normalTextHeight}`);
                    else
                        normalTextHeight = textHeight;
                    card._toggle.grab_key_focus();
                    check(global.stage.get_key_focus() === card._toggle, 'card action reachable by keyboard');
                    const focusable = walk(indicator.menu.actor).filter(actor => actor instanceof St.Button && actor.can_focus && actor.mapped);
                    check(focusable.length > 1, 'popup has multiple keyboard actions');
                    for (const button of focusable) {
                        button.grab_key_focus();
                        check(global.stage.get_key_focus() === button, 'popup action accepts keyboard focus');
                    }
                    check(walk(Main.uiGroup).filter(actor => actor.style_class?.split(' ').includes('gaq-tooltip')).length <= 1, 'focus changes reuse one tooltip');
                    const meter = new MeterBar();
                    Main.uiGroup.add_child(meter);
                    meter.set_position(400, 400);
                    meter.set_size(100, 8);
                    await wait(150);
                    meter.set_text_direction(direction);
                    meter.setValue(25, {pace: 60});
                    await wait(150);
                    check(meter._fill.width === 25 && meter._fill.x === (rtl ? 75 : 0), `meter fill mirrored: direction=${meter.get_text_direction()} RTL=${Clutter.TextDirection.RTL} width=${meter.width} fill=${meter._fill.width} x=${meter._fill.x}`);
                    check(Math.abs(meter._tick.x - (rtl ? 39 : 59)) <= 1, 'pacing tick mirrored at runtime');
                    meter.destroy();
                    const section = new UntrackedSection({t: indicator._t, iconPath: id => indicator._iconPath(id), onResume() {}});
                    section.update([{id: 'antigravity', name: 'Antigravity'}], {expand: true});
                    Main.uiGroup.add_child(section.actor);
                    section.actor.set_position(100, 450);
                    section.actor.set_width(400);
                    walk(section.actor).forEach(actor => actor.set_text_direction(direction));
                    await wait(150);
                    const resume = section._list.get_children()[0].get_children().at(-1);
                    check(resume.width > 0 && resume.width < 400, 'resume button stays allocated');
                    checkContents(section.actor, monitor);
                    section.actor.destroy();
                    // A screenshot of the final RTL/expanded popup is useful for human inspection.
                    if (rtl && expanded && large) {
                        const shot = new Shell.Screenshot();
                        const stream = Gio.File.new_for_path('/tmp/gaq-rtl-expanded-popup.png').replace(null, false, Gio.FileCreateFlags.NONE, null);
                        try {
                            await shot.screenshot(false, stream);
                        } finally {
                            stream.close(null);
                        }
                    }
                    global.gaqLayoutResult.cases.push(`${rtl ? 'RTL' : 'LTR'}/${expanded ? 'expanded' : 'normal'}/${large ? 'large-font' : 'normal-font'}`);
                    indicator.menu.close(false);
                }
            }
        }
        desktop.set_double('text-scaling-factor', 1);
        Object.assign(extension, original);
        // Shadow gutters narrow these headers most. Exercise complete currency
        // readings independently of the production demo's small balance.
        const indicator = Main.panel.statusArea[uuid];
        indicator._settings.set_string('color-scheme', 'dark');
        for (const theme of ['glassmorphism', 'aurora-mesh-gradient']) {
            indicator._settings.set_string('theme', theme);
            indicator.menu.open(false);
            await wait(300);
            const moneyCard = [...indicator._cards.values()].find(item => JSON.parse(item._renderedKey)[0].money);
            const [view, open] = JSON.parse(moneyCard._renderedKey);
            for (const rtl of [false, true]) {
                walk(indicator.menu.actor).forEach(actor => actor.set_text_direction(rtl ? Clutter.TextDirection.RTL : Clutter.TextDirection.LTR));
                moneyCard.update({...view, heroText: 'US$ 1.234.567,89'}, {open});
                moneyCard._hero.set_style('font-size: 33px;');
                await wait(200);
                const layout = moneyCard._hero.clutter_text.get_layout();
                const [textWidth] = layout.get_pixel_size();
                check(!layout.is_ellipsized(), `complete large currency in ${theme}`);
                check(textWidth <= moneyCard._hero.width + 1, `wrapped currency fits ${theme}: ${textWidth}/${moneyCard._hero.width}`);
                checkContents(indicator.menu.actor, Main.layoutManager.primaryMonitor);
                moneyCard._toggle.grab_key_focus();
                check(global.stage.get_key_focus() === moneyCard._toggle, 'monetary header retains one keyboard target');
                if (theme === 'glassmorphism') {
                    await wait(250);
                    const path = `${GLib.getenv('ROOT')}/.superpowers/sdd/2026-10-07-open-items/money-${rtl ? 'rtl' : 'ltr'}-large.png`;
                    const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
                    try { await new Shell.Screenshot().screenshot(false, stream); }
                    finally { stream.close(null); }
                }
                global.gaqLayoutResult.cases.push(`${theme}/${rtl ? 'RTL' : 'LTR'}/large-currency`);
            }
            moneyCard.update(view, {open});
            indicator.menu.close(false);
        }
        global.gaqLayoutResult.finished = true;
    })().catch(error => { global.gaqLayoutResult.error = error.message; global.gaqLayoutResult.finished = true; });
    return 'layout probe started';
})()
