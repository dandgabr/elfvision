const normalize = value => value.trim().toLowerCase();

export function parseFontconfigList(output) {
    if (typeof output !== 'string')
        return [];
    return output.split('\n').flatMap(line => {
        if (!line)
            return [];
        const separator = line.indexOf('\t');
        if (separator < 0)
            return [];
        const families = line.slice(0, separator).split(',').map(name => name.trim()).filter(Boolean);
        const path = line.slice(separator + 1).trim();
        const filename = path.split('/').at(-1);
        return families.length && path ? [{families, path, filename}] : [];
    });
}

export function fontSource(path, userDataDirectory, homeDirectory) {
    const userRoots = [`${userDataDirectory}/fonts/`, `${homeDirectory}/.fonts/`];
    if (userRoots.some(root => path.startsWith(root)))
        return 'user';
    if (/^\/(usr\/share|usr\/local\/share|usr\/lib|usr\/local\/lib)\/fonts\//.test(path))
        return 'system';
    return 'other';
}

export function themeFontCoverage(theme, records) {
    const roles = ['body', 'display', 'mono'];
    return Object.fromEntries(roles.map(role => {
        const font = theme.fonts?.[role] ?? (['display', 'mono'].includes(role) ? theme.fonts?.body : null);
        if (!font || !font.name)
            return [role, {status: 'system', family: null, source: 'system'}];
        const names = [font.name, ...(font.fallbacks ?? [])].filter(Boolean);
        for (let index = 0; index < names.length; index++) {
            const wanted = normalize(names[index]);
            const matches = records.filter(record => record.families.some(family => normalize(family) === wanted));
            if (matches.length) {
                const sources = [...new Set(matches.map(match => match.source ?? 'other'))].sort();
                return [role, {status: index === 0 ? 'available' : 'fallback', family: names[index], source: sources.join('+')}];
            }
        }
        return [role, {status: 'missing', family: names[0] ?? null, source: null}];
    }));
}

export function fontFileIsVisible(entry, records) {
    const wanted = normalize(entry.family);
    return records.some(record => record.filename === entry.filename
        && record.families.some(family => normalize(family) === wanted));
}
