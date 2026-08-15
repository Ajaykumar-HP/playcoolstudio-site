/**
 * Progression — daily streak, per-level stars, and trophy unlocks.
 *
 * This module is the single place where persistent player progress gets
 * mutated. game.js and ui/index.js call into it; they never touch
 * config.streak / trophies / levelStars directly. All mutations persist
 * via saveConfig.
 */

import state, { saveConfig } from './state.js?v=5071259f5c9c';
import { addCoins, STREAK_MILESTONES } from './economy.js?v=5071259f5c9c';

// Start of local day (ms epoch). Makes "is today a new day?" comparisons cheap.
const dayStartMs = (ts) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

const ONE_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

/**
 * Call after any level is cleared. If the player hasn't played today yet,
 * increment the streak (or reset to 1 if they skipped a day). Returns the
 * streak value after the check-in.
 */
export const checkInPlay = () => {
    const now = Date.now();
    const cfg = state.config;
    const today = dayStartMs(now);
    const last = dayStartMs(cfg.lastDailyTs || 0);

    if (!cfg.lastDailyTs) {
        cfg.streak = 1;
        cfg.streakMilestoneClaimed = 0;
    } else if (today === last) {
        // Already counted today; nothing to do
    } else if (today - last <= ONE_DAY) {
        cfg.streak = (cfg.streak || 0) + 1;
    } else {
        // Missed a day — streak resets, and milestones become earnable again
        cfg.streak = 1;
        cfg.streakMilestoneClaimed = 0;
    }

    // Streak milestones pay a one-time coin bonus per streak run. Granted
    // right here so both the normal-clear and daily-clear paths hit it; the
    // complete screen reads state.streakMilestoneReward to celebrate it.
    const milestoneCoins = STREAK_MILESTONES[cfg.streak];
    if (milestoneCoins && (cfg.streakMilestoneClaimed || 0) < cfg.streak) {
        cfg.streakMilestoneClaimed = cfg.streak;
        addCoins(milestoneCoins);
        state.streakMilestoneReward = { days: cfg.streak, coins: milestoneCoins };
    }

    cfg.lastDailyTs = now;
    saveConfig();
    return cfg.streak;
};

// ---------------------------------------------------------------------------
// Level stars
// ---------------------------------------------------------------------------

export const recordLevelClear = (levelIdx, stars) => {
    const cfg = state.config;
    cfg.levelStars = cfg.levelStars || {};
    const prev = cfg.levelStars[levelIdx] || 0;
    if (stars > prev) cfg.levelStars[levelIdx] = stars;
    saveConfig();
    return cfg.levelStars[levelIdx];
};

export const totalStars = () => {
    const s = state.config.levelStars || {};
    return Object.values(s).reduce((a, b) => a + (b || 0), 0);
};

export const levelsCleared = () =>
    Object.keys(state.config.levelStars || {}).length;

export const levelsWith3Stars = () =>
    Object.values(state.config.levelStars || {}).filter(s => s === 3).length;

/**
 * Speedrun threshold (seconds) — scales with grid size so an 8x8 isn't
 * penalised by the same bar as a 3x3. Roughly: 3x3 ≈ 24s, 5x5 ≈ 40s, 8x8 ≈ 64s.
 */
export const speedrunThreshold = (gridDim) => Math.max(20, (gridDim || 3) * 8);

/**
 * Per-level best clear time. Returns { sec, isNewBest, previousSec }.
 * previousSec is null on the first clear of a level.
 */
export const recordBestTime = (levelIdx, elapsedSec) => {
    const cfg = state.config;
    cfg.levelBestSec = cfg.levelBestSec || {};
    const prev = cfg.levelBestSec[levelIdx];
    const isNewBest = prev === undefined || elapsedSec < prev;
    if (isNewBest) {
        cfg.levelBestSec[levelIdx] = elapsedSec;
        saveConfig();
    }
    return { sec: cfg.levelBestSec[levelIdx], isNewBest, previousSec: prev ?? null };
};

export const speedrunsEarned = () => {
    const stars = state.config.levelStars || {};
    const bests = state.config.levelBestSec || {};
    let n = 0;
    Object.keys(bests).forEach(k => {
        if (!stars[k]) return; // only count cleared levels
        // We can't know the gridDim from cfg alone; approximate with a fixed
        // friendly threshold. 30s is fast enough for any small/medium grid and
        // is the cheapest gate trophies can read off the persisted save.
        if (bests[k] < 30) n++;
    });
    return n;
};

// ---------------------------------------------------------------------------
// Theme unlocks — stars finally gate something. Replaying for 3★ is the
// chase; themes are the cosmetic payoff. Already-selected themes stay owned
// (ownedThemes grandfathers saves from before the gate existed).
// ---------------------------------------------------------------------------

export const THEME_UNLOCKS = [
    { key: 'cream',    label: 'Cream',    stars: 0 },
    { key: 'midnight', label: 'Midnight', stars: 10 },
    { key: 'meadow',   label: 'Meadow',   stars: 30 },
    { key: 'sunset',   label: 'Sunset',   stars: 75 },
];

export const isThemeUnlocked = (key, cfg = state.config) => {
    const entry = THEME_UNLOCKS.find(t => t.key === key);
    if (!entry) return false;
    if ((cfg.ownedThemes || []).includes(key)) return true;
    return totalStars() >= entry.stars;
};

// ---------------------------------------------------------------------------
// Trophies
// ---------------------------------------------------------------------------

/**
 * Each trophy has:
 *   id      — stable key stored in config.trophies when earned
 *   title   — display name
 *   sub     — one-line description
 *   color   — CSS var expression for the badge background
 *   icon    — key in icons.js (resolved by the screen template)
 *   target  — numeric unlock threshold
 *   get     — (cfg) => current progress toward target
 *
 * Keeping the list declarative lets us render the trophies screen from this
 * single source of truth.
 */
export const TROPHIES = [
    {
        id: 'first-snap',
        title: 'First Snap',
        sub: 'Clear your first puzzle',
        color: 'var(--coral)',
        icon: 'levelComplete',
        target: 1,
        get: () => levelsCleared(),
    },
    {
        id: 'speed-runner',
        title: 'Speed Runner',
        sub: 'Earn 3 Speedrun badges',
        color: 'var(--sky)',
        icon: 'rocket',
        target: 3,
        get: () => speedrunsEarned(),
    },
    {
        id: 'star-hunter',
        title: 'Star Hunter',
        sub: 'Earn 10 stars total',
        color: 'var(--butter)',
        icon: 'star',
        target: 10,
        get: () => totalStars(),
    },
    {
        id: 'hot-streak',
        title: 'Hot Streak',
        sub: '5 days in a row',
        color: 'var(--mint)',
        icon: 'flame',
        target: 5,
        get: (cfg) => cfg.streak || 0,
    },
    {
        id: 'flawless-five',
        title: 'Flawless Five',
        sub: 'Clear 5 levels with 3 stars',
        color: 'var(--lilac)',
        icon: 'shieldCheck',
        target: 5,
        get: () => levelsWith3Stars(),
    },
    {
        // Faded World meta: a place restores every 10 cleared levels.
        // (Keeps the legacy 'collector' id so already-earned saves stay valid.)
        id: 'collector',
        title: 'World Keeper',
        sub: 'Restore 3 places',
        color: 'var(--rose)',
        icon: 'restore',
        target: 3,
        get: (cfg) => Math.floor((cfg.unlocked || 0) / 10),
    },
    {
        id: 'marathon',
        title: 'Marathon',
        sub: 'Play 30 days in a row',
        color: 'var(--coral)',
        icon: 'flame',
        target: 30,
        get: (cfg) => cfg.streak || 0,
    },
    {
        id: 'color-mixer',
        title: 'Color Mixer',
        sub: 'Trigger 10 Prism Mixes',
        color: 'var(--lilac)',
        icon: 'prismMix',
        target: 10,
        get: (cfg) => cfg.lifetimeMixes || 0,
    },
    {
        id: 'spectrum-master',
        title: 'Spectrum Master',
        sub: 'Trigger 50 Prism Mixes',
        color: 'var(--rose)',
        icon: 'palette',
        target: 50,
        get: (cfg) => cfg.lifetimeMixes || 0,
    },
];

/**
 * Re-evaluate all trophies against current config. Returns the list of
 * trophy ids newly unlocked in this call (useful for a "trophy earned"
 * toast later).
 */
export const evaluateTrophies = () => {
    const cfg = state.config;
    cfg.trophies = cfg.trophies || [];
    const newlyUnlocked = [];
    TROPHIES.forEach(t => {
        if (cfg.trophies.includes(t.id)) return;
        const progress = t.get(cfg);
        if (progress >= t.target) {
            cfg.trophies.push(t.id);
            newlyUnlocked.push(t.id);
        }
    });
    if (newlyUnlocked.length) saveConfig();
    return newlyUnlocked;
};

// ---------------------------------------------------------------------------
// High-level victory handler — the single call game.js makes on a clear.
// ---------------------------------------------------------------------------

export const onLevelClear = (levelIdx, stars, elapsedSec, gridDim) => {
    const cfg = state.config;

    if (cfg._fastestClearSec === undefined || elapsedSec < cfg._fastestClearSec) {
        cfg._fastestClearSec = elapsedSec;
    }

    const previousStars = (cfg.levelStars || {})[levelIdx] || 0;
    recordLevelClear(levelIdx, stars);
    const bestTime = recordBestTime(levelIdx, elapsedSec);
    const isSpeedrun = elapsedSec < speedrunThreshold(gridDim);
    const prevStreak = cfg.streak || 0;
    checkInPlay();
    const trophies = evaluateTrophies();
    return {
        trophies,
        bestTime,
        isSpeedrun,
        previousStars,
        isFirstClear: previousStars === 0,
        streak: cfg.streak || 0,
        streakGrew: (cfg.streak || 0) > prevStreak,
    };
};
