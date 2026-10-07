#!/usr/bin/env bash
# Run the extension in a throwaway headless GNOME Shell and execute a JS
# snippet inside it, without touching your real session or settings.
#
#   tools/headless-shell.sh [script.js ...]
#
# The shell runs on its own D-Bus session with an in-memory GSettings backend
# and a temporary XDG_DATA_HOME that links this checkout as the only user
# extension. The optional scripts are evaluated, in order, one second apart, inside the shell through
# org.gnome.Shell.Eval (enabled by --unsafe-mode); their results are printed.
# Set SKIP_ENABLE=1 to boot without enabling the extension (a baseline for the log).
# The shell log is written to $LOG (default: a temporary file, shown at exit).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
uuid="$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
scripts="$*"
work="$(mktemp -d)"
log="${LOG:-$work/shell.log}"
trap 'rm -rf "$work/data"' EXIT

mkdir -p "$work/data/gnome-shell/extensions"
ln -s "$root" "$work/data/gnome-shell/extensions/$uuid"

export XDG_DATA_HOME="$work/data"
export GSETTINGS_BACKEND=memory
export UUID="$uuid" SCRIPTS="$scripts" LOGFILE="$log" ROOT="$root" SKIP_ENABLE="${SKIP_ENABLE:-}"

dbus-run-session -- bash -c '
    gnome-shell --headless --wayland --unsafe-mode --virtual-monitor 1280x800 >"$LOGFILE" 2>&1 &
    shell=$!
    for _ in $(seq 1 50); do
        sleep 0.3
        gdbus call --session --dest org.gnome.Shell.Extensions \
            --object-path /org/gnome/Shell/Extensions \
            --method org.gnome.Shell.Extensions.ListExtensions >/dev/null 2>&1 && break
    done
    if [ -z "${SKIP_ENABLE:-}" ]; then
        gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
            --method org.gnome.Shell.Extensions.EnableExtension "$UUID" >/dev/null
    fi
    sleep 2
    echo "--- extension info"
    gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
        --method org.gnome.Shell.Extensions.GetExtensionInfo "$UUID" | tr "," "\n" | grep -E "state|error|enabled" || true
    for script in $SCRIPTS; do
        echo "--- result of $script"
        code="$(cat "$script")"
        gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Eval "$code"
        sleep 1.5
    done
    kill "$shell" 2>/dev/null || true
    wait "$shell" 2>/dev/null || true
'
echo "--- shell log ($log)"
grep -i -E "gnome-ai-quota|gaq|error|exception|critical|JS ERROR|warning.*(St|Clutter)" "$log" | head -40 || true
