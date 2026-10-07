import {assertEqual, test} from './harness.js';
import {firstUsePolicy, selectedProviders, connectionSummary, createLoginGate, connectableProviders, stepComplete} from '../lib/core/firstUse.js';
import {availableProviders} from '../lib/providers/registry.js';

test('first use: opens only for a new live user without an account target', () => {
    const fresh = {done: false, source: 'live', target: '', states: [{connected: false}, {hasKey: false}]};
    assertEqual(firstUsePolicy(fresh), 'open');
    assertEqual(firstUsePolicy({...fresh, done: true}), 'none');
    assertEqual(firstUsePolicy({...fresh, source: 'demo'}), 'none');
    assertEqual(firstUsePolicy({...fresh, target: 'claude'}), 'none');
    assertEqual(firstUsePolicy({...fresh, states: [{connected: null}]}), 'wait');
    assertEqual(firstUsePolicy({...fresh, states: [{connected: false, keyringDown: true}]}), 'wait');
    assertEqual(firstUsePolicy({...fresh, states: [{hasKey: true}]}), 'complete');
});

test('first use: selection is opt-in, in registry order, and filters unknown ids', () => {
    assertEqual(selectedProviders(availableProviders(), []).map(m => m.id), []);
    assertEqual(selectedProviders(availableProviders(), ['antigravity', 'claude', 'claude', 'bad']).map(m => m.id), ['claude', 'antigravity']);
});

test('first use: summary distinguishes saved, rejected, failed and skipped accounts', () => {
    const states = {
        'command-code': {hasKey: true, result: 'rejected'},
        codex: {connected: true}, claude: {connected: false, lastFailure: 'timeout'},
        antigravity: {connected: false},
    };
    assertEqual(connectionSummary(availableProviders(), ['command-code', 'codex', 'claude'], states).map(r => [r.id, r.status]),
        [['command-code', 'failed'], ['codex', 'connected'], ['claude', 'failed'], ['antigravity', 'skipped']]);
});

test('first use: a shared gate serializes sign-ins and stale release cannot free a new owner', () => {
    const gate = createLoginGate();
    assertEqual(gate.acquire('claude'), true);
    assertEqual(gate.acquire('codex'), false);
    gate.release('codex');
    assertEqual(gate.acquire('codex'), false);
    gate.release('claude');
    assertEqual(gate.acquire('codex'), true);
});

test('first use: completion and eligibility reflect account failures without blocking other providers', () => {
    const providers = availableProviders();
    const states = {'command-code': {hasKey: true}, codex: {connected: true, hasConfig: true},
        claude: {connected: false, hasConfig: false}, antigravity: {connected: false, hasConfig: true, keyringDown: true}};
    assertEqual(connectableProviders(providers, states).map(meta => meta.id), ['command-code', 'codex']);
    assertEqual(stepComplete('connect', ['command-code', 'codex'], states), true);
    assertEqual(stepComplete('connect', ['codex', 'claude'], states), false);
    assertEqual(stepComplete('providers', [], states), false);
    assertEqual(stepComplete('providers', ['codex'], states), true);
});


test('first use: unavailable keyring and API-save failure each override otherwise connected summary', () => {
    const states = {'command-code': {hasKey: false, lastFailure: 'save refused'}, codex: {connected: true, keyringDown: true}, claude: {connected: true}};
    assertEqual(connectionSummary(availableProviders(), ['command-code', 'codex'], states).map(r => [r.id, r.status]),
        [['command-code', 'failed'], ['codex', 'failed'], ['claude', 'connected'], ['antigravity', 'skipped']]);
});
