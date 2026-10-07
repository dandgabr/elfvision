// A tiny test harness for `gjs -m tests/run.js`: no dependencies.

const tests = [];

export function test(name, fn) {
    tests.push({name, fn});
}

export function assertEqual(actual, expected, message = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
}

export function assertTrue(value, message = 'expected a truthy value') {
    if (!value)
        throw new Error(message);
}

/** Let queued promise callbacks run (a few rounds, for chained awaits). */
export async function flush(rounds = 10) {
    for (let i = 0; i < rounds; i++)
        await Promise.resolve();
}

export async function runAll() {
    let failed = 0;
    for (const {name, fn} of tests) {
        try {
            await fn();
            print(`ok    ${name}`);
        } catch (error) {
            failed++;
            print(`FAIL  ${name}\n${error.message}`);
        }
    }
    print(`\n${tests.length - failed} passed, ${failed} failed`);
    return failed;
}
