(() => {
    const result = global.gaqEffectsBenchmark;
    if (!result?.finished || result.error || result.inventory.length !== 22 || result.measurements.length !== 3)
        throw new Error(JSON.stringify(result));
    return JSON.stringify(result);
})()
