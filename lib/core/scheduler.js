// Polls every provider on its own schedule (docs/adr/0002, 0003).
//
// - One fetch at a time per provider, with a timeout. A fetch that outlives its
//   timeout is told (through the context it received) that nobody is waiting.
// - Success: the next poll comes after the interval, jittered by +-10%.
// - Failure: exponential backoff (30 s, 1 min, 2 min, ... capped at 1 h); a
//   rate limit honors the server's hint, never longer than the cap.
// - `auth_required` stops polling that provider: no retry loop against a
//   rejected credential. A manual refresh or `credentialsChanged` starts it
//   again, and a successful fetch resumes the schedule.
// - A failure keeps the last known metrics, so the UI can show the last value
//   with its age, and records when the next attempt will happen.
//
// Time and timers are injected, so the tests drive a virtual clock. Pure
// JavaScript: no GObject imports.

import {ERROR_CODES, ProviderError} from './errors.js';
import {normalizeSnapshot, redact} from './contract.js';

const SECOND_MS = 1000;
const HOUR_MS = 3600 * SECOND_MS;

export const DEFAULTS = {
    timeoutMs: 30 * SECOND_MS,
    backoffBaseMs: 30 * SECOND_MS,
    backoffMaxMs: HOUR_MS,
    minRefreshGapMs: 5 * SECOND_MS,
    initialSpreadMs: 2 * SECOND_MS,
    // The shortest poll interval honored; real providers declare 5 minutes.
    minIntervalMs: 5 * SECOND_MS,
    defaultIntervalMs: 5 * 60 * SECOND_MS,
    jitter: 0.1,
};

/**
 * @typedef {object} FetchContext
 * @property {() => boolean} isCancelled - true once the scheduler gave up on this
 *   fetch (timeout, provider removed); a provider may stop work early
 */

/**
 * @typedef {object} Provider
 * @property {string} id
 * @property {string} name
 * @property {string} [plan]
 * @property {number} intervalMs - poll interval
 * @property {(context: FetchContext) => Promise<object>} fetch - resolves with a raw
 *   snapshot body ({metrics, plan?}), or rejects with a ProviderError
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
        // A bad interval (0, NaN, negative) would turn into a tight loop.
        const intervalMs = Number.isFinite(provider.intervalMs)
            ? Math.max(this._cfg.minIntervalMs, provider.intervalMs)
            : this._cfg.defaultIntervalMs;
        const entry = {
            provider, intervalMs, timer: null, failures: 0, inFlight: null, attempt: 0, credentialRevision: 0,
            paused: false, removed: false, rerun: false, lastAttemptAt: -Infinity, last: null,
        };
        this._entries.set(provider.id, entry);
        if (this._running)
            this._schedule(entry, this._firstDelay(entry));
    }

    remove(id) {
        const entry = this._entries.get(id);
        if (!entry)
            return;
        // A fetch in flight keeps running; `removed` makes it a no-op when it ends.
        entry.removed = true;
        entry.attempt++;
        this._clear(entry);
        this._entries.delete(id);
    }

    /**
     * Seed the last known snapshot (from the cache) without fetching. Ignored
     * once the provider has data of its own, so a slow cache never overwrites
     * a newer fetch.
     */
    seed(snapshot) {
        const entry = this._entries.get(snapshot.id);
        if (!entry || entry.last || entry.inFlight)
            return;
        // Names and plans may have changed since the cache was written.
        entry.last = {...snapshot, name: entry.provider.name, plan: entry.provider.plan ?? snapshot.plan};
    }

    /** Start polling. Providers are spread over a short window so they do not all fire at once. */
    start() {
        if (this._running)
            return;
        this._running = true;
        for (const entry of this._entries.values())
            this._schedule(entry, this._firstDelay(entry));
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

    /**
     * The network is back: try again at once the providers that were failing for lack of it,
     * instead of waiting out a backoff that can last an hour.
     *
     * @returns {Promise<void>}
     */
    retryNetworkFailures() {
        const waiting = [...this._entries.values()].filter(entry =>
            entry.last?.state === 'network' && !entry.inFlight && !entry.paused);
        return Promise.all(waiting.map(entry => this._run(entry))).then(() => {});
    }

    /**
     * The user connected or removed an account: forget the failure and poll
     * again. A fetch already in flight used the old credential, so it is
     * followed by a new one.
     */
    credentialsChanged(id) {
        const entry = this._entries.get(id);
        if (!entry)
            return Promise.resolve();
        entry.credentialRevision++;
        entry.failures = 0;
        entry.paused = false;
        if (entry.inFlight) {
            entry.rerun = true;
            return entry.inFlight;
        }
        return this._run(entry);
    }

    /** @returns {object[]} the last snapshot of every provider that has one, in registration order */
    snapshots() {
        return [...this._entries.values()].map(e => e.last).filter(Boolean);
    }

    // ----------------------------------------------------------- internals

    _spread() {
        return this._random() * this._cfg.initialSpreadMs;
    }

    /**
     * When a provider is first fetched after the scheduler starts: soon, spread out, unless
     * it already has a value from the cache that is not due yet. The extension restarts at
     * every screen lock, and asking every provider again each time would only invite rate limits.
     */
    _firstDelay(entry) {
        const spread = this._spread();
        const last = entry.last;
        if (!last)
            return spread;
        const fetchedAt = last.source?.fetchedAt;
        let due = -Infinity;
        if (last.state === 'ok' && Number.isFinite(fetchedAt))
            due = fetchedAt + entry.intervalMs;
        else if (Number.isFinite(last.nextRetryAt))
            due = last.nextRetryAt;
        return Math.max(spread, due - this._timers.now());
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
        if (!this._running || entry.paused || entry.removed)
            return;
        entry.timer = this._timers.setTimeout(() => {
            entry.timer = null;
            this._run(entry);
        }, Math.max(0, delayMs));
    }

    _backoffMs(failures) {
        return Math.min(this._cfg.backoffMaxMs, this._cfg.backoffBaseMs * 2 ** (failures - 1));
    }

    _emit(snapshot) {
        // A listener (the UI) that throws must not turn a good fetch into a failure.
        try {
            this._onSnapshot(snapshot);
        } catch (error) {
            this._onProblem(`a listener failed: ${error.message}`);
        }
    }

    _run(entry) {
        if (entry.inFlight)
            return entry.inFlight;
        this._clear(entry);
        entry.lastAttemptAt = this._timers.now();
        entry.inFlight = this._attempt(entry).catch(error => {
            this._onProblem(`${entry.provider.id}: unexpected scheduler error: ${error.message}`);
        }).finally(() => {
            entry.inFlight = null;
            if (entry.rerun && !entry.removed) {
                entry.rerun = false;
                this._run(entry);
            }
        });
        return entry.inFlight;
    }

    _withTimeout(promise, onTimeout = () => {}) {
        return new Promise((resolve, reject) => {
            let timedOut = false;
            const handle = this._timers.setTimeout(() => {
                timedOut = true;
                onTimeout();
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
        const token = ++entry.attempt;
        const credentialRevision = entry.credentialRevision;
        // `superseded`: a newer attempt or a removal made this one irrelevant.
        // `abandoned`: it timed out; its failure still counts, but the fetch is told
        // nobody is waiting, so it can stop its request.
        const superseded = () => entry.removed || entry.attempt !== token || entry.credentialRevision !== credentialRevision;
        let abandoned = false;
        const context = {isCancelled: () => abandoned || superseded()};
        try {
            const body = await this._withTimeout(Promise.resolve().then(() => provider.fetch(context)), () => {
                abandoned = true;
            });
            if (superseded())
                return;
            const {snapshot, problems} = normalizeSnapshot({
                id: provider.id,
                name: provider.name,
                plan: body?.plan ?? provider.plan ?? '',
                metrics: body?.metrics,
                state: 'ok',
                source: {kind: 'fresh', fetchedAt: this._timers.now()},
            });
            for (const problem of problems)
                this._onProblem(`${provider.id}: ${problem}`);
            // A reply whose every metric was unusable must not replace good data.
            if (Array.isArray(body?.metrics) && body.metrics.length > 0 && snapshot.metrics.length === 0)
                throw new ProviderError('parse_error', 'every metric in the reply was unusable');

            entry.failures = 0;
            entry.paused = false;
            entry.last = snapshot;
            this._emit(snapshot);
            this._schedule(entry, this._jittered(entry.intervalMs));
        } catch (error) {
            if (superseded())
                return;
            this._fail(entry, error);
        }
    }

    _fail(entry, error) {
        const {provider} = entry;
        const code = ERROR_CODES.includes(error?.code) ? error.code : 'network';
        entry.failures += 1;

        let delay = null;
        if (code !== 'auth_required') {
            delay = this._backoffMs(entry.failures);
            const retryFloor = Number.isFinite(error?.retryAfterMs)
                ? Math.max(0, Math.min(error.retryAfterMs, this._cfg.backoffMaxMs)) : 0;
            delay = Math.max(delay, retryFloor);
            // Jitter must neither retry before the accepted server hint nor
            // extend the configured hard cap. Ordinary backoff keeps its jitter.
            delay = Math.min(this._cfg.backoffMaxMs, Math.max(retryFloor, this._jittered(delay)));
        }

        // Keep the last metrics: the UI shows them dimmed, with their age.
        const base = entry.last ?? {id: provider.id, name: provider.name, plan: provider.plan ?? '', metrics: []};
        const {snapshot} = normalizeSnapshot({
            ...base,
            state: code,
            source: {kind: 'stale', fetchedAt: base.source?.fetchedAt},
            error: redact(error?.message ?? error),
            reason: error?.reason,
            nextRetryAt: delay === null ? undefined : this._timers.now() + delay,
        });
        entry.last = snapshot;
        this._emit(snapshot);

        if (code === 'auth_required')
            entry.paused = true;
        else
            this._schedule(entry, delay);
    }
}
