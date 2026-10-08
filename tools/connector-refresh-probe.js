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
        check(work && GLib.getenv('GSETTINGS_BACKEND') === 'memory'
            && ['CONFIG', 'CACHE', 'STATE', 'DATA', 'RUNTIME'].every(name =>
                GLib.getenv(`XDG_${name}_HOME`) === `${work}/${name.toLowerCase()}`
                || name === 'RUNTIME' && GLib.getenv('XDG_RUNTIME_DIR') === `${work}/runtime`),
        'probe requires the complete private headless harness; live deletion must never touch the desktop');
        const settings = current()._settings;
        check(settings.get_string('data-source') === 'demo', 'probe requires private Demo source');
        const path = current()._extension.path;
        const {createConnectorStore} = await import(`file://${path}/lib/services/connectorStore.js`);
        const {createDemoAccountController} = await import(`file://${path}/lib/prefs/demoAccountController.js`);
        const {deleteDemoConnectors, disconnectAll} = await import(`file://${path}/lib/services/disconnectAll.js`);
        check(current()._connectorEntries().length === 0 && settings.get_strv('demo-connected-connectors').length === 0,
            'fresh demo has no implicit connectors or authentication');
        deleteDemoConnectors(settings);
        await until(() => current()._emptyBox.visible && current()._cards.size === 0);
        check(current()._addAccount.label === 'Add connector', 'truly empty registry offers Add connector');
        const store = createConnectorStore(settings, {demo: true});
        for (const providerId of ['codex', 'example-credits']) {
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
        settings.set_string('data-source', 'live'); await wait(500);
        check(current()._connectorEntries().length === 0 && current()._cards.size === 0,
            'fresh live mode has no implicit connectors or monitored accounts');
        await disconnectAll({settings});
        const liveStore = createConnectorStore(settings);
        const live = liveStore.add('codex', 'Synthetic invalid token');
        await until(() => current()._connectorEntries().some(entry => entry.id === live.id));
        current().menu.open(false);
        // Deliberately invalid encoding is stored only in the throwaway keyring. It
        // exercises actual credential lookup while preventing any provider HTTP call.
        const {storeSecret, OAUTH_TOKENS} = await import(`file://${path}/lib/services/secrets.js`);
        const {announceChange} = await import(`file://${path}/lib/prefs/status.js`);
        await storeSecret(live.id, OAUTH_TOKENS, 'invalid-synthetic-token-encoding', 'Private connector regression',
            {ticket: await current()._extension._disconnectGate.capture('codex')});
        announceChange(settings, live.id);
        await until(() => current()._cards.has(live.id));
        check(!current()._emptyBox.visible && current()._controller.snapshots()[0].state === 'auth_required', 'live stored credential automatically replaces empty popup without outgoing HTTP');
        await disconnectAll({settings}); liveStore.dispose();
        result.cases.push('live-oauth'); result.finished = true;
    } catch (error) { result.error = String(error.message); result.finished = true; }
})(); 'GAQ_CONNECTOR_REFRESH_STARTED'
