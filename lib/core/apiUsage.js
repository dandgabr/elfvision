// Administrative reporting parsers. Amounts are USD, never inferred from tokens.
import {ProviderError} from './errors.js';

export function changed() {
    return new ProviderError('provider_changed', 'the reporting reply has unexpected fields');
}
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const usd = value => typeof value === 'string' && value.toUpperCase() === 'USD';

export function monthBounds(now) {
    const date = new Date(now);
    return {start: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
        end: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)};
}

export function spendMetric(amount, now, monthly = true) {
    if (!number(amount)) throw changed();
    return {id: 'api-spend', kind: 'spend', amount, currency: 'USD', window: monthly ? 'month' : 'none',
        ...(monthly ? {resetsAt: monthBounds(now).end} : {})};
}

/** Both vendors return bucketed results, but Anthropic's decimal strings are cents. */
export function parseCostPage(id, body) {
    if (!Array.isArray(body?.data) || typeof body.has_more !== 'boolean') throw changed();
    let amount = 0;
    for (const bucket of body.data) {
        if (!Array.isArray(bucket?.results)) throw changed();
        for (const result of bucket.results) {
            let value;
            if (id === 'openai-api') {
                if (!usd(result?.amount?.currency) || !number(result.amount.value)) throw changed();
                value = result.amount.value;
            } else {
                if (!usd(result?.currency) || typeof result.amount !== 'string' || !/^\d+(?:\.\d+)?$/.test(result.amount)) throw changed();
                value = Number(result.amount) / 100;
            }
            if (!number(value) || !number(amount + value)) throw changed();
            amount += value;
        }
    }
    const next = body.next_page;
    if (body.has_more && (typeof next !== 'string' || next.length < 1 || next.length > 512 || !/^[\x21-\x7e]+$/.test(next))) throw changed();
    return {amount, next: body.has_more ? next : null};
}

export function parseSpendLimit(body) {
    if (!usd(body?.currency) || body.interval !== 'month' || !number(body.threshold_amount)) throw changed();
    return body.threshold_amount > 0 ? body.threshold_amount / 100 : null;
}

export function parseCursorPage(body) {
    if (!Array.isArray(body?.teamMemberSpend) || !Number.isInteger(body.totalPages) || body.totalPages < 0 || body.totalPages > 10 ||
        !Number.isInteger(body.totalMembers) || body.totalMembers < 0 || body.teamMemberSpend.length > 100 ||
        (body.totalMembers > 0 && (body.totalPages < 1 || body.teamMemberSpend.length === 0))) throw changed();
    let amount = 0;
    for (const member of body.teamMemberSpend) {
        if (!number(member?.overallSpendCents)) throw changed();
        amount += member.overallSpendCents / 100;
    }
    if (!number(amount)) throw changed();
    return {amount, pages: Math.max(1, body.totalPages), members: body.totalMembers, count: body.teamMemberSpend.length};
}

export function parseOpenRouterKey(body, now) {
    const data = body?.data;
    if (!data) throw changed();
    if (data.limit === null) {
        return {metrics: [spendMetric(data.usage, now, false)]};
    }
    if (!number(data.limit) || !number(data.limit_remaining) ||
        data.limit_remaining > data.limit || ![null, 'daily', 'weekly', 'monthly'].includes(data.limit_reset)) throw changed();
    const period = data.limit_reset;
    let resetsAt;
    if (period === 'monthly') resetsAt = monthBounds(now).end;
    if (period === 'daily' || period === 'weekly') {
        const date = new Date(now);
        resetsAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() +
            (period === 'daily' ? 1 : (8 - date.getUTCDay()) % 7 || 7));
    }
    return {metrics: [{id: 'key-allowance', kind: 'money', basis: 'allowance', balance: data.limit_remaining,
        budget: data.limit, currency: 'USD', window: {daily: 'day', weekly: 'week', monthly: 'month'}[period] ?? 'none',
        ...(resetsAt ? {resetsAt} : {})}]};
}

export function parseOpenRouterCredits(body) {
    const data = body?.data;
    if (!number(data?.total_credits) || !number(data?.total_usage) || data.total_usage > data.total_credits) throw changed();
    return {metrics: [{id: 'account-credits', kind: 'money', balance: data.total_credits - data.total_usage,
        budget: data.total_credits, currency: 'USD'}]};
}

// GJS has no browser btoa. The validated printable ASCII key is the Basic username.
export function basicAuthorization(key) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const input = `${key}:`;
    let out = '';
    for (let i = 0; i < input.length; i += 3) {
        const a = input.charCodeAt(i), b = input.charCodeAt(i + 1), c = input.charCodeAt(i + 2);
        out += chars[a >> 2] + chars[(a & 3) << 4 | (Number.isNaN(b) ? 0 : b >> 4)] +
            (Number.isNaN(b) ? '=' : chars[(b & 15) << 2 | (Number.isNaN(c) ? 0 : c >> 6)]) +
            (Number.isNaN(c) ? '=' : chars[c & 63]);
    }
    return `Basic ${out}`;
}
