// Run only through disconnectSecrets.sh: private bus, empty private keyring and all XDG roots.
import Secret from 'gi://Secret';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {disconnectAll} from '../lib/services/disconnectAll.js';
import {getDisconnectGate} from '../lib/services/disconnectGate.js';
import {storeSecret, credentialPresence, eraseCredential, API_KEY, OAUTH_TOKENS} from '../lib/services/secrets.js';
const schema = new Secret.Schema('org.gnome.shell.extensions.gnome-ai-quota', Secret.SchemaFlags.NONE,
    {provider: Secret.SchemaAttributeType.STRING, kind: Secret.SchemaAttributeType.STRING});
const rawStore = (provider, kind) => new Promise((resolve, reject) => Secret.password_store(schema, {provider, kind}, Secret.COLLECTION_DEFAULT,
    'GAQ synthetic disconnect fixture', 'synthetic-test-value', null, (_s, result) => {
        try { Secret.password_store_finish(result); resolve(); } catch (error) { reject(error); }
    }));
const check = (value, message) => { if (!value) throw new Error(message); };
const gate = getDisconnectGate(); await gate.ready(); const ticket = await gate.capture('codex');
await storeSecret('codex', API_KEY, 'synthetic-test-value', 'GAQ synthetic disconnect fixture', {ticket});
await storeSecret('codex', OAUTH_TOKENS, 'synthetic-test-value', 'GAQ synthetic disconnect fixture', {ticket});
await rawStore('unrelated-test', API_KEY); await rawStore('codex', 'unrelated-kind');
check(await credentialPresence('codex', API_KEY) === 'present', 'fixture is present');
check(await eraseCredential('codex', API_KEY), 'exact known item absent after clear');
check(await eraseCredential('codex', API_KEY), 'absence remains idempotent');
check(await credentialPresence('codex', OAUTH_TOKENS) === 'present', 'other kind preserved');
check(await credentialPresence('unrelated-test', API_KEY) === 'present', 'other provider preserved');
check(await credentialPresence('codex', 'unrelated-kind') === 'present', 'unknown kind preserved');
print('PASS exact presence-only keyring deletion, absent idempotence and unrelated-item preservation');
const directory = `${GLib.get_user_cache_dir()}/gnome-ai-quota`;
GLib.mkdir_with_parents(directory, 0o700);
for (const name of ['snapshots.json', 'alerts.json', 'keep-user-data.json']) GLib.file_set_contents(`${directory}/${name}`, '{}');
const changes = [], settings = {set_value: key => changes.push(key), set_string: key => changes.push(key),
    set_int: key => changes.push(key), get_int: () => 1};
const result = await disconnectAll({settings, gate, directory});
check(result.phase === 'complete', 'full local transaction succeeds');
check(await credentialPresence('codex', OAUTH_TOKENS) === 'absent', 'known remaining credential removed');
check(await credentialPresence('unrelated-test', API_KEY) === 'present', 'unrelated keyring item still preserved');
check(await credentialPresence('codex', 'unrelated-kind') === 'present', 'unknown keyring kind still preserved');
check(!Gio.File.new_for_path(`${directory}/snapshots.json`).query_exists(null) && !Gio.File.new_for_path(`${directory}/alerts.json`).query_exists(null), 'exact cache files removed');
check(Gio.File.new_for_path(`${directory}/keep-user-data.json`).query_exists(null), 'other files preserved');
check(JSON.stringify(changes) === JSON.stringify(['account-status', 'credentials-touched', 'credentials-revision']), 'only status IPC changed, preferences retained');
print('PASS full private-keyring transaction removes exact live cache files and preserves unrelated data/settings');
await gate.close();
