// The process-wide diagnostic logger (docs/adr/0011). The journal is the only destination: no file
// is written, no timer is armed, and `dispose()` has nothing to wait for. Pure modules receive the
// logger by injection; services import `diag` from here.

import GLib from 'gi://GLib';

import {createLogger} from '../core/log.js';
import {LEVELS} from '../core/logEvents.js';

export const LOG_DOMAIN = 'Elfvision';
const PRIORITY = {error: '3', warn: '4', info: '6', debug: '7'};
// Warnings and errors use their own level; informational lines use MESSAGE, which GLib's default
// writer does not drop (INFO and DEBUG are dropped unless G_MESSAGES_DEBUG names the domain).
const GLIB_LEVEL = {
    error: GLib.LogLevelFlags.LEVEL_CRITICAL,
    warn: GLib.LogLevelFlags.LEVEL_WARNING,
    info: GLib.LogLevelFlags.LEVEL_MESSAGE,
    debug: GLib.LogLevelFlags.LEVEL_MESSAGE,
};

let processName = 'shell';

/** Which process writes: `shell` or `prefs`, so one journal query tells them apart. */
export function setLogProcess(name) {
    processName = name === 'prefs' ? 'prefs' : 'shell';
}

/** The journal sink; values are strings because log_structured accepts nothing else. */
export function journalSink({event, level, fields}) {
    const record = {
        MESSAGE: event,
        PRIORITY: PRIORITY[level] ?? '4',
        ELFVISION_EVENT: event,
        ELFVISION_PROCESS: processName,
    };
    for (const [name, value] of Object.entries(fields))
        record[`ELFVISION_${name.replace(/[A-Z]/g, ch => `_${ch}`).toUpperCase()}`] = String(value);
    try {
        GLib.log_structured(LOG_DOMAIN, GLIB_LEVEL[level] ?? GLib.LogLevelFlags.LEVEL_WARNING, record);
    } catch (_error) {
        // The one permitted fallback: never lose the line, never throw into the caller.
        console.warn(`${LOG_DOMAIN}: ${event}`);
    }
}

const environment = GLib.getenv('ELFVISION_LOG');
const diag = createLogger({sink: journalSink, level: LEVELS.includes(environment) ? environment : 'warn'});
export {diag};

/**
 * Follow the `log-level` setting. `ELFVISION_LOG` (development) wins when it is set.
 *
 * @param {import('gi://Gio').Settings} settings
 * @returns {() => void} disconnects the handler
 */
export function bindLogLevel(settings) {
    if (LEVELS.includes(environment))
        return () => {};
    const apply = () => {
        try { diag.setLevel(settings.get_string('log-level')); } catch (_error) { /* keep the current level */ }
    };
    apply();
    const id = settings.connect('changed::log-level', apply);
    return () => settings.disconnect(id);
}
