// Private metadata only: no provider, credential or user configuration access.
/* global ARGV */
import GLib from 'gi://GLib';
import {createDisconnectStore, processIdentity, pause} from '../lib/services/disconnectStore.js';

const identity = await processIdentity();
const store = createDisconnectStore({directory: ARGV[0], identity, lockMs: 1000});
if (ARGV[1] === 'owner') {
    const state = {version: 1, epoch: GLib.uuid_string_random(), participants: {}, leases: {}, transaction: null};
    if (ARGV[2] === 'participant') state.participants.owner = {identity};
    else if (ARGV[2] === 'lease') state.leases.owner = {identity};
    else state.transaction = {coordinator: identity};
    await store.transact(() => ({state})); print('owner ready'); await pause(60000);
} else if (ARGV[1] === 'seed') {
    await store.transact(() => ({state: {version: 1, epoch: 'stable-epoch', participants: {}, leases: {},
        blockedProviders: [], transaction: {phase: 'complete', credentials: {codex: {'api-key': 'absent', 'oauth-token': 'absent'}},
            files: {snapshots: 'absent', alerts: 'absent'}, status: 'cleared', problem: null}, legacyBoot: null}}));
} else if (ARGV[1] === 'read') {
    const before = JSON.stringify(await store.read());
    const after = await store.transact(state => ({value: state}));
    if (JSON.stringify(after) !== before) throw new Error('Durable metadata changed on session recovery');
    print('durable metadata preserved');
} else if (ARGV[1] === 'hold') {
    await store.transact(async state => {
        print('locked'); await pause(60000); return {state};
    });
} else if (ARGV[1] === 'failure') {
    let failed = false;
    try { await store.transact(() => { throw new Error('synthetic failure'); }); }
    catch (error) { if (error.message !== 'synthetic failure') throw error; failed = true; }
    if (!failed) throw new Error('Callback failure was swallowed');
    await store.transact(state => ({state, value: true}));
    print('released after callback failure');
} else {
    for (let i = 0; i < 12; i++) await store.transact(async state => {
        state ??= {version: 1, epoch: GLib.uuid_string_random(), count: 0};
        await pause(5); state.count++; return {state};
    });
    print('incremented');
}
