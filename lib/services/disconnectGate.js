import GLib from 'gi://GLib';
import {createDisconnectGate} from '../core/disconnect.js';
import {PROVIDERS} from '../providers/registry.js';
import {createDisconnectStore, processIdentity, processAlive, pause} from './disconnectStore.js';

let singleton = null;
/** Lazy facade. Injection keeps teardown regressions independent of user metadata. */
export function createDisconnectFacade({initialize, detach = () => {}}) {
    let delegate = null, initializing = null, closing = false, closingPromise = null, retirement = null;
    let facade;
    const listeners = new Set(), cancellers = new Set();
    const initial = () => ({ready: false, epoch: null, blocked: true, blockedProviders: PROVIDERS.map(p => p.id), transaction: null, problem: 'coordination-unavailable'});
    const closed = () => Object.assign(new Error('credential coordination closed'), {code: 'closed'});
    const ready = () => {
        if (closing) return Promise.reject(closed());
        return initializing ??= (async () => {
            delegate = await initialize();
            if (closing) throw closed();
            delegate.subscribe(value => { for (const fn of [...listeners]) fn(value); });
            delegate.registerCanceller(async value => { for (const fn of [...cancellers]) await fn(value); });
            await delegate.ready();
        })();
    };
    const call = name => async (...args) => { await ready(); return delegate[name](...args); };
    facade = {ready, snapshot: () => delegate?.snapshot() ?? initial(), isBlocked: id => delegate?.isBlocked(id) ?? true,
        capture: call('capture'), assertCurrent: call('assertCurrent'), withCredentialWrite: call('withCredentialWrite'),
        guardFileWrite: call('guardFileWrite'), disconnect: call('disconnect'), hasParticipant: call('hasParticipant'), noteLegacyWriter: call('noteLegacyWriter'),
        subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
        registerCanceller: fn => { cancellers.add(fn); return () => cancellers.delete(fn); },
        close: () => {
            if (closingPromise) return closingPromise;
            closing = true; detach(facade);
            closingPromise = (async () => {
                await initializing?.catch(() => {}); await delegate?.close(); listeners.clear(); cancellers.clear();
            })();
            return closingPromise;
        },
        retire: (pending = Promise.resolve()) => {
            if (retirement) return retirement;
            // Ordinary disable lets an accepted token rotation settle. Disconnect can still
            // cancel it through this old delegate's monitor while a replacement facade runs.
            detach(facade);
            retirement = Promise.resolve(pending).catch(() => {}).then(() => facade.close());
            return retirement;
        }};
    return facade;
}
/** Importing and obtaining the singleton performs no user I/O. */
export function getDisconnectGate() {
    if (singleton) return singleton;
    singleton = createDisconnectFacade({
        detach: facade => { if (singleton === facade) singleton = null; },
        initialize: async () => {
            const identity = await processIdentity();
            const alive = owner => processAlive(owner, identity.boot);
            const store = createDisconnectStore({directory: GLib.build_filenamev([GLib.get_user_state_dir(), 'gnome-ai-quota']), identity});
            return createDisconnectGate({store, identity, alive, uuid: GLib.uuid_string_random, sleep: pause, now: Date.now,
                providers: PROVIDERS.map(p => p.id), kinds: ['api-key', 'oauth-token']});
        }});
    return singleton;
}
