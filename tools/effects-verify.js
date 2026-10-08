(() => {
    const result = global.gaqEffectsResult;
    if (!result?.finished || result.error || !result.cases.length)
        throw new Error(JSON.stringify(result));
    return `GAQ_EFFECTS_OK: ${result.cases.join(', ')} ${JSON.stringify(result)}`;
})()
