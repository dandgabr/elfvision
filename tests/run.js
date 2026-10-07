// Run with: gjs -m tests/run.js
import System from 'system';
import {runAll} from './harness.js';
import './core.test.js';

System.exit(runAll() ? 1 : 0);
