// Run with: gjs -m tests/run.js
import System from 'system';
import {runAll} from './harness.js';
import './core.test.js';
import './alerts.test.js';
import './alertText.test.js';
import './alertService.test.js';
import './scheduler.test.js';
import './theme.test.js';
import './http.test.js';
import './structure.test.js';
import './oauth.test.js';
import './tokenManager.test.js';
import './localConfig.test.js';
import './controller.test.js';
import './services.test.js';

System.exit(await runAll(ARGV.filter(arg => arg !== '--')[0] ?? '') ? 1 : 0);
