# M4 original-plan conformance review

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Date: 2026-10-07. Baseline: committed ADRs and development rules at
`4345b85` (`docs: decide the first-use assistant (ADR 0010)`). Subject:
the current `feat/m4-first-use` working tree, including the inherited account
controller split and the new assistant, RTL work, tests and packaging changes.

The original requirements were read with `git show HEAD:<path>`. Amended ADRs
in the working tree are evidence of documented adaptations, not evidence that
the original plan already included them. This audit changes documentation only;
the implementation findings below describe that review snapshot. The subsequent
development-agent correction pass and current disposition are recorded below.

Current disposition: **all actionable implementation findings are resolved**.
Original deferred features and explicitly human/live-service validation remain
outside this correction pass. Historical findings and adaptations are kept so
the differences from the original plan remain traceable.

## Review lenses

UI and UX reviewers independently inspected the current implementation against
ADRs 0007, 0008, 0009 and 0010. The frontend reviewer inspected the same work
and replayed isolated single-edit test mutants. Security received a separate
specialist review. A distinct architecture pass was completed in the frontend
reviewer thread because the harness refused another agent thread; this is five
lenses from four reviewer identities, not five independent agents. Reviewers were instructed to
work read-only, without subagents or access to real credential stores.

## Original requirement matrix

| Requirement | Assessment | Evidence |
|---|---|---|
| GJS ES modules; GTK only in preferences; pure core and registry | Implemented; structural checks pass | `tests/structure.test.js`, `lib/core/firstUse.js`, `lib/core/layout.js` |
| Automatic setup only for fresh live users without account or target | Implemented; unknown or unavailable keyring waits | `lib/core/firstUse.js:4`, `prefs.js:313`, `tests/prefsStartup.js` |
| One new persisted boolean; dismissal and Restore defaults preserve behavior | Classification implemented; inherited transaction defect R-03 affects subsequent writes | Schema `first-use-done`, `lib/core/defaults.js`, `tests/prefsLifecycle.js` |
| Preferences subpage with its own NavigationView; six ordered steps and progress title | Implemented | `lib/prefs/firstUse.js:20`, `lib/core/firstUse.js:2` |
| Optional unchecked provider choices, registry order, strongest Antigravity warning | Implemented | `lib/prefs/firstUse.js:89`, registry and terms dialog |
| Selection stays in memory and does not change tracking | Implemented | Selected Set; `tests/prefsSmoke.js:102` |
| Shared controllers and views; one OAuth sign-in at a time | Implemented | `lib/prefs/accounts.js:35`, `createLoginGate`, cross-provider tests |
| Explicit per-provider consent; Cancel default; navigation cancels sign-in | Implemented before a keyring write starts; adaptation A-03 qualifies the save boundary | `lib/prefs/termsDialog.js`, OAuth attempt-generation guards |
| Whole selectable command, explicit copy without newline, selected OAuth providers in one call | Implemented with adaptation A-01 | `lib/prefs/firstUse.js:123`, helper-command tests, packaged helper |
| Assistant never executes helper or reads clipboard/other tools | Implemented on inspected paths | Explicit clipboard writes only; helper is user-run |
| Bar position/count, notification master/common threshold/settings link; no automatic test notice | Implemented | `lib/prefs/firstUse.js:143`, traversal assertions |
| Done summarizes connected, skipped and failed accounts and links to Accounts | Partially implemented: D-01 and D-02 | `lib/prefs/firstUse.js:169`, `lib/core/firstUse.js:20` |
| Translated UI strings preserve formatting | Regression D-03 | `lib/prefs/accountText.js:16`, `lib/core/viewmodel.js:26` |
| Per-run subscription/handler cleanup | Implemented and traversed; asynchronous view callbacks need stronger coverage | Disposable views and lifecycle probes |
| RTL mirroring and approximately 40% text inflation | Implemented; validation limits V-01 qualify breadth | Pure meter geometry, pseudo-locale and isolated runtime probes |

## Findings at the review snapshot

### D-01 — P2: Done does not update after account changes

The original ADR requires a summary of connected, skipped and failed accounts.
`lib/prefs/firstUse.js:169` reads snapshots once and builds rows without controller
or `account-status` subscriptions. Connect has subscriptions; Done does not.

Reproduce with a deferred fake credential write: select Command Code, apply a
syntactically valid synthetic key, enter Done before the write resolves, then
resolve it and publish `hasKey: true`. The displayed row remains "Not connected".
A later rejected account status also cannot correct an already displayed
"Connected" row. This follows directly from the static render path; UI, UX and
frontend independently identified the supported asynchronous transition.

Required follow-up: update summary rows on controller and account-status changes,
release those subscriptions on disposal, and test deferred save completion and
delayed provider rejection.

### D-02 — P2: A failed API-key save is omitted from the summary

`lib/prefs/apiKeyController.js:78` reports a rejected write through a toast and
return value, without retaining the failure in its snapshot. A successful lookup
returning no key clears `keyringDown`. The summary then classifies the selected
provider as `not-connected`, rather than `failed`.

Frontend executed an injected reproduction: `storeSecret` rejects,
`lookupSecret` returns `null`, and a valid synthetic key is applied. Save returns
`keyring`; the settled snapshot is `{hasKey:false,keyringDown:false,saving:false}`;
the summary returns `not-connected`. The existing refusal test asserts the toast
and return value, not the required final outcome. The new assistant exposes this
limitation of the inherited API-key controller.

Required follow-up: retain nonsecret attempted-save failure state until recovery,
surface it consistently in account text and Done, and assert summary behavior.
This finding concerns the controller's remembered outcome, not loss of the typed
key: the entry remains populated on a storage failure and is cleared when its
temporary view is disposed.

### D-03 — P2: OAuth countdown contains an unformatted placeholder

`lib/prefs/accountText.js:16` passes `%d:%02d` to `fmt`, but
`lib/core/viewmodel.js:26` supports only `%s`, `%d` and `%%`. Frontend executed the
pure text reproduction: 299 seconds displays `4:%02d`, and 61 displays `1:%02d`.
The original OAuth view used `.format()`, which formatted padded seconds.
The refactor therefore introduced a visible regression in both catalogs.

Required follow-up: use a supported padded-seconds string or extend formatting
deliberately, with a displayed-countdown assertion. No credentials are needed.

### R-01 — P2: Inherited keyring recovery requires reopening preferences

After a failed initial lookup, OAuth activation calls `recheck`, which only emits
current state (`lib/prefs/oauthController.js:274`); it does not retry the keyring.
The API-key view refreshes during construction. Unlocking or installing a keyring
and returning to the existing window therefore leaves the controls unavailable
and the setup policy waiting. UX identified this by tracing an initially rejecting
fake lookup subsequently changed to return `null`.

This is inherited recovery debt, not an explicit new deviation from the original
assistant plan. Follow-up: a Retry action or activation refresh, preserving stale
lookup protection and never automatically starting authentication.

### R-02 — P3: Empty selection receives contradictory feedback

With every provider unchecked, Connect shows "No providers selected" and
"All chosen accounts are connected". `stepComplete` treats an empty selection as
complete, while the view always creates the progress group
(`lib/prefs/firstUse.js:107`). Follow-up: omit that group for an empty selection.

### R-03 — P2: Restore defaults leaves subsequent settings writes buffered

`lib/prefs/about.js:92` calls `delay()` on the shared preferences settings object.
`apply()` commits the reset batch but leaves that object in delayed mode.
Architecture reproduced this with two settings objects sharing a private memory
backend: after restore, write `first-use-done=true` and `position=left`. The
preferences object reads `true/left`, while the observer reads `false/right`;
`get_has_unapplied()` is true. The same restore body exists in original HEAD.

This inherited M4 defect affects Restore → Set up again: choices can appear
applied locally while never reaching the shell, and dismissal can fail to persist.
Follow-up: isolate the reset transaction from the settings instance used by normal
controls; test post-restore edits through a second observer, not just reset values.

### R-04 — P3: Snapshot observation performs synchronous configuration I/O

`lib/prefs/oauthController.js:254` reads local configuration for each snapshot,
twice when it is unavailable. `lib/services/localConfig.js:23` uses synchronous
file operations. Shared subscriptions increase the number of reads per countdown
emission. The original view already used synchronous configuration reads, so this
is inherited debt amplified by M4, against the development guide's asynchronous
I/O rule. Follow-up: retain configuration state and refresh explicitly through a
service operation, keeping observation free of disk reads.

### R-05 — P3: Disposed API-key views retain asynchronous UI callbacks

The save callback at `lib/prefs/accounts.js:119` and initial refresh callback at
line 149 can resume after view disposal and modify or focus the detached entry.
The disposer clears subscriptions and entry text without a callback-generation
guard. No crash was established. Follow-up: deferred-promise GTK coverage and a
view-lifetime guard; allow the requested credential write itself to finish.

## Documented adaptations

| ID | Original wording and implementation difference | Existing record and assessment |
|---|---|---|
| A-01 | Whole command on one selectable line; narrow windows horizontally scroll the command | Completion plan and amended ADR 0007/0010. Preserves command integrity/copy behavior; full command need not be simultaneously visible. |
| A-02 | Primary action right and quiet skip left; navigation and OAuth actions can wrap onto additional lines | Completion plan and amended ADR 0010. Improves narrow/expanded-text layout; wrapped positions differ from a single-row arrangement. |
| A-03 | Leaving Connect cancels sign-in; a user-requested keyring write already started is permitted to finish and announce the account | Completion plan and amended ADR 0010. Original plan did not define this boundary. Document as an explicit interpretation, not an original requirement; do not roll back old credentials. D-01 makes its delayed result insufficiently visible. |
| A-04 | One setup threshold represents all quota types; edits update all four, otherwise customized values remain | Amended ADR 0010. Clarifies behavior of the original common threshold; no new persisted assistant state. |

## Validation limits and mutation results

V-01: The GTK traversal uses static disconnected/unconfigured fake controllers;
it does not exercise busy/paste, connected/reconnect, write rejection, terms or
destructive-dialog states. The minimum-size assertion targets 360px, but the
primary-button assertion only requires width below 640px. That is insufficient
to establish actual descendant containment, unclipped text or keyboard access.
The St probe checks popup/card widths and geometry, not every descendant or
enlarged St fonts. These are coverage limits, not reproduced overflow defects.

V-02: Native widget semantics and one RTL screenshot were reviewed. Actual
keyboard traversal, Orca announcements, contrast measurement, live-provider
authentication and real browser return were not established in this audit.
The preferences probe explicitly disables accessibility integration.

The frontend reviewer replayed five private single-edit mutants:

| Mutant | Existing assertions |
|---|---|
| Remove late OAuth token attempt-generation guard | Killed |
| Omit tick-width subtraction in RTL reflection | Killed |
| Remove API-key stale-lookup generation guard | Survived |
| Ignore keyringDown in connection summary | Survived |
| Force API-key view late-refresh focus condition true | Survived; unit filter does not exercise GTK views |

These results describe the targeted assertions, not a whole-project mutation
score. Follow-up tests should assert user outcomes and deferred callbacks, rather
than mirror implementation details.

Architecture additionally ran six structure tests and two restore-defaults tests,
all passing. The latter cover the reset batch, not the independently reproduced
post-restore transaction defect R-03.

## Security assessment

The security specialist reported no confirmed security vulnerability in the
examined change. Nineteen isolated focused tests passed: sixteen OAuth-controller,
two API-key-controller and one helper-command test, using an empty private config
directory and injected credential operations. This is scoped evidence, not a
whole-project or live-provider certification.

The inspected paths preserve libsecret-only persistence, preferences-only OAuth,
explicit provider-specific terms consent, the shared login gate, fixed nonsecret
messages, settings that cannot authenticate, and manually executed helper commands.
D-01 and D-02 affect the accuracy of user feedback; no credential exposure or
consent bypass was established. R-03 has no established security exploit.

Additional hardening/verification backlog: test cancellation and disposal after
storage has already begun, asserting exactly one completed write and one
announcement; explicitly dispose per-flow OAuth HTTP clients. The latter pattern
predates the controller split. Request stream/timer cleanup exists; no exploit or
unbounded-resource failure was reproduced.

Fresh coordinator verification: `tools/check.sh` exited 0;
`/tmp/gaq-audit-check.log` records **260 passed, 0 failed**, Shell enable, syntax,
ShellCheck, schemas, translation template, **1 catalog with 0 problems**, and
whitespace checks. Passing tests do not cover D-01 through D-03.

Prior completion-run evidence was inspected, not rerun here: preferences traversal
and lifecycle/startup logs in `/tmp/gaq-completion-prefs.log`, four layout cases in
`/tmp/gaq-completion-layout.log`, and four static-analysis tools in
`/tmp/gaq-completion-sast.log`. Gitleaks was absent and skipped; CodeQL is CI-only.

## Scope and disposition

Indicator model extraction/coalescing, keyboard bar tooltips, legend Escape order
and CI ESLint were already pending in the committed original ADR 0010. They remain
recorded backlog and are not newly introduced omissions. Live-account checks and
provider terms remain owner checks under ADR 0009; this code audit does not
revalidate external terms.

At the review snapshot, the assistant and RTL work were substantially implemented.
All five review lenses were consolidated, with conformance qualified by D-01,
D-02, D-03 and inherited R-03, plus recovery and coverage limitations.
The widget-free accountText module under preferences is a minor organizational
adaptation to the guide's preference for computed presentation in core; it does
not violate the enforced import graph.

The initial audit changed documentation only. The user subsequently requested
development agents to correct every finding; the correction pass follows.

## Development-agent resolution — 2026-10-07

| Finding | Resolution and regression evidence |
|---|---|
| D-01 | Done updates existing rows from controller and account-status subscriptions; disposal releases both. tests/prefsStates.js checks delayed failure/success/rejection while preserving the focused row. |
| D-02 | API-key controllers retain fixed nonsecret lastFailure until successful retry/removal; account text and summary reflect it. Controller tests check rejection, recovery and absence of credential text; GTK checks summary updates. |
| D-03 | Core fmt supports the existing %02d catalog placeholder. tests/core.test.js checks 4:59, 1:01 and 0:00 in English and a translated template. |
| R-01 | OAuth recheck refreshes config and keyring asynchronously; API views refresh availability on activation. Controller and native GTK recovery tests pass without starting authentication. |
| R-02 | Empty selections omit connection progress; native GTK checks useful guidance without a false connected message. |
| R-03 | Restore batches on a dedicated Gio.Settings instance using the original schema/path/backend. tests/services.test.js observes subsequent edits and dismissal through an independent instance, including repeated restore. |
| R-04 | OAuth snapshots read retained configuration only. Async service I/O preserves ownership/mode/type/size checks, bounds streamed input and closes it; generations reject stale replies. Temporary-file and controller tests pass; revocation also uses the async reader. |
| R-05 | API views ignore late save/lookup callbacks and release activation/close handlers. GTK tests detached-entry mutation/focus with live-view positive controls. Both API removal and OAuth disconnect responses ignore disposed views. |
| V-01 | GTK asserts viewport/parent containment across six state matrices covering ready/busy/paste/connected/rejected/keyring/config/error states and consent/destructive dialogs. St checks label/action containment on an 800px monitor, measured font enlargement, keyboard focus and eight direction/text/font combinations. Intentional ellipsis and vertical scrolling remain permitted by the existing design. |
| Security write boundary | Deferred-store tests verify cancellation/disposal after storage starts finishes exactly one write and announcement; pre-storage cancellation remains covered. Disposed controllers start no further lookups. |
| HTTP hardening | Per-flow OAuth HTTP clients dispose once on exchange completion, failed start/fallback, cancellation and closure, independently of a pending keyring write. |
| Surviving mutants | Removing API lookup ordering now fails; ignoring keyringDown in summary now fails; forcing initial-entry focus for an existing key now fails the isolated GTK matrix. |

The stronger St focus test additionally reproduced native layout critical messages
when tooltip labels were destroyed repeatedly during focus changes. Tooltips now
reuse one hidden label; the indicator destroys it on cleanup. The probe checks
singleton reuse/release and rejects extension-related St critical messages.
Failing evidence: /tmp/gaq-layout-tooltip-red.log. Passing evidence:
/tmp/gaq-layout-tooltip-reuse.log.

Added regressions failed on the original symptoms before their fixes. Evidence
includes /tmp/gaq-countdown-red.log, /tmp/gaq-restore-red.log,
/tmp/gaq-gtk-red.log and /tmp/gaq-gtk-dialog-red.log. Controller regressions also
failed before async configuration/lifecycle fixes. Regression probes used no real
credential store or provider configuration.

Final verification:

- tools/check.sh: exit 0; **279 passed, 0 failed**, syntax, Shell enable,
  ShellCheck, schema, translations and whitespace. /tmp/gaq-fixes-check.log.
- tools/prefs-smoke.sh: exit 0; six 360px variants, three traversals each,
  closing paths, **60 state checks**, full startup scenarios.
  /tmp/gaq-gtk-final-full.log.
- tools/layout-check.sh: exit 0; **eight cases**, measured font enlargement,
  containment, keyboard focus, meter geometry and tooltip cleanup, without
  extension-related St critical messages. /tmp/gaq-layout-tooltip-reuse.log.
- tools/sast.sh: exit 0; bandit, Semgrep, ShellCheck and zizmor passed. Gitleaks
  was unavailable and skipped; CodeQL is CI-only. /tmp/gaq-fixes-sast.log.
- tools/pack.sh: exit 0; ZIP bytes match **74 source files**, including current
  code/schema/helper; tests/docs excluded. /tmp/gaq-fixes-pack.log and direct
  zipfile comparison.
- Final peer review: no confirmed blockers in consent/lifecycle, disposed-dialog
  responses, summary, transactional restore or tooltip cleanup.

V-02 remains a validation limit: native GTK paste-editor traversal and action
focus transitions, plus St keyboard focus, are exercised. Physical whole-window
Tab navigation and an Orca user session are not certified, nor are live-provider
authentication, real browser return or current external terms. No palette changed;
this pass does not add a visual contrast certification. These human/live checks
are not represented as unresolved code defects.

Adaptations A-01 through A-04 remain explicit. Original indicator,
bar-keyboard/legend and CI-lint backlog is unchanged. No commit, merge, push or
deployment was performed.
