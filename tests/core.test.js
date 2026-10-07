import {assertEqual, assertTrue, test} from './harness.js';
import {CRIT_AT, WARN_AT, displayState, mostCriticalMetric, rankOf, severityOf} from '../lib/core/severity.js';
import {formatClock, formatDuration, formatMoney, formatPercent} from '../lib/core/format.js';
import {aheadOfPace, expectedPercent} from '../lib/core/pacing.js';
import {selectForBar} from '../lib/core/selection.js';
import {demoSnapshots} from '../lib/core/fixtures.js';
import {candidateLayouts, chooseLayout, chooseStickyLayout, sideWidth} from '../lib/core/fit.js';
import {barView, cardView, fmt, footerText, problemCount, summaryText, updatedText} from '../lib/core/viewmodel.js';

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
        ['⊘ Signed out', '–', null, false, 'Open Preferences to connect this account.']);
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
    assertEqual(summaryText(list), '1 critical · 1 signed out · 1 with a problem');
    assertEqual(problemCount(list), 2);
    assertEqual(footerText(null, 0), 'Not updated yet');
    assertEqual(footerText(130000, 0), 'Updated 2 min ago');
    assertEqual(footerText(130000, 1), 'Updated 2 min ago · 1 with a problem');
    assertEqual(footerText(130000, 3), 'Updated 2 min ago · 3 with problems');
});

// ---- Command Code

import {parseCredits} from '../lib/core/commandCode.js';
import {ProviderError, errorForStatus} from '../lib/providers/errors.js';
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
    assertEqual((await failureOf(commandCode({keyError: true}).provider.fetch(ctx))).code, 'auth_required');
    assertEqual((await failureOf(commandCode({reply: {status: 401, json: null}}).provider.fetch(ctx))).code, 'auth_required');
    assertEqual((await failureOf(commandCode({reply: {status: 200, json: {nothing: true}}}).provider.fetch(ctx))).code, 'provider_changed');
    const limited = await failureOf(commandCode({reply: {status: 429, retryAfter: '30', json: null}}).provider.fetch(ctx));
    assertEqual([limited.code, limited.retryAfterMs], ['rate_limited', 30000]);
    // the key never appears in an error message
    const rejected = await failureOf(commandCode({reply: {status: 401, json: null}}).provider.fetch(ctx));
    assertTrue(!rejected.message.includes('secret-key'));
    assertTrue(rejected instanceof ProviderError);
});
