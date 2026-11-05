// Empty, in-memory Secret Service for startup only; no credential storage.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const xml = `<node><interface name="org.freedesktop.Secret.Service">
<method name="SearchItems"><arg type="a{ss}" direction="in"/><arg type="ao" direction="out"/><arg type="ao" direction="out"/></method>
<method name="ReadAlias"><arg type="s" direction="in"/><arg type="o" direction="out"/></method>
<property name="Collections" type="ao" access="read"/>
</interface></node>`;
const service = Gio.DBusExportedObject.wrapJSObject(xml, {
    get Collections() { return []; },
    SearchItems() { return [[], []]; },
    ReadAlias() { return '/'; },
});
const loop = new GLib.MainLoop(null, false);
Gio.bus_own_name(Gio.BusType.SESSION, 'org.freedesktop.secrets', Gio.BusNameOwnerFlags.NONE,
    connection => service.export(connection, '/org/freedesktop/secrets'),
    () => print('READY'), () => { printerr('Secret Service ownership lost'); loop.quit(); });
loop.run();
