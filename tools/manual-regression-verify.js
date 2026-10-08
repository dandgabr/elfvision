(() => {
    const result = global.gaqManualRegression;
    if (!result?.finished || result.error || result.toggles.length !== 4 ||
        result.toggles.some((toggle, cycle) => toggle.frames.length !== 20 ||
            toggle.frames.some(frame => !frame.attrs?.includes('tnum=1') || frame.open !== (cycle % 2 === 0))))
        throw new Error(JSON.stringify(result));
    return `GAQ_NUMERIC_POINTER_OK: ${result.scheme}/${result.mode}; four clicks, 80 feature samples`;
})()
