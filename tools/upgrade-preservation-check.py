#!/usr/bin/env python3
"""Install two extension packages against private persistent synthetic settings.

This verifies ordinary --force package replacement, not the code loaded in an
existing desktop session. No user configuration or keyring is read.
Usage: python3 -I tools/upgrade-preservation-check.py OLD.zip NEW.zip
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess  # nosec B404: fixed local commands, no shell interpolation
import sys
import tempfile
import zipfile


def require(condition, message):
    # Verification remains active when Python runs with -O.
    if not condition:
        raise RuntimeError(message)


def executable(name):
    if name not in {'gnome-extensions', 'glib-compile-schemas', 'gsettings', 'dbus-run-session', 'bash'}:
        raise ValueError('Command is not allowlisted')
    path = shutil.which(name)
    if path is None:
        raise RuntimeError(f'Required local tool unavailable: {name}')
    return path


def run(*args, env):
    command = [executable(args[0]), *args[1:]]
    # Arguments are passed separately; package paths and synthetic values are data.
    return subprocess.check_output(command, env=env, text=True, stderr=subprocess.PIPE).strip()  # nosec B603


def fresh_shell(env, uuid, version, *, require_coordination=False):
    """Enable the installed ZIP in a new private bus, sharing only private settings."""
    probe_env = {**env, 'GAQ_UPGRADE_UUID': uuid, 'GAQ_UPGRADE_REQUIRE_COORDINATION': '1' if require_coordination else '0'}
    script = r'''
set -euo pipefail
export WAYLAND_DISPLAY="gaq-upgrade-$$"
gnome-shell --headless --wayland --unsafe-mode --wayland-display "$WAYLAND_DISPLAY" \
    --virtual-monitor 1280x800 >"$XDG_STATE_HOME/upgrade-shell.log" 2>&1 &
gaq_upgrade_shell=$!
trap 'kill "$gaq_upgrade_shell" 2>/dev/null || true; wait "$gaq_upgrade_shell" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
    if gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
        --method org.gnome.Shell.Extensions.ListExtensions >/dev/null 2>&1; then break; fi
    sleep 0.25
done
gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
    --method org.gnome.Shell.Extensions.EnableExtension "$GAQ_UPGRADE_UUID" >/dev/null
sleep 2
gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
    --method org.gnome.Shell.Extensions.GetExtensionInfo "$GAQ_UPGRADE_UUID"
if [ "$GAQ_UPGRADE_REQUIRE_COORDINATION" = 1 ]; then
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval \
        "(() => { const s = Main.panel.statusArea['$GAQ_UPGRADE_UUID']._extension._disconnectGate.snapshot(); return s.ready && !s.blocked; })()"
fi
'''
    completed = subprocess.run([executable('dbus-run-session'), '--', executable('bash'), '-c', script],  # nosec B603: fixed script; UUID passed via environment
                               env=probe_env, text=True, capture_output=True, timeout=50, check=True)
    require("'state': <1.0>" in completed.stdout and "'error': <''>" in completed.stdout, 'Installed extension did not enable')
    require(f"'version-name': <'{version}'>" in completed.stdout, 'Fresh Shell loaded the wrong package')
    if require_coordination:
        require("(true, 'true')" in completed.stdout.splitlines(),
                'Updated extension did not recover credential coordination in the new login session')
    log = (Path(env['XDG_STATE_HOME']) / 'upgrade-shell.log').read_text()
    require(not re.search(r'JS ERROR|Gjs-CRITICAL|already disposed', log), 'Installed extension logged a runtime failure')


def check(old, new):
    metadata = []
    for package in (old, new):
        with zipfile.ZipFile(package) as archive:
            metadata.append(json.loads(archive.read('metadata.json')))
    require(metadata[0]['uuid'] == metadata[1]['uuid'], 'Extension identity changed')
    require(metadata[0]['settings-schema'] == metadata[1]['settings-schema'], 'Schema identity changed')
    schema = metadata[1]['settings-schema']
    with tempfile.TemporaryDirectory(prefix='gaq-upgrade-') as scratch:
        base = Path(scratch)
        env = os.environ.copy()
        for name in ('CONFIG', 'DATA', 'CACHE', 'STATE', 'RUNTIME'):
            path = base / name.lower()
            path.mkdir(mode=0o700)
            env[f'XDG_{name}_HOME' if name != 'RUNTIME' else 'XDG_RUNTIME_DIR'] = str(path)
        env['GSETTINGS_BACKEND'] = 'keyfile'
        # gnome-extensions install performs local package replacement. Do not
        # grant it the real session bus or any parent credential sockets.
        for name in ('DBUS_SESSION_BUS_ADDRESS', 'GNOME_KEYRING_CONTROL', 'SSH_AUTH_SOCK', 'AT_SPI_BUS_ADDRESS'):
            env.pop(name, None)
        installed = base / 'data/gnome-shell/extensions' / metadata[1]['uuid']
        run('gnome-extensions', 'install', '--force', str(old.resolve()), env=env)
        env['GSETTINGS_SCHEMA_DIR'] = str(installed / 'schemas')
        run('glib-compile-schemas', '--strict', env['GSETTINGS_SCHEMA_DIR'], env=env)
        connector_id = 'claude--00000000-0000-4000-8000-000000000001'
        connectors = json.dumps({'version': 1, 'connectors': [
            {'id': connector_id, 'providerId': 'claude', 'label': 'Synthetic upgrade account', 'username': ''}]})
        sentinels = {
            'connectors': json.dumps(connectors), 'theme': "'cyberpunk'",
            'position': "'left'", 'bar-count': '2', 'color-scheme': "'dark'",
            'notifications-enabled': 'false', 'terms-acknowledged': "['claude']",
            'untracked-providers': f"['{connector_id}']", 'first-use-done': 'true',
            'data-source': "'demo'",
        }
        old_keys = set(run('gsettings', 'list-keys', schema, env=env).splitlines())
        popup_sentinels = {'popup-width': '600', 'popup-max-height': '700',
                           'popup-connector-order': f"['{connector_id}']",
                           'popup-hidden-connectors': f"['{connector_id}']"}
        sentinels.update({key: value for key, value in popup_sentinels.items() if key in old_keys})
        for key, value in sentinels.items():
            run('gsettings', 'set', schema, key, value, env=env)
        snapshot = {key: run('gsettings', 'get', schema, key, env=env) for key in sentinels}
        fresh_shell(env, metadata[0]['uuid'], metadata[0]['version-name'])
        # Configuration/cache/state live outside the replaceable extension tree.
        folders = [base / name / 'gnome-ai-quota' for name in ('config', 'cache', 'state')]
        markers = []
        for index, folder in enumerate(folders):
            folder.mkdir(exist_ok=True)
            marker = folder / 'synthetic-upgrade-sentinel.txt'
            marker.write_text(f'Synthetic owned state {index}\n')
            markers.append((marker, marker.read_bytes()))
        run('gnome-extensions', 'install', '--force', str(new.resolve()), env=env)
        run('glib-compile-schemas', '--strict', env['GSETTINGS_SCHEMA_DIR'], env=env)
        fresh_shell(env, metadata[1]['uuid'], metadata[1]['version-name'], require_coordination=True)
        after = {key: run('gsettings', 'get', schema, key, env=env) for key in sentinels}
        require(after == snapshot, f'Existing settings changed: {[key for key in snapshot if snapshot[key] != after[key]]}')
        require(all(path.read_bytes() == content for path, content in markers), 'Owned application data changed')
        if 'popup-width' not in old_keys:
            require(run('gsettings', 'get', schema, 'popup-width', env=env) == '0', 'Additive width default')
            require(run('gsettings', 'get', schema, 'popup-connector-order', env=env) == '@as []', 'Additive order default')
        # Existing values must survive ordinary reinstallation too.
        run('gsettings', 'set', schema, 'popup-width', '600', env=env)
        run('gsettings', 'set', schema, 'popup-connector-order', f"['{connector_id}']", env=env)
        run('gnome-extensions', 'install', '--force', str(new.resolve()), env=env)
        run('glib-compile-schemas', '--strict', env['GSETTINGS_SCHEMA_DIR'], env=env)
        require(run('gsettings', 'get', schema, 'popup-width', env=env) == '600', 'Custom width lost')
        require(connector_id in run('gsettings', 'get', schema, 'popup-connector-order', env=env), 'Custom order lost')
        # Roll back code only; retained settings must still be readable by the old schema.
        run('gnome-extensions', 'install', '--force', str(old.resolve()), env=env)
        run('glib-compile-schemas', '--strict', env['GSETTINGS_SCHEMA_DIR'], env=env)
        require({key: run('gsettings', 'get', schema, key, env=env) for key in sentinels} == snapshot, 'Rollback lost existing settings')
        run('gnome-extensions', 'install', '--force', str(new.resolve()), env=env)
        run('glib-compile-schemas', '--strict', env['GSETTINGS_SCHEMA_DIR'], env=env)
        require(run('gsettings', 'get', schema, 'popup-width', env=env) == '600', 'Rollback erased additive preferences')
    print('GAQ_UPGRADE_PRESERVATION_OK: ordinary install, reinstall and code rollback preserve synthetic identities/settings/data')
    print('Both installed packages enabled in fresh isolated Shell sessions with persistent private settings; no real keyring was inspected.')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    check(Path(sys.argv[1]), Path(sys.argv[2]))
