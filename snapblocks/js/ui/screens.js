/**
 * Screen HTML templates — ports of the prototype's SCREENS object.
 *
 * Each entry is a function that returns an HTML string. They may read `state`
 * for live values (current level, hint count, etc.) and emit:
 *   - [data-nav="screenId"]  -> ScreenManager navigates
 *   - [data-action="verb"]   -> SceneController runs a game action
 *
 * Keep these templates pure; all wiring happens in ui/index.js.
 */

import state from '../state.js?v=5071259f5c9c';
import { LEVELS, LEVEL_META, GAME_COLORS } from '../levels.js?v=5071259f5c9c';
import icons from './icons.js?v=5071259f5c9c';
import { wordmark, wordmarkBig, appLogo, menuAppLogo } from './logo.js?v=5071259f5c9c';
import { TROPHIES, THEME_UNLOCKS, isThemeUnlocked } from '../progression.js?v=5071259f5c9c';
import { getCoins, HINT_COST, SOLVE_COST, REWARD_TUTORIAL, REWARD_TREASURE, REWARD_PULSE, STREAK_MILESTONES } from '../economy.js?v=5071259f5c9c';
import { REWARDED_AD_COINS } from '../ads.js?v=5071259f5c9c';
import { TUTORIAL_COACH } from '../tutorial.js?v=5071259f5c9c';
import { isTreasureLevel, nextTreasureIn } from '../treasure.js?v=5071259f5c9c';
import { isPulseLevel, nextPulseIn, PULSE_NODE_COUNT } from '../pulse.js?v=5071259f5c9c';
import { getAnchoredGrid } from '../anchored.js?v=5071259f5c9c';
import { caps } from '../platform/index.js?v=5071259f5c9c';
// Not a cap: whether this build HAS a privacy URL to open. links.portal.js
// blanks it, and a row whose only action opens '' is a button that does
// nothing — which is exactly what a portal reviewer clicks first.
import { PRIVACY_URL } from '../platform/links.js?v=5071259f5c9c';
// Not a cap: the Settings row asks whether vibration *works here*, which on web
// varies by device rather than by build. See hapticsSupported() in js/haptics.js.
import { hapticsSupported } from '../haptics.js?v=5071259f5c9c';
// LAB (prototype) — self-contained in js/ui/lab/. Safe to delete with its call sites.
import { labScreen, labHudChip, labHudSpacer, labPauseAction, isLabMode } from './lab/index.js?v=5071259f5c9c';

// Shown in Settings → Version. The native build number is patched in over this
// fallback from @capacitor/app when available (see ui/index.js settings mount).
const APP_VERSION = '1.0.6';
import {
    chapterCount, activeChapter, chapterProgress, restoredPlaces, isChapterRestored,
    placeName, landName, sceneSVG, chapterStart, chapterEnd, clearedCount,
    SIZE as CHAPTER_SIZE, stageOf, STAGE_INFO, nextRestoration, chapterOf,
} from '../chapters.js?v=5071259f5c9c';
import {
    formatDailyDate,
    getDailyCountdown,
    getDailyMiniGrid,
    getDailyPuzzle,
    getDailyStatus,
    getFocusLabel,
    getWeeklyConstellation,
    getLocalDateKey,
    isDailyCompleted,
} from '../daily.js?v=5071259f5c9c';
import { getTodaysGoals } from '../missions.js?v=5071259f5c9c';

// =========================================================================
// helpers
// =========================================================================

// Escape a string for safe interpolation into template HTML. Used for the few
// strings that come from OUTSIDE the app bundle (e.g. version.json fields) —
// everything else in these templates is trusted local content.
const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Branded piece map for the Daily card. It adds SnapBlocks colour to the hero
// but is deliberately unrelated to today's solution, including on replays.
const MINI_BOARD_PATTERN = [
    [1, 1, 2, 2],
    [1, 4, 4, 2],
    [3, 4, 5, 5],
    [3, 3, 5, 6],
];

const miniCellStyle = (filled, x, y, width, height) => {
    if (!filled) return '';
    const px = Math.min(3, Math.floor((x * 4) / Math.max(1, width)));
    const py = Math.min(3, Math.floor((y * 4) / Math.max(1, height)));
    return `background:${GAME_COLORS[MINI_BOARD_PATTERN[py][px] - 1]}`;
};

const miniBoard = (grid) => {
    let out = '';
    for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
            const filled = !!grid[y][x];
            const style = miniCellStyle(filled, x, y, grid[y].length, grid.length);
            out += `<span class="sb-mini-cell ${filled ? 'is-filled' : 'is-empty'}"${style ? ` style="${style}"` : ''}></span>`;
        }
    }
    return out;
};

const starMini = (filled) => `
    <svg width="10" height="10" viewBox="0 0 24 24" style="color:${filled ? 'var(--butter)' : 'var(--line-strong)'};">
        <path d="M12 2.5l2.9 6.4 7 .7-5.3 4.7 1.6 6.8L12 17.7 5.8 21l1.6-6.8L2.1 9.6l7-.7z" fill="currentColor"/>
    </svg>
`;

const levelNode = (n, stateCls, stars = 0, boss = false) => {
    const clsMap = { current: 'current', locked: 'locked', done: '' };
    const cls = clsMap[stateCls] || '';
    const starRow = stars > 0
        ? `<div class="stars">${[1, 2, 3].map(i => starMini(i <= stars)).join('')}</div>`
        : '';
    const content = stateCls === 'locked'
        ? `<span style="color:var(--ink-soft);">${icons.lock}</span>`
        : `<span class="num">${String(n).padStart(2, '0')}</span>${starRow}`;
    const navAttr = stateCls === 'locked' ? '' : `data-nav="game" data-level="${n - 1}"`;
    return `<div class="sb-level-node ${cls}" ${navAttr}>${boss ? `<div class="boss-ring"></div>` : ''}${content}</div>`;
};

// A premium trophy tile for the trophy-case grid. Earned tiles get a colored,
// glossy medal + shine; locked tiles are muted with a progress bar toward target.
const trophyTile = (t, locked, progressLabel, iconSvg) => {
    let pct = 100;
    if (locked && progressLabel) {
        const [cur, tgt] = progressLabel.split('/').map(n => parseInt(n, 10));
        pct = tgt ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
    }
    return `
    <div class="sb-trophy-tile ${locked ? 'locked' : 'earned'}">
        <div class="sb-trophy-medal" style="--tc:${t.color};">
            ${locked ? icons.lock : iconSvg}
            ${locked ? '' : `<span class="sb-trophy-check">${icons.check}</span>`}
        </div>
        <div class="sb-trophy-title">${t.title}</div>
        <div class="sb-trophy-sub">${t.sub}</div>
        ${locked
            ? `<div class="sb-progress thin sb-trophy-bar"><span style="width:${pct}%; background:${t.color};"></span></div>
               <div class="sb-mono sb-trophy-prog">${progressLabel || 'Locked'}</div>`
            : `<div class="sb-trophy-earned">${icons.check} Earned</div>`}
    </div>`;
};

const totalStars = () => {
    const s = state.config.levelStars || {};
    return Object.values(s).reduce((a, b) => a + (b || 0), 0);
};

// One Today's Goal as a compact row (icon · label + progress bar · reward).
// Shared by the menu card and the complete-screen strip; `fresh` marks a goal
// that completed on this very clear so it can pop in.
const goalRow = (g, fresh = false) => `
    <div class="sb-goal-row ${g.done ? 'done' : ''} ${fresh ? 'fresh' : ''}">
        <div class="sb-goal-ic ${g.tint}">${icons[g.icon] || icons.check}</div>
        <div class="sb-goal-main">
            <div class="sb-goal-label">${g.label}</div>
            <div class="sb-progress thin sb-goal-bar"><span style="width:${Math.min(100, Math.round((g.current / g.target) * 100))}%;"></span></div>
        </div>
        ${g.done
            ? `<span class="sb-goal-done-ic">${icons.check}</span>`
            : g.current > 0
                ? `<span class="sb-mono sb-goal-count">${g.current}/${g.target}</span>`
                : `<span class="sb-goal-reward"><span class="sb-coin-ic">${icons.coin}</span>+${g.reward}</span>`}
    </div>`;

// A small pill for the complete screen's secondary achievements (new best,
// speedrun, streak, mixes, spare trophies) — packs several full-width cards
// into one wrapping row so the action buttons stay above the fold.
const badgeChip = (iconKey, label, tint) => `
    <span class="sb-badge-chip tint-${tint}">
        <span class="sb-badge-chip-ic">${icons[iconKey] || icons.check}</span>
        <span class="sb-badge-chip-label">${label}</span>
    </span>`;

// Compact version of a Today's Goal row for the complete-screen strip (the
// menu keeps the full goalRow above). `fresh` pops the chip when it just
// completed on this very clear.
const goalMiniChip = (g, fresh = false) => `
    <span class="sb-goal-chip ${g.done ? 'done' : ''} ${fresh ? 'fresh' : ''}" title="${esc(g.label)}">
        <span class="sb-goal-chip-ic ${g.tint}">${icons[g.icon] || icons.check}</span>
        <span class="sb-goal-chip-val">${g.done ? icons.check : `${g.current}/${g.target}`}</span>
    </span>`;

const fmtTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const getSavedNormalLevel = () => {
    try {
        const activeMode = localStorage.getItem('snapblocks.activeMode.v1');
        if (activeMode && activeMode !== 'normal') return null;
        const raw = localStorage.getItem('snapblocks.activeLevel.v1');
        if (!raw) return null;
        const save = JSON.parse(raw);
        if (!save || save.version !== 1 || typeof save.level !== 'number') return null;
        if (save.level < 0 || save.level >= LEVELS.length) return null;
        return save.level;
    } catch (e) {
        return null;
    }
};

// =========================================================================
// Faded World — map helpers
// =========================================================================

// The level a place card should launch: the player's current spot inside the
// chapter (clamped to the chapter's range) so tapping always resumes sensibly.
const chapterLaunchLevel = (ch) => {
    const start = chapterStart(ch);
    const end = chapterEnd(ch);
    return Math.max(start, Math.min(clearedCount(), end));
};

// A single storybook place card (scene + name + state).
const placeCard = (ch) => {
    const restored = isChapterRestored(ch);
    const active = ch === activeChapter();
    const locked = !restored && !active;
    const prog = restored ? 1 : (active ? chapterProgress(ch) : 0);
    const cls = restored ? 'restored' : active ? 'active' : 'locked';
    // Tapping a place opens the enlarged before/after viewer (which has the
    // Play / Continue button below). Locked places aren't interactive.
    const act = locked ? '' : `data-action="view-scene" data-chapter="${ch}" role="button" tabindex="0"`;
    return `
        <div class="sb-place-card ${cls}" ${act}>
            <div class="sb-place-scene sb-scene" data-stage="${stageOf(ch)}">${sceneSVG(ch)}</div>
            <div class="sb-place-meta">
                <div class="sb-place-name">${locked ? '???' : placeName(ch)}</div>
                <div class="sb-place-sub">${restored ? 'Restored' : active ? `${Math.round(prog * CHAPTER_SIZE)}/${CHAPTER_SIZE} levels` : 'Locked'}</div>
            </div>
            ${active ? `<div class="sb-place-bar"><span style="width:${(prog * 100).toFixed(0)}%"></span></div>` : ''}
            ${restored ? `<div class="sb-place-badge">${icons.check || '✓'}</div>` : ''}
        </div>`;
};

// =========================================================================
// SCREENS
// =========================================================================

export const SCREENS = {};

// ---------- Faded World map ----------
SCREENS.map = () => {
    const total = chapterCount();
    const active = activeChapter();
    // Windowed: render the band of chapters around the player's progress so the
    // DOM stays light even at 1,000 levels / 100 places.
    const from = Math.max(0, active - 6);
    const to = Math.min(total - 1, active + 9);
    let body = '';
    let lastLand = null;
    for (let ch = from; ch <= to; ch++) {
        const land = landName(ch);
        if (land !== lastLand) {
            body += `<div class="sb-map-land">${land}</div>`;
            lastLand = land;
        }
        body += placeCard(ch);
    }
    return `
        <div class="sb-app-header">
            <button class="sb-icon-btn" data-nav="menu" aria-label="Back">${icons.back}</button>
            <div class="sb-h-md">Your World</div>
            <span class="sb-chip">${restoredPlaces()} / ${total}</span>
        </div>
        <div class="sb-screen-body sb-px sb-map-scroll">
            ${body}
        </div>`;
};

// ---------- Restoration reveal (staged: meadow @L3, sky @L6, full @L10) ----
SCREENS.reveal = () => {
    const ch = state.justRestoredChapter >= 0 ? state.justRestoredChapter : activeChapter();
    const stage = state.justRestoredStage || 3;
    const info = STAGE_INFO[stage] || STAGE_INFO[3];
    const total = chapterCount();
    const isFull = stage >= 3;
    // The scene starts at the previous stage and blooms up to the new one.
    const sub = isFull
        ? `${restoredPlaces()} of ${total} places brought back to life`
        : info.body;
    return `
        <div class="sb-reveal" data-stage-target="${stage}">
            <div class="sb-reveal-tag">${landName(ch)} · ${placeName(ch)}</div>
            <div class="sb-reveal-title">${info.title}</div>
            <div class="sb-reveal-scene sb-scene" data-reveal-scene data-stage="${stage - 1}">${sceneSVG(ch)}</div>
            <div class="sb-reveal-name">${isFull ? placeName(ch) : info.body}</div>
            ${isFull ? `<div class="sb-reveal-sub">${sub}</div>` : `<div class="sb-reveal-sub">Keep mixing — more color awaits.</div>`}
            ${(state.levelCoinsEarned?.granted || 0) > 0 ? `
                <div class="sb-chip sb-reveal-coins">
                    <span class="sb-coin-ic">${icons.coin}</span>
                    +${state.levelCoinsEarned.granted} coins${state.levelCoinsEarned.chapter ? ' · restoration bonus' : ''}
                </div>
            ` : ''}
            <button class="sb-btn sb-grow" data-action="show-complete-after-reveal" style="margin-top:8px;">${icons.trophy} View rewards</button>
            ${isFull ? `<button class="sb-btn ghost sb-grow" data-nav="map" style="margin-top:10px;">View the map</button>` : ''}
        </div>`;
};

// ---------- Splash ----------
// One brand, one screen. The studio ident that used to play first (navy aurora
// + PlayCool lockup, ~1.6s) is gone: it showed a second brand in a different
// palette before the game's own, and pushed time-to-first-tap past 2.8s. This
// is the game's cream world from the very first frame.
SCREENS.splash = () => `
    <div class="sb-splash sb-launch-splash">
        <div class="sb-splash-blob b1" aria-hidden="true"></div>
        <div class="sb-splash-blob b2" aria-hidden="true"></div>
        <div class="sb-splash-blob b3" aria-hidden="true"></div>
        <div class="sb-app-intro">
            <div class="sb-splash-logo">${appLogo(116)}</div>
            <div style="text-align:center;">
                ${wordmarkBig()}
                <div class="sb-label sb-splash-tagline">Mix colors · Restore the world</div>
            </div>
            <div class="sb-splash-loader">
                <div class="sb-splash-loader-fill"></div>
            </div>
        </div>
        <div class="sb-splash-studio">PlayCool Studio</div>
    </div>
`;

// ---------- Onboarding ----------
SCREENS.onboarding = () => {
    const allSteps = [
        {
            tag: 'Your goal',
            title: 'The world lost its color',
            body: 'Solve puzzles to bring it back, place by place — and watch a faded storybook world light up as you go.',
            art: `
                <div class="sb-onboarding-frame"></div>
                <div class="sb-onboarding-piece" style="top:52px; left:46px; width:78px; height:78px; background:var(--coral); filter:grayscale(1) brightness(1.05); transform:rotate(-4deg); box-shadow:0 6px 0 rgba(0,0,0,.12);"></div>
                <div class="sb-onboarding-piece" style="top:52px; left:154px; width:78px; height:78px; background:var(--sky); filter:grayscale(1) brightness(1.05); transform:rotate(3deg); box-shadow:0 6px 0 rgba(0,0,0,.12);"></div>
                <div class="sb-onboarding-piece" style="top:150px; left:100px; width:86px; height:78px; background:var(--mint); transform:rotate(2deg); box-shadow:0 6px 0 oklch(from var(--mint) calc(l - 0.12) c h);"></div>
                <div class="sb-onboarding-hint" style="top:158px; left:108px;">✨</div>
            `,
        },
        {
            tag: 'How to play',
            title: 'Drag, grow, snap',
            body: 'Pull pieces from the tray into the frame. They grow under your finger so placement stays clear, then snap when close.',
            art: `
                <div class="sb-onboarding-frame"></div>
                <div class="sb-onboarding-slot" style="top:52px; left:52px; width:78px; height:78px;"></div>
                <div class="sb-onboarding-piece sb-tour-drag-piece" style="top:146px; left:52px; width:70px; height:70px; background:var(--butter); box-shadow:0 6px 0 oklch(from var(--butter) calc(l - 0.12) c h);"></div>
                <div class="sb-onboarding-trail"></div>
                <div class="sb-onboarding-slot strong" style="top:52px; left:146px; width:78px; height:78px;"></div>
                <div class="sb-onboarding-hint" style="top:64px; left:160px;">${icons.check}</div>
            `,
        },
        {
            tag: 'Color magic',
            title: 'Mix colors to solve',
            body: 'Some cells need two colors combined. Drop a yellow piece and a blue piece together — they bloom into green. Red + yellow makes orange, blue + red makes purple.',
            art: `
                <div class="sb-onboarding-frame"></div>
                <div class="sb-onboarding-piece" style="top:96px; left:30px; width:64px; height:64px; background:var(--butter); transform:rotate(-5deg); box-shadow:0 6px 0 oklch(from var(--butter) calc(l - 0.12) c h);"></div>
                <div class="sb-onboarding-mixop" style="top:112px; left:104px;">+</div>
                <div class="sb-onboarding-piece" style="top:96px; left:128px; width:64px; height:64px; background:var(--sky); transform:rotate(4deg); box-shadow:0 6px 0 oklch(from var(--sky) calc(l - 0.12) c h);"></div>
                <div class="sb-onboarding-mixop" style="top:112px; left:200px;">=</div>
                <div class="sb-onboarding-piece sb-onboarding-mixresult" style="top:92px; left:222px; width:72px; height:72px; background:var(--mint); box-shadow:0 6px 0 oklch(from var(--mint) calc(l - 0.12) c h), 0 0 28px oklch(from var(--mint) l c h / 0.7);"></div>
            `,
        },
        {
            tag: 'When stuck',
            title: 'Earn coins, spend on help',
            body: `Coins buy a Hint (${HINT_COST}) or auto-Solve a piece (${SOLVE_COST}). Earn them from levels, Focus Prism, and optional rewarded ads — never required.`,
            art: `
                <div class="sb-onboarding-frame"></div>
                <div class="sb-tour-hint-orb">${icons.bulb}</div>
                <div class="sb-tour-reward-card"><span>${icons.coin}</span><b>+coins</b></div>
                <div class="sb-tour-reward-card second"><span>${icons.prismMix}</span><b>Prism reward</b></div>
            `,
        },
        {
            tag: 'Daily play',
            title: 'One fresh prism every day',
            body: 'Daily Focus Prism gives a clean challenge and extra hints on first clear. Come back daily to build your streak.',
            art: `
                <div class="sb-tour-daily">
                    <div class="sb-tour-calendar">
                        <span>M</span><span>T</span><span>W</span><span class="lit">${icons.check}</span><span>F</span><span>S</span><span class="now">${icons.focus}</span>
                    </div>
                    <div class="sb-tour-prism">${icons.prismMix}</div>
                    <div class="sb-tour-streak">${icons.flame} Streak</div>
                </div>
            `,
        },
    ];
    // First run: just the fantasy + the signature mechanic, then straight into
    // the interactive tutorial (which teaches drag/snap hands-on). The full
    // 5-card deck stays available as the replayable "Game tour" from the menu.
    const tourMode = !!state.onboardingTourMode;
    const steps = tourMode ? allSteps : [allSteps[0], allSteps[2]];
    const step = Math.max(0, Math.min(steps.length - 1, state.onboardingStep || 0));
    const item = steps[step];
    const isLast = step === steps.length - 1;
    const finishAction = tourMode ? 'skip-onboarding' : 'finish-onboarding';
    const finishLabel = tourMode ? 'Done' : 'Start playing';

    return `
    <div class="sb-app-header">
        <span class="sb-label" data-action="skip-onboarding" style="cursor:pointer; color:var(--ink-soft);">Skip</span>
        <span></span>
        <span class="sb-label" style="color:var(--primary)">${step + 1} / ${steps.length}</span>
    </div>
    <div class="sb-screen-body sb-px" style="display:flex; flex-direction:column; gap:28px; align-items:center; text-align:center; padding-top:16px; padding-bottom:20px;">
        <div class="sb-onboarding-illust">${item.art}</div>
        <div class="sb-col" style="gap:12px; max-width:300px;">
            <div class="sb-label" style="color:var(--primary);">${item.tag}</div>
            <div class="sb-h-lg">${item.title}</div>
            <div class="sb-body">${item.body}</div>
        </div>
        <div class="sb-onboarding-dots">
            ${steps.map((_, idx) => `<span class="${idx === step ? 'active' : ''}"></span>`).join('')}
        </div>
        <div class="sb-row" style="width:100%; gap:10px; margin-top:auto; padding-top:20px;">
            ${step > 0 ? `<button class="sb-btn ghost sb-grow" data-action="prev-onboarding">${icons.back} Back</button>` : ''}
            <button class="sb-btn sb-grow" data-action="${isLast ? finishAction : 'next-onboarding'}">
                ${isLast ? finishLabel : 'Next'} ${icons.chevronR}
            </button>
        </div>
    </div>
`;
};

// ---------- Level intro (shown before a level starts) ----------
// Sets the scene: place + land, level number, and the goal. The timer doesn't
// start until "Start" (the game screen mounts), so reading this is free.
const FROST_MIN_LEVEL = 30; // mirror of game.js — frost begins on shape-tier from here
SCREENS['level-intro'] = () => {
    const cfg = state.config;
    const idx = state.introLevel?.idx ?? (cfg.unlocked || 0);
    const ch = chapterOf(idx);
    const meta = LEVEL_META[idx] || {};
    const isPrism = meta.kind === 'prism';
    const isFrost = meta.tier === 'shape' && idx >= FROST_MIN_LEVEL;
    const isPulse = !isPrism && !isFrost && isPulseLevel(idx);
    // isTreasureLevel already excludes prism/frost levels, but isPrism/isFrost
    // are checked first below since they take precedence in the UI.
    const isTreasure = !isPrism && !isFrost && isTreasureLevel(idx);

    // ----- level-specific details -----
    // ANCHORED levels replace LEVELS[idx] with their own grid at load time, so
    // read that one or the Grid stat below advertises a board the player will
    // never see.
    const level = getAnchoredGrid(idx) || LEVELS[idx] || [];
    const gridDim = level.length || 0;
    // Difficulty label + accent, derived from the level's tier / kind.
    // The generated tiers repeat per chapter, so raw labels would show "Hard"
    // inside chapter 1 — everything in the first three chapters reads one
    // notch friendlier so the early curve keeps the player's trust.
    const earlyGame = idx < 30;
    let diff = 'Easy', diffColor = 'var(--mint)';
    if (isPrism) { diff = 'Prism'; diffColor = 'var(--lilac)'; }
    else if (isPulse) { diff = 'Pulse'; diffColor = 'var(--pulse-violet, var(--lilac))'; }
    else if (isFrost) { diff = 'Frost'; diffColor = 'var(--sky)'; }
    else if (isTreasure) { diff = 'Treasure'; diffColor = 'var(--butter)'; }
    else if (meta.tier === 'hard') {
        diff = earlyGame ? 'Medium' : 'Hard';
        diffColor = earlyGame ? 'var(--butter)' : 'var(--coral)';
    }
    else if (meta.tier === 'med') {
        diff = earlyGame ? 'Easy' : 'Medium';
        diffColor = earlyGame ? 'var(--mint)' : 'var(--butter)';
    }
    else if (meta.tier === 'shape') { diff = 'Shapes'; diffColor = 'var(--rose)'; }
    // Personal best for this level (stars + time), if played before.
    const starsBest = (cfg.levelStars || {})[idx] || 0;
    const bestSec = (cfg.levelBestSec || {})[idx];
    const bestLabel = starsBest
        ? `${'★'.repeat(starsBest)}${'☆'.repeat(3 - starsBest)}${Number.isFinite(bestSec) ? ` · ${fmtTime(bestSec)}` : ''}`
        : 'First try';

    let goalIcon = icons.shieldCheck, goalAccent = 'sb-bg-mint', goalTitle = 'Fill the board', goalBody = 'Place every piece to bring this place back to color.';
    if (isPrism) {
        goalIcon = icons.prismMix; goalAccent = 'sb-bg-lilac'; goalTitle = 'Prism Challenge';
        const g = meta.objective?.mixGoal;
        goalBody = g ? `Create ${g} color mix${g > 1 ? 'es' : ''} to clear it.` : 'Mix colors together to clear the board.';
    } else if (isPulse) {
        goalIcon = icons.powerPulse; goalAccent = 'sb-bg-pulse'; goalTitle = 'Prism Pulse';
        goalBody = `Light all ${PULSE_NODE_COUNT} power nodes to release an aurora pulse and earn +${REWARD_PULSE} bonus coins.`;
    } else if (isFrost) {
        goalIcon = '❄'; goalAccent = 'sb-bg-sky'; goalTitle = 'Frost level';
        goalBody = 'One piece is frozen — place the others first to melt it free.';
    } else if (isTreasure) {
        goalIcon = icons.treasureChest; goalAccent = 'sb-bg-butter'; goalTitle = 'Treasure level';
        goalBody = `Clear it to crack open the coin chest — +${REWARD_TREASURE} coins first time.`;
    } else if (meta.mix) {
        goalIcon = icons.prismMix; goalAccent = 'sb-bg-lilac'; goalTitle = 'Color mixing';
        goalBody = 'Some cells need two colors dropped into them to mix.';
    }

    const stat = (label, value, color) => `
        <div class="sb-intro-stat">
            <div class="sb-intro-stat-val" ${color ? `style="color:${color};"` : ''}>${value}</div>
            <div class="sb-label">${label}</div>
        </div>`;

    return `
        <div class="sb-app-header">
            <button class="sb-icon-btn" data-nav="menu" aria-label="Back">${icons.back}</button>
            <span class="sb-label" style="color:var(--primary)">${landName(ch)}</span>
            <span class="sb-mono sb-small">${ch + 1} / ${chapterCount()}</span>
        </div>
        <div class="sb-screen-body sb-px sb-level-intro${isTreasure ? ' sb-intro-treasure' : ''}${isPulse ? ' sb-intro-pulse' : ''}">
            ${state.tutorialJustFinished ? `
                <div class="sb-card-inset" style="display:flex; gap:12px; align-items:center; padding:12px 16px; text-align:left;">
                    <div class="sb-pause-icon sb-bg-mint" style="width:40px; height:40px; border-radius:12px; margin:0;">${icons.levelComplete}</div>
                    <div class="sb-grow">
                        <div style="font-weight:800; font-size:14px;">Tutorial complete · +${REWARD_TUTORIAL} coins</div>
                        <div class="sb-small">You know the moves — time to restore your first place.</div>
                    </div>
                </div>
            ` : ''}
            <div class="sb-intro-scene sb-scene" data-stage="${stageOf(ch)}">${sceneSVG(ch)}</div>
            <div class="sb-intro-head">
                <div class="sb-h-xl sb-intro-num">Level ${idx + 1}</div>
                <div class="sb-body sb-intro-place">${placeName(ch)} · ${landName(ch)}</div>
            </div>
            <div class="sb-intro-stats">
                ${stat('Grid', `${gridDim}×${gridDim}`)}
                ${stat('Difficulty', diff, diffColor)}
                ${stat('Your best', bestLabel, starsBest ? 'var(--butter)' : 'var(--ink-soft)')}
            </div>
            <div class="sb-card sb-intro-goal">
                <div class="sb-pause-icon ${goalAccent}" style="width:46px; height:46px; border-radius:14px; margin:0;">${goalIcon}</div>
                <div class="sb-grow" style="text-align:left;">
                    <div class="sb-h-sm">${goalTitle}</div>
                    <div class="sb-small">${goalBody}</div>
                </div>
            </div>
            <button class="sb-btn sb-intro-start" data-nav="game" data-level="${idx}">${icons.play} Start level ${idx + 1}</button>
        </div>
    `;
};

// ---------- Main Menu ----------
SCREENS.menu = () => {
    const cfg = state.config;
    const savedLevel = getSavedNormalLevel();
    const continueLevelIdx = savedLevel ?? (cfg.unlocked || 0);
    const current = continueLevelIdx + 1;
    const solvedCount = Object.keys(cfg.levelStars || {}).length;
    const trophiesEarned = (cfg.trophies || []).length;
    const dailyStatus = getDailyStatus(getLocalDateKey(), cfg);
    const goals = getTodaysGoals(cfg);
    const goalsDone = goals.filter(g => g.done).length;
    // Goal coins are DAY-scoped, so this card is their home. They used to be
    // folded into the level-complete headline, where a goal settling on a
    // random clear made that number look arbitrary. Reported here they stay
    // attached to the thing that actually earned them, and the "to go" figure
    // doubles as the reason to open the next level.
    const goalCoinsBanked = goals.reduce((n, g) => n + (g.done ? g.reward : 0), 0);
    const goalCoinsLeft = goals.reduce((n, g) => n + (g.done ? 0 : g.reward), 0);
    return `
        <div class="sb-app-header">
            <div class="sb-row" style="gap:8px">${menuAppLogo(30)}${wordmark()}</div>
            <div class="sb-row" style="gap:8px;">
                <button class="sb-icon-btn" data-action="replay-tour" aria-label="Game tour" title="Game tour">${icons.info}</button>
                <button class="sb-icon-btn" data-nav="settings" aria-label="Settings">${icons.gear}</button>
            </div>
        </div>
        <div class="sb-screen-body sb-px" style="padding-bottom:20px;">
            <!-- Hero PLAY card — sortpuz-style: one dominant action -->
            <div class="sb-world-card sb-hero-continue sb-hero-play">
                <div class="sb-row sb-between" style="margin-bottom:14px;">
                    <span class="sb-label" style="color:inherit; opacity:0.78;">${savedLevel === null ? 'Up next' : 'Resume'}</span>
                    ${isPulseLevel(continueLevelIdx)
                        ? `<span class="sb-chip sb-hero-chip sb-hero-chip-pulse">${icons.powerPulse} Prism Pulse!</span>`
                        : isTreasureLevel(continueLevelIdx)
                        ? `<span class="sb-chip sb-hero-chip sb-hero-chip-treasure">${icons.treasureChest} Treasure level!</span>`
                        : (cfg.streak || 0) >= 1
                            ? `<span class="sb-chip sb-hero-chip">${icons.flame} ${cfg.streak} day streak</span>`
                            : `<span class="sb-chip sb-hero-chip">${icons.coin} ${getCoins()} coins</span>`}
                </div>
                <div class="sb-h-xl" style="color:inherit;">Level ${String(current).padStart(2, '0')}</div>
                <div class="sb-body sb-hero-body">
                    ${(cfg.levelStars && cfg.levelStars[continueLevelIdx])
                        ? `Best: ${'★'.repeat(cfg.levelStars[continueLevelIdx])}${'☆'.repeat(3 - cfg.levelStars[continueLevelIdx])}`
                        : `Restoring ${placeName(activeChapter())}`}
                </div>
                <button class="sb-btn dark sb-hero-play-btn" data-action="resume" data-level="${continueLevelIdx}">
                    ${icons.play} <span>Play</span>
                </button>
            </div>
            <!-- Today's Goals — the short-term reasons to play right now -->
            <div class="sb-card sb-goals-card">
                <div class="sb-row sb-between">
                    <div class="sb-label">Today's goals</div>
                    <span class="sb-chip soft">${goalsDone === goals.length ? `${icons.check} All done` : `${goalsDone} / ${goals.length}`}</span>
                </div>
                ${goals.map(g => goalRow(g)).join('')}
                <div class="sb-goals-ledger">
                    <span class="sb-coin-ic">${icons.coin}</span>
                    ${goalCoinsBanked > 0
                        ? `<strong>+${goalCoinsBanked} coins</strong> banked today${goalCoinsLeft > 0 ? ` · +${goalCoinsLeft} still to go` : ''}`
                        : `<strong>+${goalCoinsLeft} coins</strong> to earn today`}
                </div>
            </div>
            <!-- Secondary tiles — meta loops only, no Levels tile (sortpuz-style) -->
            <div class="sb-menu-grid">
                <div class="sb-menu-tile" data-nav="daily">
                    <div class="sb-tile-icon sb-bg-coral sb-icon-calendar">${icons.calendar}</div>
                    <div>
                        <div class="sb-h-sm">Daily</div>
                        <div class="sb-small">${dailyStatus}</div>
                    </div>
                    ${dailyStatus === 'Completed' ? '' : '<span class="sb-tile-dot"></span>'}
                </div>
                <div class="sb-menu-tile" data-nav="map">
                    <div class="sb-tile-icon sb-icon-world">${icons.world}</div>
                    <div>
                        <div class="sb-h-sm">World</div>
                        <div class="sb-small">${landName(activeChapter())}</div>
                    </div>
                </div>
                <div class="sb-menu-tile" data-nav="trophies">
                    <div class="sb-tile-icon sb-bg-butter sb-icon-trophy">${icons.trophy}</div>
                    <div>
                        <div class="sb-h-sm">Trophies</div>
                        <div class="sb-small">${trophiesEarned} / ${TROPHIES.length} earned</div>
                    </div>
                </div>
                <!-- LAB (prototype) — temporary sandbox entry point. Remove this
                     tile together with the LAB block further down this file. -->
                <!-- <div class="sb-menu-tile" data-nav="lab">
                    <div class="sb-tile-icon sb-bg-mint">${icons.flask}</div>
                    <div>
                        <div class="sb-h-sm">Lab</div>
                        <div class="sb-small">10 experiments</div>
                    </div>
                </div> -->
                <!-- Shop hidden during closed testing — IAP lands in open testing. -->
                <div class="sb-menu-tile" data-nav="shop" style="display:none;">
                    <div class="sb-tile-icon sb-bg-lilac">${icons.gem}</div>
                    <div>
                        <div class="sb-h-sm">Shop</div>
                        <div class="sb-small">Hint packs · Themes</div>
                    </div>
                </div>
            </div>
        </div>
    `;
};

// ---------- Level Select ----------
SCREENS.levels = () => {
    const cfg = state.config;
    const unlocked = cfg.unlocked || 0;
    const stars = cfg.levelStars || {};
    const totalLv = LEVELS.length;

    const nodes = [];
    for (let i = 0; i < totalLv; i++) {
        const n = i + 1;
        const st = i < unlocked ? 'done' : i === unlocked ? 'current' : 'locked';
        // Every 10th level is a "boss" with a conic-gradient halo
        const boss = (n % 10 === 0);
        nodes.push(levelNode(n, st, stars[i] || 0, boss));
    }

    const currentWorld = Math.min(chapterCount() - 1, chapterOf(unlocked));
    const currentWorldName = placeName(currentWorld);
    const nextWorldName = currentWorld + 1 < chapterCount() ? placeName(currentWorld + 1) : '';
    const levelsToNextWorld = Math.max(0, chapterStart(currentWorld + 1) - unlocked);

    return `
        <div class="sb-app-header">
            <button class="sb-icon-btn" data-nav="menu" aria-label="Back">${icons.back}</button>
            <div style="font-weight:900; font-size:18px;">Levels</div>
            <span></span>
        </div>
        <div class="sb-screen-body sb-px" style="padding-bottom:20px; display:flex; flex-direction:column; gap:20px;">
            <div class="sb-card-inset" style="display:flex; align-items:center; gap:14px; padding:14px 16px;">
                <div class="sb-level-banner-icon">${icons.journey}</div>
                <div class="sb-grow">
                    <div class="sb-label">World ${currentWorld + 1} · ${currentWorldName}</div>
                    <div class="sb-h-sm" style="margin-top:2px;">Level ${Math.min(unlocked + 1, totalLv)} of ${totalLv}</div>
                    <div class="sb-progress thin" style="margin-top:8px;">
                        <span style="width:${Math.min(100, (unlocked / totalLv) * 100)}%;"></span>
                    </div>
                </div>
            </div>
            <div class="sb-level-grid">${nodes.join('')}</div>
            ${nextWorldName ? `
                <div class="sb-card sb-row" style="gap:12px; align-items:center;">
                    <div class="sb-level-banner-icon sb-bg-butter">${icons.crown}</div>
                    <div class="sb-grow">
                        <div class="sb-h-sm">Complete ${levelsToNextWorld} more to unlock ${nextWorldName}</div>
                        <div class="sb-small">Next place · ${CHAPTER_SIZE} new puzzles</div>
                    </div>
                    ${icons.chevronR}
                </div>
            ` : `
                <div class="sb-card sb-row" style="gap:12px; align-items:center;">
                    <div class="sb-level-banner-icon sb-bg-butter">${icons.crown}</div>
                    <div class="sb-grow">
                        <div class="sb-h-sm">All places unlocked!</div>
                        <div class="sb-small">Go for 3 stars on every level.</div>
                    </div>
                </div>
            `}
        </div>
    `;
};

// ---------- Gameplay HUD (chrome over the canvas) ----------
SCREENS.game = () => {
    const cfg = state.config;
    const lv = state.currentLevel || 0;
    const total = state.nPieces || 0;
    const placed = 0; // live HUD update comes in Phase 2; for now shows static
    const isDaily = state.gameMode === 'daily';
    const isTutorial = state.gameMode === 'tutorial';
    const meta = LEVEL_META[lv] || {};
    const isPrism = meta.kind === 'prism';
    const isPulse = !!state.pulseActive;
    const objective = state.levelObjectiveProgress || null;

    // Tutorial mode: replace the standard HUD/controls with a focused
    // coachmark + skip link. The simpler chrome keeps new players' attention
    // on the actual drag-and-drop mechanic.
    if (isTutorial) {
        // Coach copy lives in tutorial.js (single source of truth) — step 3 is
        // the first Prism Mix, the game's signature moment, and MUST say so.
        const tutorialSteps = TUTORIAL_COACH;
        const stepIdx = Math.max(0, Math.min(tutorialSteps.length - 1, state.tutorialStep || 0));
        const coach = tutorialSteps[stepIdx];
        return `
            <div class="sb-game-top">
                <span></span>
                <div class="sb-grow" style="text-align:center;">
                    <div class="sb-label" style="color:var(--primary);">Tutorial · ${stepIdx + 1} of ${tutorialSteps.length}</div>
                    <div class="sb-row" style="gap:6px; margin-top:6px; justify-content:center;">
                        ${tutorialSteps.map((_, i) => `<span class="sb-tut-pip ${i <= stepIdx ? 'on' : ''}"></span>`).join('')}
                    </div>
                </div>
                <button class="sb-icon-btn" data-action="skip-tutorial" aria-label="Skip tutorial">${icons.close || '×'}</button>
            </div>
            <div class="sb-coachmark">
                <div class="sb-coachmark-bubble">
                    <div class="sb-h-sm">${coach.title}</div>
                    <div class="sb-body" style="margin-top:4px;">${coach.body}</div>
                </div>
                <div class="sb-coachmark-arrow"></div>
            </div>
            <div class="sb-grow" aria-hidden="true"></div>
            <div class="sb-control-bar">
                <button class="sb-ctrl sb-grow" data-action="skip-tutorial" aria-label="Skip tutorial">
                    <span class="sb-ctrl-label">Skip tutorial</span>
                </button>
            </div>
        `;
    }

    // Solve now sits in the HUD next to Hint rather than two taps deep in the
    // pause sheet. Same unlock gate the sheet used (level 5+, or any Daily), so
    // the button cannot appear while a new player is still learning the board —
    // and the Lab never shows it, because lab boards have no solve pipeline.
    const hudCanSolve = !isLabMode() && (isDaily || lv >= 4);

    // Special levels add a chip beside the count. With Hint + Solve now on the
    // left, that chip is the item that tips the row over the width it has, so
    // the count sheds its "BLOCKS" label instead of the row overflowing. The
    // flag is computed here rather than with :has() so behaviour does not
    // depend on the Android WebView version shipped with a given device.
    const hudHasChip = isPulse || !!objective || (meta.mix && !isLabMode()) || isLabMode();

    // Five-element HUD: hint · solve · blocks remaining · coins · menu.
    //
    // The Hint and Solve buttons deliberately show no number. They used to
    // print their COST ("10" / "20"), which every player read as a balance —
    // "I have 10 hints" — and then hit the paywall sheet on the very next tap.
    // Price now lives in the aria-label and in the "Need more coins" sheet;
    // the digit on screen is the balance, which is the thing a player can act
    // on. The pill reuses .sb-coin-pill (complete screen) in a compact HUD
    // variant, and carries data-hud="coins" so the existing updateHud calls
    // drive it with no new wiring, plus data-coin-target for the coin-fly.
    //
    // Everything else moved or went away. The live timer is gone from play (a
    // ticking clock fights the "calm puzzle" positioning) — it is still tracked
    // in state and still shown on the complete screen for best-time badges.
    // The level title and progress bar moved to the menu sheet, and Undo /
    // Reset moved there too, which retires the bottom control bar entirely and
    // gives the board and tray the full screen.
    //
    // Special levels add exactly one chip beside the count, never more.
    return `
        <div class="sb-game-top">
            <div class="sb-hud">
                <div class="sb-hud-side">
                ${isLabMode() ? labHudSpacer() : `
                <button class="sb-hud-btn sb-hud-hint sb-premium-help-action" data-action="use-hint" aria-label="Hint (${HINT_COST} coins)">
                    ${icons.bulb}
                </button>
                ${hudCanSolve ? `
                <button class="sb-hud-btn sb-hud-solve sb-premium-help-action" data-action="solve-piece" aria-label="Solve one piece (${SOLVE_COST} coins)">
                    ${icons.wand}
                </button>` : ''}`}
                </div>
                <div class="sb-hud-center${hudHasChip ? ' sb-hud-center-chip' : ''}">
                    ${labHudChip()}
                    <div class="sb-hud-count" title="Blocks placed">
                        <span class="sb-mono" data-hud="count">${placed}/${total}</span>
                        <span class="sb-hud-count-label">blocks</span>
                    </div>
                    ${isPulse ? `
                        <div class="sb-chip sb-mix-chip sb-pulse-chip" title="Prism Pulse power nodes">
                            <span>${icons.powerPulse}</span>
                            <span class="sb-mono" data-hud="pulse">${state.pulseCharged || 0}/${PULSE_NODE_COUNT}</span>
                        </div>
                    ` : objective ? `
                        <div class="sb-chip sb-mix-chip" title="${objective.label}">
                            <span style="color: var(--lilac)">${icons.prismMix}</span>
                            <span class="sb-mono" data-hud="objective">${objective.current}/${objective.total}</span>
                        </div>
                    ` : (meta.mix && !isLabMode()) ? `
                        <div class="sb-chip sb-mix-chip" title="Prism Mixes this level">
                            <span style="color: var(--lilac)">${icons.prismMix}</span>
                            <span class="sb-mono" data-hud="mixes">${state.levelMixes || 0}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="sb-hud-side sb-hud-side-end">
                    ${isLabMode() ? '' : `
                    <div class="sb-coin-pill sb-hud-coins" data-coin-target title="Coins" aria-label="Coins">
                        <span class="sb-coin-ic">${icons.coin}</span>
                        <span class="sb-mono" data-hud="coins">${getCoins()}</span>
                    </div>`}
                    <button class="sb-hud-btn" data-nav="pause" aria-label="Menu">${icons.menu}</button>
                </div>
            </div>
        </div>
        ${isPulse && !cfg.pulseCoachSeen ? `
            <div class="sb-coachmark sb-mix-coach sb-pulse-coach">
                <div class="sb-coachmark-bubble">
                    <div class="sb-h-sm">${icons.powerPulse} Prism Pulse</div>
                    <div class="sb-body" style="margin-top:4px;">Three power nodes are glowing on the board. Complete those cells to charge the meter — the third node releases a full aurora pulse.</div>
                    <button class="sb-btn ghost" data-action="dismiss-pulse-coach" style="margin-top:10px;">Charge it</button>
                </div>
                <div class="sb-coachmark-arrow"></div>
            </div>
        ` : ''}
        ${state.frostActive && !cfg.frostCoachSeen ? `
            <div class="sb-coachmark sb-mix-coach">
                <div class="sb-coachmark-bubble">
                    <div class="sb-h-sm">❄ Frost level</div>
                    <div class="sb-body" style="margin-top:4px;">One piece is frozen solid. Place the other pieces first — every placement melts it a little, and the counter shows how many to go.</div>
                    <button class="sb-btn ghost" data-action="dismiss-frost-coach" style="margin-top:10px;">Got it</button>
                </div>
                <div class="sb-coachmark-arrow"></div>
            </div>
        ` : ''}
        ${state.anchoredActive && !cfg.anchoredCoachSeen ? `
            <div class="sb-coachmark sb-mix-coach">
                <div class="sb-coachmark-bubble">
                    <div class="sb-h-sm">${icons.lock} Anchored level</div>
                    <div class="sb-body" style="margin-top:4px;">Some pieces are already fixed inside the board. They cannot be moved — fit every loose piece around them.</div>
                    <button class="sb-btn ghost" data-action="dismiss-anchored-coach" style="margin-top:10px;">Got it</button>
                </div>
                <div class="sb-coachmark-arrow"></div>
            </div>
        ` : ''}
        ${(meta.mix || objective?.type === 'mix') && !cfg.mixCoachSeen ? `
            <div class="sb-coachmark sb-mix-coach">
                <div class="sb-coachmark-bubble">
                    <div class="sb-h-sm">${isPrism ? 'Prism Challenge' : 'Prism Mix discovered'}</div>
                    <div class="sb-body" style="margin-top:4px;">Some cells need two colors. Drop a yellow piece and a blue piece in the same cell to mix them into green — same for red+yellow and blue+red. Each mix is worth +500 bonus.</div>
                    <button class="sb-btn ghost" data-action="dismiss-mix-coach" style="margin-top:10px;">Got it</button>
                </div>
                <div class="sb-coachmark-arrow"></div>
            </div>
        ` : ''}
        <div class="sb-grow" aria-hidden="true"></div>
    `;
};

// ---------- Pause / menu sheet (overlay on game) ----------
// This is now the game screen's only menu. With the bottom control bar retired,
// the level actions that used to live there (Undo / Reset / Solve) and the
// settings entry live here, one tap from the HUD's menu button.
SCREENS.pause = () => {
    const lv = state.currentLevel || 0;
    const cfg = state.config;
    const isDaily = state.gameMode === 'daily';
    const isLab = isLabMode(); // LAB (prototype)
    const title = isLab ? 'a Lab prototype' : isDaily ? 'Focus Prism' : `Level ${lv + 1}`;
    // Reset from level 4, always available on the Daily. Reset routes through the
    // normal level pipeline, so the Lab swaps in its own Restart instead.
    //
    // Undo and Solve used to live here too. Solve moved to the HUD, where a paid
    // action belongs — burying a spend button two taps deep under "Paused" meant
    // players in trouble never found it. Undo went with it rather than sitting
    // alone: an undo you have to pause the game to reach is not an undo, and the
    // action is still wired in js/ui/index.js for a future in-play control.
    const canReset = !isLab && (isDaily || lv >= 3);
    return `
        <div class="sb-sheet">
            <div class="sb-sheet-handle"></div>
            <div style="text-align:center; padding:0 8px;">
                <div class="sb-pause-icon sb-bg-butter">${icons.pause}</div>
                <div class="sb-h-lg">Paused</div>
                <div class="sb-body" style="margin-top:6px;">${isLab
                    ? 'You are on <b>a Lab prototype</b>. Nothing here is saved to your progress.'
                    : `Your progress on <b>${title}</b> is saved.`}</div>
                ${(() => {
                    // Prime the pause sheet with the current live values so the
                    // numbers are correct the instant the sheet opens. Live HUD
                    // updates take over from the next tickHud cycle.
                    const elapsed = state.playing && state.levelStartTime
                        ? Math.max(0, Math.floor((Date.now() - state.levelStartTime) / 1000))
                        : (state.levelElapsed || 0);
                    const m = Math.floor(elapsed / 60);
                    const s = elapsed % 60;
                    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                    const placed = (state.pieces || []).reduce((n, p) => n + (p.placed ? 1 : 0), 0);
                    const total = state.nPieces || 0;
                    return `
                <div class="sb-card-inset" style="display:flex; justify-content:space-around; margin-top:20px; padding:14px;">
                    <div>
                        <div class="sb-label">Time</div>
                        <div class="sb-mono" data-hud="pause-time" style="font-size:18px; font-weight:700; margin-top:2px;">${timeStr}</div>
                    </div>
                    <div style="width:1px; background:var(--line);"></div>
                    <div>
                        <div class="sb-label">Pieces</div>
                        <div class="sb-mono" data-hud="pause-count" style="font-size:18px; font-weight:700; margin-top:2px;">${placed} / ${total}</div>
                    </div>
                    <div style="width:1px; background:var(--line);"></div>
                    <div>
                        <div class="sb-label">Coins</div>
                        <div class="sb-mono" data-hud="coins" style="font-size:18px; font-weight:700; margin-top:2px;">${getCoins()}</div>
                    </div>
                </div>`;
                })()}
                <div class="sb-sheet-actions">
                    ${canReset ? `
                    <button class="sb-sheet-action" data-action="reset-level" aria-label="Reset level">
                        <span class="sb-sheet-action-icon">${icons.refresh}</span>
                        <span class="sb-sheet-action-label">Reset</span>
                    </button>
                    ` : ''}
                    ${isLab ? labPauseAction() : ''}
                    <button class="sb-sheet-action" data-nav="game-settings" aria-label="Settings">
                        <span class="sb-sheet-action-icon">${icons.gear}</span>
                        <span class="sb-sheet-action-label">Settings</span>
                    </button>
                </div>
                <div class="sb-col" style="gap:10px; margin-top:18px;">
                    <button class="sb-btn" data-action="close-overlay">${icons.play} Keep playing</button>
                    <button class="sb-btn ghost" data-action="quit-to-menu">${isLab ? 'Back to Lab' : 'Quit to menu'}</button>
                </div>
                <div class="sb-row" style="justify-content:center; gap:6px; margin-top:16px; color:var(--ink-soft);">
                    ${icons.info} <span class="sb-label" style="color:var(--ink-soft);">${isLab ? 'Prototype · not saved' : 'Autosave active'}</span>
                </div>
            </div>
        </div>
    `;
};
// ---------- In-game settings sheet ----------
SCREENS['game-settings'] = () => {
    const cfg = state.config;
    const themeLabels = { cream: 'Cream', midnight: 'Midnight', meadow: 'Meadow', sunset: 'Sunset' };
    const themeLabel = themeLabels[cfg.theme] || 'Cream';
    // Cycling only makes sense with 2+ unlocked themes — with just one, the
    // row was a silent dead end. Show the unlock hint instead.
    const unlockedThemes = THEME_UNLOCKS.filter(t => isThemeUnlocked(t.key, cfg));
    const canCycle = unlockedThemes.length > 1;
    const nextUnlock = THEME_UNLOCKS.find(t => !isThemeUnlocked(t.key, cfg));
    return `
        <div class="sb-sheet sb-game-settings-sheet">
            <div class="sb-sheet-handle"></div>
            <div class="sb-row sb-between" style="gap:12px; margin-bottom:16px;">
                <div class="sb-grow">
                    <div class="sb-h-md">Settings</div>
                    <div class="sb-small">Customize this level</div>
                </div>
                <button class="sb-icon-btn" data-action="close-overlay" aria-label="Close">${icons.close}</button>
            </div>
            <div class="sb-card">
                <div class="sb-setting-row" ${canCycle ? 'data-action="cycle-theme"' : ''}>
                    <div class="sb-row" style="gap:12px;">
                        <span style="color:var(--butter)">${icons.palette}</span>
                        <div>
                            <div style="font-weight:700;">Theme</div>
                            <div class="sb-small">${canCycle
                                ? `${themeLabel} · tap to switch`
                                : nextUnlock
                                    ? `${themeLabel} · ${nextUnlock.stars}★ unlocks ${nextUnlock.label}`
                                    : themeLabel}</div>
                        </div>
                    </div>
                    ${canCycle ? icons.chevronR : `<span style="opacity:0.5;">${icons.lock}</span>`}
                </div>
                <div class="sb-setting-row" data-action="toggle-sound">
                    <div class="sb-row" style="gap:12px;">
                        <span style="color:var(--sky)">${cfg.sound ? icons.volume : icons.mute}</span>
                        <span style="font-weight:700;">Sound effects</span>
                    </div>
                    <div class="sb-toggle ${cfg.sound ? 'on' : ''}"></div>
                </div>
                <div class="sb-setting-row" data-action="toggle-music">
                    <div class="sb-row" style="gap:12px;">
                        <span style="color:var(--lilac)">${cfg.music ? icons.music : icons.musicOff}</span>
                        <span style="font-weight:700;">Music</span>
                    </div>
                    <div class="sb-toggle ${cfg.music ? 'on' : ''}"></div>
                </div>
                <div class="sb-setting-row" data-action="replay-tour">
                    <div class="sb-row" style="gap:12px;">
                        <span style="color:var(--mint)">${icons.info}</span>
                        <div>
                            <div style="font-weight:700;">Game tour</div>
                            <div class="sb-small">Review goals, hints, dailies, and controls</div>
                        </div>
                    </div>
                    ${icons.chevronR}
                </div>
            </div>
            <button class="sb-btn ghost" data-action="close-overlay" style="margin-top:16px;">Done</button>
        </div>
    `;
};
// ---------- Out-of-coins prompt (overlay) ----------
SCREENS.ad = () => {
    const cfg = state.config;
    const daily = getDailyPuzzle(getLocalDateKey(), cfg);
    const dailyDone = isDailyCompleted(getLocalDateKey(), cfg);
    // Without an ad transport the rewarded row below is dropped, so the copy
    // must not promise a video that will never load — Focus Prism becomes the
    // only faucet this sheet can honestly point at.
    const dailyCopy = caps.ads
        ? (dailyDone
            ? 'Watch a short ad for coins, or replay Focus Prism to improve your best.'
            : `Watch a short ad for coins, or clear Focus Prism for +${daily.rewardCoins} coins.`)
        : (dailyDone
            ? 'Replay Focus Prism to improve your best, or earn more coins by clearing levels.'
            : `Clear Focus Prism for +${daily.rewardCoins} coins.`);
    // state.coinPrompt is set by promptForCoins() to name the help the player
    // just reached for, so the heading says what it costs instead of a generic
    // "need more coins". Null (opened some other way) keeps the generic line.
    const want = state.coinPrompt;
    const title = want === 'hint'  ? `Hint costs ${HINT_COST} coins`
                : want === 'solve' ? `Solve costs ${SOLVE_COST} coins`
                : 'Need more coins';
    const have = want ? `You have ${getCoins()}. ` : '';
    // Focus Prism is the secondary CTA only while the rewarded ad owns the
    // primary slot; without ads it is this sheet's only way forward.
    const dailyBtnClass = caps.ads ? 'sb-btn ghost' : 'sb-btn';
    return `
    <div class="sb-sheet">
        <div class="sb-sheet-handle"></div>
        <div style="padding:0 4px;">
            <div class="sb-row" style="gap:12px; margin-bottom:18px;">
                <div class="sb-pause-icon sb-bg-butter" style="width:56px; height:56px; border-radius:18px; flex:0 0 auto;">${icons.coin}</div>
                <div class="sb-grow">
                    <div class="sb-h-md">${title}</div>
                    <div class="sb-small">${have}${dailyCopy}</div>
                </div>
            </div>
            ${caps.ads ? `
            <div class="sb-card-inset" style="margin-top:6px; padding:12px 14px; display:flex; gap:10px; align-items:center;">
                <div class="sb-pause-icon sb-bg-butter" style="width:36px; height:36px; border-radius:12px; color:oklch(35% 0.07 80);">${icons.play}</div>
                <div class="sb-grow">
                    <div style="font-weight:800; font-size:14px;">Rewarded ad · +${REWARDED_AD_COINS} coins</div>
                    <div class="sb-small" data-ad-status>A short video — about 30 seconds.</div>
                </div>
            </div>` : ''}
            <div class="sb-card-inset" style="margin-top:6px; padding:12px 14px; display:flex; gap:10px; align-items:center;">
                <div class="sb-pause-icon sb-bg-mint" style="width:36px; height:36px; border-radius:12px; color:oklch(25% 0.05 160);">${icons.calendar}</div>
                <div class="sb-grow">
                    <div style="font-weight:800; font-size:14px;">Focus Prism · +${daily.rewardCoins} coins</div>
                    <div class="sb-small">${dailyDone ? 'Reward claimed today. Replays improve your best.' : 'A fresh focus puzzle every day.'}</div>
                </div>
            </div>
            <div class="sb-col" style="gap:10px; margin-top:18px;">
                ${caps.ads ? `<button class="sb-btn" data-action="watch-ad-for-hint">${icons.play} Watch ad for coins</button>` : ''}
                ${dailyDone
                    ? `<button class="${dailyBtnClass}" data-nav="daily">${icons.calendar} Replay Focus Prism</button>`
                    : `<button class="${dailyBtnClass}" data-nav="daily">${icons.calendar} Play Focus Prism</button>`}
                <button class="sb-btn" data-action="close-overlay" style="background:transparent; color:var(--ink-soft); box-shadow:none; height:40px;">Maybe later</button>
            </div>
        </div>
    </div>
    `;
};

// ---------- Occasional store-rating request (overlay) ----------
// This is deliberately neutral and carries no coin reward. Store policies
// prohibit incentivized reviews, and an app cannot verify that a rating was
// actually submitted after the listing opens.
SCREENS.rating = () => `
    <div class="sb-sheet">
        <div class="sb-sheet-handle"></div>
        <div style="text-align:center; padding:0 6px;">
            <div class="sb-pause-icon sb-bg-butter" style="width:68px; height:68px; border-radius:22px; margin:0 auto; color:#7a5810;">${icons.star}</div>
            <div class="sb-h-lg" style="margin-top:16px;">Rate SnapBlocks</div>
            <div class="sb-body" style="margin:8px auto 0; max-width:320px;">Enjoying the puzzles? Your honest rating helps more players discover SnapBlocks.</div>
            <div class="sb-rating-stars" aria-hidden="true" style="display:flex; justify-content:center; gap:6px; margin-top:16px; color:var(--butter);">
                ${icons.star}${icons.star}${icons.star}${icons.star}${icons.star}
            </div>
            <div class="sb-col" style="gap:10px; margin-top:20px;">
                <button class="sb-btn" data-action="rating-rate-now">${icons.star} Rate SnapBlocks</button>
                <button class="sb-btn ghost" data-action="rating-later">Not now</button>
            </div>
        </div>
    </div>
`;

// ---------- Reward earned (coins) + double-via-ad ----------
SCREENS.reward = () => {
    const info = state.rewardInfo || { amount: 10, doubled: false };
    const base = info.amount || 10;
    const total = info.doubled ? base * 2 : base;
    return `
    <div class="sb-sheet sb-reward-sheet">
        <div class="sb-sheet-handle"></div>
        <div class="sb-reward-body">
            <div class="sb-reward-orb">${icons.coin}</div>
            <div class="sb-reward-amount">+${total}</div>
            <div class="sb-reward-label">coins earned${info.doubled ? ' — doubled!' : '!'}</div>
            <div class="sb-col" style="gap:10px; margin-top:20px; width:100%;">
                ${info.doubled
                    ? `<button class="sb-btn" data-action="close-reward">${icons.check} Claim ${total} coins</button>`
                    : `<button class="sb-btn sb-reward-double" data-action="double-reward">${icons.play} Double it — watch ad</button>
                       <button class="sb-btn ghost" data-action="close-reward">Claim +${base}</button>`}
            </div>
        </div>
    </div>
    `;
};

// ---------- Scene viewer (before / after) ----------
// Tapping the eye on a place opens this: the storybook scene enlarged, shown
// both faded (Before) and in full color (After) so players see exactly what
// their solving brings back. For an in-progress place, "After" is the goal.
SCREENS['scene-view'] = () => {
    const ch = state.viewSceneChapter >= 0 ? state.viewSceneChapter : activeChapter();
    const restored = isChapterRestored(ch);
    const active = ch === activeChapter();
    const prog = restored ? 1 : (active ? chapterProgress(ch) : 0);
    const afterLabel = restored ? 'After' : 'Goal';
    const svg = sceneSVG(ch);
    return `
    <div class="sb-sheet sb-scene-viewer">
        <div class="sb-sheet-handle"></div>
        <div class="sb-row sb-between" style="align-items:flex-start; margin-bottom:14px;">
            <div class="sb-grow">
                <div class="sb-h-md">${placeName(ch)}</div>
                <div class="sb-small">${landName(ch)} · ${restored ? 'Restored' : `${Math.round(prog * CHAPTER_SIZE)}/${CHAPTER_SIZE} levels`}</div>
            </div>
            <button class="sb-icon-btn" data-action="close-overlay" aria-label="Close">${icons.close}</button>
        </div>
        <div class="sb-scene-compare">
            <div class="sb-scene-frame">
                <div class="sb-scene sb-scene-large" data-stage="0">${svg}</div>
                <span class="sb-scene-tag">Before</span>
            </div>
            <div class="sb-scene-frame">
                <div class="sb-scene sb-scene-large" data-stage="3">${svg}</div>
                <span class="sb-scene-tag lit">${afterLabel}</span>
            </div>
        </div>
        <div class="sb-col" style="gap:10px; margin-top:16px;">
            <button class="sb-btn" data-nav="game" data-level="${chapterLaunchLevel(ch)}">
                ${icons.play} ${restored ? 'Replay this place' : active ? 'Continue restoring' : 'Play'}
            </button>
            <button class="sb-btn ghost" data-action="close-overlay">Close</button>
        </div>
    </div>`;
};

// ---------- Update available (overlay) ----------
SCREENS.update = () => {
    const info = state.updateInfo || {};
    const forced = !!info.forced;
    return `
    <div class="sb-sheet sb-update-sheet">
        <div class="sb-sheet-handle"></div>
        <div style="text-align:center; padding:0 6px;">
            <div class="sb-update-logo">${appLogo(72)}</div>
            <div class="sb-h-lg" style="margin-top:14px;">${esc(info.title) || 'New update available'}</div>
            ${info.versionName ? `<div class="sb-label" style="color:var(--primary); margin-top:4px;">Version ${esc(info.versionName)}</div>` : ''}
            <div class="sb-body" style="margin-top:8px;">${esc(info.message) || 'A new version is ready with the latest fixes and content.'}</div>
            <div class="sb-col" style="gap:10px; margin-top:20px;">
                <button class="sb-btn" data-action="update-now">${icons.play} Update now</button>
                ${forced
                    ? `<div class="sb-small" style="color:var(--ink-soft);">This update is required to keep playing.</div>`
                    : `<button class="sb-btn ghost" data-action="update-later">Later</button>`}
            </div>
        </div>
    </div>
    `;
};

// ---------- Level Complete ----------
SCREENS.complete = () => {
    const lv = state.currentLevel || 0;
    const sec = state.levelElapsed || 0;
    const isDaily = state.gameMode === 'daily';
    const meta = LEVEL_META[lv] || {};
    const isPrism = meta.kind === 'prism';
    const isPulse = !!state.pulseActive;
    const prismReward = state.prismReward || 0;
    const pulseReward = state.pulseReward || 0;
    const daily = isDaily ? getDailyPuzzle(state.dailyDateKey || getLocalDateKey()) : null;
    const dailyResult = state.dailyResult || null;
    const clearResult = state.levelClearResult || null;
    const hintsUsed = state.levelHintsUsed || 0;
    const resets    = state.levelResets    || 0;
    // Stars are skill-based (hints/resets), not time-based.
    const stars = state.levelStars
        || (isDaily ? 1
            : (hintsUsed === 0 && resets === 0) ? 3
            : (hintsUsed <= 1 && resets <= 1) ? 2
            : 1);
    const focusLabel = isDaily
        ? (dailyResult?.focusLabel || getFocusLabel({
            stars,
            hintsUsed,
            resets,
        }))
        : '';
    const mixCount   = state.levelMixes || 0;
    const objective = state.levelObjectiveProgress || null;
    // Forward-looking nudge toward the next restoration. Speed still accrues
    // to the trophy, but the complete screen focuses on progress.
    const restoreNudge = (!isDaily) ? nextRestoration() : null;
    // The nudge line is a single row of vertical budget — treasure anticipation
    // wins over the restore nudge when a chest is close (1-2 levels out), since
    // "one more level" beats a farther-off milestone. Never both.
    const treasureNudgeIn = (!isDaily) ? nextTreasureIn(lv + 1) : -1;
    const showTreasureNudge = treasureNudgeIn >= 1 && treasureNudgeIn <= 2;
    const pulseNudgeIn = (!isDaily) ? nextPulseIn(lv + 1) : -1;
    const showPulseNudge = !showTreasureNudge && pulseNudgeIn >= 1 && pulseNudgeIn <= 2;

    // Coins THIS LEVEL paid. Today's Goals and streak milestones are day-scoped
    // and no longer counted here: they are earned across a whole day but used to
    // land on whichever level ended last, which is what made this number swing
    // between 5 and 90+ on adjacent clears. They are still granted immediately;
    // they are acknowledged below as coin-free chips and reported on the menu.
    const coinsEarned = state.levelCoinsEarned || {};
    const goalsJustDone = state.goalsCompleted || [];
    const streakBonus = state.streakMilestoneReward || null;
    const dailyCoinsGranted = dailyResult?.rewardCoinsGranted || 0;
    // coinsEarned.granted is the post-cap bundle and already includes
    // prism/pulse; the sum is the fallback for a pre-cap state shape.
    const levelBundle = Number.isFinite(coinsEarned.granted)
        ? coinsEarned.granted
        : (coinsEarned.total || 0) + prismReward + pulseReward;
    const earnedTotal = levelBundle + dailyCoinsGranted;
    const earnedBits = [];
    if (coinsEarned.firstClear) earnedBits.push(`First clear +${coinsEarned.firstClear}`);
    if (coinsEarned.chapter) earnedBits.push(`Place restored +${coinsEarned.chapter}`);
    if (dailyCoinsGranted) earnedBits.push(`Daily +${dailyCoinsGranted}`);
    if (prismReward > 0) earnedBits.push(`Prism +${prismReward}`);
    if (pulseReward > 0) earnedBits.push(`Prism Pulse +${pulseReward}`);
    if (coinsEarned.treasure) earnedBits.push(`Treasure +${coinsEarned.treasure}`);
    // The cap trimmed the payout, so the line items above sum higher than the
    // headline. Say so rather than letting the arithmetic look broken.
    if (coinsEarned.capped) earnedBits.push(`capped at ${earnedTotal - dailyCoinsGranted}`);
    const goals = getTodaysGoals();
    const freshGoalIds = new Set(goalsJustDone.map(g => g.id));

    // At most one trophy card is shown; any extras collapse into a chip.
    const trophyIds = clearResult?.trophies || [];
    const primaryTrophy = trophyIds.length ? TROPHIES.find(tr => tr.id === trophyIds[0]) : null;
    const extraTrophyCount = Math.max(0, trophyIds.length - (primaryTrophy ? 1 : 0));

    // Secondary achievements (new best / speedrun / streak / mixes / objective
    // / spare trophies) compact into one wrapping chip row.
    const badgeChips = [];
    if (clearResult?.bestTime?.isNewBest && clearResult.bestTime.previousSec !== null) {
        badgeChips.push(badgeChip('clock', `New best ${fmtTime(sec)}`, 'sky'));
    }
    if (clearResult?.isSpeedrun) {
        badgeChips.push(badgeChip('flame', 'Speedrun', 'coral'));
    }
    // Day-scoped acknowledgements — no coin figure, because their coins are
    // banked to the DAY (menu goals card / Daily streak chip), not to this
    // level's headline. The milestone chip supersedes the plain streak chip.
    if (streakBonus) {
        badgeChips.push(badgeChip('flame', `${streakBonus.days}-day streak reward`, 'butter'));
    } else if (clearResult?.streakGrew && (clearResult.streak || 0) >= 2) {
        badgeChips.push(badgeChip('flame', `${clearResult.streak}-day streak`, 'butter'));
    }
    goalsJustDone.forEach(g => {
        badgeChips.push(badgeChip('check', `Goal complete · ${g.label}`, 'mint'));
    });
    if (mixCount > 0) {
        badgeChips.push(badgeChip('prismMix', `${mixCount} Prism Mix${mixCount === 1 ? '' : 'es'}`, 'lilac'));
    }
    if (objective?.complete) {
        badgeChips.push(badgeChip('gem', 'Prism goal done', 'mint'));
    }
    if (extraTrophyCount > 0) {
        badgeChips.push(badgeChip('trophy', `+${extraTrophyCount} more troph${extraTrophyCount === 1 ? 'y' : 'ies'}`, 'coral'));
    }
    if (coinsEarned.treasure) {
        badgeChips.push(badgeChip('treasureChest', 'Treasure!', 'butter'));
    }
    if (isPulse && state.pulseCharged >= PULSE_NODE_COUNT) {
        badgeChips.push(badgeChip('powerPulse', 'Aurora Pulse!', 'lilac'));
    }

    // Celebration tier — 3 stars gets the loudest, 1 star the quietest.
    // Tier shapes confetti volume, headline copy, accent colour, and burst count.
    const tier = isDaily ? 'daily' : stars === 3 ? 'flawless' : stars === 2 ? 'solid' : 'cleared';
    const tierConfig = {
        flawless: {
            title: 'Flawless!',
            sub:   'No hints. No resets. Pure instinct.',
            medalBg:    'var(--butter)',
            medalColor: 'oklch(35% 0.07 80)',
            confetti: 64,
            burstRays: 20,
            confettiPalette: ['var(--butter)', 'var(--coral)', 'var(--rose)', 'var(--lilac)', 'var(--mint)', 'var(--sky)'],
        },
        solid: {
            title: 'Great clear!',
            sub:   `Used ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}${resets ? `, ${resets} reset${resets === 1 ? '' : 's'}` : ''}.`,
            medalBg:    'var(--mint)',
            medalColor: 'oklch(25% 0.05 160)',
            confetti: 36,
            burstRays: 14,
            confettiPalette: ['var(--mint)', 'var(--sky)', 'var(--lilac)', 'var(--butter)'],
        },
        cleared: {
            title: 'Solved!',
            sub:   'Practice makes perfect — try again hint-free for 3 stars.',
            medalBg:    'var(--sky)',
            medalColor: 'oklch(25% 0.05 240)',
            confetti: 16,
            burstRays: 8,
            confettiPalette: ['var(--sky)', 'var(--lilac)'],
        },
        daily: {
            title: 'Focus Complete',
            sub:   focusLabel,
            medalBg:    'var(--lilac)',
            medalColor: 'oklch(25% 0.05 290)',
            confetti: 44,
            burstRays: 18,
            confettiPalette: ['var(--coral)', 'var(--butter)', 'var(--mint)', 'var(--sky)', 'var(--lilac)', 'var(--rose)'],
        },
    };
    const t = tierConfig[tier];

    const reducedMotion = state.config.reducedMotion;
    const confettiCount = reducedMotion ? 0 : t.confetti;
    const palette = t.confettiPalette;
    const confetti = [];
    const bursts = [];
    for (let i = 0; i < confettiCount; i++) {
        const left = Math.floor(Math.random() * 100);
        const hue = palette[i % palette.length];
        const rot = Math.floor(Math.random() * 360);
        const delay = (Math.random() * 0.9).toFixed(2);
        const dur = (2.4 + Math.random() * 1.6).toFixed(2);
        const w = 6 + Math.floor(Math.random() * 6);
        const h = 10 + Math.floor(Math.random() * 8);
        confetti.push(`<span class="sb-confetti-piece" style="left:${left}%; background:${hue}; width:${w}px; height:${h}px; transform:rotate(${rot}deg); animation-delay:${delay}s; animation-duration:${dur}s;"></span>`);
    }
    if (!reducedMotion) {
        const rays = t.burstRays;
        for (let i = 0; i < rays; i++) {
            const angle = Math.floor((360 / rays) * i);
            const color = palette[i % palette.length];
            bursts.push(`<span class="sb-burst-ray" style="--a:${angle}deg; --c:${color}; animation-delay:${(0.18 + i * 0.015).toFixed(2)}s;"></span>`);
        }
    }

    return `
        <div class="sb-confetti-host">${confetti.join('')}</div>
        <div class="sb-app-header sb-complete-header">
            <div class="sb-coin-pill" data-coin-target title="Coins" aria-label="Coins">
                <span class="sb-coin-ic">${icons.coin}</span>
                <span class="sb-mono" data-hud="coins">${getCoins()}</span>
            </div>
            <div class="sb-row" style="gap:8px;">${appLogo(30)}${wordmark()}</div>
            <button class="sb-icon-btn" data-action="quit-to-menu" aria-label="Close">${icons.close}</button>
        </div>
        <div class="sb-screen-body sb-px sb-complete-body" style="display:flex; flex-direction:column; gap:8px; padding-bottom:14px; text-align:center;">
            <div class="sb-complete-hero sb-complete-hero-compact sb-complete-tier-${tier}">
                <div class="sb-burst-host">${bursts.join('')}</div>
                <div class="sb-complete-medal" style="background:${t.medalBg}; color:${t.medalColor};">${isDaily ? icons.focus : isPulse ? icons.powerPulse : isPrism ? icons.prismMix : icons.levelComplete}</div>
                <span class="sb-label" style="color:var(--primary)">${isDaily ? `${formatDailyDate(daily.dateKey)} focus` : isPulse ? `Prism Pulse ${String(lv + 1).padStart(2, '0')}` : isPrism ? `Prism Challenge ${String(lv + 1).padStart(2, '0')}` : `Level ${String(lv + 1).padStart(2, '0')} complete`}</span>
                <div class="sb-h-xl">${t.title}</div>
                <div class="sb-body" style="margin-top:-2px;">${t.sub}</div>
            </div>
            <div class="sb-row sb-star-row" style="justify-content:center; gap:10px; margin:0;">
                ${[1, 2, 3].map(i => `
                    <svg class="sb-star ${i <= stars ? 'filled' : 'empty'}${i === 2 && stars >= 2 ? ' big' : ''}" viewBox="0 0 24 24" style="--i:${i};">
                        <path d="M12 2.5l2.9 6.4 7 .7-5.3 4.7 1.6 6.8L12 17.7 5.8 21l1.6-6.8L2.1 9.6l7-.7z" fill="currentColor"/>
                    </svg>
                `).join('')}
            </div>
            ${earnedTotal > 0 ? `
                <div class="sb-card-inset sb-badge-row sb-coins-earned" style="display:flex; gap:12px; align-items:center; padding:12px 16px; text-align:left;">
                    <div class="sb-pause-icon sb-bg-butter" style="width:40px; height:40px; border-radius:12px; margin:0;">${icons.coin}</div>
                    <div class="sb-grow" style="min-width:0;">
                        <div style="font-weight:800; font-size:14px;" data-earned-count="${earnedTotal}">+${earnedTotal} coins earned</div>
                        <div class="sb-small sb-coins-earned-bits">${earnedBits.join(' · ')}</div>
                    </div>
                </div>
            ` : ''}
            ${primaryTrophy ? `
                <div class="sb-card-inset sb-badge-row sb-complete-trophy-card" style="display:flex; gap:10px; align-items:center; padding:8px 12px; text-align:left;">
                    <div class="sb-pause-icon" style="width:38px; height:38px; border-radius:12px; background:${primaryTrophy.color}; color:#fff;">${icons[primaryTrophy.icon] || icons.trophy}</div>
                    <div class="sb-grow" style="min-width:0;">
                        <div style="font-weight:800; font-size:14px;">Trophy earned · ${primaryTrophy.title}</div>
                        <div class="sb-small sb-coins-earned-bits">${primaryTrophy.sub}</div>
                    </div>
                </div>
            ` : ''}
            ${badgeChips.length ? `<div class="sb-badge-chip-row">${badgeChips.join('')}</div>` : ''}
            ${state.rewardInfo && state.rewardInfo.amount > 0 && !state.rewardInfo.doubled ? `
                <button class="sb-btn soft sb-double-inline" data-action="double-reward" style="display:flex; gap:10px; align-items:center; justify-content:center;">
                    ${icons.play} ${state.rewardInfo.preGranted && !state.rewardInfo.floored ? 'Double your coins — watch a short ad' : `Watch a short ad for +${state.rewardInfo.amount} coins`}
                </button>
            ` : (state.rewardInfo && state.rewardInfo.doubled ? `
                <div class="sb-small" style="color:var(--mint); font-weight:700;">${icons.check} ${state.rewardInfo.preGranted && !state.rewardInfo.floored ? 'Coins doubled!' : `+${state.rewardInfo.amount} coins added!`}</div>
            ` : '')}
            <div class="sb-complete-goals-strip">
                <span class="sb-label sb-goals-strip-label">Goals</span>
                <div class="sb-goals-strip-chips">
                    ${goals.map(g => goalMiniChip(g, freshGoalIds.has(g.id))).join('')}
                </div>
            </div>
            ${!isDaily && showTreasureNudge ? `
                <div class="sb-restore-nudge-line sb-treasure-nudge-line">
                    <span class="sb-restore-nudge-ic sb-treasure-nudge-ic">${icons.treasureChest}</span>
                    ✦ Treasure level in ${treasureNudgeIn}
                </div>
            ` : !isDaily && showPulseNudge ? `
                <div class="sb-restore-nudge-line sb-pulse-nudge-line">
                    <span class="sb-restore-nudge-ic">${icons.powerPulse}</span>
                    Prism Pulse in ${pulseNudgeIn} ${pulseNudgeIn === 1 ? 'level' : 'levels'}
                </div>
            ` : !isDaily && restoreNudge ? `
                <div class="sb-restore-nudge-line">
                    <span class="sb-restore-nudge-ic">${icons.restore}</span>
                    ${restoreNudge.remaining} more ${restoreNudge.remaining === 1 ? 'level' : 'levels'} until ${restoreNudge.what}
                </div>
            ` : ''}
            <div class="sb-col sb-complete-actions" style="gap:10px; margin-top:auto;">
                ${isDaily
                    ? `<button class="sb-btn" data-nav="daily">${icons.calendar} Back to Daily</button>` : `<button class="sb-btn" data-action="next-level">Next level ${icons.chevronR}</button>`}
                <div class="sb-row" style="gap:10px;">
                    <button class="sb-btn ghost sb-grow" data-action="replay">${icons.refresh} Replay</button>
                    <button class="sb-btn ghost sb-grow" data-action="share-score">${icons.share} Share</button>
                </div>
            </div>
        </div>
    `;
};

// (legacy SCREENS.daily removed — Focus Prism override below is the single definition.)
// Clean completion result — the solved board is the keepsake. The previous
// dense template remains above for history, but this focused assignment is the
// active screen used by the UI router.
SCREENS.complete = () => {
    const lv = state.currentLevel || 0;
    const isDaily = state.gameMode === 'daily';
    const meta = LEVEL_META[lv] || {};
    const isPrism = meta.kind === 'prism';
    const isPulse = !!state.pulseActive;
    const daily = isDaily ? getDailyPuzzle(state.dailyDateKey || getLocalDateKey()) : null;
    const dailyResult = state.dailyResult || null;
    const hintsUsed = state.levelHintsUsed || 0;
    const resets = state.levelResets || 0;
    const stars = state.levelStars
        || (isDaily ? 1
            : (hintsUsed === 0 && resets === 0) ? 3
            : (hintsUsed <= 1 && resets <= 1) ? 2
            : 1);

    // ONE number, and it means ONE thing: what THIS LEVEL paid. That is the
    // capped bundle game.js granted (first clear + chapter restore + treasure +
    // Prism + Prism Pulse) plus the Daily reward, since on a Daily run that
    // puzzle IS the level just played.
    //
    // Today's Goals and streak milestones are NOT here. They are day-scoped —
    // earned over a whole day, but they settled on whichever level ended last,
    // so the headline swung from 5 to 90+ between adjacent clears and the
    // player could never learn which action paid. They are still credited the
    // instant they complete (missions.js / progression.js); their coins are
    // reported on the menu's Today's goals card and the Daily streak chip, and
    // the moment itself is acknowledged by the coin-free chips below.
    const coinsEarned = state.levelCoinsEarned || {};
    // `granted` is the post-cap figure and already includes prism/pulse; the
    // sum is the fallback for a state shape written before the cap existed.
    const levelBundle = Number.isFinite(coinsEarned.granted)
        ? coinsEarned.granted
        : (coinsEarned.total || 0) + (state.prismReward || 0) + (state.pulseReward || 0);
    const earnedTotal = levelBundle + (dailyResult?.rewardCoinsGranted || 0);

    // Day-scoped moments still get acknowledged — with NO coin figure, because
    // their coins belong to the day, not to this level's headline. Reuses the
    // shared badgeChip so this screen doesn't grow a parallel chip component.
    const dayChips = [];
    (state.goalsCompleted || []).forEach(goal => {
        dayChips.push(badgeChip('check', `Goal complete · ${goal.label}`, 'mint'));
    });
    if (state.streakMilestoneReward) {
        dayChips.push(badgeChip('flame', `${state.streakMilestoneReward.days}-day streak reward`, 'butter'));
    }

    const snapshot = state.completedBoardSnapshot || '';
    const levelLabel = isDaily
        ? `${formatDailyDate(daily.dateKey)} focus complete`
        : isPulse
            ? `Prism Pulse ${String(lv + 1).padStart(2, '0')} complete`
            : isPrism
                ? `Prism Challenge ${String(lv + 1).padStart(2, '0')} complete`
                : `Level ${String(lv + 1).padStart(2, '0')} complete`;
    const rewardInfo = state.rewardInfo || null;
    const canOfferReward = rewardInfo && rewardInfo.amount > 0 && !rewardInfo.doubled;
    // A floored offer paid MORE than a true double, so "Coins doubled!" would
    // undersell it and stop matching the coin pill's delta.
    const doubledCopy = rewardInfo?.preGranted && !rewardInfo.floored
        ? 'Coins doubled!'
        : `+${rewardInfo?.amount || 0} coins added!`;

    return `
        <main class="sb-screen-body sb-complete-clean" aria-labelledby="sb-complete-heading">
            <header class="sb-complete-clean-title">
                <span class="sb-label">${levelLabel}</span>
                <h1 class="sb-complete-clean-heading" id="sb-complete-heading">${isDaily ? 'Focus complete' : 'Solved!'}</h1>
            </header>

            <figure class="sb-complete-puzzle-card" aria-label="Completed SnapBlocks puzzle with ${stars} of 3 stars">
                <div class="sb-complete-snapshot">
                    ${snapshot
                        ? `<img src="${snapshot}" alt="Completed level ${lv + 1} SnapBlocks board">`
                        : `<div class="sb-complete-snapshot-fallback" aria-hidden="true">${icons.levelComplete}</div>`}
                </div>
                <figcaption class="sb-complete-card-stars" aria-label="${stars} out of 3 stars">
                    ${[1, 2, 3].map(i => `
                        <span class="sb-complete-card-star ${i <= stars ? 'filled' : 'empty'}" style="--i:${i};" aria-hidden="true">
                            ${icons.star}
                        </span>
                    `).join('')}
                </figcaption>
            </figure>

            <section class="sb-complete-reward" aria-label="Level reward">
                ${earnedTotal > 0 ? `
                    <div class="sb-complete-reward-line">
                        <span class="sb-complete-reward-coin">${icons.coin}</span>
                        <span data-earned-count="${earnedTotal}">+${earnedTotal} coins</span>
                    </div>
                ` : ''}
                ${canOfferReward ? `
                    <button class="sb-complete-double-btn" data-action="double-reward">
                        ${icons.play}
                        <span>${rewardInfo.preGranted && !rewardInfo.floored ? '2× reward · watch ad' : `Earn +${rewardInfo.amount} coins · watch ad`}</span>
                    </button>
                ` : rewardInfo?.doubled ? `
                    <div class="sb-complete-doubled">${icons.check} ${doubledCopy}</div>
                ` : ''}
                ${dayChips.length ? `<div class="sb-badge-chip-row sb-complete-day-badges">${dayChips.join('')}</div>` : ''}
            </section>

            <div class="sb-complete-clean-actions">
                ${isDaily
                    ? `<button class="sb-btn sb-complete-next" data-nav="daily">${icons.calendar} Back to Daily</button>`
                    : `<button class="sb-btn sb-complete-next" data-action="next-level">Next level ${icons.chevronR}</button>`}
                <div class="sb-complete-secondary-actions">
                    <button class="sb-btn ghost sb-complete-secondary-btn" data-action="replay">${icons.refresh} Replay</button>
                    <button class="sb-btn ghost sb-complete-secondary-btn" data-action="share-score">${icons.share} Share</button>
                </div>
            </div>
        </main>
    `;
};

// ---------- Focus Prism override ----------
SCREENS.daily = () => {
    const cfg = state.config;
    const dateKey = getLocalDateKey();
    const daily = getDailyPuzzle(dateKey, cfg);
    const status = getDailyStatus(dateKey, cfg);
    const completed = isDailyCompleted(dateKey, cfg);
    const best = cfg.dailyBest?.[dateKey] || null;
    const mini = getDailyMiniGrid(daily.levelIndex);
    const cta = status === 'In progress' ? 'Continue Focus' : completed ? 'Replay Prism' : 'Start Focus';
    const week = getWeeklyConstellation(cfg);
    const weeklyCount = week.filter(d => d.completed).length;
    // ONE streak across the whole UI: cfg.streak (days played in a row).
    // dailyStreak stays internal bookkeeping for the constellation.
    const nextMilestone = [3, 5, 7, 14, 30].find(m => m > (cfg.streak || 0)) || 30;

    return `
        <div class="sb-app-header">
            <button class="sb-icon-btn" data-nav="menu" aria-label="Back">${icons.back}</button>
            <div style="font-weight:900; font-size:18px;">Daily</div>
            <span class="sb-chip soft sb-daily-streak-chip">${icons.flame} ${cfg.streak || 0}</span>
        </div>
        <div class="sb-screen-body sb-px sb-daily-screen-body sb-focus-screen-body">
            <div class="sb-world-card sb-focus-hero">
                <div class="sb-row sb-between sb-focus-topline">
                    <span class="sb-label" style="color:inherit; opacity:0.72;">${formatDailyDate(dateKey)}</span>
                    <span class="sb-chip sb-focus-chip">${daily.difficultyLabel}</span>
                </div>
                <div class="sb-focus-hero-main">
                    <div class="sb-hero-mini sb-daily-mini sb-focus-mini" style="grid-template-columns:repeat(${daily.dim},1fr); grid-template-rows:repeat(${daily.dim},1fr);">
                        ${miniBoard(mini)}
                    </div>
                    <div class="sb-grow" style="position:relative; z-index:1;">
                        <div class="sb-h-xl sb-focus-title">Focus Prism</div>
                        <div class="sb-small sb-focus-copy">${daily.subtitle}</div>
                        <div class="sb-row sb-focus-meta">
                            <span class="sb-chip sb-focus-chip">${status}</span>
                            <span class="sb-chip sb-focus-chip"><span style="color:var(--butter)">${icons.coin}</span> +${daily.rewardCoins}</span>
                        </div>
                    </div>
                </div>
                <button class="sb-btn sb-daily-play-btn sb-focus-play-btn" data-action="play-daily" style="margin-top:16px;">
                    ${icons.play} ${cta}
                </button>
            </div>

            <div class="sb-focus-reset">
                <span class="sb-label">New prism in</span>
                <span class="sb-mono" data-hud="daily-reset">${getDailyCountdown()}</span>
            </div>

            ${best ? `
                <div class="sb-card sb-row sb-focus-best" style="gap:12px; align-items:center;">
                    <div class="sb-level-banner-icon sb-bg-mint">${icons.levelComplete}</div>
                    <div class="sb-grow">
                        <div class="sb-label">Today's best</div>
                        <div class="sb-h-sm">${best.stars || 1} star${(best.stars || 1) === 1 ? '' : 's'} · ${fmtTime(best.elapsedSec || 0)}</div>
                        <div class="sb-small">${best.hintsUsed || 0} helps - ${best.resets || 0} resets</div>
                    </div>
                    <span class="sb-focus-star-ring">${best.stars || 1}</span>
                </div>
            ` : `
                <div class="sb-card sb-row sb-focus-best" style="gap:12px; align-items:center;">
                    <div class="sb-level-banner-icon sb-bg-butter">${icons.focus}</div>
                    <div class="sb-grow">
                        <div class="sb-label">Daily challenge</div>
                        <div class="sb-h-sm">Clean solves earn the best stars</div>
                        <div class="sb-small">Time helps. Hints and resets are allowed, but clean play feels best.</div>
                    </div>
                </div>
            `}

            <div class="sb-card sb-focus-constellation">
                <div class="sb-row sb-between" style="gap:12px;">
                    <div>
                        <div class="sb-label">Weekly constellation</div>
                        <div class="sb-h-sm" style="margin-top:2px;">${weeklyCount} / 7 prisms lit</div>
                    </div>
                    <!-- Streak-milestone coins are week-scoped and no longer sit
                         on the level-complete headline, so this is where their
                         value is stated — before they are earned. -->
                    <span class="sb-chip soft sb-streak-next-chip">
                        <span>Next streak ${nextMilestone}</span>
                        <span class="sb-streak-next-coins"><span class="sb-coin-ic">${icons.coin}</span>+${STREAK_MILESTONES[nextMilestone] || 0}</span>
                    </span>
                </div>
                <div class="sb-focus-week">
                    ${week.map((d, idx) => `
                        <div class="sb-focus-day ${d.completed ? 'lit' : ''} ${d.isToday ? 'today' : ''}" style="--i:${idx};">
                            <span class="node">${d.completed ? icons.check : icons.focus}</span>
                            <span class="sb-label">${d.isToday ? 'Now' : d.label}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="sb-card sb-row sb-focus-rules" style="gap:12px; align-items:center;">
                <div class="sb-level-banner-icon sb-bg-lilac">${icons.prismMix}</div>
                <div class="sb-grow">
                    <div class="sb-h-sm">Focus reward</div>
                    <div class="sb-small">First clear grants +${daily.rewardCoins} coins. Replays chase a cleaner solve.</div>
                </div>
            </div>
        </div>
    `;
};

// ---------- Trophies ----------
SCREENS.trophies = () => {
    const cfg = state.config;
    const solved = Object.keys(cfg.levelStars || {}).length;
    const stars = totalStars();
    const earnedIds = new Set(cfg.trophies || []);

    // Partition trophies into earned vs locked using live progression data
    const rows = TROPHIES.map(t => {
        const progress = t.get(cfg);
        const locked = !earnedIds.has(t.id);
        const progressLabel = locked && t.target > 1
            ? `${Math.min(progress, t.target)}/${t.target}`
            : null;
        const iconSvg = icons[t.icon] || icons.trophy;
        return { t, locked, progressLabel, iconSvg };
    });
    const earned = rows.filter(r => !r.locked);
    const locked = rows.filter(r => r.locked);

    const pctEarned = Math.round((earned.length / TROPHIES.length) * 100);
    return `
        <div class="sb-app-header">
            <button class="sb-icon-btn" data-nav="menu" aria-label="Back">${icons.back}</button>
            <div style="font-weight:900; font-size:18px;">Trophy case</div>
            <span class="sb-mono sb-small">${earned.length} / ${TROPHIES.length}</span>
        </div>
        <div class="sb-screen-body sb-px" style="padding-bottom:20px; display:flex; flex-direction:column; gap:16px;">
            <div class="sb-world-card sb-trophy-hero">
                <div class="sb-trophy-hero-ring" style="--pct:${pctEarned};">
                    <span>${earned.length}</span><small>/ ${TROPHIES.length}</small>
                </div>
                <div class="sb-grow">
                    <div class="sb-h-md">${earned.length === TROPHIES.length ? 'Every trophy earned!' : 'Keep collecting'}</div>
                    <div class="sb-small sb-trophy-hero-stats">
                        <span>${icons.levelComplete} ${solved} cleared</span>
                        <span>${icons.star} ${stars} stars</span>
                        <span>${icons.flame} ${cfg.streak || 0}d streak</span>
                    </div>
                </div>
            </div>
            ${earned.length ? `
                <div class="sb-label">Earned · ${earned.length}</div>
                <div class="sb-trophy-grid">
                    ${earned.map(({ t, iconSvg }) => trophyTile(t, false, null, iconSvg)).join('')}
                </div>
            ` : ''}
            ${locked.length ? `
                <div class="sb-label">In progress · ${locked.length}</div>
                <div class="sb-trophy-grid">
                    ${locked.map(({ t, iconSvg, progressLabel }) => trophyTile(t, true, progressLabel, iconSvg)).join('')}
                </div>
            ` : ''}
        </div>
    `;
};

// ---------- Shop ----------
SCREENS.shop = () => {
    const cfg = state.config;
    return `
        <div class="sb-app-header">
            <button class="sb-icon-btn" data-nav="menu" aria-label="Back">${icons.back}</button>
            <div style="font-weight:900; font-size:18px;">Extras</div>
            <div class="sb-chip">${icons.coin} <span class="sb-mono">${getCoins()}</span></div>
        </div>
        <div class="sb-screen-body sb-px" style="padding-bottom:20px; display:flex; flex-direction:column; gap:20px;">
            <div class="sb-world-card sb-hero-remove-ads" style="display:none;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                    <span class="sb-label sb-hero-body">Best value</span>
                    <div style="text-align:right; line-height:1;">
                        <div class="sb-mono" style="font-size:22px; font-weight:900; color:inherit;">$4.99</div>
                        <div class="sb-mono sb-hero-body" style="font-size:12px; text-decoration:line-through; margin-top:4px;">$7.99</div>
                    </div>
                </div>
                <div class="sb-h-md" style="color:inherit; margin-top:10px;">${cfg.adsRemoved ? 'Ads removed · Thank you!' : 'Remove ads forever'}</div>
                <div class="sb-small sb-hero-body">Plus 25 hints &amp; all themes.</div>
            </div>
            <div class="sb-card" style="text-align:center; padding:24px 18px;">
                <div class="sb-pause-icon sb-bg-butter" style="margin:0 auto 14px;">${icons.gem}</div>
                <div class="sb-h-md">Extras are paused for testing</div>
                <div class="sb-body" style="margin-top:8px;">For this first version, hints come from Focus Prism and rewarded ads only.</div>
            </div>
            <div class="sb-label" style="display:none;">Hint packs</div>
            <div style="display:none; grid-template-columns: repeat(3, 1fr); gap:10px;">
                <div class="sb-shop-card">
                    <div class="sb-shop-icon sb-bg-butter">${icons.bulb}</div>
                    <div class="sb-h-sm" style="margin-top:10px;">10 hints</div>
                    <div class="sb-small">Casual pack</div>
                    <div class="sb-price-tag">$1.99</div>
                </div>
                <div class="sb-shop-card best">
                    <div class="sb-badge-ribbon">Popular</div>
                    <div class="sb-shop-icon sb-bg-coral">${icons.bulb}</div>
                    <div class="sb-h-sm" style="margin-top:10px;">30 hints</div>
                    <div class="sb-small">+ 3 bonus</div>
                    <div class="sb-price-tag">$3.99</div>
                </div>
                <div class="sb-shop-card">
                    <div class="sb-shop-icon sb-bg-lilac">${icons.bulb}</div>
                    <div class="sb-h-sm" style="margin-top:10px;">100 hints</div>
                    <div class="sb-small">+ 20 bonus</div>
                    <div class="sb-price-tag">$7.99</div>
                </div>
            </div>
            <div class="sb-label" style="display:none;">Themes</div>
            <div style="display:none; grid-template-columns: 1fr 1fr; gap:10px;">
                ${['cream', 'midnight', 'meadow', 'sunset'].map(name => {
                    const owned = (cfg.ownedThemes || []).includes(name);
                    const active = cfg.theme === name;
                    const swatches = {
                        cream: 'linear-gradient(135deg, oklch(94% 0.03 70), oklch(85% 0.08 25))',
                        midnight: 'linear-gradient(135deg, oklch(22% 0.02 300), oklch(40% 0.08 280))',
                        meadow: 'linear-gradient(135deg, oklch(94% 0.03 160), oklch(78% 0.1 160))',
                        sunset: 'linear-gradient(135deg, oklch(90% 0.03 30), oklch(72% 0.14 30))',
                    };
                    const label = name.charAt(0).toUpperCase() + name.slice(1);
                    return `
                        <div class="sb-shop-card" data-action="select-theme" data-theme-name="${name}">
                            <div class="sb-shop-swatch" style="background:${swatches[name]}"></div>
                            <div class="sb-h-sm">${label}</div>
                            ${active
                                ? `<div class="sb-mono sb-small" style="color:var(--mint); margin-top:4px;">✓ Active</div>`
                                : owned
                                    ? `<div class="sb-mono sb-small" style="color:var(--ink-soft); margin-top:4px;">Owned</div>`
                                    : `<div class="sb-price-tag">$0.99</div>`}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
};

// ---------- Cloud save / account ----------
const cloudState = () => state.modules.cloudSave?.getState?.() || {
    available: false,
    configured: false,
    authenticated: false,
    player: null,
    status: 'unavailable',
    pending: false,
    lastSyncedAt: 0,
    conflict: null,
    error: null,
};

const cloudPlayerInitials = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return (parts.length ? parts.slice(0, 2).map(part => part[0]).join('') : 'SB').toUpperCase();
};

const cloudTime = (timestamp, fallback = 'Not synced yet') => {
    const value = Number(timestamp) || 0;
    if (!value) return fallback;
    try {
        return new Intl.DateTimeFormat(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        }).format(new Date(value));
    } catch (error) {
        return new Date(value).toLocaleString();
    }
};

const cloudAccountCard = () => {
    const cloud = cloudState();
    const busy = ['checking_auth', 'signing_in', 'checking_cloud', 'syncing'].includes(cloud.status);
    const playerName = cloud.authenticated
        ? esc(cloud.player?.displayName || 'Play Games Player')
        : 'Guest Player';
    const initials = esc(cloudPlayerInitials(cloud.authenticated ? cloud.player?.displayName : 'Guest Player'));
    let detail = 'Progress saves on this device.';
    let status = '';
    let action = '';

    if (busy) {
        const label = cloud.status === 'signing_in'
            ? 'Signing in to Play Games…'
            : cloud.status === 'syncing'
                ? 'Syncing your progress…'
                : 'Checking cloud progress…';
        detail = 'Your device progress stays safe while we connect.';
        status = `<div class="sb-cloud-status" role="status" aria-live="polite"><span class="sb-cloud-spinner" aria-hidden="true">${icons.refresh}</span>${label}</div>`;
        action = `<button type="button" class="sb-btn ghost sb-cloud-action" disabled aria-disabled="true">Please wait</button>`;
    } else if (cloud.status === 'offline') {
        detail = 'Offline · Changes are safe on this device. We’ll back them up when you’re online.';
        status = `<div class="sb-cloud-status warning" role="status">${icons.info}<span>Local save active</span></div>`;
        action = `<button type="button" class="sb-btn ghost sb-cloud-action" data-action="cloud-retry">${icons.refresh} Try again</button>`;
    } else if (cloud.status === 'error') {
        detail = 'Cloud save could not connect. Your progress is still safe on this device.';
        status = `<div class="sb-cloud-status error" role="status">${icons.info}<span>Check your connection and try again.</span></div>`;
        action = `<button type="button" class="sb-btn ghost sb-cloud-action" data-action="cloud-retry">${icons.refresh} Retry</button>`;
    } else if (!cloud.available || !cloud.configured) {
        detail = cloud.status === 'unconfigured'
            ? 'Cloud save is unavailable in this build. Progress stays on this device.'
            : 'Play Games cloud save is available in the Android app. Progress stays on this device.';
        status = '<div class="sb-cloud-status local" role="status">Local save active</div>';
    } else if (!cloud.authenticated) {
        detail = 'Sign in to protect progress when you change or reinstall your device.';
        status = cloud.error
            ? `<div class="sb-cloud-status error" role="status">${icons.info}<span>Sign-in did not finish. Your device save was not changed.</span></div>`
            : '<div class="sb-cloud-status local" role="status">Local save active</div>';
        action = `<button type="button" class="sb-btn sb-cloud-action" data-action="cloud-sign-in">Sign in with Play Games</button>`;
    } else if (cloud.conflict) {
        detail = 'Device and cloud progress differ. Nothing will be replaced until you choose.';
        status = '<div class="sb-cloud-status warning" role="status">Choose which progress to keep</div>';
        action = `<button type="button" class="sb-btn sb-cloud-action" data-action="cloud-review-conflict">Review save conflict</button>`;
    } else {
        const syncLabel = cloud.pending || cloud.status === 'local_changes'
            ? 'Changes waiting to sync'
            : cloud.lastSyncedAt
                ? `Last synced ${cloudTime(cloud.lastSyncedAt)}`
                : 'Cloud save ready · not synced yet';
        detail = 'Signed in with Google Play Games. Progress can follow you to another device.';
        status = `<div class="sb-cloud-status ${cloud.pending ? 'warning' : 'success'}" role="status">${cloud.pending ? icons.clock : icons.check}<span>${syncLabel}</span></div>`;
        action = `<button type="button" class="sb-btn ghost sb-cloud-action" data-action="cloud-sync-now">${icons.refresh} Sync now</button>`;
    }

    return `
        <section class="sb-card sb-cloud-account" aria-labelledby="cloud-account-title">
            <div class="sb-cloud-account-head">
                <div class="sb-avatar ${cloud.authenticated ? 'sb-bg-mint' : 'sb-bg-coral'}" aria-hidden="true">${initials}</div>
                <div class="sb-grow">
                    <div class="sb-h-sm" id="cloud-account-title">${playerName}</div>
                    <div class="sb-small">${detail}</div>
                </div>
            </div>
            ${status}
            ${action}
        </section>
    `;
};

const compareCloudSummaries = (a = {}, b = {}) => {
    const keys = ['level', 'stars', 'writtenAt'];
    for (const key of keys) {
        const delta = (Number(a[key]) || 0) - (Number(b[key]) || 0);
        if (delta !== 0) return delta;
    }
    return 0;
};

const cloudConflictOptions = (conflict) => {
    if (!conflict) return [];
    const options = [{ choice: 'device', label: 'This device', summary: conflict.device || {} }];
    if (conflict.type === 'device_or_cloud' && conflict.cloud) {
        options.push({ choice: 'cloud', label: 'Cloud save', summary: conflict.cloud });
    } else if (conflict.type === 'snapshot_conflict') {
        if (conflict.current && !conflict.current.invalid) {
            options.push({ choice: 'current', label: 'Cloud save A', summary: conflict.current });
        }
        if (conflict.conflicting && !conflict.conflicting.invalid) {
            options.push({ choice: 'conflicting', label: 'Cloud save B', summary: conflict.conflicting });
        }
    }

    let best = null;
    let tied = false;
    options.forEach(option => {
        if (!best) { best = option; return; }
        const comparison = compareCloudSummaries(option.summary, best.summary);
        if (comparison > 0) { best = option; tied = false; }
        else if (comparison === 0) tied = true;
    });
    return options.map(option => ({ ...option, recommended: !tied && option === best }));
};

const cloudSummaryOption = ({ choice, label, summary = {}, recommended }) => `
    <button type="button" class="sb-cloud-choice" data-action="cloud-select-conflict" data-cloud-choice="${choice}"
            role="radio" aria-checked="false">
        <span class="sb-cloud-choice-head">
            <span class="sb-h-sm">${label}</span>
            ${recommended ? '<span class="sb-cloud-recommended">Recommended</span>' : ''}
        </span>
        <span class="sb-cloud-stats" aria-label="Level, stars, and coins">
            <span><b>Level ${Math.max(1, Number(summary.level) || 1)}</b><small>Progress</small></span>
            <span><b>${Math.max(0, Number(summary.stars) || 0)}★</b><small>Stars</small></span>
            <span><b>${Math.max(0, Number(summary.coins) || 0)}</b><small>Coins</small></span>
        </span>
        <span class="sb-small sb-cloud-date">${summary.writtenAt ? `Saved ${cloudTime(summary.writtenAt)}` : 'Current progress on this device'}</span>
    </button>
`;

// ---------- Settings ----------
SCREENS.settings = () => {
    const cfg = state.config;
    const themeLabels = { cream: 'Cream', midnight: 'Midnight', meadow: 'Meadow', sunset: 'Sunset' };
    const themeLabel = themeLabels[cfg.theme] || 'Cream';
    return `
        <div class="sb-app-header">
            <button class="sb-icon-btn" data-nav="menu" aria-label="Back">${icons.back}</button>
            <div style="font-weight:900; font-size:18px;">Settings</div>
            <span></span>
        </div>
        <div class="sb-screen-body sb-px" style="padding-bottom:20px; display:flex; flex-direction:column; gap:18px;">
            ${caps.cloudSave ? cloudAccountCard() : ''}
            <div class="sb-card">
                <div class="sb-label" style="margin-bottom:6px;">Sound &amp; feel</div>
                <div class="sb-setting-row" data-action="toggle-sound">
                    <div class="sb-row" style="gap:12px;"><span style="color:var(--sky)">${icons.volume}</span><span style="font-weight:700;">Sound effects</span></div>
                    <div class="sb-toggle ${cfg.sound ? 'on' : ''}"></div>
                </div>
                <div class="sb-setting-row" data-action="toggle-music">
                    <div class="sb-row" style="gap:12px;"><span style="color:var(--lilac)">${icons.music}</span><span style="font-weight:700;">Music</span></div>
                    <div class="sb-toggle ${cfg.music ? 'on' : ''}"></div>
                </div>
                ${hapticsSupported() ? `
                <div class="sb-setting-row" data-action="toggle-haptics">
                    <div class="sb-row" style="gap:12px;"><span style="color:var(--coral)">${icons.vibrate}</span><span style="font-weight:700;">Haptics</span></div>
                    <div class="sb-toggle ${cfg.haptics ? 'on' : ''}"></div>
                </div>
                ` : ''}
            </div>
            <div class="sb-card">
                <div class="sb-label" style="margin-bottom:6px;">Gameplay</div>
                <div class="sb-setting-row" data-action="toggle-colorblind">
                    <div>
                        <div style="font-weight:700;">Colorblind patterns</div>
                        <div class="sb-small">Extra patterns on pieces</div>
                    </div>
                    <div class="sb-toggle ${cfg.colorblind ? 'on' : ''}"></div>
                </div>
                <div class="sb-setting-row" data-action="toggle-reducedmotion">
                    <div>
                        <div style="font-weight:700;">Reduced motion</div>
                        <div class="sb-small">Fewer animations</div>
                    </div>
                    <div class="sb-toggle ${cfg.reducedMotion ? 'on' : ''}"></div>
                </div>
                ${caps.notifications ? `
                <div class="sb-setting-row" data-action="toggle-notifications">
                    <div>
                        <div style="font-weight:700;">Reminders</div>
                        <div class="sb-small">Gentle nudges at 11am, 1pm &amp; 8pm</div>
                    </div>
                    <div class="sb-toggle ${cfg.notifications ? 'on' : ''}"></div>
                </div>` : ''}
                <div class="sb-setting-row" style="flex-direction:column; align-items:stretch; gap:10px;">
                    <div class="sb-row" style="gap:12px;"><span style="color:var(--butter)">${icons.palette}</span><div>
                        <div style="font-weight:700;">Theme</div>
                        <div class="sb-small">${themeLabel} · earn stars to unlock more</div>
                    </div></div>
                    <div class="sb-row" style="gap:8px; flex-wrap:wrap;">
                        ${THEME_UNLOCKS.map(t => {
                            const unlocked = isThemeUnlocked(t.key, cfg);
                            const active = cfg.theme === t.key;
                            return unlocked
                                ? `<button class="sb-chip" data-action="select-theme" data-theme-name="${t.key}" style="${active ? 'border-color:var(--primary); color:var(--primary); font-weight:800;' : ''}">${active ? '✓ ' : ''}${t.label}</button>`
                                : `<span class="sb-chip" style="opacity:0.55;">🔒 ${t.label} · ${t.stars}★</span>`;
                        }).join('')}
                    </div>
                    ${THEME_UNLOCKS.some(t => !isThemeUnlocked(t.key, cfg)) ? `<div class="sb-small">You have ${totalStars()}★ — flawless clears earn 3★ each.</div>` : ''}
                </div>
            </div>
            <div class="sb-card">
                <div class="sb-setting-row" data-nav="levels">
                    <div>
                        <div style="font-weight:700;">Replay any level</div>
                        <div class="sb-small">Pick a cleared level to play again</div>
                    </div>
                    ${icons.chevronR}
                </div>
                <div class="sb-setting-row" data-action="replay-tutorial">
                    <div>
                        <div style="font-weight:700;">Replay tutorial</div>
                        <div class="sb-small">Walk through the basics again</div>
                    </div>
                    ${icons.chevronR}
                </div>
                ${caps.storeLinks ? `
                <div class="sb-setting-row" data-action="rate-app">
                    <div style="font-weight:700;">Rate SnapBlocks</div>${icons.chevronR}
                </div>` : ''}
                ${PRIVACY_URL ? `
                <div class="sb-setting-row" data-action="open-privacy">
                    <div style="font-weight:700;">Privacy policy</div>${icons.chevronR}
                </div>` : ''}
                <div class="sb-setting-row">
                    <div>
                        <div style="font-weight:700;">Version</div>
                        <div class="sb-mono sb-small" data-hud="app-version">${APP_VERSION}</div>
                    </div>
                    <span></span>
                </div>
            </div>
        </div>
    `;
};

// ---------- Cloud save conflict sheet ----------
SCREENS['cloud-conflict'] = () => {
    const conflict = cloudState().conflict;
    const options = cloudConflictOptions(conflict);
    const invalidCloud = conflict?.type === 'invalid_cloud';
    return `
        <div class="sb-sheet sb-cloud-conflict-sheet" role="document">
            <div class="sb-sheet-handle"></div>
            <div class="sb-row sb-between sb-cloud-conflict-head">
                <div>
                    <div class="sb-label">Cloud save</div>
                    <h2 class="sb-h-md" id="cloud-conflict-title">Choose your progress</h2>
                </div>
                <button type="button" class="sb-icon-btn" data-action="cloud-cancel-conflict" aria-label="Cancel and keep both saves">${icons.close}</button>
            </div>
            <p class="sb-body" id="cloud-conflict-description">
                ${invalidCloud
                    ? 'The cloud save could not be read. Your device progress is safe; you can use it to repair the cloud copy.'
                    : 'These saves are different. Compare them, choose one, then confirm. Nothing is replaced before confirmation.'}
            </p>
            <div class="sb-cloud-guidance" role="note">
                ${icons.info}
                <span>Recommended compares level, then stars, then the newer save. It is guidance only—the choice is yours.</span>
            </div>
            <div class="sb-cloud-options" role="radiogroup" aria-labelledby="cloud-conflict-title" aria-describedby="cloud-conflict-description">
                ${options.map(cloudSummaryOption).join('')}
            </div>
            <div class="sb-cloud-conflict-actions">
                <button type="button" class="sb-btn" data-action="cloud-confirm-conflict" disabled aria-disabled="true">Use selected progress</button>
                <button type="button" class="sb-btn ghost" data-action="cloud-cancel-conflict">Cancel—keep both for now</button>
            </div>
            <div class="sb-small sb-cloud-overwrite-note" role="status" aria-live="polite">Select a save to continue. You can cancel without changing either one.</div>
        </div>
    `;
};

// ---------- Confirm Reset level sheet ----------
SCREENS['confirm-reset'] = () => {
    return `
        <div class="sb-sheet confirm-sheet">
            <div class="sb-sheet-handle"></div>
            <div style="text-align:center; padding:0 8px;">
                <div class="sb-pause-icon sb-bg-coral">${icons.refresh}</div>
                <div class="sb-h-lg">Reset puzzle?</div>
                <div class="sb-body" style="margin-top:6px;">This will wipe your current progress on this board. Your best time and stars are safe.</div>
                <div class="sb-col" style="gap:10px; margin-top:20px;">
                    <button class="sb-btn" data-action="confirm-reset-level" style="background:var(--primary); color:#fff;">Yes, reset</button>
                    <button class="sb-btn ghost" data-action="close-overlay">Keep playing</button>
                </div>
            </div>
        </div>
    `;
};


// LAB (prototype) — screen template lives in js/ui/lab/index.js.
SCREENS.lab = labScreen;
