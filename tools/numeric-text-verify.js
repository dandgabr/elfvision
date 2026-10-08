(() => {
    const result = global.gaqNumericText;
    if (!result?.finished || result.error || result.destroyed !== 100)
        throw new Error(JSON.stringify(result));
    return `GAQ_NUMERIC_TEXT_OK: ${JSON.stringify(result)}`;
})()
