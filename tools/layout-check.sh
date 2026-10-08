#!/usr/bin/env bash
# Layout checks use only the isolated demo shell; failed Eval is a failed test.
set -euo pipefail
cd "$(dirname "$0")/.."
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
if ! LOG="$scratch/shell.log" GAQ_TEST_MONITOR=800x900 timeout 90 tools/headless-shell.sh tools/demo-connectors-fixture.js tools/layout-probe.js sleep:20 tools/layout-verify.js >"$scratch/result" 2>&1; then
    cat "$scratch/result"
    exit 1
fi
if grep -Eq 'already disposed|JS ERROR|CRITICAL|Extension.*Error' "$scratch/shell.log" "$scratch/result"; then
    grep -E 'already disposed|JS ERROR|CRITICAL|Extension.*Error' "$scratch/shell.log" "$scratch/result"
    exit 1
fi
if ! grep -q GAQ_LAYOUT_OK "$scratch/result" || grep -q '(false,' "$scratch/result"; then
    cat "$scratch/result"
    exit 1
fi
grep GAQ_LAYOUT_OK "$scratch/result"
