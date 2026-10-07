// Demo providers for milestone M1: they stand in for the real ones (M2 and
// later) and exercise every state the scheduler and the UI must handle.
// The scenario is chosen by the `demo-scenario` setting.

import {demoSnapshots} from '../core/fixtures.js';
import {ProviderError} from '../core/errors.js';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

export const SCENARIOS = ['steady', 'flaky', 'drift'];

/**
 * What each provider does on its successive fetches in the `flaky` scenario.
 * A string is an error code, `rate_limited:N` adds a retry hint of N seconds,
 * `ok` is a normal fetch. The sequence repeats.
 */
const FLAKY_STEPS = {
    'command-code': ['ok'],
    codex: ['ok', 'ok', 'network', 'ok', 'rate_limited:20', 'ok'],
    claude: ['ok', 'auth_required', 'ok'],
    antigravity: ['ok', 'parse_error', 'ok'],
    'example-credits': ['ok'],
};

function failFor(step) {
    const [code, hint] = step.split(':');
    return new ProviderError(code, `demo: ${code}`, hint ? {retryAfterMs: Number(hint) * SECOND_MS} : {});
}

/**
 * @param {string} scenario - one of SCENARIOS
 * @param {() => number} [now]
 * @returns {Array<import('../core/scheduler.js').Provider>}
 */
export function createDemoProviders(scenario = 'steady', now = Date.now) {
    const mode = SCENARIOS.includes(scenario) ? scenario : 'steady';
    const intervalMs = {steady: 5 * MINUTE_MS, flaky: 15 * SECOND_MS, drift: 10 * SECOND_MS}[mode];

    return demoSnapshots(now()).map(template => {
        let fetches = 0;
        return {
            id: template.id,
            name: template.name,
            plan: template.plan,
            intervalMs,
            fetch() {
                const step = fetches++;
                if (mode === 'flaky') {
                    const sequence = FLAKY_STEPS[template.id] ?? ['ok'];
                    const action = sequence[step % sequence.length];
                    if (action !== 'ok')
                        return Promise.reject(failFor(action));
                }

                // Reset times are recomputed from the current time on every fetch.
                let metrics = demoSnapshots(now()).find(s => s.id === template.id).metrics;
                if (mode === 'drift') {
                    metrics = metrics.map(m => (m.kind === 'money'
                        ? {...m, balance: Math.max(0, m.balance - step * 1.5)}
                        : {...m, percentUsed: Math.min(100, m.percentUsed + step * 4)}));
                }
                return Promise.resolve({plan: template.plan, metrics});
            },
        };
    });
}
