# Session coordination recovery

## Evidence and scope

The user's session journal reports `another session owns credential coordination`.
The boot-specific pin still refers to an earlier D-Bus GUID. Coordination metadata
has a completed transaction, no leases, no blocked providers, and two dead
participants. The configured accounts and popup presentation survive installation;
the store refuses admission before either can be loaded.

## Implementation and validation plan

1. Reproduce clean logout/login with two private D-Bus sessions sharing a private
   state directory. Confirm the existing code rejects the second session.
2. Add a persistent kernel file lock around metadata transactions. Hold the open
   file description in the parent process; a short fixed `flock` child acquires it
   through an inherited descriptor. Never replace/unlink the lock file.
3. Keep the D-Bus mutex for same-session compatibility. Recover a stale pin only
   when every recorded old participant, lease owner and transaction coordinator is
   dead. Preserve all durable transaction and credential lease metadata.
4. Test different buses contending, callback errors, killed lock holders, live
   legacy owners, unsafe lock files, clean recovery and orphaned credential writes.
5. Run the complete checks and package-upgrade preservation test, review security
   and QA, then prepare a fix PR. Publish/install only after merge confirmation.

## Compatibility boundary

Upgraded clients serialize across session buses through the kernel lock. Legacy
clients use only D-Bus. The retained bus lock protects same-GUID old clients;
live recorded owners prevent cross-GUID migration. A legacy process paused before
registration on a still-running old bus cannot be discovered from the old pin,
which stores only a GUID. Recovery targets a completed session turnover, not
parallel operation of different extension versions on independent buses.

No connector, credential, popup order/visibility or user preference is reset.

## Verification

- `tools/check.sh`: 575 GJS tests, six theme-generator regressions, private
  credential/connector cross-process checks, lint, schema, translations and native
  extension enable passed. Log: `build/popup-evolution/session-recovery-check.log`.
- `tests/disconnectDisk.sh`: independent buses serialize all 24 increments;
  callback errors and holder death release exclusion; helper exit retains parent
  exclusion; symlinks are rejected; the lock inode stays unchanged; each live owner
  category independently prevents takeover; exact metadata including epoch is
  preserved; clean login recovery and orphan fencing pass.
- Updated `tools/upgrade-preservation-check.py` inspects the actual native gate,
  not only whether the extension is enabled. The published v0.2.0 ZIP fails this
  assertion on second login (`session-recovery-native-red.log`); the corrected ZIP
  passes (`session-recovery-upgrade.log`). Private settings include existing popup
  dimensions, order and hidden connector IDs as well as connector and account
  settings. Install/reinstall/code rollback preserve them. No real keyring read.
- Independent security review accepted the completed-session-turnover scope.
  QA killed ten targeted mutants, including each owner omission and epoch reset.
  The four initial survivors motivated independent owner and exact metadata tests;
  all four then failed as intended. QA copies/logs are private temporary artifacts.

## Parallel documentation review

The documentation and writing agents reviewed README, the documentation index,
usage, development and theme instructions against the current configuration
code and schema. Configuration navigation now points directly to settings and
local-folder sections. GSettings/dconf preferences, public OAuth configuration
and keyring credentials are distinguished; retained IDs and directory names are
explained. Material choices, opacity, Subtle decoration, reset naming and the
optional helper's network behavior were corrected. Current About/repository
destinations already use Elfvision; no additional URL change was needed there.
