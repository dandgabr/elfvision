// Developer-reviewed Google Fonts distribution, pinned 2026-10-07.
// One variable or regular face covers every non-system family used by the built-in themes.
export const FONT_REVISION = '5e8a3ba899557829a76cfdac30fa512bda91d7ca';
export const FONT_LIMITS = Object.freeze({fileBytes: 5 * 1024 * 1024, actionBytes: 20 * 1024 * 1024, files: 48, redirects: 3});
const base = `https://raw.githubusercontent.com/google/fonts/${FONT_REVISION}/ofl/`;
const font = (id, family, directory, filename, size, sha256) => Object.freeze({id, family, filename, size, sha256,
    revision: FONT_REVISION, license: 'OFL-1.1', licenseFile: `${directory}-OFL.txt`,
    licenseUrl: `${base}${directory}/OFL.txt`, url: `${base}${directory}/${encodeURIComponent(filename)}`});

export const FONT_MANIFEST = Object.freeze([
    font('archivo-variable', 'Archivo', 'archivo', 'Archivo[wdth,wght].ttf', 658596, '0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053'),
    font('archivo-black', 'Archivo Black', 'archivoblack', 'ArchivoBlack-Regular.ttf', 90988, 'dd9a89a019b4849f66ab75455fe7bdf931311042cbb0f0f97acc061539703180'),
    font('caveat-variable', 'Caveat', 'caveat', 'Caveat[wght].ttf', 403648, '0bdb6b660482d31531b3945849fba5916b3ef8695da7024a9e6b9ee3c4157988'),
    font('courier-prime', 'Courier Prime', 'courierprime', 'CourierPrime-Regular.ttf', 71188, '72f793376f8e2841656bf21d77a5de010f2929bd6956a22ee848ad0c7eb978af'),
    font('courier-prime-bold', 'Courier Prime', 'courierprime', 'CourierPrime-Bold.ttf', 72856, 'ff1f38786c849d1c41fa8e447960abdb2bd75fdfb0cfcdeb524fad65a5af3638'),
    font('dm-sans-variable', 'DM Sans', 'dmsans', 'DMSans[opsz,wght].ttf', 240164, '8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d'),
    font('fraunces-variable', 'Fraunces', 'fraunces', 'Fraunces[SOFT,WONK,opsz,wght].ttf', 360440, '177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb'),
    font('geist-variable', 'Geist', 'geist', 'Geist[wght].ttf', 169056, '73894e0448cae90a92b6c2f8732b7bb9acb7b94c418bff559dad4a18e1de9659'),
    font('geist-mono-variable', 'Geist Mono', 'geistmono', 'GeistMono[wght].ttf', 171948, 'd00e590b8eb3a59acc329b2d044fd143ae935090b7da33199ebee27cc7de8196'),
    font('gochi-hand', 'Gochi Hand', 'gochihand', 'GochiHand-Regular.ttf', 37352, 'c46b029ab4846b2935e301af0b2cf85a1d74d2858e6a33636a3e64cf3cc4696b'),
    font('inter-variable', 'Inter', 'inter', 'Inter[opsz,wght].ttf', 876576, '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031'),
    font('jetbrains-mono-variable', 'JetBrains Mono', 'jetbrainsmono', 'JetBrainsMono[wght].ttf', 187208, '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda'),
    font('josefin-sans-variable', 'Josefin Sans', 'josefinsans', 'JosefinSans[wght].ttf', 118588, '9255abdb5f393bc51e101abbd07a716a977fd3e15472b1b84b260f426a342bfd'),
    font('montserrat-variable', 'Montserrat', 'montserrat', 'Montserrat[wght].ttf', 744936, '0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7'),
    font('newsreader-variable', 'Newsreader', 'newsreader', 'Newsreader[opsz,wght].ttf', 451664, '8a08d13f8a6c0d51be379a60af84f945f65369a67e509ee3c3bdcc421254d7c1'),
    font('nunito-variable', 'Nunito', 'nunito', 'Nunito[wght].ttf', 276932, 'bb55a5ca5c2042335b3991af27c4d0705d0ef41cac6164ac737fd8f2a1e85207'),
    font('nunito-sans-variable', 'Nunito Sans', 'nunitosans', 'NunitoSans[YTLC,opsz,wdth,wght].ttf', 571240, 'f934d7142fb4784bf828da485b7dcbd90c0c80d514e9d49a5da0ed3a1ae2491d'),
    font('orbitron-variable', 'Orbitron', 'orbitron', 'Orbitron[wght].ttf', 38576, 'f42db2dd16e642258e35782916eceb1dcdbea06fb958d77ad71dc5963587e8fd'),
    font('patrick-hand', 'Patrick Hand', 'patrickhand', 'PatrickHand-Regular.ttf', 214772, '0f173b3e6cb6d1af25babf7f0057c5ac4ee11f9992b0469bb817e967ef4ad0fc'),
    font('plus-jakarta-sans-variable', 'Plus Jakarta Sans', 'plusjakartasans', 'PlusJakartaSans[wght].ttf', 176288, '89b3fb38aa0d275d7a731d0d817a4f1622b316b4d7fbdedcf02ee9099ff68bc8'),
    font('poppins-regular', 'Poppins', 'poppins', 'Poppins-Regular.ttf', 160316, '7e65201e9b79159e2300267cc885e16c8dcef2424cdfa09a29bfb0980a94a7ba'),
    font('poppins-medium', 'Poppins', 'poppins', 'Poppins-Medium.ttf', 158576, '90373e7d838d32468438fc3e152dca0bdb12edcab99ea639f158790b1ba1fd05'),
    font('poppins-semibold', 'Poppins', 'poppins', 'Poppins-SemiBold.ttf', 157312, 'd3bf1bdaf0550e83da9ac0b1d1d9fe6db086835a83aa28578e609a394b9a0286'),
    font('poppins-bold', 'Poppins', 'poppins', 'Poppins-Bold.ttf', 155996, '983676516167748b74de6f4771fb384c664fd913acb8b471122ecacf5da5ea6c'),
    font('poppins-extrabold', 'Poppins', 'poppins', 'Poppins-ExtraBold.ttf', 154836, 'f2ab17c1a63a0ecc12c2461848fc8a469395e3cd2d641803e889c643d9f958e1'),
    font('rajdhani-regular', 'Rajdhani', 'rajdhani', 'Rajdhani-Regular.ttf', 377860, '6e1fc228a8318251a6e569502ec57bac1e4656c582f92f59ccecc4688e039b98'),
    font('rajdhani-medium', 'Rajdhani', 'rajdhani', 'Rajdhani-Medium.ttf', 384348, '12ff7dcfe4c206e3875ac53b1762eab57de6a2fa7f5a86c26b97b88d6591eac2'),
    font('rajdhani-semibold', 'Rajdhani', 'rajdhani', 'Rajdhani-SemiBold.ttf', 390340, '94bbd25a18ca665999feb05a537de9fd2b860dcfb78bbe9ca00270825bf235da'),
    font('rajdhani-bold', 'Rajdhani', 'rajdhani', 'Rajdhani-Bold.ttf', 400680, '691470dd3286a14e9677940d0bf75796179841ba5215cbda1a2c8910a3226afd'),
    font('roboto-flex-variable', 'Roboto Flex', 'robotoflex', 'RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].ttf', 1787292, '9b523f7d82593df0107173849ebb8c817471a1df4b4fb2c3cbf40cfd810c8281'),
    font('rubik-variable', 'Rubik', 'rubik', 'Rubik[wght].ttf', 359804, '1b3a7437ba2af80e465e773ed60c5036d1ba6ace492d89046dbcf18fb31e4e88'),
    font('rubik-mono-one', 'Rubik Mono One', 'rubikmonoone', 'RubikMonoOne-Regular.ttf', 141088, 'b22624b6a36e543e942106edfccd198c50b57b65b924bfe02a6f0a5699429e6b'),
    font('share-tech-mono', 'Share Tech Mono', 'sharetechmono', 'ShareTechMono-Regular.ttf', 43272, '9ceab1f87414829af259c0f537573ae03ef7dd3147c0b27a36a1a0beb6732677'),
    font('sora-variable', 'Sora', 'sora', 'Sora[wght].ttf', 111400, '84ff7096ae3ec6c8be47d906d1a0ba4de7f2ce78c615275c77301964a316e16c'),
    font('source-serif-4-variable', 'Source Serif 4', 'sourceserif4', 'SourceSerif4[opsz,wght].ttf', 1209508, '97b2d4da6e3cb494b5a1e66ae176914d852ccabef49e0c02c0df25f3e39aca0b'),
    font('space-grotesk-variable', 'Space Grotesk', 'spacegrotesk', 'SpaceGrotesk[wght].ttf', 136676, 'acad6de1fc93436f5c0f1f4137751ef04f1aea3063e7036535970ffcfbd79f72'),
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
