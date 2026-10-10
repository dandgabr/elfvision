import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {test, assertEqual, assertTrue, tmpDir} from './harness.js';
import {HARNESS_CREDENTIAL_SOURCES} from '../lib/core/harnessSources.js';
import {lookupHarnessCredential} from '../lib/services/harnessCredentials.js';

test('harness credentials: only exact documented provider sources are registered', () => {
    assertEqual(Object.keys(HARNESS_CREDENTIAL_SOURCES), ['command-code', 'codex', 'claude', 'antigravity']);
    assertEqual(HARNESS_CREDENTIAL_SOURCES.codex.select, ['tokens', 'access_token']);
    assertEqual(HARNESS_CREDENTIAL_SOURCES.claude.select, ['claudeAiOauth', 'accessToken']);
});

test('harness credentials: reads one selected value from a private known file without persisting it', async () => {
    const homeDirectory = tmpDir();
    const path = `${homeDirectory}/.codex/auth.json`;
    GLib.mkdir_with_parents(`${homeDirectory}/.codex`, 0o700);
    GLib.file_set_contents(path, JSON.stringify({tokens: {access_token: 'synthetic-access'}, other: 'ignored'}));
    Gio.File.new_for_path(path).set_attribute_uint32('unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);
    const result = await lookupHarnessCredential('codex', {homeDirectory});
    assertEqual(result, 'synthetic-access');
});

test('harness credentials: refuses unsafe files and unsupported providers without fallback scanning', async () => {
    const homeDirectory = tmpDir();
    GLib.mkdir_with_parents(`${homeDirectory}/.codex`, 0o700);
    const path = `${homeDirectory}/.codex/auth.json`;
    GLib.file_set_contents(path, JSON.stringify({tokens: {access_token: 'synthetic-access'}}));
    Gio.File.new_for_path(path).set_attribute_uint32('unix::mode', 0o644, Gio.FileQueryInfoFlags.NONE, null);
    let unsafe = false;
    try { await lookupHarnessCredential('codex', {homeDirectory}); } catch (error) { unsafe = error.code === 'unreadable'; }
    let unsupported = false;
    try { await lookupHarnessCredential('openai-api', {homeDirectory, readFile() { throw new Error('must not scan'); }}); }
    catch (error) { unsupported = error.code === 'unsupported'; }
    assertTrue(unsafe && unsupported);
});

test('harness credentials: a genuinely absent source is missing while malformed content is unreadable', async () => {
    const homeDirectory = tmpDir();
    let missing = false;
    try { await lookupHarnessCredential('codex', {homeDirectory}); }
    catch (error) { missing = error.code === 'missing'; }
    GLib.mkdir_with_parents(`${homeDirectory}/.codex`, 0o700);
    GLib.file_set_contents(`${homeDirectory}/.codex/auth.json`, '{bad');
    Gio.File.new_for_path(`${homeDirectory}/.codex/auth.json`).set_attribute_uint32('unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);
    let unreadable = false;
    try { await lookupHarnessCredential('codex', {homeDirectory}); }
    catch (error) { unreadable = error.code === 'unreadable'; }
    assertTrue(missing && unreadable);
});

test('harness credentials: cancellation is passed into the source reader before any credential is loaded', async () => {
    let cancelledAtReader = false;
    try {
        await lookupHarnessCredential('codex', {homeDirectory: tmpDir(), isCancelled: () => true,
            readFile: async (_path, _source, {cancellable}) => {
                cancelledAtReader = cancellable.is_cancelled();
                throw Object.assign(new Error('cancelled'), {code: 'unreadable'});
            }});
    } catch (_error) { /* expected cancelled read */ }
    assertEqual(cancelledAtReader, true);
});

test('harness credentials: keyring source queries only the declared service and rejects ambiguity', async () => {
    let service = '';
    const value = await lookupHarnessCredential('antigravity', {readKeyring: async name => {
        service = name;
        return 'synthetic-access';
    }});
    assertEqual([service, value], ['gemini', 'synthetic-access']);
    let ambiguous = false;
    try { await lookupHarnessCredential('antigravity', {readKeyring: async () => { throw Object.assign(new Error('ambiguous'), {code: 'ambiguous'}); }}); }
    catch (error) { ambiguous = error.code === 'ambiguous'; }
    assertTrue(ambiguous);
});
