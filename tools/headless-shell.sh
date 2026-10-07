#!/usr/bin/env bash
# Run the extension in a throwaway headless GNOME Shell and execute a JS
# snippet inside it, without touching your real session or settings.
#
#   tools/headless-shell.sh [script.js | sleep:SECONDS ...]
#
# The shell runs on its own D-Bus session with an in-memory GSettings backend
# and a temporary XDG_DATA_HOME that links this checkout as the only user
# extension. The optional scripts are evaluated, in order, one second apart, inside the shell through
# org.gnome.Shell.Eval (enabled by --unsafe-mode); their results are printed.
# Set SKIP_ENABLE=1 to boot without enabling the extension (a baseline for the log).
# The shell log is written to $LOG (default: a temporary file, shown at exit).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
"$root/tools/build.sh" >/dev/null
uuid="$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
work="$(mktemp -d)"
log="${LOG:-$work/shell.log}"
# Remove the whole scratch directory, but keep the log when LOG points elsewhere.
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/data/gnome-shell/extensions" "$work/config" "$work/cache"
ln -s "$root" "$work/data/gnome-shell/extensions/$uuid"

# Keep data, config and cache away from the real session.
export XDG_DATA_HOME="$work/data" XDG_CONFIG_HOME="$work/config" XDG_CACHE_HOME="$work/cache"
export GSETTINGS_BACKEND=memory
# One script path per line, so names with spaces survive.
SCRIPTS="$(printf '%s\n' "$@")"
export DATA_SOURCE="${DATA_SOURCE:-demo}" UUID="$uuid" SCRIPTS LOGFILE="$log" ROOT="$root" SKIP_ENABLE="${SKIP_ENABLE:-}"

unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK
dbus-run-session -- bash -c '
    # A throwaway, unlocked keyring, so the provider keys of a test never touch yours.
    gnome-keyring-daemon --start --components=secrets >/dev/null 2>&1 || true
    # Only the in-memory session collection exists; make it the default one so
    # libsecret does not ask to create a keyring.
    gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets \
        --method org.freedesktop.Secret.Service.SetAlias default /org/freedesktop/secrets/collection/session >/dev/null 2>&1 || true
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
    # The tests use made-up data; set DATA_SOURCE=live to use the real providers.
    if [ "${DATA_SOURCE:-demo}" = demo ]; then
        gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval \
            "Main.panel.statusArea[\"$UUID\"]._settings.set_string(\"data-source\", \"demo\")" >/dev/null
        sleep 1
    fi
    echo "--- extension info"
    gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
        --method org.gnome.Shell.Extensions.GetExtensionInfo "$UUID" | tr "," "\n" | grep -E "state|error|enabled" || true
    while IFS= read -r script; do
        [ -n "$script" ] || continue
        case "$script" in
            sleep:*) sleep "${script#sleep:}"; continue ;;
        esac
        echo "--- result of $script"
        code="$(cat "$script")"
        gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Eval "$code"
        sleep 1.5
    done <<< "$SCRIPTS"
    kill "$shell" 2>/dev/null || true
    wait "$shell" 2>/dev/null || true
'
echo "--- shell log ($log)"
grep -i -E "gnome-ai-quota|gaq|error|exception|critical|JS ERROR|warning.*(St|Clutter)" "$log" | head -40 || true
