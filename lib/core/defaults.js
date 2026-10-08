// What "Restore defaults" does to each setting (docs/adr/0010). Every key of the schema is in one
// list or the other, and a test fails for a key in neither, so a new setting has to be decided
// about when it is added. Pure JavaScript.

/** Looks and behavior: these go back to how the extension was at first. */
export const RESET_KEYS = [
    'position', 'bar-count', 'compact-mode',
    'theme', 'color-scheme', 'effects-mode', 'transparency-enabled', 'effect-material',
    'clock-format', 'reset-format', 'auto-open', 'untracked-providers', 'first-use-done',
    'notifications-enabled', 'alert-connection',
    'alert-valid-rules',
    'alert-session-enabled', 'alert-session-percent',
    'alert-session-warning-enabled', 'alert-session-warning-percent',
    'alert-week-enabled', 'alert-week-percent',
    'alert-week-warning-enabled', 'alert-week-warning-percent',
    'alert-month-enabled', 'alert-month-percent',
    'alert-month-warning-enabled', 'alert-month-warning-percent',
    'alert-credits-enabled', 'alert-credits-percent',
    'alert-credits-warning-enabled', 'alert-credits-warning-percent',
];

/**
 * Left alone. Accounts, the terms acknowledgements and the status the shell
 * publishes belong to the user's accounts and must stay in step with the keyring; the demo
 * settings are for development; the rest are messages between the two processes.
 */
export const KEPT_KEYS = [
    'credentials-revision', 'credentials-touched', 'account-status',
    'command-code-username', 'terms-acknowledged', 'connectors', 'demo-connectors', 'demo-connected-connectors',
    'prefs-target', 'test-notification', 'data-source', 'demo-scenario',
];

/**
 * @param {string[]} schemaKeys - the keys the schema has
 * @returns {string[]} the keys to reset
 */
export function keysToReset(schemaKeys) {
    return RESET_KEYS.filter(key => schemaKeys.includes(key));
}
