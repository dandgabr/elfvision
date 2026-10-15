// Diagnostic logging (docs/adr/0011). Pure: the destination is injected, so this module imports
// nothing from GNOME and every rule below is unit-tested.
//
// Rules, all enforced here and not left to callers:
//  - only events of the closed catalog are accepted; unknown events are ignored
//  - only the fields the catalog lists for that event are kept, and only when their value has the
//    declared type (integer, boolean, allowlisted host or provider id, or a closed choice); no free text
//  - `log` never throws, never awaits and never does I/O of its own
//  - the same (event, provider, code) is written once, then counted and summarised in the next
//    line after a quiet minute, so a failing provider cannot flood the journal

import {ERROR_NAMES, EVENTS, LEVELS, validatorFor} from './logEvents.js';

const RANK = Object.fromEntries(LEVELS.map((name, index) => [name, index]));
const WINDOW_MS = 60000;
const MAX_KEYS = 64;

/**
 * @param {object} options
 * @param {(line: {event: string, level: string, fields: Object<string, string|number|boolean>}) => void} options.sink
 * @param {string} [options.level] - one of LEVELS; events above it are dropped
 * @param {() => number} [options.now] - milliseconds, for the rate limit
 * @param {object} [options.catalog]
 */
export function createLogger({sink, level = 'warn', now = Date.now, catalog = EVENTS}) {
    let threshold = RANK[level] ?? RANK.warn;
    const recent = new Map();   // key -> {at, suppressed}

    const clean = (spec, fields) => {
        const out = {};
        if (!fields || typeof fields !== 'object')
            return out;
        for (const [name, type] of Object.entries(spec.fields)) {
            if (!Object.hasOwn(fields, name))
                continue;
            const valid = validatorFor(type);
            if (valid && valid(fields[name]))
                out[name] = fields[name];
        }
        return out;
    };

    // Returns how many lines were held back for this key, or -1 when this line is itself held back.
    const gate = (key, at) => {
        const entry = recent.get(key);
        if (entry && at - entry.at < WINDOW_MS) {
            entry.suppressed += 1;
            return -1;
        }
        const suppressed = entry?.suppressed ?? 0;
        if (!entry && recent.size >= MAX_KEYS) {
            // Bounded memory: forget the oldest key rather than grow.
            recent.delete(recent.keys().next().value);
        }
        recent.delete(key);
        recent.set(key, {at, suppressed: 0});
        return suppressed;
    };

    return {
        /** @param {string} name @param {object} [fields] */
        log(name, fields = {}) {
            try {
                const spec = Object.hasOwn(catalog, name) ? catalog[name] : null;
                if (!spec || threshold === RANK.off || RANK[spec.level] > threshold)
                    return;
                const values = clean(spec, fields);
                // Routine lines are not rate limited; only warnings and errors can repeat in a loop.
                if (RANK[spec.level] <= RANK.warn) {
                    const held = gate(`${name}|${values.provider ?? ''}|${values.code ?? values.cause ?? ''}`, now());
                    if (held < 0)
                        return;
                    if (held > 0)
                        values.suppressed = held;
                }
                sink({event: name, level: spec.level, fields: values});
            } catch (_error) {
                // Logging must never change what the extension does.
            }
        },
        setLevel(next) {
            if (Object.hasOwn(RANK, next))
                threshold = RANK[next];
        },
        get level() {
            return LEVELS[threshold];
        },
    };
}

/** The class of an exception as a catalog enum; never its message or stack. */
export function errorName(error) {
    const name = error?.name === 'GLib.Error' || error?.constructor?.name === 'GLib_Error' ? 'GLibError' : error?.name;
    return ERROR_NAMES.includes(name) ? name : 'other';
}

/** A logger that records nothing; the default for code that runs without one (tests, tools). */
export const nullLogger = Object.freeze({log() {}, setLevel() {}, level: 'off'});
