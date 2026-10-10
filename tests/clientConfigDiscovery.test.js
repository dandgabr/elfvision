import {test, assertEqual, assertTrue} from './harness.js';
import {createClientConfigDiscovery} from '../lib/prefs/clientConfigDiscovery.js';

test('OAuth client discovery: the UI runner starts only the selected provider helper and suppresses output', async () => {
    let argv, forced = 0;
    const discovery = createClientConfigDiscovery({extensionPath: '/extension', spawn: args => {
        argv = args;
        return {wait_check_async: async () => true, force_exit: () => forced++};
    }});
    assertTrue(await discovery.run('claude'));
    assertEqual(argv, ['python3', '-I', '/extension/tools/import-client-ids.py', 'claude']);
    assertEqual(forced, 1);
});

test('OAuth client discovery: unsupported providers never spawn a process', async () => {
    let spawned = false;
    const discovery = createClientConfigDiscovery({extensionPath: '/extension', spawn: () => { spawned = true; }});
    let unsupported = false;
    try { await discovery.run('openai-api'); } catch (error) { unsupported = error.code === 'unsupported'; }
    assertTrue(unsupported && !spawned);
});
