import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// ponytail: Only the login user state needed by headless shell is emulated.
const bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
const manager = Gio.DBusExportedObject.wrapJSObject(`<node><interface name="org.freedesktop.login1.Manager"><method name="GetUser"><arg type="u" direction="in"/><arg type="o" direction="out"/></method><method name="GetUserByPID"><arg type="u" direction="in"/><arg type="o" direction="out"/></method></interface></node>`, {
    GetUser() { return '/org/freedesktop/login1/user/test'; },
    GetUserByPID() { return '/org/freedesktop/login1/user/test'; },
});
const user = Gio.DBusExportedObject.wrapJSObject(`<node><interface name="org.freedesktop.login1.User"><property name="Sessions" type="a(so)" access="read"/><property name="Display" type="(so)" access="read"/></interface></node>`, {
    get Sessions() { return []; },
    get Display() { return ['', '/']; },
});
manager.export(bus, '/org/freedesktop/login1');
user.export(bus, '/org/freedesktop/login1/user/test');
const result = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'RequestName', new GLib.Variant('(su)', ['org.freedesktop.login1', 0]), new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, -1, null).deep_unpack()[0];
if (result !== 1) throw new Error('Cannot own private login service');
const session = Gio.bus_get_sync(Gio.BusType.SESSION, null);
const calendar = Gio.DBusExportedObject.wrapJSObject(`<node><interface name="org.gnome.Shell.CalendarServer"><method name="SetTimeRange"><arg type="x" direction="in"/><arg type="x" direction="in"/><arg type="b" direction="in"/></method><property name="HasCalendars" type="b" access="read"/></interface></node>`, {
    SetTimeRange() {},
    get HasCalendars() { return false; },
});
calendar.export(session, '/org/gnome/Shell/CalendarServer');
const calendarResult = session.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'RequestName', new GLib.Variant('(su)', ['org.gnome.Shell.CalendarServer', 0]), new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, -1, null).deep_unpack()[0];
if (calendarResult !== 1) throw new Error('Cannot own private calendar service');
new GLib.MainLoop(null, false).run();
