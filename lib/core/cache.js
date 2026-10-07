// Serialization of the last known snapshots, so the bar has something to show
// right after login, before the first fetch finishes. Pure JavaScript; the
// file access lives in lib/services/cacheStore.js. The cache holds quota
// numbers only, never credentials.

import {normalizeSnapshot} from './contract.js';

export const CACHE_VERSION = 1;

/**
 * @param {object[]} snapshots
 * @param {number} nowMs
 * @returns {string}
 */
export function serializeCache(snapshots, nowMs) {
    const stripped = snapshots.map(({error: _error, ...rest}) => rest);
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
    for (const raw of data.snapshots) {
        const result = normalizeSnapshot(raw);
        if (!result.snapshot.id) {
            problems.push('cache entry without an id');
            continue;
        }
        snapshots.push(result.snapshot);
        problems.push(...result.problems.map(p => `${result.snapshot.id}: ${p}`));
    }
    return {snapshots, problems};
}
