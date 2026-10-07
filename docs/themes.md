# Themes

The format of a theme, for someone writing one. How the themes are built and why is in
[ADR 0006](adr/0006-theming.md); how to add a built-in theme and how the generated ones are made is
in the [development guide](development.md#themes).

The extension ships 20 themes, each with a light and a dark variant. The default,
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

