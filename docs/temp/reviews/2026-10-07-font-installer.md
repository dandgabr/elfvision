# Optional font installer — implementation and provenance

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

The explicit preferences action installs four maintained font files after a Cancel-default
review. Creating preferences, choosing a theme and rendering a popup perform no download or
installation. Installed-font fallbacks remain available offline or after cancellation.

## Interfaces and ownership

`createSuggestedFontsGroup({window, gettext})` returns `{group, destroy}`. The root integration
adds the group and destroys it when preferences close. An optional injected installer supports
private native tests. This module never consumes theme URLs or arbitrary font selections.

`FontInstallController` owns confirmation, generation checks, fixed state/error codes and
cancellation. `FontInstaller.install(manifestIds, {progress, committed})` accepts maintained IDs
only; `cancel()` stops active requests and cache refresh, and `destroy()` also disposes transport.
Constructor I/O dependencies may be injected by trusted development tests, never by themes.
The committed callback records the atomic transaction boundary: cancellation after publication
can stop font-cache refresh but cannot describe an already installed batch as uninstalled.

## Exact licensed sources

Official Google Fonts distribution revision: `5e8a3ba899557829a76cfdac30fa512bda91d7ca`.
All sources were read at that exact revision; font bodies were hashed in memory and not written
to a real user font directory. Total: **1,380,096 bytes across four files**.

| File | Bytes | SHA-256 |
|---|---:|---|
| Poppins-Regular.ttf |160316 |7e65201e9b79159e2300267cc885e16c8dcef2424cdfa09a29bfb0980a94a7ba |
| Poppins-Bold.ttf |155996 |983676516167748b74de6f4771fb384c664fd913acb8b471122ecacf5da5ea6c |
| Inter[opsz,wght].ttf |876576 |29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031 |
| JetBrainsMono[wght].ttf |187208 |48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda |

The manifest contains exact HTTPS addresses under
`raw.githubusercontent.com/google/fonts/<revision>/ofl/{poppins,inter,jetbrainsmono}/`.
These choices cover Poppins-based glass themes, Inter-based interface themes, and mono themes.
They are a small useful allowlist, not an installer for every font named by the theme inventory.

The pinned [Poppins license](https://raw.githubusercontent.com/google/fonts/5e8a3ba899557829a76cfdac30fa512bda91d7ca/ofl/poppins/OFL.txt),
[Inter license](https://raw.githubusercontent.com/google/fonts/5e8a3ba899557829a76cfdac30fa512bda91d7ca/ofl/inter/OFL.txt),
and [JetBrains Mono license](https://raw.githubusercontent.com/google/fonts/5e8a3ba899557829a76cfdac30fa512bda91d7ca/ofl/jetbrainsmono/OFL.txt)
identify SIL OFL 1.1 and the respective project authors. The unmodified copyright/license texts
are packaged under `licenses/fonts/`, hash-verified before publication, and installed alongside
the unmodified font files. They are not fetched implicitly during confirmation.

License SHA-256: Poppins `6be04893d770899a015649c7aa3b582f871b272f8747a92b78b17c3e5c8b2573`;
Inter `5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57`;
JetBrains Mono `b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d`.

## Network, transaction and lifecycle controls

Each response is counted while streamed in 16 KiB chunks: at most 5 MiB/file, 20 MiB/action and
four font files. Exact manifest byte counts are also enforced, with or without Content-Length.
Manual redirects are limited to three and their targets must match an exact maintained HTTPS
address. HTTP errors, hash mismatches and non-SFNT/non-OTF headers reject the entire transaction.
All writes handle short asynchronous writes. A 45-second deadline cancels a stalled action.

A private 0700 staging directory lives below the app-owned user font directory; files are 0600.
No-follow discovery rejects an app-directory symlink and pre-existing batch conflicts.
Every verified font and its license is staged before one no-overwrite, no-copy-fallback directory
rename publishes the batch. Identical existing batches are recognized without redownload;
incomplete/conflicting batches and user files remain untouched. Cancellation before publication
invalidates the generation and removes the owned staging tree asynchronously without following
links. Existing unrelated files are never deleted or repaired.

All discovery, creation, permission changes, reads/writes, close and cleanup traversal use async
GIO. **One narrow synchronous exception** remains: the final same-filesystem directory rename,
immediately after the last cancellation check. There is no await between check and commit;
asynchronous rename completion could otherwise publish a stale batch after cancellation. It
performs one bounded filesystem metadata operation, not font copying or cache parsing.

`fc-cache` runs asynchronously with a fixed argv containing only the app-owned batch path;
no shell or downloaded installer executes. It is bounded to 10 seconds and force-terminated on
close/cancellation. Failure preserves the installed batch and reports that applications/login
may need restarting. Shell never imports the installer or parses theme-supplied fonts.
All preferences messages use fixed translated templates; raw transport errors/causes stay out
of product text. Conflicts, verification failures, unsafe directories and connection/permission
failures have distinct truthful messages.

## Verification and limits

TDD logs are under `.superpowers/sdd/2026-10-07-fonts/`: core/service RED and GREEN, additional
commit/short-write RED→GREEN, asynchronous-I/O trap RED→GREEN and incomplete-batch conflict
RED→GREEN. Service fixtures always pass explicit temporary directories and synthetic font data;
no real font installation/download occurs in tests. Cache-child testing uses a private synthetic
executable and confirms termination after destroy.

Four isolated copied-module mutants are killed: bypass consent, ignore generation, bypass
SHA-256, and bypass header validation. Shared production files were never mutated for these
checks. Results: `mutants/results.json`.

Run `gjs -m tests/run.js`, `npm run lint` and `tools/check.sh` from the checkout root. The root
agent owns preferences integration, test-runner imports, catalog extraction/translation and
packaging. Final native integrated preferences/keyboard/accessibility checks are root-owned;
this report does not substitute synthetic service success for manual accessibility validation.

A new manifest revision requires developer source/license/hash review. No automatic manifest
update, silent replacement or broad font removal runs. Optional font uninstallation is outside
this action's scope; installed batches remain ordinary user fonts.

Independent review follow-up: post-publication committed-callback exceptions, refresh exceptions
and cancellation during refresh return installed/restartRequired=true. A regression first failed
with install_failed and then passed after the explicit published flag preceded callbacks. Logs:
postcommit-red.log and postcommit-green.log. Failures cannot falsely claim an atomic batch was
uninstalled. Configured XDG ancestor directories are trusted user paths (including legitimate
parent symlinks); no-follow guards apply to the app-owned leaf, stage and destination entries.
