(() => {
    const result = global.gaqProviderReports;
    if (!result?.finished || result.error || result.cases.length !== 4)
        throw new Error(JSON.stringify(result));
    return `GAQ_PROVIDER_REPORTS_OK: ${result.cases.join(', ')}; empty demo remains empty`;
})()
