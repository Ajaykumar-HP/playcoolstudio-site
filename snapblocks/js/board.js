/**
 * Board — Game board rendering, piece fitting, and grid management
 */

import state from './state.js?v=5071259f5c9c';
import Theme from './theme.js?v=5071259f5c9c';
import Renderer from './renderer.js?v=5071259f5c9c';
import Transition from './transition.js?v=5071259f5c9c';
import GamePiece from './gamePiece.js?v=5071259f5c9c';
import { GAME_COLORS } from './levels.js?v=5071259f5c9c';
import { findRecipeForCell } from './mixRecipes.js?v=5071259f5c9c';
import {
    bloomHexFor,
    buildBloomLayer,
    buildBloomSprite,
    drawBloomBurst,
} from './lab/bloomArt.js?v=5071259f5c9c';
import { BOARD_LAYOUT } from './playLayout.js?v=5071259f5c9c';

// Logical grid size. The warm-white card extends CARD_PAD (6px) beyond the grid
// on every side, giving the wells calm outer breathing room without changing
// snapping.
//
// 300 divides cleanly by 3, 4, 5 and 6, so the four most common grids get an
// integer cellSize (100 / 75 / 60 / 50) and lose the sub-pixel seams 280 left
// on 3x3 and 6x6. Mobile grows downward from y=124 into the dead air above its
// tray; the CrazyGames landscape layout positions the same board at y=110.
export const BOARD_SIZE = BOARD_LAYOUT.size; //280 //272

// ==================== GRID HELPERS ====================
export const createGrid = (dim) => {
    const g = [];
    for (let x = 0; x < dim; x++) {
        g[x] = [];
        for (let y = 0; y < dim; y++) g[x][y] = [0, 0, 0, 0];
    }
    return g;
};

const reduceGrid = (original, dim) => {
    let minX = dim, maxX = 0, minY = dim, maxY = 0;
    for (let x = 0; x < dim; x++)
        for (let y = 0; y < dim; y++)
            if (original[x][y].some(v => v > 0)) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const out = [];
    for (let x = 0; x < w; x++) {
        out[x] = [];
        for (let y = 0; y < h; y++) out[x][y] = original[x + minX][y + minY].slice();
    }
    return { grid: out, x: minX, y: minY };
};

const pieceSignature = (grid) => JSON.stringify(grid);

/**
 * Flood-fill a level into its canonical piece decomposition. This IS the
 * level's solution: each entry is one piece with the exact board origin it
 * belongs at. createPieces builds the playable pieces from it, and the hint /
 * solve systems match against these (signature, origin) pairs — matching by
 * "do the colors line up here" is NOT sufficient, because a small piece can
 * color-match inside a larger same-colored region and dead-end the level.
 *
 * Iteration order (y, then x, then facet) is load-bearing: piece saveIds are
 * `${signatureIndex}:${signature}` and existing saved games depend on the
 * same level always decomposing in the same order.
 */
export const decomposeLevel = (level) => {
    const dim = level.length;
    const flags = createGrid(dim);
    for (let x = 0; x < dim; x++)
        for (let y = 0; y < dim; y++)
            flags[x][y] = [-1, -1, -1, -1];

    const flood = (x, y, i, color, pg) => {
        if (flags[x][y][i] !== -1 || level[x][y][i] !== color) return;
        flags[x][y][i] = 1;
        pg[x][y][i] = color;
        const nbrs = [
            [[x, y, 1], [x, y, 2], [x, y - 1, 3]],
            [[x, y, 0], [x, y, 3], [x - 1, y, 2]],
            [[x, y, 0], [x, y, 3], [x + 1, y, 1]],
            [[x, y, 1], [x, y, 2], [x, y + 1, 0]],
        ][i];
        nbrs.forEach(([nx, ny, ni]) => {
            if (nx >= 0 && ny >= 0 && nx < dim && ny < dim) flood(nx, ny, ni, color, pg);
        });
    };

    const out = [];
    for (let y = 0; y < dim; y++)
        for (let x = 0; x < dim; x++)
            for (let i = 0; i < 4; i++) {
                if (flags[x][y][i] === -1 && level[x][y][i] > 0) {
                    const pg = createGrid(dim);
                    flood(x, y, i, level[x][y][i], pg);
                    const reduced = reduceGrid(pg, dim);
                    out.push({
                        grid: reduced.grid,
                        x: reduced.x,
                        y: reduced.y,
                        signature: pieceSignature(reduced.grid),
                    });
                }
            }
    return out;
};

export const createPieces = (level) => {
    const { cellSize, dotSize } = state;
    state.pieces = [];
    const signatureCounts = new Map();
    decomposeLevel(level).forEach(({ grid, signature }) => {
        const signatureIndex = signatureCounts.get(signature) || 0;
        signatureCounts.set(signature, signatureIndex + 1);
        const piece = new GamePiece(grid, cellSize, dotSize, GAME_COLORS);
        piece.saveId = `${signatureIndex}:${signature}`;
        state.pieces.push(piece);
    });
    state.nPieces = state.pieces.length;

    // Shuffle
    for (let i = state.pieces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.pieces[i], state.pieces[j]] = [state.pieces[j], state.pieces[i]];
    }
};

// ==================== BOARD ====================
const Board = (() => {
    const border = 20; //24
    // A lightly softened rectangle, deliberately calmer than the larger DOM
    // cards used outside gameplay.
    const boardRadius = 8; //11
    // The card extends beyond the logical snapping grid to create an even
    // white margin around the outer cells.
    const CARD_PAD = BOARD_LAYOUT.cardPad; //12
    const bx = BOARD_LAYOUT.x;
    const by = BOARD_LAYOUT.y;
    const bw = BOARD_SIZE, bh = BOARD_SIZE;
    let alpha = 0;
    let gridData;
    let boardGfx = null;
    const hlEffect = { on: false, x: 0, y: 0, w: 0, h: 0, alpha: 0 };
    const preview = { active: false, piece: null, x: 0, y: 0, strong: false, blocked: false };
    // A stable, opaque danger hue keeps occupied feedback legible in every
    // theme (the Meadow theme's general failGlow is intentionally green).
    const BLOCKED_COLOR = '#E2553D';
    // Snap-pop tuning (game-feel): how far the piece overshoots on placement
    // and how long it takes to spring back to rest.
    const SNAP_POP_SCALE = 1.16;
    const SNAP_POP_MS = 280;
    const snapFx = { on: false, x: 0, y: 0, w: 0, h: 0, alpha: 0 };
    const invalidFx = { on: false, x: 0, y: 0, w: 0, h: 0, alpha: 0, scale: 1 };
    let objective = null;
    const objectiveFx = []; // { gx, gy, alpha, scale }
    const cellFx = []; // { gx, gy, alpha, scale, sparkle }
    const fitToast = { on: false, text: '', x: 0, y: 0, alpha: 0, lift: 0 };
    // Prism Mix bookkeeping — set of "gx,gy" keys for cells that have already
    // mixed this level (so re-fitting a piece into the same cell after an undo
    // doesn't re-trigger the bonus). Cleared on each Board.create.
    const mixedCells = new Set();
    const mixFx = []; // { gx, gy, hex, alpha, scale, born }
    const pulseFx = []; // Prism Pulse node charge rings
    const PULSE_COLORS = ['#8c63ff', '#36c9ff', '#ff5db1'];

    // ---- Lab prototype: Color Bloom ------------------------------------
    // bloomGfx is the baked UNBLOOMED layer, drawn under the pieces at exactly
    // the boardGfx origin. bloomSprites holds one baked bloomed motif per
    // target colour, drawn OVER the pieces (a bloomed cell is by definition
    // full of pieces, so anything under them is invisible). bloomFx is a
    // normal fx channel: entries carry their own alpha/scale, are ticked by
    // Transition and culled on completion.
    let bloomGfx = null;
    let bloomBakedFor = null; // { colorblind, cellSize, count } — staleness key
    const bloomSprites = new Map();
    const bloomFx = []; // { gx, gy, hex, scale, ring, ringAlpha, glowA, spread, spreadA }

    const activeBloomTargets = () => {
        if (state.gameMode !== 'lab' || state.labKind !== 'bloom') return [];
        return Array.isArray(state.bloomTargets) ? state.bloomTargets : [];
    };

    // Re-baked from createGfx, so a theme switch, a colorblind toggle or a
    // board resize all come back through the one path that already exists
    // (Board.rebuildGfx). Nothing here is built per frame.
    const buildBloomGfx = () => {
        const { cellSize } = state;
        const targets = activeBloomTargets();
        bloomSprites.clear();
        const colorblind = !!state.config.colorblind;
        bloomBakedFor = { colorblind, cellSize, count: targets.length };
        if (!targets.length) { bloomGfx = null; return; }
        bloomGfx = buildBloomLayer({
            width: bw + border * 2,
            height: bh + border * 2,
            originX: border,
            originY: border,
            cellSize,
            targets,
            colorblind,
        });
        targets.forEach(target => {
            if (bloomSprites.has(target.target)) return;
            bloomSprites.set(target.target, buildBloomSprite(target.target, cellSize, colorblind));
        });
    };

    /**
     * Re-bake the bloom layer if the inputs it was baked from have moved.
     *
     * Two cases this covers that a create-time bake alone would not:
     *   - The colorblind toggle rebuilds no board graphics (it only refreshes
     *     the DOM settings screen). Pieces cope because _getActiveCanvas reads
     *     the flag live, but a BAKED layer would sit stale until the next
     *     level — showing a colourblind player the flower instead of the
     *     recipe, i.e. failing exactly when it matters.
     *   - game-systems may populate state.bloomTargets after Board.create.
     *     Noticing that here means the ordering can't silently produce a blank
     *     board, and refreshBloomArt() becomes an optimisation, not a
     *     requirement.
     *
     * Costs one object comparison per frame; re-bakes only on an actual change.
     */
    const syncBloomArt = () => {
        const targets = activeBloomTargets();
        const colorblind = !!state.config.colorblind;
        if (bloomBakedFor
            && bloomBakedFor.colorblind === colorblind
            && bloomBakedFor.cellSize === state.cellSize
            && bloomBakedFor.count === targets.length) return;
        buildBloomGfx();
    };

    /**
     * Play the bloom for one target cell. game-systems decides WHEN a target
     * blooms; this only draws it. `bloomed` is set here as well so a caller
     * that triggers the effect without touching the flag still renders the
     * restored state — the two can't disagree.
     *
     * Reduced motion skips the motion, not the information: the flag is set,
     * so the bloomed sprite draws immediately at full scale on the next frame.
     */
    const startBloomFx = (gx, gy) => {
        const target = activeBloomTargets().find(t => t.x === gx && t.y === gy);
        if (!target) return false;
        target.bloomed = true;
        if (state.config.reducedMotion) return true;

        const fx = {
            gx, gy,
            hex: bloomHexFor(target.target),
            scale: 0.35, ring: 0.2, ringAlpha: 0.75, glowA: 0.7, spread: 0, spreadA: 0.6,
        };
        bloomFx.push(fx);
        // Scale pop finishes first (520 < 660) so the sprite is already at rest
        // when the burst culls the entry and the fallback scale of 1 takes over.
        new Transition(35, 100, 520, v => { fx.scale = v / 100; }, null, 'backOut').start();
        new Transition(0, 100, 660, v => {
            const p = v / 100;
            fx.ring = 0.2 + p * 1.7;
            fx.ringAlpha = 0.75 * (1 - p);
            fx.glowA = 0.7 * (1 - p);
            fx.spread = p * state.cellSize * 0.30;
            fx.spreadA = 0.6 * (1 - p);
        }, () => {
            const idx = bloomFx.indexOf(fx);
            if (idx >= 0) bloomFx.splice(idx, 1);
        }, 'quadout').start();
        return true;
    };

    const drawBloomOverlay = () => {
        const targets = activeBloomTargets();
        if (!targets.length) return;
        const { render, cellSize } = state;
        targets.forEach(target => {
            if (!target.bloomed) return;
            const sprite = bloomSprites.get(target.target);
            if (!sprite) return;
            const fx = bloomFx.find(f => f.gx === target.x && f.gy === target.y);
            const scale = fx ? fx.scale : 1;
            const cx = bx + (target.x + 0.5) * cellSize;
            const cy = by + (target.y + 0.5) * cellSize;
            const w = sprite.width * scale;
            const h = sprite.height * scale;
            render.image(sprite, cx - w / 2, cy - h / 2, w, h);
        });
        bloomFx.forEach(fx => {
            drawBloomBurst(
                render,
                bx + (fx.gx + 0.5) * cellSize,
                by + (fx.gy + 0.5) * cellSize,
                cellSize,
                fx,
            );
        });
    };

    const createGfx = () => {
        const { cellSize, gridDim, dotSize } = state;
        const t = Theme.get();
        boardGfx = document.createElement('canvas');
        const tw = bw + border * 2;
        const th = bh + border * 2;
        boardGfx.width = tw;
        boardGfx.height = th;
        const bc = boardGfx.getContext('2d');
        const br = new Renderer(bc);
        const cardX = border - CARD_PAD;
        const cardY = border - CARD_PAD;
        const cardW = bw + CARD_PAD * 2;
        const cardH = bh + CARD_PAD * 2;

        // One flat card and one quiet shadow. Multiple bevel/lift layers made
        // the previous board look like a thick plastic frame.
        br.drawWithShadow(() => {
            br.roundRect(cardX, cardY, cardW, cardH, boardRadius, t.boardFill);
        }, { blur: 13, offsetY: 5, color: t.boardShadow });

        // Neutral wells with tight, even gutters. Their geometry is derived
        // from the same cells used for snapping, keeping placed pieces aligned.
        const cellInset = Math.max(2, cellSize * 0.045);
        const cellRadius = Math.max(4, cellSize * 0.13);
        for (let gy = 0; gy < gridDim; gy++) {
            for (let gx = 0; gx < gridDim; gx++) {
                const cx0 = border + gx * cellSize + cellInset;
                const cy0 = border + gy * cellSize + cellInset;
                const cw = cellSize - cellInset * 2;
                br.roundRect(cx0, cy0, cw, cw, cellRadius, t.boardCellFill || 'rgba(255,255,255,0.035)');
                // Hairline around each well so it keeps its shape on the
                // lighter themes, where fill-only separation is subtle.
                if (t.boardCellEdge) {
                    bc.save();
                    bc.strokeStyle = t.boardCellEdge;
                    bc.lineWidth = 1;
                    br.roundRect(cx0 + 0.5, cy0 + 0.5, cw - 1, cw - 1, cellRadius, 'rgba(255,255,255,0)');
                    bc.stroke();
                    bc.restore();
                }
            }
        }
        bc.save();
        bc.strokeStyle = t.boardEdge || 'rgba(0,0,0,0.12)';
        bc.lineWidth = 1;
        br.roundRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, boardRadius, 'rgba(255,255,255,0)');
        bc.stroke();
        bc.restore();

        // No grid lines: the inset wells above already separate every cell, so
        // ruling lines through the gaps only added visual noise on top of the
        // separation they were there to provide.

        const half = cellSize / 2;
        for (let gy = 0; gy < gridDim; gy++) {
            for (let gx = 0; gx < gridDim; gx++) {
                br.circle(border + gx * cellSize + half, border + gy * cellSize + half, dotSize, t.boardDot);
            }
        }

        // Lab prototype: bloom target art bakes alongside the board, so it is
        // covered by the same rebuild path on theme/colorblind/level changes.
        buildBloomGfx();
    };

    // Reset both valid-snap and occupied/blocked preview state.
    const clearPreview = () => {
        preview.active = false;
        preview.piece = null;
        preview.strong = false;
        preview.blocked = false;
    };

    const inspectPlacement = (piece) => {
        const { cellSize, gridDim } = state;
        const rx = piece.x - bx;
        const ry = piece.y - by;
        const clip = cellSize / 2;
        if (rx < -clip || ry < -clip || rx + piece.width >= bw + clip || ry + piece.height >= bh + clip) return null;
        const gi = Math.floor((rx + clip) / cellSize);
        const gj = Math.floor((ry + clip) / cellSize);
        if (!canPlaceAt(piece, gi, gj)) return null;

        const snapX = Math.floor(bx + gi * cellSize);
        const snapY = Math.floor(by + gj * cellSize);
        return {
            gi,
            gj,
            snapX,
            snapY,
            distance: Math.hypot(piece.x - snapX, piece.y - snapY),
        };
    };

    // The grid cell a dragged piece is aiming at, ignoring occupancy. This lets
    // previewPlacement distinguish an occupied target from a loose/off-board
    // drag without treating the blocking piece as disposable.
    const targetCellFor = (piece) => {
        const { cellSize, gridDim } = state;
        const rx = piece.x - bx;
        const ry = piece.y - by;
        const clip = cellSize / 2;
        if (rx < -clip || ry < -clip || rx + piece.width >= bw + clip || ry + piece.height >= bh + clip) return null;
        const gi = Math.floor((rx + clip) / cellSize);
        const gj = Math.floor((ry + clip) / cellSize);
        if (gi < 0 || gj < 0 || gi + piece.gridW - 1 >= gridDim || gj + piece.gridH - 1 >= gridDim) return null;
        return { gi, gj };
    };

    const nearestBoardSlot = (piece) => {
        const { cellSize, gridDim } = state;
        const maxGi = Math.max(0, gridDim - piece.gridW);
        const maxGj = Math.max(0, gridDim - piece.gridH);
        const gi = Math.min(maxGi, Math.max(0, Math.round((piece.x - bx) / cellSize)));
        const gj = Math.min(maxGj, Math.max(0, Math.round((piece.y - by) / cellSize)));
        const snapX = Math.floor(bx + gi * cellSize);
        const snapY = Math.floor(by + gj * cellSize);
        const centerX = piece.x + piece.width / 2;
        const centerY = piece.y + piece.height / 2;
        const boardPad = cellSize * 0.72;
        const nearBoard = centerX >= bx - boardPad
            && centerX <= bx + bw + boardPad
            && centerY >= by - boardPad
            && centerY <= by + bh + boardPad;
        if (!nearBoard) return null;
        return { gi, gj, snapX, snapY };
    };

    // Geometric placement check: a piece fits at (gi, gj) if every facet it
    // covers is currently empty. Color correctness is intentionally NOT
    // checked here — players should feel the satisfying snap on any valid
    // geometric fit. "Wrong-color in a valid slot" is surfaced separately
    // via the hint system, not by rejecting the snap.
    const canPlaceAt = (piece, gi, gj) => {
        const { gridDim } = state;
        if (!gridData) return false;
        if (gi < 0 || gj < 0 || gi + piece.gridW - 1 >= gridDim || gj + piece.gridH - 1 >= gridDim) return false;

        for (let py = 0; py < piece.gridH; py++) {
            for (let px = 0; px < piece.gridW; px++) {
                for (let pi = 0; pi < 4; pi++) {
                    if (piece.grid[px][py][pi] > 0 && gridData[gi + px][gj + py][pi] !== 0) return false;
                }
            }
        }
        return true;
    };

    const cellIsComplete = (gx, gy) => {
        if (!gridData || !gridData[gx] || !gridData[gx][gy]) return false;
        return gridData[gx][gy].every(v => v > 0);
    };

    const touchedCellsForPiece = (piece, gi, gj) => {
        const seen = new Set();
        const cells = [];
        for (let py = 0; py < piece.gridH; py++) {
            for (let px = 0; px < piece.gridW; px++) {
                if (!piece.grid[px][py].some(v => v > 0)) continue;
                const gx = gi + px;
                const gy = gj + py;
                const key = `${gx},${gy}`;
                if (seen.has(key)) continue;
                seen.add(key);
                cells.push({ gx, gy });
            }
        }
        return cells;
    };

    const startCellCompleteFx = (cells = []) => {
        if (!cells.length || state.config.reducedMotion) return;
        cells.forEach(({ gx, gy }, idx) => {
            const fx = { gx, gy, alpha: 0.52, scale: 0.68, sparkle: idx % 3 };
            cellFx.push(fx);
            new Transition(68, 108, 420, v => { fx.scale = v / 100; }, null, 'quadout').start();
            new Transition(52, 0, 760, v => { fx.alpha = v / 100; }, () => {
                const i = cellFx.indexOf(fx);
                if (i >= 0) cellFx.splice(i, 1);
            }, 'quadout').start();
        });
    };

    const startFitToast = (cells = []) => {
        if (!cells.length || state.config.reducedMotion) return;
        const text = cells.length >= 3 ? 'Perfect Fit' : cells.length >= 2 ? 'Clean Fit' : 'Nice Fit';
        const avgX = cells.reduce((sum, c) => sum + c.gx, 0) / cells.length;
        const avgY = cells.reduce((sum, c) => sum + c.gy, 0) / cells.length;
        fitToast.on = true;
        fitToast.text = text;
        fitToast.color = null;
        fitToast.x = bx + (avgX + 0.5) * state.cellSize;
        fitToast.y = by + (avgY + 0.5) * state.cellSize;
        fitToast.alpha = 0.9;
        fitToast.lift = 0;
        new Transition(0, 100, 720, v => {
            const p = v / 100;
            fitToast.alpha = 0.9 * (1 - p);
            fitToast.lift = p * 24;
        }, () => { fitToast.on = false; }, 'quadout').start();
    };

    const placeAt = (piece, gi, gj, animate = true, detectMixes = false) => {
        if (!canPlaceAt(piece, gi, gj)) return false;
        const { cellSize } = state;
        const touched = touchedCellsForPiece(piece, gi, gj);
        const incompleteBefore = new Set(
            touched
                .filter(({ gx, gy }) => !cellIsComplete(gx, gy))
                .map(({ gx, gy }) => `${gx},${gy}`)
        );

        for (let py = 0; py < piece.gridH; py++)
            for (let px = 0; px < piece.gridW; px++)
                for (let pi = 0; pi < 4; pi++)
                    if (piece.grid[px][py][pi] > 0) gridData[gi + px][gj + py][pi] = piece.grid[px][py][pi];

        const completedCells = touched.filter(({ gx, gy }) =>
            incompleteBefore.has(`${gx},${gy}`) && cellIsComplete(gx, gy)
        );

        piece.x = Math.floor(bx + gi * cellSize);
        piece.y = Math.floor(by + gj * cellSize);
        piece.placed = true;
        piece.displayScale = 1;
        piece.boardPos = { x: gi, y: gj };
        clearPreview();
        if (animate) startSnapFx(piece);
        // Mix detection runs after the snap fx kicks off so the colour morph
        // visually follows the snap. Mixes only get scanned on player-driven
        // fits — saved-game restore passes detectMixes=false.
        if (animate && detectMixes) {
            startCellCompleteFx(completedCells);
            startFitToast(completedCells);
        }
        return detectMixes ? { mixes: scanMixesForPiece(piece, gi, gj), completedCells } : true;
    };

    // Walk every cell the piece just covered. If any newly-fully-filled cell
    // matches a Prism Mix recipe and hasn't already mixed, kick off a visual
    // overlay and return the mix records for game.js to score/track.
    const scanMixesForPiece = (piece, gi, gj) => {
        const mixes = [];
        for (let py = 0; py < piece.gridH; py++) {
            for (let px = 0; px < piece.gridW; px++) {
                const touchesCell = piece.grid[px][py].some(v => v > 0);
                if (!touchesCell) continue;
                const gx = gi + px;
                const gy = gj + py;
                const key = `${gx},${gy}`;
                if (mixedCells.has(key)) continue;
                const recipe = findRecipeForCell(gridData[gx][gy]);
                if (!recipe) continue;
                mixedCells.add(key);
                mixes.push({ gx, gy, recipe });
                // A mix is the signature moment — give it a brighter, larger
                // morph than a normal cell-complete, plus a color-named label so
                // it clearly reads as "I made something". (Records always fire;
                // only the animation is gated by reduced motion.)
                if (!state.config.reducedMotion) {
                    const fx = { gx, gy, hex: recipe.targetHex, alpha: 1, scale: 0.3, born: Date.now() };
                    mixFx.push(fx);
                    new Transition(30, 132, 540, v => { fx.scale = v / 100; }, null, 'backOut').start();
                    new Transition(100, 0, 1000, v => { fx.alpha = v / 100; }, () => {
                        const idx = mixFx.indexOf(fx);
                        if (idx >= 0) mixFx.splice(idx, 1);
                    }, 'quadout').start();
                    // color-named pop label (overrides the generic fit toast)
                    fitToast.on = true;
                    fitToast.text = `${recipe.name}!`;
                    fitToast.color = recipe.targetHex;
                    fitToast.x = bx + (gx + 0.5) * state.cellSize;
                    fitToast.y = by + (gy + 0.5) * state.cellSize;
                    fitToast.alpha = 1;
                    fitToast.lift = 0;
                    new Transition(0, 100, 820, v => {
                        const p = v / 100;
                        fitToast.alpha = 1 - p;
                        fitToast.lift = p * 30;
                    }, () => { fitToast.on = false; }, 'quadout').start();
                }
            }
        }
        return mixes;
    };

    const startSnapFx = (piece) => {
        // The core "click into place": a scale-pop overshoot on the piece itself
        // (this is what makes placement feel physical), plus an expanding halo.
        // Both are skipped under reduced motion — the piece just lands.
        if (state.config.reducedMotion) { piece.placeScale = 1; return; }
        piece.placeScale = SNAP_POP_SCALE;
        new Transition(Math.round(SNAP_POP_SCALE * 100), 100, SNAP_POP_MS, v => {
            piece.placeScale = v / 100;
        }, () => { piece.placeScale = 1; }, 'backOut').start();
        snapFx.on = true;
        snapFx.x = piece.x - 8;
        snapFx.y = piece.y - 8;
        snapFx.w = piece.width + 16;
        snapFx.h = piece.height + 16;
        snapFx.alpha = 0.6;
        new Transition(60, 0, 360, v => {
            snapFx.alpha = v / 100;
            snapFx.x = piece.x - 8 - (1 - v / 100) * 8;
            snapFx.y = piece.y - 8 - (1 - v / 100) * 8;
            snapFx.w = piece.width + 16 + (1 - v / 100) * 16;
            snapFx.h = piece.height + 16 + (1 - v / 100) * 16;
        }, () => { snapFx.on = false; }, 'quadout').start();
    };

    const startInvalidFx = (piece) => {
        const slot = nearestBoardSlot(piece);
        if (!slot) return false;
        invalidFx.on = true;
        invalidFx.x = slot.snapX - 5;
        invalidFx.y = slot.snapY - 5;
        invalidFx.w = piece.width + 10;
        invalidFx.h = piece.height + 10;
        invalidFx.alpha = 0.42;
        invalidFx.scale = 1;
        new Transition(0, 100, 320, v => {
            const p = v / 100;
            invalidFx.alpha = 0.42 * (1 - p);
            invalidFx.scale = 1 + p * 0.035;
        }, () => { invalidFx.on = false; }, 'quadout').start();
        return true;
    };

    const getObjectiveProgress = (target = objective) => {
        if (!target) return null;
        if (target.type === 'mix') {
            const goal = Math.max(1, target.mixGoal || 1);
            const current = Math.min(goal, state.levelMixes || 0);
            return {
                type: target.type,
                label: target.label || 'Create Prism Mixes',
                current,
                total: goal,
                complete: current >= goal,
            };
        }
        const cells = Array.isArray(target.targetCells) ? target.targetCells : [];
        const current = cells.reduce((sum, [gx, gy]) => sum + (cellIsComplete(gx, gy) ? 1 : 0), 0);
        return {
            type: target.type || 'cells',
            label: target.label || 'Light prism cells',
            current,
            total: Math.max(1, cells.length),
            complete: cells.length > 0 && current >= cells.length,
        };
    };

    const pulseObjectiveCells = (cells = []) => {
        cells.forEach(([gx, gy]) => {
            const fx = { gx, gy, alpha: 0.62, scale: 0.7 };
            objectiveFx.push(fx);
            new Transition(70, 112, 460, v => { fx.scale = v / 100; }, null, 'quadout').start();
            new Transition(62, 0, 700, v => { fx.alpha = v / 100; }, () => {
                const idx = objectiveFx.indexOf(fx);
                if (idx >= 0) objectiveFx.splice(idx, 1);
            }, 'quadout').start();
        });
    };

    const drawObjectiveFx = () => {
        if (!objectiveFx.length) return;
        const { render, cellSize } = state;
        const t = Theme.get();
        objectiveFx.forEach(fx => {
            const cx = bx + (fx.gx + 0.5) * cellSize;
            const cy = by + (fx.gy + 0.5) * cellSize;
            const side = cellSize * fx.scale;
            render.withAlpha(fx.alpha, () => {
                render.drawWithShadow(() => {
                    render.roundRect(cx - side / 2, cy - side / 2, side, side, 5, t.successGlow);
                }, { blur: 18, offsetY: 0, color: t.successGlow });
            });
        });
    };

    const startPulseNodeFx = (gx, gy, nodeIndex = 0, full = false) => {
        const fx = {
            gx, gy,
            color: PULSE_COLORS[nodeIndex % PULSE_COLORS.length],
            alpha: full ? 0.95 : 0.78,
            scale: 0.48,
            full,
        };
        pulseFx.push(fx);
        new Transition(48, full ? 178 : 138, full ? 780 : 560, v => { fx.scale = v / 100; }, null, 'quadout').start();
        new Transition(Math.round(fx.alpha * 100), 0, full ? 1150 : 820, v => { fx.alpha = v / 100; }, () => {
            const idx = pulseFx.indexOf(fx);
            if (idx >= 0) pulseFx.splice(idx, 1);
        }, 'quadout').start();
    };

    const drawPulseNodes = (top = false) => {
        if (!state.pulseActive || !Array.isArray(state.pulseTargets)) return;
        const { render, cellSize } = state;
        const ctx = render.ctx;
        const now = Date.now();
        state.pulseTargets.forEach((node, idx) => {
            const cx = bx + (node.gx + 0.5) * cellSize;
            const cy = by + (node.gy + 0.5) * cellSize;
            const color = PULSE_COLORS[idx % PULSE_COLORS.length];
            const breathe = state.config.reducedMotion ? 0 : Math.sin(now / 330 + idx * 1.8) * cellSize * 0.035;
            const radius = cellSize * (node.charged ? 0.24 : 0.29) + breathe;
            if (!top) {
                render.withAlpha(node.charged ? 0.18 : 0.7, () => {
                    render.drawWithShadow(() => {
                        render.circle(cx, cy, radius, node.charged ? 'rgba(255,255,255,0.25)' : color);
                    }, { blur: node.charged ? 8 : 18, offsetY: 0, color });
                    render.circle(cx, cy, radius * 0.62, 'rgba(255,255,255,0.56)');
                });
            } else {
                ctx.save();
                ctx.globalAlpha = node.charged ? 0.78 : 0.46;
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1.5, cellSize * 0.035);
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.stroke();
                const bolt = Math.max(3, cellSize * 0.08);
                ctx.fillStyle = node.charged ? '#fffaf4' : color;
                ctx.beginPath();
                ctx.moveTo(cx + bolt * 0.2, cy - bolt * 1.5);
                ctx.lineTo(cx - bolt, cy + bolt * 0.15);
                ctx.lineTo(cx - bolt * 0.05, cy + bolt * 0.15);
                ctx.lineTo(cx - bolt * 0.35, cy + bolt * 1.5);
                ctx.lineTo(cx + bolt, cy - bolt * 0.2);
                ctx.lineTo(cx + bolt * 0.08, cy - bolt * 0.2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        });
    };

    const drawPulseFx = () => {
        if (!pulseFx.length) return;
        const { render, cellSize } = state;
        const ctx = render.ctx;
        pulseFx.forEach(fx => {
            const cx = bx + (fx.gx + 0.5) * cellSize;
            const cy = by + (fx.gy + 0.5) * cellSize;
            render.withAlpha(fx.alpha, () => {
                ctx.save();
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = fx.full ? 4 : 3;
                ctx.beginPath();
                ctx.arc(cx, cy, cellSize * fx.scale * 0.5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            });
        });
    };

    const drawCellFx = () => {
        if (!cellFx.length && !fitToast.on) return;
        const { render, cellSize } = state;
        const t = Theme.get();
        cellFx.forEach(fx => {
            const cx = bx + (fx.gx + 0.5) * cellSize;
            const cy = by + (fx.gy + 0.5) * cellSize;
            const side = cellSize * fx.scale;
            render.withAlpha(fx.alpha, () => {
                render.drawWithShadow(() => {
                    render.roundRect(cx - side / 2, cy - side / 2, side, side, 5, t.successGlow);
                }, { blur: 16, offsetY: 0, color: t.successGlow });
                const sparkleSize = Math.max(3, cellSize * 0.06);
                const sx = cx + (fx.sparkle - 1) * cellSize * 0.16;
                const sy = cy - cellSize * 0.18;
                render.polygon([
                    [sx, sy - sparkleSize],
                    [sx + sparkleSize, sy],
                    [sx, sy + sparkleSize],
                    [sx - sparkleSize, sy],
                ], t.hintTargetGlow || t.successGlow);
            });
        });

        if (fitToast.on) {
            // The logical canvas is wider in the CrazyGames landscape build.
            // Read the active width from state instead of relying on a module
            // global; an undefined CANVAS_W used to throw here as soon as a
            // placement, Hint, or Solve attempted to show feedback.
            const canvasW = state.CANVAS_W;
            const textW = Math.max(70, fitToast.text.length * 7.4 + 22);
            const x = Math.max(16, Math.min(canvasW - textW - 16, fitToast.x - textW / 2));
            const y = Math.max(112, fitToast.y - 34 - fitToast.lift);
            const chipBg = fitToast.color || t.hintChipBg || 'rgba(42,32,53,0.78)';
            render.withAlpha(fitToast.alpha, () => {
                render.drawWithShadow(() => {
                    render.roundRect(x, y, textW, 25, 6, chipBg);
                }, { blur: fitToast.color ? 14 : 10, offsetY: 4, color: fitToast.color || t.trayShadow });
                render.text(fitToast.text, x + textW / 2, y + 6, {
                    fill: '#fffaf4',
                    align: 'center',
                    font: '800 12px Outfit, sans-serif',
                });
            });
        }
    };

    return {
        x: bx, y: by, w: bw, h: bh,

        draw() {
            const { render } = state;
            const t = Theme.get();
            if (hlEffect.on) {
                render.withAlpha(hlEffect.alpha, () => {
                    render.roundRect(hlEffect.x, hlEffect.y, hlEffect.w, hlEffect.h, 6, t.gridPulse);
                });
            }
            render.withAlpha(alpha, () => {
                if (boardGfx) render.image(boardGfx, bx - border, by - border);
                // Same origin as boardGfx by construction — the layer is baked
                // at the identical size with the identical border offset.
                syncBloomArt();
                if (bloomGfx) render.image(bloomGfx, bx - border, by - border);
                drawPulseNodes(false);
                if (objective && Array.isArray(objective.targetCells)) {
                    const { cellSize } = state;
                    objective.targetCells.forEach(([gx, gy]) => {
                        const done = cellIsComplete(gx, gy);
                        const px = bx + gx * cellSize + cellSize * 0.12;
                        const py = by + gy * cellSize + cellSize * 0.12;
                        const side = cellSize * 0.76;
                        render.withAlpha(done ? 0.16 : 0.34, () => {
                            render.drawWithShadow(() => {
                                render.roundRect(px, py, side, side, 4, done ? t.successGlow : t.hintTargetFill);
                            }, { blur: done ? 8 : 12, offsetY: 0, color: done ? t.successGlow : t.hintTargetGlow });
                        });
                    });
                }
                if (preview.active && preview.piece) {
                    if (preview.blocked) {
                        // A red target + cross says "occupied" without drawing
                        // a piece ghost that could imply the drop will evict or
                        // replace whatever the player already placed here.
                        render.withAlpha(0.24, () => {
                            render.roundRect(
                                preview.x - 6,
                                preview.y - 6,
                                preview.piece.width + 12,
                                preview.piece.height + 12,
                                14,
                                BLOCKED_COLOR
                            );
                        });
                        const cx = preview.x + preview.piece.width / 2;
                        const cy = preview.y + preview.piece.height / 2;
                        const cross = Math.min(12, Math.max(7, state.cellSize * 0.16));
                        const ctx = render.ctx;
                        ctx.save();
                        ctx.globalAlpha = 0.96;
                        ctx.strokeStyle = BLOCKED_COLOR;
                        ctx.lineWidth = 3.5;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(cx - cross, cy - cross);
                        ctx.lineTo(cx + cross, cy + cross);
                        ctx.moveTo(cx + cross, cy - cross);
                        ctx.lineTo(cx - cross, cy + cross);
                        ctx.stroke();
                        ctx.restore();
                    } else {
                        render.withAlpha(preview.strong ? 0.18 : 0.12, () => {
                            render.roundRect(preview.x - 6, preview.y - 6, preview.piece.width + 12, preview.piece.height + 12, 14, t.gridPulse);
                        });
                        preview.piece.drawGhost(render, preview.x, preview.y, preview.strong ? 0.34 : 0.22, preview.strong);
                    }
                }
                if (snapFx.on) {
                    render.withAlpha(snapFx.alpha, () => {
                        render.drawWithShadow(() => {
                            render.roundRect(snapFx.x, snapFx.y, snapFx.w, snapFx.h, 16, t.pieceHighlight);
                        }, {
                            blur: 18,
                            offsetY: 0,
                            color: t.successGlow,
                        });
                    });
                }
                if (invalidFx.on) {
                    const cx = invalidFx.x + invalidFx.w / 2;
                    const cy = invalidFx.y + invalidFx.h / 2;
                    const w = invalidFx.w * invalidFx.scale;
                    const h = invalidFx.h * invalidFx.scale;
                    render.withAlpha(invalidFx.alpha, () => {
                        render.drawWithShadow(() => {
                            render.roundRect(cx - w / 2, cy - h / 2, w, h, 5, t.failGlow);
                        }, {
                            blur: 16,
                            offsetY: 0,
                            color: t.failGlow,
                        });
                    });
                }
                // Prism Mix overlays — fade-in target-colored squares over
                // freshly-mixed cells, then sparkle off. Each fx is removed
                // from mixFx[] when its alpha transition completes.
                if (mixFx.length) {
                    const { cellSize } = state;
                    mixFx.forEach(fx => {
                        const cx = bx + (fx.gx + 0.5) * cellSize;
                        const cy = by + (fx.gy + 0.5) * cellSize;
                        const side = cellSize * fx.scale;
                        render.withAlpha(fx.alpha, () => {
                            render.drawWithShadow(() => {
                                render.roundRect(
                                    cx - side / 2,
                                    cy - side / 2,
                                    side, side, 6, fx.hex
                                );
                            }, { blur: 18, offsetY: 0, color: fx.hex });
                        });
                    });
                }
            });
        },

        drawTopEffects() {
            state.render.withAlpha(alpha, () => {
                drawPulseNodes(true);
                drawPulseFx();
                drawCellFx();
                drawObjectiveFx();
                // Above the pieces: a bloomed cell is full, so its restored
                // motif has to sit over the pieces that filled it.
                drawBloomOverlay();
            });
        },

        create(data) {
            gridData = data;
            clearPreview();
            snapFx.on = false;
            mixedCells.clear();
            mixFx.length = 0;
            pulseFx.length = 0;
            objectiveFx.length = 0;
            cellFx.length = 0;
            bloomFx.length = 0;
            fitToast.on = false;
            createGfx();
        },

        show(cb) {
            new Transition(0, 100, 200, v => { alpha = v / 100; }, cb, 'quadin').start();
        },

        hide(cb) {
            new Transition(100, 0, 200, v => { alpha = v / 100; }, cb, 'quadout').start();
        },

        highlight() {
            hlEffect.on = true;
            const exp = 25;
            const upd = (f) => {
                hlEffect.x = bx - exp * f;
                hlEffect.y = by - exp * f;
                hlEffect.w = bw + exp * f * 2;
                hlEffect.h = bh + exp * f * 2;
                hlEffect.alpha = 1 - f;
            };
            upd(0.3);
            new Transition(30, 100, 800, v => upd(v / 100), () => { hlEffect.on = false; }, 'linear').start();
        },

        isComplete() {
            const { gridDim } = state;
            for (let y = 0; y < gridDim; y++)
                for (let x = 0; x < gridDim; x++)
                    for (let i = 0; i < 4; i++)
                        if (gridData[x][y][i] === 0) return false;
            return true;
        },

        isSolved(level) {
            const { gridDim } = state;
            if (!level) return false;
            for (let y = 0; y < gridDim; y++)
                for (let x = 0; x < gridDim; x++)
                    for (let i = 0; i < 4; i++)
                        if (gridData[x][y][i] !== level[x][y][i]) return false;
            return true;
        },

        fitPiece(piece) {
            const placement = inspectPlacement(piece);
            if (!placement) {
                clearPreview();
                return false;
            }
            return placeAt(piece, placement.gi, placement.gj, true, true);
        },

        previewPlacement(piece) {
            const placement = inspectPlacement(piece);
            const threshold = Math.max(16, state.cellSize * 0.42);
            if (placement && placement.distance <= threshold) {
                preview.active = true;
                preview.piece = piece;
                preview.x = placement.snapX;
                preview.y = placement.snapY;
                preview.strong = placement.distance <= Math.max(10, state.cellSize * 0.2);
                preview.blocked = false;
                return true;
            }

            // An otherwise valid board target can only fail canPlaceAt because
            // one or more facets are already occupied. Mark it as blocked, but
            // deliberately omit the dragged-piece ghost: nothing on the board
            // will be displaced if the player releases here.
            const target = targetCellFor(piece);
            if (target && gridData) {
                const snapX = Math.floor(bx + target.gi * state.cellSize);
                const snapY = Math.floor(by + target.gj * state.cellSize);
                const distance = Math.hypot(piece.x - snapX, piece.y - snapY);
                if (distance <= threshold && !canPlaceAt(piece, target.gi, target.gj)) {
                    preview.active = true;
                    preview.piece = piece;
                    preview.x = snapX;
                    preview.y = snapY;
                    preview.strong = false;
                    preview.blocked = true;
                    return true;
                }
            }

            clearPreview();
            return false;
        },

        clearPreview,

        // Remove transient gameplay overlays before the solved board is copied
        // into the completion card. This does not alter the puzzle data.
        prepareSnapshot() {
            clearPreview();
            hlEffect.on = false;
            snapFx.on = false;
            invalidFx.on = false;
            fitToast.on = false;
            cellFx.length = 0;
            mixFx.length = 0;
            pulseFx.length = 0;
            objectiveFx.length = 0;
            // Only the transient burst is cleared: a bloomed target is solved
            // state, not an overlay, so it must survive into the snapshot.
            bloomFx.length = 0;
        },

        showInvalidDrop: startInvalidFx,

        // ---- Lab prototype: Color Bloom ----
        // Trigger the bloom animation for a target cell.
        bloomCell: startBloomFx,

        // Re-bake the bloom layer. game-systems must call this if it populates
        // state.bloomTargets AFTER Board.create, since the art is baked, not
        // drawn per frame. Safe to call repeatedly.
        refreshBloomArt() {
            buildBloomGfx();
        },

        setObjective(nextObjective) {
            objective = nextObjective || null;
            objectiveFx.length = 0;
        },

        getObjectiveProgress,

        pulseObjectiveCells,

        pulsePowerCell: startPulseNodeFx,

        isCellComplete(gx, gy) {
            return !!gridData && cellIsComplete(gx, gy);
        },

        canPlaceAt,

        placePieceAt(piece, gi, gj, animate = true, detectMixes = false) {
            if (piece.placed) this.liftPiece(piece);
            return placeAt(piece, gi, gj, animate, detectMixes);
        },

        hasPreviewFor(piece) {
            return preview.active && !preview.blocked && preview.piece === piece;
        },

        liftPiece(piece) {
            clearPreview();
            if (!piece.boardPos || piece.boardPos.x < 0 || piece.boardPos.y < 0) {
                piece.placed = false;
                piece.boardPos = { x: -1, y: -1 };
                piece.displayScale = 1;
                return;
            }
            for (let py = 0; py < piece.gridH; py++)
                for (let px = 0; px < piece.gridW; px++)
                    for (let pi = 0; pi < 4; pi++)
                        if (piece.grid[px][py][pi] > 0) gridData[piece.boardPos.x + px][piece.boardPos.y + py][pi] = 0;
            piece.boardPos = { x: -1, y: -1 };
            piece.placed = false;
            piece.displayScale = 1;
        },

        rebuildGfx() { createGfx(); },
    };
})();

export default Board;
