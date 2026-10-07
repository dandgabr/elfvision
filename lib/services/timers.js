// GLib-backed timers for the scheduler (see lib/core/scheduler.js).

import GLib from 'gi://GLib';

const MAX_DELAY_MS = 2 ** 31 - 1;
const DEFAULT_DELAY_MS = 60 * 1000;

export const glibTimers = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => GLib.timeout_add(GLib.PRIORITY_DEFAULT,
        Math.min(MAX_DELAY_MS, Math.max(1, Math.round(Number.isFinite(ms) ? ms : DEFAULT_DELAY_MS))), () => {
            fn();
            return GLib.SOURCE_REMOVE;
        }),
    clearTimeout: id => GLib.source_remove(id),
};
