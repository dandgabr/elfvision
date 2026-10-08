(() => {
    const result = global.gaqEffectsLifecycle;
    if (!result?.finished || result.error || result.cycles !== 100)
        throw new Error(JSON.stringify(result));
    return `GAQ_EFFECTS_LIFECYCLE_OK: ${JSON.stringify(result)}`;
})()
