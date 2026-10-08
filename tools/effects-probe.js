// Run by tools/headless-shell.sh in its private demo Shell; no account or credential data.
(async () => {
    const result = global.gaqEffectsResult = {finished: false, cases: [], error: ''};
    try {
        Main.welcomeDialog?.close();
        Main.overview.hide();
        const root = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes)._extension.path;
        const {ThemeEffects} = await import(`file://${root}/lib/ui/themeEffects.js`);
        const {default: St} = await import('gi://St');
        const {default: Clutter} = await import('gi://Clutter');
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        const check = (value, text) => { if (!value) throw new Error(text); };
        const parent = new St.Widget({layout_manager: new Clutter.BinLayout(), clip_to_allocation: true});
        parent.set_position(100, 100);
        parent.set_size(400, 500);
        const background = new St.Widget({x_expand: true, y_expand: true, reactive: false});
        const decoration = new Clutter.Actor({x_expand: true, y_expand: true, reactive: false, clip_to_allocation: true});
        parent.add_child(background);
        parent.add_child(decoration);
        Main.uiGroup.add_child(parent);
        const engine = new ThemeEffects({backgroundActor: background, decorationActor: decoration, extensionPath: root});
        const theme = {origin: 'builtin', profile: {material: 'translucent', motion: 'leaves', texture: 'botanical', particleCount: 8,
            opacity: {light: 0.8, dark: 0.8}}, colors: {bg: '#242c24', surface: '#303b30', accent: '#86a874', border: '#739568'}, radius: {card: 14}};
        engine.apply({policy: {motion: 'ambient', material: 'translucent', particleCount: 8}, theme, scheme: 'dark'});
        engine.setOpen(true);
        await wait(150);
        check(engine.inspect().sources === 1 && engine.inspect().particles === 8, 'eight leaves use one bounded source');
        check(background.opacity === 255 && decoration.opacity === 255, 'only background tint supplies alpha');
        check(decoration.get_children().every(actor => !actor.reactive), 'decoration never captures input');
        engine.setOpen(false);
        check(engine.inspect().sources === 0 && engine.inspect().particles === 0 && engine.inspect().blurEffects === 0, 'closed popup frees ambient and material resources');
        for (let i = 0; i < 100; i++) { engine.setOpen(true); engine.setOpen(false); }
        check(engine.inspect().sources === 0 && decoration.get_n_children() === 0, '100 cycles retain no sources or actors');
        engine.destroy();
        check(engine.inspect().destroyed && engine.inspect().sources === 0, 'destroy leaves no resource');
        parent.destroy();
        result.cases.push('leaves lifecycle');
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        check(indicator._effects !== undefined, 'actual popup owns independent effects');
        result.cases.push('popup integration');
        for (const material of ['translucent', 'decorative-glass', 'frosted-glass']) {
            const box = new St.Widget({layout_manager: new Clutter.BinLayout()});
            box.set_size(300, 200);
            const bg = new St.Widget({x_expand: true, y_expand: true});
            const deco = new Clutter.Actor({x_expand: true, y_expand: true});
            box.add_child(bg); box.add_child(deco); Main.uiGroup.add_child(box);
            const effects = new ThemeEffects({backgroundActor: bg, decorationActor: deco, extensionPath: root});
            effects.apply({policy: {motion: 'none', material, particleCount: 0},
                theme: {...theme, profile: {...theme.profile, motion: 'none', material}}, scheme: 'dark'});
            effects.setOpen(true);
            await wait(100);
            check(box.opacity === 255 && bg.opacity === 255 && bg.style.includes('0.8)'), 'background-only bounded alpha');
            check(effects.inspect().material === material, `material ${material} is actually applied`);
            check(effects.inspect().blurEffects === (material === 'frosted-glass' ? 1 : 0), 'one native backdrop only for frost');
            check(bg.clip_to_allocation && deco.clip_to_allocation, 'materials and decorations clip locally');
            if (material === 'frosted-glass') {
                const attach = bg.add_effect_with_name;
                bg.add_effect_with_name = () => { throw new Error('Synthetic native capability failure'); };
                effects.apply({policy: {motion: 'none', material, particleCount: 0}, theme, scheme: 'dark'});
                check(effects.inspect().material === 'decorative-glass' && effects.inspect().blurEffects === 0, 'native failure falls back to decorative glass');
                bg.add_effect_with_name = attach;
            }
            effects.apply({policy: {motion: 'ambient', material, particleCount: 8}, theme: {...theme, origin: 'user'}, scheme: 'dark'});
            check(!effects.inspect().active && effects.inspect().sources === 0 && effects.inspect().blurEffects === 0, 'user-origin overrides cannot execute native effects');
            effects.destroy(); box.destroy();
        }
        result.cases.push('material and trust');
        Main.overview.hide(); Main.welcomeDialog?.close();
        indicator._settings.set_string('theme', 'solarpunk');
        indicator._settings.set_string('effects-mode', 'full');
        indicator.menu.open(false);
        await wait(250);
        check(indicator._effects.inspect().particles === 8, 'actual popup leaf profile');
        const card = [...indicator._cards.values()][0];
        const reference = card._hero;
        card._toggle.grab_key_focus();
        indicator._extension._themes._interface.set_boolean('enable-animations', false);
        check(indicator._effects.inspect().sources === 0, 'live reduced motion stops ambient immediately');
        check(global.stage.get_key_focus() === card._toggle && card._hero === reference, 'effect changes preserve controls and focus');
        indicator._extension._themes._interface.set_boolean('enable-animations', true);
        indicator._settings.set_string('theme', 'glassmorphism');
        indicator._settings.set_string('effect-material', 'frosted-glass');
        await wait(150);
        check(indicator._effects.inspect().blurEffects === 1, 'actual popup uses one native frost surface');
        result.allocation = {background: [indicator._effectBackground.width, indicator._effectBackground.height], decoration: [indicator._effectDecoration.width, indicator._effectDecoration.height]};
        check(indicator._effectBackground.width > 200 && indicator._effectBackground.height > 200, 'actual material surface covers the popup');
        const bgBox = indicator._effectBackground.get_allocation_box();
        const decoBox = indicator._effectDecoration.get_allocation_box();
        check(decoBox.x2 - decoBox.x1 === bgBox.x2 - bgBox.x1 && decoBox.y2 - decoBox.y1 === bgBox.y2 - bgBox.y1
            && decoBox.x2 - decoBox.x1 > 200 && decoBox.y2 - decoBox.y1 > 200, 'both allocated siblings cover the same popup viewport');
        const stack = indicator._effectDecoration.get_parent();
        const foreground = stack.get_last_child();
        const frontBox = foreground.get_allocation_box();
        check(frontBox.x2 - frontBox.x1 === bgBox.x2 - bgBox.x1 && frontBox.y2 - frontBox.y1 === bgBox.y2 - bgBox.y1,
            'foreground and decorative siblings share the same viewport');
        check(indicator._effectDecoration.get_preferred_width(-1).every(value => value === 0)
            && indicator._effectDecoration.get_preferred_height(-1).every(value => value === 0), 'decoration contributes zero preferred size');
        check(JSON.stringify(stack.get_preferred_width(-1)) === JSON.stringify(foreground.get_preferred_width(-1)),
            'stack width is measured from foreground controls alone');
        for (const heading of [indicator._summary, indicator._onBarTitle]) {
            check(heading.get_theme_node().get_background_color().alpha === 0,
                'summary and section headings expose the material without opaque strips');
            check(heading.opacity === 255 && heading.get_theme_node().get_foreground_color().alpha === 255,
                'transparent headings retain opaque text');
        }
        check(card.get_theme_node().get_background_color().alpha === 255 && card._hero.opacity === 255, 'card and text opaque');
        indicator._settings.set_boolean('transparency-enabled', false);
        check(indicator._effects.inspect().material === 'opaque' && indicator._effects.inspect().blurEffects === 0, 'live transparency-off removes native blur');
        for (const id of ['holographic-foil-iridescent', 'aurora-mesh-gradient']) {
            indicator._settings.set_boolean('transparency-enabled', true);
            indicator._settings.set_string('theme', id);
            await wait(150);
            const optical = indicator._effects._ambient;
            const opticalBox = optical?.get_allocation_box();
            result.optical = {id, width: optical?.width, height: optical?.height, paints: optical?._effectPaints,
                box: opticalBox && [opticalBox.x1, opticalBox.y1, opticalBox.x2, opticalBox.y2], surface: optical?._effectPaintSize};
            check(opticalBox?.x2 - opticalBox?.x1 > 200 && opticalBox?.y2 - opticalBox?.y1 > 200 && optical?._effectPaints > 0,
                `${id} paints a full-size optical layer`);
            const paints = optical._effectPaints;
            await wait(150);
            check(optical._effectPaints === paints, `${id} caches the optical surface across motion updates`);
        }
        result.cases.push('cached optical primitives');
        indicator._settings.set_string('theme', 'glassmorphism');
        indicator._settings.set_string('effects-mode', 'off');
        check(indicator._effects.inspect().sources === 0 && !indicator._effects.inspect().active, 'effects-off removes decorations');
        indicator.menu.close(false);
        for (let i = 0; i < 100; i++) { indicator.menu.open(false); indicator.menu.close(false); }
        check(indicator._effects.inspect().sources === 0 && indicator._effects.inspect().actors === 0, 'actual popup100cycles leave zero resources');
        const closedUpdates = indicator._effects.inspect().updates;
        await wait(120);
        check(indicator._effects.inspect().updates === closedUpdates, 'closed popup stops update counters');
        result.cases.push('live popup lifecycle');
        indicator.menu.open(false);
        await wait(100);
        const attributes = [...indicator._cards.values()][0]._hero.clutter_text.get_attributes();
        check(attributes?.to_string().includes('tnum'), 'native numeric text uses tabular font features');
        const {default: Pango} = await import('gi://Pango');
        const numeric = [...indicator._cards.values()][0]._hero;
        const layout = numeric.clutter_text.get_layout().copy();
        layout.set_width(-1);
        layout.set_ellipsize(Pango.EllipsizeMode.NONE);
        const widths = ['111111', '222222', '555555', '888888', '999999'].map(text => {
            layout.set_text(text, -1);
            return layout.get_pixel_size()[0];
        });
        check(new Set(widths).size === 1, 'native glyph widths confirm tabular figures');
        result.numeric = {font: numeric.get_theme_node().get_font().to_string(), samples: ['111111','222222','555555','888888','999999'], widths};
        for (let i = 0; i < 100; i++) numeric.text = `${i}`;
        numeric.set_style('font-size: 25px; color: #abcdef;');
        indicator.menu.close(false); indicator.menu.open(false);
        await wait(100);
        const finalAttributes = numeric.clutter_text.get_attributes().to_string();
        check(finalAttributes.split('font-features').length === 2 && finalAttributes.includes('foreground'), 'repeat updates/remapping preserve one feature plus themed foreground');
        result.numeric.finalAttributes = finalAttributes;
        result.numeric.fontComparisons = [];
        for (const family of ['Sans', 'Monospace']) {
            const sample = layout.copy();
            sample.set_font_description(Pango.FontDescription.from_string(`${family} 24`));
            const texts = ['1111', '8888', '09:59', '10:00'];
            const values = texts.map(text => { sample.set_text(text, -1); return sample.get_pixel_size()[0]; });
            check(values[0] === values[1] && values[2] === values[3], `${family} number/time tabular widths`);
            result.numeric.fontComparisons.push({family, texts, widths: values});
        }
        result.cases.push('numeric text');
        const {hexToRgb} = await import(`file://${root}/lib/core/theme.js`);
        const luminance = rgb => rgb.map(value => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
        const contrast = (first, second) => {
            const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
            return (values[0] + 0.05) / (values[1] + 0.05);
        };
        result.focus = [];
        // Opaque mode gives every theme the same deterministic native backgrounds.
        indicator._settings.set_string('effects-mode', 'off');
        indicator._untracked.update([{id: 'codex', name: 'Codex'}]);
        const controls = [['Not tracked', indicator._untracked._toggle], ['footer', indicator._legendButton]];
        const sides = [St.Side.TOP, St.Side.RIGHT, St.Side.BOTTOM, St.Side.LEFT];
        const directory = Gio.File.new_for_path(`${root}/themes/builtin`).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        const themeIds = [];
        for (let file = directory.next_file(null); file; file = directory.next_file(null))
            themeIds.push(file.get_name());
        directory.close(null);
        check(themeIds.length === 22, 'focus inventory covers all 22 shipped themes');
        const composite = (color, behind) => [color.red, color.green, color.blue].map((channel, index) =>
            channel * color.alpha / 255 + behind[index] * (1 - color.alpha / 255));
        for (const id of themeIds.sort()) {
            indicator._settings.set_string('theme', id);
            for (const scheme of ['light', 'dark']) {
                indicator._settings.set_string('color-scheme', scheme);
                global.stage.set_key_focus(null);
                for (const [, control] of controls) {
                    control.checked = false;
                    control.remove_style_pseudo_class('hover');
                }
                await wait(80);
                const palette = indicator._extension._themes.getEffectState().colors;
                const expected = hexToRgb(palette.focus ?? palette.accent);
                for (const [name, control] of controls) {
                    global.stage.set_key_focus(null);
                    const resting = control.get_theme_node();
                    const restingWidths = sides.map(side => resting.get_border_width(side));
                    const restingAlphas = sides.map(side => resting.get_border_color(side).alpha);
                    const size = [...control.get_preferred_width(-1), ...control.get_preferred_height(-1)];
                    control.grab_key_focus();
                    await wait(80);
                    check(global.stage.get_key_focus() === control && control.has_style_pseudo_class('focus'),
                        `${id}/${scheme} ${name} receives native keyboard focus`);
                    const focused = control.get_theme_node();
                    const widths = sides.map(side => focused.get_border_width(side));
                    const colors = sides.map(side => focused.get_border_color(side));
                    const ancestors = [];
                    for (let parent = control.get_parent(); parent; parent = parent.get_parent()) {
                        if (parent.get_theme_node)
                            ancestors.unshift(parent.get_theme_node().get_background_color());
                    }
                    check(ancestors.some(color => color.alpha === 255), `${id}/${scheme} ${name} has a native opaque backing`);
                    const background = ancestors.reduce((behind, color) => composite(color, behind), hexToRgb(palette.bg));
                    const fill = focused.get_background_color();
                    const fillRgb = composite(fill, background);
                    const ratios = colors.map(color => Math.min(
                        contrast([color.red, color.green, color.blue], background),
                        contrast([color.red, color.green, color.blue], fillRgb)));
                    result.focus.push({id, scheme, control: name, restingWidths, restingAlphas, widths, background, fillRgb,
                        colors: colors.map(color => [color.red, color.green, color.blue, color.alpha]), ratios});
                    check(widths.every(width => width >= 2) && colors.every(color => color.alpha === 255),
                        `${id}/${scheme} ${name} keyboard focus has an opaque two-pixel ring`);
                    check(ratios.every(ratio => ratio >= 3),
                        `${id}/${scheme} ${name} focus ring contrasts with both native adjacent backgrounds: ${Math.min(...ratios)}`);
                    check(colors.every(color => [color.red, color.green, color.blue].every((channel, index) => channel === expected[index])),
                        `${id}/${scheme} ${name} focus ring follows the resolved focus color`);
                    check(restingWidths.every((width, index) => width === widths[index])
                        && JSON.stringify(size) === JSON.stringify([...control.get_preferred_width(-1), ...control.get_preferred_height(-1)]),
                        `${id}/${scheme} ${name} reserves its border without a focus layout jump`);
                    if (name === 'Not tracked')
                        check(restingAlphas.every(alpha => alpha === 0), `${id}/${scheme} Not tracked resting border stays transparent`);
                }
            }
        }
        check(result.focus.length === 88, '44 theme/scheme cases cover both Not tracked and footer controls');
        result.cases.push('all-theme Not tracked and footer keyboard focus');
    } catch (error) {
        result.error = `${error.message}`;
    } finally {
        result.finished = true;
    }
})()
