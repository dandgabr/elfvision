(() => {
    const result = global.gaqEffectsCold;
    if (!result?.finished || result.error || result.cases.length !== 5 || result.cases.some(c => !c.focus || c.valid.some(v => !v) || c.sizes.some(([w,h]) => w < 200 || h < 100)))
        throw new Error(JSON.stringify(result));
    return `GAQ_COLD_OK: ${JSON.stringify(result)}`;
})()
