(() => {
    const result = global.gaqIndicatorResult;
    if (!result?.finished || result.error || result.cases.length !== 6)
        throw new Error(JSON.stringify(result));
    return `GAQ_INDICATOR_OK: ${result.cases.join(', ')}`;
})()
