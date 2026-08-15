/**
 * Prism Pulse levels — rare power-node moments on the normal path.
 *
 * Every second chapter gets one Pulse level in its middle. Three cells are
 * marked as power nodes; completing those cells charges the shared meter and
 * the third node releases an aurora pulse. The puzzle rules never change —
 * the nodes only give players a satisfying route through the same solution.
 */

import { LEVEL_META } from './levels.js?v=5071259f5c9c';
import { isTreasureLevel } from './treasure.js?v=5071259f5c9c';

export const PULSE_FIRST_LEVEL = 14; // 0-based: first Pulse is level 15
export const PULSE_INTERVAL = 20;
export const PULSE_NODE_COUNT = 3;

// Mirrors game.js/treasure.js. Kept here so Pulse never stacks with Frost.
const FROST_MIN_LEVEL = 30;

/**
 * PRISM PULSE IS DISABLED — parked, not deleted.
 *
 * WHY. Of the four special types, Pulse cost the most player attention to
 * teach — power nodes on the board PLUS a 3-step HUD meter PLUS a coachmark —
 * and returned the least. It is also the type with the weakest tie to the
 * colour-mixing identity: Prism is the mix mechanic, Frost reorders how you
 * plan the mix, Treasure dresses a normal clear in gold. Pulse taught a
 * second, unrelated system that happened to sit on the same board.
 *
 * It is disabled rather than deleted because nothing about it is broken, and
 * because deleting it would mean a cloud-save migration: `pulseRewardsClaimed`
 * is in the durable field set (js/cloudSaveCore.js) and live installs carry it.
 * Dead code in the APK is a far cheaper price than migrating real save data.
 * If the level mix later wants a fourth special, it can come back intact.
 *
 * HOW TO RE-ENABLE. Delete the single `return false;` line below. That is the
 * whole change — the cadence lives in `matchesPulseCadence` and is untouched,
 * every consumer (game.js modifier, board.js nodes, the HUD meter, the
 * coachmark, the reward branch, the analytics tag) is still wired up and will
 * simply start firing again.
 *
 * Follows the same "parked, not deleted" convention as the commented-out Lab
 * tile in js/ui/screens.js.
 */
export const isPulseLevel = (idx) => {
    return false; // ← DELETE THIS ONE LINE TO RE-ENABLE PRISM PULSE
    return matchesPulseCadence(idx);
};

/**
 * The original Pulse cadence, intact and still exercised by
 * scripts/validate-premium-assets.mjs so the parked machinery cannot rot.
 * Nothing in the running game calls this while `isPulseLevel` returns false.
 */
export const matchesPulseCadence = (idx) => {
    if (!Number.isInteger(idx) || idx < PULSE_FIRST_LEVEL) return false;
    if ((idx - PULSE_FIRST_LEVEL) % PULSE_INTERVAL !== 0) return false;
    const meta = LEVEL_META[idx] || {};
    if (meta.kind === 'prism') return false;
    if (meta.tier === 'shape' && idx >= FROST_MIN_LEVEL) return false;
    if (isTreasureLevel(idx)) return false;
    return true;
};

/**
 * Three deterministic, well-separated nodes. The pattern rotates by chapter
 * so consecutive Pulse boards do not feel stamped from one template.
 */
export const getPulseTargets = (idx, dim) => {
    const size = Math.max(3, Number(dim) || 3);
    const patterns = [
        [[0.18, 0.22], [0.80, 0.34], [0.48, 0.80]],
        [[0.22, 0.76], [0.52, 0.18], [0.82, 0.72]],
        [[0.16, 0.48], [0.70, 0.18], [0.78, 0.82]],
    ];
    const pattern = patterns[Math.floor(idx / PULSE_INTERVAL) % patterns.length];
    const used = new Set();
    return pattern.map(([nx, ny], index) => {
        let gx = Math.max(0, Math.min(size - 1, Math.round(nx * (size - 1))));
        let gy = Math.max(0, Math.min(size - 1, Math.round(ny * (size - 1))));
        while (used.has(`${gx},${gy}`)) gx = (gx + 1) % size;
        used.add(`${gx},${gy}`);
        return { id: index + 1, gx, gy, charged: false };
    });
};

export const nextPulseIn = (fromIdx) => {
    for (let i = 0; i <= PULSE_INTERVAL * 2; i++) {
        if (isPulseLevel(fromIdx + i)) return i;
    }
    return -1;
};
