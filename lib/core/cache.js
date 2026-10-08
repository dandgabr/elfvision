// Serialization of the last known snapshots, so the bar has something to show
// right after login, before the first fetch finishes. Pure JavaScript; the
// file access lives in lib/services/cacheStore.js. The cache holds quota
// numbers only, never credentials.

import {normalizeSnapshot} from './contract.js';

export const CACHE_VERSION = 1;

// A cache file is read at login, so it is capped: a corrupted or hostile file
// must not be able to fill the UI or the memory.
export const MAX_CACHE_BYTES = 256 * 1024;
export const MAX_SNAPSHOTS = 32;
export const MAX_METRICS = 16;
export const MAX_TEXT = 64;

/**
 * @param {object[]} snapshots
 * @param {number} nowMs
 * @returns {string}
 */
export function serializeCache(snapshots, nowMs) {
    const stripped = snapshots.map(raw => {
        const {error: _error, ...snapshot} = normalizeSnapshot(raw).snapshot;
        return snapshot;
    });
    return JSON.stringify({version: CACHE_VERSION, savedAt: nowMs, snapshots: stripped});
}

/**
 * Read a cache file. Anything unreadable, of another version or malformed is
 * ignored: a bad cache must never stop the extension from starting.
 *
 * @param {string} text
 * @returns {{snapshots: object[], problems: string[]}}
 */
export function parseCache(text) {
    if (text.length > MAX_CACHE_BYTES)
        return {snapshots: [], problems: ['cache is too large']};
    let data;
    try {
        data = JSON.parse(text);
    } catch (_error) {
        return {snapshots: [], problems: ['cache is not valid JSON']};
    }
    if (!data || data.version !== CACHE_VERSION || !Array.isArray(data.snapshots))
        return {snapshots: [], problems: ['cache has an unknown format']};

    const snapshots = [];
    const problems = [];
    for (const raw of data.snapshots.slice(0, MAX_SNAPSHOTS)) {
        const result = normalizeSnapshot(raw && typeof raw === 'object' ? {
            ...raw,
            id: String(raw.id ?? '').slice(0, MAX_TEXT),
            name: String(raw.name ?? raw.id ?? '').slice(0, MAX_TEXT),
            plan: String(raw.plan ?? '').slice(0, MAX_TEXT),
            metrics: Array.isArray(raw.metrics) ? raw.metrics.slice(0, MAX_METRICS) : [],
        } : raw);
        if (!result.snapshot.id) {
            problems.push('cache entry without an id');
            continue;
        }
        snapshots.push(result.snapshot);
        problems.push(...result.problems.map(p => `${result.snapshot.id}: ${p}`));
    }
    return {snapshots, problems};
}
