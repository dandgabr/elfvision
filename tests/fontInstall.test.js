import GLib from 'gi://GLib';
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
    const controller = new FontInstallController({confirm: async plan => plan.files.length === 36,
        installer: {install: async ids => { received = ids; return {status: 'installed', restartRequired: false}; }, cancel() {}}, changed() {}});
    await controller.start();
    assertEqual(received.length, 36);
    assertTrue(received.includes('archivo-variable') && received.includes('source-serif-4-variable'));
    assertEqual(controller.state.status, 'installed');
});

test('fonts: published files stay installed while cache and Shell visibility are checked', async () => {
    const {FontInstallController} = await core();
    let resolve, cancels = 0;
    const controller = new FontInstallController({confirm: async () => true, refreshShell: async () => 'available', changed() {}, installer: {
        install: (_ids, callbacks) => { callbacks.committed(); return new Promise(done => { resolve = done; }); },
        cancel() { cancels++; },
    }});
    const pending = controller.start(); await flush();
    assertEqual(controller.state.status, 'verifying');
    controller.cancel();
    resolve({status: 'installed', cacheStatus: 'refreshed', fontconfigStatus: 'available', restartRequired: false});
    await pending;
    assertEqual([controller.state.status, controller.state.shellStatus, controller.state.restartRequired, cancels], ['installed', 'available', false, 1]);
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
    assertEqual(plan.files.length, 36);
    assertEqual(plan.bytes, plan.files.reduce((total, entry) => total + entry.size, 0));
    assertTrue(FONT_MANIFEST.length <= 48, 'the reviewed catalog fits the bounded action');
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

test('fonts: every Google Fonts family named by a built-in theme is in the reviewed manifest', async () => {
    const {FONT_MANIFEST} = await import('../lib/core/fontManifest.js');
    const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
    const ids = GLib.Dir.open(`${root}/themes/builtin`, 0);
    const families = new Set();
    for (let id = ids.read_name(); id !== null; id = ids.read_name()) {
        const path = `${root}/themes/builtin/${id}/theme.json`;
        const theme = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(path)[1]));
        const urls = theme.fonts?.googleFontsUrl ?? '';
        for (const match of urls.matchAll(/family=([^:&]+)/g))
            families.add(decodeURIComponent(match[1].replaceAll('+', ' ')));
    }
    const reviewed = new Set(FONT_MANIFEST.map(entry => entry.family.toLowerCase()));
    for (const family of families)
        assertTrue(reviewed.has(family.toLowerCase()), `${family} needs a reviewed local font asset`);
});

test('fonts: theme coverage distinguishes user, system, fallback and missing faces', async () => {
    const {fontSource, parseFontconfigList, themeFontCoverage} = await import('../lib/core/fontCoverage.js');
    const records = parseFontconfigList('Inter\t/home/daniel/.local/share/fonts/inter.ttf\nDejaVu Sans\t/usr/share/fonts/dejavu.ttf\n');
    for (const record of records)
        record.source = fontSource(record.path, '/home/daniel/.local/share', '/home/daniel');
    const theme = {fonts: {
        body: {name: 'Inter', fallbacks: ['DejaVu Sans']},
        display: {name: 'Missing Display', fallbacks: ['DejaVu Sans']},
        mono: {name: 'Missing Mono', fallbacks: []},
    }};
    assertEqual(themeFontCoverage(theme, records), {
        body: {status: 'available', family: 'Inter', source: 'user'},
        display: {status: 'fallback', family: 'DejaVu Sans', source: 'system'},
        mono: {status: 'missing', family: 'Missing Mono', source: null},
    });
    assertEqual(fontSource('/root/.local/share/fonts/private.ttf', '/home/daniel/.local/share', '/home/daniel'), 'other');
});

test('fonts: atomic commit disables cancellation of an already installed batch', async () => {
    const {FontInstallController} = await core();
    let finish, cancels = 0;
    const controller = new FontInstallController({confirm: async () => true, changed() {}, installer: {
        install: (_ids, callbacks) => { callbacks.committed(); return new Promise(resolve => { finish = resolve; }); },
        cancel() { cancels++; },
    }});
    const pending = controller.start(); await flush();
    assertEqual(controller.state.status, 'verifying');
    controller.cancel(); assertEqual(controller.state.status, 'verifying'); assertEqual(cancels, 1);
    finish({restartRequired: true}); await pending;
    assertEqual(controller.state.restartRequired, true);
});

test('fonts: cancelling the Shell check ends verification and keeps installed state truthful', async () => {
    const {FontInstallController} = await core();
    let finishRefresh, resolveInstall;
    const controller = new FontInstallController({confirm: async () => true, changed() {},
        refreshShell: () => new Promise(resolve => { finishRefresh = resolve; }),
        cancelShellRefresh: () => finishRefresh?.('cancelled'),
        installer: {install: (_ids, callbacks) => { callbacks.committed(); return new Promise(resolve => { resolveInstall = resolve; }); }, cancel() {}},
    });
    const pending = controller.start(); await flush();
    resolveInstall({status: 'installed', cacheStatus: 'refreshed', fontconfigStatus: 'available', restartRequired: false});
    await flush(); assertEqual(controller.state.status, 'verifying');
    controller.cancel(); await pending;
    assertEqual([controller.state.status, controller.state.shellStatus, controller.state.restartRequired], ['installed', 'cancelled', true]);
});

test('fonts: conflicts produce a fixed actionable reason without external error text', async () => {
    const {FontInstallController} = await core();
    for (const message of ['existing_conflict', 'server says secret-user-data']) {
        const controller = new FontInstallController({confirm: async () => true, changed() {},
            installer: {async install() { throw new Error(message); }, cancel() {}}});
        await controller.start(); assertEqual(controller.state.reason, message === 'existing_conflict' ? message : 'download_failed');
    }
});
