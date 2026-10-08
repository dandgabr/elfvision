import GLib from 'gi://GLib';
import {popupKeys} from '../core/popup.js';
import {decodeConnectors, validateConnectors, MAX_CONNECTOR_BYTES, MAX_CONNECTORS, providerIdForConnector} from '../core/connectors.js';
/** Nonsecret cross-process registry. Unset and empty collections never create accounts. */
export function createConnectorStore(settings, {demo = false, uuid = GLib.uuid_string_random, enumerate = null} = {}) {
    const key = demo ? 'demo-connectors' : 'connectors';
    const listeners = new Set(); let disposed = false;
    const list = () => decodeConnectors(settings.get_string(key), {demo});
    const save = entries => {
        if (disposed) throw new Error('connector store closed');
        const value = JSON.stringify({version: 1, connectors: validateConnectors(entries, {demo})});
        if (new TextEncoder().encode(value).length > MAX_CONNECTOR_BYTES || !settings.set_string(key, value)) throw new Error('connector registry unavailable');
    };
    const signal = settings.connect(`changed::${key}`, () => { for (const fn of [...listeners]) fn(); });
    return {list,
        async recover() {
            const entries = [];
            if (!demo) {
                const metadata = await (enumerate ?? (await import('./secrets.js')).enumerateConnectorIdentities)();
                for (const entry of metadata) {
                    if (providerIdForConnector(entry?.id) !== entry?.providerId || entries.some(current => current.id === entry.id)) continue;
                    entries.push({id: entry.id, providerId: entry.providerId, label: '', username: ''});
                }
            }
            if (entries.length > MAX_CONNECTORS) throw new Error('too many saved connector identities to recover');
            save(entries); return list();
        }, get: id => list().find(entry => entry.id === id),
        add(providerId, label = '', username = '') {
            const connector = {id: `${providerId}--${uuid()}`, providerId, label, username};
            save([...list(), connector]); return connector;
        },
        update(id, patch) {
            const entries = list(); const current = entries.find(entry => entry.id === id);
            if (!current) throw new Error('connector not found');
            const changed = {...current, ...patch, id: current.id, providerId: current.providerId};
            save(entries.map(entry => entry.id === id ? changed : entry)); return changed;
        },
        remove(id) { save(list().filter(entry => entry.id !== id)); prunePopupPresentation(settings, {demo, removedId: id}); },
        clear() { save([]); prunePopupPresentation(settings, {demo}); },
        subscribe(fn) { if (disposed) throw new Error('connector store closed'); listeners.add(fn); return () => listeners.delete(fn); },
        dispose() { if (disposed) return; disposed = true; settings.disconnect(signal); listeners.clear(); }};
}

/** Prune appearance metadata only after the corresponding registry deletion succeeds. */
export function prunePopupPresentation(settings, {demo = false, removedId = null} = {}) {
    for (const key of Object.values(popupKeys(demo))) {
        const previous = settings.get_strv(key);
        const retained = removedId === null ? [] : previous.filter(id => id !== removedId);
        if (retained.length !== previous.length && settings.set_strv(key, retained) !== true)
            throw new Error('popup presentation unavailable');
    }
}
