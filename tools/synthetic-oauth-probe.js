// Live OAuth regression runs only in the isolated synthetic keyring session.
(async () => {
    const result = global.gaqSyntheticOAuth = {finished: false, cases: [], error: ''};
    const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
    const check = (value, message) => { if (!value) throw new Error(message); };
    const current = () => Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io'];
    const until = async predicate => {
        for (let i = 0; i < 120; i++) { if (predicate()) return; await wait(100); }
        throw new Error('OAuth transition did not settle');
    };
    try {
        const work = GLib.getenv('WORK');
        check(work && GLib.getenv('GSETTINGS_BACKEND') === 'keyfile'
            && ['CONFIG', 'CACHE', 'STATE', 'DATA'].every(name => GLib.getenv(`XDG_${name}_HOME`) === `${work}/${name.toLowerCase()}`)
            && GLib.getenv('XDG_RUNTIME_DIR') === `${work}/runtime`, 'probe requires the complete private headless harness');
        check(GLib.getenv('GAQ_TEST_OO7') === '1', 'live OAuth requires the isolated oo7 harness');
        const settings = current()._settings;
        const path = current()._extension.path;
        const {createConnectorStore} = await import(`file://${path}/lib/services/connectorStore.js`);
        const {disconnectAll} = await import(`file://${path}/lib/services/disconnectAll.js`);
        settings.set_string('data-source', 'live');
        await until(() => current()._connectorEntries().length === 0 && current()._cards.size === 0);
        await disconnectAll({settings});
        const liveStore = createConnectorStore(settings);
        const live = liveStore.add('codex', 'Synthetic invalid token');
        await until(() => current()._connectorEntries().some(entry => entry.id === live.id));
        const {storeSecret, OAUTH_TOKENS} = await import(`file://${path}/lib/services/secrets.js`);
        const {announceChange} = await import(`file://${path}/lib/prefs/status.js`);
        await storeSecret(live.id, OAUTH_TOKENS, 'invalid-synthetic-token-encoding', 'Private connector regression',
            {ticket: await current()._extension._disconnectGate.capture('codex')});
        announceChange(settings, live.id);
        await until(() => current()._cards.has(live.id) && current()._controller.snapshots().some(snapshot => snapshot.state === 'auth_required'));
        check(!current()._emptyBox.visible, 'live stored invalid OAuth credential replaces empty popup without provider HTTP');
        await disconnectAll({settings}); liveStore.dispose();
        result.cases.push('live-oauth'); result.finished = true;
    } catch (error) { result.error = String(error.message); result.finished = true; }
})(); 'GAQ_SYNTHETIC_OAUTH_STARTED'
