# Themes

The format of a theme, for someone writing one. How the themes are built and why is in
[ADR 0006](adr/0006-theming.md); how to add a built-in theme and how the generated ones are made is
in the [development guide](development.md#themes).

The extension ships 22 themes, each with a light and a dark variant. The default,
System (GNOME), follows the shell: the popup surface, the GNOME accent color and
the light or dark preference. The others are derived from a gallery of visual
styles and are grouped in the picker (clean and functional, typography and
editorial, surface and materials, and so on).

The shipped pairs have individually authored palettes and geometry. Their design
references and light/dark acceptance criteria are recorded in the
[theme research](temp/theme-evolution-research.md). Fonts remain local choices;
the native decoration and geometry also carry the identity when a suggested
font is absent.

A theme is a folder with a `theme.json`. Put your own in
`~/.local/share/gnome-ai-quota/themes/<id>/theme.json`; a theme there replaces a
built-in one with the same id. The file lists colors for a `light` and a `dark`
scheme and a few shape and font choices:

```json
{
  "id": "my-theme",
  "name": "My theme",
  "description": "One line for the picker.",
  "schemes": {
    "light": {"bg": "#fafafa", "surface": "#ffffff", "fg": "#1e1e1e", "muted": "#5e5c64",
              "border": "#d5d5da", "accent": "#3584e4", "warn": "#8f5d00", "danger": "#c01c28"},
    "dark":  {"bg": "#2a2a2e", "surface": "#36363a", "fg": "#ffffff", "muted": "#c3c3c8",
              "border": "#56565c", "accent": "#78aeed", "warn": "#f5c211", "danger": "#ff938c"}
  },
  "radius": {"card": 14, "control": 8},
  "border": "hairline",
  "fonts": {"body": "\"Inter\", sans-serif"}
}
```

Colors must be hex values; the accent also accepts `system-accent`. Invalid
themes are listed, with the reason, at the top of the picker.
[ADR 0006](adr/0006-theming.md) describes the base format and validation rules.
The complete current token handling is in [the validator](../lib/core/theme.js)
and [CSS template](../lib/core/theme.template.css).

Keyboard focus uses a derived `focus` color, rather than another JSON field.
The compiler keeps the resolved accent when it has at least 3:1 contrast against
popup/card backgrounds and their hover, focus and checked tints; otherwise it
uses the theme's foreground color. This preserves the original accent and meter
fill. Built-in palettes are checked in both schemes and with every System accent.
Custom theme authors still need to choose readable foreground and surface colors;
hex validation alone does not establish accessible contrast.

Font names remain local fallback choices. General → Suggested fonts offers a
separate explicit installation of four maintained Poppins/Inter/JetBrains Mono
files with pinned source, hashes and licenses. Choosing a theme never downloads
fonts, and theme JSON cannot add download addresses. Missing fonts continue to
use installed fallbacks; existing user files are preserved.

Validated theme font stacks retain intermediate fallback families, including
cursive. The Shell selects an installed family through Pango and emits one safe
family name, because native St does not reliably resolve browser-style stacks.
The compiler rejects unsafe font syntax. Card shadows use a bounded six-pixel
paint budget with constant gutters; changing a theme, material or Effects mode
does not reserve its original blur radius as a large lateral content inset.
The scrollbar has a separate eight-pixel clearance beyond the shadow budget.

Transparent materials include cached, smooth background protection in exposed
summary/footer reading zones. Two edge surfaces avoid blending an unused
transparent center; overlapping reading regions share one surface. It follows
the actual reading allocations, keeps
individual label backgrounds transparent, and leaves the center's material
visible. Its stronger tint near text is intentional: a busy desktop and
overlapping decorative layers must not defeat contrast. Effects Off retains
this static material protection without ambient animation or decorative texture.


## Optional effect profiles

Old themes without `effects` keep their existing token appearance. A built-in theme
may choose packaged presets, with separate background opacity for each scheme:

```json
"effects": {
  "material": "translucent",
  "motion": "leaves",
  "texture": "botanical",
  "particleCount": 8,
  "compatibleMaterials": ["opaque", "translucent"],
  "opacity": {"light": 0.85, "dark": 0.9}
}
```

Materials: `opaque`, `translucent`, `decorative-glass`, `frosted-glass`.
Motion: `none`, `interaction`, `leaves`, `gradient`, `motes`, `pulse`.
Textures: `none`, `paper`, `grain`, `scanlines`, `grid`, `botanical`, `strokes`,
`chamfer`. Each name selects implementation-owned decoration; themes cannot
supply assets, paths, URLs, JavaScript or shaders. Unknown fields or invalid
presets disable the entire optional profile and report a fixed reason, while the
base theme still loads. Only finite numeric opacity is accepted, clamped to
0.72–1; particle counts are finite integers clamped to 0–12. Leaves and motes
default to eight particles; other motion presets create none. Optional
`compatibleMaterials` is a unique list of one to four material presets, defaulting
to `[material]`. The shipped built-in profiles list all four materials so the
user can override their default. Missing values
use opaque/no motion/no texture and opacity 1. Colors remain hex without alpha.

Trust comes from the file the loader selected. A theme in the user folder,
including one with a built-in ID or an `origin` field, cannot activate built-in
effects. The picker and selected-theme label identify such overrides as user
themes, with the user-supplied name and description, including overrides of
System (GNOME).

General exposes Effects (`Off`, `Subtle`, `Full`), Transparency, and Material.
The material follows the theme by default. Every built-in theme also accepts an
explicit opaque, translucent, decorative-glass, or frosted-glass material.
Transparent built-in backgrounds use opacity 0.80 in light mode and 0.74 in dark
mode, with a contrast-safe tint around exposed reading zones. Disable
Transparency to make the background opaque.
Effects Off disables motion and textures while retaining the selected material;
Subtle permits short interactions and static decoration, and Full permits ambient
motion where the built-in profile supports it. System animation settings disable
motion independently. A closed popup stops ambient work; the panel has no ambient
loop. Unsupported frost can fall back to decorative glass.

User themes remain static and opaque under the loader-owned trust policy, including
overrides of built-in IDs. Selecting a glass material does not grant a user theme
permission to run packaged effects. Restore defaults resets all three appearance
controls, resumes tracking, and clears setup dismissal while preserving connector
metadata, credentials, consent, and the selected data source.

Built-in profiles are maintained in `tools/theme-effect-profiles.json`. The generator
reads this allowlisted source after compiling gallery tokens; it never imports gallery
effect JavaScript. The shipped set adds Organic/Biophilic and Glassmorphism, while
System keeps ordinary interactions with no decorative ambience.

Profiles permit a material; they do not prove that its renderer is available or that its
contrast/performance has passed validation. Contrast-safe reading zones and runtime
fallbacks remain renderer requirements.

## Theme picker default backgrounds

Informational icons describe the validated built-in theme's default background,
not every material it supports. The transparency icon appears only when its
chosen material is translucent, decorative glass or frosted glass; its tooltip
names that material. Opaque themes do not show it merely because an override is
compatible. The effects icon describes background motion (such as falling leaves)
and static decoration, with the Effects mode needed to display each. Interaction
transitions alone do not qualify. Particle effects with zero particles do not
qualify either. Labels are translated, accessible and add no keyboard stops.
Current preference overrides do not change this description of the theme.
User overrides cannot claim built-in effect permissions.
