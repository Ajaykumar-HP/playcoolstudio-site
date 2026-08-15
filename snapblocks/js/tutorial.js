/**
 * Interactive Tutorial — three guided mini-puzzles that teach the core loop.
 *
 * Flow: tap "Start playing" from the onboarding carousel → enters game in
 * `tutorialMode` → plays 1-piece, 2-piece, 3-piece puzzle with coachmark
 * speech-bubble above the board. Each board completion auto-advances to the
 * next step (no level-complete screen). After the last step, marks
 * `tutorialCompleted = true`, grants bonus hints and returns to the menu.
 *
 * Tutorial puzzles intentionally use the same level array format as LEVELS so
 * createPieces / Board / drag input all "just work" — the only difference is
 * the data source.
 */

import state, { saveConfig } from './state.js?v=5071259f5c9c';
import { addCoins, REWARD_TUTORIAL } from './economy.js?v=5071259f5c9c';
import { CRAZYGAMES_LANDSCAPE } from './platform/runtime.js?v=5071259f5c9c';

// Cell helpers (mirrored from levels.js so we don't have to import — keeps
// tutorial self-contained and trivially editable).
const S = (c) => [c, c, c, c];
const DL = (c1, c2) => [c1, c1, c2, c2]; // diagonal split — used for the mix cell

// Three deliberately tiny puzzles: 1 piece → 2 pieces → first color MIX.
// Colours: 1 coral/red, 2 butter/yellow, 3 mint/green, 4 sky/blue.
export const TUTORIAL_LEVELS = [
    // Step 1 — 2x2 grid, ONE 2x2 square piece. Drag it onto the empty board.
    [
        [S(1), S(1)],
        [S(1), S(1)],
    ],
    // Step 2 — 2x2 grid, TWO halves (left col coral, right col sky).
    [
        [S(1), S(4)],
        [S(1), S(4)],
    ],
    // Step 3 — the first MIX. A yellow piece and a blue piece share one cell
    // (DL(2,4)); placing both blooms that cell into green. This is the player's
    // very first taste of the game's signature mechanic.
    [
        [S(2), S(4)],
        [DL(2, 4), S(4)],
    ],
];

export const TUTORIAL_COACH = [
    {
        title: 'Drag the block',
        body: 'Pick up the colored block. It grows under your finger so you can place it clearly.',
        cta: 'Try it!',
    },
    {
        title: 'Place both pieces',
        body: 'Two pieces this time. Drag each one into its matching color spot — they snap when close.',
        cta: 'Nice — one more!',
    },
    {
        title: 'Now mix a color!',
        body: 'Drop the yellow piece and the blue piece into the same spot — watch them bloom into green. That is the heart of the game.',
        cta: 'Make green to finish',
    },
];

// Bonus coins for completing the tutorial — a small cushion for new players.
// With the 30 starting coins this lands at 50 (= 5 hints), so the rewarded
// "out of coins" flow stays reachable within the first sessions.
const TUTORIAL_COMPLETE_COIN_BONUS = REWARD_TUTORIAL;

const Tutorial = (() => {
    const isActive = () => state.gameMode === 'tutorial';
    const getStep = () => Math.max(0, Math.min(TUTORIAL_LEVELS.length - 1, state.tutorialStep || 0));
    const getCoach = () => TUTORIAL_COACH[getStep()];
    const isLastStep = () => getStep() >= TUTORIAL_LEVELS.length - 1;

    const start = () => {
        state.gameMode = 'tutorial';
        state.tutorialStep = 0;
        state.dailyDateKey = '';
        state.dailyLevelIndex = -1;
        state.dailyLaunchPending = false;
        const loader = state.modules.loadTutorialLevel;
        const intro  = state.modules.levelIntro;
        if (loader) loader(0);
        if (intro)  intro();
    };

    const advance = () => {
        if (!isActive()) return;
        if (isLastStep()) {
            finish();
            return;
        }
        state.tutorialStep = getStep() + 1;
        const loader = state.modules.loadTutorialLevel;
        const intro  = state.modules.levelIntro;
        const refresh = state.modules.refreshUI;
        if (loader) loader(state.tutorialStep);
        if (intro)  intro();
        if (refresh) refresh();
    };

    const finish = (viaSkip = false) => {
        const cfg = state.config;
        const firstCompletion = !cfg.tutorialCompleted;
        if (firstCompletion) {
            cfg.tutorialCompleted = true;
            addCoins(TUTORIAL_COMPLETE_COIN_BONUS);
        }
        state.playing = false;
        state.lockInput = true;
        saveConfig();
        // Flow straight into the next level's intro (not the menu) so the
        // session keeps its momentum. A first completion also flags the intro
        // to show a "Tutorial complete · +coins" celebration card. Skippers go
        // to the menu as before — they opted out of the flow.
        state.tutorialJustFinished = firstCompletion && !viaSkip;
        state.introLevel = { idx: cfg.unlocked || 0 };
        // Portal players have already learned by doing, so carry their momentum
        // straight into level one without inserting a mobile-style intro card.
        // Android keeps the established celebration/intro handoff.
        const showScreen = state.modules.showScreen;
        if (CRAZYGAMES_LANDSCAPE && !viaSkip) {
            state.gameMode = 'normal';
            if (showScreen) showScreen('game');
        } else {
            // Leave tutorial mode across the screen-change so exitGame's
            // saveGameProgress hits the tutorial early-return. Reset right after.
            if (showScreen) showScreen(viaSkip ? 'menu' : 'level-intro');
            state.gameMode = 'normal';
        }
        state.tutorialStep = 0;
        state.victory = false;
    };

    const skip = () => finish(true);

    return { start, advance, finish, skip, isActive, getStep, getCoach, isLastStep };
})();

export default Tutorial;
