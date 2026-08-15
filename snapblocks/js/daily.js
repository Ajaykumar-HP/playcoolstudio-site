/**
 * Daily Prism - deterministic daily challenge selection and rewards.
 */

import state, { saveConfig } from './state.js?v=3bd14eb0045c';
import { LEVELS } from './levels.js?v=3bd14eb0045c';
import { addCoins, REWARD_DAILY } from './economy.js?v=3bd14eb0045c';

export const DAILY_SAVE_KEY = 'snapblocks.activeDaily.v1';
export const ACTIVE_MODE_KEY = 'snapblocks.activeMode.v1';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');

export const getLocalDateKey = (date = new Date()) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseDateKey = (dateKey) => {
    const [y, m, d] = String(dateKey || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    return date;
};

export const formatDailyDate = (dateKey = getLocalDateKey()) => {
    const date = parseDateKey(dateKey) || new Date();
    return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
};

export const getDailyCountdown = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const diff = Math.max(0, next - now);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};

// Days since the Unix epoch, counted in LOCAL time so the rotation turns over
// at the player's midnight — the same boundary getDailyCountdown promises.
const dayNumber = (dateKey) => {
    const date = parseDateKey(dateKey);
    if (!date) return 0;
    return Math.floor(date.getTime() / ONE_DAY_MS);
};

// The daily pool is FIXED and deliberately not derived from player progress.
//
// It used to be a moving band around config.unlocked, filtered by which levels
// the player had already cleared. That handed two players different puzzles on
// the same date, which defeats the entire idea of a daily: nothing to compare,
// nothing to talk about, and no leaderboard could ever be built on top of it.
// It also guaranteed the daily would reappear in normal progression within
// ~25 levels, so "today's challenge" was really "a level you'll play soon".
//
// The window stays modest so a brand-new player is not handed a late-game
// monster grid on day one.
const DAILY_BAND_START = 3;
const DAILY_BAND_END = 62;

// Stepping by a stride coprime with the pool size walks every candidate exactly
// once before any repeat — a full 60-day cycle — and scatters the order, so
// consecutive days don't simply march up the difficulty curve.
const DAILY_STRIDE = 23;

const dailyCandidates = () => {
    const upper = Math.max(0, LEVELS.length - 1);
    const start = Math.min(DAILY_BAND_START, upper);
    const end = Math.min(DAILY_BAND_END, upper);
    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out.length ? out : [0];
};

const readDailySave = () => {
    try {
        const raw = localStorage.getItem(DAILY_SAVE_KEY);
        if (!raw) return null;
        const save = JSON.parse(raw);
        if (!save || save.version !== 1) return null;
        return save;
    } catch (e) {
        return null;
    }
};

export const hasDailySave = (dateKey = getLocalDateKey()) => {
    const save = readDailySave();
    return !!(save && save.mode === 'daily' && save.dailyDateKey === dateKey);
};

export const isDailyCompleted = (dateKey = getLocalDateKey(), config = state.config) =>
    !!(config.dailyBest && config.dailyBest[dateKey]);

export const getDailyStatus = (dateKey = getLocalDateKey(), config = state.config) => {
    if (isDailyCompleted(dateKey, config)) return 'Completed';
    if (hasDailySave(dateKey)) return 'In progress';
    return 'Not played';
};

export const getDailyPuzzle = (dateKey = getLocalDateKey(), config = state.config) => {
    const saved = readDailySave();
    const completed = config.dailyBest && config.dailyBest[dateKey];
    const levelFromHistory = saved?.dailyDateKey === dateKey
        ? saved.dailyLevelIndex ?? saved.level
        : completed?.levelIndex;
    const candidates = dailyCandidates();
    const fallbackLevel = candidates[(dayNumber(dateKey) * DAILY_STRIDE) % candidates.length];
    const levelIndex = Number.isInteger(levelFromHistory)
        ? Math.max(0, Math.min(levelFromHistory, LEVELS.length - 1))
        : fallbackLevel;
    const level = LEVELS[levelIndex];
    const dim = level.length;
    const difficultyLabel = dim >= 7 ? 'Hard' : dim >= 5 ? 'Medium' : 'Bright';

    return {
        dateKey,
        levelIndex,
        level,
        dim,
        difficultyLabel,
        rewardCoins: REWARD_DAILY,
        title: 'Focus Prism',
        subtitle: 'One harder puzzle. One clean solve.',
    };
};

export const getWeeklyConstellation = (config = state.config, today = new Date()) => {
    const done = new Set(config.dailyCompletedDates || []);
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = getLocalDateKey(d);
        days.push({
            key,
            label: d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1),
            isToday: i === 0,
            completed: done.has(key),
        });
    }
    return days;
};

/**
 * Mini-board occupancy for the Focus Prism card.
 *
 * The UI assigns a generic branded colour arrangement to this silhouette. It
 * never receives the solved colours, so the card cannot spoil a first attempt
 * or a replay.
 */
export const getDailyMiniGrid = (levelIndex) => {
    const level = LEVELS[levelIndex] || LEVELS[0];
    const rows = [];
    for (let y = 0; y < level.length; y++) {
        const row = [];
        for (let x = 0; x < level.length; x++) {
            row.push(level[x][y].some(v => v > 0));
        }
        rows.push(row);
    }
    return rows;
};

/**
 * Daily stars are SKILL-based, matching the main progression rule in
 * progression.js — no hints and no resets is the whole test.
 *
 * They used to also require a 120s (3-star) or 240s (2-star) clear, which
 * pushed the player to rush the one mode positioned as "one harder puzzle,
 * one clean solve" and contradicted the game's calm framing. Time is still
 * recorded and still breaks ties for the personal best in markDailyComplete;
 * it just no longer costs a star.
 */
export const getFocusStars = ({ hintsUsed = 0, resets = 0 } = {}) => {
    if (hintsUsed === 0 && resets === 0) return 3;
    if (hintsUsed <= 1 && resets <= 1) return 2;
    return 1;
};

export const getFocusLabel = ({ stars = 1, hintsUsed = 0, resets = 0 } = {}) => {
    if (stars >= 3) return 'Flawless focus';
    if (stars >= 2) return hintsUsed || resets ? 'Smart recovery' : 'Steady solve';
    return 'Prism solved';
};

export const markDailyComplete = (dateKey, result = {}, config = state.config) => {
    const daily = getDailyPuzzle(dateKey, config);
    config.dailyBest = config.dailyBest || {};
    config.dailyCompletedDates = Array.isArray(config.dailyCompletedDates)
        ? config.dailyCompletedDates
        : [];

    const previous = config.dailyBest[dateKey];
    const firstCompletion = !previous;
    const candidate = {
        levelIndex: daily.levelIndex,
        elapsedSec: result.elapsedSec || 0,
        hintsUsed: result.hintsUsed || 0,
        resets: result.resets || 0,
        stars: result.stars || 1,
        completedAt: Date.now(),
    };

    const better = !previous ||
        candidate.stars > (previous.stars || 0) ||
        (candidate.stars === previous.stars && candidate.elapsedSec < (previous.elapsedSec || Infinity)) ||
        (candidate.stars === previous.stars &&
            candidate.elapsedSec === (previous.elapsedSec || Infinity) &&
            candidate.hintsUsed + candidate.resets < (previous.hintsUsed || 0) + (previous.resets || 0));

    if (better) config.dailyBest[dateKey] = candidate;

    if (firstCompletion) {
        const last = parseDateKey(config.dailyLastCompletedDate);
        const today = parseDateKey(dateKey);
        if (!last || !today || today.getTime() - last.getTime() > ONE_DAY_MS) {
            config.dailyStreak = 1;
        } else if (today.getTime() !== last.getTime()) {
            config.dailyStreak = (config.dailyStreak || 0) + 1;
        }

        config.dailyLastCompletedDate = dateKey;
        addCoins(daily.rewardCoins);
        if (!config.dailyCompletedDates.includes(dateKey)) {
            config.dailyCompletedDates.push(dateKey);
            config.dailyCompletedDates = config.dailyCompletedDates.slice(-60);
        }
    }

    saveConfig();
    return {
        firstCompletion,
        bestUpdated: better,
        rewardCoinsGranted: firstCompletion ? daily.rewardCoins : 0,
        streak: config.dailyStreak || 0,
        daily,
    };
};
