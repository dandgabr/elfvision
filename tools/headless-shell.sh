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
# shellcheck source=tools/private-session-cleanup.sh
source "$root/tools/private-session-cleanup.sh"
trap 'cleanup_private_session "$work"' EXIT

mkdir -p "$work/data/gnome-shell/extensions" "$work/config" "$work/cache" "$work/state"
mkdir -m 700 "$work/runtime"
ln -s "$root" "$work/data/gnome-shell/extensions/$uuid"

# Keep data, config, cache and runtime away from the real session.
export XDG_DATA_HOME="$work/data" XDG_CONFIG_HOME="$work/config" XDG_CACHE_HOME="$work/cache"
export XDG_STATE_HOME="$work/state" GIO_USE_VFS=local
# Shell stores its extension crash sentinel and Wayland sockets here. A shared
# host runtime directory lets concurrent throwaway shells remove each other's marker.
export XDG_RUNTIME_DIR="$work/runtime"
export GSETTINGS_BACKEND=memory
export GAQ_TEST_MONITOR="${GAQ_TEST_MONITOR:-1280x800}"
export GAQ_TEST_MONITORS="${GAQ_TEST_MONITORS:-$GAQ_TEST_MONITOR}"
if [[ ! "$GAQ_TEST_MONITORS" =~ ^[0-9]+x[0-9]+(,[0-9]+x[0-9]+){0,2}$ ]]; then
    echo 'GAQ_TEST_MONITORS must contain one to three WIDTHxHEIGHT values separated by commas' >&2
    exit 1
fi
# One script path per line, so names with spaces survive.
SCRIPTS="$(printf '%s\n' "$@")"
export WORK="$work" DATA_SOURCE="${DATA_SOURCE:-demo}" UUID="$uuid" SCRIPTS LOGFILE="$log" ROOT="$root" SKIP_ENABLE="${SKIP_ENABLE:-}"

unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK AT_SPI_BUS_ADDRESS
dbus-run-session -- bash -c '
    # Launch on this private bus/runtime: D-Bus activation may be denied by
    # the host security policy even when direct execution is permitted.
    if [ -x /usr/libexec/at-spi-bus-launcher ]; then
        /usr/libexec/at-spi-bus-launcher --launch-immediately >"$WORK/a11y.log" 2>&1 &
        if [ -x /usr/libexec/at-spi2-registryd ]; then
            for _ in $(seq 1 50); do
                gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus \
                    --method org.a11y.Bus.GetAddress --timeout 1 >"$WORK/a11y-address" 2>/dev/null && break
                sleep 0.02
            done
            if [ -s "$WORK/a11y-address" ]; then
                AT_SPI_BUS_ADDRESS="$(python3 -I -c "import ast,sys; print(ast.literal_eval(open(sys.argv[1]).read())[0])" "$WORK/a11y-address")"
                export AT_SPI_BUS_ADDRESS
                /usr/libexec/at-spi2-registryd >"$WORK/a11y-registry.log" 2>&1 &
            fi
        fi
    fi
    export WAYLAND_DISPLAY="gaq-headless-$$"
    # A throwaway, unlocked keyring, so the provider keys of a test never touch yours.
    # Its own private runtime folder: it must not touch the control socket of your real keyring.
    keyring_run="$WORK/keyring-run"
    mkdir -m 700 "$keyring_run"
    XDG_RUNTIME_DIR="$keyring_run" gnome-keyring-daemon --start --components=secrets >/dev/null 2>&1 || true
    # Only the in-memory session collection exists; make it the default one so
    # libsecret does not ask to create a keyring.
    gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets \
        --method org.freedesktop.Secret.Service.SetAlias default /org/freedesktop/secrets/collection/session >/dev/null 2>&1 || true
    IFS=, read -r -a monitor_sizes <<< "$GAQ_TEST_MONITORS"
    monitor_args=()
    for size in "${monitor_sizes[@]}"; do monitor_args+=(--virtual-monitor "$size"); done
    gnome-shell --headless --wayland --unsafe-mode --wayland-display "$WAYLAND_DISPLAY" "${monitor_args[@]}" >"$LOGFILE" 2>&1 &
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
