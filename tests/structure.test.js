// Structural rules of the code base (docs/adr/0009): which side may import what,
// and the shape of the provider registry.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {assertEqual, assertTrue, test} from './harness.js';
import {PROVIDERS, LIVE_PROVIDER_IDS, providerMeta} from '../lib/providers/registry.js';

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
    const pure = [...sources('lib/core'), 'lib/providers/registry.js', 'lib/providers/errors.js', 'lib/oauth/pkce.js', 'lib/oauth/callback.js', 'lib/oauth/protocol.js', 'lib/oauth/secret.js', 'lib/oauth/tokenManager.js'];
    assertEqual(offenders(pure, ['gi://']), []);
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

test('registry: ordered, unique, and only complete providers are available', () => {
    assertEqual(PROVIDERS.map(p => p.id), ['command-code', 'codex', 'claude', 'antigravity']);
    assertEqual(new Set(PROVIDERS.map(p => p.id)).size, PROVIDERS.length);
    assertEqual(LIVE_PROVIDER_IDS, ['command-code', 'codex']);
    for (const meta of PROVIDERS) {
        assertTrue(['api-key', 'oauth-pkce'].includes(meta.auth), meta.id);
        assertTrue(meta.apiHosts.every(host => /^[a-z0-9.-]+$/.test(host)), `${meta.id} hosts`);
    }
    assertEqual(providerMeta('claude').terms, 'terms');
    assertEqual(providerMeta('command-code').terms, null);
    assertEqual(providerMeta('nope'), undefined);
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
