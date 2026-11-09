(() => {
    const result = global.gaqConnectorRefresh;
    if (!result?.finished || result.error || result.cases.join(',') !== 'synthetic-save-card-refresh,demo-codex,demo-openrouter')
        throw new Error(JSON.stringify(result));
    return `GAQ_CONNECTOR_REFRESH_OK: ${result.cases.join(', ')}; starts empty and Add connector opens Accounts`;
})()
