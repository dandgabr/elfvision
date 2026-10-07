import {assertEqual, assertTrue, test} from './harness.js';
import {CRIT_AT, WARN_AT, displayState, mostCriticalMetric, rankOf, severityOf} from '../lib/core/severity.js';
import {formatClock, formatDuration, formatMoney, formatPercent} from '../lib/core/format.js';
import {aheadOfPace, expectedPercent} from '../lib/core/pacing.js';
import {selectForBar} from '../lib/core/selection.js';
import {demoSnapshots} from '../lib/core/fixtures.js';
import {barView, cardView, fmt, summaryText, updatedText} from '../lib/core/viewmodel.js';

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
    assertEqual(formatDuration(-5 * min), '0min');
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
    assertEqual([week.label, week.percentText, week.mark, week.resetText], ['Week', '97', '! ', 'resets in 2d 2h']);
    // 50 h of a 168 h window remain, so 70% should be used; the card is at 97%.
    assertEqual(view.paceText, 'Pace: 27 points above expected');
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
