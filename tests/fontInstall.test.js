import {assertEqual, assertTrue, flush, test} from './harness.js';

async function core() {
    try {
        return await import('../lib/core/fontInstall.js');
    } catch (_error) {
        assertTrue(false, 'font consent controller is implemented');
    }
}

test('fonts: denied consent performs no installation', async () => {
    const {FontInstallController} = await core();
    let installs = 0;
    const controller = new FontInstallController({confirm: async () => false, installer: {install: async () => installs++, cancel() {}}, changed() {}});
    await controller.start();
    assertEqual(installs, 0);
    assertEqual(controller.state.status, 'cancelled');
});

test('fonts: accepted explicit consent installs the maintained plan', async () => {
    const {FontInstallController} = await core();
    let received;
    const controller = new FontInstallController({confirm: async plan => plan.files.length === 4,
        installer: {install: async ids => { received = ids; return {status: 'installed', restartRequired: false}; }, cancel() {}}, changed() {}});
    await controller.start();
    assertEqual(received, ['poppins-regular', 'poppins-bold', 'inter-variable', 'jetbrains-mono-variable']);
    assertEqual(controller.state.status, 'installed');
});

test('fonts: closing during confirmation invalidates a late answer', async () => {
    const {FontInstallController} = await core();
    let resolve, installs = 0;
    const controller = new FontInstallController({confirm: () => new Promise(done => { resolve = done; }),
        installer: {install: async () => installs++, cancel() {}}, changed() {}});
    const pending = controller.start();
    await flush(); controller.destroy(); resolve(true); await pending;
    assertEqual(installs, 0);
});

test('fonts: cancellation suppresses stale progress and completion', async () => {
    const {FontInstallController} = await core();
    let resolve, progress, cancels = 0;
    const controller = new FontInstallController({confirm: async () => true,
        installer: {install: (_ids, options) => { progress = options.progress; return new Promise(done => { resolve = done; }); }, cancel() { cancels++; }}, changed() {}});
    const pending = controller.start(); await flush();
    controller.cancel(); progress({bytes: 1}); resolve({status: 'installed'}); await pending;
    assertEqual(controller.state.status, 'cancelled'); assertEqual(cancels, 1);
});

test('fonts: manifest pins bounded TTF files and rejects untrusted paths and oversized plans', async () => {
    const {fontPlan, allowedFontUrl, hasFontHeader, FONT_MANIFEST} = await import('../lib/core/fontManifest.js');
    const plan = fontPlan();
    assertEqual(plan.files.length, 4); assertEqual(plan.bytes, 1380096);
    assertTrue(plan.files.every(file => /^[0-9a-f]{64}$/.test(file.sha256) && file.size <= 5 * 1024 * 1024));
    assertTrue(allowedFontUrl(FONT_MANIFEST[0].url));
    for (const url of ['http://raw.githubusercontent.com/x', FONT_MANIFEST[0].url.replace('raw.githubusercontent.com', 'evil.invalid'), `${FONT_MANIFEST[0].url}?track=1`])
        assertEqual(allowedFontUrl(url), false);
    assertTrue(hasFontHeader(new Uint8Array([0, 1, 0, 0, 0, 1])));
    assertEqual(hasFontHeader(new TextEncoder().encode('<html>')), false);
    for (const ids of [['unknown'], ['poppins-regular', 'poppins-regular'], Array(5).fill('inter-variable')]) {
        let error; try { fontPlan(ids); } catch (caught) { error = caught; }
        assertTrue(error, 'invalid plan rejected');
    }
});

test('fonts: atomic commit disables cancellation of an already installed batch', async () => {
    const {FontInstallController} = await core();
    let finish, cancels = 0;
    const controller = new FontInstallController({confirm: async () => true, changed() {}, installer: {
        install: (_ids, callbacks) => { callbacks.committed(); return new Promise(resolve => { finish = resolve; }); },
        cancel() { cancels++; },
    }});
    const pending = controller.start(); await flush();
    assertEqual(controller.state.status, 'installed');
    controller.cancel(); assertEqual(controller.state.status, 'installed'); assertEqual(cancels, 1);
    finish({restartRequired: true}); await pending;
    assertEqual(controller.state.restartRequired, true);
});

test('fonts: conflicts produce a fixed actionable reason without external error text', async () => {
    const {FontInstallController} = await core();
    for (const message of ['existing_conflict', 'server says secret-user-data']) {
        const controller = new FontInstallController({confirm: async () => true, changed() {},
            installer: {async install() { throw new Error(message); }, cancel() {}}});
        await controller.start(); assertEqual(controller.state.reason, message === 'existing_conflict' ? message : 'download_failed');
    }
});
