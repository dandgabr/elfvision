import GLib from 'gi://GLib';
import {createDisconnectGate} from '../lib/core/disconnect.js';
import {createDisconnectStore, processIdentity, processAlive, pause} from '../lib/services/disconnectStore.js';
const identity = await processIdentity();
const alive = owner => processAlive(owner, identity.boot);
const store = createDisconnectStore({directory: ARGV[0], identity});
const gate = createDisconnectGate({store, identity, alive, uuid: GLib.uuid_string_random, sleep: pause, now: Date.now,
    providers: ['codex'], kinds: ['api-key', 'oauth-token'], drainMs: 100});
await gate.ready();
if (ARGV[1] === 'hold') {
    await gate.withCredentialWrite('codex', await gate.capture('codex'), async () => { print('issued'); await pause(60000); });
} else if (ARGV[1] === 'remove') {
    const result = await gate.disconnect({removeCredential: async () => true, removeFile: async () => true, clearStatus: async () => {}});
    print(JSON.stringify(result));
} else {
    const ticket = await gate.capture('codex'); await gate.withCredentialWrite('codex', ticket, async () => {}); print('stored');
}
await gate.close();
