// Fixed read-only administrative reporting endpoints. Cursor's POST is a report query.
import {KEY_PATTERN} from '../core/commandCode.js';
import {ProviderError, errorForStatus} from '../core/errors.js';
import {basicAuthorization, changed, monthBounds, parseCostPage, parseCursorPage,
    parseOpenRouterCredits, parseOpenRouterKey, parseSpendLimit, spendMetric} from '../core/apiUsage.js';

const HOSTS = {'openai-api': 'api.openai.com', 'anthropic-api': 'api.anthropic.com',
    cursor: 'api.cursor.com', openrouter: 'openrouter.ai'};
const MAX_PAGES = 10;

export function createApiUsageProvider({id, name, http, getKey, now = Date.now}) {
    if (!Object.hasOwn(HOSTS, id)) throw changed();
    let disposed = false;
    const check = context => {
        if (disposed || context?.isCancelled()) throw new ProviderError('network', 'the request was cancelled');
    };
    return {
        id, name, plan: '', intervalMs: id === 'cursor' ? 3600000 : 5 * 60 * 1000,
        dispose() { disposed = true; http.dispose?.(); },
        async fetch(context) {
            check(context);
            let key;
            try { key = await getKey(); } catch (_error) {
                check(context);
                throw new ProviderError('network', 'the keyring is not available', {reason: 'keyring'});
            }
            check(context);
            if (!key) throw new ProviderError('auth_required', 'no API key is stored', {reason: 'no_key'});
            if (typeof key !== 'string' || !KEY_PATTERN.test(key) || (id === 'cursor' && key.includes(':')))
                throw new ProviderError('auth_required', 'the stored key is not valid', {reason: 'rejected'});
            const headers = id === 'anthropic-api' ? {'x-api-key': key, 'anthropic-version': '2023-06-01'} :
                {Authorization: id === 'cursor' ? basicAuthorization(key) : `Bearer ${key}`};
            const ask = async (path, body = null, optional = false) => {
                check(context);
                let reply;
                try {
                    reply = await http.request(`https://${HOSTS[id]}${path}`, {method: body === null ? 'GET' : 'POST',
                        headers, context, maxBytes: 1024 * 1024,
                        ...(body === null ? {} : {body: JSON.stringify(body), contentType: 'application/json'})});
                } catch (error) {
                    if (error instanceof ProviderError) throw error;
                    throw new ProviderError('network', 'cannot reach the reporting server');
                }
                check(context);
                if (optional && reply.status === 404) return null;
                const failure = errorForStatus(reply.status, reply.retryAfter);
                if (failure) throw failure;
                return reply.json;
            };
            const timestamp = now();
            if (id === 'openrouter') {
                const body = await ask('/api/v1/key');
                const result = parseOpenRouterKey(body, timestamp);
                if (body.data.is_management_key === true)
                    return parseOpenRouterCredits(await ask('/api/v1/credits'));
                return result;
            }
            if (id === 'cursor') {
                let total = 0, pages = null, members = null, count = 0;
                for (let page = 1; page <= MAX_PAGES; page++) {
                    const parsed = parseCursorPage(await ask('/teams/spend', {page, pageSize: 100}));
                    if (pages !== null && (pages !== parsed.pages || members !== parsed.members)) throw changed();
                    pages = parsed.pages;
                    members = parsed.members;
                    count += parsed.count;
                    total += parsed.amount;
                    if (page === pages) {
                        if (count !== members) throw changed();
                        return {metrics: [spendMetric(total, timestamp, false)]};
                    }
                }
                throw changed();
            }
            const bounds = monthBounds(timestamp);
            const base = id === 'openai-api' ?
                `/v1/organization/costs?start_time=${bounds.start / 1000}&end_time=${Math.floor(timestamp / 1000)}&bucket_width=1d&limit=31` :
                `/v1/organizations/cost_report?starting_at=${encodeURIComponent(new Date(bounds.start).toISOString())}&ending_at=${encodeURIComponent(new Date(timestamp).toISOString())}&bucket_width=1d&limit=31`;
            let cursor = null, total = 0;
            const seen = new Set();
            for (let page = 0; page < MAX_PAGES; page++) {
                const parsed = parseCostPage(id, await ask(base + (cursor === null ? '' : `&page=${encodeURIComponent(cursor)}`)));
                total += parsed.amount;
                if (parsed.next === null) {
                    const metric = spendMetric(total, timestamp);
                    if (id === 'openai-api') {
                        const limit = await ask('/v1/organization/spend_limit', null, true);
                        if (limit !== null) {
                            const amount = parseSpendLimit(limit);
                            if (amount !== null) metric.limit = amount;
                        }
                    }
                    return {metrics: [metric]};
                }
                if (seen.has(parsed.next)) throw changed();
                seen.add(parsed.next);
                cursor = parsed.next;
            }
            throw changed();
        },
    };
}
