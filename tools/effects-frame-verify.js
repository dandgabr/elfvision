(() => {
    const result = global.gaqFrameProfile;
    if (!result?.finished || result.error || result.measurements.length !== 4 ||
        result.measurements.some(sample => sample.sampleCount < 1000) ||
        result.budgets.some(budget => !budget.p95Below60HzBudget || !budget.p95AddedWithin2Ms))
        throw new Error(JSON.stringify(result));
    return `GAQ_FRAME_PROFILE_OK: ${JSON.stringify(result.budgets)}`;
})()
