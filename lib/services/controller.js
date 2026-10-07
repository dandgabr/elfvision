// Owns the providers, the scheduler and the cache, and tells the UI when the
// snapshots change. The UI never talks to a provider.

import GLib from 'gi://GLib';

import {applyFreshness} from '../core/contract.js';
import {PollScheduler} from '../core/scheduler.js';
import {CacheStore} from './cacheStore.js';
import {glibTimers} from './timers.js';

const SAVE_DELAY_MS = 2000;

export class QuotaController {
    /**
     * @param {object} options
     * @param {Array<import('../core/scheduler.js').Provider>} options.providers
     * @param {CacheStore} [options.cache]
     */
    constructor({providers, cache = new CacheStore()}) {
        this._providers = providers;
        this._cache = cache;
        this._listeners = new Set();
        this._saveSource = 0;
        this._started = false;
        this._loaded = false;
        this._generation = 0;
        this._lastUpdateMs = 0;
        this._scheduler = new PollScheduler({
            timers: glibTimers,
            onSnapshot: snapshot => this._onSnapshot(snapshot),
            onProblem: message => console.warn(`gnome-ai-quota: ${message}`),
        });
        providers.forEach(provider => this._scheduler.add(provider));
    }

    /** Show the cached values at once, then start polling. */
    async start() {
        if (this._started)
            return;
        this._started = true;
        const generation = ++this._generation;
        const {snapshots, problems} = await this._cache.load();
        problems.forEach(problem => console.warn(`gnome-ai-quota: ${problem}`));
        if (generation !== this._generation)
            return;   // stopped (or restarted) while the cache was loading
        this._loaded = true;

        const known = new Set(this._providers.map(p => p.id));
        for (const snapshot of snapshots.filter(s => known.has(s.id))) {
            this._scheduler.seed(snapshot);
            this._lastUpdateMs = Math.max(this._lastUpdateMs, snapshot.source?.fetchedAt ?? 0);
        }
        // Polling must start even if a listener misbehaves while being told.
        this._scheduler.start();
        if (snapshots.length)
            this._notify();
    }

    /** Stop polling and write the cache once more. */
    stop() {
        // The cache is only written back if it was read first: a stop during the
        // load must not replace a good file with an empty one.
        const shouldSave = this._started && this._loaded;
        this._started = false;
        this._loaded = false;
        this._generation++;
        this._scheduler.stop();
        if (this._saveSource) {
            GLib.source_remove(this._saveSource);
            this._saveSource = 0;
        }
        this._listeners.clear();
        if (shouldSave)
            this._cache.save(this._scheduler.snapshots(), true);
    }

    /**
     * @param {string|null} [id] - one provider, or all when omitted
     * @returns {Promise<void>} resolves when the fetches it started are done
     */
    refresh(id = null) {
        return this._scheduler.refresh(id);
    }

    /** The user connected or removed an account. */
    credentialsChanged(id) {
        return this._scheduler.credentialsChanged(id);
    }

    /**
     * @param {() => void} listener - called whenever any snapshot changes
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    /** @returns {object[]} snapshots in provider order, aged by the current time */
    snapshots() {
        const now = Date.now();
        const interval = new Map(this._providers.map(p => [p.id, p.intervalMs]));
        return this._scheduler.snapshots().map(s => applyFreshness(s, now, interval.get(s.id) ?? 0));
    }

    /** Time of the most recent successful fetch, in ms since the epoch (0 if none). */
    get lastUpdateMs() {
        return this._lastUpdateMs;
    }

    _onSnapshot(snapshot) {
        if (snapshot.state === 'ok')
            this._lastUpdateMs = snapshot.source.fetchedAt;
        this._notify();
        this._scheduleSave();
    }

    _notify() {
        for (const listener of [...this._listeners]) {
            try {
                listener();
            } catch (error) {
                console.error(`gnome-ai-quota: a listener failed: ${error.message}`);
            }
        }
    }

    _scheduleSave() {
        if (this._saveSource || !this._loaded)
            return;
        this._saveSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
            this._saveSource = 0;
            this._cache.save(this._scheduler.snapshots());
            return GLib.SOURCE_REMOVE;
        });
    }
}
