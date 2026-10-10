import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const OAUTH_PROVIDERS = new Set(['codex', 'claude', 'antigravity']);
const MAX_DISCOVERY_MS = 90000;
// The helper updates one shared JSON file. Do not allow separate connector views to
// race its read/modify/replace transaction.
let discoveryRunning = false;

/** Runs the existing, provider-scoped importer without exposing its output to the UI or logs. */
export function createClientConfigDiscovery({extensionPath, spawn = argv => Gio.Subprocess.new(argv,
    Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE)} = {}) {
    return {
        async run(providerId, {cancellable = new Gio.Cancellable()} = {}) {
            if (!OAUTH_PROVIDERS.has(providerId))
                throw Object.assign(new Error('unsupported provider'), {code: 'unsupported'});
            if (discoveryRunning)
                throw Object.assign(new Error('discovery already running'), {code: 'busy'});
            discoveryRunning = true;
            const helper = GLib.build_filenamev([extensionPath, 'tools', 'import-client-ids.py']);
            let child;
            let timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MAX_DISCOVERY_MS, () => {
                timeout = 0;
                child?.force_exit();
                return GLib.SOURCE_REMOVE;
            });
            let cancelHandler = 0;
            try {
                child = spawn(['python3', '-I', helper, providerId]);
                cancelHandler = cancellable.connect(() => child.force_exit());
                await child.wait_check_async(cancellable);
                return true;
            } catch (_error) {
                throw Object.assign(new Error(cancellable.is_cancelled() ? 'cancelled' : 'discovery failed'), {
                    code: cancellable.is_cancelled() ? 'cancelled' : 'failed',
                });
            } finally {
                if (timeout) GLib.source_remove(timeout);
                if (cancelHandler) cancellable.disconnect(cancelHandler);
                child?.force_exit();
                discoveryRunning = false;
            }
        },
    };
}

export const CLIENT_CONFIG_DISCOVERY_TIMEOUT_MS = MAX_DISCOVERY_MS;
