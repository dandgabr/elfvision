import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {assertEqual, assertTrue, test, tmpDir} from './harness.js';
import {FONT_MANIFEST} from '../lib/core/fontManifest.js';

Gio._promisify(Gio.Subprocess.prototype, 'wait_async', 'wait_finish');

const bytes = new Uint8Array(32); bytes.set([0, 1, 0, 0]);
const hash = data => GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, data);
const fixtures = () => FONT_MANIFEST.map(file => ({...file, size: bytes.length, sha256: hash(bytes)}));
const file = path => Gio.File.new_for_path(path);
const children = path => {
    if (!file(path).query_exists(null)) return [];
    const list = file(path).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    const found = []; for (let child = list.next_file(null); child; child = list.next_file(null)) found.push(child.get_name());
    list.close(null); return found;
};
const transport = (data = bytes, extra = {}) => ({async open() {
    return {status: 200, contentLength: data.length, stream: Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(data)), ...extra};
}});
async function service() {
    try { return await import('../lib/services/fontInstaller.js'); }
    catch (_error) { assertTrue(false, 'bounded atomic font installer is implemented'); }
}
const licenseNames = [...new Set(FONT_MANIFEST.map(entry => entry.licenseFile))];
const licenses = Object.fromEntries(licenseNames.map(name => [name, 'synthetic test license']));
const options = directory => ({directory, manifest: fixtures(), transport: transport(), licenses, refresh: async () => true, verify: async () => true});

test('font service: verified streamed files publish as one private batch', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    const installer = new FontInstaller(options(directory));
    const result = await installer.install(['poppins-regular', 'poppins-bold']);
    assertEqual(result.status, 'installed'); assertEqual(result.restartRequired, false);
    assertTrue(result.batch.length < 128, 'the complete catalog has a bounded directory name');
    assertEqual(children(directory), [result.batch]);
    assertEqual(children(`${directory}/${result.batch}`).sort(), ['Poppins-Bold.ttf', 'Poppins-Regular.ttf', 'poppins-OFL.txt'].sort());
    assertEqual(file(`${directory}/${result.batch}/Poppins-Regular.ttf`).query_info('unix::mode', 0, null).get_attribute_uint32('unix::mode') & 0o777, 0o600);
    assertEqual(file(`${directory}/${result.batch}`).query_info('unix::mode', 0, null).get_attribute_uint32('unix::mode') & 0o777, 0o700);
    installer.destroy();
});

test('font service: Fontconfig inventory identifies visible families and their directory class', async () => {
    const {FontInstaller} = await service();
    const installer = new FontInstaller(options(`${tmpDir()}/fonts`));
    try {
        const inventory = await installer.fontInventory();
        assertTrue(['available', 'unavailable'].includes(inventory.status));
        assertTrue(Array.isArray(inventory.fonts));
        if (inventory.status === 'available')
            assertTrue(inventory.fonts.every(font => font.path.startsWith('/') && font.families.length > 0
                && ['user', 'system', 'other'].includes(font.source)));
    } finally { installer.destroy(); }
});

test('font service: identical existing files are recognized without redownload', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    let calls = 0; const input = options(directory); const source = input.transport;
    input.transport = {open(...args) { calls++; return source.open(...args); }};
    const installer = new FontInstaller(input);
    await installer.install(['inter-variable']); await installer.install(['inter-variable']);
    assertEqual(calls, 1); installer.destroy();
});

test('font service: identical existing files retry cache refresh and verify availability', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    const input = options(directory); let refreshes = 0, verifies = 0;
    input.refresh = async () => ++refreshes > 1;
    input.verify = async () => { verifies++; return true; };
    const installer = new FontInstaller(input);
    const first = await installer.install(['inter-variable']);
    const second = await installer.install(['inter-variable']);
    assertEqual([first.status, first.cacheStatus], ['installed', 'failed']);
    assertEqual([second.status, second.cacheStatus, second.fontconfigStatus], ['installed', 'refreshed', 'available']);
    assertEqual([refreshes, verifies], [2, 2]); installer.destroy();
});

test('font service: an existing conflicting user file is preserved', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    const installer = new FontInstaller(options(directory)); const first = await installer.install(['inter-variable']);
    const path = `${directory}/${first.batch}/Inter[opsz,wght].ttf`; GLib.file_set_contents(path, 'user font');
    let error; try { await installer.install(['inter-variable']); } catch (caught) { error = caught; }
    assertEqual(error?.message, 'existing_conflict');
    assertEqual(new TextDecoder().decode(GLib.file_get_contents(path)[1]), 'user font'); installer.destroy();
});

test('font service: wrong digest and nonfont headers leave no installed or staged files', async () => {
    const {FontInstaller} = await service();
    for (const kind of ['digest', 'header']) {
        const directory = `${tmpDir()}/fonts`; const input = options(directory);
        if (kind === 'digest') { const corrupt = bytes.slice(); corrupt[12] = 1; input.transport = transport(corrupt); }
        else { const html = new TextEncoder().encode('<html>not a font'); input.manifest = [{...fixtures()[0], id: 'poppins-regular', size: html.length, sha256: hash(html)}]; input.transport = transport(html); }
        const installer = new FontInstaller(input); let error;
        try { await installer.install(['poppins-regular']); } catch (caught) { error = caught; }
        assertEqual(error?.message, kind === 'digest' ? 'digest_mismatch' : 'invalid_font');
        assertEqual(children(directory), []); installer.destroy();
    }
});

test('font service: redirects stay inside the exact manifest address allowlist', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    const input = options(directory); input.transport = transport(bytes, {status: 302, location: 'https://evil.invalid/font.ttf'});
    const installer = new FontInstaller(input); let error;
    try { await installer.install(['poppins-regular']); } catch (caught) { error = caught; }
    assertEqual(error?.message, 'redirect_rejected'); assertEqual(children(directory), []); installer.destroy();
});

test('font service: counted streaming rejects a longer body without Content-Length', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    const input = options(directory); input.transport = transport(new Uint8Array(40), {contentLength: null});
    const installer = new FontInstaller(input); let error;
    try { await installer.install(['poppins-regular']); } catch (caught) { error = caught; }
    assertEqual(error?.message, 'size_limit'); assertEqual(children(directory), []); installer.destroy();
});

test('font service: cancellation during download removes staging and blocks late publication', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    const installer = new FontInstaller(options(directory)); let error;
    try { await installer.install(['poppins-regular'], {progress() { installer.cancel(); }}); } catch (caught) { error = caught; }
    assertEqual(error?.message, 'cancelled'); assertEqual(children(directory), []); installer.destroy();
});

test('font service: an app font directory symlink never redirects installation', async () => {
    const {FontInstaller} = await service(); const target = tmpDir(), parent = tmpDir();
    file(`${parent}/fonts`).make_symbolic_link(target, null);
    const installer = new FontInstaller(options(`${parent}/fonts`)); let error;
    try { await installer.install(['poppins-regular']); } catch (caught) { error = caught; }
    assertEqual(error?.message, 'unsafe_directory'); assertEqual(children(target), []); installer.destroy();
});

test('font service: short asynchronous writes still publish the complete verified font', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    const original = Gio.OutputStream.prototype.write_bytes_async;
    Gio.OutputStream.prototype.write_bytes_async = function (data, priority, cancellable) {
        return original.call(this, new GLib.Bytes(data.toArray().slice(0, 3)), priority, cancellable);
    };
    const installer = new FontInstaller(options(directory));
    try {
        const result = await installer.install(['poppins-regular']);
        assertEqual([...GLib.file_get_contents(`${directory}/${result.batch}/Poppins-Regular.ttf`)[1]], [...bytes]);
    } finally { Gio.OutputStream.prototype.write_bytes_async = original; installer.destroy(); }
});

test('font service: a valid reviewed redirect has a positive installation control', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`; const input = options(directory);
    let opens = 0; input.transport = {async open() { opens++; return {status: opens === 1 ? 302 : 200,
        location: input.manifest[0].url, contentLength: bytes.length, stream: Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(bytes))}; }};
    const installer = new FontInstaller(input); const result = await installer.install(['poppins-regular']);
    assertEqual(result.status, 'installed'); assertEqual(opens, 2); installer.destroy();
});

test('font service: deadline cancels stalled network reads with no late publication', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`; const input = options(directory); input.deadlineMs = 5;
    input.transport = {open(_url, cancellable) { return new Promise((_resolve, reject) => {
        cancellable.connect(() => reject(new Error('cancelled')));
    }); }};
    const installer = new FontInstaller(input); let error;
    try { await installer.install(['poppins-regular']); } catch (caught) { error = caught; }
    assertEqual(error?.message, 'cancelled'); assertEqual(children(directory), []); installer.destroy();
});

test('font service: discovery writes and cleanup never call synchronous filesystem APIs', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    const methods = ['query_info', 'make_directory', 'make_directory_with_parents', 'replace_contents', 'enumerate_children', 'delete', 'set_attribute_uint32'];
    const originals = Object.fromEntries(methods.map(name => [name, Gio.File.prototype[name]]));
    const installer = new FontInstaller(options(directory));
    for (const name of methods) Gio.File.prototype[name] = () => { throw new Error(`sync_io_${name}`); };
    let result;
    try { result = await installer.install(['poppins-regular']); }
    finally { for (const name of methods) Gio.File.prototype[name] = originals[name]; installer.destroy(); }
    assertEqual(result?.status, 'installed');
});

test('font service: destroy terminates a pending bounded cache refresh child', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`, binaries = tmpDir();
    const script = `${binaries}/fc-cache`;
    GLib.file_set_contents(script, '#!/usr/bin/python3\nimport time\ntime.sleep(60)\n');
    GLib.chmod(script, 0o700);
    const previous = GLib.getenv('PATH'); GLib.setenv('PATH', `${binaries}:${previous}`, true);
    const input = options(directory); input.refresh = null;
    const installer = new FontInstaller(input); let child;
    const pending = installer.install(['poppins-regular']);
    try {
        for (let i = 0; i < 100 && !installer._child; i++)
            await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        child = installer._child;
        assertTrue(child, 'cache refresh owns a live child');
        installer.destroy(); const result = await pending;
        assertEqual(result.status, 'installed'); assertEqual(result.restartRequired, true);
        assertEqual(installer._child, null);
        await child.wait_async(null);
        assertTrue(child.get_if_signaled() || child.get_if_exited(), 'cache child no longer runs after close');
    } finally { installer.destroy(); GLib.setenv('PATH', previous, true); }
});

test('font service: an incomplete pre-existing batch reports conflict without repairing user files', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`;
    const installer = new FontInstaller(options(directory)); const result = await installer.install(['poppins-regular']);
    file(`${directory}/${result.batch}/Poppins-Regular.ttf`).delete(null);
    let error; try { await installer.install(['poppins-regular']); } catch (caught) { error = caught; }
    assertEqual(error?.message, 'existing_conflict');
    assertEqual(children(`${directory}/${result.batch}`), ['poppins-OFL.txt']); installer.destroy();
});

test('font service: shipped exact-revision licenses are verified and included locally', async () => {
    const {FontInstaller} = await service(); const directory = `${tmpDir()}/fonts`; const input = options(directory); input.licenses = null;
    const installer = new FontInstaller(input); const result = await installer.install(FONT_MANIFEST.map(entry => entry.id));
    for (const name of licenseNames) {
        const text = new TextDecoder().decode(GLib.file_get_contents(`${directory}/${result.batch}/${name}`)[1]);
        assertTrue(text.includes('SIL OPEN FONT LICENSE Version 1.1'));
    }
    installer.destroy();
});

test('font service: post-commit callback and refresh failures preserve truthful installed state', async () => {
    const {FontInstaller} = await service();
    for (const kind of ['callback', 'refresh', 'cancel']) {
        const directory = `${tmpDir()}/fonts`; const input = options(directory);
        if (kind === 'refresh') input.refresh = async () => { throw new Error('refresh broke'); };
        let installer;
        if (kind === 'cancel') input.refresh = async () => { installer.cancel(); throw new Error('cancelled'); };
        installer = new FontInstaller(input);
        try {
            const result = await installer.install(['poppins-regular'], {committed() { if (kind === 'callback') throw new Error('view closed'); }});
            assertEqual(result.status, 'installed'); assertEqual(result.restartRequired, true);
            assertTrue(file(`${directory}/${result.batch}/Poppins-Regular.ttf`).query_exists(null));
        } finally { installer.destroy(); }
    }
});
