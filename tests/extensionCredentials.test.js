import GLib from 'gi://GLib';
import {assertEqual, assertTrue, flush, test} from './harness.js';
import {PollScheduler} from '../lib/core/scheduler.js';
import {ProviderError} from '../lib/core/errors.js';

// Execute the registered callback itself without importing GNOME Shell or starting it.
function credentialSignal() {
    const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
    const source = new TextDecoder().decode(GLib.file_get_contents(`${root}/extension.js`)[1]);
    const body = source.match(/connect\('changed::credentials-revision', async \(\) => \{([\s\S]*?)\n {8}\}\);/)[1];
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    return new AsyncFunction(body);
}

function schedulerFixture() {
    const emitted = [], requests = [];
    const scheduler = new PollScheduler({
        timers: {now: () => 100000, setTimeout: () => 1, clearTimeout() {}},
        onSnapshot: snapshot => emitted.push(snapshot), random: () => 0.5,
    });
    scheduler.add({id: 'codex', name: 'Codex', intervalMs: 300000,
        fetch(context) { return new Promise((resolve, reject) => requests.push({context, resolve, reject})); }});
    return {scheduler, emitted, requests};
}

for (const outcome of ['success', 'authentication failure']) {
    test(`credential signal: fences old ${outcome} before account synchronization finishes`, async () => {
        const {scheduler, emitted, requests} = schedulerFixture();
        const running = scheduler.refresh('codex'); await flush();
        let finishSync;
        const sync = new Promise(resolve => { finishSync = resolve; });
        const extension = {_settings: {get_string: () => 'codex'}, _controller: scheduler, _syncProviders: () => sync};
        const changed = credentialSignal().call(extension);
        try {
            assertTrue(requests[0].context.isCancelled(), 'the old credential must be fenced before lookup settles');
            if (outcome === 'success') requests[0].resolve({metrics: [{id: 'w', kind: 'percent', window: 'week', percentUsed: 91}]});
            else requests[0].reject(new ProviderError('auth_required', 'old credential expired'));
            await running; await flush();
            assertEqual(emitted, []);
            assertEqual(requests.length, 2, 'one replacement fetch follows old settlement');
            requests[1].resolve({metrics: [{id: 'w', kind: 'percent', window: 'week', percentUsed: 12}]});
            await flush();
            assertEqual(emitted.map(snapshot => [snapshot.state, snapshot.metrics[0].percentUsed]), [['ok', 12]]);
        } finally {
            finishSync(); await changed;
            requests.forEach(request => request.resolve({metrics: []}));
            await flush(); scheduler.stop();
        }
    });
}

test('credential signal: a late synchronization after disable cannot refresh a replacement controller', async () => {
    const {scheduler, requests} = schedulerFixture();
    let finishSync;
    const sync = new Promise(resolve => { finishSync = resolve; });
    const extension = {_settings: {get_string: () => 'codex'}, _controller: scheduler, _syncProviders: () => sync};
    const changed = credentialSignal().call(extension);
    await flush();
    scheduler.stop();
    const replacement = schedulerFixture();
    extension._controller = replacement.scheduler;
    finishSync(); await changed; await flush();
    try { assertEqual(replacement.requests.length, 0); }
    finally {
        [...requests, ...replacement.requests].forEach(request => request.resolve({metrics: []}));
        await flush(); replacement.scheduler.stop();
    }
});

test('credential signal: an unknown touched provider does not fetch a registered account', async () => {
    const {scheduler, requests} = schedulerFixture();
    await credentialSignal().call({_settings: {get_string: () => 'unknown'}, _controller: scheduler, _syncProviders: async () => {}});
    await flush();
    assertEqual(requests.length, 0);
    scheduler.stop();
});
