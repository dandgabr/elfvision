// Launch actual AT-SPI inspection/virtual-keyboard traversal on the private test bus only.
(async () => {
    const {default: Gio} = await import('gi://Gio');
    const {default: Clutter} = await import('gi://Clutter');
    global.gaqA11yKeyboard = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const indicator = Object.values(Main.panel.statusArea).find(actor => actor._extension?._themes);
    global.gaqA11y = {finished: false, error: ''};
    Main.overview.hide();
    Main.welcomeDialog?.close();
    if (indicator?._settings.get_string('data-source') !== 'demo') {
        global.gaqA11y = {finished: true, error: 'Private demo only'};
        return;
    }
    const process = Gio.Subprocess.new(['python3', `${indicator._extension.path}/tools/a11y-inspect.py`], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    process.communicate_utf8_async(null, null, (_process, response) => {
        try {
            const [, stdout, stderr] = process.communicate_utf8_finish(response);
            global.gaqA11y = {finished: true, success: process.get_successful(), evidence: stdout, error: process.get_successful() ? '' : stderr || stdout};
        } catch (error) { global.gaqA11y = {finished: true, error: error.message}; }
    });
})()
