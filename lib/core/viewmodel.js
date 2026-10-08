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
 * Minimal printf: `%s`, `%d` and `%02d` take the next argument, `%%` is a percent sign.
 * Named placeholders keep sentences translatable as a whole.
 *
 * @param {string} template
 * @param {...*} args
 * @returns {string}
 */
export function fmt(template, ...args) {
    let i = 0;
    return template.replace(/%%|%02d|%[sd]/g, token => {
        if (token === '%%')
            return '%';
        const value = String(args[i++]);
        return token === '%02d' ? value.padStart(2, '0') : value;
    });
}

/**
 * The marks the bar and the cards use for a state. The legend is built from this same table, so a
 * mark cannot change in one place and be explained wrongly in the other.
 */
export const SYMBOLS = {
    warning: '▲',
    critical: '!',
    approximate: '~',
    auth: {icon: 'dialog-password-symbolic', pill: '⊘'},
    error: {icon: 'dialog-warning-symbolic', pill: '⚠'},
};

const CSS_STATE = {
    ok: 'gaq-ok',
    warning: 'gaq-warning',
    critical: 'gaq-critical',
    stale: 'gaq-stale',
    auth: 'gaq-auth',
    error: 'gaq-error',
};

export function windowLabel(window, t) {
    switch (window) {
    case 'session': return t.gettext('5 hours');
    case 'day': return t.gettext('Day');
    case 'week': return t.gettext('Week');
    case 'month': return t.gettext('Month');
    default: return '';
    }
}

function windowSuffix(window, t) {
    switch (window) {
    case 'session': return '5h';
    case 'day': return t.pgettext('window suffix', 'D');
    case 'week': return t.pgettext('window suffix', 'W');
    case 'month': return t.pgettext('window suffix', 'M');
    default: return '';
    }
}

function metricSuffix(metric, t) {
    const base = windowSuffix(metric.window, t);
    return metric.pool?.short ? `${metric.pool.short} ${base}` : base;
}

function fullMoney(amount, currency, locale) {
    if (!Number.isFinite(amount))
        return '–';
    try {
        return new Intl.NumberFormat(locale, {style: 'currency', currency}).format(amount);
    } catch (_error) {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

function spendLabel(metric, t) {
    return metric.window === 'month' ? t.gettext('Month spend') : t.gettext('Spend');
}

function heroNumber(snapshot, metric, state, ctx) {
    if (state === 'auth' || !metric)
        return '–';
    // The last known value of a stale or failing provider is marked as approximate.
    const prefix = state === 'stale' || state === 'error' ? SYMBOLS.approximate : '';
    if (metric?.kind === 'spend')
        return prefix + fullMoney(metric.amount, metric.currency, ctx.locale);
    if (metric?.kind === 'money')
        return prefix + (metric.basis === 'allowance' ? fullMoney : formatMoney)(metric.balance, metric.currency, ctx.locale);
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
    const isSpend = metric?.kind === 'spend';
    const monetary = isMoney || isSpend;
    const number = heroNumber(snapshot, metric, state, ctx);

    let glyph = null;
    if (state === 'warning')
        glyph = {text: SYMBOLS.warning};
    else if (state === 'critical')
        glyph = {text: SYMBOLS.critical};
    else if (state === 'auth')
        glyph = {icon: SYMBOLS.auth.icon};
    else if (state === 'error')
        glyph = {icon: SYMBOLS.error.icon};

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
    else if (isSpend)
        accessibleName = fmt(t.gettext('%s: %s, %s'), snapshot.name, number, spendLabel(metric, t).toLowerCase());
    else if (isMoney)
        accessibleName = metric.basis === 'allowance'
            ? fmt(t.gettext('%s: %s key allowance left'), snapshot.name, number)
            : fmt(t.gettext('%s: %s left'), snapshot.name, number);
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

    // The tooltip repeats what the item says and adds when the quota resets; it never carries
    // anything the bar or the popup do not. Its first line is written here, the countdown when it is
    // shown (see barTooltip), so it is not minutes old.
    let tooltipHead = accessibleName;
    if (metric && !monetary && state !== 'auth' && state !== 'error' && state !== 'stale') {
        const level = state === 'critical' ? ` (${t.gettext('critical')})` : state === 'warning' ? ` (${t.gettext('warning')})` : '';
        tooltipHead = `${fmt(t.gettext('%s · %s · %s%% used'), snapshot.name, windowLabel(metric.window, t), number)}${level}`;
    }
    const resetsAt = metric && (!isMoney || metric.basis === 'allowance') && state !== 'auth' && Number.isFinite(metric.resetsAt) ? metric.resetsAt : null;

    return {
        id: snapshot.id,
        name: snapshot.name,
        state,
        cssClass: CSS_STATE[state],
        tooltipHead,
        resetsAt,
        number,
        showPercent: Boolean(metric) && !monetary && state !== 'auth',
        suffix: metric && !monetary && state !== 'auth' ? metricSuffix(metric, t) : '',
        glyph,
        percent: state === 'auth' ? 0 : (metric ? metric.percentUsed : null),
        accessibleName,
    };
}

function pillFor(state, snapshot, ctx, t) {
    switch (state) {
    case 'critical': return {text: `${SYMBOLS.critical} ${t.gettext('Critical')}`, cssClass: 'gaq-pill-critical'};
    case 'warning': return {text: `${SYMBOLS.warning} ${t.gettext('Warning')}`, cssClass: 'gaq-pill-warning'};
    case 'auth': {
        const text = {
            no_key: t.gettext('No key'),
            rejected: t.gettext('Key rejected'),
            expired: t.gettext('Sign-in expired'),
            refused: t.gettext('Access refused'),
            no_config: t.gettext('Setup needed'),
        }[snapshot.reason] ?? t.gettext('Not connected');
        return {text: `${SYMBOLS.auth.pill} ${text}`, cssClass: 'gaq-pill-muted'};
    }
    case 'error': {
        const text = {
            network: snapshot.reason === 'keyring' ? t.gettext('Keyring locked') : t.gettext('No connection'),
            rate_limited: t.gettext('Rate limited'),
            parse_error: t.gettext('Unexpected reply'),
            provider_changed: t.gettext('Service changed'),
        }[snapshot.state] ?? t.gettext('No connection');
        return {text: `${SYMBOLS.error.pill} ${text}`, cssClass: 'gaq-pill-error'};
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
            no_config: fmt(t.gettext('%s is not set up yet. Open Preferences and follow the steps for this account.'), snapshot.name),
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
        message = t.gettext('The service seems to have changed. This extension needs an update.');
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
    if (metric.kind === 'money' || metric.kind === 'spend') {
        const isSpend = metric.kind === 'spend';
        const allowance = metric.basis === 'allowance';
        // A balance next to percent windows: a plain line, no meter. Without a
        // budget there is nothing to measure it against.
        return {
            id: metric.id,
            label: isSpend ? spendLabel(metric, t) : allowance ? t.gettext('Key allowance left') : t.gettext('Balance'),
            percent: metric.percentUsed,
            percentText: '',
            valueText: isSpend ? fullMoney(metric.amount, metric.currency, ctx.locale)
                : fmt(t.gettext('%s left'), (allowance ? fullMoney : formatMoney)(metric.balance, metric.currency, ctx.locale)),
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
        mark: severity === 'critical' ? `${SYMBOLS.critical} ` : severity === 'warning' ? `${SYMBOLS.warning} ` : '',
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
    const isSpend = metric?.kind === 'spend';
    const monetary = isMoney || isSpend;

    const view = {
        id: snapshot.id,
        name: snapshot.name,
        plan: snapshot.plan ?? '',
        state,
        cssClass: CSS_STATE[state],
        pill: pillFor(state, snapshot, ctx, t),
        heroText: heroNumber(snapshot, metric, state, ctx),
        heroSmall: state === 'auth' || !metric ? '' : (isSpend ? spendLabel(metric, t) : isMoney
            ? (metric.basis === 'allowance' ? t.gettext('Key allowance left') : ` ${t.gettext('left')}`)
            // A provider with pools says which one the number is about.
            : `% · ${metric.pool ? `${metric.pool.name} · ` : ''}${windowLabel(metric.window, t).toLowerCase()}`),
        percent: state === 'auth' ? 0 : (metric ? metric.percentUsed : null),
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
        if (snapshot.quotaAvailability === 'unsupported') {
            view.canConfigure = ctx.configurable !== false;
            view.configureText = t.gettext('Open Preferences');
        }
        if (state !== 'error') {
            view.message = snapshot.expired
                ? t.gettext('The last data is more than a day old.')
                : snapshot.quotaAvailability === 'unsupported'
                    ? t.gettext('Quota data is unavailable through the public API. Open the provider dashboard for details.')
                    : t.gettext('No quota data yet.');
        }
        return view;
    }

    if (monetary) {
        const hasCap = Number.isFinite(metric.percentUsed);
        const allowance = metric.basis === 'allowance';
        const cap = isSpend ? metric.limit : metric.budget;
        const value = isSpend ? metric.amount : hasCap ? metric.budget - metric.balance : metric.balance;
        const moneyFormat = isSpend || allowance ? fullMoney : formatMoney;
        let note = isSpend ? t.gettext('Reported spend')
            : allowance ? t.gettext('Remaining key allowance') : t.gettext('No reset: prepaid balance');
        if ((isSpend || allowance) && Number.isFinite(metric.resetsAt))
            note += ` · ${fmt(t.gettext('resets in %s'), formatDuration(metric.resetsAt - (ctx.nowMs ?? Date.now()), ctx.resetStyle))}`;
        view.money = {
            percent: metric.percentUsed,
            spentLabel: isSpend ? spendLabel(metric, t) : hasCap ? t.gettext('Budget spent')
                : allowance ? t.gettext('Key allowance left') : t.gettext('Balance'),
            spentText: moneyFormat(value, metric.currency, ctx.locale),
            ofText: hasCap ? fmt(t.gettext('of %s · %s%%'),
                moneyFormat(cap, metric.currency, ctx.locale), formatPercent(metric.percentUsed)) : '',
            note,
        };
        if (state === 'stale')
            view.message = t.gettext('Data is out of date.');
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
        const top = Math.max(0, ...group.metrics.map(m => m.percentUsed).filter(Number.isFinite));
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
        counts.warning ? fmt(t.ngettext('%d warning', '%d warnings', counts.warning), counts.warning) : '',
        counts.critical ? fmt(t.ngettext('%d critical', '%d critical', counts.critical), counts.critical) : '',
        counts.signedOut ? fmt(t.ngettext('%d not connected', '%d not connected', counts.signedOut), counts.signedOut) : '',
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

/**
 * The text of a bar item's tooltip, made when it is shown: the item's own words, and when it resets.
 *
 * @param {object} view - a barView() result
 * @param {{t?: object, nowMs?: number, resetStyle?: string}} [ctx]
 * @returns {string}
 */
export function barTooltip(view, ctx = {}) {
    const t = ctx.t ?? IDENTITY_T;
    const left = Number.isFinite(view.resetsAt) ? view.resetsAt - (ctx.nowMs ?? Date.now()) : NaN;
    return left > 0
        ? `${view.tooltipHead}\n${fmt(t.gettext('Resets in %s'), formatDuration(left, ctx.resetStyle))}`
        : view.tooltipHead;
}

/**
 * The explanation of every mark on the bar, for the legend of the popup. It is built from the same
 * table the bar is, so the two cannot drift apart.
 *
 * @param {object} [t] - gettext functions
 * @returns {Array<{glyph?: string, icon?: string, cssClass: string, title: string, description: string}>}
 */
export function legendRows(t = IDENTITY_T) {
    return [
        {glyph: SYMBOLS.critical, cssClass: 'gaq-pill-critical', title: t.gettext('Critical'),
            description: t.gettext('The quota is nearly used up.')},
        {glyph: SYMBOLS.warning, cssClass: 'gaq-pill-warning', title: t.gettext('Warning'),
            description: t.gettext('The quota is getting high.')},
        {glyph: SYMBOLS.approximate, cssClass: 'gaq-pill-muted', title: t.gettext('Approximate'),
            description: t.gettext('The last known value; the service could not be reached just now.')},
        {icon: SYMBOLS.auth.icon, cssClass: 'gaq-pill-muted', title: t.gettext('Not connected'),
            description: t.gettext('Sign in again, or add a key, in Preferences.')},
        {icon: SYMBOLS.error.icon, cssClass: 'gaq-pill-error', title: t.gettext('Problem'),
            description: t.gettext('The service could not be reached or replied in an unexpected way.')},
        {glyph: '|', cssClass: 'gaq-pill-muted', title: t.gettext('Pace'),
            description: t.gettext('The mark on a bar is where the usage would be if it were spread evenly until the reset.')},
    ];
}

/**
 * The providers the user stopped tracking, in the registry's order. Ids that are not providers
 * (an old or edited setting) are left out.
 *
 * @param {string[]} untrackedIds - the `untracked-providers` setting
 * @param {Array<{id: string, name: string}>} providers - the registry, in display order
 * @returns {Array<{id: string, name: string}>}
 */
export function untrackedProviders(untrackedIds, providers) {
    const ids = new Set(Array.isArray(untrackedIds) ? untrackedIds : []);
    return providers.filter(provider => ids.has(provider.id)).map(({id, name}) => ({id, name}));
}
