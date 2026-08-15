/**
 * HintSystem - hint economy and canvas-side guidance.
 *
 * The rewarded-ad prompt used to live here as a canvas overlay. It moved to the
 * DOM layer (js/ui/index.js) and nothing had set rewardPromptOpen true for a
 * long time, so the whole canvas overlay was unreachable code; it is gone.
 */

import state from './state.js?v=3bd14eb0045c';
import { LEVELS } from './levels.js?v=3bd14eb0045c';
import { getAnchoredGrid } from './anchored.js?v=3bd14eb0045c';
import { canAfford, spendCoins, HINT_COST } from './economy.js?v=3bd14eb0045c';
import SoundEngine from './sound.js?v=3bd14eb0045c';
import Theme from './theme.js?v=3bd14eb0045c';
import Board, { decomposeLevel } from './board.js?v=3bd14eb0045c';
import HapticsEngine from './haptics.js?v=3bd14eb0045c';
import Transition from './transition.js?v=3bd14eb0045c';
import { TRAY_LAYOUT } from './playLayout.js?v=3bd14eb0045c';

const { CANVAS_W } = state;

// ---- Focus scrim band -------------------------------------------------
// The scrim used to stop at y=558, which sits INSIDE the tray. That was
// invisible while its effective alpha was ~0.06, but a scrim heavy enough to
// actually suppress anything would have drawn a hard horizontal line across
// the middle of the tray pieces. The band now ends on the tray shell's own
// bottom edge (TRAY_SHELL.y + TRAY_SHELL.h = 466 + 174 in js/game.js), so the
// only boundary is one the player already sees. Kept as a literal because
// game.js does not export its layout; if TRAY_SHELL moves, move this.
//
// The 2026 tray resize grew the shell UPWARD (y 486 -> 466, h 154 -> 174) and
// deliberately left the bottom edge on 640, so this value is unchanged — only
// the arithmetic above needed updating. HINT_SCRIM_TOP still clears the board
// card, whose top edge is fixed at y 118 (Board.y 124 - CARD_PAD 6).
const HINT_SCRIM_TOP = 84;
const HINT_SCRIM_BOTTOM = TRAY_LAYOUT.shell.y + TRAY_LAYOUT.shell.h;

// ---- Hint life budget -------------------------------------------------
// hintTimer ticks every HINT_TICK_MS and increments hintStep; the hint tears
// itself down once hintStep passes its life.
//
// A ghost flight needs 3 x (700 + 400) = 3300ms, which does NOT fit in the
// original 160-step (3200ms) life, so any mode that flies gets the longer
// budget with a settle tail on the end. Blocked never flies and reduced motion
// never loops, so both keep the original 160.
const HINT_TICK_MS = 20;
const HINT_LIFE_STEPS = 160;                                  // 3200ms — blocked, and reduced motion
const FLIGHT_TRAVEL_MS = 700;
const FLIGHT_HOLD_MS = 400;
const FLIGHT_LOOPS = 3;
// Heavier than the old parked target ghost (0.36): it now has to read against a
// real scrim while moving, and once the loop settles it IS the destination
// preview the player is left looking at.
const FLIGHT_GHOST_ALPHA = 0.60;
// 3300ms of flight / 20ms = 165 steps, + ~35 steps (700ms) of settle where the
// ghost rests on the target and the scrim fades back out.
const FLIGHT_LIFE_STEPS = 200;                                // 4000ms
// Steps spent ramping the scrim in at the start and out at the end.
const SCRIM_IN_STEPS = 8;                                     // 160ms
const SCRIM_OUT_STEPS = 24;                                   // 480ms

const HintSystem = (() => {
    let hintState = null;
    let hintTimer = null;
    let hintStep = 0;
    let flightTween = null;
    let flight = null;
    let noHintMsg = 0;
    let noHintTimer = null;
    let rewardMessage = '';
    let rewardMsgLife = 0;
    let rewardMsgTimer = null;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const buildHintCells = (piece, bx, by) => {
        const cells = [];
        for (let py = 0; py < piece.gridH; py++) {
            for (let px = 0; px < piece.gridW; px++) {
                const facets = [
                    piece.grid[px][py][0] > 0,
                    piece.grid[px][py][1] > 0,
                    piece.grid[px][py][2] > 0,
                    piece.grid[px][py][3] > 0,
                ];
                if (facets.some(f => f)) cells.push({ x: bx + px, y: by + py, facets });
            }
        }
        return cells;
    };

    const placedPiecesOverlapping = (cells, sourcePiece = null) => {
        const blockers = [];
        const seen = new Set();
        const target = new Set(cells.map(cell => `${cell.x},${cell.y}`));
        state.pieces.forEach(piece => {
            if (!piece.placed || piece === sourcePiece || !piece.boardPos || piece.boardPos.x < 0) return;
            // LAB (prototype): an anchored piece can never be the thing in the
            // way, because the player cannot move it. Flagging it as a blocker
            // would tell them to do something the input layer refuses.
            if (piece.anchored) return;
            for (let py = 0; py < piece.gridH; py++) {
                for (let px = 0; px < piece.gridW; px++) {
                    if (!piece.grid[px][py].some(v => v > 0)) continue;
                    const key = `${piece.boardPos.x + px},${piece.boardPos.y + py}`;
                    if (!target.has(key)) continue;
                    if (!seen.has(piece.saveId)) {
                        seen.add(piece.saveId);
                        blockers.push(piece);
                    }
                }
            }
        });
        return blockers;
    };

    const buildHint = (piece, bx, by) => ({
        piece,
        boardX: bx,
        boardY: by,
        targetX: Board.x + bx * state.cellSize,
        targetY: Board.y + by * state.cellSize,
        cells: buildHintCells(piece, bx, by),
    });

    // LAB (prototype): in lab mode state.currentLevel indexes LAB_LEVELS, not
    // LEVELS. Reading LEVELS[idx] here would hand the hint system a completely
    // unrelated puzzle as "the solution" and point the player at nonsense. The
    // Lab UI currently hides Hint and Solve, so this is belt-and-braces — but it
    // is exactly the mismatch that becomes a live bug the day those come back.
    // ANCHORED levels likewise bring their own grid (js/anchoredLevels.js) and
    // replace LEVELS[idx] at load time, so the same mismatch applies: hinting
    // off LEVELS[idx] would point at a puzzle that is not on screen.
    const getActiveLevelData = () => {
        if (state.gameMode === 'lab') return state.labLevel?.grid || null;
        if (state.gameMode === 'normal') {
            const anchored = getAnchoredGrid(state.currentLevel);
            if (anchored) return anchored;
        }
        return LEVELS[state.currentLevel] || null;
    };

    // ---- Solution matching ----------------------------------------------
    // The level's flood-fill decomposition is the ground-truth solution: each
    // piece signature belongs at specific origins. Guidance must match against
    // these (signature, origin) pairs — checking "do my facet colors equal the
    // target here" is NOT enough, because a small piece can color-match inside
    // a larger same-colored region, and treating that as correct dead-ends the
    // level (the larger piece has nowhere left to go).
    let solutionLevelRef = null;
    let solutionPlacements = [];

    const getSolutionPlacements = () => {
        const level = getActiveLevelData();
        if (!level) return [];
        if (solutionLevelRef !== level) {
            solutionLevelRef = level;
            solutionPlacements = decomposeLevel(level)
                .map(({ x, y, signature }) => ({ x, y, signature }));
        }
        return solutionPlacements;
    };

    const pieceSig = (piece) =>
        piece._solutionSig || (piece._solutionSig = JSON.stringify(piece.grid));

    // All solution origins for this piece's exact shape+colors. Identical
    // pieces are interchangeable, so any of these origins is "correct".
    const targetsForPiece = (piece) => {
        const sig = pieceSig(piece);
        return getSolutionPlacements().filter(p => p.signature === sig);
    };

    const isSolutionPlacement = (piece, bx, by) =>
        targetsForPiece(piece).some(p => p.x === bx && p.y === by);

    const findSolutionForPiece = (piece) => {
        // Prefer a correct spot that is actually FREE right now — otherwise the
        // "move it here" hint could point at a cell another piece already fills
        // correctly (the player saw this as a wrong placement). Fall back to any
        // matching spot only if none is currently placeable.
        let fallback = null;
        for (const t of targetsForPiece(piece)) {
            if (Board.canPlaceAt(piece, t.x, t.y)) return buildHint(piece, t.x, t.y);
            if (!fallback) fallback = buildHint(piece, t.x, t.y);
        }
        return fallback;
    };

    const findMistakeHint = () => {
        const { pieces } = state;
        if (!getSolutionPlacements().length) return null;
        for (let pi = 0; pi < pieces.length; pi++) {
            const piece = pieces[pi];
            if (!piece.placed || !piece.boardPos || piece.boardPos.x < 0) continue;
            // LAB (prototype): anchors sit at their solution origin by
            // construction, so they are never a mistake — and never movable.
            if (piece.anchored) continue;
            if (isSolutionPlacement(piece, piece.boardPos.x, piece.boardPos.y)) continue;
            const target = findSolutionForPiece(piece);
            if (!target) continue;
            return {
                ...target,
                wrongX: piece.x,
                wrongY: piece.y,
                wrongCells: buildHintCells(piece, piece.boardPos.x, piece.boardPos.y),
                mistake: true,
            };
        }
        return null;
    };

    const findHintForPiece = () => {
        const { pieces, nPieces } = state;
        for (let pi = 0; pi < nPieces; pi++) {
            const piece = pieces[pi];
            if (piece.placed) continue;
            for (const t of targetsForPiece(piece)) {
                if (Board.canPlaceAt(piece, t.x, t.y)) return buildHint(piece, t.x, t.y);
            }
        }
        return null;
    };

    const findBlockedHintForPiece = () => {
        const { pieces, nPieces } = state;
        for (let pi = 0; pi < nPieces; pi++) {
            const piece = pieces[pi];
            if (piece.placed) continue;
            for (const t of targetsForPiece(piece)) {
                if (!Board.canPlaceAt(piece, t.x, t.y)) return buildHint(piece, t.x, t.y);
            }
        }
        return null;
    };

    const clearFlight = () => {
        if (flightTween) {
            flightTween.stop();
            flightTween = null;
        }
        flight = null;
    };

    const clearHintState = () => {
        if (hintTimer) {
            clearInterval(hintTimer);
            hintTimer = null;
        }
        hintState = null;
        hintStep = 0;
        clearFlight();
    };

    // ---- Ghost flight -----------------------------------------------------
    // One continuous gesture instead of two labelled boxes: a ghost of the piece
    // travels from the tray to its home slot, holds, and repeats. Motion is
    // pre-attentive, so the player's eye is carried along the path rather than
    // ping-ponging between a "This" chip at the bottom and a "Here" chip on the
    // board, and there is nothing to read mid-puzzle.
    //
    // The travel and hold legs are real Transitions rather than a hand-rolled
    // clock: they own the easing, they stop cleanly on teardown, and the hold's
    // 0..1 value is what cross-fades the ghost out at each loop seam so the
    // jump back to the tray is never a hard cut.
    const startFlight = (hint) => {
        clearFlight();
        const piece = hint.piece;
        // A mistake-mode piece IS placed — it is sitting in the wrong slot, and
        // flying it out of there is the whole point. Only a piece currently in
        // the player's hand is excluded, because they are already moving it.
        if (state.activeDragPiece === piece) return;

        // Reduced motion keeps the INFORMATION and drops only the travel: the
        // ghost is simply parked on the destination from frame one.
        if (state.config.reducedMotion) {
            flight = { t: 1, hold: 0, phase: 'settled', loop: FLIGHT_LOOPS };
            return;
        }

        flight = { t: 0, hold: 0, phase: 'travel', loop: 0 };

        const runHold = () => {
            if (!flight) return;
            flight.phase = 'hold';
            flight.hold = 0;
            flightTween = new Transition(0, 1, FLIGHT_HOLD_MS, v => {
                if (flight) flight.hold = v;
            }, () => {
                if (!flight) return;
                flight.loop++;
                if (flight.loop >= FLIGHT_LOOPS) {
                    // Settle ON the target, not back at the tray — the last
                    // thing left on screen should be the answer.
                    flight.t = 1;
                    flight.phase = 'settled';
                    flightTween = null;
                    return;
                }
                runTravel();
            }, 'linear');
            flightTween.start();
        };

        const runTravel = () => {
            if (!flight) return;
            flight.phase = 'travel';
            flight.t = 0;
            // cubicout: leaves the source fast (motion onset is what captures
            // attention) and decelerates into the slot so the arrival reads as
            // a landing rather than a stop.
            flightTween = new Transition(0, 1, FLIGHT_TRAVEL_MS, v => {
                if (flight) flight.t = v;
            }, runHold, 'cubicout');
            flightTween.start();
        };

        runTravel();
    };

    const startHint = (hint, message = '') => {
        clearHintState();
        // Blocked is the only mode without a flight: no single trajectory can
        // say "these are in the way of something still in the tray". Normal and
        // mistake both reduce to "this goes there", so both fly.
        const isBlockedHint = !!hint.blocked;
        hintState = {
            ...hint,
            blockers: placedPiecesOverlapping(hint.cells, hint.piece),
            step: 0,
        };
        if (!isBlockedHint) startFlight(hint);
        if (message) showRewardMessage(message);

        // A looping flight outlives a static call-out, so the teardown budget is
        // per-mode. Reduced motion has nothing to loop, so it uses the short one.
        const life = (flight && flight.phase !== 'settled')
            ? FLIGHT_LIFE_STEPS
            : HINT_LIFE_STEPS;
        hintState.life = life;

        hintTimer = setInterval(() => {
            hintStep++;
            if (hintState) hintState.step = hintStep;
            if (hintStep > life) clearHintState();
        }, HINT_TICK_MS);
    };

    const showRewardMessage = (msg) => {
        if (!msg) return;
        rewardMessage = msg;
        rewardMsgLife = 120;
        if (rewardMsgTimer) clearInterval(rewardMsgTimer);
        rewardMsgTimer = setInterval(() => {
            rewardMsgLife -= 2;
            if (rewardMsgLife <= 0) {
                rewardMsgLife = 0;
                rewardMessage = '';
                clearInterval(rewardMsgTimer);
                rewardMsgTimer = null;
            }
        }, 20);
    };

    const showNoHints = () => {
        noHintMsg = 100;
        if (noHintTimer) clearInterval(noHintTimer);
        noHintTimer = setInterval(() => {
            noHintMsg -= 2;
            if (noHintMsg <= 0) {
                noHintMsg = 0;
                clearInterval(noHintTimer);
                noHintTimer = null;
            }
        }, 20);
    };

    // The hint call-outs need their base color at several alphas. This used to
    // be done by concatenating a hex alpha suffix onto the color (`${c}24`),
    // which is a trap: the moment a value stops being 6-digit hex — an rgba(),
    // an oklch(), an 8-digit hex — the result is an invalid fill and the focus
    // box silently disappears rather than erroring. Parse instead, and fall
    // back to the opaque color rather than to nothing.
    const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
    const withHexAlpha = (color, alpha) => {
        const m = HEX6.exec(color || '');
        if (!m) return color;
        return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
    };

    const facetPoly = (fi, x, y, cs) => {
        const center = cs / 2;
        let poly;
        if (fi === 0) poly = [[0, 0], [cs, 0], [center, center]];
        else if (fi === 1) poly = [[0, 0], [center, center], [0, cs]];
        else if (fi === 2) poly = [[cs, 0], [cs, cs], [center, center]];
        else poly = [[0, cs], [center, center], [cs, cs]];
        return poly.map(p => [x + p[0], y + p[1]]);
    };

    const drawChip = (render, label, x, y) => {
        const t = Theme.get();
        const w = Math.max(76, label.length * 7 + 20);
        const h = 24;
        const px = clamp(x - w / 2, 12, CANVAS_W - w - 12);
        const py = clamp(y, 58, 540);
        render.drawWithShadow(() => {
            render.roundRect(px, py, w, h, 12, t.hintChipBg);
        }, { blur: 10, offsetY: 4, color: 'rgba(0,0,0,0.18)' });
        render.text(label, px + w / 2, py + 5, {
            fill: t.hintChipText,
            align: 'center',
            font: 'bold 12px Outfit, sans-serif',
        });
    };

    return {
        useHint() {
            if (!canAfford(HINT_COST)) {
                SoundEngine.menuOpen();
                HapticsEngine.selection();
                // Broke players need the out-of-coins sheet (it offers the
                // rewarded ad), not a canvas toast that dead-ends. The DOM layer
                // registers this hook in UI.init; the canvas message stays as a
                // fallback for the window before that, and for the level lab.
                if (state.modules.promptForCoins) state.modules.promptForCoins('hint');
                else showNoHints();
                return;
            }
            const mistakeHint = findMistakeHint();
            if (mistakeHint) {
                spendCoins(HINT_COST);
                SoundEngine.hint();
                HapticsEngine.selection();
                startHint(mistakeHint);
                return;
            }
            const hint = findHintForPiece();
            if (!hint) {
                const blockedHint = findBlockedHintForPiece();
                if (blockedHint) {
                    // Don't charge for a "you're blocked" cue — it's not a solve hint.
                    SoundEngine.menuOpen();
                    HapticsEngine.selection();
                    startHint({ ...blockedHint, blocked: true });
                    return;
                }
                SoundEngine.drop();
                HapticsEngine.selection();
                showRewardMessage('No hint available');
                return;
            }
            spendCoins(HINT_COST);
            SoundEngine.hint();
            HapticsEngine.light();
            startHint(hint);
        },

        // Solve Piece coin sink: an unplaced piece with a currently-free correct
        // spot, or — when every free correct spot is blocked by the player's own
        // misplacements — a misplaced placed piece to RELOCATE to its real spot
        // (wasPlaced: true). Solve must always make progress toward the solution
        // when one exists, never dead-end. Frozen pieces are skipped: auto-
        // placing one would bypass the frost mechanic the level is built around.
        findSolvablePlacement() {
            const { pieces, nPieces } = state;
            if (!getSolutionPlacements().length) return null;
            for (let pi = 0; pi < nPieces; pi++) {
                const piece = pieces[pi];
                if (piece.placed || piece.isLocked()) continue;
                for (const t of targetsForPiece(piece)) {
                    if (Board.canPlaceAt(piece, t.x, t.y)) return buildHint(piece, t.x, t.y);
                }
            }
            // No direct placement — relocate the first misplaced piece whose
            // correct spot frees up once it's lifted off the board. The board is
            // restored before returning; the caller re-lifts to animate the move.
            for (let pi = 0; pi < nPieces; pi++) {
                const piece = pieces[pi];
                if (!piece.placed || piece.isLocked() || !piece.boardPos || piece.boardPos.x < 0) continue;
                if (isSolutionPlacement(piece, piece.boardPos.x, piece.boardPos.y)) continue;
                const prev = { x: piece.boardPos.x, y: piece.boardPos.y };
                Board.liftPiece(piece);
                let target = null;
                for (const t of targetsForPiece(piece)) {
                    if (Board.canPlaceAt(piece, t.x, t.y)) { target = t; break; }
                }
                Board.placePieceAt(piece, prev.x, prev.y, false);
                if (target) return { ...buildHint(piece, target.x, target.y), wasPlaced: true };
            }

            // Pass 3 — clear the way.
            //
            // Passes 1 and 2 both require a correct spot that is either already
            // free, or frees up by moving the one piece sitting in it. Neither
            // holds in the ordinary case where a player has wedged two or three
            // wrong pieces into each other's homes: every candidate target is
            // occupied, and no occupant's own target is free either. Solve then
            // returned null and silently did nothing — while still looking like
            // a button the player had just paid 20 coins to press.
            //
            // So: pick the unplaced piece whose correct spot needs the fewest
            // wrong pieces evicted, and report those blockers. The caller sends
            // them back to the tray and lands the right piece in the space.
            // This always makes progress on a solvable board, which is the
            // guarantee a paid action has to carry.
            // The candidate must be ANY piece not yet in a correct spot, not
            // just an unplaced one. On a full board with two pieces swapped
            // into each other's homes there are no unplaced pieces at all, and
            // restricting this loop to the tray reproduced the dead press it
            // was written to fix.
            let best = null;
            for (let pi = 0; pi < nPieces; pi++) {
                const piece = pieces[pi];
                if (piece.isLocked()) continue;
                const misplaced = piece.placed && piece.boardPos && piece.boardPos.x >= 0
                    && !isSolutionPlacement(piece, piece.boardPos.x, piece.boardPos.y);
                if (piece.placed && !misplaced) continue;
                for (const t of targetsForPiece(piece)) {
                    const blockers = placedPiecesOverlapping(buildHintCells(piece, t.x, t.y), piece);
                    // No blockers means pass 1 already had it, or the only thing
                    // in the way is anchored (placedPiecesOverlapping omits those)
                    // and this target is genuinely unreachable.
                    if (!blockers.length) continue;
                    // Never evict a piece the player got RIGHT, and never one they
                    // are not allowed to move. Undoing correct work cannot shorten
                    // the solve, and would feel like the button broke the board.
                    if (blockers.some(b => b.isLocked()
                        || isSolutionPlacement(b, b.boardPos.x, b.boardPos.y))) continue;
                    if (!best || blockers.length < best.evict.length) {
                        // wasPlaced tells the caller to lift this piece off the
                        // board first, exactly as pass 2 does.
                        best = { ...buildHint(piece, t.x, t.y), evict: blockers, wasPlaced: !!misplaced };
                    }
                }
            }
            return best;
        },

        showMistakeHint() {
            const mistakeHint = findMistakeHint();
            if (!mistakeHint) {
                showRewardMessage('Some pieces are misplaced');
                return false;
            }
            SoundEngine.menuOpen();
            HapticsEngine.selection();
            startHint(mistakeHint);
            return true;
        },

        drawBoardHint() {
            if (!hintState || !state.playing) return;
            const { render, cellSize } = state;
            const t = Theme.get();
            const { piece, targetX, targetY, cells } = hintState;
            const step = hintState.step || 0;
            const pulse = (Math.sin((hintState.step || 0) * 0.18) + 1) / 2;
            const ringPad = 8 + pulse * 3;
            const wrongColor = t.hintWrong;
            const rightColor = t.hintRight;
            const sourceColor = t.hintSourceGlow || '#8b6ff0';
            const isMistake = !!hintState.mistake;
            const blockers = hintState.blockers || [];
            const isBlocked = !!hintState.blocked && blockers.length > 0;
            const showSource = !piece.placed && !isMistake && !isBlocked;
            const showBlockers = isBlocked;
            // Every mode that has a flight lights BOTH ends from frame one: the
            // motion is what sequences the eye, so there is nothing left to
            // withhold. Only blocked still stages its reveal — it has no flight,
            // and its red "these are in the way" call-out has to land before the
            // green answer or the two read as one undifferentiated blob.
            const showTarget = isBlocked ? step >= 72 : true;

            // Fade the whole hint in and back out instead of popping it on and
            // cutting it off at teardown.
            const life = hintState.life || HINT_LIFE_STEPS;
            const fadeIn = Math.min(1, step / SCRIM_IN_STEPS);
            const tail = clamp((life - step) / SCRIM_OUT_STEPS, 0, 1);
            const k = fadeIn * tail;

            const drawOutline = (x, y, w, h, radius, stroke, width = 3, dashed = false) => {
                const ctx = render.ctx;
                ctx.save();
                ctx.strokeStyle = stroke;
                ctx.lineWidth = width;
                if (dashed) ctx.setLineDash([8, 6]);
                render.roundRect(x, y, w, h, radius, 'rgba(255,255,255,0)');
                ctx.stroke();
                ctx.restore();
            };

            const drawCells = (hintCells, fill, alpha) => {
                render.withAlpha(alpha * k, () => {
                    hintCells.forEach(cell => {
                        const px = Board.x + cell.x * cellSize;
                        const py = Board.y + cell.y * cellSize;
                        cell.facets.forEach((on, fi) => {
                            if (on) render.polygon(facetPoly(fi, px, py, cellSize), fill);
                        });
                    });
                });
            };

            const drawFocusBox = (x, y, w, h, color, dashed = false, label = '') => {
                render.withAlpha((0.30 + pulse * 0.12) * k, () => {
                    render.drawWithShadow(() => {
                        render.roundRect(x - ringPad, y - ringPad, w + ringPad * 2, h + ringPad * 2, 14, withHexAlpha(color, 0.14));
                    }, { blur: 18, offsetY: 0, color: withHexAlpha(color, 0.40) });
                });
                // drawOutline / drawChip take no alpha of their own and never
                // nest a withAlpha (which would reset globalAlpha to 1), so
                // wrapping them here is safe.
                render.withAlpha(k, () => {
                    drawOutline(x - ringPad, y - ringPad, w + ringPad * 2, h + ringPad * 2, 14, color, dashed ? 4 : 3, dashed);
                    if (label) drawChip(render, label, x + w / 2, y - 30);
                });
            };

            // Everything in the play band goes quiet. The pieces this hint is
            // actually about are re-blitted on top below, so the scrim reads as
            // "look here" rather than "the screen dimmed".
            render.withAlpha(k, () => {
                render.rect(0, HINT_SCRIM_TOP, state.CANVAS_W, HINT_SCRIM_BOTTOM - HINT_SCRIM_TOP, t.hintScrim);
            });

            // Lift the called-out piece(s) back out of the scrim at full
            // opacity. Skipped while the player is dragging one, because
            // game.js draws the dragged piece itself with its lift/tilt state
            // and a second static blit would ghost underneath it.
            const relight = (p) => {
                if (!p || state.activeDragPiece === p) return;
                p.draw(render, false);
            };

            if (isMistake && hintState.wrongCells) {
                // relight keeps the flight's origin unmistakable: the piece the
                // ghost launches from is the one bright object under the scrim.
                relight(piece);
                drawCells(hintState.wrongCells, wrongColor, 0.28 + pulse * 0.12);
                render.withAlpha((0.38 + pulse * 0.18) * k, () => {
                    render.drawWithShadow(() => {
                        render.roundRect(hintState.wrongX - ringPad, hintState.wrongY - ringPad, piece.width + ringPad * 2, piece.height + ringPad * 2, 12, withHexAlpha(wrongColor, 0.24));
                    }, { blur: 16, offsetY: 0, color: withHexAlpha(wrongColor, 0.46) });
                });
                // No label: the flight below says "move this there" without
                // words. The DASHED outline stays — dashed-vs-solid is the only
                // non-color channel separating wrong from right, and red/green
                // is the worst possible pair to leave carrying that alone.
                drawFocusBox(hintState.wrongX, hintState.wrongY, piece.width, piece.height, wrongColor, true);
            }

            if (showBlockers) {
                blockers.forEach(relight);
                blockers.forEach(blocker => {
                    drawFocusBox(blocker.x, blocker.y, blocker.width, blocker.height, wrongColor, true, 'Move');
                });
            }

            if (showTarget) {
                drawCells(cells, rightColor, isBlocked ? 0.16 + pulse * 0.06 : 0.22 + pulse * 0.10);
                render.withAlpha((isBlocked ? 0.22 + pulse * 0.08 : 0.36 + pulse * 0.12) * k, () => {
                    render.drawWithShadow(() => {
                        render.roundRect(targetX - ringPad, targetY - ringPad, piece.width + ringPad * 2, piece.height + ringPad * 2, 12, t.hintTargetFill);
                    }, { blur: 18, offsetY: 0, color: rightColor });
                });
                render.withAlpha(k, () => {
                    drawOutline(targetX - ringPad, targetY - ringPad, piece.width + ringPad * 2, piece.height + ringPad * 2, 12, rightColor, 3, false);
                });
                // Only blocked parks a ghost here. The flighted modes land their
                // own ghost on this spot and leave it there, so a second one
                // would double up through the whole settle.
                //
                // There is no 'Here' chip any more. Immediately above this line
                // we draw a ghost of that exact piece at that exact spot inside
                // a pulsing outline — the word was pure redundancy.
                if (isBlocked) {
                    piece.drawGhost(render, targetX, targetY, 0.22 * k, true);
                }
            }

            if (showSource) {
                const sourcePad = 8 + pulse * 4;
                render.withAlpha((0.36 + pulse * 0.20) * k, () => {
                    render.drawWithShadow(() => {
                        render.roundRect(piece.x - sourcePad, piece.y - sourcePad, piece.width + sourcePad * 2, piece.height + sourcePad * 2, 14, t.hintSourceRing);
                    }, { blur: 16, offsetY: 0, color: t.hintSourceGlow });
                });
                relight(piece);
                render.withAlpha(k, () => {
                    drawOutline(piece.x - sourcePad, piece.y - sourcePad, piece.width + sourcePad * 2, piece.height + sourcePad * 2, 14, sourceColor, 3, false);
                });
            }

            // ---- The flight ---------------------------------------------
            // Normal mode flies from the tray to the home slot. Mistake mode
            // flies from the piece's WRONG board position to that same slot —
            // "move this from here to there" is exactly the instruction the
            // gesture exists to express, so it earns the flight and loses its
            // 'Move' chip.
            //
            // Blocked never gets one. "These placed pieces are in the way of a
            // different piece that is still in the tray" is a three-part claim
            // with no single sensible trajectory, so it keeps its words.
            //
            // Source is read live rather than captured at hint start: the tray
            // can re-flow underneath an open hint, and a stale origin would
            // launch the ghost from empty space.
            if (flight) {
                const sx = isMistake ? hintState.wrongX : piece.x;
                const sy = isMistake ? hintState.wrongY : piece.y;
                const gx = sx + (targetX - sx) * flight.t;
                const gy = sy + (targetY - sy) * flight.t;
                let ghostAlpha = FLIGHT_GHOST_ALPHA;
                if (flight.phase === 'travel') {
                    // Fades up as it departs, which also covers the seam where
                    // the previous loop's ghost faded out.
                    ghostAlpha *= Math.min(1, flight.t / 0.10);
                } else if (flight.phase === 'hold' && flight.loop < FLIGHT_LOOPS - 1) {
                    // Every hold but the last dissolves at the target instead of
                    // hard-cutting back to the source.
                    ghostAlpha *= 1 - Math.max(0, (flight.hold - 0.5) * 2);
                }
                piece.drawGhost(render, gx, gy, ghostAlpha * k, true);
            }
        },

        draw() {
            const { render, playing, victory } = state;
            if (!playing && !victory) return;
            const t = Theme.get();

            if (rewardMsgLife > 0 && rewardMessage) {
                render.withAlpha(Math.min(1, rewardMsgLife / 40), () => {
                    render.text(rewardMessage, CANVAS_W / 2, 42, {
                        fill: t.victoryColor,
                        align: 'center',
                        font: 'bold 14px Outfit, sans-serif',
                    });
                });
            }

            if (noHintMsg > 0) {
                render.withAlpha(Math.min(1, noHintMsg / 50), () => {
                    render.text('No hints left!', CANVAS_W / 2, 42, {
                        fill: '#e05252',
                        align: 'center',
                        font: 'bold 14px Outfit, sans-serif',
                    });
                });
            }

        },

        // Named for the piece nudge it used to cancel; it now stops the ghost
        // flight. Still called by js/game.js on pickup and before Solve, and the
        // meaning survives the rename: the player has started acting, so stop
        // animating at them. The target stays lit — only the motion ends.
        stopNudge() {
            clearFlight();
        },

        clearActiveHint() {
            clearHintState();
        },

        // Lets the caller surface the same in-canvas toast the hint paths use.
        // Solve needs it for the one case it can still decline to act, so the
        // button is never silent — silence on a paid action reads as a bug.
        showMessage(msg) {
            showRewardMessage(msg);
        },

        reset() {
            clearHintState();
            if (noHintTimer) { clearInterval(noHintTimer); noHintTimer = null; }
            noHintMsg = 0;
            if (rewardMsgTimer) { clearInterval(rewardMsgTimer); rewardMsgTimer = null; }
            rewardMessage = '';
            rewardMsgLife = 0;
        },
    };
})();

export default HintSystem;
