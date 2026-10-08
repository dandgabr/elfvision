(() => {
    const result = global.gaqEffectsVisual;
    if (!result?.finished || result.error || result.screenshots.length !== 9)
        throw new Error(JSON.stringify(result));
    return JSON.stringify(result);
})()
