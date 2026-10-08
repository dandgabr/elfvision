(() => {
    const result = global.gaqEffectsInventory;
    if (!result?.finished || result.error || result.captures.length !== 44)
        throw new Error(JSON.stringify(result));
    return 'GAQ_EFFECTS_INVENTORY_OK: 22 light +22 dark native captures';
})()
