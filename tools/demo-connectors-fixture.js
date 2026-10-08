/* global GLib, Main */
// Explicit visual-test fixture. Product defaults and fresh-start probes stay empty.
(() => {
    const work = GLib.getenv('WORK');
    if (!work || GLib.getenv('GSETTINGS_BACKEND') !== 'memory' ||
        ['CONFIG', 'CACHE', 'STATE', 'DATA'].some(name => GLib.getenv(`XDG_${name}_HOME`) !== `${work}/${name.toLowerCase()}`) ||
        GLib.getenv('XDG_RUNTIME_DIR') !== `${work}/runtime`)
        throw new Error('demo fixture requires the isolated headless harness');
    const settings = Main.panel.statusArea['gnome-ai-quota@dandgabr.github.io']._settings;
    if (settings.get_string('data-source') !== 'demo') throw new Error('demo fixture requires synthetic mode');
    const providers = ['command-code', 'codex', 'claude', 'antigravity', 'example-credits'];
    settings.set_string('demo-connectors', JSON.stringify({version: 1,
        connectors: providers.map(providerId => ({id: providerId, providerId, label: '', username: ''}))}));
    settings.set_strv('demo-connected-connectors', providers);
    return 'GAQ_EXPLICIT_DEMO_FIXTURE';
})()
