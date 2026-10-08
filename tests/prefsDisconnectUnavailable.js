import {credentialPresence} from '../lib/services/secrets.js';
let refused = false;
try { await credentialPresence('codex', 'api-key'); } catch (_error) { refused = true; }
if (!refused) throw new Error('unavailable keyring incorrectly reported absence');
print('PASS unavailable keyring does not report absence');
