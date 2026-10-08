# Themes

The format of a theme, for someone writing one. How the themes are built and why is in
[ADR 0006](adr/0006-theming.md); how to add a built-in theme and how the generated ones are made is
in the [development guide](development.md#themes).

The extension ships 22 themes, each with a light and a dark variant. The default,
System (GNOME), follows the shell: the popup surface, the GNOME accent color and
the light or dark preference. The others are derived from a gallery of visual
styles and are grouped in the picker (clean and functional, typography and
editorial, surface and materials, and so on).

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

Colors must be hex values. Invalid themes are listed, with the reason, at the top
of the picker. [ADR 0006](adr/0006-theming.md) lists every token and the
validation rules.


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
to `[material]`; it declares safe alternatives without forcing glass on other styles. Missing values
use opaque/no motion/no texture and opacity 1. Colors remain hex without alpha.

Trust comes from the file the loader selected. A theme in the user folder,
including one with a built-in ID or an `origin` field, cannot activate built-in
effects. The picker identifies such overrides as user themes.

General exposes Effects (`Off`, `Subtle`, `Full`), Transparency and a material choice.
The material follows the theme by default; an explicit choice applies only when the
profile lists it in `compatibleMaterials`. Glassmorphism permits simple translucency,
decorative glass and frosted glass. Editorial, flat, terminal and warm nature themes
retain their approved opaque reading surfaces. The default
is Subtle with transparency allowed: short interactions and static decoration;
Full permits ambient motion only in compatible built-in profiles. System
animation disablement overrides motion immediately. Transparency can be disabled
independently. Off and a closed popup produce an opaque, motionless policy; no
ambient effect runs on the panel. Restore defaults resets all three controls and
preserves accounts, tracking, consent and first-use state.

Built-in profiles are maintained in `tools/theme-effect-profiles.json`. The generator
reads this allowlisted source after compiling gallery tokens; it never imports gallery
effect JavaScript. The shipped set adds Organic/Biophilic and Glassmorphism, while
System keeps ordinary interactions with no decorative ambience.

Profiles permit a material; they do not prove that its renderer is available or that its
contrast/performance has passed validation. Opaque reading zones and runtime
fallbacks remain renderer requirements.
