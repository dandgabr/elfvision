(async () => {
    const result = global.gaqNumericText = {finished: false, error: '', destroyed: 0};
    let parent;
    try {
        const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
        const {tabularNumbers} = await import(`file://${indicator._extension.path}/lib/ui/numericText.js`);
        const {default: St} = await import('gi://St');
        const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        parent = new St.BoxLayout({x: 100, y: 100, width: 200, height: 40});
        Main.uiGroup.add_child(parent);
        const label = tabularNumbers(new St.Label({text: '11'}));
        parent.add_child(label);
        const firstSource = label._tabularNumbersSource;
        for (let i = 0; i < 100; i++) label.text = `${i}`;
        check(firstSource > 0 && label._tabularNumbersSource === firstSource, 'Initial/text edits coalesce into one owned source');
        await wait(100);
        check(label._tabularNumbersSource === 0, 'Mapping drains the owned source');
        check(label.clutter_text.get_attributes().to_string().includes('tnum=1'), 'First mapping retains actual Pango numeric features');
        label.set_style('font-size: 25px; color: #abcdef;');
        label.get_theme_node();
        await wait(100);
        result.attributes = label.clutter_text.get_attributes().to_string();
        check(result.attributes.split('font-features').length === 2 && result.attributes.includes('foreground'), 'Style updates preserve foreground and one numeric feature');
        for (let i = 0; i < 100; i++) {
            const disposable = tabularNumbers(new St.Label({text: `${i}`}));
            const source = disposable._tabularNumbersSource;
            check(source > 0, 'Disposable owns its pending application');
            disposable.destroy();
            check(disposable._tabularNumbersSource === 0 && !GLib.MainContext.default().find_source_by_id(source), 'Destroy cancels pending application');
            result.destroyed++;
        }
    } catch (error) { result.error = error.message; }
    finally { parent?.destroy(); result.finished = true; }
})();
'GAQ_NUMERIC_TEXT_STARTED'
