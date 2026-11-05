#!/usr/bin/env bash
# Run the extension in a throwaway headless GNOME Shell and execute a JS
# snippet inside it, without touching your real session or settings.
#
#   tools/headless-shell.sh [script.js | sleep:SECONDS | wait-for:EXPRESSION ...]
# Visual probes needing sample accounts must pass tools/demo-connectors-fixture.js first.
# Fresh-start probes omit it, so the product defaults remain under test.
#
# The shell runs on its own D-Bus session with an in-memory GSettings backend
# and a temporary XDG_DATA_HOME that links this checkout as the only user
# extension. The optional scripts are evaluated, in order, one second apart, inside the shell through
# org.gnome.Shell.Eval (enabled by --unsafe-mode); their results are printed.
# Set SKIP_ENABLE=1 to boot without enabling the extension (a baseline for the log).
# The shell log is written to $LOG (default: a temporary file, shown at exit).
set -euo pipefail

if [[ ${DATA_SOURCE:-demo} != demo ]]; then
    echo "DATA_SOURCE must be demo in graphical test sessions" >&2
    exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
"$root/tools/build.sh" >/dev/null
uuid="$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
work="$(mktemp -d)"
log="$work/shell.log"
external_log="${LOG:-}"
export_dir="${GAQ_EXPORT_DIR:-}"
mkdir -p "$work/captures/.superpowers/sdd/2026-10-07-open-items" "$work/captures/.superpowers/sdd/2026-10-07-post-mvp-execution" "$work/captures/.superpowers/sdd/2026-10-08-manual-regressions/captures" "$work/captures/build/popup-evolution" "$work/captures/docs/temp/reviews/assets/provider-expansion"
# Remove the whole scratch directory, but keep the log when LOG points elsewhere.
# shellcheck source=tools/private-session-cleanup.sh
source "$root/tools/private-session-cleanup.sh"
trap 'cleanup_private_session "$work"' EXIT

mkdir -p "$work/data/gnome-shell/extensions" "$work/config" "$work/cache" "$work/state"
mkdir -m 700 "$work/runtime"
dbus-uuidgen > "$work/machine-id"
ln -s "$root" "$work/data/gnome-shell/extensions/$uuid"

# Keep data, config, cache and runtime away from the real session.
mkdir -m 700 "$work/home"
export HOME="$work/home"
export XDG_DATA_HOME="$work/data" XDG_CONFIG_HOME="$work/config" XDG_CACHE_HOME="$work/cache"
export XDG_STATE_HOME="$work/state" GIO_USE_VFS=local
# Shell stores its extension crash sentinel and Wayland sockets here. A shared
# host runtime directory lets concurrent throwaway shells remove each other's marker.
export XDG_RUNTIME_DIR="$work/runtime"
export GSETTINGS_BACKEND=keyfile
GSETTINGS_SCHEMA_DIR="$root/schemas" gsettings set org.gnome.shell.extensions.gnome-ai-quota data-source demo
export GAQ_TEST_MONITOR="${GAQ_TEST_MONITOR:-1280x800}"
export GAQ_TEST_MONITORS="${GAQ_TEST_MONITORS:-$GAQ_TEST_MONITOR}"
if [[ ! "$GAQ_TEST_MONITORS" =~ ^[0-9]+x[0-9]+(,[0-9]+x[0-9]+){0,2}$ ]]; then
    echo 'GAQ_TEST_MONITORS must contain one to three WIDTHxHEIGHT values separated by commas' >&2
    exit 1
fi
# One script path per line, so names with spaces survive.
SCRIPTS="$(printf '%s\n' "$@")"
export WORK="$work" DATA_SOURCE="${DATA_SOURCE:-demo}" UUID="$uuid" SCRIPTS LOGFILE="$work/shell.log" ROOT="$root" SKIP_ENABLE="${SKIP_ENABLE:-}"

unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK AT_SPI_BUS_ADDRESS
export ROOT_FOR_BUS="$root"
# The complete graphical session runs without host HOME, host sockets or networking.
# Only the checkout (read-only), scratch directory and system runtime are visible.
command -v bwrap >/dev/null || { echo 'bwrap is required for graphical isolation' >&2; exit 1; }
status=0
bwrap --die-with-parent --unshare-all --ro-bind /usr /usr \
    --symlink usr/lib64 /lib64 --symlink usr/lib /lib --symlink usr/bin /bin \
    --proc /proc --dev /dev --tmpfs /tmp --tmpfs /run \
    --ro-bind /etc/passwd /etc/passwd --ro-bind /etc/group /etc/group \
    --ro-bind /etc/fonts /etc/fonts \
    --ro-bind "$work/machine-id" /etc/machine-id --ro-bind "$work/machine-id" /var/lib/dbus/machine-id \
    --ro-bind "$root" "$root" --bind "$work" "$work" \
    --chdir "$root" \
    env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_DATA_HOME="$XDG_DATA_HOME" \
    XDG_CONFIG_HOME="$XDG_CONFIG_HOME" XDG_CACHE_HOME="$XDG_CACHE_HOME" \
    XDG_STATE_HOME="$XDG_STATE_HOME" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
    GIO_USE_VFS=local GSETTINGS_BACKEND=keyfile GTK_A11Y=none \
    GAQ_TEST_MONITORS="$GAQ_TEST_MONITORS" WORK="$WORK" DATA_SOURCE="$DATA_SOURCE" \
    UUID="$UUID" SCRIPTS="$SCRIPTS" LOGFILE="$LOGFILE" ROOT="$ROOT" \
    GAQ_RESOURCE_MATRIX_ONLY="${GAQ_RESOURCE_MATRIX_ONLY:-0}" GAQ_CAPTURE_SCHEME="${GAQ_CAPTURE_SCHEME:-}" \
    GAQ_CAPTURE_THEME="${GAQ_CAPTURE_THEME:-}" GAQ_CAPTURE_OFFSET="${GAQ_CAPTURE_OFFSET:-}" GAQ_EFFECTS_SCHEME="${GAQ_EFFECTS_SCHEME:-}" \
    ROOT_FOR_BUS="$ROOT_FOR_BUS" SKIP_ENABLE="$SKIP_ENABLE" GAQ_TEST_OO7="${GAQ_TEST_OO7:-0}" \
    __EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/50_mesa.json \
    dbus-run-session --config-file="$root/tools/$([[ ${GAQ_TEST_OO7:-0} == 1 ]] && echo synthetic-secrets-session.conf || echo no-secrets-session.conf)" -- bash -c '
    set -euo pipefail
    # Use a separate bus with no activation directories, never the host system bus.
    export DBUS_SYSTEM_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/system-bus"
    dbus-daemon --nofork --config-file="$ROOT_FOR_BUS/tools/no-secrets-session.conf" \
        --address="$DBUS_SYSTEM_BUS_ADDRESS" >"$XDG_RUNTIME_DIR/system-bus.log" 2>&1 &
    system_bus=$!
    trap '\''jobs -pr | xargs -r kill 2>/dev/null || true'\'' EXIT
    for _ in $(seq 1 100); do
        [ -S "$XDG_RUNTIME_DIR/system-bus" ] && break
        kill -0 "$system_bus" 2>/dev/null || { cat "$XDG_RUNTIME_DIR/system-bus.log" >&2; exit 1; }
        sleep 0.02
    done
    [ -S "$XDG_RUNTIME_DIR/system-bus" ] || { echo "private system bus unavailable" >&2; exit 1; }
    gjs -m "$ROOT/tools/headless-login-stub.js" >"$XDG_RUNTIME_DIR/login-stub.log" 2>&1 &
    for _ in $(seq 1 100); do
        gdbus call --system --dest org.freedesktop.login1 --object-path /org/freedesktop/login1 --method org.freedesktop.login1.Manager.GetUser "$(id -u)" >/dev/null 2>&1 && break
        sleep 0.02
    done
    gdbus call --system --dest org.freedesktop.login1 --object-path /org/freedesktop/login1 --method org.freedesktop.login1.Manager.GetUser "$(id -u)" >/dev/null || { cat "$XDG_RUNTIME_DIR/login-stub.log" >&2; exit 1; }
    trap '\''jobs -pr | xargs -r kill 2>/dev/null || true'\'' EXIT
    if [ "$GAQ_TEST_OO7" = 1 ]; then
        printf "%s\n" synthetic-test-password | /usr/libexec/oo7-daemon --login >"$XDG_RUNTIME_DIR/oo7.log" 2>&1 &
        for _ in $(seq 1 100); do
            if gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.freedesktop.secrets | grep -q true; then break; fi
            sleep 0.02
        done
        gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets --method org.freedesktop.Secret.Service.SetAlias default /org/freedesktop/secrets/collection/session >/dev/null || { cat "$XDG_RUNTIME_DIR/oo7.log" >&2; exit 1; }
    fi
    ibus-daemon --single --panel=disable --emoji-extension=disable >"$XDG_RUNTIME_DIR/ibus.log" 2>&1 &
    ibus_pid=$!
    for _ in $(seq 1 100); do
        ibus list-engine >/dev/null 2>&1 && break
        kill -0 "$ibus_pid" 2>/dev/null || { cat "$XDG_RUNTIME_DIR/ibus.log" >&2; exit 1; }
        sleep 0.02
    done
    ibus list-engine >/dev/null 2>&1 || { cat "$XDG_RUNTIME_DIR/ibus.log" >&2; echo "private IBus unavailable" >&2; exit 1; }
    export WAYLAND_DISPLAY="gaq-headless-$$"
    IFS=, read -r -a monitor_sizes <<< "$GAQ_TEST_MONITORS"
    monitor_args=()
    for size in "${monitor_sizes[@]}"; do monitor_args+=(--virtual-monitor "$size"); done
    gnome-shell --headless --wayland --unsafe-mode --wayland-display "$WAYLAND_DISPLAY" "${monitor_args[@]}" >"$LOGFILE" 2>&1 &
    shell=$!
    for _ in $(seq 1 50); do
        kill -0 "$shell" 2>/dev/null || { cat "$LOGFILE" >&2; exit 1; }
        sleep 0.3
        gdbus call --session --dest org.gnome.Shell \
            --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Extensions.ListExtensions >/dev/null 2>&1 && break
    done
    if [ -z "${SKIP_ENABLE:-}" ]; then
        enabled="$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Extensions.EnableExtension "$UUID")"
        [ "$enabled" = "(true,)" ] || { echo "EnableExtension failed: $enabled" >&2; exit 1; }
    fi
    sleep 2
    # Keep demo selected after enable as well.
    if [ -z "${SKIP_ENABLE:-}" ] && [ "${DATA_SOURCE:-demo}" = demo ]; then
        verdict="$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval \
            "Main.panel.statusArea[\"$UUID\"]._settings.set_string(\"data-source\", \"demo\")")"
        [[ "$verdict" == "(true,"* ]] || { echo "Shell Eval failed: $verdict" >&2; exit 1; }
        sleep 1
    fi
    echo "--- extension info"
    info="$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Extensions.GetExtensionInfo "$UUID")" || exit 1
    printf "%s\n" "$info" | tr "," "\n" | grep -E "state|error|enabled" || { echo "Extension info missing state" >&2; exit 1; }
    if [ -z "${SKIP_ENABLE:-}" ]; then
        q="$(printf "\047")"
        [[ "$info" == *"${q}state${q}: <1.0>"* ]] && [[ "$info" == *"${q}error${q}: <${q}${q}>"* ]] || {
            echo "Extension did not reach enabled state: $info" >&2; exit 1;
        }
    fi
    while IFS= read -r script; do
        [ -n "$script" ] || continue
        case "$script" in
            sleep:*) sleep "${script#sleep:}"; continue ;;
            wait-for:*)
                ready=false
                for _ in $(seq 1 60); do
                    verdict="$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
                        --method org.gnome.Shell.Eval --timeout 1 "Boolean(${script#wait-for:})" 2>/dev/null || true)"
                    quote="$(printf "\047")"
                    if [ "$verdict" = "(true, ${quote}true${quote})" ]; then ready=true; break; fi
                    sleep 0.5
                done
                if [ "$ready" != true ]; then
                    echo "Private probe did not finish within its bounded wait" >&2
                    kill "$shell" 2>/dev/null || true
                    wait "$shell" 2>/dev/null || true
                    exit 1
                fi
                continue ;;
        esac
        echo "--- result of $script"
        code="$(cat "$script")" || exit 1
        verdict="$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Eval "$code")"
        printf "%s\n" "$verdict"
        if [[ "$verdict" != "(true,"* ]]; then
            kill "$shell" 2>/dev/null || true
            wait "$shell" 2>/dev/null || true
            exit 1
        fi
        sleep 1.5
    done <<< "$SCRIPTS"
    kill "$shell" 2>/dev/null || true
    wait "$shell" 2>/dev/null || true
' || status=$?
# Copy outside the sandbox only after all sandboxed processes have exited.
python3 -I "$root/tools/export-private-artifacts.py" "$work" "$external_log" "$export_dir" || exit 1
[[ $status == 0 ]] || exit "$status"
echo "--- shell log ($log)"
grep -i -E "gnome-ai-quota|gaq|error|exception|critical|JS ERROR|warning.*(St|Clutter)" "$log" | head -40 || true
