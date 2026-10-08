// Developer-reviewed Google Fonts distribution, pinned 2026-10-07. Theme data cannot add sources.
export const FONT_REVISION = '5e8a3ba899557829a76cfdac30fa512bda91d7ca';
export const FONT_LIMITS = Object.freeze({fileBytes: 5 * 1024 * 1024, actionBytes: 20 * 1024 * 1024, files: 4, redirects: 3});
const base = `https://raw.githubusercontent.com/google/fonts/${FONT_REVISION}/ofl/`;
const font = (id, family, directory, filename, size, sha256) => Object.freeze({id, family, filename, size, sha256,
    revision: FONT_REVISION, license: 'OFL-1.1', licenseFile: `${directory}-OFL.txt`,
    licenseUrl: `${base}${directory}/OFL.txt`, url: `${base}${directory}/${encodeURIComponent(filename)}`});
export const FONT_MANIFEST = Object.freeze([
    font('poppins-regular', 'Poppins Regular', 'poppins', 'Poppins-Regular.ttf', 160316, '7e65201e9b79159e2300267cc885e16c8dcef2424cdfa09a29bfb0980a94a7ba'),
    font('poppins-bold', 'Poppins Bold', 'poppins', 'Poppins-Bold.ttf', 155996, '983676516167748b74de6f4771fb384c664fd913acb8b471122ecacf5da5ea6c'),
    font('inter-variable', 'Inter Variable', 'inter', 'Inter[opsz,wght].ttf', 876576, '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031'),
    font('jetbrains-mono-variable', 'JetBrains Mono Variable', 'jetbrainsmono', 'JetBrainsMono[wght].ttf', 187208, '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda'),
]);

export function fontPlan(ids = FONT_MANIFEST.map(file => file.id), manifest = FONT_MANIFEST) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > FONT_LIMITS.files || new Set(ids).size !== ids.length)
        throw new Error('invalid_selection');
    const files = ids.map(id => manifest.find(file => file.id === id));
    if (files.some(file => !file || !/^[A-Za-z0-9[\],.-]+\.(ttf|otf)$/.test(file.filename)
        || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > FONT_LIMITS.fileBytes
        || !/^[0-9a-f]{64}$/.test(file.sha256)))
        throw new Error('invalid_selection');
    const bytes = files.reduce((total, file) => total + file.size, 0);
    if (bytes > FONT_LIMITS.actionBytes)
        throw new Error('size_limit');
    return {files: files.map(file => ({...file})), bytes, host: 'raw.githubusercontent.com', revision: FONT_REVISION};
}

// Only exact, reviewed HTTPS addresses, including redirect targets; no credentials/query/ports.
export function allowedFontUrl(url, manifest = FONT_MANIFEST) {
    return typeof url === 'string' && url.startsWith('https://raw.githubusercontent.com/') && manifest.some(file => file.url === url);
}

export function hasFontHeader(bytes) {
    return bytes?.length >= 4 && ((bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)
        || (bytes[0] === 79 && bytes[1] === 84 && bytes[2] === 84 && bytes[3] === 79));
}
