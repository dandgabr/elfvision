// The closed catalog of diagnostic events (docs/adr/0011). Nothing outside it can be logged, and a
// field outside an event's list is dropped: this is an allowlist, not a filter for secrets. No field
// holds free text: values are enums, non-negative integers, booleans, or short tokens.
//
// A diagnostic line never carries a connector id, a label, a user name, a URL, a path, a header, a
// body, a plan, or a credential. `provider` (a catalog id such as `codex`) is allowed only on
// events that are warnings, errors or debug lines, so routine successes build no usage history.

import {ERROR_CODES, REASONS} from './errors.js';

export const LEVELS = ['off', 'error', 'warn', 'info', 'debug'];

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const HTTP_FAILURES = ['timeout', 'cancelled', 'transport', 'too_large', 'tls', 'other'];
const REJECTIONS = ['address', 'scheme', 'host', 'port', 'userinfo', 'header'];
const KEYRING_OPS = ['lookup', 'store', 'clear', 'search', 'enumerate'];
const KEYRING_CAUSES = ['locked', 'unavailable', 'ambiguous', 'timeout', 'denied', 'other'];
const TRIGGERS = ['timer', 'manual', 'resume', 'credentials', 'network', 'start'];
const TOKEN_FAILURES = ['network', 'keyring', 'not_connected', 'expired', 'reconnect', 'disconnected', 'no_config', 'other'];
const LOOPBACK_CAUSES = ['timeout', 'state_mismatch', 'port_busy', 'malformed', 'denied', 'cancelled'];
const PHASES = ['controller', 'alerts', 'indicator', 'themes', 'sync', 'rebuild', 'position'];
const FILE_CAUSES = ['read', 'write', 'parse', 'too_large', 'unsafe', 'blocked', 'other'];
const THEME_CAUSES = ['invalid', 'too_large', 'font', 'read', 'other'];
// The class of an exception: enough to tell a programming error from an expected failure, and
// nothing a message could leak.
export const ERROR_NAMES = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError',
    'ProviderError', 'TokenError', 'OAuthError', 'GLibError', 'other'];
const FONT_STEPS = ['inventory', 'cache', 'verify', 'shell', 'download', 'other'];

/** Field value types: integers, booleans, an allowlisted host or provider id, or a closed `choice`. */
export const TYPES = {
    int: value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647,
    bool: value => typeof value === 'boolean',
    // A DNS name from our own allowlist: dotted, no consecutive hyphens (a connector id has them).
    host: value => typeof value === 'string' && value.length <= 64 && !value.includes('--')
        && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value),
    // A catalog provider id, never a connector id (`<provider>--<uuid>`).
    provider: value => typeof value === 'string' && /^[a-z0-9-]{1,24}$/.test(value) && !value.includes('--'),
};
const choice = list => value => typeof value === 'string' && list.includes(value);

const event = (level, fields, text) => Object.freeze({level, fields: Object.freeze(fields), text});

/** @type {Readonly<Object<string, {level: string, fields: object, text: string}>>} */
export const EVENTS = Object.freeze({
    'http.completed': event('debug', {host: 'host', method: choice(METHODS), status: 'int', durationMs: 'int', bytes: 'int'},
        'An HTTPS request completed'),
    'http.failed': event('warn', {host: 'host', method: choice(METHODS), cause: choice(HTTP_FAILURES), durationMs: 'int'},
        'An HTTPS request failed before a reply was read'),
    'http.rejected': event('error', {cause: choice(REJECTIONS)},
        'A request was refused before it was sent (address or header not allowed)'),
    'http.redirect_refused': event('warn', {host: 'host', status: 'int'}, 'A redirect was refused'),

    'provider.fetch_started': event('debug', {provider: 'provider', attempt: 'int', trigger: choice(TRIGGERS)},
        'A provider fetch started'),
    'provider.fetch_succeeded': event('debug', {provider: 'provider', durationMs: 'int', count: 'int'},
        'A provider fetch succeeded'),
    'provider.fetch_failed': event('warn', {provider: 'provider', code: choice(ERROR_CODES), reason: choice(REASONS),
        failures: 'int', durationMs: 'int', delayMs: 'int'}, 'A provider fetch failed'),
    'provider.paused': event('warn', {provider: 'provider', reason: choice(REASONS)},
        'Polling paused until the user acts'),
    'provider.superseded': event('debug', {provider: 'provider'}, 'A fetch result was discarded as out of date'),
    'provider.problem': event('warn', {provider: 'provider', count: 'int'},
        'A provider returned data that was partly unusable'),
    'scheduler.unexpected': event('error', {provider: 'provider', errorName: choice(ERROR_NAMES)},
        'The scheduler hit an unexpected error'),
    'scheduler.listener_failed': event('error', {errorName: choice(ERROR_NAMES)}, 'A snapshot listener threw'),

    'keyring.failed': event('warn', {op: choice(KEYRING_OPS), cause: choice(KEYRING_CAUSES)},
        'A keyring operation failed'),

    'oauth.refresh_failed': event('warn', {provider: 'provider', cause: choice(TOKEN_FAILURES)},
        'A token renewal failed'),
    'oauth.loopback_failed': event('warn', {cause: choice(LOOPBACK_CAUSES)}, 'The local sign-in listener failed'),
    'oauth.browser_failed': event('warn', {provider: 'provider'}, 'The browser could not be opened'),

    'ext.enabled': event('info', {count: 'int'}, 'The extension was enabled'),
    'ext.disabled': event('info', {}, 'The extension was disabled'),
    'ext.start_failed': event('error', {phase: choice(PHASES), errorName: choice(ERROR_NAMES)}, 'A part of the extension could not start'),
    'ext.rebuild_failed': event('error', {phase: choice(PHASES), errorName: choice(ERROR_NAMES)}, 'A part of the extension could not be rebuilt'),
    'ext.registry_unavailable': event('warn', {}, 'The connector registry could not be read'),

    'listener.failed': event('error', {phase: choice(PHASES), errorName: choice(ERROR_NAMES)}, 'A change listener threw'),
    'file.failed': event('warn', {phase: choice(['cache', 'alerts', 'themes', 'config', 'state']), cause: choice(FILE_CAUSES)},
        'A local file could not be read or written'),
    'theme.rejected': event('warn', {cause: choice(THEME_CAUSES)}, 'A theme was not usable'),
    'fonts.failed': event('warn', {step: choice(FONT_STEPS)}, 'A font step failed'),
    'alert.failed': event('error', {phase: choice(['notify', 'check', 'state']), errorName: choice(ERROR_NAMES)}, 'An alert could not be raised'),
    'power.failed': event('warn', {phase: choice(['watch', 'handler']), errorName: choice(ERROR_NAMES)}, 'Suspend and resume could not be observed'),
    'ui.draw_failed': event('error', {phase: choice(['bar', 'card']), errorName: choice(ERROR_NAMES)}, 'An item could not be drawn'),
});

/** The accepted values of one field, as a validator function. */
export function validatorFor(type) {
    return typeof type === 'function' ? type : TYPES[type];
}
