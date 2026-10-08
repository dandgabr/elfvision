(() => {
    const result = global.gaqMonitorEffects;
    if (!result?.finished || result.error || result.cases.length !== 4 || result.configuredScale !== 1.25 || !result.monitors.some(m => m.x > 0))
        throw new Error(JSON.stringify(result));
    if (result.cases.some(item => item.captures.some(capture => capture.popup[2] < 200 || capture.popup[3] < 100)))
        throw new Error('Collapsed transformed popup viewport');
    return `GAQ_MONITOR_EFFECTS_OK: ${JSON.stringify(result)}`;
})()
