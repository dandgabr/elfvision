import {assertEqual, assertTrue, test} from './harness.js';
import {alertText} from '../lib/core/alertText.js';

const NOW = 1_800_000_000_000;
const names = {claude: 'Claude', codex: 'Codex'};
const context = {providerName: id => names[id] ?? null, now: NOW};
const crossing = (percent, extra = {}) => ({metricId: 'five', type: 'session', window: 'session', percent, resetsAt: NOW + 80 * 60 * 1000, ...extra});

test('alert text: a critical crossing says the severity in words, the window, the percent and the reset', () => {
    const text = alertText({kind: 'threshold', providerId: 'claude', level: 'critical', crossings: [crossing(96)]}, context);
    assertEqual(text, {title: 'Critical: Claude at 96%', body: '5 hours: 96% used. Resets in 1h 20min.'});
    assertEqual(alertText({kind: 'threshold', providerId: 'claude', level: 'warning', crossings: [crossing(82)]}, {...context, resetStyle: 'short'}),
        {title: 'Warning: Claude at 82%', body: '5 hours: 82% used. Resets in 1h20.'});
});

test('alert text: several crossings share one notification, credits have no reset', () => {
    const text = alertText({kind: 'threshold', providerId: 'codex', level: 'critical', crossings: [
        crossing(96), crossing(97, {type: 'week', window: 'week', metricId: 'wk', resetsAt: NOW + 2 * 86400_000}),
        {metricId: 'usd', type: 'credits', window: 'none', percent: 98, resetsAt: null}]}, context);
    assertEqual(text.title, 'Critical: Codex at 98%');
    assertEqual(text.body.split('\n'), ['5 hours: 96% used. Resets in 1h 20min.', 'Week: 97% used. Resets in 2d.', 'Credits: 98% of the budget used.']);
});

test('alert text: a reset in the past or an unknown one is left out, and bad numbers never print as numbers', () => {
    const past = alertText({kind: 'threshold', providerId: 'claude', level: 'critical', crossings: [crossing(96, {resetsAt: NOW - 1000})]}, context);
    assertEqual(past.body, '5 hours: 96% used.');
    const odd = alertText({kind: 'threshold', providerId: 'claude', level: 'critical', crossings: [crossing(NaN, {resetsAt: null}), crossing(1e9)]}, context);
    assertTrue(!/NaN|undefined|null|e\+/.test(odd.title + odd.body), odd.title + odd.body);
    assertEqual(odd.title, 'Critical: Claude at 100%');
    assertEqual(odd.body.split('\n')[0], '5 hours: 0% used.');   // a bad number is zero, never printed raw
});

test('alert text: connection alerts name the provider and a generic reason, nothing else', () => {
    assertEqual(alertText({kind: 'connection', providerId: 'claude', cause: 'auth'}, context).title, 'Claude: reconnect the account');
    for (const cause of ['stale', 'error']) {
        const text = alertText({kind: 'connection', providerId: 'claude', cause}, context);
        assertEqual(text.title, 'Claude: no recent data');
    }
    assertEqual(alertText({kind: 'summary'}, context).title, 'Several quotas need attention');
});

test('alert text: an id the registry does not know, or a hostile event, prints only fixed words', () => {
    const hostile = alertText({kind: 'threshold', providerId: '<b>evil</b>', level: 'x<i>', metricId: 'secret-token',
        crossings: [{metricId: '<span foreground="red">', type: 'session', window: '<script>', percent: 96, resetsAt: NOW + 1000}]}, context);
    const all = hostile.title + hostile.body;
    assertTrue(!/evil|secret|span|script|<|>/.test(all), all);
    assertTrue(hostile.title.startsWith('Warning: A provider at 96%'), hostile.title);
    assertEqual(alertText({kind: 'bogus'}, context), {title: 'Quota alert', body: ''});
});

test('alert text: every sentence goes through the translator', () => {
    const seen = [];
    const t = {gettext: s => { seen.push(s); return `«${s}»`; }, ngettext: (a, b, n) => (n === 1 ? a : b), pgettext: (_c, s) => s};
    alertText({kind: 'threshold', providerId: 'claude', level: 'critical', crossings: [crossing(96)]}, {...context, t});
    alertText({kind: 'connection', providerId: 'claude', cause: 'auth'}, {...context, t});
    alertText({kind: 'summary'}, {...context, t});
    assertTrue(['Critical: %s at %s%%', '%s: %s%% used.', 'Resets in %s.', '%s: reconnect the account', 'Several quotas need attention'].every(s => seen.includes(s)), seen.join(' | '));
});

test('alert text: controls and bidirectional overrides are removed from names and translations, and lengths are capped', () => {
    const t = {gettext: s => s.replace('Critical', 'Cr\u202eit\u0007ical'), ngettext: (a, b, n) => (n === 1 ? a : b), pgettext: (_c, s) => s};
    const text = alertText({kind: 'threshold', providerId: 'claude', level: 'critical', crossings: [crossing(96)]},
        {...context, t, providerName: () => 'Cl\u202eau\u2067de \n&amp; <b>' + 'x'.repeat(200)});
    assertTrue(!/[\u0000-\u0009\u000b-\u001f\u202a-\u202e\u2066-\u2069]/.test(text.title + text.body), JSON.stringify(text));
    assertTrue(text.title.startsWith('Critical: Claude'), text.title);
    assertTrue(text.title.length <= 120 && text.title.includes('&amp; <b>'), 'markup stays literal, length is capped');
    // The newline between the lines of a body is the only control character kept.
    const many = alertText({kind: 'threshold', providerId: 'claude', level: 'critical', crossings: [crossing(96), crossing(97, {type: 'week', window: 'week'})]}, context);
    assertEqual(many.body.split('\n').length, 2);
});
