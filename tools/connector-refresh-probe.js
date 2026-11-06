// Exercise registry/authentication transitions only in the isolated synthetic Shell.
(async () => {
    const result = global.gaqConnectorRefresh = {finished: false, cases: [], error: ''};
    const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
    const check = (value, message) => { if (!value) throw new Error(message); };
    const current = () => Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io'];
    const until = async predicate => {
        for (let i = 0; i < 120; i++) { if (predicate()) return; await wait(100); }
        throw new Error('connector transition did not settle');
    };
    try {
        const work = GLib.getenv('WORK');
        check(work && GLib.getenv('GSETTINGS_BACKEND') === 'keyfile'
            && ['CONFIG', 'CACHE', 'STATE', 'DATA', 'RUNTIME'].every(name =>
                GLib.getenv(`XDG_${name}_HOME`) === `${work}/${name.toLowerCase()}`
                || name === 'RUNTIME' && GLib.getenv('XDG_RUNTIME_DIR') === `${work}/runtime`),
        'probe requires the complete private headless harness; live deletion must never touch the desktop');
        const settings = current()._settings;
        check(settings.get_string('data-source') === 'demo', 'probe requires private Demo source');
        const path = current()._extension.path;
        const {createConnectorStore} = await import(`file://${path}/lib/services/connectorStore.js`);
        const {createDemoAccountController} = await import(`file://${path}/lib/prefs/demoAccountController.js`);
        const {deleteDemoConnectors} = await import(`file://${path}/lib/services/disconnectAll.js`);
        check(current()._connectorEntries().length === 0 && settings.get_strv('demo-connected-connectors').length === 0,
            'fresh demo has no implicit connectors or authentication');
        deleteDemoConnectors(settings);
        await until(() => current()._emptyBox.visible && current()._cards.size === 0 && current()._addAccount.label === 'Add connector');
        check(current()._addAccount.label === 'Add connector', 'truly empty registry offers Add connector');
        const store = createConnectorStore(settings, {demo: true});
        for (const providerId of ['codex', 'openrouter']) {
            const entry = store.add(providerId, 'Renamed connector');
            await wait(300);
            check(current()._connectorEntries().some(c => c.id === entry.id), `${providerId}: saved registry recognized immediately`);
            check(current()._emptyBox.visible && current()._addAccount.label === 'Add connector', `${providerId}: disconnected account keeps explicit Accounts action`);
            check(!current()._emptyHint.text.includes('Add an account'), `${providerId}: saved account has no contradictory add-account hint`);
            const extension = current()._extension;
            const openPreferences = extension.openPreferences;
            let opened = 0;
            try {
                extension.openPreferences = () => opened++;
                current()._addAccount.emit('clicked', 1);
                check(opened === 1 && settings.get_string('prefs-target') === 'accounts', `${providerId}: action opens Accounts without selecting a provider`);
            } finally { extension.openPreferences = openPreferences; settings.set_string('prefs-target', ''); }
            const account = createDemoAccountController({connectorId: entry.id, settings});
            await account.connect();
            await until(() => current()._cards.has(entry.id));
            check(!current()._emptyBox.visible && current()._snapshots[0].connectorLabel === 'Renamed connector', `${providerId}: connected card replaces empty view and retains label`);
            check(Gio.File.new_for_path(current()._iconPath(entry.id)).query_exists(null), `${providerId}: recreated connector uses its packaged provider icon`);
            if (providerId === 'codex') {
                // In-memory store and demo provider only: exercise save -> IPC -> scheduler -> actual card.
                const {createApiKeyController} = await import(`file://${path}/lib/prefs/apiKeyController.js`);
                const card = current()._cards.get(entry.id);
                await until(() => card._hero.text !== '');
                const before = card._hero.text;
                const provider = current()._controller._providers.get(entry.id);
                const scheduler = current()._controller._scheduler;
                scheduler.stop();
                await until(() => !scheduler._entries.get(entry.id)?.inFlight);
                const fetch = provider.fetch;
                const credentialsChanged = scheduler.credentialsChanged;
                let stored = null, writes = 0, fetches = 0, events = 0;
                const revision = settings.get_int('credentials-revision');
                const signal = settings.connect('changed::credentials-revision', () => { events++; });
                scheduler.credentialsChanged = function (id) {
                    if (id === entry.id) events += 100;
                    return credentialsChanged.call(this, id);
                };
                provider.fetch = async (...args) => {
                    fetches++;
                    const snapshot = await fetch(...args);
                    return {...snapshot, metrics: snapshot.metrics.map(metric =>
                        metric.kind === 'quota' || 'percentUsed' in metric ? {...metric, percentUsed: 99} : metric)};
                };
                const key = createApiKeyController({meta: {id: entry.id, name: 'Synthetic'}, settings,
                    gettext: text => text, deps: {gate: null,
                        lookupSecret: async () => stored,
                        storeSecret: async (id, kind, value) => {
                            check(id === entry.id && kind === 'api-key' && value === 'synthetic-test-key', 'synthetic store arguments');
                            writes++; stored = value;
                        }}});
                try {
                    check(await key.save('synthetic-test-key') === 'saved' && writes === 1, 'synthetic credential saved');
                    await until(() => fetches > 0 && card._hero.text !== before && events >= 101);
                    check(settings.get_int('credentials-revision') === (revision + 1) % 2147483647
                        && settings.get_string('credentials-touched') === entry.id && events === 101,
                    'save emits one credential notification consumed by the scheduler');
                    check(current()._cards.get(entry.id) === card, 'credential refresh updates the existing card');
                    result.cases.push('synthetic-save-card-refresh');
                } finally {
                    settings.disconnect(signal); scheduler.credentialsChanged = credentialsChanged;
                    provider.fetch = fetch; key.dispose(); scheduler.start();
                }
            }
            settings.set_strv('untracked-providers', [entry.id]);
            await until(() => current()._emptyBox.visible);
            check(current()._emptyTitle.text === 'Nothing is being tracked.', `${providerId}: paused state recognized`);
            settings.set_strv('untracked-providers', []);
            await until(() => current()._cards.has(entry.id) && !current()._emptyBox.visible);
            deleteDemoConnectors(settings);
            await until(() => current()._emptyBox.visible && current()._cards.size === 0);
            account.dispose(); result.cases.push(`demo-${providerId}`);
        }
        store.dispose();
        result.finished = true;
    } catch (error) { result.error = String(error.message); result.finished = true; }
})(); 'GAQ_CONNECTOR_REFRESH_STARTED'
