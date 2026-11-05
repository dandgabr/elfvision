(() => {
    const result = global.gaqSyntheticOAuth;
    if (!result?.finished || result.error || result.cases.join(',') !== 'live-oauth')
        throw new Error(JSON.stringify(result));
    return 'GAQ_SYNTHETIC_OAUTH_OK';
})()
