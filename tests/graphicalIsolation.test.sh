#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for script in tools/headless-shell.sh tools/nested-shell.sh; do
    output=$(DATA_SOURCE=live bash "$script" 2>&1) && { echo "$script accepted live" >&2; exit 1; }
    [[ $output == *'DATA_SOURCE must be demo'* ]] || { echo "$script did not reject live explicitly" >&2; exit 1; }
done
for script in tools/headless-shell.sh tools/nested-shell.sh tools/prefs-smoke.sh; do
    grep -Eq 'export HOME="\$(work|scratch)/home"' "$script" || { echo "$script does not isolate HOME" >&2; exit 1; }
done
! grep -q 'real_config=' tools/nested-shell.sh || { echo 'nested shell copies host configuration' >&2; exit 1; }
# Both buses must be private and must not load host activation directories.
python3 - <<'CHECK'
from pathlib import Path
for path in ('tools/no-secrets-session.conf', 'tools/synthetic-secrets-session.conf'):
    text = Path(path).read_text()
    assert '<include>' not in text and '<servicedir>' not in text, path
for path in ('tools/headless-shell.sh', 'tools/nested-shell.sh', 'tools/prefs-smoke.sh'):
    text = Path(path).read_text()
    assert 'DBUS_SYSTEM_BUS_ADDRESS' in text, path
    assert 'at-spi-bus-launcher' not in text, path
CHECK
# Both configurations must bind inside a private runtime directory and authenticate the user.
for config in tools/no-secrets-session.conf tools/synthetic-secrets-session.conf; do
    CONFIG="$config" python3 - <<'CHECK'
import os
from pathlib import Path
text = Path(os.environ['CONFIG']).read_text()
assert '<listen>unix:runtime=yes</listen>' in text
assert '<allow user="*"/>' not in text
assert '<auth>EXTERNAL</auth>' in text
CHECK
    runtime=$(mktemp -d)
    XDG_RUNTIME_DIR="$runtime" dbus-run-session --config-file="$config" -- bash -euc '
        [[ $(stat -c %a "$XDG_RUNTIME_DIR") == 700 ]]
        [[ "$DBUS_SESSION_BUS_ADDRESS" == "unix:path=$XDG_RUNTIME_DIR/"* ]]
        gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListNames >/dev/null
    '
    rm -rf -- "$runtime"
done
# The bus must answer real calls and must not auto-start installed services.
runtime=$(mktemp -d)
XDG_RUNTIME_DIR="$runtime" dbus-run-session --config-file=tools/no-secrets-session.conf -- bash -euc '
    gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListNames >/dev/null
    result=$(gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListActivatableNames)
    [[ "$result" != *org.freedesktop.secrets* && "$result" != *org.gnome.Shell.CalendarServer* ]]
'
rm -rf -- "$runtime"
# Regression: startup must not prevent the default mode from running other checks.
python3 - <<'CHECK'
from pathlib import Path
prefs = Path('tools/prefs-smoke.sh').read_text()
assert prefs.index('run_states()') < prefs.index('tests/prefsStartup.js')
config = Path('tools/synthetic-secrets-session.conf').read_text()
assert 'servicedir' not in config and '<include>' not in config
assert 'tests/syntheticSecrets.js' in prefs
assert 'READY' in prefs
headless = Path('tools/headless-shell.sh').read_text()
assert 'if [ -z "${SKIP_ENABLE:-}" ] &&' in headless
assert 'verdict="$(gdbus call' in headless
assert 'info="$(gdbus call' in headless and ')" || exit 1' in headless
assert '--dest org.gnome.Shell --object-path /org/gnome/Shell' in headless
assert 'if ! out="$(timeout 120 tools/headless-shell.sh 2>&1)"' in Path('tools/check.sh').read_text()
for path in ['tools/demo-connectors-fixture.js', 'tools/connector-refresh-probe.js', 'tools/popup-evolution-probe.js', 'tools/popup-presentation-probe.js']:
    assert "'keyfile'" in Path(path).read_text(), path
probe = Path('tools/synthetic-oauth-probe.js').read_text()
assert "GLib.getenv('GAQ_TEST_OO7') === '1'" in probe, 'live probe requires isolated oo7'
assert '--unshare-all' in headless and '--clearenv' not in headless and 'env -i' in headless
assert 'synthetic-secrets-session.conf' in headless and 'no-secrets-session.conf' in headless
assert 'invalid-synthetic-token-encoding' in probe
CHECK
# A failed startup backend must not prevent independent checks in all mode.
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/repo/tools" "$work/bin"
cp tools/prefs-smoke.sh tools/private-session-cleanup.sh tools/no-secrets-session.conf "$work/repo/tools/"
printf '#!/bin/sh\nexit 0\n' > "$work/repo/tools/build.sh"
cat > "$work/bin/dbus-run-session" <<'EOF'
#!/bin/bash
shift
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
python3 -c 'import socket,sys; s=socket.socket(socket.AF_UNIX); s.bind(sys.argv[1])' "$XDG_RUNTIME_DIR/bus"
exec "$@"
EOF
cat > "$work/bin/gnome-shell" <<'EOF'
#!/bin/bash
python3 -c 'import socket,sys,time; s=socket.socket(socket.AF_UNIX); s.bind(sys.argv[1]); time.sleep(30)' "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY"
EOF
cat > "$work/bin/gjs" <<'EOF'
#!/bin/bash
echo "$*" >> "$TEST_LOG"
EOF
printf '#!/bin/sh\nshift\nexec "$@"\n' > "$work/bin/timeout"
cat > "$work/bin/bwrap" <<'EOF'
#!/bin/bash
if [[ ${!#} != /service.js ]]; then
    while [[ $1 != env ]]; do shift; done
    shift 2 # env -i
    shift # discard sandbox PATH
    exec env -i PATH="$TEST_BIN:$PATH" TEST_LOG="$TEST_LOG" TEST_BIN="$TEST_BIN" "$@"
fi
echo synthetic-backend-failed >&2
exit 1
EOF
cat > "$work/bin/dbus-daemon" <<'EOF'
#!/bin/bash
python3 -c 'import socket,sys,time; s=socket.socket(socket.AF_UNIX); s.bind(sys.argv[1]); time.sleep(30)' "$XDG_RUNTIME_DIR/system-bus"
EOF
printf '#!/bin/sh\nexit 0\n' > "$work/bin/gdbus"
chmod +x "$work/repo/tools/build.sh" "$work/bin/"*
if PATH="$work/bin:$PATH" TEST_BIN="$work/bin" TEST_LOG="$work/log" bash "$work/repo/tools/prefs-smoke.sh" all >"$work/output" 2>&1; then
    echo 'all mode ignored backend failure' >&2; exit 1
fi
grep -q 'prefsStates.js' "$work/log" || { echo 'independent state checks did not run' >&2; exit 1; }
grep -q 'synthetic-backend-failed' "$work/output" || { echo 'backend failure not reported' >&2; exit 1; }
echo 'graphical isolation checks passed'
# Headless shell must run the entire private bus and shell inside a network namespace.
python3 - <<'CHECK'
from pathlib import Path
headless = Path('tools/headless-shell.sh').read_text()
assert 'bwrap --die-with-parent --unshare-all' in headless
assert '--ro-bind "$root" "$root"' in headless
assert '--bind "$work" "$work"' in headless
assert '--tmpfs /tmp' in headless
assert '--ro-bind /etc/fonts /etc/fonts' in headless
nested = Path('tools/nested-shell.sh').read_text()
assert 'bwrap --die-with-parent --unshare-all' in nested
assert '--ro-bind "$root" "$root"' in nested
assert '--bind "$work" "$work"' in nested
assert '--ro-bind "$parent_wayland" /run/parent-wayland' in nested
assert 'WAYLAND_DISPLAY=/run/parent-wayland' in nested
assert 'env -i PATH=' in nested
assert 'PIPEWIRE_RUNTIME_DIR' not in nested
CHECK
# Exercise kernel boundaries with a synthetic secret, not the real vault.
private=$(mktemp -d)
trap 'rm -rf -- "$work" "$private"' EXIT
printf 'synthetic secret\n' > "$private/secret"
bwrap --die-with-parent --unshare-all --ro-bind /usr /usr \
    --symlink usr/lib64 /lib64 --symlink usr/lib /lib --proc /proc --dev /dev \
    --tmpfs /tmp --setenv HOME /tmp /usr/bin/python3 -I -c '
import os, socket, sys
assert not os.path.exists(sys.argv[1])
assert os.environ["HOME"] == "/tmp"
s = socket.socket()
s.settimeout(1)
try:
    s.connect(("1.1.1.1", 443))
except OSError:
    pass
else:
    raise AssertionError("network reachable")
' "$private/secret"
# Artifacts stay private until copied out by the host after sandbox exit.
python3 - <<'CHECK'
from pathlib import Path
headless = Path('tools/headless-shell.sh').read_text()
assert 'LOGFILE="$work/shell.log"' in headless
assert 'GAQ_RESOURCE_MATRIX_ONLY="${GAQ_RESOURCE_MATRIX_ONLY:-0}"' in headless
assert 'GAQ_CAPTURE_SCHEME="${GAQ_CAPTURE_SCHEME:-}"' in headless
for path in Path('tools').glob('*probe.js'):
    text = path.read_text()
    if 'screenshot(' in text or 'Screenshot()' in text:
        assert '${indicator._extension.path}/.superpowers' not in text, path
        assert "new_for_path('/tmp/gaq-" not in text, path
        assert '${root}/.superpowers' not in text, path
        assert "GLib.getenv('ROOT')}/.superpowers" not in text, path
        assert "GLib.getenv('ROOT')}/build/popup-evolution" not in text, path
CHECK
# Export replaces links rather than following them; source links are rejected.
mkdir -p "$work/source/captures/dir" "$work/export"
printf 'synthetic log' > "$work/source/shell.log"
printf 'synthetic image' > "$work/source/captures/dir/image.png"
printf 'untouched' > "$work/victim"
ln -s "$work/victim" "$work/log-link"
python3 -I tools/export-private-artifacts.py "$work/source" "$work/log-link" "$work/export"
[[ $(cat "$work/victim") == untouched && $(cat "$work/log-link") == 'synthetic log' ]]
[[ $(cat "$work/export/dir/image.png") == 'synthetic image' ]]
ln -s "$work/victim" "$work/source/captures/dir/link"
if python3 -I tools/export-private-artifacts.py "$work/source" '' "$work/export" 2>/dev/null; then
    echo 'artifact export followed source symlink' >&2; exit 1
fi
