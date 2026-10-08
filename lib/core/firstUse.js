// First-use decisions (ADR 0010). No I/O, credentials or widgets.
export const SETUP_STEPS = ['welcome', 'providers', 'connect', 'bar', 'notifications', 'done'];

export function firstUsePolicy({done, source, target, states}) {
    if (done)
        return 'none';
    if (states.some(s => s.connected === true || s.hasKey === true))
        return 'complete';
    if (source !== 'live' || target)
        return 'none';
    if (states.some(s => s.blocked || s.keyringDown || s.connected === null || s.hasKey === null))
        return 'wait';
    return 'open';
}

export function selectedProviders(providers, ids) {
    return providers.filter(meta => ids.includes(meta.id));
}

export function connectionSummary(providers, selected, states) {
    return providers.map(meta => {
        const state = states[meta.id] ?? {};
        const failed = ['rejected', 'expired', 'refused', 'no_config'].includes(state.result);
        const connected = state.connected === true || state.hasKey === true;
        return {id: meta.id, name: meta.name, status: failed || state.blocked || state.lastFailure || state.keyringDown
            ? 'failed' : connected ? 'connected' : selected.includes(meta.id) ? 'not-connected' : 'skipped'};
    });
}

// Shared by all account controllers, including the Accounts page behind setup.
export function createLoginGate() {
    let owner = null;
    return {
        acquire(id) {
            if (owner !== null)
                return false;
            owner = id;
            return true;
        },
        release(id) {
            if (owner === id)
                owner = null;
        },
    };
}

export function connectableProviders(providers, states) {
    return providers.filter(meta => {
        const state = states[meta.id] ?? {};
        return !state.blocked && !state.keyringDown && !state.busy && !state.saving && !state.removing &&
            (meta.auth === 'api-key' || state.hasConfig === true);
    });
}

export function stepComplete(step, selected, states) {
    if (step === 'providers')
        return selected.length > 0;
    if (step === 'connect') {
        return selected.every(id => {
            const state = states[id] ?? {};
            return !state.blocked && (state.connected === true || state.hasKey === true) &&
                !['rejected', 'expired', 'refused', 'no_config'].includes(state.result);
        });
    }
    // Appearance and notifications are valid with their defaults; no step is mandatory.
    return true;
}
