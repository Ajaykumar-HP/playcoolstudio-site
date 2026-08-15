/**
 * Today's Goals — three light daily missions with coin rewards.
 *
 * The short-term-goal layer between "clear this level" and "restore the world":
 * every day the player gets 3 small, immediately-understandable goals (clear
 * puzzles, win clean, mix colors, do the daily). Rewards are coins and are
 * auto-claimed the moment a goal completes, then celebrated on the complete
 * screen — no extra claim taps, no separate inbox screen.
 *
 * Selection is deterministic per calendar day (same seeding style as
 * daily.js) so the set never reshuffles mid-day. Progress persists in
 * config.missions = { date, progress: {id: n}, claimed: {id: true} } and
 * self-resets when the local date changes.
 */

import state, { saveConfig } from './state.js?v=3bd14eb0045c';
import { addCoins } from './economy.js?v=3bd14eb0045c';
import { getLocalDateKey } from './daily.js?v=3bd14eb0045c';
import { trackEvent } from './analytics.js?v=3bd14eb0045c';

// tint = existing sb-bg-* accent class; icon = key in ui/icons.js.
//
// Rewards: 6 coins for the routine goals, 8 for the two that ask for a detour
// (a Prism Mix run, the Daily). Three goals a day therefore pay 18-22 coins —
// about two hints — instead of the old 30-35, which on its own funded more
// help than a whole chapter cost. Goal coins are day-scoped and sit outside
// the per-clear ceiling in economy.js (MAX_LEVEL_CLEAR_COINS), so this table
// is the only thing bounding them; keep the spread narrow.
export const GOAL_DEFS = {
    clear2: { event: 'clear',      target: 2, reward: 6, icon: 'levelComplete', tint: 'sb-bg-mint',   label: 'Clear 2 puzzles' },
    clear3: { event: 'clear',      target: 3, reward: 6, icon: 'levelComplete', tint: 'sb-bg-mint',   label: 'Clear 3 puzzles' },
    clean1: { event: 'clean',      target: 1, reward: 6, icon: 'shieldCheck',   tint: 'sb-bg-butter', label: 'Win without hints' },
    stars6: { event: 'stars',      target: 6, reward: 6, icon: 'star',     tint: 'sb-bg-butter', label: 'Earn 6 stars' },
    fresh2: { event: 'firstclear', target: 2, reward: 6, icon: 'journey',  tint: 'sb-bg-coral',  label: 'Beat 2 new levels' },
    mix2:   { event: 'mix',        target: 2, reward: 8, icon: 'prismMix', tint: 'sb-bg-lilac',  label: 'Make 2 Prism Mixes' },
    daily1: { event: 'daily',      target: 1, reward: 8, icon: 'calendar', tint: 'sb-bg-sky',    label: 'Clear the Focus Prism' },
};

// Same FNV-1a as daily.js — kept local so the modules stay independent.
const hashString = (value) => {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

/**
 * The 3 goal ids active on a given day. Brand-new players (still in the first
 * levels) get a fixed gentle set; after that, one slot is always "clear 3"
 * and the other two rotate deterministically by date.
 */
export const pickGoalIds = (dateKey = getLocalDateKey(), cfg = state.config) => {
    if ((cfg.unlocked || 0) < 3) return ['clear2', 'clean1', 'daily1'];
    const seed = hashString(`${dateKey}:goals:snapblocks`);
    const mid = ['clean1', 'stars6', 'fresh2'][seed % 3];
    const last = ['mix2', 'daily1'][(seed >>> 3) % 2];
    return ['clear3', mid, last];
};

// Read-only view of today's goal state. Never mutates config — a stale
// missions blob from yesterday simply reads as zero progress today; the next
// recordGoalEvent call persists the rollover.
export const getTodaysGoals = (cfg = state.config) => {
    const today = getLocalDateKey();
    const m = cfg.missions && cfg.missions.date === today
        ? cfg.missions
        : { date: today, progress: {}, claimed: {} };
    return pickGoalIds(today, cfg).map(id => {
        const def = GOAL_DEFS[id];
        const current = Math.min(def.target, (m.progress && m.progress[id]) || 0);
        return { id, ...def, current, done: current >= def.target };
    });
};

/**
 * Feed a gameplay event into today's goals. Auto-grants the coin reward the
 * instant a goal completes and returns the newly-completed goals (for the
 * complete-screen celebration). Types: 'clear' | 'clean' | 'stars' |
 * 'firstclear' | 'mix' | 'daily'.
 */
export const recordGoalEvent = (type, amount = 1) => {
    if (amount <= 0) return [];
    const cfg = state.config;
    const today = getLocalDateKey();
    if (!cfg.missions || cfg.missions.date !== today) {
        cfg.missions = { date: today, progress: {}, claimed: {} };
    }
    const m = cfg.missions;
    const completed = [];
    let changed = false;
    pickGoalIds(today, cfg).forEach(id => {
        const def = GOAL_DEFS[id];
        if (def.event !== type) return;
        const cur = m.progress[id] || 0;
        if (cur >= def.target && m.claimed[id]) return;
        m.progress[id] = Math.min(def.target, cur + amount);
        changed = true;
        if (m.progress[id] >= def.target && !m.claimed[id]) {
            m.claimed[id] = true;
            addCoins(def.reward);
            completed.push({ id, label: def.label, reward: def.reward });
            trackEvent('goal_complete', { goalId: id, reward: def.reward });
        }
    });
    if (changed) saveConfig();
    return completed;
};
