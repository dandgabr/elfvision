(() => {
    const result = global.gaqPopupPresentation;
    if (!result?.finished || result.error || result.cases.length !== 9)
        throw new Error(JSON.stringify(result));
    return `GAQ_POPUP_PRESENTATION_OK: ${result.cases.join(', ')}`;
})()
