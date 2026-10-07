# 0006. Theming: 20 themes, light and dark, tokens

Status: accepted. Implemented, except the items listed under "Not implemented".

## Context

The panel and the popup are drawn by the GNOME Shell stylesheet, not by GTK. The
popup background comes from `.popup-menu-content` (about `#36363a` in the dark
variant) and the accent from the GNOME accent color (`accent-color`, GNOME 47 and
later). Light or dark follows `color-scheme`. The author keeps a gallery of 72
visual styles, `dandgabr/estilos-visuais` (MIT, derived from the Coacus `ui-style-*`
skills), which is the source of 19 of the built-in themes.

## Decision

### Themes are data

- A theme is a folder with a `theme.json`. Built-in themes live in
  `themes/builtin/<id>/`; the user's live in
  `~/.local/share/gnome-ai-quota/themes/<id>/`, and a user theme wins over a built-in
  one with the same id.
- At startup, and when the theme changes, `lib/core/theme.js` validates the file and
  compiles its tokens together with `lib/core/theme.template.css` into one
  stylesheet, because St does not support `var()`. There is no static
  `stylesheet.css`. Only one theme is loaded at a time, so selectors need no
  per-theme prefix; they all start with `gaq-`. Switching unloads one stylesheet and
  loads the other without restarting the shell.
- A theme that is missing or invalid falls back to `sistema-gnome`, with the reasons
  in the log. The picker lists rejected folders with the reason.

### The theme file

```text
id, name, description        id: lowercase letters, digits, dashes; equals the folder name
schemes.light, schemes.dark  both required
  required colors            bg, surface, fg, muted, border, accent, warn, danger
  optional colors            surface-2, accent-fg, ok, error, shadow
radius.card, radius.control  pixels, clamped to 0..40 (defaults 14 and 8)
border                       "hairline" (1 px) or "strong" (2 px)
fonts.body, fonts.display    CSS font stacks; only the first family is used
```

Missing optional values are derived: `surface-2` equals `surface`, `ok` and `error`
get fixed defaults chosen by the background's brightness (`error` is distinct from
warn and danger), and `accent-fg` is picked for contrast with the accent. A theme
may also carry extra fields, such as the generator's audit, which the loader ignores.

### Validation

Theme files can come from the user's folder, so `validateTheme` treats them as
hostile: colors must be hex (or `system-accent` for the accent), sizes are clamped,
font names are reduced to one safe family plus a generic fallback, a shadow must be a
single simple shape, ids are restricted to `[a-z0-9-]`, and a file is read only if it
is a regular file of at most 64 KiB whose `id` matches its folder.

### Default theme

`sistema-gnome` follows the shell: popup background, GNOME accent, light and dark.
Its accent is the value `system-accent`, resolved from `accent-color` (brightened in
the dark scheme), and the stylesheet is rebuilt when that setting changes. Meter
fills use blue when the GNOME accent is yellow, orange, red or pink, so a normal bar
does not look like a warning.

### Light and dark

- **Every theme has both schemes.** The gallery styles have one native scheme each
  (33 dark, 39 light). `tools/gen-themes.py` derives the missing one in OKLCH
  (neutrals retinted, accent hue preserved, status colors re-leveled, hard shadows
  and strong borders kept with an inverted color) and corrects contrast: text 7:1,
  secondary text and status colors 4.5:1, accent 3:1, text on accent 4.5:1.
- The accent keeps at least 35 degrees of hue from warn and danger, so it is never
  read as a state. Every scheme gets its own `error` color (orange when it fits,
  violet otherwise, 4.5:1 on the surface), and a hairline border is raised to at
  least 1.4:1 against the card.
- The popup uses the scheme from the `color-scheme` setting (`system`, `light` or
  `dark`; `system` follows `org.gnome.desktop.interface color-scheme`) and also
  restyles the shell's menu surface (`.gaq-menu`), so a light popup has no dark
  frame. The top bar, including its meters, always uses the dark scheme because it
  sits on the shell's dark panel.

### The 20 themes

`sistema-gnome`, `isometric`, `web-brutalism`, `ai-native-generative-ui`,
`analog-newspaper-broadsheet`, `hand-drawn-sketch`, `expressive-variable-typography`,
`de-stijl`, `mid-century-modern`, `terminal-tui`, `cyberpunk`, `lunarpunk`,
`nanopunk`, `solarpunk`, `aurora-mesh-gradient`, `holographic-foil-iridescent`,
`bento-grid`, `card-based-ui`, `flat-design`, `linear-saas`.

`sistema-gnome` is written by hand. The other 19 are generated; `themes/v1.txt` lists
their slugs.

### Fidelity

Version 1 delivers two levels for all 20 themes: tokens (colors, radii, border,
shadow, fonts) and shapes expressible in St CSS (a hard offset shadow, a thick
border, an asymmetric radius, a simple gradient). Effects St cannot do in CSS (blur,
chamfered corners, scanlines, textures, hand-drawn strokes) are not implemented.
They would need `St.DrawingArea` or effects, as flags only built-in themes may
request.

### Fonts

Themes ask for 27 Google Fonts families. St only uses installed fonts, so a missing
family falls back to the generic family of the stack. Serif, monospace and
handwritten body fonts raise the smallest popup text from 11 to 12 px (`fs-small`),
because those faces read smaller at the same size.

### Picker and settings

The theme is chosen on a sub-page of Preferences: grouped rows, a one-line
description, a four-color sketch (background, surface, accent, text, in the scheme in
use) and a check mark on the current theme. The page rescans the folders each time it
opens. The group names and descriptions of the built-in themes are translated from
`lib/prefs/themeCatalog.js`; a user theme shows its own `description` under "Your
themes".

Related settings: `theme`, `color-scheme` (`system`, `light`, `dark`), `clock-format`
(`system`, `12h`, `24h`), `reset-format` (`long`, `short`) and `auto-open`.

### Not implemented

- Downloading a theme's fonts to `~/.local/share/fonts` from Preferences, on request
  and after confirmation.
- The N3 effects above, theme by theme.

## Consequences

- A new theme is a JSON file; no extension code changes.
- Theme previews in the gallery use the same tokens, so they match what the extension
  can paint at the two delivered levels.
