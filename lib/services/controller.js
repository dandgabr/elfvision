// Owns the providers, the scheduler and the cache, and tells the UI when the
// snapshots change. The UI never talks to a provider.

import Gio from 'gi://Gio';
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
     * @param {string[]} [options.order] - provider ids in display order; others come last
     */
    constructor({providers, cache = new CacheStore(), order = []}) {
        this._providers = new Map(providers.map(provider => [provider.id, provider]));
        this._order = order;
        this._cached = new Map();
        this._cache = cache;
        this._listeners = new Set();
        this._changeListeners = new Set();
        // The last snapshot of each provider, for the listeners that want to compare it with a new one.
        this._last = new Map();
        this._saveSource = 0;
        this._started = false;
        this._loaded = false;
        this._generation = 0;
        this._synced = false;
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

        for (const snapshot of snapshots)
            this._cached.set(snapshot.id, snapshot);
        for (const id of this._providers.keys())
            this._seed(id);
        // Polling must start even if a listener misbehaves while being told.
        this._scheduler.start();
        // A network that comes back should not wait for a backoff that can last an hour.
        const monitor = Gio.NetworkMonitor.get_default();
        this._monitor = monitor;
        this._monitorId = monitor.connect('network-changed', (_monitor, available) => {
            if (available)
                this._scheduler.retryNetworkFailures();
        });
        if (snapshots.length)
            this._notify();
    }

    /**
     * True once the set of providers is known: the extension has asked the keyring which
     * accounts are connected. Until then an empty list means "not known yet", not "nothing".
     */
    get synced() {
        return this._synced;
    }

    /** The set of providers is known now (see `synced`). */
    markSynced() {
        if (this._synced)
            return;
        this._synced = true;
        this._notify();
    }

    /** What to write to the cache: the running providers, and the cached ones not yet restarted. */
    _snapshotsToSave() {
        const running = this._scheduler.snapshots();
        if (this._synced)
            return running;
        const seen = new Set(running.map(s => s.id));
        return [...running, ...[...this._cached.values()].filter(s => !seen.has(s.id))];
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
        if (this._monitorId) {
            this._monitor.disconnect(this._monitorId);
            this._monitorId = 0;
        }
        // Providers may hold requests in flight; they are cancelled with the stop.
        for (const provider of this._providers.values())
            provider.dispose?.();
        if (this._saveSource) {
            GLib.source_remove(this._saveSource);
            this._saveSource = 0;
        }
        this._listeners.clear();
        this._changeListeners.clear();
        this._last.clear();
        if (shouldSave)
            this._cache.save(this._snapshotsToSave());
    }

    /** The last value kept for a provider that has just been added, if the cache has one. */
    _seed(id) {
        const snapshot = this._cached.get(id);
        if (!snapshot || !this._providers.has(id))
            return;
        this._scheduler.seed(snapshot);
        // After a restart the cache is the "previous" value, so the first poll is not taken for a change.
        this._last.set(id, snapshot);
        this._lastUpdateMs = Math.max(this._lastUpdateMs, snapshot.source?.fetchedAt ?? 0);
    }

    /**
     * Start collecting a provider while running.
     *
     * @param {import('../core/scheduler.js').Provider} provider
     */
    addProvider(provider) {
        if (this._providers.has(provider.id))
            return;
        this._providers.set(provider.id, provider);
        this._scheduler.add(provider);
        if (this._loaded)
            this._seed(provider.id);
        this._notify();
    }

    /** Stop collecting a provider and forget its data. */
    removeProvider(id) {
        const provider = this._providers.get(id);
        if (!provider)
            return;
        provider.dispose?.();
        this._scheduler.remove(id);
        this._providers.delete(id);
        this._cached.delete(id);
        this._announceChange(id, this._last.get(id) ?? null, null);
        this._last.delete(id);
        this._notify();
        this._scheduleSave();
    }

    /**
     * Make the running providers exactly the wanted ones: those already running are kept
     * as they are, the others are removed or created.
     *
     * @param {string[]} ids - the providers that should run
     * @param {(id: string) => import('../core/scheduler.js').Provider} create
     */
    sync(ids, create) {
        for (const id of [...this._providers.keys()]) {
            if (!ids.includes(id))
                this.removeProvider(id);
        }
        for (const id of ids) {
            if (!this._providers.has(id))
                this.addProvider(create(id));
        }
    }

    /** @returns {string[]} the ids of the providers that are running */
    providerIds() {
        return [...this._providers.keys()];
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

    /**
     * @param {(change: {id: string, previous: object|null, next: object|null}) => void} listener -
     *   called with the snapshot a provider had and the one it has now; `next` is null when the
     *   provider was removed, `previous` is null the first time anything is known about it
     * @returns {() => void} unsubscribe
     */
    subscribeChanges(listener) {
        this._changeListeners.add(listener);
        return () => this._changeListeners.delete(listener);
    }

    /** @returns {object[]} snapshots in provider order, aged by the current time */
    snapshots() {
        const now = Date.now();
        const rank = id => {
            const index = this._order.indexOf(id);
            return index === -1 ? this._order.length : index;
        };
        return this._scheduler.snapshots()
            .map(s => applyFreshness(s, now, this._providers.get(s.id)?.intervalMs ?? 0))
            .sort((a, b) => rank(a.id) - rank(b.id));
    }

    /** Time of the most recent successful fetch, in ms since the epoch (0 if none). */
    get lastUpdateMs() {
        return this._lastUpdateMs;
    }

    _onSnapshot(snapshot) {
        if (snapshot.state === 'ok')
            this._lastUpdateMs = snapshot.source.fetchedAt;
        const previous = this._last.get(snapshot.id) ?? null;
        this._last.set(snapshot.id, snapshot);
        this._announceChange(snapshot.id, previous, snapshot);
        this._notify();
        this._scheduleSave();
    }

    _announceChange(id, previous, next) {
        for (const listener of [...this._changeListeners]) {
            try {
                listener({id, previous, next});
            } catch (error) {
                console.error(`gnome-ai-quota: a change listener failed: ${error.message}`);
            }
        }
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
            this._cache.save(this._snapshotsToSave()).catch(error => console.warn(`gnome-ai-quota: cannot write the cache: ${error.message}`));
            return GLib.SOURCE_REMOVE;
        });
    }
}
