/**
 * Shared Game State — single source of truth for cross-module state
 */

import { LEVELS } from './levels.js?v=5071259f5c9c';
import { isAnchoredLevel } from './anchored.js?v=5071259f5c9c';
import { LOGICAL_SIZE } from './playLayout.js?v=5071259f5c9c';

const CFG_KEY = 'snapblocks';

/**
 * Bumped whenever a batch of Anchored levels lands on indices that previously
 * served an ordinary puzzle. See the migration in loadConfig().
 */
const ANCHORED_DATA_VERSION = 1;
const MAX_SAVE_COINS = 99999;
const MAX_RECENT_DAILY_DATES = 60;
const state = {
    // Canvas
    canvas: null,
    ctx: null,
    render: null,

    // Constants
    // Desktop CrazyGames uses one landscape surface for the complete
    // experience, not only the board. Mobile CrazyGames, Android and ordinary
    // portrait web retain the established phone surface. Geometry lives in
    // playLayout.js so render, input and DOM agree.
    CANVAS_W: LOGICAL_SIZE.w,
    CANVAS_H: LOGICAL_SIZE.h,

    // Game objects
    pieces: [],
    nPieces: 0,
    undoStack: [],
    redoStack: [],
    cellSize: 0,
    gridDim: 0,
    dotSize: 0,
    floaters: [],

    // Flags
    playing: false,
    lockInput: true,
    victory: false,
    currentLevel: 0,
    gameMode: 'normal', // 'normal' | 'daily' | 'tutorial' | 'lab'
    // LAB (prototype): transient sandbox state, never persisted to config.
    // board.js reads labKind + bloomTargets when it bakes the bloom layer, so
    // they are declared here rather than appearing out of nowhere at load time.
    labLevelIdx: -1,     // index into LAB_LEVELS
    labLevelIndex: -1,   // same value; the name the Lab UI writes for restart
    labKind: '',         // 'bloom' | 'anchored'
    labLevel: null,      // the authored LAB_LEVELS entry currently loaded
    labResult: null,     // { id, kind, levelIdx, elapsedSec } on a lab clear
    bloomTargets: [],    // [{ x, y, target, bloomed }] — [] on anchored levels
    dailyDateKey: '',
    dailyLevelIndex: -1,
    dailyLaunchPending: false,
    onboardingStep: 0,
    activeDragPiece: null,
    gameScene: 'intro', // 'intro', 'menu', 'playing'

    // Victory
    victoryAlpha: 0,

    // Level timing & scoring
    levelStartTime: 0,
    pauseStart: 0,    // epoch ms when paused (0 = running); freezes the clock
    levelElapsed: 0,  // seconds taken to complete
    levelScore: 0,
    levelStars: 0,
    completedBoardSnapshot: '', // cropped solved-board image shown on the complete screen
    levelHintsUsed: 0,
    levelResets: 0,
    dailyResult: null,
    levelClearResult: null,
    levelMixes: 0,
    levelMixBonus: 0,
    levelMeta: null,
    frostActive: false,      // a frozen piece is on this level (frost modifier)
    anchoredActive: false,   // locked pre-placed pieces on this level (anchored modifier)
    viewSceneChapter: -1,    // chapter shown in the before/after scene viewer
    introLevel: null,        // { idx } staged for the level-intro screen
    updateInfo: null,        // { forced, latestCode, title, message, url } when an update is available
    justRestoredChapter: -1, // chapter whose restoration stage just advanced
    justRestoredStage: 0,    // 1=meadow, 2=sky, 3=full place (Faded World reveal)
    prismReward: 0,          // hints granted on the last Prism Challenge clear
    pulseActive: false,      // rare Prism Pulse modifier on this normal level
    pulseTargets: [],        // [{ id, gx, gy, charged }] board power nodes
    pulseCharged: 0,         // live number of completed Pulse nodes
    pulseReward: 0,          // first-clear Pulse coin reward shown on complete
    pulseBurstStartedAt: 0,  // drives the short board-wide aurora effect
    levelObjective: null,
    levelObjectiveProgress: null,
    objectiveIntro: null,
    tutorialStep: 0,
    tutorialJustFinished: false, // level-intro shows a one-time "tutorial complete" card
    // { firstClear, chapter, treasure, prism, pulse, raw, granted, capped, total }
    // granted = coins actually credited (raw clamped to MAX_LEVEL_CLEAR_COINS);
    // total   = granted minus prism/pulse, which the UI adds back separately.
    levelCoinsEarned: null,
    treasureActive: false,       // this level is a golden Treasure level (transient, per-load)
    goalsCompleted: [],          // Today's Goals completed during this level (missions.js)
    streakMilestoneReward: null, // { days, coins } granted on this clear (progression.js)

    // Config (persisted)
    config: {
        unlocked: 0,
        sound: true,
        music: true,
        coins: 40,                // soft currency (10 coins = 1 hint); see economy.js
        hints: 3,                 // deprecated — kept only to migrate old saves → coins
        theme: 'cream',           // 'cream' | 'midnight'
        colorblind: false,
        haptics: true,
        reducedMotion: false,
        notifications: true,      // local notification reminders (daily + streak)
        notifPermAsked: false,    // OS permission dialog shown once, lazily
        // -------- Phase 3 data systems (stubbed in Phase 0 for forward-compat) --------
        tutorialCompleted: false, // show onboarding on first run
        streak: 0,                // consecutive days played
        lastDailyTs: 0,           // epoch ms of last daily-challenge completion
        dailyLastCompletedDate: '',
        dailyStreak: 0,
        dailyCompletedDates: [],
        dailyBest: {},
        levelStars: {},           // { [levelIndex]: 1|2|3 }
        levelBestSec: {},         // { [levelIndex]: fastest clear time in seconds }
        trophies: [],             // array of earned trophy ids
        ownedThemes: ['cream'],   // themes the player has unlocked
        adsRemoved: false,
        lifetimeMixes: 0,         // total Prism Mixes across all sessions
        missions: null,           // Today's Goals — { date, progress, claimed } (missions.js)
        streakMilestoneClaimed: 0, // highest streak-day milestone paid this streak run
        prismRewardsClaimed: {},  // { [levelIndex]: true } for first-clear Prism rewards
        pulseRewardsClaimed: {},  // { [levelIndex]: true } for Prism Pulse rewards
        mixCoachSeen: false,      // first-time Prism Lab coachmark dismissed
        frostCoachSeen: false,    // first-time Frost level coachmark dismissed
        pulseCoachSeen: false,    // first-time Prism Pulse coachmark dismissed
        anchoredCoachSeen: false, // first-time Anchored level coachmark dismissed
        objectiveCoachSeen: {},   // { [objectiveType]: true } for Prism Guide reveal length
        levelsSinceInterstitial: 0,
        lastInterstitialTs: 0,
        lastRewardedAdTs: 0,
        lastCleanClearBonusOfferLevel: -1,
        lastDismissedUpdateCode: 0,  // highest update versionCode the player tapped "Later" on
        ratingPromptAccepted: false, // player tapped a store-rating action; never prompt again
        ratingPromptDismissals: 0,   // lifetime cap keeps the request respectful
        ratingPromptLastLevel: -1,   // cleared level number at the last prompt
        ratingPromptLastTs: 0,       // epoch ms; enforces a time cooldown as well as levels
        anchoredDataVersion: 0,   // see migrateAnchoredIndices() — clears stale best times
    },

    // Late-bound references (set during init to avoid circular imports)
    // Modules register themselves here so others can call them
    modules: {},
};

export const saveConfig = ({ notify = true } = {}) => {
    let saved = false;
    try {
        localStorage.setItem(CFG_KEY, JSON.stringify(state.config));
        saved = true;
    } catch (e) { /* ignore */ }
    if (saved && notify && typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('snapblocks:config-saved'));
    }
};

// Legacy theme keys (pre-candy-palette) map to one of the new themes
const LEGACY_THEME_MAP = { dark: 'midnight', forest: 'meadow' };
const VALID_THEMES = ['cream', 'midnight', 'meadow', 'sunset'];
const BOOL_KEYS = [
    'sound', 'music', 'colorblind', 'haptics', 'reducedMotion', 'notifications',
    'notifPermAsked', 'tutorialCompleted', 'adsRemoved', 'mixCoachSeen', 'frostCoachSeen', 'pulseCoachSeen', 'anchoredCoachSeen',
    'ratingPromptAccepted',
];

const clampInt = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
};

const cleanDateKeys = (dates) => {
    if (!Array.isArray(dates)) return [];
    return [...new Set(dates.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))]
        .slice(-MAX_RECENT_DAILY_DATES);
};

const cleanNumberMap = (map, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = true } = {}) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    const out = {};
    const maxLevel = LEVELS.length - 1;
    Object.entries(map).forEach(([key, value]) => {
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx > maxLevel) return;
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        out[idx] = integer
            ? Math.max(min, Math.min(max, Math.floor(n)))
            : Math.max(min, Math.min(max, n));
    });
    return out;
};

const cleanBooleanMap = (map) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    const out = {};
    Object.entries(map).forEach(([key, value]) => {
        if (/^[\w:-]{1,48}$/.test(key)) out[key] = !!value;
    });
    return out;
};

const cleanDailyBest = (map) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    const out = {};
    Object.keys(map).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort().slice(-MAX_RECENT_DAILY_DATES).forEach(key => {
        const value = map[key];
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        out[key] = {
            levelIndex: clampInt(value.levelIndex, 0, Math.max(0, LEVELS.length - 1), 0),
            elapsedSec: clampInt(value.elapsedSec, 0, 24 * 60 * 60, 0),
            hintsUsed: clampInt(value.hintsUsed, 0, 999, 0),
            resets: clampInt(value.resets, 0, 999, 0),
            stars: clampInt(value.stars, 1, 3, 1),
            completedAt: clampInt(value.completedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        };
    });
    return out;
};

// Today's Goals blob: { date: 'YYYY-MM-DD', progress: {id: n}, claimed: {id: true} }
const cleanMissions = (m) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    if (typeof m.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.date)) return null;
    const progress = {};
    if (m.progress && typeof m.progress === 'object' && !Array.isArray(m.progress)) {
        Object.entries(m.progress).forEach(([key, value]) => {
            const n = Number(value);
            if (/^[\w-]{1,24}$/.test(key) && Number.isFinite(n)) {
                progress[key] = Math.max(0, Math.min(999, Math.floor(n)));
            }
        });
    }
    return { date: m.date, progress, claimed: cleanBooleanMap(m.claimed) };
};

export const sanitizeConfig = (cfg) => {
    cfg.unlocked = clampInt(cfg.unlocked, 0, Math.max(0, LEVELS.length - 1), 0);
    cfg.coins = clampInt(cfg.coins, 0, MAX_SAVE_COINS, 40);
    cfg.hints = clampInt(cfg.hints, 0, 999, 3);
    cfg.streak = clampInt(cfg.streak, 0, 3650, 0);
    cfg.lastDailyTs = clampInt(cfg.lastDailyTs, 0, Number.MAX_SAFE_INTEGER, 0);
    cfg.dailyStreak = clampInt(cfg.dailyStreak, 0, 3650, 0);
    cfg.lifetimeMixes = clampInt(cfg.lifetimeMixes, 0, Number.MAX_SAFE_INTEGER, 0);
    cfg.levelsSinceInterstitial = clampInt(cfg.levelsSinceInterstitial, 0, 999, 0);
    cfg.lastInterstitialTs = clampInt(cfg.lastInterstitialTs, 0, Number.MAX_SAFE_INTEGER, 0);
    cfg.lastRewardedAdTs = clampInt(cfg.lastRewardedAdTs, 0, Number.MAX_SAFE_INTEGER, 0);
    cfg.lastCleanClearBonusOfferLevel = clampInt(cfg.lastCleanClearBonusOfferLevel, -1, Math.max(0, LEVELS.length - 1), -1);
    cfg.lastDismissedUpdateCode = clampInt(cfg.lastDismissedUpdateCode, 0, Number.MAX_SAFE_INTEGER, 0);
    cfg.ratingPromptDismissals = clampInt(cfg.ratingPromptDismissals, 0, 3, 0);
    cfg.ratingPromptLastLevel = clampInt(cfg.ratingPromptLastLevel, -1, LEVELS.length, -1);
    cfg.ratingPromptLastTs = clampInt(cfg.ratingPromptLastTs, 0, Number.MAX_SAFE_INTEGER, 0);

    BOOL_KEYS.forEach(key => { cfg[key] = cfg[key] === true; });
    cfg.theme = VALID_THEMES.includes(cfg.theme) ? cfg.theme : (LEGACY_THEME_MAP[cfg.theme] || 'cream');
    cfg.dailyLastCompletedDate = typeof cfg.dailyLastCompletedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cfg.dailyLastCompletedDate)
        ? cfg.dailyLastCompletedDate
        : '';
    cfg.dailyCompletedDates = cleanDateKeys(cfg.dailyCompletedDates);
    cfg.dailyBest = cleanDailyBest(cfg.dailyBest);
    cfg.levelStars = cleanNumberMap(cfg.levelStars, { min: 1, max: 3 });
    cfg.levelBestSec = cleanNumberMap(cfg.levelBestSec, { min: 0, max: 24 * 60 * 60, integer: false });
    cfg.trophies = Array.isArray(cfg.trophies)
        ? [...new Set(cfg.trophies.filter(id => typeof id === 'string' && /^[\w-]{1,48}$/.test(id)))].slice(0, 64)
        : [];
    cfg.ownedThemes = Array.isArray(cfg.ownedThemes)
        ? [...new Set(['cream', ...cfg.ownedThemes.filter(t => VALID_THEMES.includes(t))])]
        : ['cream'];
    cfg.prismRewardsClaimed = cleanBooleanMap(cfg.prismRewardsClaimed);
    cfg.pulseRewardsClaimed = cleanBooleanMap(cfg.pulseRewardsClaimed);
    cfg.objectiveCoachSeen = cleanBooleanMap(cfg.objectiveCoachSeen);
    cfg.missions = cleanMissions(cfg.missions);
    cfg.streakMilestoneClaimed = clampInt(cfg.streakMilestoneClaimed, 0, 3650, 0);
};

export const sanitizeConfigCandidate = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const sanitized = { ...state.config, ...candidate };
    sanitizeConfig(sanitized);
    return sanitized;
};

/** Import a partial trusted-by-schema save through the same clamps as local data. */
export const importConfig = (candidate, { notify = false } = {}) => {
    const sanitized = sanitizeConfigCandidate(candidate);
    if (!sanitized) return false;
    // Preserve the object identity held by gameplay modules during async cloud restore.
    Object.assign(state.config, sanitized);
    saveConfig({ notify });
    return true;
};

/**
 * ANCHORED INDEX MIGRATION — clears stale best times, deliberately NOT stars.
 *
 * When a batch of Anchored levels ships, each one takes over an index that
 * previously served an ordinary puzzle. Anything the player recorded there was
 * earned on a board that no longer exists.
 *
 * BEST TIMES are cleared. A 12s best set on the old 4x4 at that index is often
 * simply unbeatable on the 6x6 Anchored board that replaced it, which kills the
 * "new best" moment at that level permanently. Clearing it is invisible to the
 * player (no counter displays it) and hands back a reward moment.
 *
 * STARS are deliberately KEPT, even though they are stale in exactly the same
 * way. Clearing them is the opposite trade: visible and negative. Three things
 * in js/progression.js read levelStars — levelsCleared() counts its keys,
 * levelsWith3Stars() counts its 3s, and speedrunsEarned() gates on it — so
 * wiping ~48 entries would visibly walk back a player's progress toward
 * trophies they had not yet earned. Already-earned trophies are safe either way
 * (evaluateTrophies skips anything already in cfg.trophies), but the regression
 * in progress bars is real, and a star is capped at 3 so no future moment is
 * lost by leaving it. An invisible inaccuracy beats a visible takeaway.
 *
 * Guarded by a VERSION, not a boolean, for two reasons: it must never re-run
 * and wipe times the player has since re-earned on the new boards, and the next
 * Anchored batch needs to run its own pass without redoing this one. Bump
 * ANCHORED_DATA_VERSION when new indices become Anchored.
 *
 * KNOWN GAP, accepted deliberately: anchoredDataVersion is NOT in DURABLE_KEYS,
 * so restoring a cloud save written before this migration brings its stale best
 * times back and the local version flag (already current) suppresses a re-run.
 * Adding the key to the durable set would fix it but changes fingerprintConfig,
 * which risks a spurious device-vs-cloud conflict prompt on the first sync after
 * update — see the decodeEnvelope/fingerprint reasoning in the Prism Pulse note
 * in CLAUDE.md. A cosmetic stale time in a rare path is the cheaper bug.
 */
const migrateAnchoredIndices = () => {
    const cfg = state.config;
    if (Number(cfg.anchoredDataVersion) >= ANCHORED_DATA_VERSION) return 0;

    const bests = cfg.levelBestSec;
    let cleared = 0;
    if (bests && typeof bests === 'object') {
        Object.keys(bests).forEach(key => {
            const idx = Number(key);
            if (!Number.isInteger(idx) || !isAnchoredLevel(idx)) return;
            delete bests[key];
            cleared++;
        });
    }
    cfg.anchoredDataVersion = ANCHORED_DATA_VERSION;
    return cleared;
};

export const loadConfig = () => {
    try {
        const c = localStorage.getItem(CFG_KEY);
        if (c) {
            const loaded = JSON.parse(c);
            // Merge over defaults so newly-added keys keep their fallbacks
            state.config = { ...state.config, ...loaded };

            // Migrate legacy theme names
            if (!VALID_THEMES.includes(state.config.theme)) {
                state.config.theme = LEGACY_THEME_MAP[state.config.theme] || 'cream';
            }
            // Belt-and-braces defaults for fields that could be missing on old saves
            if (state.config.hints === undefined) state.config.hints = 3;
            // Migrate the old hint counter into coins once (10 coins = 1 hint).
            // Detect via the *loaded* object — the merged config already carries
            // the default coins:30, so checking state.config would never migrate.
            if (loaded.coins === undefined) {
                state.config.coins = Number.isFinite(loaded.hints) ? loaded.hints * 10 : 40;
            }
            if (state.config.music === undefined) state.config.music = true;
            if (state.config.colorblind === undefined) state.config.colorblind = false;
            if (state.config.haptics === undefined) state.config.haptics = true;
            if (state.config.reducedMotion === undefined) state.config.reducedMotion = false;
            if (state.config.notifications === undefined) state.config.notifications = true;
            if (state.config.notifPermAsked === undefined) state.config.notifPermAsked = false;
            if (state.config.tutorialCompleted === undefined) state.config.tutorialCompleted = false;
            if (state.config.streak === undefined) state.config.streak = 0;
            if (state.config.lastDailyTs === undefined) state.config.lastDailyTs = 0;
            if (state.config.dailyLastCompletedDate === undefined) state.config.dailyLastCompletedDate = '';
            if (state.config.dailyStreak === undefined) state.config.dailyStreak = 0;
            if (!Array.isArray(state.config.dailyCompletedDates)) state.config.dailyCompletedDates = [];
            if (!state.config.dailyBest) state.config.dailyBest = {};
            if (!state.config.levelStars) state.config.levelStars = {};
            if (!state.config.levelBestSec) state.config.levelBestSec = {};
            if (!state.config.trophies) state.config.trophies = [];
            if (!state.config.ownedThemes) state.config.ownedThemes = ['cream'];
            if (state.config.adsRemoved === undefined) state.config.adsRemoved = false;
            if (!Number.isFinite(state.config.lifetimeMixes)) state.config.lifetimeMixes = 0;
            if (!state.config.prismRewardsClaimed || typeof state.config.prismRewardsClaimed !== 'object') state.config.prismRewardsClaimed = {};
            if (!state.config.pulseRewardsClaimed || typeof state.config.pulseRewardsClaimed !== 'object') state.config.pulseRewardsClaimed = {};
            if (state.config.mixCoachSeen === undefined) state.config.mixCoachSeen = false;
            if (state.config.pulseCoachSeen === undefined) state.config.pulseCoachSeen = false;
            if (!state.config.objectiveCoachSeen || typeof state.config.objectiveCoachSeen !== 'object') state.config.objectiveCoachSeen = {};
            if (!Number.isFinite(state.config.levelsSinceInterstitial)) state.config.levelsSinceInterstitial = 0;
            if (!Number.isFinite(state.config.lastInterstitialTs)) state.config.lastInterstitialTs = 0;
            if (!Number.isFinite(state.config.lastRewardedAdTs)) state.config.lastRewardedAdTs = 0;
            if (!Number.isFinite(state.config.lastCleanClearBonusOfferLevel)) state.config.lastCleanClearBonusOfferLevel = -1;
            if (!Number.isFinite(state.config.lastDismissedUpdateCode)) state.config.lastDismissedUpdateCode = 0;
            if (!Number.isFinite(state.config.anchoredDataVersion)) state.config.anchoredDataVersion = 0;
            migrateAnchoredIndices();
            sanitizeConfig(state.config);
        }
    } catch (e) { /* ignore */ }
};

export default state;
