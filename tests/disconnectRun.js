import System from 'system';
import {runAll} from './harness.js';
import './disconnect.test.js';
System.exit(await runAll(ARGV[0] ?? '') ? 1 : 0);
