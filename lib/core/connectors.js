/* global TextEncoder */
// Connector identifiers are local opaque identities; provider types remain registry-owned.
import {providerMeta} from './providerRegistry.js';
export const MAX_CONNECTORS = 32;
export const MAX_CONNECTOR_BYTES = 16384;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function providerIdForConnector(id, {demo = false} = {}) {
    if (typeof id !== 'string') return null;
    const allowed = provider => { const meta = providerMeta(provider); return meta?.available && (demo || !meta.demoOnly); };
    if (allowed(id)) return id;
    const [provider, suffix, ...rest] = id.split('--');
    return rest.length === 0 && allowed(provider) && UUID.test(suffix ?? '') ? provider : null;
}
function plain(value, max) {
    return typeof value === 'string' && value.length <= max && ![...value].some(character => { const code = character.codePointAt(0); return code < 32 || (code >= 127 && code <= 159) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069); });
}
export function validateConnectors(entries, {demo = false} = {}) {
    if (!Array.isArray(entries) || entries.length > MAX_CONNECTORS) throw new Error('invalid connector collection');
    const seen = new Set();
    return entries.map(entry => {
        if (!entry || providerIdForConnector(entry.id, {demo}) !== entry.providerId || seen.has(entry.id) ||
            !plain(entry.label, 64) || !plain(entry.username, 64)) throw new Error('invalid connector metadata');
        seen.add(entry.id);
        return {id: entry.id, providerId: entry.providerId, label: entry.label, username: entry.username};
    });
}
export function decodeConnectors(value, {demo = false} = {}) {
    if (value === '') return [];
    if (typeof value !== 'string' || new TextEncoder().encode(value).length > MAX_CONNECTOR_BYTES) throw new Error('invalid connector registry');
    const parsed = JSON.parse(value);
    if (parsed.version !== 1) throw new Error('unsupported connector registry');
    return validateConnectors(parsed.connectors, {demo});
}
