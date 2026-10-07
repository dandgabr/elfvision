// Turns ProviderSnapshots into plain view models for the panel items and the
// popup cards. No GObject imports: the UI layer only paints what is computed
// here, and the tests exercise this file directly under `gjs -m`.

import {displayState, mostCriticalMetric, severityOf} from './severity.js';
import {formatClock, formatDuration, formatMoney, formatPercent} from './format.js';
import {aheadOfPace, expectedPercent} from './pacing.js';

/** Translation functions used when none are injected (tests, fallbacks). */
export const IDENTITY_T = {
    gettext: s => s,
    ngettext: (singular, plural, n) => (n === 1 ? singular : plural),
    pgettext: (_context, s) => s,
};

/**
 * Minimal printf: `%s` and `%d` take the next argument, `%%` is a percent sign.
 * Named placeholders keep sentences translatable as a whole.
 *
 * @param {string} template
 * @param {...*} args
 * @returns {string}
 */
export function fmt(template, ...args) {
    let i = 0;
    return template.replace(/%%|%[sd]/g, token => (token === '%%' ? '%' : String(args[i++])));
}

const CSS_STATE = {
    ok: 'gaq-ok',
    warning: 'gaq-warning',
    critical: 'gaq-critical',
    stale: 'gaq-stale',
    auth: 'gaq-auth',
    error: 'gaq-error',
};

function windowLabel(window, t) {
    switch (window) {
    case 'session': return t.gettext('5 hours');
    case 'week': return t.gettext('Week');
    case 'month': return t.gettext('Month');
    default: return '';
    }
}

function windowSuffix(window, t) {
    switch (window) {
    case 'session': return '5h';
    case 'week': return t.pgettext('window suffix', 'W');
    case 'month': return t.pgettext('window suffix', 'M');
    default: return '';
    }
}

function metricSuffix(metric, t) {
    const base = windowSuffix(metric.window, t);
    return metric.pool?.short ? `${metric.pool.short} ${base}` : base;
}

function heroNumber(snapshot, metric, state, ctx) {
    if (state === 'auth' || !metric)
        return '–';
    // The last known value of a stale or failing provider is marked as approximate.
    const prefix = state === 'stale' || state === 'error' ? '~' : '';
    if (metric?.kind === 'money')
        return prefix + formatMoney(metric.balance, metric.currency, ctx.locale);
    return prefix + formatPercent(metric?.percentUsed ?? 0);
}

/**
 * View model of one item on the top bar.
 *
 * @param {object} snapshot
 * @param {{t?: object, nowMs?: number, locale?: string, limits?: object}} [ctx]
 * @returns {object}
 */
export function barView(snapshot, ctx = {}) {
    const t = ctx.t ?? IDENTITY_T;
    const state = displayState(snapshot, ctx.limits);
    const metric = mostCriticalMetric(snapshot.metrics);
    const isMoney = metric?.kind === 'money';
    const number = heroNumber(snapshot, metric, state, ctx);

    let glyph = null;
    if (state === 'warning')
        glyph = {text: '▲'};
    else if (state === 'critical')
        glyph = {text: '!'};
    else if (state === 'auth')
        glyph = {icon: 'dialog-password-symbolic'};
    else if (state === 'error')
        glyph = {icon: 'dialog-warning-symbolic'};

    let accessibleName;
    if (state === 'auth')
        accessibleName = fmt({
            no_key: t.gettext('%s: no API key'),
            rejected: t.gettext('%s: key rejected'),
            expired: t.gettext('%s: sign-in expired'),
            refused: t.gettext('%s: access refused'),
            no_config: t.gettext('%s: setup needed'),
        }[snapshot.reason] ?? t.gettext('%s: not connected'), snapshot.name);
    else if (state === 'error' && snapshot.state === 'rate_limited')
        accessibleName = fmt(t.gettext('%s: rate limited'), snapshot.name);
    else if (state === 'error' && snapshot.state === 'network')
        accessibleName = fmt(t.gettext('%s: no connection'), snapshot.name);
    else if (state === 'error')
        accessibleName = fmt(t.gettext('%s: service problem'), snapshot.name);
    else if (state === 'stale')
        accessibleName = fmt(t.gettext('%s: data out of date'), snapshot.name);
    else if (isMoney)
        accessibleName = fmt(t.gettext('%s: %s left'), snapshot.name, number);
    else if (!metric)
        accessibleName = snapshot.name;
    else {
        accessibleName = metric.pool
            ? fmt(t.gettext('%s: %s%% of %s used (%s)'), snapshot.name, number,
                windowLabel(metric.window, t).toLowerCase(), metric.pool.name)
            : fmt(t.gettext('%s: %s%% of %s used'), snapshot.name,
                number, windowLabel(metric.window, t).toLowerCase());
        if (state === 'critical')
            accessibleName += `, ${t.gettext('critical')}`;
        else if (state === 'warning')
            accessibleName += `, ${t.gettext('warning')}`;
    }

    return {
        id: snapshot.id,
        name: snapshot.name,
        state,
        cssClass: CSS_STATE[state],
        number,
        showPercent: Boolean(metric) && !isMoney && state !== 'auth',
        suffix: metric && !isMoney && state !== 'auth' ? metricSuffix(metric, t) : '',
        glyph,
        percent: state === 'auth' ? 0 : (metric?.percentUsed ?? 0),
        accessibleName,
    };
}

function pillFor(state, snapshot, ctx, t) {
    switch (state) {
    case 'critical': return {text: `! ${t.gettext('Critical')}`, cssClass: 'gaq-pill-critical'};
    case 'warning': return {text: `▲ ${t.gettext('Warning')}`, cssClass: 'gaq-pill-warning'};
    case 'auth': {
        const text = {
            no_key: t.gettext('No key'),
            rejected: t.gettext('Key rejected'),
            expired: t.gettext('Sign-in expired'),
            refused: t.gettext('Access refused'),
            no_config: t.gettext('Setup needed'),
        }[snapshot.reason] ?? t.gettext('Not connected');
        return {text: `⊘ ${text}`, cssClass: 'gaq-pill-muted'};
    }
    case 'error': {
        const text = {
            network: snapshot.reason === 'keyring' ? t.gettext('Keyring locked') : t.gettext('No connection'),
            rate_limited: t.gettext('Rate limited'),
            parse_error: t.gettext('Unexpected reply'),
            provider_changed: t.gettext('Service changed'),
        }[snapshot.state] ?? t.gettext('No connection');
        return {text: `⚠ ${text}`, cssClass: 'gaq-pill-error'};
    }
    case 'stale': {
        const fetchedAt = snapshot.source?.fetchedAt;
        const text = Number.isFinite(fetchedAt)
            ? fmt(t.gettext('%s ago'), formatDuration((ctx.nowMs ?? Date.now()) - fetchedAt))
            : t.gettext('Out of date');
        return {text, cssClass: 'gaq-pill-muted'};
    }
    default: return null;
    }
}

/**
 * What to tell the user about a failure, and when the next attempt happens.
 * The "retry" line is separate from the message so neither is built by
 * concatenation (ADR 0007).
 */
function failureTexts(snapshot, hasValue, ctx, t) {
    const nowMs = ctx.nowMs ?? Date.now();
    const fetchedAt = snapshot.source?.fetchedAt;
    const age = Number.isFinite(fetchedAt) ? formatDuration(nowMs - fetchedAt) : null;
    let message;
    switch (snapshot.state) {
    case 'auth_required':
        message = {
            no_key: t.gettext('No API key yet. Paste one in Preferences.'),
            rejected: t.gettext('The server rejected this key. Check it or paste a new one in Preferences.'),
            expired: fmt(t.gettext('Your %s sign-in expired or was revoked. Connect again to keep seeing this quota.'), snapshot.name),
            refused: fmt(t.gettext('%s refused access. Check your account on its site.'), snapshot.name),
            no_config: fmt(t.gettext('The client id for %s is missing. Add it to providers.local.json, then connect.'), snapshot.name),
        }[snapshot.reason] ?? t.gettext('Open Preferences to connect this account.');
        break;
    case 'rate_limited':
        message = t.gettext('Too many requests.');
        break;
    case 'parse_error':
        message = hasValue
            ? t.gettext('The service replied in an unexpected way. Showing the last value.')
            : t.gettext('The service replied in an unexpected way.');
        break;
    case 'provider_changed':
        message = t.gettext('The service seems to have changed. This connector needs an update.');
        break;
    default:
        if (snapshot.reason === 'keyring') {
            message = t.gettext("Can't read the keyring. Unlock it, then try again.");
            break;
        }
        message = hasValue && age
            ? fmt(t.gettext("Can't reach the service. Showing the last value, from %s ago."), age)
            : t.gettext("Couldn't get the data yet.");
    }
    let retry = null;
    if (snapshot.state !== 'auth_required') {
        retry = Number.isFinite(snapshot.nextRetryAt)
            ? fmt(t.gettext('Retrying in %s.'), formatDuration(Math.max(0, snapshot.nextRetryAt - nowMs)))
            : t.gettext('Retrying soon.');
    }
    return {message, retry};
}

function sameCalendarDay(aMs, bMs) {
    return new Date(aMs).toDateString() === new Date(bMs).toDateString();
}

function rowFor(metric, ctx, t, neutral = false) {
    const nowMs = ctx.nowMs ?? Date.now();
    if (metric.kind === 'money') {
        // A balance next to percent windows: a plain line, no meter. Without a
        // budget there is nothing to measure it against.
        return {
            id: metric.id,
            label: t.gettext('Balance'),
            percent: 0,
            percentText: '',
            valueText: fmt(t.gettext('%s left'), formatMoney(metric.balance, metric.currency, ctx.locale)),
            mark: '',
            cssClass: neutral ? 'gaq-stale' : 'gaq-ok',
            resetText: '',
            absoluteText: '',
            pace: null,
            paceTip: null,
            noMeter: true,
        };
    }
    const severity = neutral ? 'ok' : severityOf(metric.percentUsed, ctx.limits);
    const hasReset = Number.isFinite(metric.resetsAt);
    const expected = hasReset ? expectedPercent(metric.windowSecs, metric.resetsAt, nowMs) : null;
    const percentText = formatPercent(metric.percentUsed);
    return {
        id: metric.id,
        label: windowLabel(metric.window, t),
        percent: metric.percentUsed,
        percentText,
        valueText: fmt(t.gettext('%s%% used'), percentText),
        mark: severity === 'critical' ? '! ' : severity === 'warning' ? '▲ ' : '',
        // An old or failing value is drawn neutral: it must not look like a live alert.
        cssClass: neutral ? 'gaq-stale' : CSS_STATE[severity],
        resetText: hasReset ? fmt(t.gettext('resets in %s'), formatDuration(metric.resetsAt - nowMs, ctx.resetStyle)) : '',
        absoluteText: hasReset
            ? formatClock(new Date(metric.resetsAt), {
                hour12: ctx.hour12 ?? false,
                weekday: !sameCalendarDay(metric.resetsAt, nowMs),
                locale: ctx.locale,
            })
            : '',
        pace: expected,
        paceTip: expected === null ? null : fmt(t.gettext('Expected by now: %s%%'), formatPercent(expected)),
    };
}

/**
 * View model of one popup card.
 *
 * @param {object} snapshot
 * @param {{t?: object, nowMs?: number, locale?: string, hour12?: boolean, limits?: object}} [ctx]
 * @returns {object}
 */
export function cardView(snapshot, ctx = {}) {
    const t = ctx.t ?? IDENTITY_T;
    const state = displayState(snapshot, ctx.limits);
    const metric = mostCriticalMetric(snapshot.metrics);
    const isMoney = metric?.kind === 'money';

    const view = {
        id: snapshot.id,
        name: snapshot.name,
        plan: snapshot.plan ?? '',
        state,
        cssClass: CSS_STATE[state],
        pill: pillFor(state, snapshot, ctx, t),
        heroText: heroNumber(snapshot, metric, state, ctx),
        heroSmall: state === 'auth' || !metric ? '' : (isMoney
            ? ` ${t.gettext('left')}`
            // A provider with pools says which one the number is about.
            : `% · ${metric.pool ? `${metric.pool.name} · ` : ''}${windowLabel(metric.window, t).toLowerCase()}`),
        percent: state === 'auth' ? 0 : (metric?.percentUsed ?? 0),
        groups: [],
        money: null,
        paceText: null,
        message: null,
        retryText: null,
        canRetry: false,
        canConfigure: false,
        configureText: '',
    };

    if (state === 'auth') {
        view.message = failureTexts(snapshot, false, ctx, t).message;
        view.canConfigure = ctx.configurable !== false;
        view.configureText = {
            no_key: t.gettext('Add key'),
            rejected: t.gettext('Replace key'),
            expired: t.gettext('Reconnect'),
        }[snapshot.reason] ?? t.gettext('Open Preferences');
        return view;
    }

    if (state === 'error') {
        const texts = failureTexts(snapshot, Boolean(metric), ctx, t);
        view.message = texts.message;
        view.retryText = texts.retry;
        view.canRetry = ['network', 'parse_error', 'provider_changed'].includes(snapshot.state);
    }

    if (!metric) {
        if (state !== 'error') {
            view.message = snapshot.expired
                ? t.gettext('The last data is more than a day old.')
                : t.gettext('No quota data yet.');
        }
        return view;
    }

    if (isMoney) {
        const spent = metric.budget - metric.balance;
        view.money = {
            percent: metric.percentUsed,
            spentLabel: t.gettext('Budget spent'),
            spentText: formatMoney(spent, metric.currency, ctx.locale),
            ofText: fmt(t.gettext('of %s · %s%%'),
                formatMoney(metric.budget, metric.currency, ctx.locale), formatPercent(metric.percentUsed)),
            note: t.gettext('No reset: prepaid balance'),
        };
        return view;
    }

    // Group the rows by pool, keeping the order of the metrics.
    const byPool = new Map();
    for (const m of snapshot.metrics) {
        const key = m.pool?.id ?? '';
        if (!byPool.has(key))
            byPool.set(key, {title: m.pool?.name ?? null, metrics: []});
        byPool.get(key).metrics.push(m);
    }
    for (const group of byPool.values()) {
        const top = Math.max(...group.metrics.map(m => m.percentUsed));
        view.groups.push({
            title: group.title,
            topText: formatPercent(top),
            rows: group.metrics.map(m => ({...rowFor(m, ctx, t, state === 'error' || state === 'stale'), poolTitle: group.title ?? ''})),
        });
    }

    const ahead = Number.isFinite(metric.resetsAt)
        ? aheadOfPace(metric.percentUsed, expectedPercent(metric.windowSecs, metric.resetsAt, ctx.nowMs ?? Date.now()))
        : null;
    if (ahead !== null) {
        view.paceText = fmt(t.ngettext('%s: %d point ahead of an even pace',
            '%s: %d points ahead of an even pace', ahead),
        metric.pool ? `${metric.pool.name}, ${windowLabel(metric.window, t).toLowerCase()}` : windowLabel(metric.window, t), ahead);
    }

    if (state === 'stale')
        view.message = t.gettext('Data is out of date.');
    return view;
}

/**
 * One-line health summary at the top of the popup.
 *
 * @param {object[]} snapshots
 * @param {{t?: object, limits?: object}} [ctx]
 * @returns {string}
 */
export function summaryText(snapshots, ctx = {}) {
    const t = ctx.t ?? IDENTITY_T;
    const counts = {ok: 0, warning: 0, critical: 0, signedOut: 0, problem: 0};
    for (const snapshot of snapshots) {
        const state = displayState(snapshot, ctx.limits);
        if (state === 'ok')
            counts.ok++;
        else if (state === 'warning' || state === 'critical')
            counts[state]++;
        else if (state === 'auth')
            counts.signedOut++;
        else
            counts.problem++;
    }
    return [
        counts.ok ? fmt(t.gettext('%d ok'), counts.ok) : '',
        counts.warning ? fmt(t.gettext('%d warning'), counts.warning) : '',
        counts.critical ? fmt(t.ngettext('%d critical', '%d critical', counts.critical), counts.critical) : '',
        counts.signedOut ? fmt(t.gettext('%d not connected'), counts.signedOut) : '',
        counts.problem ? fmt(t.gettext('%d with a problem'), counts.problem) : '',
    ].filter(Boolean).join(' · ');
}

/**
 * @param {number} ageMs - time since the last refresh
 * @param {{t?: object}} [ctx]
 * @returns {string}
 */
export function updatedText(ageMs, ctx = {}) {
    const t = ctx.t ?? IDENTITY_T;
    const minutes = Math.floor(ageMs / 60000);
    return minutes < 1 ? t.gettext('Updated just now') : fmt(t.gettext('Updated %d min ago'), minutes);
}

/**
 * Footer line: how long ago the data was refreshed, and how many providers
 * are in trouble (a fresh timestamp alone would hide a failing provider).
 *
 * @param {number|null} ageMs - time since the last successful fetch, or null if never
 * @param {number} problems - providers that are signed out, failing or stale
 * @param {{t?: object}} [ctx]
 * @returns {string}
 */
export function footerText(ageMs, problems, ctx = {}) {
    const t = ctx.t ?? IDENTITY_T;
    if (ageMs === null)
        return t.gettext('Not updated yet');
    const base = updatedText(ageMs, ctx);
    return problems > 0
        ? fmt(t.ngettext('%s · %d with a problem', '%s · %d with problems', problems), base, problems)
        : base;
}

/**
 * @param {object[]} snapshots
 * @param {object} [limits]
 * @returns {number} providers that are not in a normal state
 */
export function problemCount(snapshots, limits) {
    return snapshots.filter(s => ['auth', 'error', 'stale'].includes(displayState(s, limits))).length;
}
