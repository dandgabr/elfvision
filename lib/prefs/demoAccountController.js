// Explicit synthetic controller: no provider, browser, configuration or keyring imports.
export function createDemoAccountController({connectorId, settings}) {
    const listeners = new Set();
    let disposed = false;
    const emit = () => { if (!disposed) for (const listener of [...listeners]) listener(); };
    const connected = () => settings.get_strv('demo-connected-connectors').includes(connectorId);
    const handler = settings.connect?.('changed::demo-connected-connectors', emit);
    const change = value => {
        if (disposed) return false;
        const others = settings.get_strv('demo-connected-connectors').filter(id => id !== connectorId);
        if (!settings.set_strv('demo-connected-connectors', value ? [...others, connectorId] : others)) return false;
        emit();
        return true;
    };
    return {
        snapshot: () => ({connected: connected(), hasKey: connected(), hasConfig: true, result: connected() ? 'ok' : null,
            blocked: false, busy: false, saving: false, removing: false, keyringDown: false, lastFailure: '', demo: true}),
        subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
        refresh: async () => { emit(); }, recheck: async () => { emit(); },
        connect: async () => change(true), disconnect: async () => change(false), remove: async () => change(false),
        cancel() {},
        dispose() { if (disposed) return; disposed = true; listeners.clear(); if (handler) settings.disconnect(handler); },
    };
}

/** A dashboard-only connector has no credential operations or system dependencies. */
export function createUnavailableAccountController() {
    return {snapshot: () => ({connected: true, hasKey: false, hasConfig: true, result: 'unavailable', blocked: false, busy: false}),
        subscribe: () => () => {}, refresh: async () => {}, recheck: async () => {}, cancel() {},
        remove: async () => true, disconnect: async () => true, dispose() {}};
}
