// Developer-only text inflation, injected by layout probes. Never changes process/session locale.
const PLACEHOLDER = /(%(?:\d+\$)?[-+ #0]*\d*(?:\.\d+)?[sdif]|%%)/g;
export function expandText(text) {
    // Keep original words searchable, and add ~40% in literal chunks before formatting.
    const source = String(text);
    const expanded = source.split(PLACEHOLDER).map((part, i) => i % 2 ? part : `${part}${'·'.repeat(Math.ceil(part.length * 0.4))}`).join('');
    return expanded + '·'.repeat(Math.max(0, Math.ceil(source.length * 1.4) - expanded.length));
}
export function pseudoTranslations(t) {
    return {
        gettext: s => expandText(t.gettext(s)),
        ngettext: (a, b, n) => expandText(t.ngettext(a, b, n)),
        pgettext: (c, s) => expandText(t.pgettext(c, s)),
    };
}
