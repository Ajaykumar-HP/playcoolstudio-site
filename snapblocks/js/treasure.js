/**
 * Treasure levels — recurring golden levels on the main path.
 *
 * Every ~9 levels one ordinary level becomes a Treasure level: same puzzle
 * mechanics, golden presentation, and a guaranteed coin-chest bonus on first
 * clear. The point is anticipation — "treasure in 2 levels" is a reason to
 * play one more — mirroring how casual hits pace special levels between
 * normal ones. Derived purely from the level index (no authored lists,
 * matching how chapters/frost/prism derive).
 *
 * A level already claimed by another special moment keeps it: Prism
 * challenges and Frost levels are never also treasure. The last level of a
 * chapter is excluded too, for an economic reason rather than a rule conflict:
 * that clear already pays REWARD_CHAPTER_RESTORE, and a chest on top of it is
 * the biggest coin spike the pack can produce.
 *
 * That last rule is currently redundant — the generator makes every chapter
 * finale a 'prism-finale' Prism Challenge, so the prism check above already
 * excludes all 100 of them, and this filter removes zero levels today. It is
 * kept as an explicit invariant: the no-collision property should not depend
 * on a generator convention that a future pack rebuild could quietly drop.
 */

import { LEVEL_META, CHAPTER_SIZE } from './levels.js?v=3bd14eb0045c';

export const TREASURE_INTERVAL = 9;

// Mirrors game.js FROST_MIN_LEVEL — frost begins on shape-tier from here.
const FROST_MIN_LEVEL = 30;

export const isTreasureLevel = (idx) => {
    if (!Number.isInteger(idx) || idx < 6 || idx % TREASURE_INTERVAL !== 6) return false;
    const meta = LEVEL_META[idx] || {};
    if (meta.kind === 'prism') return false;
    if (meta.tier === 'shape' && idx >= FROST_MIN_LEVEL) return false;
    // Chapter finale — that clear already pays the place-restored bonus.
    if (idx % CHAPTER_SIZE === CHAPTER_SIZE - 1) return false;
    return true;
};

/**
 * Levels until the next treasure at or after `fromIdx` (0 = fromIdx itself
 * is one). Returns -1 when none is within the search window (end of pack).
 *
 * Window is three intervals, not two. The largest real gap between treasure
 * levels in the shipped pack is 18 (a single skipped slot, e.g. after idx 33),
 * which the old two-interval window met exactly — no headroom. One more
 * skipped slot anywhere would push the next treasure 27 levels out and make
 * this return -1, silently dropping the "treasure in N levels" nudge.
 */
export const nextTreasureIn = (fromIdx) => {
    for (let i = 0; i <= TREASURE_INTERVAL * 3; i++) {
        if (isTreasureLevel(fromIdx + i)) return i;
    }
    return -1;
};
