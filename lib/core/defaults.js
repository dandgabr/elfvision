// What "Restore defaults" does to each setting (docs/adr/0010). Every key of the schema is in one
// list or the other, and a test fails for a key in neither, so a new setting has to be decided
// about when it is added. Pure JavaScript.

/** Looks and behavior: these go back to how the extension was at first. */
export const RESET_KEYS = [
    'position', 'bar-count', 'compact-mode',
    'theme', 'color-scheme', 'effects-mode', 'transparency-enabled', 'effect-material',
    'clock-format', 'reset-format', 'auto-open',
    'notifications-enabled', 'alert-connection',
    'alert-session-enabled', 'alert-session-percent',
    'alert-week-enabled', 'alert-week-percent',
    'alert-month-enabled', 'alert-month-percent',
    'alert-credits-enabled', 'alert-credits-percent',
    // Someone stuck in demo data would take a restore that leaves it for a bug.
    'data-source',
];

/**
 * Left alone. Accounts, what is tracked, the terms acknowledgements and the status the shell
 * publishes belong to the user's accounts and must stay in step with the keyring; the demo
 * settings are for development; the rest are messages between the two processes.
 */
export const KEPT_KEYS = [
    'credentials-revision', 'credentials-touched', 'account-status',
    'command-code-username', 'untracked-providers', 'terms-acknowledged',
    'first-use-done', 'prefs-target', 'test-notification', 'demo-scenario',
];

/**
 * @param {string[]} schemaKeys - the keys the schema has
 * @returns {string[]} the keys to reset
 */
export function keysToReset(schemaKeys) {
    return RESET_KEYS.filter(key => schemaKeys.includes(key));
}
