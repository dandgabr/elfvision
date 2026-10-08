// Run only through disconnectSecrets.sh: private bus, empty private keyring and all XDG roots.
import Secret from 'gi://Secret';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {disconnectAll} from '../lib/services/disconnectAll.js';
import {getDisconnectGate} from '../lib/services/disconnectGate.js';
import {storeSecret, clearSecret, enumerateConnectorIdentities, credentialPresence, eraseCredential, lookupSecret, API_KEY, OAUTH_TOKENS} from '../lib/services/secrets.js';
const schema = new Secret.Schema('org.gnome.shell.extensions.gnome-ai-quota', Secret.SchemaFlags.NONE,
    {provider: Secret.SchemaAttributeType.STRING, kind: Secret.SchemaAttributeType.STRING});
const rawStore = (provider, kind) => new Promise((resolve, reject) => Secret.password_store(schema, {provider, kind}, Secret.COLLECTION_DEFAULT,
    'GAQ synthetic disconnect fixture', 'synthetic-test-value', null, (_s, result) => {
        try { Secret.password_store_finish(result); resolve(); } catch (error) { reject(error); }
    }));
const rawPresence = (provider, kind) => new Promise((resolve, reject) => Secret.Service.get(Secret.ServiceFlags.NONE, null, (_s, result) => {
    try {
        const service = Secret.Service.get_finish(result);
        service.search(schema, {provider, kind}, Secret.SearchFlags.ALL, null, (_s, found) => {
            try { resolve(service.search_finish(found).length ? 'present' : 'absent'); } catch (error) { reject(error); }
        });
    } catch (error) { reject(error); }
}));
const check = (value, message) => { if (!value) throw new Error(message); };
const gate = getDisconnectGate(); await gate.ready(); const ticket = await gate.capture('codex');
await storeSecret('codex', API_KEY, 'synthetic-test-value', 'GAQ synthetic disconnect fixture', {ticket});
await storeSecret('codex', OAUTH_TOKENS, 'synthetic-test-value', 'GAQ synthetic disconnect fixture', {ticket});
const connectorA = 'codex--12345678-1234-4234-8234-123456789abc';
const connectorB = 'codex--12345678-1234-4234-8234-123456789abd';
await storeSecret(connectorA, OAUTH_TOKENS, 'synthetic-account-a', 'Synthetic A', {ticket});
await storeSecret(connectorB, OAUTH_TOKENS, 'synthetic-account-b', 'Synthetic B', {ticket});
check(await lookupSecret(connectorA, OAUTH_TOKENS) === 'synthetic-account-a', 'first exact connector read');
check(await lookupSecret(connectorB, OAUTH_TOKENS) === 'synthetic-account-b', 'second exact connector read');
await eraseCredential('codex', OAUTH_TOKENS);
check(await credentialPresence(connectorA, OAUTH_TOKENS) === 'present', 'legacy subset cannot delete new schema');
const recoveredMetadata = await enumerateConnectorIdentities();
check(recoveredMetadata.some(entry => entry.id === connectorA) && recoveredMetadata.some(entry => entry.id === connectorB), 'metadata recovery sees both exact connectors');
check(recoveredMetadata.every(entry => Object.keys(entry).sort().join(',') === 'id,providerId'), 'metadata recovery returns no secret or labels');
const quotaDirectory = `${GLib.get_user_cache_dir()}/gnome-ai-quota`;
GLib.mkdir_with_parents(quotaDirectory, 0o700);
const quota = {version: 1, savedAt: 123, snapshots: [{id: connectorA, metrics: [{balance: 4}]}, {id: connectorB, metrics: [{balance: 9}]}]};
const history = {version: 2, levels: {[`${connectorA}|week`]: {fired: true}, [`${connectorB}|week`]: {fired: true}}, connection: {[connectorA]: {cause: 'auth'}, [connectorB]: {cause: 'auth'}}, sent: [123]};
for (const [name, value] of [['snapshots', quota], ['alerts', history]]) {
    GLib.file_set_contents(`${quotaDirectory}/${name}.json`, JSON.stringify(value)); GLib.chmod(`${quotaDirectory}/${name}.json`, 0o600);
}
await clearSecret(connectorA, OAUTH_TOKENS, {gate});
const cacheRead = name => JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${quotaDirectory}/${name}.json`)[1]));
check(JSON.stringify(cacheRead('snapshots')) === JSON.stringify({...quota, snapshots: [quota.snapshots[1]]}), 'exact target quota pruned while sibling kept');
check(JSON.stringify(cacheRead('alerts')) === JSON.stringify({...history, levels: {[`${connectorB}|week`]: {fired: true}}, connection: {[connectorB]: {cause: 'auth'}}}), 'exact target alert history pruned while sibling kept');
print('PASS metadata-only identity recovery and exact native-cache pruning preserve sibling state');

check(await credentialPresence(connectorA, OAUTH_TOKENS) === 'absent', 'target connector removed');
check(await credentialPresence(connectorB, OAUTH_TOKENS) === 'present', 'sibling preserved');
let staleRejected = false;
try { await storeSecret(connectorA, OAUTH_TOKENS, 'synthetic-late', 'Synthetic stale', {gate, ticket}); } catch (_) { staleRejected = true; }
check(staleRejected, 'old same-provider ticket cannot resurrect removed connector');
await storeSecret('codex', OAUTH_TOKENS, 'synthetic-test-value', 'Synthetic restored legacy', {ticket: await gate.capture('codex')});
print('PASS independent connector namespaces, legacy subset protection, exact deletion and stale-ticket fencing');
await rawStore('unrelated-test', API_KEY); await rawStore('codex', 'unrelated-kind');
check(await credentialPresence('codex', API_KEY) === 'present', 'fixture is present');
check(await eraseCredential('codex', API_KEY), 'exact known item absent after clear');
check(await eraseCredential('codex', API_KEY), 'absence remains idempotent');
check(await credentialPresence('codex', OAUTH_TOKENS) === 'present', 'other kind preserved');
check(await rawPresence('unrelated-test', API_KEY) === 'present', 'other provider preserved');
check(await rawPresence('codex', 'unrelated-kind') === 'present', 'unknown kind preserved');
print('PASS exact presence-only keyring deletion, absent idempotence and unrelated-item preservation');
const directory = `${GLib.get_user_cache_dir()}/gnome-ai-quota`;
GLib.mkdir_with_parents(directory, 0o700);
for (const name of ['snapshots.json', 'alerts.json', 'keep-user-data.json']) GLib.file_set_contents(`${directory}/${name}`, '{}');
const changes = [], settings = {set_value: key => changes.push(key), set_string: key => changes.push(key),
    set_int: key => changes.push(key), get_int: () => 1};
const result = await disconnectAll({settings, gate, directory});
check(result.phase === 'complete', 'full local transaction succeeds');
check(await credentialPresence('codex', OAUTH_TOKENS) === 'absent', 'known remaining credential removed');
check(await credentialPresence(connectorB, OAUTH_TOKENS) === 'absent', 'disconnect-all includes unregistered connector namespace');
check(await rawPresence('unrelated-test', API_KEY) === 'present', 'unrelated keyring item still preserved');
check(await rawPresence('codex', 'unrelated-kind') === 'present', 'unknown keyring kind still preserved');
check(!Gio.File.new_for_path(`${directory}/snapshots.json`).query_exists(null) && !Gio.File.new_for_path(`${directory}/alerts.json`).query_exists(null), 'exact cache files removed');
check(Gio.File.new_for_path(`${directory}/keep-user-data.json`).query_exists(null), 'other files preserved');
check(JSON.stringify(changes) === JSON.stringify(['account-status', 'credentials-touched', 'credentials-revision']), 'only status IPC changed, preferences retained');
print('PASS full private-keyring transaction removes exact live cache files and preserves unrelated data/settings');
await gate.close();
