# Development

## Layout

```
extension.js        entry point (enable and disable)
prefs.js            preferences window (GTK 4, libadwaita)
metadata.json       uuid gnome-ai-quota@dandgabr.github.io, shell 50
themes/builtin/     the 20 v1 themes (theme.json each); user themes go in
                    ~/.local/share/gnome-ai-quota/themes
lib/core/           pure JavaScript: contract, scheduler, cache format, theme
                    compiler and its CSS template, severity,
                    pacing, selection, fitting, formatting, view models, fixtures
lib/providers/      provider errors and the demo providers (real ones come in M2+)
lib/services/       GLib and Gio glue: timers, cache file, theme files and manager,
                    the quota controller
lib/ui/             St widgets: meter, bar item, provider card, indicator
icons/              symbolic SVG icons, one per provider id
po/                 gettext template and translations
tests/              unit tests for lib/core (no GNOME Shell needed)
schemas/            GSettings schema (position, bar-count, compact-mode)
tools/              build.sh, i18n.sh, headless-shell.sh, gen-themes.py
```

`lib/core` must not import `gi://` or `resource://` modules. Everything the UI
shows is computed there (`viewmodel.js`) and painted by `lib/ui`, so the logic
stays testable under plain `gjs`.

## Build

```sh
tools/build.sh   # compile the GSettings schema and the translations
```

The extension needs `schemas/gschemas.compiled` and `locale/` to run from a
checkout. Neither is committed. Run the build after cloning and after changing
`schemas/` or `po/`.

## Themes

All CSS lives in `lib/core/theme.template.css`; colors, radii, borders, shadows and
fonts are tokens replaced at compile time (St has no `var()`). To try a theme without
the preferences window:

```sh
gsettings --schemadir schemas set org.gnome.shell.extensions.gnome-ai-quota theme linear-saas
gsettings --schemadir schemas set org.gnome.shell.extensions.gnome-ai-quota color-scheme dark
```

Regenerate the built-in themes from the style gallery with
`python3 -I tools/gen-themes.py --styles <estilos-visuais clone> --out themes/builtin --only themes/v1.txt`
(`sistema-gnome` is hand written and is not touched).

## Demo scenarios

Until real providers exist, the `demo-scenario` setting picks what the demo
providers do: `steady` (everything fine, polled every 5 minutes), `flaky` (a
network error, a rate limit, a signed-out provider and a bad response, every 15
seconds) and `drift` (usage climbs toward the limits every 10 seconds). Change it
with `gsettings --schemadir schemas set org.gnome.shell.extensions.gnome-ai-quota demo-scenario flaky`.

## Tests

```sh
gjs -m tests/run.js
```

## Running the extension without touching your session

`tools/headless-shell.sh` starts a throwaway headless GNOME Shell on its own
D-Bus session, with an in-memory GSettings backend and a temporary
`XDG_DATA_HOME` that links this checkout as the only user extension. Your real
session, settings and extensions are not touched.

```sh
# Boot, enable the extension, print its state and any shell errors.
tools/headless-shell.sh

# Also evaluate JavaScript inside the shell (org.gnome.Shell.Eval, enabled by
# --unsafe-mode). Scripts run in order, one and a half seconds apart; an argument
# such as sleep:20 waits that many seconds (for the polling scenarios).
tools/headless-shell.sh open-popup.js sleep:20 screenshot.js
```

Useful snippets for the scripts: `Main.panel.statusArea[uuid].menu.open(false)`
opens the popup; a `Shell.Screenshot` call writes a PNG of the virtual monitor;
walking `get_children()` with `get_allocation_box()` and `get_preferred_width(-1)`
prints sizes. Avoid backslashes in these scripts: `gdbus` parses the argument as
a GVariant string.

Set `SKIP_ENABLE=1` to boot without enabling the extension and compare the shell
log against a clean baseline.

## Translations

```sh
tools/i18n.sh extract   # regenerate po/gnome-ai-quota.pot from the code
tools/i18n.sh update    # merge the template into every po/*.po
tools/i18n.sh compile   # build locale/<lang>/LC_MESSAGES/gnome-ai-quota.mo
```

Source strings are English. Every user-visible string goes through
`gettext`, `ngettext` or `pgettext` (see ADR 0007). The compiled `locale/`
directory is not committed.

## Pitfalls found so far

- **Placeholders in the template's own comments get replaced.** The compiler
  substitutes every double-brace token, comments included; describe tokens without
  the braces.
- **zsh does not split unquoted variables.** When building a list of script
  arguments for `tools/headless-shell.sh` use an array and `"${args[@]}"`.

- **A non-reactive item greys all its text.** The popup lives in a
  `PopupBaseMenuItem` with `reactive: false`; St then applies `:insensitive`, and
  the theme's `.popup-inactive-menu-item:insensitive` colors everything `#9b9b9d`.
  Set `color` on the popup root (`.gaq-popup`). Measure pixels when a screenshot
  "looks dim": a review took the grey for a stale state.
- **Use `connectObject` for signals on foreign objects.** A manual `disconnect` in
  `destroy()` fails with criticals when the emitter (a panel box at shell
  teardown) is already disposed. `emitter.connectObject(signal, cb, this)` ties
  the connection to the button. Read JS fields (`this._cleaned`) before GObject
  properties (`this.mapped`) in callbacks that can run during destruction.
- **Detach before re-adding.** A card moving from one container to another must be
  removed from the first before `add_child`, or Clutter warns about a parent.
- **Focus rings need a border.** An inset `box-shadow` did not draw on `St.Button`;
  a transparent border that turns blue on `:focus` does.

- **BinLayout centers children that do not expand.** An `x_align` or `y_align` of
  start or end is ignored unless the child (or one of its descendants) has the
  matching `x_expand` or `y_expand`. A meter fill with `x_align: START` was drawn
  from the middle outwards. Either set the expand flag or place children by hand,
  as `lib/ui/meter.js` does.

- **A popup follows its source actor.** `BoxPointer._reposition` re-reads the
  source's position on every allocation, so a neighbouring extension that changes
  width each second moves the popup. Pin it with `boxPointer.setPosition(anchor)`
  to an invisible actor while it is open (`_pinPopup` in `lib/ui/indicator.js`).
- **Layout choices need hysteresis.** Choosing the richest layout that fits flips
  whenever a neighbour's width wobbles around the limit. Keep the current layout
  while it fits (`chooseStickyLayout`).

- **Signal names.** `St.BoxLayout` has `child-added` and `child-removed`, not
  `actor-added`; a wrong name makes the extension fail to load.
- **Do not destroy what you need later.** `destroy_all_children()` also destroys
  siblings you keep a reference to (the `+N` badge). Give rebuilt items their own box.
- **Skip measuring detached widgets.** Calling `get_preferred_width()` on a widget
  outside the stage logs St criticals during shell teardown.
- **Classic scrollbars.** `overlay_scrollbars: false` gives the scrollbar its own
  column, so it does not draw over the cards.
- **Negative margins break layout.** A CSS margin that makes the preferred width
  negative wraps to 2^32 in St, giving huge natural widths, allocations such as
  `-12 x 32` and Cogl viewport criticals. Group widgets in a tighter box instead.
- **Percentage widths do not exist in St.** The meter sizes its fill and pacing
  tick from the allocation (`lib/ui/meter.js`).
- **The popup must not close on inner clicks.** The popup content lives in one
  `PopupBaseMenuItem` created with `reactive: false`, `can_focus: false` and
  `activate: false`.
- **Scrolling needs a height limit.** `St.ScrollView` only scrolls when it has a
  `max-height`; it is computed from the monitor height each time the menu opens.
