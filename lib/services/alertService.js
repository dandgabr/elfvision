// Runs the alert rules (lib/core/alerts.js) against the live snapshots and hands the events to a
// notifier. It owns the stored state and the clock-driven re-evaluation: a rejected sign-in
// produces one snapshot and is never polled again, so "ten minutes later" needs a timer.

import {
    QUOTA_TYPES, RESUME_GRACE_MS, emptyAlertState, evaluate, forgetProvider, normalizeAlertSettings,
} from '../core/alerts.js';
import {glibTimers} from './timers.js';

const TICK_MS = 60 * 1000;
const SAVE_DELAY_MS = 2000;

/** The alert settings as stored in GSettings (they can be edited by hand, so they are re-checked). */
export function readAlertSettings(settings) {
    const thresholds = {};
    for (const type of QUOTA_TYPES) {
        thresholds[type] = {
            enabled: settings.get_boolean(`alert-${type}-enabled`),
            percent: settings.get_int(`alert-${type}-percent`),
        };
    }
    return normalizeAlertSettings({thresholds, connection: settings.get_boolean('alert-connection')});
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
    }

    async start() {
        if (this._running)
            return;
        this._running = true;
        const generation = ++this._generation;
        const {state, problems} = await this._store.load();
        problems.forEach(problem => console.warn(`gnome-ai-quota: ${problem}`));
        if (generation !== this._generation)
            return;   // stopped while the file was being read
        this._state = state;
        this._unsubscribe = this._controller.subscribeChanges(change => this._onChange(change));
        this._schedule();
    }

    stop() {
        this._running = false;
        this._generation++;
        this._unsubscribe?.();
        this._unsubscribe = null;
        if (this._tick) {
            this._timers.clearTimeout(this._tick);
            this._tick = 0;
        }
        if (this._saveTimer) {
            this._timers.clearTimeout(this._saveTimer);
            this._saveTimer = 0;
        }
        if (this._dirty)
            this._store.save(this._state);
        this._dirty = false;
    }

    /** Connection alerts stay quiet for a while (after the computer woke up). */
    quietFor(ms = RESUME_GRACE_MS) {
        this._quietUntil = Math.max(this._quietUntil, this._timers.now() + ms);
    }

    /** Look at every provider now (the timer does this once a minute). */
    check() {
        if (!this._running)
            return;
        for (const snapshot of this._controller.snapshots())
            this._look(snapshot);
    }

    _onChange({id, next}) {
        if (!this._running)
            return;
        if (!next) {
            this._setState(forgetProvider(this._state, id));
            return;
        }
        // The change carries the snapshot aged by the controller.
        this._look(next);
    }

    _look(snapshot) {
        const result = evaluate({
            snapshot,
            state: this._state,
            settings: readAlertSettings(this._settings),
            now: this._timers.now(),
            intervalMs: this._controller.intervalOf(snapshot.id),
            quietUntil: this._quietUntil,
        });
        this._setState(result.state);
        // With notifications off the state still moves on, so turning them on later does not
        // announce what happened in the meantime.
        if (!this._settings.get_boolean('notifications-enabled'))
            return;
        for (const event of result.events) {
            try {
                this._notify(event);
            } catch (error) {
                console.error(`gnome-ai-quota: cannot show a notification: ${error?.message ?? error}`);
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
                console.error(`gnome-ai-quota: the alert check failed: ${error?.message ?? error}`);
            }
            if (this._running)
                this._schedule();
        }, TICK_MS);
    }
}
