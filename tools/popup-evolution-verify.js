(() => {
    const result = global.gaqPopupEvolution;
    const expected = GLib.getenv('GAQ_CAPTURE_THEME') ? 7 : 154;
    if (!result?.finished || result.error || result.captures.length !== expected)
        throw new Error(JSON.stringify(result));
    return `GAQ_POPUP_EVOLUTION_OK: ${result.captures.length} native captures`;
})()
