(async () => {
    const result = global.gaqNumericText = {finished: false, error: '', destroyed: 0, attributeEvents: []};
    let parent;
    try {
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const {tabularNumbers} = await import(`file://${indicator._extension.path}/lib/ui/numericText.js`);
        const {default: St} = await import('gi://St');
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const effective = label => label.clutter_text.get_layout().get_attributes()?.to_string() ?? '';
        parent = new St.BoxLayout({x: 100, y: 100, width: 200, height: 40});
        Main.uiGroup.add_child(parent);
        const label = tabularNumbers(new St.Label({text: '11'}));
        parent.add_child(label);
        await wait(100);
        check(effective(label).includes('tnum=1'), 'First mapping retains effective Pango numeric features');
        const observe = () => result.attributeEvents.push(effective(label));
        label.clutter_text.connectObject('notify::attributes', observe, label);
        for (const color of ['#abcdef', '#abcdef', '#123456', '#123456']) {
            label.set_style(`font-size: 25px; color: ${color};`);
            label.get_theme_node();
            observe();
            await wait(30);
        }
        check(result.attributeEvents.length > 0 && result.attributeEvents.every(attrs => attrs.includes('tnum=1')),
            'Every native style/attribute event preserves effective numeric features');
        result.attributes = effective(label);
        check(result.attributes.split('font-features').length === 2 && result.attributes.includes('foreground'),
            'Effective layout combines style foreground with one numeric feature');
        for (const text of ['99', '<b>123 & 456</b>', 'Créditos １２３', '', '1.234,56']) {
            label.text = text;
            check(label.text === text && label.get_text() === text && label.clutter_text.get_text() === text,
                'Text updates preserve literal plain text without interpreting markup');
            check(effective(label).includes('tnum=1'), 'Text updates synchronously preserve numeric features');
        }
        for (let i = 0; i < 100; i++) {
            const disposable = tabularNumbers(new St.Label({text: `${i}`}));
            disposable.text = `${i + 1}`;
            disposable.destroy();
            result.destroyed++;
        }
    } catch (error) { result.error = error.message; }
    finally { parent?.destroy(); result.finished = true; }
})();
'GAQ_NUMERIC_TEXT_STARTED'
