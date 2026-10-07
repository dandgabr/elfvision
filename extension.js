import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {accountStatus} from './lib/core/accountStatus.js';
import {createProvider, createProviders, isConnected} from './lib/providers/index.js';
import {availableProviders} from './lib/providers/registry.js';
import {AlertService} from './lib/services/alertService.js';
import {AlertStore} from './lib/services/alertStore.js';
import {CacheStore} from './lib/services/cacheStore.js';
import {QuotaController} from './lib/services/controller.js';
import {PowerWatcher} from './lib/services/power.js';
import {ThemeManager} from './lib/services/themeManager.js';
import GaqIndicator from './lib/ui/indicator.js';
import {AlertNotifier} from './lib/ui/notifier.js';

// Index inside the panel box. The left box starts with the Activities button,
// so the indicator goes right after it.
const BOX_INDEX = {left: 1, center: 0, right: 0};

export default class GnomeAiQuotaExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
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
        // Moving to another panel box needs a new button; a new demo scenario
        // needs new providers. Both rebuild the parts that depend on them.
        this._positionChangedId = this._settings.connect('changed::position', () => {
            this._destroyIndicator();
            try {
                this._createIndicator();
            } catch (error) {
                console.error(`gnome-ai-quota: cannot move the indicator: ${error.message}\n${error.stack ?? ''}`);
            }
        });
        const rebuild = () => {
            this._destroyIndicator();
            this._destroyController();
            try {
                this._createController();
                this._createIndicator();
            } catch (error) {
                console.error(`gnome-ai-quota: cannot rebuild: ${error.message}\n${error.stack ?? ''}`);
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
            await this._syncProviders();
            // Only the provider that changed is asked again; unknown ids ask nobody.
            this._controller?.credentialsChanged(touched);
        });
        this._untrackedChangedId = this._settings.connect('changed::untracked-providers', () => this._syncProviders());
    }

    disable() {
        if (this._positionChangedId)
            this._settings?.disconnect(this._positionChangedId);
        for (const id of [this._scenarioChangedId, this._sourceChangedId, this._credentialsChangedId, this._untrackedChangedId]) {
            if (id)
                this._settings?.disconnect(id);
        }
        this._sourceChangedId = 0;
        this._credentialsChangedId = 0;
        this._untrackedChangedId = 0;
        this._positionChangedId = 0;
        this._scenarioChangedId = 0;
        this._destroyIndicator();
        this._destroyController();
        this._themes?.disable();
        this._themes = null;
        this._settings = null;
    }

    _createController() {
        const source = this._settings.get_string('data-source');
        const providers = createProviders({source, scenario: this._settings.get_string('demo-scenario')});
        // Demo and real data must never share a cache: they use the same ids.
        const cacheDirectory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-ai-quota', ...(source === 'demo' ? ['demo', this._settings.get_string('demo-scenario')] : [])]);
        this._controller = new QuotaController({providers, cache: new CacheStore(cacheDirectory), order: availableProviders().map(meta => meta.id)});
        if (source === 'demo')
            this._controller.markSynced();
        if (source === 'live') {
            this._unsubscribeStatus = this._controller.subscribe(() => this._publishStatus());
            this._syncProviders();
        }
        this._controller.start().catch(error =>
            console.error(`gnome-ai-quota: cannot start: ${error.message}`));
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
            store: new AlertStore(directory),
            settings: this._settings,
            notify: event => this._notifier.show(event),
        });
        this._alerts.start().catch(error =>
            console.error(`gnome-ai-quota: cannot start the alerts: ${error?.message ?? error}`));
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

    _destroyAlerts() {
        this._power?.stop();
        this._power = null;
        if (this._resumeRefresh) {
            GLib.source_remove(this._resumeRefresh);
            this._resumeRefresh = 0;
        }
        this._alerts?.stop();
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
            const untracked = this._settings.get_strv('untracked-providers');
            const candidates = availableProviders().filter(meta => !untracked.includes(meta.id));
            const answers = await Promise.all(candidates.map(meta => isConnected(meta)));
            const wanted = candidates.filter((_meta, index) => answers[index]).map(meta => meta.id);
            // A newer sync, a rebuild or a disable happened while the keyring was asked.
            if (generation !== this._syncGeneration || controller !== this._controller)
                return;
            controller.sync(wanted, createProvider);
            controller.markSynced();
        } catch (error) {
            console.error(`gnome-ai-quota: cannot sync the providers: ${error.message}\n${error.stack ?? ''}`);
            // After a failure the list is as known as it will get: do not claim "nothing".
            if (generation === this._syncGeneration && controller === this._controller)
                controller.markSynced();
        }
    }

    /** Tell the preferences window how each real account is doing. */
    _publishStatus() {
        const next = {};
        for (const snapshot of this._controller?.snapshots() ?? []) {
            if (availableProviders().some(meta => meta.id === snapshot.id))
                next[snapshot.id] = accountStatus(snapshot);
        }
        const current = this._settings?.get_value('account-status').deepUnpack() ?? {};
        const same = Object.keys(next).length === Object.keys(current).length
            && Object.entries(next).every(([id, status]) => current[id] === status);
        if (!same)
            this._settings.set_value('account-status', new GLib.Variant('a{ss}', next));
    }

    _destroyController() {
        this._destroyAlerts();
        this._unsubscribeStatus?.();
        this._unsubscribeStatus = null;
        this._controller?.stop();
        this._controller = null;
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
}
