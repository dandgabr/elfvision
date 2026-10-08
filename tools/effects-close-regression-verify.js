(() => {
    const result = global.gaqEffectsCloseRegression;
    if (!result?.finished || result.error || result.cases.length !== 4 ||
        result.cases.some(entry => !entry.closed || !entry.samples.length))
        throw new Error(JSON.stringify(result));
    return `GAQ_CLOSE_REGRESSION_OK: ${JSON.stringify(result)}`;
})()
