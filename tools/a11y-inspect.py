#!/usr/bin/env python3
"""Private-session AT-SPI metadata and virtual-keyboard evidence; never human/Orca certification."""
import gi
import json
import os
from pathlib import Path
# Fixed executable argv; never shell execution.
import subprocess  # nosec B404
import time

gi.require_version('Atspi', '2.0')
from gi.repository import Atspi, Gio, GLib

root = Path(__file__).resolve().parents[1]
folder = root / '.superpowers/sdd/2026-10-07-open-items'
folder.mkdir(mode=0o700, parents=True, exist_ok=True)
result = {'finished': False, 'error': '', 'focused': [], 'controls': []}
app = None
registry = None

def walk(node, depth=0):
    if depth > 40:
        return
    yield node
    for index in range(min(node.get_child_count(), 250)):
        child = node.get_child_at_index(index)
        if child:
            yield from walk(child, depth + 1)

def nodes():
    context = GLib.MainContext.default()
    while context.pending(): context.iteration(False)
    return list(walk(Atspi.get_desktop(0)))

def focus_names():
    return [node.get_name() for node in nodes() if node.get_state_set().contains(Atspi.StateType.FOCUSED)]

def shell_eval(code):
    # Trusted probe-generated code passed as one argv item; never a shell command.
    reply = subprocess.run(['/usr/bin/gdbus', 'call', '--session', '--dest', 'org.gnome.Shell', '--object-path', '/org/gnome/Shell', '--method', 'org.gnome.Shell.Eval', code], capture_output=True, text=True, timeout=5)  # nosec B603
    if reply.returncode or '(true,' not in reply.stdout:
        raise RuntimeError('Private Shell Eval failed: ' + reply.stdout)
    return reply.stdout

def key(symbol):
    if symbol not in {'space', 'Escape', 'Tab', 'ISO_Left_Tab', 'Return'}:
        raise ValueError('Untrusted virtual key symbol')
    code = f"global.gaqA11yKeyboard.notify_keyval(GLib.get_monotonic_time(), imports.gi.Clutter.KEY_{symbol}, imports.gi.Clutter.KeyState.PRESSED); global.gaqA11yKeyboard.notify_keyval(GLib.get_monotonic_time(), imports.gi.Clutter.KEY_{symbol}, imports.gi.Clutter.KeyState.RELEASED); true"
    reply = subprocess.run(['/usr/bin/gdbus', 'call', '--session', '--dest', 'org.gnome.Shell', '--object-path', '/org/gnome/Shell', '--method', 'org.gnome.Shell.Eval', code], capture_output=True, text=True, timeout=5)  # nosec B603
    if reply.returncode or '(true,' not in reply.stdout:
        raise RuntimeError('Private virtual keyboard failed')
    time.sleep(.07)

try:
    address = Gio.bus_get_sync(Gio.BusType.SESSION, None).call_sync('org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus', 'GetAddress', None, None, Gio.DBusCallFlags.NONE, 5000, None).unpack()[0]
    os.environ['AT_SPI_BUS_ADDRESS'] = address
    # Fixed registry executable and private environment; shell=False.
    registry = subprocess.Popen(['/usr/libexec/at-spi2-registryd'], env=os.environ.copy(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # nosec B603
    time.sleep(.4)
    Atspi.init()
    shell_eval("global.gaqA11yIndicator=Object.values(Main.panel.statusArea).find(a=>a._extension?._themes); global.gaqA11yIndicator.menu.open(false); global.gaqA11yIndicator._legendButton.grab_key_focus(); true")
    time.sleep(.4)
    result['shellControls'] = [{'name': node.get_name(), 'role': node.get_role_name(), 'focusable': node.get_state_set().contains(Atspi.StateType.FOCUSABLE)} for node in nodes() if node.get_name() in ['Refresh', 'Preferences', 'Help', 'Legend']]
    key('space')
    shell_eval("if(!global.gaqA11yIndicator._legend.visible)throw Error('Space did not open legend'); true")
    key('Escape')
    shell_eval("if(global.gaqA11yIndicator._legend.visible||!global.gaqA11yIndicator.menu.isOpen)throw Error('First Escape'); true")
    key('Escape')
    shell_eval("if(global.gaqA11yIndicator.menu.isOpen)throw Error('Second Escape'); true")
    result['shellKeyboard'] = ['Space opens legend', 'first Escape hides legend', 'second Escape closes popup']
    env = os.environ.copy()
    env['GTK_A11Y'] = 'atspi'
    env['GI_TYPELIB_PATH'] = '/usr/lib64/gnome-shell/girepository-1.0' + (':' + env['GI_TYPELIB_PATH'] if env.get('GI_TYPELIB_PATH') else '')
    # Repository-owned test entrypoint and fixed interpreter; shell=False.
    app = subprocess.Popen(['/usr/bin/gjs', '-m', str(root / 'tools/a11y-prefs-window.js')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)  # nosec B603
    for _ in range(80):
        time.sleep(.1)
        if any(node.get_name() == 'Quota Automated Accessibility' for node in nodes()):
            break
    else:
        raise RuntimeError('Private prefs accessible window absent; app status=' + str(app.poll()) + '; tree=' + json.dumps([(n.get_name(),n.get_role_name()) for n in nodes()][:50]) + ('; stderr='+app.stderr.read() if app.poll() is not None else ''))
    shell_eval("const w=global.get_window_actors().find(a=>a.meta_window.get_title()==='Quota Automated Accessibility')?.meta_window; if(!w)throw Error('Private GTK MetaWindow absent');Main.activateWindow(w, Math.floor(GLib.get_monotonic_time()/1000)); true")
    time.sleep(.3)
    shell_eval("global.gaqA11yKeyboard.notify_keyval(GLib.get_monotonic_time(), imports.gi.Clutter.KEY_Alt_L, imports.gi.Clutter.KeyState.PRESSED); global.gaqA11yKeyboard.notify_keyval(GLib.get_monotonic_time(), imports.gi.Clutter.KEY_Tab, imports.gi.Clutter.KeyState.PRESSED);global.gaqA11yKeyboard.notify_keyval(GLib.get_monotonic_time(), imports.gi.Clutter.KEY_Tab, imports.gi.Clutter.KeyState.RELEASED);global.gaqA11yKeyboard.notify_keyval(GLib.get_monotonic_time(), imports.gi.Clutter.KEY_Alt_L, imports.gi.Clutter.KeyState.RELEASED); true")
    time.sleep(.3)
    for _ in range(25):
        key('Tab')
        result['focused'].append(focus_names())
        if (folder/'a11y-gtk-focus.json').exists(): result.setdefault('gtkFocused',[]).append(json.loads((folder/'a11y-gtk-focus.json').read_text()))
    distinct = {name for names in result['focused'] for name in names if name}
    result['gtkDistinct'] = sorted({entry['name'] for entry in result.get('gtkFocused', []) if entry['name'] and entry['active'] and entry['keys'] > 0})
    if len(distinct) < 4 and len(result['gtkDistinct']) < 4:
        result['keyboardTraversalIncomplete'] = True
    for _ in range(5):
        key('ISO_Left_Tab')
    result['reverseFocus'] = focus_names()
    for node in nodes():
        name = node.get_name()
        if name in ['Notifications', 'Effects', 'Transparency', 'Material', 'Warning notification', 'Critical threshold', 'Warning threshold', 'Install suggested fonts…', 'Disconnect all accounts…']:
            result['controls'].append({'name': name, 'role': node.get_role_name(), 'enabled': node.get_state_set().contains(Atspi.StateType.ENABLED), 'focusable': node.get_state_set().contains(Atspi.StateType.FOCUSABLE)})
    if not result['controls']:
        raise RuntimeError('New preferences controls lack accessible metadata')
    # Actual virtual Enter opens only the review; Escape cancels before any download consent.
    reviews = [node for node in nodes() if node.get_name() == 'Review…' and node.get_state_set().contains(Atspi.StateType.SHOWING)]
    if reviews:
        if not reviews[0].get_component_iface().grab_focus():
            raise RuntimeError('Font review button cannot receive keyboard focus')
        key('Return')
        time.sleep(.3)
        names = {node.get_name() for node in nodes()}
        if 'Install suggested fonts?' not in names or 'Download and install' not in names or 'Cancel' not in names:
            raise RuntimeError('Font consent dialog lacks accessible heading/actions')
        result['fontConsent'] = {'openedBy': 'virtual Enter', 'focused': focus_names(), 'cancelPresent': True}
        key('Escape')
        time.sleep(.2)
        if any(node.get_name() == 'Download and install' and node.get_state_set().contains(Atspi.StateType.SHOWING) for node in nodes()):
            raise RuntimeError('Escape did not cancel font consent')
        result['fontConsent']['cancelledBy'] = 'virtual Escape before consent'
    if result.get('keyboardTraversalIncomplete'):
        raise RuntimeError('Tab traversal did not reach four named accessible targets; GTK=' + json.dumps(result.get('gtkFocused', [])))
    result['finished'] = True
except Exception as error:
    result['error'] = str(error)
finally:
    if registry:
        registry.terminate()
        registry.wait(timeout=5)
    if app:
        app.terminate()
        try:
            app.wait(timeout=5)
        except subprocess.TimeoutExpired:
            app.kill()
            app.wait(timeout=5)
    (folder / 'a11y-evidence.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
raise SystemExit(bool(result['error']))
