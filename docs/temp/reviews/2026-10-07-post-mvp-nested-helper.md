# Actual nested helper runtime isolation

Scope: `tools/nested-shell.sh` only. Other workers' changes preserved; no commits.

Shell now owns a new0700 runtime directory below its throwaway work directory, so compositor sockets/crash markers cannot collide with the parent runtime. Captures actual parent runtime/display before replacing it; relative WAYLAND_DISPLAY resolves against the actual parent runtime, absolute paths remain intact. A relative display with no runtime fails clearly instead of inventing a socket path. Unset display stays unset, preserving existing backend selection. PipeWire parent endpoint is retained for devkit preview only; existing explicit override wins. Private D-Bus/config/data/cache/keyring and GNOME_KEYRING_CONTROL/SSH_AUTH_SOCK unsetting remain intact. Work cleanup traps still remove runtime after session exit.

Added optional LOCAL_CONFIG_FILE override while preserving existing default client-config behavior; smoke will select a dummy file rather than read real provider config. Existing demo/scenario/prefs interface is unchanged.

Source validation: bash-n and gitdiffcheck pass. ShellCheck only reports the existing intentional SC2016 single-quoted inner bash program. Actual helper smoke is pending benchmark completion to avoid native contention. Independent domain/security review requested from m4_front_audit.

## Final actual entrypoint verification

After author benchmark completion, ran unchanged actual `tools/nested-shell.sh` startup and its `prefs` mode with DATA_SOURCE=demo and LOCAL_CONFIG_FILE selecting a dummy{} file. Temporary PATH wrapper `/tmp/gaq-actual-nested-smoke-gakchyae/bin/dbus-run-session` passes the actual helper's child program to the real dbus-run-session, replacing only its final wait with strict native effects probe/verifier and autoclose. No production test hook added.

Both invocations exited0, printed actual runtime mode700 and actual Eval true `GAQ_EFFECTS_OK` across leaves lifecycle, popup integration, material/trust, cached optical primitives, live popup lifecycle and numeric text. Each allocated background/decoration404x552, optical404x552 one cached paint and preserved exact numeric width/foreground checks. Both runtime/work directories were absent after exit, confirming cleanup. `prefs` branch completed its OpenExtensionPrefs call under the private settings/session; no human interaction/accessibility certification is implied. No real provider configuration/credential values were read.

Logs `/tmp/gaq-actual-nested-smoke-gakchyae/{result,prefs}.log`; actual helper suppresses Shell stderr as before, so these logs establish strict Eval and successful startup/cleanup, not a separate all-native-diagnostics cleanliness claim. Other final author nested logs carry that evidence. Independent m4_front_audit source review approved endpoint/isolation/cleanup design with no blocker. Final gitdiffcheck passed. Only production change is tools/nested-shell.sh.
