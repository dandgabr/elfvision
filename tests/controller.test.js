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

test('controller: nothing is claimed until the providers are known, and the cache keeps values meanwhile', async () => {
    const saved = [];
    const store = {load: async () => ({snapshots: [cached('a'), cached('b')], problems: []}), save: snapshots => saved.push(snapshots.map(s => s.id))};
    const controller = new QuotaController({providers: [], cache: store});
    await controller.start();
    assertEqual(controller.synced, false);
    controller.stop();                                  // stopped before the first sync finished
    assertEqual(saved[saved.length - 1], ['a', 'b']);   // nothing was wiped from the cache

    const second = new QuotaController({providers: [], cache: store});
    await second.start();
    second.markSynced();
    assertEqual(second.synced, true);
    second.stop();
    assertEqual(saved[saved.length - 1], []);
});

test('controller: changes are reported with the previous snapshot, which the cache provides after a restart', async () => {
    const earlier = {...cached('a'), metrics: [{id: 'm', kind: 'percent', window: 'week', windowSecs: 604800, percentUsed: 42}]};
    const controller = new QuotaController({providers: [provider('a')], cache: cache([earlier])});
    const changes = [];
    controller.subscribeChanges(change => changes.push([change.id, change.previous?.metrics[0]?.percentUsed ?? null, change.next?.state ?? null]));
    await controller.start();
    controller.markSynced();
    await controller.refresh();
    assertEqual(changes, [['a', 42, 'ok']]);            // the cached value is what the first poll is compared with

    controller.removeProvider('a');
    assertEqual(changes[1], ['a', 10, null]);            // removal: no next snapshot
    controller.addProvider(provider('b'));
    await controller.refresh();
    assertEqual(changes[2], ['b', null, 'ok']);          // never seen before: no previous
    controller.stop();
});

test('controller: a change listener that fails does not stop the others or the polling', async () => {
    const controller = new QuotaController({providers: [provider('a')], cache: cache()});
    const seen = [];
    controller.subscribeChanges(() => { throw new Error('boom'); });
    const stop = controller.subscribeChanges(change => seen.push(change.id));
    await controller.start();
    await controller.refresh();
    assertEqual(seen, ['a']);
    stop();
    await controller.refresh();
    assertEqual(seen, ['a']);
    controller.stop();
});

test('controller: a listener that throws nothing useful does not stop the pipeline, and a late snapshot of a removed provider is ignored', async () => {
    const saved = [];
    const store = {load: async () => ({snapshots: [], problems: []}), save: s => saved.push(s.map(x => x.id))};
    const controller = new QuotaController({providers: [provider('a')], cache: store});
    const changes = [];
    controller.subscribeChanges(() => { throw null; });                       // not even an Error
    controller.subscribeChanges(change => changes.push([change.id, change.next?.state ?? null]));
    let updates = 0;
    controller.subscribe(() => updates++);
    await controller.start();
    await controller.refresh();
    assertTrue(updates >= 1, 'the interface was still told');
    assertEqual(changes, [['a', 'ok']]);

    // A poll that ends after the provider was removed must not bring its state back.
    const late = controller._scheduler.snapshots()[0];
    controller.removeProvider('a');
    const before = changes.length;
    controller._onSnapshot(late);
    assertEqual([changes.length, controller._last.has('a')], [before, false]);
    controller.stop();
});

test('controller: a cached value that is hours old reaches the listeners as stale, not as a live reading', async () => {
    const old = {id: 'a', name: 'a', plan: '', state: 'ok', source: {kind: 'fresh', fetchedAt: Date.now() - 3 * 3600_000},
        metrics: [{id: 'm', kind: 'percent', window: 'session', windowSecs: 18000, percentUsed: 99}]};
    const controller = new QuotaController({providers: [provider('a')], cache: cache([old])});
    const seen = [];
    controller.subscribeChanges(change => seen.push(change.previous?.source.kind));
    await controller.start();
    await controller.refresh();
    assertEqual(seen, ['stale']);
    controller.stop();
});
