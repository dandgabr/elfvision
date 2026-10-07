// The words of the notifications (docs/adr/0010). An event carries no text; this module builds
// it from fixed, translated templates, using the same words as the pills and cards. Nothing a
// provider sent is ever printed: the name comes from the registry by id, the window from a table
// and the numbers are checked first. Pure JavaScript, tested under `gjs -m`.

import {formatDuration, formatPercent} from './format.js';
import {IDENTITY_T, fmt, windowLabel} from './viewmodel.js';

/**
 * @param {object} event - from `evaluate` in alerts.js
 * @param {object} context
 * @param {(id: string) => string|null} context.providerName - the registry's name for an id
 * @param {object} [context.t] - gettext, ngettext and pgettext
 * @param {number} [context.now] - ms since the epoch
 * @param {'long'|'short'} [context.resetStyle]
 * @returns {{title: string, body: string}}
 */
export function alertText(event, {providerName, t = IDENTITY_T, now = Date.now(), resetStyle = 'long'}) {
    if (event.kind === 'summary') {
        return {
            title: safe(t.gettext('Several quotas need attention')),
            body: safe(t.gettext('Open the panel to see which.')),
        };
    }
    if (event.kind === 'test') {
        return {
            title: safe(t.gettext('Test notification')),
            body: safe(t.gettext('If you can read this, notifications work. With Do Not Disturb on, the banner is held and this waits in the list.')),
        };
    }
    const name = safe(providerName(event.providerId) ?? t.gettext('A provider'), 40);
    let text;
    switch (event.kind) {
    case 'threshold':
        text = thresholdText(event, name, t, now, resetStyle);
        break;
    case 'connection':
        text = connectionText(event, name, t);
        break;
    default:
        text = {title: t.gettext('Quota alert'), body: ''};
    }
    return {title: safe(text.title, 120), body: safe(text.body, 400)};
}

// Controls and the invisible characters that reorder text (the bidirectional overrides and
// isolates, the left/right marks) have no business in a notification, whoever wrote the string
// (a registry name today, possibly a catalog entry). Markup is not interpreted: the notifier turns
// it off, so what is left is shown as typed.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function safe(text, max = 400) {
    return String(text).replace(UNSAFE, '').slice(0, max);
}

function percentText(value) {
    return formatPercent(value);   // a whole number kept within 0 and 100, 0 for a bad value
}

function thresholdText(event, name, t, now, resetStyle) {
    const crossings = Array.isArray(event.crossings) ? event.crossings : [];
    const worst = Math.max(0, ...crossings.map(c => (Number.isFinite(c.percent) ? c.percent : 0)));
    const title = fmt(event.level === 'critical' ? t.gettext('Critical: %s at %s%%') : t.gettext('Warning: %s at %s%%'),
        name, percentText(worst));
    const body = crossings.map(crossing => {
        const label = crossing.type === 'credits' ? t.gettext('Credits') : windowLabel(crossing.window, t);
        if (crossing.type === 'credits')
            return fmt(t.gettext('%s: %s%% of the budget used.'), label, percentText(crossing.percent));
        const used = fmt(t.gettext('%s: %s%% used.'), label, percentText(crossing.percent));
        const left = crossing.resetsAt - now;
        return Number.isFinite(left) && left > 0
            ? `${used} ${fmt(t.gettext('Resets in %s.'), formatDuration(left, resetStyle))}`
            : used;
    }).join('\n');
    return {title, body};
}

function connectionText(event, name, t) {
    if (event.cause === 'auth') {
        return {
            title: fmt(t.gettext('%s: reconnect the account'), name),
            body: t.gettext('The sign-in expired or was refused. Reconnect it in Preferences.'),
        };
    }
    return {
        title: fmt(t.gettext('%s: no recent data'), name),
        body: t.gettext('The last successful check was a while ago. The service may be down, or your connection.'),
    };
}
