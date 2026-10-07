// Polls every provider on its own schedule (docs/adr/0002, 0003).
//
// - One fetch at a time per provider, with a timeout.
// - Success: the next poll comes after the interval, jittered by +-10%.
// - Failure: exponential backoff (30 s, 1 min, 2 min, ... capped at 1 h); a
//   rate limit honors the server's hint when it is longer.
// - `auth_required` stops polling that provider: no retry loop against a
//   rejected credential. Connecting an account (`credentialsChanged`) or a
//   manual refresh starts it again.
// - A failure keeps the last known metrics, so the UI can show the last value
//   with its age instead of nothing.
//
// Time and timers are injected, so the tests drive a virtual clock. Pure
// JavaScript: no GObject imports.

import {normalizeSnapshot} from './contract.js';

const SECOND_MS = 1000;
const HOUR_MS = 3600 * SECOND_MS;

export const DEFAULTS = {
    timeoutMs: 30 * SECOND_MS,
    backoffBaseMs: 30 * SECOND_MS,
    backoffMaxMs: HOUR_MS,
    minRefreshGapMs: 5 * SECOND_MS,
    initialSpreadMs: 2 * SECOND_MS,
    jitter: 0.1,
};

/**
 * @typedef {object} Provider
 * @property {string} id
 * @property {string} name
 * @property {string} [plan]
 * @property {number} intervalMs - poll interval
 * @property {() => Promise<object>} fetch - resolves with a raw snapshot body
 *   ({metrics, plan?}), or rejects with a ProviderError
 */

/**
 * @typedef {object} Timers
 * @property {() => number} now - milliseconds since the epoch
 * @property {(fn: () => void, ms: number) => *} setTimeout
 * @property {(handle: *) => void} clearTimeout
 */

export class PollScheduler {
    /**
     * @param {object} options
     * @param {Timers} options.timers
     * @param {(snapshot: object) => void} options.onSnapshot - every new snapshot
     * @param {() => number} [options.random] - in [0, 1), for jitter
     * @param {(message: string) => void} [options.onProblem] - invalid provider output
     * @param {Partial<typeof DEFAULTS>} [options.settings]
     */
    constructor({timers, onSnapshot, random = Math.random, onProblem = () => {}, settings = {}}) {
        this._timers = timers;
        this._onSnapshot = onSnapshot;
        this._random = random;
        this._onProblem = onProblem;
        this._cfg = {...DEFAULTS, ...settings};
        this._entries = new Map();
        this._running = false;
    }

    /** @param {Provider} provider */
    add(provider) {
        if (this._entries.has(provider.id))
            throw new Error(`provider "${provider.id}" is already registered`);
        const entry = {
            provider, timer: null, failures: 0, inFlight: null,
            paused: false, lastAttemptAt: -Infinity, last: null,
        };
        this._entries.set(provider.id, entry);
        if (this._running)
            this._schedule(entry, this._spread());
    }

    remove(id) {
        const entry = this._entries.get(id);
        if (!entry)
            return;
        this._clear(entry);
        this._entries.delete(id);
    }

    /** Seed the last known snapshot (from the cache) without fetching. */
    seed(snapshot) {
        const entry = this._entries.get(snapshot.id);
        if (entry)
            entry.last = snapshot;
    }

    /** Start polling. Providers are spread over a short window so they do not all fire at once. */
    start() {
        if (this._running)
            return;
        this._running = true;
        for (const entry of this._entries.values())
            this._schedule(entry, this._spread());
    }

    stop() {
        this._running = false;
        for (const entry of this._entries.values())
            this._clear(entry);
    }

    /**
     * Fetch now. Ignored when a fetch is already running or the last attempt
     * was moments ago, except for a provider waiting for credentials.
     *
     * @param {string|null} [id] - one provider, or all when omitted
     * @returns {Promise<void>} resolves when the fetches it started are done
     */
    refresh(id = null) {
        const entries = id === null ? [...this._entries.values()] : [this._entries.get(id)].filter(Boolean);
        return Promise.all(entries.map(entry => {
            if (entry.inFlight)
                return entry.inFlight;
            const recent = this._timers.now() - entry.lastAttemptAt < this._cfg.minRefreshGapMs;
            if (recent && !entry.paused)
                return Promise.resolve();
            return this._run(entry);
        })).then(() => {});
    }

    /** The user connected or removed an account: forget the failure and poll again. */
    credentialsChanged(id) {
        const entry = this._entries.get(id);
        if (!entry)
            return Promise.resolve();
        entry.failures = 0;
        entry.paused = false;
        return entry.inFlight ?? this._run(entry);
    }

    /** @returns {object[]} the last snapshot of every provider that has one, in registration order */
    snapshots() {
        return [...this._entries.values()].map(e => e.last).filter(Boolean);
    }

    // ----------------------------------------------------------- internals

    _spread() {
        return this._random() * this._cfg.initialSpreadMs;
    }

    _jittered(ms) {
        return Math.max(0, ms * (1 + (this._random() * 2 - 1) * this._cfg.jitter));
    }

    _clear(entry) {
        if (entry.timer !== null) {
            this._timers.clearTimeout(entry.timer);
            entry.timer = null;
        }
    }

    _schedule(entry, delayMs) {
        this._clear(entry);
        if (!this._running || entry.paused)
            return;
        entry.timer = this._timers.setTimeout(() => {
            entry.timer = null;
            this._run(entry);
        }, Math.max(0, delayMs));
    }

    _backoffMs(failures) {
        return Math.min(this._cfg.backoffMaxMs, this._cfg.backoffBaseMs * 2 ** (failures - 1));
    }

    _run(entry) {
        if (entry.inFlight)
            return entry.inFlight;
        this._clear(entry);
        entry.lastAttemptAt = this._timers.now();
        entry.inFlight = this._attempt(entry).finally(() => {
            entry.inFlight = null;
        });
        return entry.inFlight;
    }

    _withTimeout(promise) {
        return new Promise((resolve, reject) => {
            let timedOut = false;
            const handle = this._timers.setTimeout(() => {
                timedOut = true;
                const error = new Error('fetch timed out');
                error.code = 'network';
                reject(error);
            }, this._cfg.timeoutMs);
            // A timer that already fired must not be cleared again: with GLib,
            // removing a source that is gone logs a critical.
            const settle = finish => value => {
                if (!timedOut)
                    this._timers.clearTimeout(handle);
                finish(value);
            };
            promise.then(settle(resolve), settle(reject));
        });
    }

    async _attempt(entry) {
        const {provider} = entry;
        try {
            const body = await this._withTimeout(Promise.resolve().then(() => provider.fetch()));
            const {snapshot, problems} = normalizeSnapshot({
                ...body,
                id: provider.id,
                name: provider.name,
                plan: body?.plan ?? provider.plan ?? '',
                state: 'ok',
                source: {kind: 'fresh', fetchedAt: this._timers.now()},
            });
            for (const problem of problems)
                this._onProblem(`${provider.id}: ${problem}`);
            entry.failures = 0;
            entry.last = snapshot;
            this._onSnapshot(snapshot);
            this._schedule(entry, this._jittered(provider.intervalMs));
        } catch (error) {
            this._fail(entry, error);
        }
    }

    _fail(entry, error) {
        const {provider} = entry;
        const code = typeof error?.code === 'string' ? error.code : 'network';
        entry.failures += 1;

        // Keep the last metrics: the UI shows them dimmed, with their age.
        const base = entry.last ?? {id: provider.id, name: provider.name, plan: provider.plan ?? '', metrics: []};
        const {snapshot} = normalizeSnapshot({
            ...base,
            state: code,
            source: {kind: 'stale', fetchedAt: base.source?.fetchedAt},
            error: String(error?.message ?? error),
        });
        entry.last = snapshot;
        this._onSnapshot(snapshot);

        if (snapshot.state === 'auth_required') {
            entry.paused = true;
            return;
        }
        let delay = this._backoffMs(entry.failures);
        if (Number.isFinite(error?.retryAfterMs))
            delay = Math.max(delay, error.retryAfterMs);
        this._schedule(entry, this._jittered(delay));
    }
}
