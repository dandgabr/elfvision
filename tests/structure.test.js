// Structural rules of the code base (docs/adr/0009): which side may import what,
// and the shape of the provider registry.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {assertEqual, assertTrue, test, tmpDir} from './harness.js';
import {PROVIDERS, LIVE_PROVIDER_IDS, DEMO_PROVIDERS, availableDemoProviders, providerMeta} from '../lib/providers/registry.js';

const root = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', '')));
const decoder = new TextDecoder();

function sources(directory) {
    const found = [];
    const walk = relative => {
        const enumerator = Gio.File.new_for_path(`${root}/${relative}`)
            .enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
            const path = `${relative}/${info.get_name()}`;
            if (info.get_file_type() === Gio.FileType.DIRECTORY)
                walk(path);
            else if (path.endsWith('.js'))
                found.push(path);
        }
    };
    walk(directory);
    return found;
}

const text = path => decoder.decode(GLib.file_get_contents(`${root}/${path}`)[1]);
const imports = path => [...text(path).matchAll(/^import .*? from '([^']+)'|^import '([^']+)'/gm)].map(m => m[1] ?? m[2]);
const offenders = (paths, banned) =>
    paths.flatMap(path => imports(path).filter(spec => banned.some(b => spec.startsWith(b))).map(spec => `${path}: ${spec}`));

const SHELL_SIDE = ['gi://St', 'gi://Shell', 'gi://Clutter', 'gi://Meta', 'resource:///org/gnome/shell'];
const PREFS_SIDE = ['gi://Adw', 'gi://Gtk', 'gi://Gdk'];

test('structure: the pure core and the registry import no gi:// module', () => {
    const pure = [...sources('lib/core'), 'lib/providers/registry.js', 'lib/oauth/pkce.js', 'lib/oauth/callback.js', 'lib/oauth/protocol.js', 'lib/oauth/secret.js', 'lib/oauth/tokenManager.js'];
    assertEqual(offenders(pure, ['gi://']), []);
});

test('structure: the core depends on nothing outside the core', () => {
    const outside = sources('lib/core').flatMap(path =>
        imports(path).filter(spec => spec.startsWith('.') && !spec.startsWith('./')).map(spec => `${path}: ${spec}`));
    assertEqual(outside, []);
});

test('structure: shell toolkit modules stay on the shell side', () => {
    const outside = [...sources('lib'), 'prefs.js'].filter(path =>
        !path.startsWith('lib/ui/') && path !== 'lib/services/themeManager.js');
    assertEqual(offenders(outside, SHELL_SIDE), []);
});

test('structure: GTK and Adwaita stay in the preferences window', () => {
    const outside = [...sources('lib'), 'extension.js'].filter(path => !path.startsWith('lib/prefs/'));
    assertEqual(offenders(outside, PREFS_SIDE), []);
});

test('structure: the system bus is reached from the services only', () => {
    const outside = [...sources('lib'), 'extension.js', 'prefs.js'].filter(path => !path.startsWith('lib/services/'));
    assertEqual(outside.filter(path => /\bGio\.DBus\b|\bDBusProxy\b/.test(text(path))), []);
});

test('registry: ordered, unique, and only complete providers are available', () => {
    assertEqual(PROVIDERS.map(p => p.id), ['command-code', 'codex', 'claude', 'antigravity', 'openai-api', 'anthropic-api', 'cursor', 'openrouter']);
    assertEqual(new Set(PROVIDERS.map(p => p.id)).size, PROVIDERS.length);
    assertEqual(LIVE_PROVIDER_IDS, ['command-code', 'codex', 'claude', 'antigravity', 'openai-api', 'anthropic-api', 'cursor', 'openrouter']);
    for (const meta of PROVIDERS) {
        assertTrue(['api-key', 'oauth-pkce'].includes(meta.auth), meta.id);
        assertTrue(GLib.file_test(`${root}/icons/${meta.id}-symbolic.svg`, GLib.FileTest.IS_REGULAR), `${meta.id} has a packaged provider icon`);
        assertTrue(meta.apiHosts.every(host => /^[a-z0-9.-]+$/.test(host)), `${meta.id} hosts`);
    }
    assertEqual([providerMeta('claude').terms, providerMeta('antigravity').terms], ['terms', 'strong']);
    assertEqual(providerMeta('command-code').terms, null);
    assertEqual(providerMeta('nope'), undefined);
    assertEqual(DEMO_PROVIDERS.map(meta => meta.id), ['example-credits']);
    assertEqual(availableDemoProviders().map(meta => meta.id), [...LIVE_PROVIDER_IDS, 'example-credits']);
    assertTrue(!LIVE_PROVIDER_IDS.includes('example-credits'));
    assertEqual(PROVIDERS.filter(meta => meta.quotaSupport === 'unavailable').map(meta => [meta.id, meta.apiHosts]), []);
});

// ---- secrets stay out of the repository (docs/adr/0003, 0009)

import {readLocalConfig} from '../lib/services/localConfig.js';

const git = (...args) => {
    const [, stdout] = GLib.spawn_sync(root, ['git', ...args], null, GLib.SpawnFlags.SEARCH_PATH, null);
    return decoder.decode(stdout ?? new Uint8Array());
};

test('secrets: no value of the local configuration appears in the repository or its history', () => {
    const {providers} = readLocalConfig();
    const values = Object.values(providers).flatMap(p => [p.clientId, p.clientSecret]).filter(v => v && v.length >= 8);
    if (values.length === 0)
        console.log('    (no local configuration here: the check has nothing to compare)');
    for (const value of values) {
        assertEqual(git('grep', '-F', '-l', '--', value), '', 'a local value is in a tracked file');
        assertEqual(git('log', '--all', '-S', value, '--oneline'), '', 'a local value is in the history');
    }
});

test('secrets: no tracked file holds a token whose hash is on the known-ids list', () => {
    const known = new Set(text('tests/known-ids.sha256').split('\n').map(line => line.trim().toLowerCase()).filter(line => /^[0-9a-f]{64}$/.test(line)));
    if (known.size === 0)
        return;
    for (const file of git('ls-files', '-z').split('\0').filter(Boolean)) {
        if (/\.(png|svg|mo|gresource|compiled)$/.test(file))
            continue;
        // Every run of letters and digits that could be an id, wherever it sits: after a dot, in a path, in a URL.
        for (const word of new Set((text(file).match(/[A-Za-z0-9_-]{20,}/g) ?? []))) {
            const checksum = new GLib.Checksum(GLib.ChecksumType.SHA256);
            checksum.update(new TextEncoder().encode(word));
            assertTrue(!known.has(checksum.get_string()), `${file} holds a known client id`);
        }
    }
});

// ---- the secret check itself: it must find what it is meant to find (positive controls)

const CHECKER = `${root}/tools/check-secrets.py`;

function run(cwd, argv, env = []) {
    const [, stdout, stderr, status] = GLib.spawn_sync(cwd, argv, [...GLib.get_environ(), ...env], GLib.SpawnFlags.SEARCH_PATH, null);
    return {out: decoder.decode(stdout ?? new Uint8Array()), err: decoder.decode(stderr ?? new Uint8Array()), ok: status === 0};
}

/** A scratch repository with `files` staged, and the checker run in it with no local config. */
function checkStaged(files, {knownHashes = ''} = {}) {
    const repo = tmpDir();
    run(repo, ['git', 'init', '-q']);
    GLib.mkdir_with_parents(`${repo}/tests`, 0o755);
    GLib.file_set_contents(`${repo}/tests/known-ids.sha256`, knownHashes);
    for (const [name, content] of Object.entries(files))
        GLib.file_set_contents(`${repo}/${name}`, content);
    run(repo, ['git', 'add', '-A']);
    return run(repo, ['python3', '-I', CHECKER], [`XDG_CONFIG_HOME=${repo}/none`]);
}

test('secret check: a clean change passes', () => {
    assertEqual(checkStaged({'notes.md': 'nothing to see here, just words and a path/to/file.js\n'}).ok, true);
});

test('secret check: credential formats are found, and the finding does not print the secret', () => {
    const secret = `GOCSPX-${'a1B2c3D4'.repeat(4)}`;
    const jwt = `eyJ${'a'.repeat(20)}.eyJ${'b'.repeat(20)}.${'c'.repeat(20)}`;
    // Built here, so this file does not itself contain what the checker looks for.
    const key = `-----BEGIN ${'RSA PRIVATE'} KEY-----\n`;
    for (const [content, kind] of [[secret, 'a Google client secret'], [jwt, 'a JSON web token'], [key, 'a private key'], [`sk-${'x'.repeat(30)}`, 'an API token']]) {
        const result = checkStaged({'config.txt': `value = ${content}\n`});
        assertEqual(result.ok, false);
        assertTrue(result.err.includes(kind), result.err);
        assertTrue(!result.err.includes(content.slice(0, 20)), 'the secret was printed');
    }
});

test('secret check: a word whose hash is on the known list is found, wherever it sits', () => {
    const id = 'app_FakeIdForTheTest12345678';
    const checksum = new GLib.Checksum(GLib.ChecksumType.SHA256);
    checksum.update(new TextEncoder().encode(id));
    const hashes = `${checksum.get_string()}\n`;
    for (const content of [`id=${id}`, `see ${id}.`, `https://x.test/path/${id}/more`]) {
        const result = checkStaged({'doc.md': `${content}\n`}, {knownHashes: hashes});
        assertEqual([content, result.ok, result.err.includes('known client id')], [content, false, true]);
    }
    assertEqual(checkStaged({'doc.md': 'app_SomethingElseEntirely12345\n'}, {knownHashes: hashes}).ok, true);
});

test('structure: what the alert code subscribes to, it also lets go of', () => {
    for (const path of ['lib/ui/notifier.js', 'lib/services/alertService.js', 'lib/services/power.js']) {
        const source = text(path);
        const pairs = [[/\.connect\(/g, /\.disconnect\(/g], [/\.setTimeout\(/g, /\.clearTimeout\(/g], [/signal_subscribe\(/g, /signal_unsubscribe\(/g]];
        for (const [open, close] of pairs) {
            const opened = (source.match(open) ?? []).length;
            assertTrue(opened === 0 || (source.match(close) ?? []).length > 0, `${path}: ${open} without ${close}`);
        }
    }
});

import {KEPT_KEYS, RESET_KEYS, keysToReset} from '../lib/core/defaults.js';

test('defaults: every setting is either restored or kept, and none is both', () => {
    const directory = Gio.File.new_for_path(`${root}/schemas`);
    const enumerator = directory.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    let xml = '';
    for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
        if (info.get_name().endsWith('.gschema.xml'))
            xml += text(`schemas/${info.get_name()}`);   // every schema file, not only the last
    }
    const keys = [...xml.matchAll(/<key name="([^"]+)"/g)].map(match => match[1]);
    assertTrue(keys.length > 20, 'the schema was read');
    assertEqual(keys.filter(key => !RESET_KEYS.includes(key) && !KEPT_KEYS.includes(key)), []);
    assertEqual([...RESET_KEYS, ...KEPT_KEYS].filter(key => !keys.includes(key)), []);   // no stale names
    assertEqual(RESET_KEYS.filter(key => KEPT_KEYS.includes(key)), []);
    assertEqual(new Set([...RESET_KEYS, ...KEPT_KEYS]).size, RESET_KEYS.length + KEPT_KEYS.length);
    assertEqual(keysToReset(['theme', 'account-status', 'nope']), ['theme']);
});
