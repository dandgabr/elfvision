import {providerIdForConnector} from './connectors.js';
// Durable disconnect coordination. This layer contains no filesystem or credential APIs.
const copy = value => JSON.parse(JSON.stringify(value));
const fault = code => Object.assign(new Error(`credential coordination: ${code}`), {code});

export function createDisconnectGate({store, identity, alive, uuid, sleep, now, drainMs = 10000,
    providers, kinds}) {
    const participant = uuid(), listeners = new Set(), cancellers = new Set();
    let cached = null, started = null, unwatch = null, closed = false, refreshing = Promise.resolve();
    const fresh = () => ({version: 1, epoch: uuid(), participants: {}, leases: {}, blockedProviders: [], transaction: null, legacyBoot: null});
    function validate(state) {
        const record = value => value && typeof value === 'object' && !Array.isArray(value);
        const text = value => typeof value === 'string' && /^[A-Za-z0-9-]{1,128}$/.test(value);
        const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
        const owner = value => keys(value, ['id', 'boot', 'pid', 'start']) && text(value.id) && text(value.boot) &&
            (value.pid === undefined || (typeof value.pid === 'string' && /^\d{1,12}$/.test(value.pid))) && (value.start === undefined || (typeof value.start === 'string' && /^\d{1,24}$/.test(value.start)));
        const values = ['pending', 'absent', 'failed', 'preserved', 'pruned'];
        if (!keys(state, ['version', 'epoch', 'participants', 'leases', 'blockedProviders', 'transaction', 'legacyBoot']) || JSON.stringify(state).length > 65536 || state.version !== 1 || !text(state.epoch) ||
            (state.legacyBoot !== null && !text(state.legacyBoot)) || !record(state.participants) || Object.keys(state.participants).length > 64 ||
            !record(state.leases) || Object.keys(state.leases).length > 64 || !Array.isArray(state.blockedProviders) ||
            state.blockedProviders.some(id => !providers.includes(id)) || new Set(state.blockedProviders).size !== state.blockedProviders.length ||
            Object.entries(state.participants).some(([id, p]) => !text(id) || !keys(p, ['identity', 'ackEpoch']) || !owner(p.identity) || !text(p.ackEpoch)) ||
            Object.entries(state.leases).some(([id, lease]) => !text(id) || !keys(lease, ['participant', 'identity', 'epoch', 'provider', 'phase', 'operation']) || !text(lease.participant) ||
                !owner(lease.identity) || !text(lease.epoch) || !providers.includes(lease.provider) || lease.phase !== 'issued' ||
                !['store', 'delete'].includes(lease.operation))) throw fault('invalid-state');
        const t = state.transaction;
        if (t?.target !== undefined && (!keys(t.target, ['id', 'provider', 'kind']) || providerIdForConnector(t.target.id) !== t.target.provider || !providers.includes(t.target.provider) || !kinds.includes(t.target.kind))) throw fault('invalid-state');
        if (t !== null && (!keys(t, ['id', 'epoch', 'phase', 'coordinator', 'credentials', 'files', 'status', 'problem', 'target']) || !text(t.id) || !text(t.epoch) || !owner(t.coordinator) ||
            !['draining', 'deleting', 'failed', 'complete'].includes(t.phase) || !record(t.credentials) ||
            Object.keys(t.credentials).length !== providers.length || providers.some(id => !record(t.credentials[id]) ||
                Object.keys(t.credentials[id]).length !== kinds.length || kinds.some(kind => !values.includes(t.credentials[id][kind]))) ||
            !record(t.files) || Object.keys(t.files).length !== 2 || ['snapshots', 'alerts'].some(name => !values.includes(t.files[name])) ||
            !['pending', 'cleared', 'failed'].includes(t.status) || (t.problem !== null && !['orphaned-write', 'orphaned-delete', 'drain-timeout', 'deletion-incomplete', 'restart-computer-required'].includes(t.problem)))) throw fault('invalid-state');
        return state;
    }
    function snapshot() {
        if (!cached) return {ready: false, epoch: null, blocked: true, blockedProviders: [...providers], transaction: null, problem: 'coordination-unavailable'};
        const draining = ['draining', 'deleting'].includes(cached.transaction?.phase);
        return {ready: true, epoch: cached.epoch, blocked: draining || cached.blockedProviders.length === providers.length,
            blockedProviders: [...cached.blockedProviders], transaction: cached.transaction ? copy(cached.transaction) : null,
            problem: cached.transaction?.problem ?? null};
    }
    async function apply(state) {
        validate(state);
        const changed = !cached || cached.epoch !== state.epoch || JSON.stringify(cached.blockedProviders) !== JSON.stringify(state.blockedProviders);
        cached = copy(state);
        if (changed && (state.blockedProviders.length || state.transaction?.phase === 'draining'))
            for (const fn of [...cancellers]) await fn(snapshot());
        for (const fn of [...listeners]) fn(snapshot());
    }
    function refresh() {
        refreshing = refreshing.then(async () => {
            if (closed) return;
            await apply(await store.read());
            const own = cached.participants[participant];
            if (own && own.ackEpoch !== cached.epoch && !Object.values(cached.leases).some(lease => lease.participant === participant)) {
                const state = await store.transact(state => {
                    validate(state);
                    const p = state.participants[participant];
                    if (p && !Object.values(state.leases).some(lease => lease.participant === participant)) p.ackEpoch = state.epoch;
                    return {state, value: state};
                });
                await apply(state);
            }
        }).catch(() => { cached = null; for (const fn of [...listeners]) fn(snapshot()); });
        return refreshing;
    }
    function ready() {
        if (closed) return Promise.reject(fault('closed'));
        if (!started) started = (async () => {
            const state = await store.transact(async state => {
                state = state ? validate(state) : fresh();
                if (state.legacyBoot && state.legacyBoot !== identity.boot) state.legacyBoot = null;
                for (const [id, p] of Object.entries(state.participants))
                    if (!Object.values(state.leases).some(lease => lease.participant === id) &&
                        (p.identity.boot !== identity.boot || !await alive(p.identity))) delete state.participants[id];
                if (Object.keys(state.participants).length >= 64) throw fault('participant-limit');
                state.participants[participant] = {identity: copy(identity), ackEpoch: state.epoch};
                return {state, value: state};
            });
            unwatch = store.watch(() => { refresh(); });
            await apply(state);
        })();
        return started;
    }
    function check(state, ticket, provider = ticket?.provider) {
        validate(state);
        if (closed || !ticket || ticket.epoch !== state.epoch) throw fault('stale');
        if (provider !== null && provider !== undefined && (!providers.includes(provider) || ticket.provider !== provider)) throw fault('invalid-provider');
        if (['draining', 'deleting'].includes(state.transaction?.phase) ||
            (provider ? state.blockedProviders.includes(provider) : state.blockedProviders.length > 0)) throw fault('blocked');
    }
    async function capture(provider = null) {
        await ready();
        return store.transact(state => {
            const ticket = {epoch: validate(state).epoch, provider}; check(state, ticket);
            return {value: ticket};
        });
    }
    async function assertCurrent(ticket) {
        await ready();
        return store.transact(state => { check(state, ticket); return {value: true}; });
    }
    function settleLease(state, leaseId) {
        validate(state); delete state.leases[leaseId];
        if (state.participants[participant]) {
            if (closed && !Object.values(state.leases).some(lease => lease.participant === participant)) delete state.participants[participant];
            else state.participants[participant].ackEpoch = state.epoch;
        }
    }
    async function withCredentialWrite(provider, ticket, fn, {operation = 'store'} = {}) {
        if (!['store', 'delete'].includes(operation)) throw fault('invalid-operation');
        await ready(); const leaseId = uuid(), deadline = now() + drainMs;
        // A durable issued lease is also the provider's exclusion lock. Never keep
        // the global metadata mutex across keyring I/O: disconnect must enter drain.
        while (true) {
            const acquired = await store.transact(async state => {
                check(state, ticket, provider);
                for (const [id, lease] of Object.entries(state.leases)) {
                    if (lease.provider !== provider) continue;
                    if (lease.identity.boot !== identity.boot) { delete state.leases[id]; continue; }
                    // A dead process can still have an accepted keyring request.
                    // Only a boot boundary permits reclaiming its issued lease.
                    if (!await alive(lease.identity)) throw fault(lease.operation === 'delete' ? 'orphaned-delete' : 'orphaned-write');
                    return {value: false};
                }
                if (Object.keys(state.leases).length >= 64) throw fault('lease-limit');
                state.leases[leaseId] = {participant, identity: copy(identity), epoch: ticket.epoch, provider, phase: 'issued', operation};
                return {state, value: true};
            });
            if (acquired) break;
            if (now() >= deadline) throw fault('credential-busy');
            await sleep(10);
        }
        try { return await fn(); }
        finally {
            await store.transact(state => {
                settleLease(state, leaseId);
                return {state};
            });
        }
    }
    async function guardFileWrite(ticket, fn) {
        await ready();
        return store.transact(async state => { check(state, ticket); const value = await fn(); return {value}; });
    }
    async function failed(problem, transactionId) {
        const state = await store.transact(state => {
            validate(state); if (state.transaction?.id !== transactionId) throw fault('stale');
            state.transaction.phase = 'failed'; state.transaction.problem = problem;
            return {state, value: state};
        }); await apply(state); return copy(state.transaction);
    }
    async function disconnect(deps, {target = null} = {}) {
        if (target && (providerIdForConnector(target.id) !== target.provider || !providers.includes(target.provider) || !kinds.includes(target.kind))) throw fault('invalid-provider');
        await ready();
        const held = await store.transact(state => { validate(state); return {value: state.legacyBoot === identity.boot ? copy(state.transaction) : null}; });
        if (held) { await refresh(); return held; }
        const state = await store.transact(async state => {
            validate(state);
            if (state.legacyBoot === identity.boot) throw fault('restart-computer-required');
            const previous = state.transaction;
            if (target && previous?.phase === 'failed' && (!previous.target ||
                ['id', 'provider', 'kind'].some(key => previous.target[key] !== target[key]))) throw fault('unfinished-connector-removal');
            if (['draining', 'deleting'].includes(previous?.phase) && previous.coordinator.boot === identity.boot && await alive(previous.coordinator)) throw fault('busy');
            state.epoch = uuid();
            // Providers completed by a partial attempt are allowed to reconnect.
            // A new epoch must verify absence again, including recreated caches.
            const credentials = Object.fromEntries(providers.map(id => [id, Object.fromEntries(kinds.map(kind => [kind, target && (id !== target.provider || kind !== target.kind) ? 'preserved' : 'pending']))]));
            state.blockedProviders = [...providers];
            state.transaction = {id: uuid(), epoch: state.epoch, phase: 'draining', coordinator: copy(identity), credentials,
                files: {snapshots: 'pending', alerts: 'pending'}, status: 'pending', problem: null, ...(target ? {target: copy(target)} : {})};
            return {state, value: state};
        });
        const transactionId = state.transaction.id;
        const checkTransaction = current => { validate(current); if (current.transaction?.id !== transactionId || current.epoch !== state.epoch) throw fault('stale'); };
        await apply(state); await refresh();
        const deadline = now() + drainMs;
        while (true) {
            const drained = await store.transact(async current => {
                checkTransaction(current);
                for (const [id, lease] of Object.entries(current.leases)) {
                    if (lease.identity.boot !== identity.boot) delete current.leases[id];
                    else if (!await alive(lease.identity)) return {state: current, value: lease.operation === 'delete' ? 'orphaned-delete' : 'orphaned-write'};
                }
                for (const [id, p] of Object.entries(current.participants)) {
                    if (p.identity.boot !== identity.boot || !await alive(p.identity)) delete current.participants[id];
                }
                const waiting = Object.keys(current.leases).length || Object.values(current.participants).some(p => p.ackEpoch !== current.epoch);
                return {state: current, value: waiting ? 'waiting' : 'ready'};
            });
            if (['orphaned-write', 'orphaned-delete'].includes(drained)) return failed(drained, transactionId);
            if (drained === 'ready') break;
            if (now() >= deadline) return failed('drain-timeout', transactionId);
            await sleep(10);
        }
        await store.transact(current => { checkTransaction(current); current.transaction.phase = 'deleting'; return {state: current}; });
        async function step(section, key, fn, provider = null) {
            const current = await store.read(); checkTransaction(current);
            const result = provider ? current.transaction[section][provider][key] : current.transaction[section][key];
            if (['absent', 'preserved', 'pruned'].includes(result)) return;
            const deleteLease = provider ? uuid() : null;
            if (deleteLease) await store.transact(current => {
                checkTransaction(current);
                if (Object.keys(current.leases).length >= 64) throw fault('lease-limit');
                current.leases[deleteLease] = {participant, identity: copy(identity), epoch: state.epoch, provider, phase: 'issued', operation: 'delete'};
                return {state: current};
            });
            let outcome = 'failed';
            try { if (await fn() !== false) outcome = target && section === 'files' ? 'pruned' : 'absent'; } catch (_error) { /* Backend errors never enter metadata. */ }
            finally {
                if (deleteLease) await store.transact(current => {
                    settleLease(current, deleteLease);
                    return {state: current};
                });
            }
            await store.transact(current => {
                checkTransaction(current);
                if (provider) current.transaction[section][provider][key] = outcome;
                else current.transaction[section][key] = outcome;
                return {state: current};
            });
        }
        for (const provider of providers)
            for (const kind of kinds) await step('credentials', kind, () => deps.removeCredential(target?.id ?? provider, kind), provider);
        for (const name of ['snapshots', 'alerts']) await step('files', name, () => deps.removeFile(name));
        let statusOK = true;
        try { await deps.clearStatus(); } catch (_error) { statusOK = false; }
        const final = await store.transact(current => {
            checkTransaction(current);
            const t = current.transaction; t.status = statusOK ? 'cleared' : 'failed';
            const filesOK = Object.values(t.files).every(v => v === 'absent' || v === 'preserved' || v === 'pruned');
            current.blockedProviders = filesOK && statusOK ? providers.filter(id => Object.values(t.credentials[id]).some(v => v !== 'absent' && v !== 'preserved')) : [...providers];
            t.phase = current.blockedProviders.length ? 'failed' : 'complete'; t.problem = t.phase === 'failed' ? 'deletion-incomplete' : null;
            return {state: current, value: current};
        }); await apply(final); return copy(final.transaction);
    }
    async function close() {
        if (closed) return; closed = true; unwatch?.(); listeners.clear(); cancellers.clear();
        if (started) await started.catch(() => {});
        await store.transact(state => {
            if (state) validate(state);
            if (state && !Object.values(state.leases).some(lease => lease.participant === participant)) delete state.participants[participant];
            return {state};
        });
    }
    async function noteLegacyWriter() {
        await ready();
        const state = await store.transact(state => {
            validate(state);
            if (state.legacyBoot === identity.boot) return {value: state};
            state.legacyBoot = identity.boot; state.epoch = uuid(); state.blockedProviders = [...providers];
            state.transaction = {id: uuid(), epoch: state.epoch, phase: 'failed', coordinator: copy(identity),
                credentials: Object.fromEntries(providers.map(id => [id, Object.fromEntries(kinds.map(kind => [kind, 'pending']))])),
                files: {snapshots: 'pending', alerts: 'pending'}, status: 'pending', problem: 'restart-computer-required'};
            return {state, value: state};
        }); await apply(state); await refresh(); return copy(state.transaction);
    }
    async function hasParticipant(pid) {
        await ready();
        return store.transact(async state => {
            validate(state);
            let present = false;
            for (const p of Object.values(state.participants))
                if (p.identity.pid === String(pid) && p.identity.boot === identity.boot && await alive(p.identity)) present = true;
            return {value: present};
        });
    }
    return {ready, snapshot, capture, assertCurrent, withCredentialWrite, guardFileWrite, disconnect, close, hasParticipant, noteLegacyWriter,
        isBlocked: id => !cached || ['draining', 'deleting'].includes(cached.transaction?.phase) || cached.blockedProviders.includes(id),
        subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
        registerCanceller: fn => { cancellers.add(fn); return () => cancellers.delete(fn); }};
}
