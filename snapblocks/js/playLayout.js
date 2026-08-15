/** Shared logical geometry for gameplay and the CrazyGames landscape shell. */

import { CRAZYGAMES_LANDSCAPE } from './platform/runtime.js?v=5071259f5c9c';

export const LOGICAL_SIZE = Object.freeze(CRAZYGAMES_LANDSCAPE
    ? { w: 760, h: 520 }
    : { w: 400, h: 700 });

export const BOARD_LAYOUT = Object.freeze({
    x: CRAZYGAMES_LANDSCAPE ? 60 : 50,
    y: CRAZYGAMES_LANDSCAPE ? 110 : 124,
    size: 300,
    cardPad: 6,
});

export const TRAY_LAYOUT = Object.freeze(CRAZYGAMES_LANDSCAPE ? {
    shell: { x: 410, y: 100, w: 340, h: 320 },
    left: 430,
    top: 122,
    right: 730,
    bottom: 398,
    gap: 10,
} : {
    shell: { x: 28, y: 460, w: 344, h: 180 },
    left: 42,
    top: 474,
    right: 358,
    bottom: 624,
    gap: 6,
});

// Pieces can reach every board cell and every tray slot, but not drift into
// the unused lower strip of the landscape canvas.
export const DRAG_BOUNDS = Object.freeze({
    left: 5,
    top: 5,
    right: LOGICAL_SIZE.w - 5,
    bottom: CRAZYGAMES_LANDSCAPE
        ? Math.max(BOARD_LAYOUT.y + BOARD_LAYOUT.size, TRAY_LAYOUT.bottom) + 8
        : TRAY_LAYOUT.bottom,
});
