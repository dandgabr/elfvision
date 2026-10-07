import {assertEqual, assertTrue, flush, test} from './harness.js';
import {QuotaController} from '../lib/services/controller.js';

const provider = (id, metrics = [{id: 'm', kind: 'percent', window: 'week', windowSecs: 604800, percentUsed: 10}]) => ({
    id, name: id, plan: '', intervalMs: 3600 * 1000, fetch: async () => ({metrics}), disposed: false,
    dispose() { this.disposed = true; },
});
const cache = (snapshots = []) => ({load: async () => ({snapshots, problems: []}), save: () => {}});
const cached = id => ({id, name: id, plan: '', state: 'ok', source: {kind: 'fresh', fetchedAt: Date.now()}, metrics: []});

test('controller: providers can be added and removed while running, in display order', async () => {
    const controller = new QuotaController({providers: [provider('b')], cache: cache([cached('a'), cached('b')]), order: ['a', 'b', 'c']});
    await controller.start();
    assertEqual(controller.snapshots().map(s => s.id), ['b']);          // a is cached but not running
    let notified = 0;
    controller.subscribe(() => notified++);
    const a = provider('a');
    controller.addProvider(a);
    assertEqual(controller.providerIds(), ['b', 'a']);
    assertEqual(controller.snapshots().map(s => s.id), ['a', 'b']);      // display order, and a's cached value
    controller.addProvider(provider('a'));                               // a duplicate is ignored
    assertEqual(controller.providerIds().length, 2);
    controller.removeProvider('a');
    assertEqual([a.disposed, controller.snapshots().map(s => s.id)], [true, ['b']]);
    assertTrue(notified >= 2);
    controller.stop();
});

test('controller: sync keeps what runs, removes what is not wanted and creates the rest', async () => {
    const made = [];
    const create = id => { const p = provider(id); made.push(p); return p; };
    const controller = new QuotaController({providers: [provider('a'), provider('b')], cache: cache()});
    await controller.start();
    const original = controller._providers.get('a');
    controller.sync(['a', 'c'], create);
    assertEqual(controller.providerIds(), ['a', 'c']);
    assertEqual([made.map(p => p.id), controller._providers.get('a') === original], [['c'], true]);
    controller.sync([], create);
    assertEqual(controller.providerIds(), []);
    controller.stop();
    await flush();
});
