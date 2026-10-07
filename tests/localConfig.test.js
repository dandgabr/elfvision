import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {assertEqual, assertTrue, test, tmpDir} from './harness.js';
import {parseLocalConfig} from '../lib/core/localConfig.js';
import {readLocalConfig} from '../lib/services/localConfig.js';
import * as localConfigService from '../lib/services/localConfig.js';

const entry = extra => ({clientId: 'abc-123_XYZ', redirectPort: 1455, ...extra});
const config = providers => JSON.stringify({version: 1, providers});

test('local config: a good entry gets its defaults; optional fields are kept', () => {
    const {providers, problems} = parseLocalConfig(config({
        codex: entry(),
        antigravity: entry({redirectHost: '127.0.0.1', clientSecret: 'sec-ret-1', userAgent: 'some agent/1.0 (x)'}),
    }));
    assertEqual(problems, []);
    assertEqual(providers.codex, {clientId: 'abc-123_XYZ', redirectPort: 1455});
    assertEqual(parseLocalConfig(config({codex: {clientId: 'only-the-id'}})).providers.codex, {clientId: 'only-the-id'});
    assertEqual([providers.antigravity.clientSecret, providers.antigravity.userAgent, providers.antigravity.redirectHost], ['sec-ret-1', 'some agent/1.0 (x)', '127.0.0.1']);
});

test('local config: bad entries are left out and named without their values', () => {
    const bad = {
        a: entry({clientId: 'has space'}),
        b: entry({redirectPort: 80}),
        c: entry({redirectPort: '1455'}),
        d: entry({redirectHost: 'evil.example.org'}),
        e: entry({userAgent: 'x\r\nX-Evil: 1'}),
        f: entry({clientSecret: 'a\nb'}),
        'Bad Id': entry(),
        g: entry({clientId: 'x'.repeat(301)}),
        h: entry({surprise: 1}),
    };
    const {providers, problems} = parseLocalConfig(config(bad));
    assertEqual(Object.keys(providers), ['h']);
    assertEqual(problems.length, 9);
    assertTrue(!problems.join('\n').includes('evil.example') && !problems.join('\n').includes('X-Evil'));
});

test('local config: not JSON, wrong version and oversized files give nothing', () => {
    for (const text of ['', 'nope', '[]', '{"version":2,"providers":{}}', '{"version":1}', 'x'.repeat(20000), null])
        assertEqual(Object.keys(parseLocalConfig(text).providers), []);
});

test('local config: the file is read only when just its owner can read it', () => {
    const directory = tmpDir();
    const path = `${directory}/providers.local.json`;
    assertEqual(readLocalConfig(path).missing, true);
    GLib.file_set_contents(path, config({codex: entry()}));
    const file = Gio.File.new_for_path(path);
    file.set_attribute_uint32('unix::mode', 0o644, Gio.FileQueryInfoFlags.NONE, null);
    const open = readLocalConfig(path);
    assertEqual([Object.keys(open.providers), open.problems[0].includes('chmod 600')], [[], true]);
    file.set_attribute_uint32('unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);
    assertEqual(Object.keys(readLocalConfig(path).providers), ['codex']);
    // a link is not followed
    const link = `${directory}/link.json`;
    Gio.File.new_for_path(link).make_symbolic_link(path, null);
    assertEqual(Object.keys(readLocalConfig(link).providers), []);
});


test('local config: asynchronous reader preserves missing, unsafe, valid, oversized and symlink decisions', async () => {
    const directory = tmpDir();
    const path = `${directory}/providers.local.json`;
    const read = () => localConfigService.readLocalConfigAsync(path);
    assertEqual((await read()).missing, true);
    GLib.file_set_contents(path, config({codex: entry()}));
    const file = Gio.File.new_for_path(path);
    file.set_attribute_uint32('unix::mode', 0o644, Gio.FileQueryInfoFlags.NONE, null);
    assertTrue((await read()).problems[0].includes('chmod 600'));
    file.set_attribute_uint32('unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);
    assertEqual(Object.keys((await read()).providers), ['codex']);
    const link = `${directory}/link.json`;
    Gio.File.new_for_path(link).make_symbolic_link(path, null);
    assertEqual(Object.keys((await localConfigService.readLocalConfigAsync(link)).providers), []);
    GLib.file_set_contents(path, 'x'.repeat(20000));
    assertEqual(Object.keys((await read()).providers), []);
    Gio.File.new_for_path(directory).set_attribute_uint32('unix::mode', 0o777, Gio.FileQueryInfoFlags.NONE, null);
    assertTrue((await read()).problems[0].includes('chmod 700'));
});
