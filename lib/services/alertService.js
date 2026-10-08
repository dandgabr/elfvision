// Runs the alert rules (lib/core/alerts.js) against the live snapshots and hands the events to a
// notifier. It owns the stored state and the clock-driven re-evaluation: a rejected sign-in
// produces one snapshot and is never polled again, so "ten minutes later" needs a timer.

import {
    QUOTA_TYPES, RESUME_GRACE_MS, emptyAlertState, evaluate, forgetProvider, normalizeAlertSettings, parseAlertRuleBackup, serializeAlertRuleBackup,
} from '../core/alerts.js';
import {glibTimers} from './timers.js';

const TICK_MS = 60 * 1000;
const SAVE_DELAY_MS = 2000;

/** The alert settings as stored in GSettings (they can be edited by hand, so they are re-checked). */
export function readAlertSettings(settings, previous) {
    const thresholds = {};
    for (const type of QUOTA_TYPES) {
        thresholds[type] = {
            enabled: settings.get_boolean(`alert-${type}-enabled`),
            percent: settings.get_int(`alert-${type}-percent`),
            warningEnabled: settings.get_boolean(`alert-${type}-warning-enabled`),
            warningPercent: settings.get_int(`alert-${type}-warning-percent`),
        };
    }
    return normalizeAlertSettings({thresholds, connection: settings.get_boolean('alert-connection')}, previous);
}

export class AlertService {
    /**
     * @param {object} options
     * @param {object} options.controller - a QuotaController
     * @param {object} options.store - an AlertStore
     * @param {object} options.settings - the extension's Gio.Settings
     * @param {(event: object) => void} options.notify - shows an event to the user
     * @param {object} [options.timers] - setTimeout and clearTimeout
     */
    constructor({controller, store, settings, notify, timers = glibTimers}) {
        this._controller = controller;
        this._store = store;
        this._settings = settings;
        this._notify = notify;
        this._timers = timers;
        this._state = emptyAlertState();
        this._quietUntil = 0;
        this._tick = 0;
        this._saveTimer = 0;
        this._dirty = false;
        this._generation = 0;
        this._running = false;
        this._rules = null;
        this._quotaRules = null;
        this._settingsChangedId = 0;
    }

    async start() {
        if (this._running)
            return;
        this._running = true;
        const generation = ++this._generation;
        const {state, problems} = await this._store.load();
        problems.forEach(problem => console.warn(`Elfvision: ${problem}`));
        if (generation !== this._generation)
            return;   // stopped while the file was being read
        this._state = state;
        this._quotaRules = parseAlertRuleBackup(this._settings.get_string('alert-valid-rules'));
        this._updateRules();
        this._unsubscribe = this._controller.subscribeChanges(change => this._onChange(change));
        // The settings are read once and again only after one of them changes.
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'alert-valid-rules') return;
            this._rules = null;
            this._updateRules();
        });
        this._schedule();
    }

    stop({flush = true} = {}) {
        this._running = false;
        this._generation++;
        this._unsubscribe?.();
        this._unsubscribe = null;
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._tick) {
            this._timers.clearTimeout(this._tick);
            this._tick = 0;
        }
        if (this._saveTimer) {
            this._timers.clearTimeout(this._saveTimer);
            this._saveTimer = 0;
        }
        if (flush && this._dirty)
            this._store.save(this._state);
        this._dirty = false;
    }

    /** Connection alerts stay quiet for a while (after the computer woke up). */
    quietFor(ms = RESUME_GRACE_MS) {
        this._quietUntil = Math.max(this._quietUntil, this._timers.now() + ms);
    }

    /** Look at every provider now (the timer does this once a minute). */
    check() {
        // Until the keyring has said which accounts are connected, the controller may hold values
        // of providers that are paused or removed; they must not raise an alert.
        if (!this._running || !this._controller.synced)
            return;
        for (const snapshot of this._controller.snapshots())
            this._look(snapshot);
    }

    _onChange({id, next}) {
        if (!this._running || !this._controller.synced)
            return;
        if (!next) {
            this._setState(forgetProvider(this._state, id));
            return;
        }
        // The change carries the snapshot aged by the controller.
        this._look(next);
    }

    _updateRules() {
        this._quotaRules = readAlertSettings(this._settings, this._quotaRules);
        const backup = serializeAlertRuleBackup(this._quotaRules);
        if (backup !== null && backup !== this._settings.get_string('alert-valid-rules'))
            this._settings.set_string('alert-valid-rules', backup);
    }

    _look(snapshot) {
        if (!this._rules) {
            this._rules = {quota: this._quotaRules, enabled: this._settings.get_boolean('notifications-enabled')};
        }
        const result = evaluate({
            snapshot,
            state: this._state,
            settings: this._rules.quota,
            now: this._timers.now(),
            intervalMs: this._controller.intervalOf(snapshot.id),
            quietUntil: this._quietUntil,
        });
        this._setState(result.state);
        // With notifications off the state still moves on, so turning them on later does not
        // announce what happened in the meantime.
        if (!this._rules.enabled)
            return;
        for (const event of result.events) {
            try {
                this._notify(event);
            } catch (error) {
                console.error(`Elfvision: cannot show a notification: ${error?.message ?? error}`);
            }
        }
    }

    _setState(state) {
        if (JSON.stringify(state) === JSON.stringify(this._state))
            return;
        this._state = state;
        this._dirty = true;
        if (this._saveTimer)
            return;
        this._saveTimer = this._timers.setTimeout(() => {
            this._saveTimer = 0;
            this._dirty = false;
            this._store.save(this._state);
        }, SAVE_DELAY_MS);
    }

    _schedule() {
        this._tick = this._timers.setTimeout(() => {
            this._tick = 0;
            try {
                this.check();
            } catch (error) {
                console.error(`Elfvision: the alert check failed: ${error?.message ?? error}`);
            }
            if (this._running)
                this._schedule();
        }, TICK_MS);
    }
}
