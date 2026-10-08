# Final security and architecture review — 2026-10-08

Reviewed the working feature implementation over baseline `800465f`, in
`/home/daniel/Code/gnome-ai-quota-post-mvp`. This is an independent, read-only product
review. Only this report was written. The root's reported 372 passing tests and
five clean scanners are contextual evidence, not checks repeated by this reviewer.

Applied the GNOME Shell extension development and software architect skills.
Read the closure plan and ADRs 0006, 0008 and 0010. Reviewed core disconnect,
fontInstall, fontManifest, alerts and defaults; services disconnectAll,
disconnectGate, disconnectStore, fontInstaller, cacheStore, alertStore,
alertService, controller and secrets; OAuth tokenManager and preferences OAuth/API
key controllers; extension lifecycle, schema defaults and the relevant preferences
integration, consent dialogs, restore action and provider token-manager wiring.

No Shell/native sessions, scanners, credential stores or real local provider
configuration were opened. Small Node/GJS reproductions used injected synthetic
state and controlled promises. Temporary scripts were removed afterward. The
known native BoxPointer/foreground invalid allocation blocker remains outside
this approval scope and must not be represented as resolved by this report.

## Strengths

- The reviewed core modules have no GI imports. GTK consent/views, Shell drawing,
  service I/O and pure rules are separated; account controllers inject effects.
- Disconnect-all uses durable issued leases, process start/boot identities,
  cross-process D-Bus serialization, a boot/session pin, epoch fencing and
  fail-closed retry states. Cache commits hold the durable serialization lock and
  retain the start ticket. Orphaned credential operations do not expire by time.
- Local deletion enumerates exact extension schema attributes and the live
  `snapshots.json`/`alerts.json` files. It does not revoke remote sessions. The
  confirmation explicitly describes that scope and defaults/closes to Cancel.
- Restore classification keeps data source, account/status state, tracking,
  provider configuration choices, first-use and consent. Restore uses a dedicated
  delayed settings transaction so subsequent edits remain live.
- Fonts come from a fixed reviewed revision and four manifest entries, with
  exact sizes/hashes, bundled hash-checked licenses, bounded streaming, deadline,
  cancellation, private staging and atomic no-overwrite publication. Theme data
  cannot supply download URLs. Consent defaults to Cancel and choosing a theme
  does not start installation.
- Warning defaults are opt-in 80%, existing critical defaults remain 95%, valid
  pairs require warning below critical, and a bounded nonsecret backup retains
  effective rules across restarts. Migration retains critical latches/cap state
  while establishing a quiet baseline. Lifecycle code fences stale load results,
  destroys interfaces and keeps accepted rotations coordinated until settlement.

## Issues, by severity

### P1 — A same-epoch token rotation can overwrite a newer sign-in

Locations: `lib/oauth/tokenManager.js:63`, `:68`, `:74`;
`lib/core/disconnect.js:109`–`:117`; `lib/providers/index.js:124`;
`lib/services/secrets.js:30`.

The manager reads and compares `gen`/refresh before calling save. The credential
gate durably registers a lease, then releases its transaction mutex before
executing the keyring operation; it permits another credential operation for the
same provider. A new login does not change the disconnect epoch. Thus the compare
and replacement are not atomic relative to another login. A single-provider
disconnect can similarly finish while an already issued old store later restores
the deleted credential. This violates the token-manager contract that the latest
sign-in/disconnect wins; disconnect-all's epoch/drain protection does not solve
the same-epoch case.

Executed proof used the actual pure `createDisconnectGate` and
`createTokenManager`, a serial queued in-memory store, provider `synthetic`, and
identity `{id:'test-owner',boot:'test-boot',pid:'123',start:'1'}`:

1. Capture `{epoch:'test-2',provider:'synthetic'}`; store starts with
   `{gen:'old-login',refresh:'old-refresh',expiresAt:0}`.
2. Return a synthetic successful rotation with `rotated-refresh`.
3. Let manager load/compare succeed and issue its real gate lease; pause its
   injected keyring callback before replacement.
4. Capture a second same-provider ticket in the same epoch; execute a second
   `withCredentialWrite` and store `{gen:'new-login',refresh:'new-refresh'}`.
5. Finish the new-login operation, then release the old rotation's callback.

Observed output (both operations accepted and both leases settled):

```json
{"sameEpoch":true,"leasesDuringLogin":1,"leasesAfter":0,"finalGen":"old-login","finalRefresh":"rotated-refresh","newLoginPreserved":false}
```

The decisive synthetic save injection was:

```js
save: (value, ticket) => gate.withCredentialWrite('synthetic', ticket, async () => {
    enteredOldWrite();
    await releaseOldWrite;
    stored = {...value};
})
// After enteredOldWrite resolves:
await gate.withCredentialWrite('synthetic', await gate.capture('synthetic'), async () => {
    stored = {gen: 'new-login', refresh: 'new-refresh', expiresAt: 999999};
});
resumeOldWrite();
await oldAccessTokenOperation;
```

Recommendation: make same-provider credential mutation and conditional token
replacement a coordinated transaction. The expected gen/refresh comparison must
occur inside the exclusion protecting the actual write, and login/deletion must
participate. Simply serializing already compared writes does not prevent an old
comparison waiting behind a new login. Preserve durable issued-lease/orphan
semantics and avoid holding the global metadata mutex across keyring work in a
way that prevents disconnect from entering its cancellation/drain phase. Add
controlled interleaving coverage for login, rotation and individual deletion.

### P1 — Cancellation can be bypassed while awaiting a gate assertion

Locations: `lib/prefs/oauthController.js:287`–`:291`, `:351`–`:356`,
`:358`–`:360`; cancel/dispose increment the attempt at `:371` and `:426`.

The attempt/disposed check occurs before an awaited `gate.assertCurrent`.
Navigation, Cancel or disposal during that wait changes the attempt without
changing the epoch, so the assertion still succeeds and the continuation starts
an effect after cancellation. Three effects are affected: terms acknowledgement,
beginning a sign-in, and starting the keyring save for an already received OAuth
response. This violates ADR 0010's rule that leaving Connect cancels confirmation
and cannot acknowledge terms or store a later response. The accepted exception
for a save that has already started does not apply: the synthetic save had not
been invoked when cancellation occurred. The late terms case follows an explicit
Yes; it does not manufacture consent or prove acknowledgement after a No. It is
an attempt-lifecycle mismatch against the ADR's stated cancellation behavior,
while the late credential dispatch and late sign-in start are the primary
security/lifecycle defects. Cancelling authentication need not inherently revoke
consent already given; the root may clarify that product policy separately.

Executed proof imported the actual controller with GJS from a temporary module.
All effects were injected; `readLocalConfig` returned an in-memory public client
id; no real keyring/browser/port/configuration was used. A synthetic gate's
`assertCurrent` used a deferred promise. `cancel()` ran after assertion entry and
before its resolution. Fixed timers returned ids without scheduling native work.

- Existing sign-in: allow the connect assertion, resolve `started.done`, pause
  the following assertion at line 289, cancel, release. Output:
  `{"cancelledBeforeStore":true,"storesAfterCancel":1}`.
- Terms flow: `confirmTerms` resolves true, pause its assertion at line 353,
  cancel, release. Output:
  `{"terms":true,"cancelledWhileChecking":true,"termsAcknowledgedAfterCancel":["synthetic"],"startsAfterCancel":0}`.
- No-terms flow: pause assertion at line 359, cancel, release. Output:
  `{"terms":false,"cancelledWhileChecking":true,"termsAcknowledgedAfterCancel":[],"startsAfterCancel":1}`.

Minimal controllable gate:

```js
const gate = {
    capture: async () => ({epoch: 'test', provider: 'synthetic'}),
    assertCurrent: async () => { enteredAssertion(); await releaseAssertion; },
    subscribe: () => () => {}, registerCanceller: () => () => {},
    isBlocked: () => false,
};
const pendingConnect = controller.connect();
await assertionEntered;
controller.cancel();
resumeAssertion();
await pendingConnect;
```

Recommendation: repeat the disposed/attempt check immediately after each awaited
gate assertion before acknowledging terms, starting login, or invoking secret
storage. Exercise both `cancel()` and `dispose()` at those boundaries, retaining
the already-started-save settlement exception.

## Verdict

Changes required for the two reproduced P1 concurrency/cancellation defects.
The reviewed boundaries, font source constraints, local deletion scope and alert
defaults are otherwise supported by the inspected code. This review does not
approve publication, the renderer, hardware/Orca behavior, real-provider terms
currency, real-account behavior, or the root's aggregate test/scanner claims.
Re-review the fixes and run fresh relevant gates before publication.
