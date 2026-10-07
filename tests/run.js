// Run with: gjs -m tests/run.js
import System from 'system';
import {runAll} from './harness.js';
import './core.test.js';
import './scheduler.test.js';
import './theme.test.js';
import './http.test.js';
import './structure.test.js';
import './oauth.test.js';
import './tokenManager.test.js';

System.exit(await runAll() ? 1 : 0);
