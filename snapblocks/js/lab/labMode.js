/**
 * LAB — prototype game-systems logic (level loading, anchors, bloom tracking).
 *
 * Everything the two prototype mechanics need on the systems side lives here so
 * the footprint inside js/game.js stays down to a handful of tagged one-liners.
 * Delete js/lab/ and those call sites and the feature is gone.
 *
 * Deliberately NOT here: rendering. js/anchoredSkin.js and js/lab/bloomArt.js
 * (canvas-render's files) own how a locked piece and a bloom target look. This
 * module only decides WHAT is locked and WHEN a target blooms, then calls the
 * public Board API.
 *
 * NOTE on "delete js/lab/ and the feature is gone": that is no longer strictly
 * true. Anchored graduated out of the Lab into a shipped special level type, so
 * its skin now lives at js/anchoredSkin.js and js/gamePiece.js imports it on the
 * main render path. js/board.js still imports js/lab/bloomArt.js; that one moves
 * out when Bloom graduates too.
 *
 * The sandbox rule: lab mode grants no coins, stars, streaks, goals, treasure or
 * trophies, never touches config.unlocked, and never persists a save. Nothing in
 * this file writes to state.config.
 */

import state from '../state.js?v=5071259f5c9c';
import Board, { BOARD_SIZE, createGrid, createPieces, decomposeLevel } from '../board.js?v=5071259f5c9c';
import HintSystem from '../hintSystem.js?v=5071259f5c9c';
import { findRecipeForCell } from '../mixRecipes.js?v=5071259f5c9c';
import { LAB_LEVELS } from './levels.js?v=5071259f5c9c';

export { LAB_LEVELS };

// GAME_COLORS index -> mix recipe id, so a bloom target can be compared against
// what findRecipeForCell actually reports for the cell.
const RECIPE_ID_FOR_TARGET = { 3: 'green', 5: 'purple', 6: 'orange' };

export const isLabLevelIndex = (idx) => Number.isInteger(idx) && idx >= 0 && idx < LAB_LEVELS.length;

/**
 * Live facet colours of one board cell, read back from the pieces currently
 * placed on it.
 *
 * Why not ask Board: Board's own mix detection (`scanMixesForPiece`) is
 * one-shot — a cell is added to `mixedCells` and never re-examined, which is
 * right for scoring a mix but wrong for a WIN CONDITION. A player who mixes a
 * bloom cell and then lifts one of the two halves back off must lose the bloom
 * again, and a `mixedCells` reading would keep claiming it is lit. Board also
 * does not expose its grid data, and board.js belongs to canvas-render.
 *
 * The colour rule itself is not re-implemented: findRecipeForCell from
 * js/mixRecipes.js is the single source of truth for what mixes into what.
 */
const cellFacetsFromPlacedPieces = (gx, gy) => {
    const facets = [0, 0, 0, 0];
    state.pieces.forEach(piece => {
        if (!piece.placed || !piece.boardPos || piece.boardPos.x < 0) return;
        const px = gx - piece.boardPos.x;
        const py = gy - piece.boardPos.y;
        if (px < 0 || py < 0 || px >= piece.gridW || py >= piece.gridH) return;
        for (let f = 0; f < 4; f++) {
            const color = piece.grid[px][py][f];
            if (color > 0) facets[f] = color;
        }
    });
    return facets;
};

/**
 * Recompute every bloom target from the live board and play the bloom effect for
 * any that just lit. Safe to call after any placement, lift, undo or redo.
 * Returns true when every target is bloomed.
 */
export const syncBloomProgress = () => {
    if (state.gameMode !== 'lab' || state.labKind !== 'bloom') return false;
    const targets = state.bloomTargets || [];
    let allLit = true;
    targets.forEach(target => {
        const recipe = findRecipeForCell(cellFacetsFromPlacedPieces(target.x, target.y));
        const lit = !!recipe && recipe.id === RECIPE_ID_FOR_TARGET[target.target];
        if (lit && !target.bloomed) {
            // Board.bloomCell sets target.bloomed itself and animates the burst.
            Board.bloomCell(target.x, target.y);
            target.bloomed = true;
        } else if (!lit) {
            // A lifted piece un-blooms the cell; the win condition must follow.
            target.bloomed = false;
        }
        if (!target.bloomed) allLit = false;
    });
    return allLit;
};

/** Bloom levels need every target lit as well as a full board. */
export const labWinConditionMet = () => {
    if (state.labKind !== 'bloom') return true;
    return syncBloomProgress();
};

/**
 * "2/3 bloomed" for a HUD chip. Nothing consumes this yet — the Lab HUD shows a
 * plain LAB badge — but the win condition is otherwise invisible to the player,
 * which is one of the things this prototype needs to find out.
 */
export const labBloomProgress = () => {
    const targets = state.bloomTargets || [];
    return { current: targets.filter(t => t.bloomed).length, total: targets.length };
};

/**
 * Pre-place and lock the pieces named by `anchoredCells`.
 *
 * `anchoredCells` names a CELL, not a piece — the piece that owns that cell is
 * the one that gets locked. Ownership comes from decomposeLevel, which is the
 * same flood-fill the playable pieces were built from, so the origin it reports
 * is exactly where the piece belongs.
 */
const applyAnchors = (lab) => {
    state.pieces.forEach(piece => { if (piece.setAnchored) piece.setAnchored(false); });
    if (lab.kind !== 'anchored') return;

    const placements = decomposeLevel(lab.grid);
    const claimedPlacements = new Set();
    const anchored = [];

    (lab.anchoredCells || []).forEach(({ x, y }) => {
        const pi = placements.findIndex((p, i) => {
            if (claimedPlacements.has(i)) return false;
            const px = x - p.x;
            const py = y - p.y;
            const cell = p.grid[px]?.[py];
            return !!cell && cell.some(v => v > 0);
        });
        if (pi < 0) return;
        const placement = placements[pi];
        // Match by signature, not by identity: createPieces shuffles, and two
        // pieces can share a shape, so any unclaimed piece of this shape will do.
        const piece = state.pieces.find(p =>
            !p.anchored && JSON.stringify(p.grid) === placement.signature);
        if (!piece) return;
        claimedPlacements.add(pi);
        // setAnchored (not `piece.anchored = true`) — it bakes the locked skin as
        // well as setting the flag. The raw assignment renders as a normal piece.
        piece.setAnchored(true);
        Board.placePieceAt(piece, placement.x, placement.y, false, false);
        piece.introDropped = true;   // already on the board; skip the tray fall-in
        anchored.push(piece);
    });

    // Locked pieces draw beneath loose ones, matching where finalizePlacement
    // moves a piece the moment it is placed.
    if (anchored.length) {
        state.pieces = [...anchored, ...state.pieces.filter(p => !anchored.includes(p))];
        state.nPieces = state.pieces.length;
    }
};

/**
 * Load a prototype level. Modelled on loadLevel in js/game.js — same pipeline
 * (Board.create -> createPieces -> modifier), minus every progression hook.
 * Returns false when the index is unknown, which is the signal the Lab UI uses
 * to back out instead of dropping the player onto a dead board.
 */
export const loadLabLevel = (idx) => {
    const lab = LAB_LEVELS[idx];
    if (!lab) return false;
    const level = lab.grid;

    state.gameMode = 'lab';
    state.labLevelIdx = idx;
    state.labLevelIndex = idx;   // name the Lab UI writes/reads for restart
    state.labKind = lab.kind;
    state.labLevel = lab;
    state.labResult = null;
    state.currentLevel = idx;

    state.gridDim = level.length;
    state.cellSize = BOARD_SIZE / state.gridDim;
    state.dotSize = state.gridDim <= 5 ? 4 : state.gridDim <= 7 ? 3 : 2;
    state.victory = false;
    state.levelStars = 0;
    state.levelScore = 0;
    state.completedBoardSnapshot = '';
    state.levelElapsed = 0;
    state.levelHintsUsed = 0;
    state.levelResets = 0;
    state.levelMixes = 0;
    state.levelMixBonus = 0;
    state.levelMeta = null;
    state.levelObjective = null;
    state.levelObjectiveProgress = null;
    state.objectiveIntro = null;
    state.dailyResult = null;
    state.levelClearResult = null;
    state.levelCoinsEarned = null;
    state.prismReward = 0;
    // Every other special modifier is explicitly off: a lab board is one
    // mechanic under test, never two at once.
    state.treasureActive = false;
    state.frostActive = false;
    state.pulseActive = false;
    state.pulseTargets = [];
    state.pulseCharged = 0;
    state.pulseReward = 0;
    state.pulseBurstStartedAt = 0;
    state.goalsCompleted = [];
    state.streakMilestoneReward = null;

    // Board reads state.bloomTargets when it bakes the bloom layer, so set the
    // targets BEFORE Board.create. (board.js self-heals if it is set after, but
    // relying on that would be leaving a trap for the next edit.)
    state.bloomTargets = lab.kind === 'bloom'
        ? (lab.blooms || []).map(b => ({ x: b.x, y: b.y, target: b.target, bloomed: false }))
        : [];

    state.undoStack = [];
    state.redoStack = [];
    HintSystem.reset();
    Board.create(createGrid(state.gridDim));
    Board.setObjective(null);
    Board.refreshBloomArt();
    createPieces(level);
    applyAnchors(lab);
    return true;
};

// No teardown helper on purpose: every consumer of lab state already gates on
// state.gameMode === 'lab' (board.js's activeBloomTargets, the guards in
// game.js), so leaving labKind/bloomTargets populated after exit is inert, and
// the next loadLabLevel overwrites them wholesale. A clear() would be one more
// thing to remember to call.

export default { loadLabLevel, syncBloomProgress, labWinConditionMet, labBloomProgress };