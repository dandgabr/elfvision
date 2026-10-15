# 0011. Diagnostic logging

Status: accepted. The diagnostic journal is implemented; the local audit history is planned
(see "Not in this decision").

## Context

Until 0.2.7 the extension wrote about 25 `console.warn/error` lines of free text, with no level,
no structure and no redaction, while most failure paths wrote nothing: of 177 `catch` blocks about
93 left no trace, and OAuth, HTTP, keyring and provider failures lived only in the UI state. Finding
where something fails meant reproducing it by hand.

The constraint is the security model (ADR 0003): nothing that identifies an account or could
unlock one may be written, and the journal is readable by every process of the session and
survives "Delete all connectors".

## Decision

1. **A closed catalog of events** (`lib/core/logEvents.js`). Only these events can be written, and
   only the fields the catalog lists for an event. A field is an integer, a boolean, an allowlisted
   host, a catalog provider id, or a value from a closed list. **There is no free text**: no error
   message, URL, path, label, user name, plan or response.
2. **A pure logger** (`lib/core/log.js`) with levels `off|error|warn|info|debug`, a per-key rate
   limit (one line a minute for the same event, provider and code, then a count), and the guarantee
   that `log` never throws, never awaits and does no I/O. Pure modules (the scheduler, the token
   manager) receive it by injection.
3. **One sink, the systemd journal** (`lib/services/diagnostics.js`), through
   `GLib.log_structured` with the domain `Elfvision`, `ELFVISION_EVENT`, `ELFVISION_PROCESS`
   (`shell` or `prefs`) and one `ELFVISION_<FIELD>` per field. No file is written, no timer is armed.
4. **The level is the `log-level` key** (default `warn`). Restoring the configuration keeps it, so
   a restore in the middle of an investigation does not silence it. `ELFVISION_LOG` overrides it for
   development and tests.
5. **Provider ids appear only on warnings, errors and debug lines**, so routine successes do not
   build a usage history in the journal. Connector ids never appear.
6. **No stack traces.** An exception is reduced to its class (`errorName`), which separates a
   programming error from an expected failure and leaks nothing.
7. **Ratchets.** `no-console` in ESLint, a structure test that no code outside the sink writes to
   the console, a test that every event used exists in the catalog, and a ceiling on the number of
   `catch` blocks that swallow an error silently.

## Consequences

- `journalctl --user ELFVISION_EVENT=provider.fetch_failed` answers where and why a provider fails,
  without a debugger. See [the logging guide](../logging.md).
- The journal follows the systemd retention and rate limit, and can drop lines under load.
- Every new failure path needs a catalog entry, which is deliberate friction.

## Not in this decision

An audit history of the user's own actions (sign-in, credential stored or removed, consent, delete
all) is a different artefact: it names accounts and must be erasable. It will be a separate ADR
and a local file, never the journal. The requirements found in review, so they are not lost:
a file per process in the state directory, written through the disconnect gate with an erase
epoch so "Delete all" cannot be undone by a late flush; a closed list of names for the delete;
no following of symlinks; rotation and an age limit; an opaque per-report connector reference
instead of the connector id; coarse timestamps; and a statement that it is a local history with
no integrity guarantee.
