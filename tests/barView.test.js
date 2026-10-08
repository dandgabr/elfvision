import {assertEqual, test} from './harness.js';
import {barView as model} from '../lib/core/barView.js';
import {demoSnapshots} from '../lib/core/fixtures.js';
import {barView as itemView} from '../lib/core/viewmodel.js';

const now = 1800000000000;

test('bar model: demo descriptions preserve current item output and fixed order', async () => {
    const snapshots = demoSnapshots(now);
    const result = await model({snapshots, settings: {count: 3}, now});
    assertEqual(result.items.map(item => [item.id, item.visible, item.compact]), [
        ['command-code', false, false], ['codex', true, false], ['claude', true, false],
        ['antigravity', false, false], ['example-credits', true, false],
    ]);
    for (const item of result.items.filter(item => item.visible))
        assertEqual(item.view, itemView(snapshots.find(s => s.id === item.id), {nowMs: now}));
    assertEqual(result.items.filter(item => item.visible).map(item => item.view.number), ['82', '97', '$12.40']);
});

test('bar model: empty and paused providers produce no items', async () => {
    assertEqual(await model({snapshots: [], settings: {}, now}), {items: []});
    assertEqual(await model({snapshots: demoSnapshots(now).map(s => ({...s, tracked: false})), settings: {}, now}), {items: []});
});

test('bar model: stale and error states retain readable current descriptions', async () => {
    const snapshots = demoSnapshots(now).slice(0, 2).map((s, i) => ({...s, state: i ? 'network' : 'ok', source: {...s.source, kind: i ? 'fresh' : 'stale'}}));
    const {items} = await model({snapshots, settings: {count: 5}, now});
    assertEqual(items.map(item => item.view.state), ['stale', 'error']);
    assertEqual(items.map(item => item.view.accessibleName), ['Command Code: data out of date', 'Codex: no connection']);
});

test('bar model: unchanged input is equal and latest response updates headline', async () => {
    const snapshots = demoSnapshots(now);
    const input = {snapshots, settings: {count: 3, headline: true}, now};
    assertEqual(await model(input), await model(input));
    const latest = snapshots.map(s => s.id === 'codex' ? {...s, metrics: s.metrics.map(m => ({...m, percentUsed: 100}))} : s);
    const {items} = await model({...input, snapshots: latest});
    assertEqual(items.filter(item => item.visible).map(item => [item.id, item.compact, item.view.number]), [['codex', true, '100']]);
    assertEqual(snapshots[1].metrics[0].percentUsed, 82);
});
