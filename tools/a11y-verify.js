(() => {
    if (!global.gaqA11y?.finished || !global.gaqA11y.success || global.gaqA11y.error)
        throw new Error(JSON.stringify(global.gaqA11y));
    global.gaqA11yKeyboard = null;
    return `GAQ_A11Y_OK: ${global.gaqA11y.evidence}`;
})()
