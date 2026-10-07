// Coordinates for the manually positioned meter children; mirror whole rectangles in RTL.
export function meterGeometry(width, percent, pace, tickWidth = 2, rtl = false) {
    const used = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    const fillWidth = used > 0 ? Math.min(width, Math.max(2, Math.round(width * used / 100))) : 0;
    const ltrTick = pace === null ? null : Math.round(width * Math.max(1, Math.min(99, pace)) / 100) - tickWidth / 2;
    return {fillWidth, fillX: rtl ? width - fillWidth : 0,
        tickX: ltrTick === null ? null : rtl ? width - ltrTick - tickWidth : ltrTick};
}
