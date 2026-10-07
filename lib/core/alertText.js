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
    const name = providerName(event.providerId) ?? t.gettext('A provider');
    switch (event.kind) {
    case 'threshold':
        return thresholdText(event, name, t, now, resetStyle);
    case 'connection':
        return connectionText(event, name, t);
    case 'summary':
        return {
            title: t.gettext('Several quotas are almost used'),
            body: t.gettext('Open the panel to see them.'),
        };
    default:
        return {title: t.gettext('Quota alert'), body: ''};
    }
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
            title: fmt(t.gettext('%s: sign in again'), name),
            body: t.gettext('The sign-in expired or was refused. Open the preferences to connect it again.'),
        };
    }
    return {
        title: fmt(t.gettext('%s: no recent data'), name),
        body: t.gettext('The last successful check was a while ago. The service may be unreachable.'),
    };
}
