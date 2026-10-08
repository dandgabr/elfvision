/* global ARGV */
// Used only by connectorsDisk.sh under private XDG roots and a private session bus.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {getDisconnectGate} from '../lib/services/disconnectGate.js';
import {pause} from '../lib/services/disconnectStore.js';
import {createTokenManager} from '../lib/oauth/tokenManager.js';
const [mode, directory] = ARGV;
const target = 'codex--12345678-1234-4234-8234-123456789abc';
const exists = name => Gio.File.new_for_path(`${directory}/${name}`).query_exists(null);
const gate = getDisconnectGate(); await gate.ready();
if (mode === 'writer') {
    let stores = 0;
    const manager = createTokenManager({now: () => 1000,
        load: async () => ({gen: 'synthetic', access: 'synthetic-old', refresh: 'synthetic-refresh', expiresAt: 0}),
        captureTicket: () => gate.capture('codex'), assertTicket: ticket => gate.assertCurrent(ticket),
        refreshCall: async () => {
            GLib.file_set_contents(`${directory}/refresh-started`, 'synthetic');
            for (let index = 0; index < 200 && !exists('release-refresh'); index++) await pause(10);
            return {access: 'synthetic-new', refresh: 'synthetic-new-refresh', expiresAt: 100000};
        },
        save: async (_tokens, ticket) => gate.withCredentialWrite('codex', ticket, async () => { stores++; })});
    gate.registerCanceller(() => manager.reset());
    const result = await manager.accessToken().then(() => 'accepted', error => error.code);
    if (result !== 'disconnected' || stores !== 0) throw new Error('cross-process late rotation resurrected connector');
    print('PASS cross-process late connector rotation rejected with zero credential writes');
} else {
    const removed = [];
    const result = await gate.disconnect({removeCredential: async (id, kind) => { removed.push([id, kind]); return true; },
        removeFile: async () => true, clearStatus: async () => {}},
        {target: {id: target, provider: 'codex', kind: 'oauth-token'}});
    if (result.phase !== 'complete' || JSON.stringify(removed) !== JSON.stringify([[target, 'oauth-token']]) || result.credentials['command-code']['api-key'] !== 'preserved')
        throw new Error('scoped cross-process deletion damaged another identity');
    GLib.file_set_contents(`${directory}/release-refresh`, 'synthetic');
    print('PASS scoped durable cross-process deletion retains sibling credential scope');
}
await gate.close();
