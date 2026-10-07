import {assertEqual, assertTrue, test} from './harness.js';
import {CRIT_AT, WARN_AT, displayState, mostCriticalMetric, rankOf, severityOf} from '../lib/core/severity.js';
import {formatClock, formatDuration, formatMoney, formatPercent} from '../lib/core/format.js';
import {aheadOfPace, expectedPercent} from '../lib/core/pacing.js';
import {selectForBar} from '../lib/core/selection.js';
import {demoSnapshots} from '../lib/core/fixtures.js';
import {candidateLayouts, chooseLayout, chooseStickyLayout, sideWidth} from '../lib/core/fit.js';
import {SYMBOLS, barTooltip, barView, cardView, fmt, footerText, legendRows, problemCount, summaryText, untrackedProviders, updatedText} from '../lib/core/viewmodel.js';
import {oauthSubtitle} from '../lib/prefs/accountText.js';

const NOW = Date.UTC(2026, 9, 6, 19, 46);
const demo = () => demoSnapshots(NOW);
const byId = (list, id) => list.find(s => s.id === id);

test('severity thresholds', () => {
    assertEqual([WARN_AT, CRIT_AT], [80, 95]);
    assertEqual(severityOf(79.9), 'ok');
    assertEqual(severityOf(80), 'warning');
    assertEqual(severityOf(94.9), 'warning');
    assertEqual(severityOf(95), 'critical');
    assertEqual(severityOf(85, {warn: 90, crit: 99}), 'ok');
});

test('most critical metric prefers the shorter window on a tie', () => {
    const metric = mostCriticalMetric([
        {id: 'week', percentUsed: 50, windowSecs: 604800},
        {id: 'session', percentUsed: 50, windowSecs: 18000},
        {id: 'low', percentUsed: 10, windowSecs: 1},
    ]);
    assertEqual(metric.id, 'session');
    assertEqual(mostCriticalMetric([]), null);
});

test('failures are never displayed as percentages', () => {
    const base = {metrics: [{percentUsed: 0}], source: {kind: 'fresh'}};
    assertEqual(displayState({...base, state: 'auth_required'}), 'auth');
    assertEqual(displayState({...base, state: 'network'}), 'error');
    assertEqual(displayState({...base, state: 'ok', source: {kind: 'stale'}}), 'stale');
    assertEqual(displayState({...base, state: 'ok'}), 'ok');
});

test('failures rank between warnings and healthy providers', () => {
    const critical = rankOf({state: 'ok', source: {}, metrics: [{percentUsed: 96}]});
    const warning = rankOf({state: 'ok', source: {}, metrics: [{percentUsed: 82}]});
    const failure = rankOf({state: 'auth_required', source: {}, metrics: []});
    const healthy = rankOf({state: 'ok', source: {}, metrics: [{percentUsed: 79}]});
    assertTrue(critical > warning && warning > failure && failure > healthy);
});

test('money formatting shapes', () => {
    assertEqual(formatMoney(12.4, 'USD', 'en'), '$12.40');
    assertEqual(formatMoney(124, 'USD', 'en'), '$124');
    assertEqual(formatMoney(1234, 'USD', 'en'), '$1.2K');
    assertTrue(formatMoney(12.4, 'USD', 'pt-BR').includes('12,40'));
});

test('durations use short units', () => {
    const min = 60000;
    assertEqual(formatDuration(47 * min), '47min');
    assertEqual(formatDuration(80 * min), '1h 20min');
    assertEqual(formatDuration(120 * min), '2h');
    assertEqual(formatDuration((2 * 1440 + 130) * min), '2d 2h');
    assertEqual(formatDuration((1440 + 23 * 60 + 40) * min), '2d');
    assertEqual(formatDuration(-5 * min), '0s');
    assertEqual([formatDuration(12000), formatDuration(59000), formatDuration(60000)], ['12s', '59s', '1min']);
});

test('clock honors 12 and 24 hour settings', () => {
    const date = new Date(2026, 9, 6, 18, 46);
    assertEqual(formatClock(date, {locale: 'en', hour12: false}), '18:46');
    assertTrue(formatClock(date, {locale: 'en', hour12: true}).startsWith('06:46'));
    assertTrue(formatClock(date, {locale: 'en', weekday: true}).startsWith('Tue'));
    assertEqual(formatPercent(97.4), '97');
});

test('pacing', () => {
    const hour = 3600 * 1000;
    // Half of a 10 h window has elapsed.
    assertEqual(expectedPercent(36000, NOW + 5 * hour, NOW), 50);
    assertEqual(expectedPercent(36000, NOW - hour, NOW), 100);
    assertEqual(expectedPercent(0, NOW, NOW), null);
    assertEqual(aheadOfPace(97, 60), 37);
    assertEqual(aheadOfPace(60, 55), null);
    assertEqual(aheadOfPace(60, null), null);
});

test('bar selection: automatic picks the worst but keeps the fixed order', () => {
    const {onBar, hidden} = selectForBar(demo(), {count: 3});
    assertEqual(onBar.map(s => s.id), ['codex', 'claude', 'example-credits']);
    assertEqual(hidden.map(s => s.id), ['command-code', 'antigravity']);
});

test('bar selection: count is clamped and manual mode is honored', () => {
    assertEqual(selectForBar(demo(), {count: 0}).onBar.length, 1);
    assertEqual(selectForBar(demo(), {count: 99}).onBar.length, 5);
    const manual = selectForBar(demo(), {count: 2, mode: 'manual', manual: ['claude', 'command-code', 'codex']});
    assertEqual(manual.onBar.map(s => s.id), ['command-code', 'claude']);
});

test('bar selection: untracked providers never take a slot', () => {
    const snapshots = demo();
    byId(snapshots, 'claude').tracked = false;
    const {onBar, hidden} = selectForBar(snapshots, {count: 5});
    assertTrue(!onBar.some(s => s.id === 'claude') && !hidden.some(s => s.id === 'claude'));
});

test('bar view: critical provider', () => {
    const view = barView(byId(demo(), 'claude'));
    assertEqual([view.number, view.suffix, view.cssClass, view.glyph], ['97', 'W', 'gaq-critical', {text: '!'}]);
    assertEqual(view.showPercent, true);
});

test('bar view: pool provider names the pool and the window', () => {
    const view = barView(byId(demo(), 'antigravity'));
    assertEqual([view.number, view.suffix], ['74', 'C/G W']);
});

test('bar view: money provider shows the balance', () => {
    const view = barView(byId(demo(), 'example-credits'), {locale: 'en'});
    assertEqual([view.number, view.showPercent, view.suffix], ['$12.40', false, '']);
    assertEqual(view.percent, 75.2);
});

test('bar view: signed out is never a number', () => {
    const snapshot = {...byId(demo(), 'codex'), state: 'auth_required'};
    const view = barView(snapshot);
    assertEqual([view.number, view.showPercent, view.percent, view.cssClass], ['–', false, 0, 'gaq-auth']);
});

test('card view: windows, pace and reset text', () => {
    const view = cardView(byId(demo(), 'claude'), {nowMs: NOW, locale: 'en'});
    assertEqual(view.groups.length, 1);
    const week = view.groups[0].rows[1];
    assertEqual([week.label, week.percentText, week.valueText, week.mark, week.resetText], ['Week', '97', '97% used', '! ', 'resets in 2d 2h']);
    // 50 h of a 168 h window remain, so 70% should be used; the card is at 97%.
    assertEqual(view.paceText, 'Week: 27 points ahead of an even pace');
    assertEqual([week.paceTip, view.groups[0].rows[0].paceTip], ['Expected by now: 70%', 'Expected by now: 37%']);
});

test('card view: pools are grouped in order', () => {
    const view = cardView(byId(demo(), 'antigravity'), {nowMs: NOW});
    assertEqual(view.groups.map(g => [g.title, g.topText]), [['Gemini', '35'], ['Claude and GPT', '74']]);
});

test('card view: money card', () => {
    const view = cardView(byId(demo(), 'example-credits'), {nowMs: NOW, locale: 'en'});
    assertEqual([view.heroText, view.heroSmall, view.money.spentText, view.money.ofText],
        ['$12.40', ' left', '$37.60', 'of $50.00 · 75%']);
});

test('summary and updated text', () => {
    assertEqual(summaryText(demo()), '3 ok · 1 warning · 1 critical');
    assertEqual(updatedText(30000), 'Updated just now');
    assertEqual(updatedText(130000), 'Updated 2 min ago');
});

test('fmt handles placeholders and escaped percent signs', () => {
    assertEqual(fmt('%s: %s%% of %s', 'Claude', '97', 'week'), 'Claude: 97% of week');
    assertEqual(fmt('%d ok', 3), '3 ok');
});

test('account countdown: padded seconds are formatted in English and translated templates', () => {
    for (const [secondsLeft, expected] of [[299, '4:59'], [61, '1:01'], [0, '0:00']]) {
        const state = {busy: true, secondsLeft};
        assertEqual(oauthSubtitle(state, {}, s => s), `Finish signing in using your browser. ${expected} left.`);
        assertEqual(oauthSubtitle(state, {}, () => 'Browser: %d:%02d'), `Browser: ${expected}`);
    }
    assertEqual(fmt('%s %02d%% %d', 'Used', 3, 10), 'Used 03% 10');
});

test('fit: candidate layouts go from rich to lean', () => {
    const shape = layouts => layouts.map(l => `${l.headline ? 'H' : l.count}${l.compact ? 'c' : ''}`);
    assertEqual(shape(candidateLayouts(3, 'auto')), ['3', '3c', '2c', 'Hc', '1c']);
    assertEqual(shape(candidateLayouts(2, 'always')), ['2c', 'Hc', '1c']);
    assertEqual(shape(candidateLayouts(2, 'never')), ['2', '1', 'Hc', '1c']);
});

test('fit: picks the richest layout that fits, else the leanest', () => {
    const layouts = candidateLayouts(3, 'auto');
    // Widths: each provider costs 100 px full, 70 px compact, headline is 90 px.
    const measure = l => (l.headline ? 90 : l.count * (l.compact ? 70 : 100));
    assertEqual(chooseLayout(layouts, measure, 400).layout.count, 3);
    assertEqual(chooseLayout(layouts, measure, 400).layout.compact, false);
    const tight = chooseLayout(layouts, measure, 215);
    assertEqual([tight.layout.count, tight.layout.compact, tight.fits], [3, true, true]);
    const tighter = chooseLayout(layouts, measure, 150);
    assertEqual([tighter.layout.count, tighter.layout.compact], [2, true]);
    const headline = chooseLayout(layouts, measure, 95);
    assertEqual([headline.layout.headline, headline.fits], [true, true]);
    // Nothing fits: the leanest layout is returned, the single compact provider.
    const none = chooseLayout(layouts, l => (l.headline ? 90 : l.count * (l.compact ? 70 : 100)), 10);
    assertEqual([none.layout.count, none.layout.headline, none.fits], [1, false, false]);
});

test('fit: side width mirrors the panel allocation', () => {
    assertEqual(sideWidth(1280, 200), 540);
    assertEqual(sideWidth(100, 400), 0);
    assertEqual(sideWidth(1280, 200, 40), 560);
});

test('fit: the sticky choice does not flip on small width changes', () => {
    const layouts = candidateLayouts(3, 'auto');
    const key = l => `${l.count}|${l.compact}|${l.headline}`;
    const widths = {'3|false|false': 300, '3|true|false': 210, '2|true|false': 140, '1|true|true': 90, '1|true|false': 70};
    const choose = (budget, current) => key(chooseStickyLayout(layouts, l => widths[key(l)], budget, current, key, 32).layout);
    // Budget wobbling between 295 and 305 around the full layout (300 px):
    assertEqual(choose(295, null), '3|true|false');
    assertEqual(choose(305, '3|true|false'), '3|true|false');
    assertEqual(choose(340, '3|true|false'), '3|false|false');
    // Once full, small shrinkage keeps it until it really stops fitting.
    assertEqual(choose(302, '3|false|false'), '3|false|false');
    assertEqual(choose(299, '3|false|false'), '3|true|false');
    // With no current layout it behaves like chooseLayout.
    assertEqual(choose(150, null), '2|true|false');
});

test('robustness: a provider without metrics does not break the card or the bar', () => {
    const empty = {id: 'x', name: 'X', state: 'ok', source: {kind: 'fresh'}, metrics: []};
    const card = cardView(empty, {nowMs: NOW});
    assertEqual([card.groups.length, card.message, card.heroSmall], [0, 'No quota data yet.', '']);
    assertEqual(barView(empty).accessibleName, 'X');
    assertEqual(cardView({...empty, state: 'network'}, {nowMs: NOW}).message, "Couldn't get the data yet.");
});

test('robustness: a window without a reset time still renders', () => {
    const snapshot = {id: 'x', name: 'X', state: 'ok', source: {kind: 'fresh'},
        metrics: [{id: 'm', kind: 'percent', window: 'week', windowSecs: 604800, percentUsed: 50}]};
    const row = cardView(snapshot, {nowMs: NOW}).groups[0].rows[0];
    assertEqual([row.resetText, row.absoluteText, row.pace, row.paceTip], ['', '', null, null]);
});

test('robustness: out-of-range and invalid numbers are clamped', () => {
    assertEqual([formatPercent(130), formatPercent(-5), formatPercent(NaN)], ['100', '0', '0']);
    assertEqual(formatDuration(NaN), '–');
    assertEqual(formatMoney(NaN, 'USD', 'en'), '–');
    assertEqual(formatMoney(5, 'NOT-A-CODE', 'en'), '5.00 NOT-A-CODE');
    assertEqual(formatMoney(-12.4, 'USD', 'en'), '-$12.40');
});

test('robustness: selection survives a bad count and odd manual lists', () => {
    assertEqual(selectForBar(demo(), {count: NaN}).onBar.length, 3);
    const manual = selectForBar(demo(), {count: 3, mode: 'manual', manual: ['nope', 'claude', 'claude', 'codex']});
    assertEqual(manual.onBar.map(s => s.id), ['codex', 'claude']);
});

test('clock: the weekday loses its dot, a dotted time does not', () => {
    const date = new Date(2026, 9, 4, 18, 46); // a Sunday
    const pt = formatClock(date, {locale: 'pt-BR', weekday: true});
    assertTrue(!pt.includes('.') && pt.includes('18:46'), pt);
    assertTrue(formatClock(date, {locale: 'fi'}).includes('18.46'), 'fi time keeps its dot');
    assertEqual(formatClock(new Date(NaN)), '');
});

test('view model: hero names the window, labels read as used, severity is spoken', () => {
    const claude = byId(demo(), 'claude');
    assertEqual(cardView(claude, {nowMs: NOW}).heroSmall, '% · week');
    assertEqual(barView(claude).accessibleName, 'Claude: 97% of week used, critical');
    assertEqual(barView(byId(demo(), 'codex')).accessibleName, 'Codex: 82% of 5 hours used, warning');
});

test('view model: a stale provider without a timestamp says so', () => {
    const snapshot = {...byId(demo(), 'codex'), source: {kind: 'stale'}};
    assertEqual(cardView(snapshot, {nowMs: NOW}).pill.text, 'Out of date');
});

test('view model: the weekday appears when the reset is on another calendar day', () => {
    const noon = new Date(2026, 9, 6, 12, 0).getTime();
    const metric = hours => ({id: 'm', kind: 'percent', window: 'session', windowSecs: 18000, percentUsed: 10,
        resetsAt: noon + hours * 3600000});
    const rowFor = hours => cardView({id: 'x', name: 'X', state: 'ok', source: {kind: 'fresh'}, metrics: [metric(hours)]},
        {nowMs: noon, locale: 'en'}).groups[0].rows[0];
    assertEqual(rowFor(2).absoluteText, '14:00');
    assertTrue(rowFor(20).absoluteText.startsWith('Wed'), rowFor(20).absoluteText);
});

const failed = (state, extra = {}) => ({...byId(demo(), 'codex'), state,
    source: {kind: 'stale', fetchedAt: NOW - 12 * 60000}, ...extra});

test('failures: each code gets its own pill, message and retry line', () => {
    const ctx = {nowMs: NOW, locale: 'en'};
    const network = cardView(failed('network', {nextRetryAt: NOW + 90000}), ctx);
    assertEqual([network.pill.text, network.message, network.retryText, network.canRetry],
        ['⚠ No connection', "Can't reach the service. Showing the last value, from 12min ago.", 'Retrying in 2min.', true]);
    const limited = cardView(failed('rate_limited', {nextRetryAt: NOW + 20 * 60000}), ctx);
    assertEqual([limited.pill.text, limited.message, limited.retryText, limited.canRetry],
        ['⚠ Rate limited', 'Too many requests.', 'Retrying in 20min.', false]);
    assertEqual(cardView(failed('parse_error'), ctx).message, 'The service replied in an unexpected way. Showing the last value.');
    assertEqual(cardView(failed('provider_changed'), ctx).pill.text, '⚠ Service changed');
    assertEqual(cardView(failed('network'), ctx).retryText, 'Retrying soon.');
});

test('failures: a signed-out provider has no retry and no value', () => {
    const view = cardView(failed('auth_required'), {nowMs: NOW});
    assertEqual([view.pill.text, view.heroText, view.retryText, view.canRetry, view.message],
        ['⊘ Not connected', '–', null, false, 'Open Preferences to connect this account.']);
});

test('failures: the last value is marked approximate and drawn neutral', () => {
    const view = cardView(failed('network'), {nowMs: NOW});
    assertEqual(view.heroText, '~82');
    assertEqual(view.groups[0].rows.map(r => [r.cssClass, r.mark]), [['gaq-stale', ''], ['gaq-stale', '']]);
    assertEqual(barView(failed('network')).number, '~82');
    assertEqual(barView(failed('network')).accessibleName, 'Codex: no connection');
    assertEqual(barView(failed('rate_limited')).accessibleName, 'Codex: rate limited');
    assertEqual(barView(failed('parse_error')).accessibleName, 'Codex: service problem');
});

test('failures: the first fetch failing without data explains itself', () => {
    const first = cardView({id: 'x', name: 'X', state: 'network', source: {kind: 'stale'}, metrics: [], nextRetryAt: NOW + 30000},
        {nowMs: NOW});
    assertEqual([first.message, first.retryText, first.heroText], ["Couldn't get the data yet.", 'Retrying in 30s.', '–']);
});

test('summary and footer tell signed-out apart from failing, and do not hide problems', () => {
    const list = [byId(demo(), 'claude'), failed('auth_required'), failed('network')];
    assertEqual(summaryText(list), '1 critical · 1 not connected · 1 with a problem');
    assertEqual(problemCount(list), 2);
    assertEqual(footerText(null, 0), 'Not updated yet');
    assertEqual(footerText(130000, 0), 'Updated 2 min ago');
    assertEqual(footerText(130000, 1), 'Updated 2 min ago · 1 with a problem');
    assertEqual(footerText(130000, 3), 'Updated 2 min ago · 3 with problems');
});

// ---- Command Code

import {normalizeSnapshot} from '../lib/core/contract.js';
import {parseCredits} from '../lib/core/commandCode.js';
import {ProviderError, errorForStatus} from '../lib/core/errors.js';
import {createCommandCodeProvider} from '../lib/providers/commandCode.js';

const CREDITS = {
    credits: {monthlyCredits: 41.5},
    windowLimits: {
        fiveHour: {used: 30, cap: 120, resetAt: 1790000000000},
        weekly: {used: 800, cap: 1000, resetAt: 1790500000000},
    },
};

test('command code: the credits reply becomes two percent metrics and a balance', () => {
    const {metrics} = parseCredits(CREDITS);
    assertEqual(metrics.map(m => m.id), ['five-hour', 'weekly', 'monthly-credits']);
    assertEqual([metrics[0].percentUsed, metrics[0].window, metrics[0].resetsAt], [25, 'session', 1790000000000]);
    assertEqual([metrics[1].percentUsed, metrics[1].windowSecs], [80, 604800]);
    assertEqual([metrics[2].kind, metrics[2].balance], ['money', 41.5]);
});

test('command code: a missing or broken field is dropped, never shown as zero', () => {
    const partial = parseCredits({windowLimits: {fiveHour: {used: 'x', cap: 10}, weekly: {used: 5, cap: 0}}, credits: {monthlyCredits: 3}});
    assertEqual(partial.metrics.map(m => m.id), ['monthly-credits']);
    assertEqual(parseCredits({windowLimits: {weekly: {used: 2000, cap: 1000}}}).metrics[0].percentUsed, 100);
    for (const body of [null, 'text', 42, {}, {windowLimits: {}}, {credits: {monthlyCredits: -1}}]) {
        let code = '';
        try {
            parseCredits(body);
        } catch (error) {
            code = error.code;
        }
        assertEqual([JSON.stringify(body), code], [JSON.stringify(body), 'provider_changed']);
    }
});

test('http statuses map to provider states', () => {
    assertEqual(errorForStatus(200), null);
    assertEqual(errorForStatus(204), null);
    assertEqual([errorForStatus(401).code, errorForStatus(403).code], ['auth_required', 'auth_required']);
    assertEqual([errorForStatus(404).code, errorForStatus(500).code, errorForStatus(302).code], ['provider_changed', 'network', 'network']);
    const limited = errorForStatus(429, '90');
    assertEqual([limited.code, limited.retryAfterMs], ['rate_limited', 90000]);
    assertEqual(errorForStatus(429, 'Wed, 21 Oct 2026 07:28:00 GMT').retryAfterMs, undefined);
});

function commandCode({key = 'secret-key', reply = {status: 200, retryAfter: null, json: CREDITS}, keyError = false} = {}) {
    const calls = [];
    const provider = createCommandCodeProvider({
        http: {get: async (url, options) => { calls.push({url, options}); return reply; }},
        getKey: async () => { if (keyError) throw new Error('locked'); return key; },
    });
    return {provider, calls};
}

async function failureOf(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

test('command code provider: sends the key as a bearer token to one https endpoint', async () => {
    const {provider, calls} = commandCode();
    const body = await provider.fetch({isCancelled: () => false});
    assertEqual(body.metrics.length, 3);
    assertEqual(calls.length, 1);
    assertEqual(calls[0].url, 'https://api.commandcode.ai/alpha/billing/credits');
    assertEqual(calls[0].options.headers.Authorization, 'Bearer secret-key');
});

test('command code provider: no key, a locked keyring and bad replies are explicit failures', async () => {
    const ctx = {isCancelled: () => false};
    assertEqual((await failureOf(commandCode({key: null}).provider.fetch(ctx))).code, 'auth_required');
    const locked = await failureOf(commandCode({keyError: true}).provider.fetch(ctx));
    assertEqual([locked.code, locked.reason], ['network', 'keyring']);
    assertEqual((await failureOf(commandCode({key: null}).provider.fetch(ctx))).reason, 'no_key');
    assertEqual((await failureOf(commandCode({reply: {status: 401, json: null}}).provider.fetch(ctx))).reason, 'rejected');
    assertEqual((await failureOf(commandCode({reply: {status: 401, json: null}}).provider.fetch(ctx))).code, 'auth_required');
    assertEqual((await failureOf(commandCode({reply: {status: 200, json: {nothing: true}}}).provider.fetch(ctx))).code, 'provider_changed');
    const limited = await failureOf(commandCode({reply: {status: 429, retryAfter: '30', json: null}}).provider.fetch(ctx));
    assertEqual([limited.code, limited.retryAfterMs], ['rate_limited', 30000]);
    // the key never appears in an error message
    const rejected = await failureOf(commandCode({reply: {status: 401, json: null}}).provider.fetch(ctx));
    assertTrue(!rejected.message.includes('secret-key'));
    assertTrue(rejected instanceof ProviderError);
});

test('command code provider: a key that could not be a header value is never sent', async () => {
    const ctx = {isCancelled: () => false};
    for (const key of ['k\r\nX-Evil: 1', 'a'.repeat(2000000), '   ', 'has space inside', 'short', 'ünïcode-key-1234']) {
        const {provider, calls} = commandCode({key});
        const error = await failureOf(provider.fetch(ctx));
        assertEqual([error.code, error.reason, calls.length], ['auth_required', 'rejected', 0]);
    }
});

test('credential failures keep their reason through the scheduler and say the right thing', async () => {
    const view = reason => {
        const snapshot = {id: 'p', name: 'P', plan: '', state: 'auth_required', source: {kind: 'stale'}, metrics: [], ...(reason ? {reason} : {})};
        return cardView(snapshot, {nowMs: 0});
    };
    assertEqual([view('no_key').pill.text, view('no_key').configureText], ['⊘ No key', 'Add key']);
    assertEqual([view('rejected').pill.text, view('rejected').configureText], ['⊘ Key rejected', 'Replace key']);
    assertEqual([view(null).pill.text, view(null).configureText], ['⊘ Not connected', 'Open Preferences']);
    const locked = cardView({id: 'p', name: 'P', plan: '', state: 'network', reason: 'keyring', source: {kind: 'stale'}, metrics: []}, {nowMs: 0});
    assertEqual([locked.pill.text, locked.canRetry], ['⚠ Keyring locked', true]);
    assertEqual(normalizeSnapshot({id: 'p', state: 'ok', reason: 'bogus'}).snapshot.reason, undefined);
    assertEqual(normalizeSnapshot({id: 'p', state: 'auth_required', reason: 'rejected'}).snapshot.reason, 'rejected');
});

import {accountStatus} from '../lib/core/accountStatus.js';

test('account status: one word per situation, shared by the extension and the preferences', () => {
    const status = (state, reason) => accountStatus({state, ...(reason ? {reason} : {})});
    assertEqual(status('ok'), 'ok');
    assertEqual([status('auth_required', 'no_key'), status('auth_required', 'rejected'), status('auth_required')], ['no_key', 'rejected', 'rejected']);
    assertEqual([status('network', 'keyring'), status('network'), status('rate_limited')], ['keyring', 'unreachable', 'unreachable']);
    assertEqual([status('parse_error'), status('provider_changed')], ['changed', 'changed']);
});

test('a demo provider that needs an account does not offer to open Preferences', () => {
    const snapshot = {id: 'p', name: 'P', plan: '', state: 'auth_required', source: {kind: 'stale'}, metrics: []};
    assertEqual(cardView(snapshot, {nowMs: 0, configurable: false}).canConfigure, false);
    assertEqual(cardView(snapshot, {nowMs: 0}).canConfigure, true);
});

test('a balance beside percent windows is a plain labeled line without a meter', () => {
    const snapshot = {
        id: 'command-code', name: 'Command Code', plan: '', state: 'ok', source: {kind: 'fresh', fetchedAt: 1},
        metrics: [
            {id: 'weekly', kind: 'percent', window: 'week', windowSecs: 604800, percentUsed: 2},
            {id: 'monthly-credits', kind: 'money', window: 'none', windowSecs: 0, balance: 41.5, budget: 0, currency: 'USD', percentUsed: 0},
        ],
    };
    const view = cardView(snapshot, {nowMs: 1, locale: 'en'});
    const rows = view.groups[0].rows;
    assertEqual(rows.map(r => r.label), ['Week', 'Balance']);
    assertEqual([rows[1].valueText, rows[1].noMeter, rows[1].percentText], ['$41.50 left', true, '']);
    assertEqual(view.hero ?? view.heroText, view.heroText);
});

test('sign-in failures: expired, refused and missing setup each get their own words', () => {
    const view = reason => cardView({id: 'codex', name: 'Codex', plan: '', state: 'auth_required', reason, source: {kind: 'stale'}, metrics: []}, {nowMs: 0});
    const expired = view('expired');
    assertEqual([expired.pill.text, expired.configureText, expired.message],
        ['⊘ Sign-in expired', 'Reconnect', 'Your Codex sign-in expired or was revoked. Connect again to keep seeing this quota.']);
    assertEqual([view('refused').pill.text, view('refused').message], ['⊘ Access refused', 'Codex refused access. Check your account on its site.']);
    assertEqual([view('no_config').pill.text, view('no_config').configureText], ['⊘ Setup needed', 'Open Preferences']);
    assertEqual(['expired', 'refused', 'no_config'].map(reason => accountStatus({state: 'auth_required', reason})), ['expired', 'refused', 'no_config']);
});

// ---- Codex usage

import {parseUsage} from '../lib/core/codex.js';

test('codex: both windows are read, with their length, reset in seconds and plan', () => {
    const {metrics, plan} = parseUsage({
        plan_type: 'plus',
        rate_limit: {
            primary_window: {used_percent: 12.5, limit_window_seconds: 18000, reset_at: 1790000000},
            secondary_window: {used_percent: 40, limit_window_seconds: 604800, reset_at: 1790500000},
        },
    });
    assertEqual(plan, 'Plus');
    assertEqual(metrics.map(m => [m.id, m.window, m.windowSecs, m.percentUsed, m.resetsAt]),
        [['primary', 'session', 18000, 12.5, 1790000000000], ['secondary', 'week', 604800, 40, 1790500000000]]);
});

test('codex: a null window is absent, a odd length is unlabeled, and nothing usable is a change', () => {
    const one = parseUsage({rate_limit: {primary_window: {used_percent: 3, limit_window_seconds: 2592000}, secondary_window: null}});
    assertEqual([one.metrics.length, one.metrics[0].window, one.plan], [1, 'month', undefined]);
    assertEqual(parseUsage({rate_limit: {primary_window: {used_percent: 150, limit_window_seconds: 999}}}).metrics.map(m => [m.window, m.percentUsed]), [['none', 100]]);
    assertEqual(parseUsage({plan_type: '<b>x</b>', rate_limit: {primary_window: {used_percent: 1}}}).plan, undefined);
    for (const body of [null, 'x', {}, {rate_limit: {}}, {rate_limit: {primary_window: {used_percent: 'a'}}}]) {
        let code = '';
        try {
            parseUsage(body);
        } catch (error) {
            code = error.code;
        }
        assertEqual([JSON.stringify(body), code], [JSON.stringify(body), 'provider_changed']);
    }
});

import {createCodexProvider} from '../lib/providers/codex.js';
import {TokenError} from '../lib/oauth/tokenManager.js';

const USAGE = {plan_type: 'pro', rate_limit: {primary_window: {used_percent: 20, limit_window_seconds: 18000, reset_at: 1790000000}}};

function codex({replies, tokenError = null}) {
    const calls = {urls: [], auth: [], invalidated: 0, tokenCalls: 0};
    const provider = createCodexProvider({
        http: {request: async (url, options) => { calls.urls.push(url); calls.auth.push(options.headers.Authorization); return replies.shift(); }},
        tokens: {
            accessToken: async () => { calls.tokenCalls++; if (tokenError) throw tokenError; return `tok${calls.tokenCalls}`; },
            invalidate: () => { calls.invalidated++; },
        },
    });
    return {provider, calls};
}

test('codex provider: asks the usage endpoint with the access token and reads the plan', async () => {
    const {provider, calls} = codex({replies: [{status: 200, json: USAGE}]});
    const body = await provider.fetch({isCancelled: () => false});
    assertEqual([calls.urls, calls.auth], [['https://chatgpt.com/backend-api/wham/usage'], ['Bearer tok1']]);
    assertEqual([body.plan, body.metrics.length], ['Pro', 1]);
});

test('codex provider: a refused token is renewed once; a second refusal means the sign-in expired', async () => {
    const {provider, calls} = codex({replies: [{status: 401, json: null}, {status: 200, json: USAGE}]});
    assertEqual((await provider.fetch({isCancelled: () => false})).metrics.length, 1);
    assertEqual([calls.invalidated, calls.auth], [1, ['Bearer tok1', 'Bearer tok2']]);
    const twice = codex({replies: [{status: 401, json: null}, {status: 401, json: null}]});
    const error = await failureOf(twice.provider.fetch({isCancelled: () => false}));
    assertEqual([error.code, error.reason], ['auth_required', 'expired']);
});

test('codex provider: 403, rate limits, odd replies and every token failure are told apart', async () => {
    const ctx = {isCancelled: () => false};
    const refused = await failureOf(codex({replies: [{status: 403, json: null}]}).provider.fetch(ctx));
    assertEqual([refused.code, refused.reason], ['auth_required', 'refused']);
    const limited = await failureOf(codex({replies: [{status: 429, retryAfter: '12', json: null}]}).provider.fetch(ctx));
    assertEqual([limited.code, limited.retryAfterMs], ['rate_limited', 12000]);
    assertEqual((await failureOf(codex({replies: [{status: 200, json: {}}]}).provider.fetch(ctx))).code, 'provider_changed');
    const cases = {network: ['network', undefined], no_config: ['auth_required', 'no_config'], expired: ['auth_required', 'expired'],
        reconnect: ['auth_required', 'expired'], not_connected: ['auth_required', undefined], disconnected: ['auth_required', undefined]};
    for (const [code, expected] of Object.entries(cases)) {
        const error = await failureOf(codex({replies: [], tokenError: new TokenError(code)}).provider.fetch(ctx));
        assertEqual([code, error.code, error.reason], [code, ...expected]);
    }
    assertEqual((await failureOf(codex({replies: [], tokenError: new Error('boom')}).provider.fetch(ctx))).code, 'network');
});

// ---- Claude usage

import {parseUsage as parseClaudeUsage} from '../lib/core/claude.js';
import {createClaudeProvider} from '../lib/providers/claude.js';

test('claude: both windows are read with their percentage and RFC 3339 reset', () => {
    const {metrics} = parseClaudeUsage({
        five_hour: {utilization: 37.5, resets_at: '2026-10-08T03:00:00.000000+00:00'},
        seven_day: {utilization: 12, resets_at: '2026-10-12T05:00:00Z'},
        seven_day_opus: null,
        overage: null,
    });
    assertEqual(metrics.map(m => [m.id, m.window, m.windowSecs, m.percentUsed]), [['session', 'session', 18000, 37.5], ['week', 'week', 604800, 12]]);
    assertEqual([metrics[0].resetsAt, metrics[1].resetsAt], [Date.parse('2026-10-08T03:00:00Z'), Date.parse('2026-10-12T05:00:00Z')]);
});

test('claude: a missing window is absent, a bad reset is dropped, nothing usable is a change', () => {
    const one = parseClaudeUsage({five_hour: null, seven_day: {utilization: 150, resets_at: 'not a date'}});
    assertEqual([one.metrics.length, one.metrics[0].percentUsed, one.metrics[0].resetsAt], [1, 100, undefined]);
    for (const body of [null, 'x', {}, {five_hour: {utilization: 'a'}}, {five_hour: {resets_at: '2026-01-01T00:00:00Z'}}]) {
        let code = '';
        try {
            parseClaudeUsage(body);
        } catch (error) {
            code = error.code;
        }
        assertEqual([JSON.stringify(body), code], [JSON.stringify(body), 'provider_changed']);
    }
});

test('claude provider: sends the beta header with the bearer token and renews once after a 401', async () => {
    const seen = [];
    let n = 0;
    const replies = [{status: 401, json: null}, {status: 200, json: {five_hour: {utilization: 5, resets_at: '2026-10-08T03:00:00Z'}}}];
    const provider = createClaudeProvider({
        http: {request: async (url, options) => { seen.push({url, headers: options.headers}); return replies.shift(); }},
        tokens: {accessToken: async () => `tok${++n}`, invalidate: () => {}},
    });
    const body = await provider.fetch({isCancelled: () => false});
    assertEqual(body.metrics.length, 1);
    assertEqual(seen.map(s => s.url), ['https://api.anthropic.com/api/oauth/usage', 'https://api.anthropic.com/api/oauth/usage']);
    assertEqual(seen.map(s => [s.headers['anthropic-beta'], s.headers.Authorization]), [['oauth-2025-04-20', 'Bearer tok1'], ['oauth-2025-04-20', 'Bearer tok2']]);
});

// ---- Antigravity quota

import {parseQuota} from '../lib/core/antigravity.js';
import {DEFAULT_USER_AGENT, createAntigravityProvider} from '../lib/providers/antigravity.js';

const QUOTA = {
    groups: [
        {displayName: 'Gemini', buckets: [
            {bucketId: 'gemini-pro', window: '5h', remainingFraction: 0.59, resetTime: '2026-10-08T03:00:00Z'},
            {bucketId: 'gemini-pro', window: 'weekly', remainingFraction: 1, resetTime: '2026-10-12T05:00:00Z'},
        ]},
        {displayName: 'Claude and GPT', buckets: [
            {bucketId: '3p-claude', window: 'weekly', remainingFraction: '0.25', resetTime: '2026-10-12T05:00:00Z'},
            {bucketId: '3p-claude', window: '5h', remainingFraction: 0, resetTime: 'later'},
        ]},
    ],
};

test('antigravity: buckets become two pools with a five-hour and a weekly window each', () => {
    const {metrics} = parseQuota(QUOTA);
    assertEqual(metrics.map(m => [m.id, m.pool.short, m.window, Math.round(m.percentUsed)]),
        [['gemini-5h', 'G', 'session', 41], ['gemini-weekly', 'G', 'week', 0], ['claude-gpt-weekly', 'C/G', 'week', 75], ['claude-gpt-5h', 'C/G', 'session', 100]]);
    assertEqual([metrics[0].resetsAt, metrics[3].resetsAt], [Date.parse('2026-10-08T03:00:00Z'), undefined]);
    assertEqual(metrics[2].pool, {id: 'claude-gpt', name: 'Claude and GPT', short: 'C/G'});
});

test('antigravity: unknown pools and windows, repeated buckets and bad fractions are skipped', () => {
    const {metrics} = parseQuota({groups: [{buckets: [
        {bucketId: 'gemini-a', window: '5h', remainingFraction: 0.5},
        {bucketId: 'gemini-b', window: '5h', remainingFraction: 0.1},      // same pool and window: the fullest wins
        {bucketId: 'other-x', window: '5h', remainingFraction: 0.5},
        {bucketId: 'gemini-a', window: 'monthly', remainingFraction: 0.5},
        {bucketId: '3p-a', window: 'weekly', remainingFraction: 'x'},
        {bucketId: '3p-a', window: 'weekly', remainingFraction: 7},        // more than all left: not a fraction
        null, {window: '5h'},
    ]}]});
    assertEqual(metrics.map(m => [m.id, m.percentUsed]), [['gemini-5h', 90]]);
    for (const body of [null, {}, {groups: []}, {groups: [{buckets: []}]}, {groups: 'x'}]) {
        let code = '';
        try {
            parseQuota(body);
        } catch (error) {
            code = error.code;
        }
        assertEqual([JSON.stringify(body), code], [JSON.stringify(body), 'provider_changed']);
    }
});

test('antigravity provider: a POST with an empty JSON body and a User-Agent that names the program', async () => {
    const seen = [];
    const make = userAgent => createAntigravityProvider({
        http: {request: async (url, options) => { seen.push({url, options}); return {status: 200, json: QUOTA}; }},
        tokens: {accessToken: async () => 'tok', invalidate: () => {}},
        userAgent,
    });
    await make(() => null).fetch({isCancelled: () => false});
    await make(() => 'antigravity/9.9 mine').fetch({isCancelled: () => false});
    assertEqual(seen[0].url, 'https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary');
    assertEqual([seen[0].options.method, seen[0].options.body, seen[0].options.contentType], ['POST', '{}', 'application/json']);
    assertEqual([seen[0].options.headers['User-Agent'], seen[0].options.headers.Authorization], [DEFAULT_USER_AGENT, 'Bearer tok']);
    assertEqual(seen[1].options.headers['User-Agent'], 'antigravity/9.9 mine');
    assertTrue(DEFAULT_USER_AGENT.includes('antigravity') && DEFAULT_USER_AGENT.includes('gnome-ai-quota'));
});

test('antigravity: names from the server cannot reach into the parser, and a zero that was left out counts', () => {
    const bucket = extra => ({groups: [{buckets: [{bucketId: 'gemini-a', window: '5h', remainingFraction: 0.5, ...extra}]}]});
    for (const window of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
        let code = '';
        try {
            parseQuota(bucket({window}));
        } catch (error) {
            code = error.code;
        }
        assertEqual([window, code], [window, 'provider_changed']);
    }
    for (const remainingFraction of [5, -0.5, '1e3', 'abc', null])
        assertEqual(failureOf2(() => parseQuota(bucket({remainingFraction}))), 'provider_changed');
    // No `remainingFraction` at all, but a reset time: protocol-buffer JSON leaves a zero out.
    const exhausted = {groups: [{buckets: [{bucketId: '3p-x', window: 'weekly', resetTime: '2026-10-12T05:00:00Z'}]}]};
    assertEqual(parseQuota(exhausted).metrics.map(m => m.percentUsed), [100]);
    assertEqual(failureOf2(() => parseQuota({groups: [{buckets: [{bucketId: '3p-x', window: 'weekly'}]}]})), 'provider_changed');
});

function failureOf2(fn) {
    try {
        fn();
    } catch (error) {
        return error.code;
    }
    return '';
}

test('oauth usage: a token that is refused even after a renewal is not renewed again at every poll', async () => {
    let invalidated = 0;
    const seen = [];
    const provider = createClaudeProvider({
        http: {request: async () => { seen.push(1); return {status: 401, json: null}; }},
        tokens: {accessToken: async () => 'tok', invalidate: () => { invalidated++; }},
    });
    const ctx = {isCancelled: () => false};
    for (let poll = 0; poll < 3; poll++) {
        const error = await failureOf(provider.fetch(ctx));
        assertEqual([error.code, error.reason], ['auth_required', 'expired']);
    }
    assertEqual([invalidated, seen.length], [1, 4]);       // one renewal; later polls ask once
});

test('a number that belongs to a pool says which pool, for the eye and for a screen reader', () => {
    const snapshot = {id: 'antigravity', name: 'Antigravity', plan: '', state: 'ok', source: {kind: 'fresh', fetchedAt: 1}, metrics: parseQuota(QUOTA).metrics};
    const ctx = {nowMs: 1, locale: 'en'};
    const bar = barView(snapshot, ctx);
    assertTrue(bar.accessibleName.includes('Claude and GPT') || bar.accessibleName.includes('Gemini'), bar.accessibleName);
    const card = cardView(snapshot, ctx);
    assertTrue(/% · (Gemini|Claude and GPT) · /.test(card.heroSmall), card.heroSmall);
    assertEqual(card.groups.map(g => g.title), ['Gemini', 'Claude and GPT']);
    assertEqual(card.groups[1].rows.map(r => r.poolTitle), ['Claude and GPT', 'Claude and GPT']);
    // a provider without pools reads as before
    const plain = barView({id: 'c', name: 'C', plan: '', state: 'ok', source: {kind: 'fresh', fetchedAt: 1}, metrics: [{id: 'w', kind: 'percent', window: 'week', windowSecs: 604800, percentUsed: 12}]}, ctx);
    assertEqual(plain.accessibleName, 'C: 12% of week used');
});



test('legend: every mark the bar can show is explained, in the bar\'s own words', () => {
    const rows = legendRows();
    const marks = rows.map(row => row.glyph ?? row.icon);
    for (const mark of [SYMBOLS.critical, SYMBOLS.warning, SYMBOLS.approximate, SYMBOLS.auth.icon, SYMBOLS.error.icon])
        assertTrue(marks.includes(mark), `${mark} is in the legend`);
    // What a bar item really shows is what the legend says it shows.
    const metric = percent => ({id: 'm', kind: 'percent', window: 'session', windowSecs: 18000, percentUsed: percent});
    const base = {id: 'claude', name: 'Claude', plan: '', state: 'ok', source: {kind: 'fresh', fetchedAt: Date.now()}, metrics: [metric(50)]};
    assertEqual(barView({...base, metrics: [metric(96)]}).glyph, {text: SYMBOLS.critical});
    assertEqual(barView({...base, metrics: [metric(85)]}).glyph, {text: SYMBOLS.warning});
    assertEqual(barView({...base, state: 'auth_required', metrics: []}).glyph, {icon: SYMBOLS.auth.icon});
    assertEqual(barView({...base, state: 'network'}).glyph, {icon: SYMBOLS.error.icon});
    assertTrue(barView({...base, source: {kind: 'stale', fetchedAt: Date.now() - 1e7}}).number.startsWith(SYMBOLS.approximate));
    assertTrue(rows.every(row => row.title && row.description && row.cssClass));
    // Translated through the injected functions.
    const t = {gettext: s => `«${s}»`, ngettext: (a, b, n) => (n === 1 ? a : b), pgettext: (_c, s) => s};
    assertTrue(legendRows(t).every(row => row.title.startsWith('«') && row.description.startsWith('«')));
});

test('bar tooltip: the item\'s own words plus the reset, made when it is shown, and nothing else', () => {
    const now = 1_800_000_000_000;
    const snapshot = {id: 'claude', name: 'Claude', plan: 'Max', state: 'ok', source: {kind: 'fresh', fetchedAt: now},
        metrics: [{id: 'm', kind: 'percent', window: 'session', windowSecs: 18000, percentUsed: 82, resetsAt: now + 80 * 60 * 1000}]};
    const view = barView(snapshot, {nowMs: now});
    assertEqual(barTooltip(view, {nowMs: now}), 'Claude · 5 hours · 82% used (warning)\nResets in 1h 20min');
    // The countdown is the one of the moment the tooltip is shown, not of the last update.
    assertEqual(barTooltip(view, {nowMs: now + 30 * 60 * 1000}).split('\n')[1], 'Resets in 50min');
    assertTrue(!barTooltip(view, {nowMs: now}).includes('Max'), 'the plan is not in the tooltip');
    // Without a warning there is no state in brackets; critical says so.
    assertEqual(barView({...snapshot, metrics: [{...snapshot.metrics[0], percentUsed: 40}]}, {nowMs: now}).tooltipHead, 'Claude · 5 hours · 40% used');
    assertTrue(barView({...snapshot, metrics: [{...snapshot.metrics[0], percentUsed: 97}]}, {nowMs: now}).tooltipHead.endsWith('(critical)'));
    // A reset in the past, a failure, a stale value and a balance have no second line.
    const lines = (extra, nowMs = now) => barTooltip(barView({...snapshot, ...extra}, {nowMs}), {nowMs}).split('\n').length;
    assertEqual(lines({metrics: [{...snapshot.metrics[0], resetsAt: now - 1000}]}), 1);
    assertEqual(lines({state: 'auth_required', metrics: []}), 1);
    assertEqual(lines({state: 'network'}), 2 - 1 + (barView({...snapshot, state: 'network'}, {nowMs: now}).resetsAt === null ? 0 : 1));
    assertEqual(lines({metrics: [{id: 'usd', kind: 'money', balance: 5, budget: 10, currency: 'USD', percentUsed: 50, resetsAt: now + 1e6}]}), 1);
    // What the memo of a bar item looks at includes the reset time, so a changed reset is redrawn.
    assertTrue('resetsAt' in view && JSON.stringify(view).includes(String(now + 80 * 60 * 1000)));
});

test('not tracked: only known providers, in the registry\'s order', () => {
    const registry = [{id: 'command-code', name: 'Command Code'}, {id: 'codex', name: 'Codex'}, {id: 'claude', name: 'Claude'}];
    assertEqual(untrackedProviders(['claude', 'nope', 'command-code'], registry), [{id: 'command-code', name: 'Command Code'}, {id: 'claude', name: 'Claude'}]);
    assertEqual(untrackedProviders([], registry), []);
    assertEqual(untrackedProviders(undefined, registry), []);
    assertEqual(untrackedProviders(['__proto__', 'constructor'], registry), []);
});
