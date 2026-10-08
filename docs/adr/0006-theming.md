# 0006. Theming: 22 themes, light and dark, tokens

Status: accepted and implemented. Validation limits are listed under "Validation and follow-ups".

## Context

The panel and the popup are drawn by the GNOME Shell stylesheet, not by GTK. The
popup background comes from `.popup-menu-content` (about `#36363a` in the dark
variant) and the accent from the GNOME accent color (`accent-color`, GNOME 47 and
later). Light or dark follows `color-scheme`. The author keeps a gallery of
visual styles, `dandgabr/estilos-visuais` (MIT, derived from the Coacus `ui-style-*`
skills), which is the source of twenty-one of the current built-in themes. The
initial version-one inventory contained twenty themes including System.

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

Keyboard focus has a compiler-derived `focus` color; it is not an authorable JSON
token. The resolved accent is retained only when it has at least 3:1 contrast
against popup/card surfaces and their foreground tints through checked state.
Otherwise focus uses the foreground color. Normal accents and meter fills stay
unchanged. Built-in palettes are checked across both schemes and every System
accent; custom authors remain responsible for readable foreground/surface pairs.

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
  (light or dark). `tools/gen-themes.py` derives the missing one in OKLCH
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

### The 22 themes

`sistema-gnome`, `isometric`, `web-brutalism`, `ai-native-generative-ui`,
`analog-newspaper-broadsheet`, `hand-drawn-sketch`, `expressive-variable-typography`,
`de-stijl`, `mid-century-modern`, `terminal-tui`, `cyberpunk`, `lunarpunk`,
`nanopunk`, `solarpunk`, `aurora-mesh-gradient`, `holographic-foil-iridescent`,
`bento-grid`, `card-based-ui`, `flat-design`, `linear-saas`,
`organic-biophilic`, `glassmorphism`.

`sistema-gnome` is written by hand. The other twenty-one are generated;
`themes/v1.txt` lists their slugs. Reviewed effects come from the canonical
`tools/theme-effect-profiles.json` developer source and are copied by the generator
after token compilation. The initial version-one set was twenty; the post-MVP
addition consists of Organic/Biophilic and Glassmorphism.

### Fidelity

The initial version 1 delivered two levels for its twenty themes: tokens (colors, radii, border,
shadow, and fonts) and shapes expressible in St CSS (a hard offset shadow, a thick
border, an asymmetric radius, a simple gradient). Effects St cannot do in CSS (blur,
chamfered corners, scanlines, textures, hand-drawn strokes) were outside that initial delivery.
They require `St.DrawingArea` or effects, as flags only built-in themes may
request.

### Card layout and shadow bounds

The card list reserves each validated outer shadow's footprint inside the scroll
clip, using blur, spread, and signed offsets. Each gutter is bounded to 64 px;
extreme custom shadows can exceed that bound and remain clipped. Inset shadows
do not reserve outside space. The theme's original shadow token is unchanged.

Every card places its primary reading and availability/window suffix below the
provider identity, inside the same keyboard-activatable header. Identity, status,
reading, and budget labels wrap rather than hiding values behind an ellipsis.
This deliberately changes the original single-row header so fixed-width popups
can preserve complete values with shadow gutters, RTL and enlarged text. A
monetary-only row change exposed incomplete quota suffix paint under enlarged
text; the final arrangement applies the separate reading row to quota cards too.
The native oracle checks Pango layout width and height against each reading's
allocation, in addition to ellipsis and keyboard-target checks.

### Fonts

Theme font stacks include sans-serif, serif, monospace and handwritten families
from the gallery. St only uses installed fonts, so a missing family falls back to the generic family of the stack. Serif, monospace and
handwritten body fonts raise the smallest popup text from 11 to 12 px (`fs-small`),
because those faces read smaller at the same size.

### Picker and settings

The theme is chosen on a sub-page of Preferences: grouped rows, a one-line
description, a four-color sketch (background, surface, accent, and text, in the scheme in
use) and a check mark on the current theme. The page rescans the folders each time it
opens. The names, group names, and descriptions of trusted built-in themes come from
`lib/prefs/themeCatalog.js`. A user theme, including an override of the System
slug, shows its own name and description under "Your themes". Both the picker
and selected-theme label use loader-owned provenance.

Related settings: `theme`, `color-scheme` (`system`, `light`, `dark`), `clock-format`
(`system`, `12h`, `24h`), `reset-format` (`long`, `short`) and `auto-open`.

### Validation and follow-ups

- Optional suggested-font installation is implemented after explicit confirmation.
  The maintained manifest pins four licensed Poppins/Inter/JetBrains Mono files,
  exact bytes/hashes and source revision. Theme JSON never supplies downloads;
  installed-font fallbacks remain available. Files and licenses publish atomically
  into an app-owned user font directory without overwriting user files. See the
  [font review](../temp/reviews/2026-10-07-font-installer.md).
- Processing evidence now includes serialized CPU submission plus GPU-finish
  timestamps; fractional scaling/nonzero-origin tests use two virtual monitors.
  These do not certify physical monitor hardware, pure GPU timer-query cost or
  end-to-end display latency. Fresh results and exact limits are in the
  [closure validation](../temp/reviews/2026-10-07-open-items-validation.md).

## Consequences

- A new theme is a JSON file; no extension code changes.
- Theme previews in the gallery use the same tokens, so they match what the extension
  can paint at the two delivered levels.

## Post-MVP effect contract

The accepted post-MVP design adds a data-only `effects` profile without changing
existing color validation or requiring effects in old theme files. The full
format is in [Themes](../themes.md#optional-effect-profiles). The core validator
allowlists material, motion, and texture presets, bounds particle counts to twelve
and background opacity to 0.72–1 per scheme, and rejects executable fields,
URLs, paths, unsupported arrays and non-finite numbers. Invalid optional data falls back to
an opaque static profile with deterministic problem texts; base tokens still load.

Origin is loader-owned: `builtin` or `user`, based on the selected theme file.
A user override of a built-in slug never inherits executable-effect permission.
Raw `origin` fields cannot grant trust. The picker uses this same provenance.

`effectPolicy({origin, profile, mode, animationsEnabled, transparencyEnabled,
popupOpen, materialPreference})` returns `{motion, material, particleCount}`. Motion is `none`,
`interaction` or `ambient`. User origin, Effects Off and closed popup yield an
opaque/no-motion policy. Subtle permits short interaction transitions and static
decoration; Full permits compatible ambient presets. Disabled system animations
prohibit animated interaction and ambient motion, independently of transparency.
The panel remains dark and never runs an ambient loop.

Preferences expose Effects, Transparency and Material, reset with appearance settings.
An explicit material applies only when the trusted profile lists it as compatible;
the default follows the theme. Glassmorphism permits all three glass materials.
Account, tracking, consent and first-use state remain kept. ThemeManager exposes
`getEffectState(popupOpen = false)` and `subscribeEffects(callback)` returning an
unsubscribe function. Notifications follow theme, scheme, mode, transparency and
system `enable-animations` changes, even when CSS is unchanged. Subscribers read
state with their actual popup-open flag; snapshots contain only validated theme
data and settings, and mutating a snapshot does not change manager state.
Disable publishes the inactive policy and releases listeners.

The renderer uses shared native particle, material, cached texture, and optical
primitives behind persistent controls. Eight reused leaf sprites have one bounded
timer; their time-based positions are quantized to device pixels and rotation
to half degrees, with unchanged transforms skipped. Particle count, speed and
34ms source cadence remain fixed; processing acceptance still requires native
profile measurements. Static glass has no timer. One fixed-radius background blur supplies frost,
with decorative glass as an unsupported-capability fallback. The owned popup's
offscreen redirect permits actual backdrop sampling only for effective frost,
while opaque foreground controls retain a separate cache. Native BinLayout
allocates the three siblings; the background's 2px request and decoration's zero
request leave foreground controls in charge of popup measurement. Rebuilding
decorative styles/children repairs an invalid decorative allocation once against
its existing positive viewport, without pinning foreground dimensions or adding
per-frame allocation work.
Allocation notifications only queue one coalesced HIGH_IDLE layout update.
Resizing decoration children synchronously inside those notifications invalidated
the later foreground sibling during native allocation, leading to heading-shadow
and offscreen criticals. The pending layout source carries the renderer generation,
is cancelled on rebuild/teardown and participates in resource inspection.
Tabular-number attributes are applied through coalesced idles, including initial
construction, and skipped when the feature already exists. Synchronous attribute
changes during St's lazy style/painter path invalidated text allocation and
produced native shadow/offscreen errors. Pending label work is cancelled on
destruction. Closing retains its fixed anchor and rendering policy until the
popup is hidden, while decorative animation and blur work stop immediately.
Close, Off, lock, and disable remove owned work. Theme JSON cannot select arbitrary
renderer code. Semantic pixel checks and the 22-theme light/dark inventory are
recorded in the validation record; hardware performance remains a separate gate.
