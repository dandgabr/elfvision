# Empty first-run and Accounts navigation

The user's current requirement supersedes the automatic legacy-slot migration in
the connector design: Live and Demo start empty, and the user chooses every
connector. Existing explicitly saved registries are retained during ordinary
upgrades; this change does not silently delete another user's accounts.

The empty-popup action is now **Add connector** (**Adicionar conector** in
Brazilian Portuguese). It opens Accounts without selecting a provider, opening
the provider chooser, or starting setup. Exact account actions on provider cards
still open their own editor. An Accounts request also dismisses a stale chooser
or connector editor.

Unset legacy registry strings decode as empty. Schema defaults contain explicit
empty registries and no simulated authentication. Explicit recovery searches
metadata in both extension-owned credential schemas, restores only genuine saved
identities, and never loads credential values or creates unconnected slots.

Independent domain and QA review found two gaps, both corrected: genuine legacy
credential discovery during recovery, and visual probes depending on implicit
sample accounts. Visual gates now pass an explicit isolated Demo fixture. Fresh
startup and connector-transition probes omit it. The headless harness now rejects
a failed Shell Eval instead of returning success for a failed assertion.

Validation performed before local installation:

- `tools/check.sh`: 549 unit tests passed, cross-process/keyring tests, static
  checks, translations and native extension load passed.
- `tools/prefs-smoke.sh startup`: fresh registries, Accounts target, setup policy,
  and dismissal of a pre-existing chooser passed.
- `tools/prefs-smoke.sh connectors`: creation, authentication, rename, removal,
  bulk deletion, restart and recovery passed in LTR, RTL and expanded text.
- Native connector probe: fresh Live/Demo emptiness, Accounts navigation and
  delete/add/connect transitions passed.
- `tools/layout-check.sh`, `tools/effects-check.sh quick` and the explicitly seeded
  indicator probe passed.
- The v0.1.1 ZIP was audited for runtime byte equality and installed into private
  XDG data. The native connector probe passed against that installed ZIP.
- QA replay killed four targeted mutants after strengthening the native startup
  oracle: implicit defaults, fabricated recovery rows, wrong navigation target,
  and an unsolicited provider chooser. This is a limited handcrafted mutation
  sample, not a whole-codebase mutation score.

Regression tests were observed failing before their respective fixes. These tests
use synthetic accounts and do not establish real provider authentication.

Tracking: issues #18 and #19. The user subsequently clarified that these public
issues had not been the intended recording destination, then authorized resolving
the two existing issues. No additional issues were created for this work.
