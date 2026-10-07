// A tiny test harness for `gjs -m tests/run.js`: no dependencies.
// `gjs -m tests/run.js -- <text>` runs only the tests whose name contains <text>.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

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

const TEST_TIMEOUT_MS = 15000;
const cleanups = [];

/** Register something to undo when the test that is running ends, pass or fail. */
export function cleanup(fn) {
    cleanups.push(fn);
}

/**
 * A fresh temporary directory, removed (with whatever the test put in it) when the test ends.
 *
 * @returns {string} its path
 */
export function tmpDir() {
    const path = GLib.Dir.make_tmp('gaq-test-XXXXXX');
    cleanup(() => removeTree(path));
    return path;
}

function removeTree(path) {
    const file = Gio.File.new_for_path(path);
    try {
        const info = file.query_info('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        if (info.get_file_type() === Gio.FileType.DIRECTORY) {
            const children = file.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
            for (let child = children.next_file(null); child !== null; child = children.next_file(null))
                removeTree(`${path}/${child.get_name()}`);
            children.close(null);
        }
        file.delete(null);
    } catch (_error) {
        // Already gone, or not ours to remove.
    }
}

function withTimeout(promise, name) {
    let timer = 0;
    const timeout = new Promise((_resolve, reject) => {
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TEST_TIMEOUT_MS, () => {
            timer = 0;
            reject(new Error(`the test did not finish in ${TEST_TIMEOUT_MS / 1000} s: ${name}`));
            return GLib.SOURCE_REMOVE;
        });
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer)
            GLib.source_remove(timer);
    });
}

/**
 * Run every registered test.
 *
 * @param {string} [only] - run only the tests whose name contains this text
 * @returns {Promise<number>} how many failed
 */
export async function runAll(only = '') {
    let failed = 0;
    let ran = 0;
    for (const {name, fn} of tests) {
        if (only && !name.includes(only))
            continue;
        ran++;
        try {
            await withTimeout(Promise.resolve().then(fn), name);
            print(`ok    ${name}`);
        } catch (error) {
            failed++;
            print(`FAIL  ${name}\n${error.message}${error.stack ? `\n${error.stack}` : ''}`);
        } finally {
            while (cleanups.length > 0) {
                try {
                    cleanups.pop()();
                } catch (_error) {
                    // A cleanup that fails must not hide the result of the test.
                }
            }
        }
    }
    print(`\n${ran - failed} passed, ${failed} failed`);
    return failed;
}
