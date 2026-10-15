# Changelog

All notable changes to the Elfvision GNOME build. The full release notes are kept in
[docs/temp/](docs/temp/) as `release-v<version>.md`. Versions follow `version-name` in
[metadata.json](metadata.json).

## Unreleased

### Added
- Diagnostic logging to the systemd journal with a closed event catalog, a `log-level` setting and a
  rate limit; see [docs/logging.md](docs/logging.md). Every HTTP request, provider fetch, keyring
  failure, sign-in failure and extension lifecycle step is now observable without recording
  credentials, addresses, paths or account names.

### Changed
- The free-text `console.*` messages are replaced by catalog events; stack traces are no longer written.

## 0.2.7 — 2026-10-15

### Fixed
- Preferences recognise suggested fonts that are already installed, and the coverage list names every theme.
- A failed `providers.local.json` read no longer pauses an OAuth provider as "client id missing".
- Delete all connectors clears every connector item of a provider, not only the first.
- Credential coordination, client-configuration discovery and the setup assistant recover or fit
  where they could stay failed or overflow 360 px.
- The cache is never written larger than it can be read back; the loopback page escapes its text.

### Added
- `tools/release-assets.sh` writes `build-manifest.json` and `SHA256SUMS`; `CHANGELOG.md`; package and
  metadata checks; a test of the real Fontconfig subprocess path.

## 0.2.6 — 2026-10-15
- Suggested fonts row reports installed files on open and offers **Check again**.
- Fonts outside the suggested set (for example Times New Roman) are shown as system fonts, not "missing".

## 0.2.5 — 2026-10-15
- Fix the Fontconfig inventory (it read the wrong stream, so installed fonts looked missing and the Shell
  refresh was never requested).
- Font coverage by theme shows every theme name and its real fonts.

## 0.2.4 — 2026-10-10
- OAuth client configuration can be discovered from Preferences; optional per-connector local-tool credentials.

## 0.2.3 — 2026-10-09
- Suggested-font installation verification and per-theme font availability.

## 0.2.2 — 2026-10-08
- Fix the connector order and visibility controls in the popup preferences.

## 0.2.1 — 2026-10-08
- The project is Elfvision; the GNOME build keeps its installation identity.

## 0.2.0 — 2026-10-08
- Popup width, height, card visibility and order; reviewed light and dark palettes for every theme.
