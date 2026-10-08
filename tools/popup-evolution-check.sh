#!/usr/bin/env bash
# Native per-theme matrix, isolated demo connectors; never imports user settings.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p build/popup-evolution
export GAQ_CAPTURE_SCHEME="${1:-light}"
export GAQ_CAPTURE_THEME="${2:-}"
[[ "$GAQ_CAPTURE_SCHEME" == light || "$GAQ_CAPTURE_SCHEME" == dark ]] || exit 2
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
waits=()
if [[ -z "$GAQ_CAPTURE_THEME" ]]; then
    waits+=(sleep:25 sleep:25 sleep:25 sleep:25)
fi
if ! DATA_SOURCE=demo LOG="$scratch/shell.log" timeout --kill-after=5s 190 \
    tools/headless-shell.sh tools/demo-connectors-fixture.js tools/popup-evolution-probe.js \
    "${waits[@]}" 'wait-for:global.gaqPopupEvolution?.finished' tools/popup-evolution-verify.js >"$scratch/result" 2>&1; then
    cat "$scratch/result"
    exit 1
fi
cat "$scratch/result"
if ! rg -q GAQ_POPUP_EVOLUTION_OK "$scratch/result" ||
    rg -q 'JS ERROR|CRITICAL|already disposed' "$scratch/shell.log"; then
    exit 1
fi
