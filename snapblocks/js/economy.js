/**
 * Economy — the single soft currency (coins).
 *
 * Replaces the old per-hint counter. Coins are earned (level rewards, daily,
 * Prism clears, rewarded ads) and spent on helps:
 *   - Hint        — 10 coins — the progressive "where does this go" reveal
 *   - Solve piece — 20 coins — auto-places one correct piece for you
 *
 * 10 coins == 1 old hint, so existing saves migrate 1:1 in value (see
 * state.js loadConfig). Keeping the ratio means every prior balance and reward
 * carries over without players losing or gaining help.
 *
 * All mutations go through here so grants/spends stay consistent and persist.
 */

import state, { saveConfig } from './state.js?v=3bd14eb0045c';

export const COINS_PER_HINT = 10;

// Spend cost — a single progressive hint.
export const HINT_COST = 10;

// Spend cost — auto-place one correct piece (the deeper "I'm stuck" help).
// Priced at 2 hints: the game does the work for you, so it costs more than
// being pointed in the right direction.
export const SOLVE_COST = 20;

// Starting balance for a brand-new player — 40 coins (= 4 hints). Generous
// enough to learn the game without feeling stuck, low enough that the rewarded
// "out of coins" path still becomes reachable within the first sessions.
export const STARTING_COINS = 40;

// Reward grants (coin values). Each is the old hint reward × COINS_PER_HINT.
export const REWARD_TUTORIAL = 20;   // was +2 hints
export const REWARD_DAILY = 20;      // was +2 hints
export const REWARD_PRISM = 10;      // was +1 hint
export const REWARD_AD = 10;         // one rewarded ad = 1 hint's worth
export const REWARD_CLEAN_CLEAR = 10;
// Treasure level first-clear coin chest. Held at one hint's worth (10) so the
// golden level reads as a treat without out-paying the rewarded ad — treasure
// recurs every ~9 levels, so it is a frequent faucet, not a rare one.
export const REWARD_TREASURE = 10;
export const REWARD_PULSE = 15;     // rare three-node Prism Pulse first clear

// --- Play-earned faucet ---------------------------------------------------
// Every FIRST clear of a level grants a token amount, scaled by stars. Replays
// grant nothing — no grind faucet.
//
// These are 1/2/3, DOWN from 2/3/5, and the low values are deliberate — do not
// "fix" them back. At 10 levels per chapter this drip is multiplied by 10, so
// it was quietly the single largest faucet in the game: at 2/3/5 it paid 50
// coins per chapter, about half of ALL level-attributed income, more than the
// chapter-restore bonus and every Prism reward in that chapter combined. That
// is why coins piled up faster than the two sinks (hint 10, solve 20) could
// ever drain them.
//
// The relationship to the rewarded ad has changed character as a result. This
// is no longer "a small but real contribution toward a hint" — a 3-star clear
// is now worth under a third of a hint, and a full chapter of perfect play
// funds three hints. The drip's job is now purely to ACKNOWLEDGE progress so
// the coin chip ticks on a first clear; the meaningful ways to fund help are
// the rewarded ad (10), chapter restores (15) and Today's Goals. If this ever
// needs to move again, move it by 1 and re-run the per-chapter audit — a
// single point here is worth 10 coins a chapter.
export const REWARD_FIRST_CLEAR_BY_STARS = { 1: 1, 2: 2, 3: 3 };
export const firstClearReward = (stars) => REWARD_FIRST_CLEAR_BY_STARS[stars] || 1;

// Fully restoring a place (10th clear in a chapter) is the biggest single
// level-attributed grant in the loop — but it fires every 10 levels, so at 25
// it alone out-earned a whole chapter's spending. 15 keeps it clearly the
// largest per-level reward (1.5 hints) while leaving the chapter net roughly
// break-even against a player who takes a hint or two along the way.
export const REWARD_CHAPTER_RESTORE = 15;

// --- Per-clear ceiling ----------------------------------------------------
// Guard rail. Five independent level-attributed rewards can fire on one clear
// (first-clear drip, chapter restore, treasure chest, Prism, Prism Pulse) and
// nothing else coordinated them. Worst verified case was every chapter finale
// (idx 9, 19, ... 999): first clear 5 + chapter restore 25 + Prism 10 = 40 in
// one clear, 95 once that day's goals (35) and a streak milestone (20) landed
// on the same tap — against a competent player's 20-30 spend across a WHOLE
// chapter. game.js now folds all five into one bundle and grants it through
// this ceiling, so a sixth reward added later cannot silently rebuild it.
//
// Why 35 and not a tighter number. The largest LEGITIMATE bundle today is 28
// (chapter finale: drip 3 + restore 15 + Prism 10; verified across all 1000
// levels). A ceiling has to sit far enough above that to do two jobs at once:
//   - leave headroom, so a future reward worth up to +7 lands intact and is
//     visible instead of being silently swallowed by the cap. A cap of 30 sat
//     2 coins above the max and would have eaten almost any addition whole.
//   - still bite on a regression: restoring REWARD_CHAPTER_RESTORE to 25 puts
//     a finale at 38, and a full revert to the old constants puts it at 40 —
//     both trimmed here, with earned.capped set so it is observable rather
//     than silent. Note a cap of 40 would NOT have caught the original spike
//     at all, which is why the ceiling must stay below it.
// 35 == 3.5 hints, and roughly 44% of a chapter's entire level-attributed
// income (~80), so it is a real hard ceiling and not a formality. It trims
// nothing today by design — a guard rail that is already load-bearing is a
// balance bug, not a guard rail.
//
// Day-scoped grants (Today's Goals, streak milestones, the Daily reward) sit
// OUTSIDE this ceiling on purpose: they are paid per day, not per level, and
// clamping them here would silently delete a goal the player actually finished.
export const MAX_LEVEL_CLEAR_COINS = 35;

// Streak milestone bonuses — paid once per milestone per streak run (see
// progression.js checkInPlay). Day counts mirror the "Next streak" milestones
// already shown on the Daily screen.
export const STREAK_MILESTONES = { 3: 10, 5: 15, 7: 20, 14: 30, 30: 50 };

export const getCoins = () => state.config.coins || 0;
export const canAfford = (n) => getCoins() >= n;

export const addCoins = (n) => {
    state.config.coins = Math.max(0, (state.config.coins || 0) + n);
    saveConfig();
    return state.config.coins;
};

/** Returns true and deducts if affordable; false (no change) otherwise. */
export const spendCoins = (n) => {
    if (!canAfford(n)) return false;
    state.config.coins -= n;
    saveConfig();
    return true;
};
