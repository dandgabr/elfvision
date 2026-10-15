#!/usr/bin/env bash
# Write the integrity files a release carries next to the package:
#
#   tools/pack.sh && tools/release-assets.sh
#
# dist/build-manifest.json names the version, the source commit and the archive hash, and
# dist/SHA256SUMS lets `sha256sum --check SHA256SUMS` verify both files (README, "Install").
# This script publishes nothing; upload the three files with `gh release create`.
set -euo pipefail

cd "$(dirname "$0")/.."

archive="elfvision-gnome.shell-extension.zip"
[ -f "dist/$archive" ] || { echo "release-assets: run tools/pack.sh first" >&2; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "release-assets: the working tree has uncommitted changes; the manifest would name the wrong commit" >&2
    exit 1
fi

python3 -I - "$archive" "$(git rev-parse HEAD)" <<'PY'
import datetime, hashlib, json, pathlib, sys

archive, commit = sys.argv[1], sys.argv[2]
meta = json.loads(pathlib.Path('metadata.json').read_text())
dist = pathlib.Path('dist')
digest = hashlib.sha256((dist / archive).read_bytes()).hexdigest()
manifest = {
    'version': meta['version-name'],
    'uuid': meta['uuid'],
    'settingsSchema': meta['settings-schema'],
    'shellVersions': meta['shell-version'],
    'sourceCommit': commit,
    'builtAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'buildCommand': 'tools/pack.sh',
    'archive': archive,
    'sha256': digest,
}
path = dist / 'build-manifest.json'
path.write_text(json.dumps(manifest, indent=2) + '\n')
manifest_digest = hashlib.sha256(path.read_bytes()).hexdigest()
(dist / 'SHA256SUMS').write_text(f'{digest}  {archive}\n{manifest_digest}  build-manifest.json\n')
print(f'wrote dist/build-manifest.json and dist/SHA256SUMS for {meta["version-name"]} at {commit[:12]}')
PY
