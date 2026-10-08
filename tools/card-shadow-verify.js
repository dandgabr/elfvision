(() => {
    const result = global.gaqCardShadow;
    if (!result?.finished || result.error || result.cases.length !== 2)
        throw new Error(JSON.stringify(result));
    return `GAQ_CARD_SHADOW_OK: ${JSON.stringify(result)}`;
})()
