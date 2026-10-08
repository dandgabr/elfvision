(() => {
    const result = global.gaqEffectsBenchmark;
    if (!result?.finished || result.error || result.inventory.length !== 22 ||
        result.inventory.some(theme => theme.combinations !== 12) ||
        result.measurements.length !== (result.mode === 'resources' ? 0 : 3))
        throw new Error(JSON.stringify(result));
    return JSON.stringify(result);
})()
