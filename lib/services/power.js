// Tells the extension when the computer wakes up (docs/adr/0010). Timers use the monotonic clock,
// which stops during suspend, so after a resume every poll is late at once and the data looks old:
// the alerts keep quiet for a while and the providers are asked again once the network is back.

import Gio from 'gi://Gio';

const LOGIN1 = {name: 'org.freedesktop.login1', path: '/org/freedesktop/login1', iface: 'org.freedesktop.login1.Manager'};

export class PowerWatcher {
    /**
     * @param {object} options
     * @param {() => void} options.onResume - called when the computer wakes up
     * @param {() => void} [options.onSuspend]
     * @param {() => Promise<object>} [options.bus] - the system bus (replaced in tests)
     */
    constructor({onResume, onSuspend = () => {}, bus = () => new Promise((resolve, reject) =>
        Gio.bus_get(Gio.BusType.SYSTEM, null, (_source, result) => {
            try {
                resolve(Gio.bus_get_finish(result));
            } catch (error) {
                reject(error);
            }
        }))}) {
        this._onResume = onResume;
        this._onSuspend = onSuspend;
        this._bus = bus;
        this._connection = null;
        this._subscription = 0;
        this._generation = 0;
    }

    async start() {
        const generation = ++this._generation;
        try {
            const connection = await this._bus();
            if (generation !== this._generation)
                return;   // stopped while the bus was being reached
            this._connection = connection;
            this._subscription = connection.signal_subscribe(LOGIN1.name, LOGIN1.iface, 'PrepareForSleep', LOGIN1.path,
                null, Gio.DBusSignalFlags.NONE, (_connection, _sender, _path, _iface, _signal, parameters) => {
                    const [sleeping] = parameters.deepUnpack();
                    try {
                        if (sleeping)
                            this._onSuspend();
                        else
                            this._onResume();
                    } catch (error) {
                        console.error(`Elfvision: a power handler failed: ${error?.message ?? error}`);
                    }
                });
        } catch (error) {
            // Without the system bus nothing breaks; a wake-up is then simply not noticed.
            console.warn(`Elfvision: cannot watch for suspend: ${error?.message ?? error}`);
        }
    }

    stop() {
        this._generation++;
        if (this._connection && this._subscription)
            this._connection.signal_unsubscribe(this._subscription);
        this._connection = null;
        this._subscription = 0;
    }
}
