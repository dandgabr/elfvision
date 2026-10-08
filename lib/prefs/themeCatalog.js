// The text the preferences window shows for the built-in themes. Theme names
// are style names and stay as they are; the group and the one-line description
// are translated, so they live here with literal _() calls that xgettext can see.

/**
 * @param {(msgid: string) => string} _ - the extension's gettext
 * @returns {{groups: string[], byId: Object<string, {group: string, description: string}>}}
 */
export function builtinCatalog(_) {
    const clean = _('Clean and functional');
    const editorial = _('Typography and editorial');
    const surface = _('Surface and materials');
    const immersive = _('Immersive and motion');
    const punk = _('Punks and science fiction');
    const retro = _('Historical and retro');
    const rebel = _('Brutalist and rebellious');
    return {
        groups: [clean, editorial, surface, immersive, punk, retro, rebel],
        byId: {
            'flat-design': {group: clean, description: _('Solid colors, no shadows or gradients.')},
            'card-based-ui': {group: clean, description: _('Everything in modular cards.')},
            'bento-grid': {group: clean, description: _('A grid of asymmetric blocks.')},
            'linear-saas': {group: clean, description: _('Refined dark product UI with subtle borders.')},
            'analog-newspaper-broadsheet': {group: editorial, description: _('A daily newspaper page, in columns with serif type.')},
            'expressive-variable-typography': {group: editorial, description: _('Large variable type, the glyph as the image.')},
            'hand-drawn-sketch': {group: editorial, description: _('Strokes drawn by hand.')},
            'aurora-mesh-gradient': {group: surface, description: _('Soft mesh gradients.')},
            'organic-biophilic': {group: surface, description: _('Warm paper, botanical forms and gentle falling leaves.')},
            'glassmorphism': {group: surface, description: _('Translucent glass, soft frost and luminous edges.')},
            'holographic-foil-iridescent': {group: surface, description: _('Pearly, prismatic foil.')},
            'isometric': {group: immersive, description: _('Isometric projection.')},
            'ai-native-generative-ui': {group: immersive, description: _('An interface composed from intent.')},
            'cyberpunk': {group: punk, description: _('Neon noir and tactical HUD.')},
            'lunarpunk': {group: punk, description: _('Night, silver and digital mysticism.')},
            'nanopunk': {group: punk, description: _('Micro scale, particles and precision.')},
            'solarpunk': {group: punk, description: _('A green, sunlit future on linen tones.')},
            'de-stijl': {group: retro, description: _('Black lines and primary colors.')},
            'mid-century-modern': {group: retro, description: _('Mid-twentieth century, earthy tones.')},
            'terminal-tui': {group: retro, description: _('A text terminal interface.')},
            'web-brutalism': {group: rebel, description: _('Raw HTML and dense tables.')},
        },
    };
}
