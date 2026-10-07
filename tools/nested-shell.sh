#!/usr/bin/env bash
# Try the extension in a nested GNOME Shell window on your desktop, without
# touching your real session, settings or top bar. Needs the mutter-devkit
# package (sudo dnf install mutter-devkit).
#
#   tools/nested-shell.sh [prefs]
#
# The window is a throwaway session with in-memory settings. The extension is
# enabled for you; with "prefs" the preferences window opens too. Close the
# window (or press Ctrl+C here) to end it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
[ -x /usr/libexec/mutter-devkit ] || { echo "mutter-devkit is missing: sudo dnf install mutter-devkit" >&2; exit 1; }
"$root/tools/build.sh" >/dev/null
uuid="$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
work="$(mktemp -d)"
# Removed on every way out, a signal included: the folder can hold a copy of the client ids.
trap 'rm -rf "$work"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$work/data/gnome-shell/extensions"
ln -s "$root" "$work/data/gnome-shell/extensions/$uuid"

# The client ids of your real configuration, copied (read only, private) so Connect works here.
real_config="${XDG_CONFIG_HOME:-$HOME/.config}/gnome-ai-quota/providers.local.json"
if [ -r "$real_config" ]; then
    mkdir -p "$work/config/gnome-ai-quota" && chmod 700 "$work/config/gnome-ai-quota"
    install -m 600 "$real_config" "$work/config/gnome-ai-quota/providers.local.json"
fi

export XDG_DATA_HOME="$work/data" XDG_CONFIG_HOME="$work/config" XDG_CACHE_HOME="$work/cache"
# A file backend, not "memory": the preferences window is another process and
# must share the settings with the shell.
# DATA_SOURCE=demo starts with made-up data instead of the real providers.
if [ -n "${DATA_SOURCE:-}" ]; then
    GSETTINGS_BACKEND=keyfile GSETTINGS_SCHEMA_DIR="$root/schemas" \
        gsettings set org.gnome.shell.extensions.gnome-ai-quota data-source "$DATA_SOURCE"
fi
export WORK="$work" GSETTINGS_BACKEND=keyfile GTK_A11Y=none UUID="$uuid" OPEN_PREFS="${1:-}"

# The sign-in of a test goes to a throwaway keyring, never to your real one.
unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK
dbus-run-session -- bash -c '
    # A throwaway, unlocked keyring, so the provider keys of a test never touch yours.
    # Its own private runtime folder: it must not touch the control socket of your real keyring.
    keyring_run="$WORK/keyring-run"
    mkdir -m 700 "$keyring_run"
    XDG_RUNTIME_DIR="$keyring_run" gnome-keyring-daemon --start --components=secrets >/dev/null 2>&1 || true
    # Only the in-memory session collection exists; make it the default one so
    # libsecret does not ask to create a keyring.
    gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets \
        --method org.freedesktop.Secret.Service.SetAlias default /org/freedesktop/secrets/collection/session >/dev/null 2>&1 || true
    gnome-shell --devkit --wayland --unsafe-mode >/dev/null 2>&1 &
    shell=$!
    for _ in $(seq 1 60); do
        sleep 0.5
        gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
            --method org.gnome.Shell.Extensions.ListExtensions >/dev/null 2>&1 && break
    done
    gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
        --method org.gnome.Shell.Extensions.EnableExtension "$UUID" >/dev/null
    if [ "$OPEN_PREFS" = prefs ]; then
        sleep 2
        gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
            --method org.gnome.Shell.Extensions.OpenExtensionPrefs "$UUID" "" "{}" >/dev/null
    fi
    wait "$shell"
'
