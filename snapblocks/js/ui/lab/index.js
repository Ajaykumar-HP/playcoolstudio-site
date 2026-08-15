/**
 * LAB — temporary prototype surface (DOM/CSS only).
 *
 * Everything the Lab needs lives in this folder plus css/lab.css. The rest of
 * the app touches it through a handful of one-line call sites, all tagged
 * `LAB (prototype)`:
 *
 *   js/ui/screens.js  — SCREENS.lab = labScreen, the menu tile, and the
 *                       labHudChip() / isLabMode() branches in game + pause
 *   js/ui/index.js    — 'lab' in BASE_SCREENS / BACK_TO_MENU and the
 *                       play-lab / restart-lab actions
 *   index.html        — <link rel="stylesheet" href="css/lab.css">
 *
 * Deleting this folder, css/lab.css, icons.flask and those call sites removes
 * the feature completely. Nothing here writes to state.config, so no progress,
 * coins or stars are affected.
 */

import state from '../../state.js?v=5071259f5c9c';
import icons from '../icons.js?v=5071259f5c9c';

// ---------------------------------------------------------------------------
// Level data
// ---------------------------------------------------------------------------
// The prototype levels are authored on the game-systems side in js/lab/levels.js.
// It is loaded dynamically on purpose: this is an in-development module, and a
// static import would take the whole app down if the file is absent or renamed.
// Until it resolves (and for any field it does not carry) the copy below is used.
let LAB_LEVELS = [];
import('../../lab/levels.js?v=5071259f5c9c')
    .then(m => { if (Array.isArray(m.LAB_LEVELS)) LAB_LEVELS = m.LAB_LEVELS; })
    .catch(() => { /* not landed yet — fall back to the copy below */ });

const LAB_FALLBACK = [
    { name: 'First Bloom',   hint: 'Two colors share one cell and bloom into a third.' },
    { name: 'Twin Petals',   hint: 'Mirror the same bloom on both halves of the grid.' },
    { name: 'Overgrow',      hint: 'Every mix spreads color into the cells beside it.' },
    { name: 'Late Frost',    hint: 'One cell only blooms once the rest are filled.' },
    { name: 'Full Spectrum', hint: 'All three mixes, one board, no spare facets.' },
    { name: 'Held Back',     hint: 'One piece stays locked until two others land.' },
    { name: 'Keystone',      hint: 'The centre piece releases everything around it.' },
    { name: 'Chain Link',    hint: 'Each placement unlocks exactly one more piece.' },
    { name: 'Deadbolt',      hint: 'Two locks, and only one order that opens both.' },
    { name: 'Last Key',      hint: 'The final piece unlocks only on a clean board.' },
];

const LAB_SECTIONS = [
    { title: 'Color Bloom',   from: 0, to: 5,  blurb: 'Mixing that spreads past the cell it started in.' },
    { title: 'Locked Pieces', from: 5, to: 10, blurb: 'Pieces that stay frozen until the board earns them.' },
];

// Authored strings win; the fallback keeps all 10 cards renderable regardless.
const labCatalog = () => LAB_FALLBACK.map((fb, i) => {
    const lv = LAB_LEVELS[i] || {};
    const hint = lv.hint || lv.blurb;
    return {
        name: typeof lv.name === 'string' && lv.name ? lv.name : fb.name,
        hint: typeof hint === 'string' && hint ? hint : fb.hint,
    };
});

// ---------------------------------------------------------------------------
// Mode helpers — used by the shared game HUD / pause sheet
// ---------------------------------------------------------------------------

export const LAB_MODE = 'lab';

export const isLabMode = () => state.gameMode === LAB_MODE;

// One-shot handoff: the lab action loads its own board, so ui/index.js must not
// run the standard enterGame path (which would reset gameMode back to 'normal').
let labLaunchPending = false;
export const consumeLabLaunch = () => {
    const pending = labLaunchPending;
    labLaunchPending = false;
    return pending;
};

/**
 * Enter a lab level. Returns false (and leaves gameMode untouched) when the
 * game-systems loader is missing or throws, so the caller can show a toast
 * instead of dropping the player onto a dead game screen.
 */
export const startLabLevel = (idx) => {
    const load = state.modules && state.modules.loadLabLevel;
    if (!Number.isFinite(idx) || typeof load !== 'function') return false;
    const previousMode = state.gameMode;
    state.gameMode = LAB_MODE;
    state.labLevelIndex = idx;
    try {
        if (load(idx) === false) throw new Error('loadLabLevel declined');
    } catch (e) {
        state.gameMode = previousMode;
        return false;
    }
    state.gameScene = 'playing';
    // game.js memoizes the last HUD values; without a reset the first tick of a
    // lab board can keep showing the previous level's counts.
    if (state.modules.resetHudMemo) state.modules.resetHudMemo();
    labLaunchPending = true;
    return true;
};

export const restartLabLevel = () => startLabLevel(state.labLevelIndex);

// ---------------------------------------------------------------------------
// Pause / exit teardown
// ---------------------------------------------------------------------------
// IMPORTANT: game.js's saveGameProgress() picks the save key by mode, and every
// mode except 'daily' lands on the SHARED normal-level key. Letting the standard
// pauseGame / exitGame hooks run on a lab board would therefore overwrite the
// player's real level save with a prototype board, which readSavedGame() would
// happily restore later as "Level N".
//
// Until game.js skips gameMode === 'lab' the way it already skips 'tutorial',
// the Lab performs the same state teardown itself, minus the persistence. Both
// helpers return false outside lab mode so the caller falls through to the
// normal hook.

export const labPauseGuard = () => {
    if (!isLabMode()) return false;
    state.lockInput = true;
    if (state.playing && !state.pauseStart) state.pauseStart = Date.now();
    return true;
};

export const endLabSession = () => {
    if (!isLabMode()) return false;
    state.playing = false;
    state.lockInput = true;
    state.gameScene = 'menu';
    state.gameMode = 'normal';
    return true;
};

// ---------------------------------------------------------------------------
// Markup fragments injected into the shared game screen / pause sheet
// ---------------------------------------------------------------------------

// Small chip in the play HUD so a lab board is never mistaken for real progress.
export const labHudChip = () =>
    (isLabMode() ? '<span class="sb-lab-hud-chip">LAB</span>' : '');

// The lab replaces the hint button (spending coins would break the "nothing is
// affected" promise) with an inert spacer that keeps the HUD's three-up balance.
export const labHudSpacer = () =>
    '<span class="sb-lab-hud-spacer" aria-hidden="true"></span>';

export const labPauseAction = () => `
    <button class="sb-sheet-action" data-action="restart-lab" aria-label="Restart lab level">
        <span class="sb-sheet-action-icon" style="color:var(--mint)">${icons.refresh}</span>
        <span class="sb-sheet-action-label">Restart</span>
    </button>
`;

// ---------------------------------------------------------------------------
// Screen template
// ---------------------------------------------------------------------------

const labCard = (level, idx) => `
    <button class="sb-lab-card" type="button" data-action="play-lab" data-lab-index="${idx}">
        <span class="sb-lab-card-no sb-mono">${String(idx + 1).padStart(2, '0')}</span>
        <span class="sb-lab-card-text">
            <span class="sb-lab-card-name">${level.name}</span>
            <span class="sb-lab-card-hint">${level.hint}</span>
        </span>
        <span class="sb-lab-card-go" aria-hidden="true">${icons.chevronR}</span>
    </button>
`;

export const labScreen = () => {
    const levels = labCatalog();
    return `
        <div class="sb-app-header">
            <button class="sb-icon-btn" data-nav="menu" aria-label="Back">${icons.back}</button>
            <div style="font-weight:900; font-size:18px;">Lab</div>
            <span class="sb-chip soft sb-lab-badge">Prototype</span>
        </div>
        <div class="sb-screen-body sb-px sb-lab-body">
            <div class="sb-card sb-lab-note">
                <span class="sb-lab-note-icon">${icons.flask}</span>
                <div class="sb-grow">
                    <div class="sb-h-sm">Ideas being tested</div>
                    <div class="sb-small sb-lab-note-body">These boards are unfinished and can break. Nothing in here changes your progress, coins or stars.</div>
                </div>
            </div>
            ${LAB_SECTIONS.map(section => `
                <div class="sb-lab-section">
                    <div class="sb-row sb-between">
                        <div class="sb-label">${section.title}</div>
                        <span class="sb-small sb-mono">${section.to - section.from}</span>
                    </div>
                    <div class="sb-small sb-lab-section-blurb">${section.blurb}</div>
                    <div class="sb-lab-list">
                        ${levels.slice(section.from, section.to)
                            .map((lv, i) => labCard(lv, section.from + i)).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
};
