// Number, money and time formatting. Uses Intl so output follows the locale,
// and has no GObject imports so it runs under `gjs -m` in the tests.

/**
 * Money with the shapes agreed for the UI: cents below 100, whole units from
 * 100 to 999, compact from 1000 (for example `$12.40`, `$124`, `$1.2K`).
 *
 * @param {number} amount
 * @param {string} currency - ISO 4217 code
 * @param {string} [locale]
 * @returns {string}
 */
export function formatMoney(amount, currency, locale) {
    const abs = Math.abs(amount);
    let options;
    if (abs >= 1000)
        options = {notation: 'compact', maximumFractionDigits: 1};
    else if (abs >= 100)
        options = {minimumFractionDigits: 0, maximumFractionDigits: 0};
    else
        options = {minimumFractionDigits: 2, maximumFractionDigits: 2};
    return new Intl.NumberFormat(locale, {style: 'currency', currency, ...options}).format(amount);
}

/**
 * Short duration: `2d 2h`, `1h 20min`, `47min`. Units are the same in every
 * language, only the sentence around them is translated.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
    const totalMin = Math.max(0, Math.round(ms / 60000));
    if (totalMin >= 1440) {
        let days = Math.floor(totalMin / 1440);
        let hours = Math.round((totalMin % 1440) / 60);
        if (hours === 24) {
            days += 1;
            hours = 0;
        }
        return hours ? `${days}d ${hours}h` : `${days}d`;
    }
    if (totalMin >= 60) {
        const hours = Math.floor(totalMin / 60);
        const min = totalMin % 60;
        return min ? `${hours}h ${min}min` : `${hours}h`;
    }
    return `${totalMin}min`;
}

/**
 * Clock time, with the weekday when the moment is a day or more away.
 *
 * @param {Date} date
 * @param {object} [options]
 * @param {boolean} [options.hour12] - 12-hour clock when true
 * @param {boolean} [options.weekday] - include the short weekday
 * @param {string} [options.locale]
 * @returns {string}
 */
export function formatClock(date, {hour12 = false, weekday = false, locale} = {}) {
    const options = {hour: '2-digit', minute: '2-digit', hour12};
    if (weekday)
        options.weekday = 'short';
    return new Intl.DateTimeFormat(locale, options).format(date).replace(/\./g, '');
}

/**
 * @param {number} value
 * @returns {string} the rounded percentage as an integer string
 */
export function formatPercent(value) {
    return String(Math.round(value));
}
