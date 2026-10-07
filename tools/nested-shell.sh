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
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/data/gnome-shell/extensions"
ln -s "$root" "$work/data/gnome-shell/extensions/$uuid"

export XDG_DATA_HOME="$work/data" XDG_CONFIG_HOME="$work/config" XDG_CACHE_HOME="$work/cache"
export GSETTINGS_BACKEND=memory GTK_A11Y=none UUID="$uuid" OPEN_PREFS="${1:-}"

dbus-run-session -- bash -c '
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
