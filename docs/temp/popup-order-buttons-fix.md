# Popup ordering arrows

The user's configured connector ordering screen did not change when arrow buttons
were clicked. A native private GTK reproduction established that IDs were written
to GSettings, but the visible rows and button sensitivity did not update.

The NavigationPage `unmap` signal fired during its initial presentation and
disconnected all seven owned settings handlers. A diagnostic showed only the two
parent dimension handlers remained; a newly added third connector was also absent.
Thus subsequent setting writes never rebuilt the open page. The original native
test only asserted a manually assigned expected order, masking this regression.

Use NavigationPage's semantic `hiding` signal to dispose when leaving the page,
matching the existing account editor. Keep window-close disposal and idempotence.
The change neither rewrites accounts nor changes the order algorithm.

Native regression assertions cover actual arrow clicks, saved IDs, visible row
order, repeated movement, enabled focus fallback, external registry/visibility
changes, temporary window hide/restore, back/reopen and close cleanup. The same
checks run for Demo and synthetic Live accounts with connector-scoped IDs. Real
configuration and credentials are never accessed by these tests.

The strengthened test failed before the fix at the visible-row assertion and
passed after it. Validation logs are under `build/popup-evolution/` with the
`order-buttons-` prefix. Version 0.2.2 is prepared for release after merge approval.

## Verification and independent reviews

- `tools/check.sh`: 575 GJS tests and six generator regressions passed, along
  with cross-process credential/connector checks, lint, strict schemas,
  translations, whitespace and native extension enable.
- `tools/prefs-smoke.sh popup`: Demo and synthetic Live scoped-ID cases passed.
  Assertions inspect both saved order and displayed rows, with actual signal
  connection checks after back/close rather than only the handler tracking array.
- Native `popup-presentation-probe.js` plus its verifier passed all nine cases,
  including card order, visibility, dimensions, focus and lifecycle cleanup.
- The v0.2.1 published ZIP to v0.2.2 candidate upgrade test passed; synthetic
  account/settings/order/visibility values survived install, reinstall and rollback.
- Frontend lifecycle review found no blockers. Independent QA killed all three
  targeted mutants: reverting to unmap, dropping the order write, and leaking
  settings subscriptions. The initial cleanup mutant survived the handler-count
  assertion; testing actual GObject signal connections closed that gap.
