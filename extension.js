import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {accountStatus} from './lib/core/accountStatus.js';
import {createProvider, createProviders, isConnected} from './lib/providers/index.js';
import {createConnectorStore} from './lib/services/connectorStore.js';
import {providerIdForConnector} from './lib/core/connectors.js';
import {availableProviders, availableDemoProviders} from './lib/providers/registry.js';
import {AlertService} from './lib/services/alertService.js';
import {AlertStore} from './lib/services/alertStore.js';
import {CacheStore} from './lib/services/cacheStore.js';
import {QuotaController} from './lib/services/controller.js';
import {getDisconnectGate} from './lib/services/disconnectGate.js';
import {PowerWatcher} from './lib/services/power.js';
import {ThemeManager} from './lib/services/themeManager.js';
import GaqIndicator from './lib/ui/indicator.js';
import {AlertNotifier} from './lib/ui/notifier.js';

// Index inside the panel box. The left box starts with the Activities button,
// so the indicator goes right after it.
const BOX_INDEX = {left: 1, center: 0, right: 0};

export default class ElfvisionGnomeExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._disconnectGate = getDisconnectGate();
        this._disconnectFingerprint = '';
        this._disconnectCancel = this._disconnectGate.registerCanceller(() => {
            if (!this._settings || this._settings.get_string('data-source') !== 'live')
                return;
            this._syncGeneration = (this._syncGeneration ?? 0) + 1;
            this._destroyIndicator();
            this._destroyController({flush: false});
            this._settings.set_value('account-status', new GLib.Variant('a{ss}', {}));
        });
        this._disconnectUnsubscribe = this._disconnectGate.subscribe(state => this._onDisconnectState(state));
        // The stylesheet must exist before the first widget is measured.
        this._themes = new ThemeManager({extensionPath: this.path, settings: this._settings});
        try {
            this._themes.enable();
            this._createController();
            this._createIndicator();
        } catch (error) {
            // The shell does not call disable() after a failed enable().
            this.disable();
            throw error;
        }
        const refreshFontMap = () => {
            const revision = this._settings.get_int('font-refresh-request');
            let status = 'failed';
            try { status = this._themes.refreshFonts() ? 'available' : 'missing'; } catch (_error) { /* keep failure status */ }
            this._settings.set_string('font-refresh-status', status);
            this._settings.set_int('font-refresh-ack', revision);
        };
        this._fontRefreshChangedId = this._settings.connect('changed::font-refresh-request', refreshFontMap);
        if (this._settings.get_int('font-refresh-request') !== this._settings.get_int('font-refresh-ack'))
            refreshFontMap();
        // Moving to another panel box needs a new button; a new demo scenario
        // needs new providers. Both rebuild the parts that depend on them.
        this._positionChangedId = this._settings.connect('changed::position', () => {
            this._destroyIndicator();
            try {
                this._createIndicator();
            } catch (error) {
                console.error(`Elfvision: cannot move the indicator: ${error.message}\n${error.stack ?? ''}`);
            }
        });
        const rebuild = () => {
            this._destroyIndicator();
            this._destroyController();
            try {
                this._createController();
                this._createIndicator();
            } catch (error) {
                console.error(`Elfvision: cannot rebuild: ${error.message}\n${error.stack ?? ''}`);
            }
        };
        // A new demo scenario only matters for demo data: real providers must not be restarted.
        this._scenarioChangedId = this._settings.connect('changed::demo-scenario', () => {
            if (this._settings.get_string('data-source') === 'demo')
                rebuild();
        });
        this._sourceChangedId = this._settings.connect('changed::data-source', rebuild);
        // The preferences window runs in another process; it raises this number
        // after it stores or removes a credential.
        this._credentialsChangedId = this._settings.connect('changed::credentials-revision', async () => {
            const touched = this._settings.get_string('credentials-touched');
            // Fence old requests immediately, before keyring lookups can wait. Sync
            // starts newly connected providers; a late sync must not poke a replacement.
            this._controller?.credentialsChanged(touched);
            await this._syncProviders();
        });
        this._untrackedChangedId = this._settings.connect('changed::untracked-providers', () => { if (this._settings.get_string('data-source') === 'demo') rebuild(); else this._syncProviders(); });
        this._connectorChangedIds = ['connectors', 'demo-connectors', 'demo-connected-connectors'].map(key => this._settings.connect(`changed::${key}`, () => {
            if (this._settings.get_string('data-source') === 'demo') rebuild(); else this._syncProviders();
        }));
        // The test button of the preferences window raises this number; it carries nothing else.
        this._testChangedId = this._settings.connect('changed::test-notification', () => this._notifier?.show({kind: 'test'}));
        const gate = this._disconnectGate;
        gate.ready().then(() => {
            if (this._disconnectGate === gate && this._settings)
                this._onDisconnectState(gate.snapshot());
        }).catch(() => {}); // Unknown gate state remains fail-closed.
    }

    disable() {
        const disconnectGate = this._disconnectGate;
        this._disconnectUnsubscribe?.();
        this._disconnectUnsubscribe = null;
        this._disconnectCancel?.();
        this._disconnectCancel = null;
        this._disconnectGate = null;
        this._syncGeneration = (this._syncGeneration ?? 0) + 1;
        if (this._positionChangedId)
            this._settings?.disconnect(this._positionChangedId);
        for (const id of [...(this._connectorChangedIds ?? []), this._scenarioChangedId, this._sourceChangedId, this._credentialsChangedId, this._untrackedChangedId, this._testChangedId, this._fontRefreshChangedId]) {
            if (id)
                this._settings?.disconnect(id);
        }
        this._connectorChangedIds = [];
        this._sourceChangedId = 0;
        this._credentialsChangedId = 0;
        this._untrackedChangedId = 0;
        this._testChangedId = 0;
        this._fontRefreshChangedId = 0;
        this._positionChangedId = 0;
        this._scenarioChangedId = 0;
        this._destroyIndicator();
        // Do not start a new live cache commit while its gate is being closed.
        const settled = this._destroyController({flush: this._settings?.get_string('data-source') === 'demo'});
        // Rotation may already have succeeded remotely: keep its old gate and
        // disconnect canceller until settlement, without retaining it on re-enable.
        disconnectGate?.retire(settled).catch(() => {});
        this._themes?.disable();
        this._themes = null;
        this._settings = null;
    }

    _createController() {
        const source = this._settings.get_string('data-source');
        const store = createConnectorStore(this._settings, {demo: source === 'demo'});
        let connectors;
        try { connectors = store.list(); this._connectorRegistryProblem = false; } catch (_error) { connectors = []; this._connectorRegistryProblem = true; console.warn('Elfvision: connector registry unavailable; open Preferences to recover it'); } finally { store.dispose(); }
        const untracked = this._settings.get_strv('untracked-providers');
        const connected = this._settings.get_strv('demo-connected-connectors');
        const providers = source === 'demo' ? [...connectors.filter(c => connected.includes(c.id) && !untracked.includes(c.id)).map(connector => {
            const template = createProviders({source, scenario: this._settings.get_string('demo-scenario')}).find(p => p.id === connector.providerId);
            return {...template, id: connector.id};
        })] : [];
        // Demo and real data must never share a cache: they use the same ids.
        const cacheDirectory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota', ...(source === 'demo' ? ['demo', this._settings.get_string('demo-scenario')] : [])]);
        const gate = source === 'live' ? this._disconnectGate : null;
        this._controllerEpoch = null;
        this._controller = new QuotaController({providers, cache: new CacheStore(cacheDirectory, {gate}), order: (source === 'demo' ? availableDemoProviders() : availableProviders()).flatMap(meta => connectors.filter(c => c.providerId === meta.id).map(c => c.id))});
        this._controller.registryProblem = this._connectorRegistryProblem;
        if (source === 'demo')
            this._controller.markSynced();
        if (source === 'live') {
            this._unsubscribeStatus = this._controller.subscribe(() => this._publishStatus());
            this._syncProviders();
        }
        this._controller.start().catch(error =>
            console.error(`Elfvision: cannot start: ${error.message}`));
        this._createAlerts(cacheDirectory);
    }

    /** Notifications for quotas that cross their threshold and for accounts that keep failing. */
    _createAlerts(directory) {
        this._notifier = new AlertNotifier({
            extension: this,
            settings: this._settings,
            openPopup: () => this._indicator?.menu.open(),
            openPreferences: providerId => {
                this._settings.set_string('prefs-target', providerId);
                this.openPreferences();
            },
        });
        this._alerts = new AlertService({
            controller: this._controller,
            store: new AlertStore(directory, {gate: this._settings.get_string('data-source') === 'live' ? this._disconnectGate : null}),
            settings: this._settings,
            notify: event => this._notifier.show(event),
        });
        this._alerts.start().catch(error =>
            console.error(`Elfvision: cannot start the alerts: ${error?.message ?? error}`));
        // After the computer wakes up the data looks old and the network is slow to return: keep
        // the connection alert quiet for a while, then ask the providers again.
        this._power = new PowerWatcher({onResume: () => {
            this._alerts?.quietFor();
            this._resumeRefresh = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 4000 + Math.floor(Math.random() * 4000), () => {
                this._resumeRefresh = 0;
                this._controller?.refresh().catch(() => {});
                return GLib.SOURCE_REMOVE;
            });
        }});
        this._power.start();
    }

    _destroyAlerts(options) {
        this._power?.stop();
        this._power = null;
        if (this._resumeRefresh) {
            GLib.source_remove(this._resumeRefresh);
            this._resumeRefresh = 0;
        }
        this._alerts?.stop(options);
        this._alerts = null;
        this._notifier?.destroy();
        this._notifier = null;
    }

    /**
     * Run the providers that are connected and tracked, and only those. A provider that was
     * never connected is neither polled nor shown.
     */
    async _syncProviders() {
        const controller = this._controller;
        if (!controller || this._settings.get_string('data-source') !== 'live')
            return;
        const generation = (this._syncGeneration = (this._syncGeneration ?? 0) + 1);
        try {
            const gate = this._disconnectGate;
            await gate.ready();
            const epoch = gate.snapshot().epoch;
            const untracked = this._settings.get_strv('untracked-providers');
            const store = createConnectorStore(this._settings);
            let entries; try { entries = store.list(); controller.registryProblem = false; } catch (_error) { entries = []; controller.registryProblem = true; } finally { store.dispose(); }
            const candidates = entries.filter(connector => !untracked.includes(connector.id) && !gate.isBlocked(connector.providerId));
            const captured = await Promise.all(candidates.map(connector => gate.capture(connector.providerId)));
            const tickets = new Map(candidates.map((meta, index) => [meta.id, captured[index]]));
            const answers = await Promise.all(candidates.map(connector => isConnected(availableProviders().find(meta => meta.id === connector.providerId), {gate, ticket: tickets.get(connector.id), connectorId: connector.id})));
            const wanted = candidates.filter((_meta, index) => answers[index]).map(meta => meta.id);
            // A newer sync, a rebuild or a disable happened while the keyring was asked.
            if (generation !== this._syncGeneration || controller !== this._controller || this._disconnectGate !== gate
                || gate.snapshot().epoch !== epoch || this._settings?.get_string('data-source') !== 'live')
                return;
            this._controllerEpoch = epoch;
            controller.sync(wanted, id => createProvider(id, {gate, ticket: tickets.get(id), providerId: providerIdForConnector(id)}),
                availableProviders().flatMap(meta => entries.filter(c => c.providerId === meta.id).map(c => c.id)));
            controller.markSynced();
        } catch (error) {
            console.error(`Elfvision: cannot sync the providers: ${error.message}\n${error.stack ?? ''}`);
            // After a failure the list is as known as it will get: do not claim "nothing".
            if (generation === this._syncGeneration && controller === this._controller)
                controller.markSynced();
        }
    }

    /** Tell the preferences window how each real account is doing. */
    async _publishStatus() {
        const controller = this._controller;
        const gate = this._disconnectGate;
        const epoch = this._controllerEpoch;
        if (!this._settings || !controller || !epoch || !gate?.snapshot().ready)
            return;
        const next = {};
        for (const snapshot of this._controller?.snapshots() ?? []) {
            if (!this._disconnectGate.isBlocked(providerIdForConnector(snapshot.id)) && providerIdForConnector(snapshot.id))
                next[snapshot.id] = accountStatus(snapshot);
        }
        try {
            await gate.guardFileWrite({epoch, provider: null}, () => {
                if (controller !== this._controller || gate !== this._disconnectGate || epoch !== this._controllerEpoch || !this._settings)
                    return;
                const current = this._settings.get_value('account-status').deepUnpack();
                const same = Object.keys(next).length === Object.keys(current).length
                    && Object.entries(next).every(([id, status]) => current[id] === status);
                if (!same)
                    this._settings.set_value('account-status', new GLib.Variant('a{ss}', next));
            });
        } catch (_error) { /* A stale/disconnecting publisher must not restore account metadata. */ }
    }

    _destroyController(options) {
        this._destroyAlerts(options);
        this._unsubscribeStatus?.();
        this._unsubscribeStatus = null;
        const settled = this._controller?.stop(options);
        this._controller = null;
        this._controllerEpoch = null;
        return settled;
    }

    _createIndicator() {
        if (!this._controller)
            return;
        const position = this._settings.get_string('position');
        this._indicator = new GaqIndicator(this, this._settings, position, this._controller);
        Main.panel.addToStatusArea(this.uuid, this._indicator, BOX_INDEX[position], position);
    }

    _destroyIndicator() {
        this._indicator?.destroy();
        this._indicator = null;
    }

    _onDisconnectState(state) {
        if (!this._settings || this._settings.get_string('data-source') !== 'live')
            return;
        const fingerprint = JSON.stringify([state.ready, state.epoch, state.blocked, state.blockedProviders]);
        if (fingerprint === this._disconnectFingerprint)
            return;
        this._disconnectFingerprint = fingerprint;
        this._syncGeneration = (this._syncGeneration ?? 0) + 1;
        this._destroyIndicator();
        this._destroyController({flush: false});
        this._createController();
        this._createIndicator();
    }
}
