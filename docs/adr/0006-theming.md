# 0006. Theming: 20 themes, light and dark, tokens

Status: accepted

## Context

Colors can follow the system or a chosen visual style. The panel and the popup are
drawn by the GNOME Shell stylesheet (`gnome-shell-theme.gresource`), not by GTK.
The popup background comes from `.popup-menu-content` (about `#36363a` in the dark
variant) and the accent comes from the GNOME accent color (`accent-color`, GNOME 47
and later), exposed to CSS as `-st-accent-color`. Light or dark follows
`color-scheme`. The author keeps a gallery of 72 styles in `dandgabr/estilos-visuais`
(MIT, derived from the Coacus `ui-style-*` skills).

## Decision

- **The default theme is `sistema-gnome`**, which follows the shell: popup
  background, GNOME accent, light and dark. The stock shell only ships a dark
  popup, so the light variant applies when the shell theme provides one.
- **Version 1 ships 20 themes**, each with a light and a dark variant:
  `sistema-gnome`, `isometric`, `web-brutalism`, `ai-native-generative-ui`,
  `analog-newspaper-broadsheet`, `hand-drawn-sketch`,
  `expressive-variable-typography`, `de-stijl`, `mid-century-modern`, `terminal-tui`,
  `cyberpunk`, `lunarpunk`, `nanopunk`, `solarpunk`, `aurora-mesh-gradient`,
  `holographic-foil-iridescent`, `bento-grid`, `card-based-ui`, `flat-design`,
  `linear-saas`.
- **Themes are data, not code.** A theme is a folder
  `~/.local/share/gnome-ai-quota/themes/<id>/theme.json` (plus an optional preview).
  At startup the loader validates the tokens and **compiles** them into a stylesheet
  with a prefix (`.gaq-t-<id>`) because St does not support `var()`. Switching
  themes unloads one stylesheet and loads the other without restarting the shell.
  An invalid theme falls back to `sistema-gnome` and warns.
- **Token names match the gallery**: `bg`, `surface`, `surface-2`, `fg`, `muted`,
  `accent`, `accent-fg`, `border`, `ok`, `warn`, `danger`, `radius`, `radius-sm`,
  `shadow`, and the font families for body, display and mono. Importing a style is
  generating a `theme.json`.
- **Light and dark are mandatory for every style.** The gallery styles have one
  scheme each (33 native dark, 39 native light). `tools/gen-themes.py` derives the
  missing scheme in OKLCH (neutrals retinted, accent hue preserved, status colors
  re-leveled, hard shadows and strong borders preserved with an inverted color) and
  **auto-corrects contrast**: text 7:1, secondary text and statuses 4.5:1, accent
  3:1, text on accent 4.5:1. The audit reports no failures across the 72 styles in
  both schemes (17 native schemes needed an adjustment).
- The active scheme follows the system, with a manual Light, Dark or System override.
- **Fidelity levels:** N1 tokens (colors, radii, border, shadow, fonts); N2 shapes
  in St CSS (hard offset shadow, thick border, asymmetric radius, simple gradient);
  N3 effects (blur, chamfer, scanlines, texture, hand-drawn strokes) through
  `St.DrawingArea` or effects. **Version 1 delivers N1 and N2 for all 20 themes;
  N3 comes later, theme by theme.** Estimated difficulty in St: easy (sistema-gnome,
  card-based-ui, flat-design, linear-saas); medium (web-brutalism, broadsheet,
  expressive typography, de-stijl, mid-century, terminal, bento); hard (isometric,
  ai-native, hand-drawn, cyberpunk, lunarpunk, nanopunk, solarpunk, aurora,
  holographic).
- **Fonts:** the 27 families the themes ask for are Google Fonts. St only uses
  installed fonts, so a missing family falls back to the system font. An optional
  installer in Preferences downloads a theme's fonts to `~/.local/share/fonts` only
  on request and after confirmation.

## Consequences

- A new theme is a JSON file; no extension code changes.
- Effects that St cannot do become flags that only built-in themes may request,
  implemented in dedicated widgets.
- Theme pages in the gallery are rendered with the same tokens, so the mockups stay
  faithful to what the extension can paint at levels N1 and N2.
