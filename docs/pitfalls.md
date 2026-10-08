# Pitfalls

Things that cost time and are not obvious from the St or GNOME Shell sources. They are grouped
by where they bite. The [development guide](development.md) covers how to work on the code.

Things that cost time and are not obvious from the St or GNOME Shell sources.

## Stylesheet

- The compiler substitutes every double-brace token in the template, comments
  included. Describe tokens in comments without the braces.
- St has no `var()` and no percentage widths. Tokens are substituted at compile
  time; the meter sizes its fill and pacing tick from its allocation
  (`lib/ui/meter.js`).
- A focus ring needs a border. An inset `box-shadow` does not draw on `St.Button`; a
  transparent border that turns blue on `:focus` does.
- A non-reactive popup item grays all its text. The popup sits in a
  `PopupBaseMenuItem` with `reactive: false`, so St applies `:insensitive` and the
  shell theme colors everything `#9b9b9d`. Set `color` on the popup root
  (`.gaq-popup`). When a screenshot looks dim, measure pixels before blaming a stale
  state.

## Layout

- `BinLayout` centers children that do not expand. An `x_align` or `y_align` of start
  or end is ignored unless the child or one of its descendants has the matching
  `x_expand` or `y_expand`. Set the flag, or place children by hand as
  `lib/ui/meter.js` does.
- Negative margins break layout. A margin that makes the preferred width negative
  wraps to 2^32 in St, which gives huge natural widths, allocations such as
  `-12 x 32` and Cogl viewport criticals. Group widgets in a tighter box.
- `St.ScrollView` only scrolls when it has a `max-height`. The popup computes it
  from the monitor height each time the menu opens. `overlay_scrollbars: false`
  keeps the scrollbar in its own column.
- A layout chosen as "the richest that fits" flips whenever a neighbor's width
  wobbles around the limit. Keep the current layout while it fits
  (`chooseStickyLayout` in `lib/core/fit.js`).
- A popup follows its source actor: `BoxPointer._reposition` re-reads the source
  position on every allocation, so a neighboring extension that changes width each
  second moves the popup. Pin it with `boxPointer.setPosition(anchor)` to an
  invisible actor while it is open (`_pinPopup` in `lib/ui/indicator.js`).

**Lifecycle**

- Use `connectObject` for signals on objects you do not own. A manual `disconnect`
  in `destroy()` fails with criticals when the emitter (a panel box at shell
  teardown) is already disposed. Read JS fields (`this._cleaned`) before GObject
  properties (`this.mapped`) in callbacks that can run during destruction.
- Remove a widget from its parent before `add_child` to another container, or
  Clutter warns about an existing parent.
- Do not call `get_preferred_width()` on a widget outside the stage; it logs St
  criticals during shell teardown.
- `destroy_all_children()` also destroys siblings you still reference (the `+N`
  badge). Give rebuilt items their own box.
- The popup must not close on inner clicks. Its content lives in one
  `PopupBaseMenuItem` created with `reactive: false`, `can_focus: false` and
  `activate: false`.
- `St.BoxLayout` emits `child-added` and `child-removed`, not `actor-added`. A wrong
  signal name makes the extension fail to load.

**Tooling**

- The `memory` GSettings backend is per process. Settings written in the headless
  shell are invisible to any other process, including the preferences window, which
  is why the nested shell uses the key file backend.
- zsh does not split unquoted variables. When you build a list of arguments for
  `tools/headless-shell.sh`, use an array and `"${args[@]}"`.

## Notifications, the lock screen and the shell

- GNOME switches an extension off while the screen is locked, unless its `metadata.json` lists the
  `unlock-dialog` session mode. `disable()` runs on lock and `enable()` on unlock, so the extension
  keeps no state in memory across a lock: what must survive is read back from disk.
- `MessageTray.Source`, `Notification` and `addNotification` must be created after `enable()` and
  destroyed in `disable()`. A source left behind survives the extension and is a review failure.
- With Do Not Disturb on, GNOME holds the banner of a normal and of a high urgency notification alike;
  only the critical urgency bypasses it, which is why the extension never uses it.
- A name declared twice, or not defined, in a module that needs the shell is not seen by any unit test.
  It makes the extension fail to enable, with a line in the shell log. Enable the extension in a
  headless shell (`tools/check.sh` does this) after every change to `lib/ui` or `extension.js`.
- `String.prototype.format` exists in the preferences process and in the shell, but not in a plain `gjs`
  program; use `fmt` from `lib/core/viewmodel.js` so the same code runs under the tests.
- St applies theme text attributes when a label is mapped or restyled and can replace a manually
  installed Pango feature. Apply `tnum=1` after the `style-changed` default handler and after text
  changes, copying the foreground attributes and using `AttrList.change()` to replace rather than
  accumulate the feature. Unsupported `font-feature-settings` CSS does not establish native figures.
- Shell can destroy popup children from C before the panel button's final cleanup runs. Mark a
  destroyed effect sibling before cleanup; stop its source without reading disposed actors. Timer
  ownership tests must include panel-position rebuild and extension disable, not only menu close.
- On the tested Shell 50 / Shell-18 API, native `BlurEffect` uses `radius` and `BlurMode.BACKGROUND`.
  Current online API documentation may describe newer properties. Check the installed GI namespace.
  Callback cadence and callback elapsed work exclude compositor/GPU processing duration and cannot certify a frame-time gate.

- A decorative actor with zero preferred size still needs an explicit full sibling allocation.
  Implicit BinLayout can leave its clipped parent unallocated in devkit even when headless
  optical-child assertions pass. Measure controls only, allocate all siblings to the same finite
  box, and inspect actual allocations/paint surfaces in both backends.
- BoxPointer may allocate before a newly added invisible popup anchor. Allocate the finite
  captured anchor box before setPosition; a fresh Clutter.Actor's allocation/extents may be NaN
  even when x/y/width/height properties look valid. Reject Clutter criticals in native test logs.

## Provider configuration and alert edits

- Read provider configuration asynchronously in both Shell and preferences. The
  16 KiB streaming limit applies after opening the file as well as to metadata.
  The 5-second timer cancels metadata, open, and read operations; asynchronous
  stream closure is awaited afterward, so the timer does not bound the complete promise.
- Use a separate GSettings object for a delayed settings transaction. Delaying the
  shared object can buffer later edits from unrelated controls. Setup validates
  the shared critical threshold against every enabled warning before atomically
  applying the four critical values.
- A keyring failure is reported as retryable network trouble with reason `keyring`.
  Connection-alert rules must check that reason before treating the snapshot as
  an ordinary network outage.
