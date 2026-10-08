# Elfvision identity and integration scope

The repository and public product name are now Elfvision. Repository, issue,
security-report and clone URLs use `https://github.com/dandgabr/elfvision`.
The currently implemented integration is the GNOME Shell extension, targeting
Shell 50. KDE Plasma / KWin and additional desktop environments or window
managers are planned; this rename does not introduce or claim working ports.

The next GNOME package declares version 0.2.1 and displays Elfvision in the Shell
and About dialog. Its existing installation UUID, GSettings schema/path,
gettext domain, icon ID, credential namespaces and user directories remain
unchanged so package replacement reuses existing connector identities and data.
The development-memory project namespace also retains the prior identifier to
keep accumulated history. Existing releases and validation hashes remain
historical evidence; published ZIPs and tags are not replaced during branding.

Repository-wide language and licensing remain in force. GJS, St/Clutter and GTK
stack decisions are explicitly scoped to the GNOME integration. Future adapters
will define their own platform stack, packaging, authentication/storage bridges
and supported environment versions when implemented.

Validation uses the existing About/report destination tests, native preferences
smoke test, full repository checks, standard GNOME package audit and isolated
update-preservation test. No real user settings or credentials are changed.

Verified locally: `build/popup-evolution/branding-check.log` records 575 passing
GJS tests and six generator regressions, including native extension enablement,
lint, schemas and translation checks. `branding-reports.log` confirms native
About names, report destinations, private-launch failure and disposed deletion.
`branding-upgrade.log` confirms install/reinstall/code rollback preservation
from published v0.2.0 to the v0.2.1 candidate in private synthetic sessions.
The final documentation review found no remaining branding blockers.
