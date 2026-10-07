// Run with: gjs -m tests/run.js
import System from 'system';
import {runAll} from './harness.js';
import './core.test.js';
import './scheduler.test.js';
import './theme.test.js';

System.exit(await runAll() ? 1 : 0);
