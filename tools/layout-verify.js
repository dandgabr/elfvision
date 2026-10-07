(() => {
    const result = global.gaqLayoutResult;
    if (!result?.finished || result.error || result.cases.length !== 8 || !(result.labels > 0) || !(result.actions > 0))
        throw new Error(JSON.stringify(result));
    return `GAQ_LAYOUT_OK: ${result.cases.join(', ')}`;
})()
