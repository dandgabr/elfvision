# 0008. MVP milestones and open items

Status: accepted

## Milestones

Each milestone runs in a nested shell: `dbus-run-session gnome-shell --devkit --wayland`.

1. **M0, skeleton.** `metadata.json` (shell 50), `extension.js` with a panel button and a
   static popup (three fake cards), `stylesheet.css`, color tokens, the bar with the
   pacing tick. No network.
2. **M1, core.** The `ProviderSnapshot` contract (pure JS, testable with `gjs`), the
   scheduler (interval, jitter, backoff, stale), severity and pacing, the disk cache,
   a deterministic fake provider and `gjs` tests. Theme loader with `sistema-gnome`.
3. **M2, Command Code.** First real provider (API key). Minimal preferences with a key
   field stored in libsecret. Closes the loop end to end.
4. **M3, OAuth in preferences.** Reusable loopback and PKCE (`oauth/pkce.js`),
   single-flight refresh. Providers in order: **Codex**, **Claude**, **Antigravity**.
5. **M4, polish.** Notifications with dedupe and hysteresis, connection alert,
   `auth_required` and `stale` states, panel modes, `providers.local.json`, the
   gitleaks pre-commit hook, the 20 themes at N1 and N2, gettext, README.

Provider order: Command Code, Codex, Claude, Antigravity.

## Planned layout

```
extension.js  prefs.js  metadata.json  stylesheet.css
lib/core/        contract, scheduler, severity, pacing, cache
lib/providers/   command-code.js codex.js claude.js antigravity.js
lib/oauth/       pkce.js loopback.js
lib/ui/          panel item, popup, cards, tooltip
themes/          v1.txt and generated theme.json files
po/  tests/  tools/  docs/  providers.example.json
```

## First actions

`git init` is already done. Before the first code commit: the JavaScript
`.gitignore` (done), `providers.example.json` with placeholders, and the gitleaks
pre-commit hook.

## Open items

- Which of the 72 gallery styles beyond the 20 of version 1 become installable themes.
- Whether the effects (N3) of the hard themes get built, and in which order.
- Validate in a prototype: popup `max-height`, RTL mirroring, tabular numbers in CSS
  versus Pango, light popup variant.
- Re-check provider terms and endpoints against primary sources before relying on them.
- The Pango versus CSS answer for tabular numbers and the blur effect cost are untested.

## Resolved

- The repository was renamed from `gnome-ia-quota` to `gnome-ai-quota` (English
  "AI") on 2026-10-06. The extension uuid is `gnome-ai-quota@dandgabr`, the CSS class
  prefix is `gaq-`, and the user directories use `gnome-ai-quota`.
