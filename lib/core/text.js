// Text that reaches the screen from code, not from a translator or a registry constant. Controls and
// the invisible characters that reorder text (the bidirectional overrides and isolates, the
// left/right marks) have no business in a notification or a tooltip, whoever wrote the string, and
// a length cap keeps one from running across the screen. Markup is not interpreted by the widgets
// that show it, so what is left is shown as typed. Pure JavaScript.

// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/**
 * @param {*} text
 * @param {number} [max] - the longest result, in characters
 * @returns {string} the text without controls (a newline is kept) or direction overrides, capped
 */
export function safeText(text, max = 400) {
    return String(text).replace(UNSAFE, '').slice(0, max);
}
