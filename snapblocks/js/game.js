/**
 * SnapBlocks — Main Game Module (Entry Point)
 *
 * Phase 1 of the UI/UX refresh moved all UI chrome (splash, menu, level select,
 * pause sheet, level complete, settings, trophies, shop, daily) out of the
 * canvas and into DOM overlays in js/ui/*. The canvas now only renders the
 * gameplay board + pieces, and only matters when the DOM UI is on the "game"
 * screen (the screen is transparent so the canvas shows through).
 *
 * This file wires:
 *   - Canvas infra (renderer, input, sound, music, haptics, theme, floaters)
 *   - Level loading + intro/outro transitions
 *   - Piece drag/drop + victory detection
 *   - The DOM ↔ canvas bridge via `UI.init(hooks)`
 */

import { LEVELS } from './levels.js?v=5071259f5c9c';
import SoundEngine from './sound.js?v=5071259f5c9c';
import MusicEngine from './music.js?v=5071259f5c9c';
import Transition from './transition.js?v=5071259f5c9c';
import Renderer from './renderer.js?v=5071259f5c9c';
import Input from './input.js?v=5071259f5c9c';
import FloatingBlock from './floatingBlock.js?v=5071259f5c9c';
import Theme from './theme.js?v=5071259f5c9c';
import HapticsEngine from './haptics.js?v=5071259f5c9c';

import state, { saveConfig, loadConfig } from './state.js?v=5071259f5c9c';
import Board, { BOARD_SIZE, createGrid, createPieces, decomposeLevel } from './board.js?v=5071259f5c9c';
import HintSystem from './hintSystem.js?v=5071259f5c9c';
import UI from './ui/index.js?v=5071259f5c9c';
// Side-effect only: scales the active portrait or portal-landscape stage to fit
// a browser viewport. No-ops on Android, where the WebView is phone-sized.
import './ui/stageScale.js?v=5071259f5c9c';
import { onLevelClear, checkInPlay } from './progression.js?v=5071259f5c9c';
import { initializeAds, loadRewardedHintAd, loadInterstitialAd, interstitialDecision, showInterstitialAd } from './ads.js?v=5071259f5c9c';
import { maybeRequestPermissionAndSchedule, rescheduleNotifications } from './notifications.js?v=5071259f5c9c';
import UpdateCheck from './updateCheck.js?v=5071259f5c9c';
import { addCoins, getCoins, spendCoins, REWARD_PRISM, REWARD_PULSE, SOLVE_COST, firstClearReward, REWARD_CHAPTER_RESTORE, REWARD_TREASURE, MAX_LEVEL_CLEAR_COINS } from './economy.js?v=5071259f5c9c';
import { isTreasureLevel } from './treasure.js?v=5071259f5c9c';
import { getPulseTargets, isPulseLevel, PULSE_NODE_COUNT } from './pulse.js?v=5071259f5c9c';
import { getAnchoredLevel, getAnchoredGrid } from './anchored.js?v=5071259f5c9c';
import { recordGoalEvent } from './missions.js?v=5071259f5c9c';
import { trackEvent } from './analytics.js?v=5071259f5c9c';
import { gameplayStart, gameplayStop } from './platform/lifecycle.js?v=5071259f5c9c';
import CloudSave from './cloudSave.js?v=5071259f5c9c';
import Tutorial, { TUTORIAL_LEVELS } from './tutorial.js?v=5071259f5c9c';
import { LEVEL_META } from './levels.js?v=5071259f5c9c';
import { SIZE as CHAPTER_SIZE, chapterOf, STAGE_AT } from './chapters.js?v=5071259f5c9c';
import { MIX_BONUS } from './mixRecipes.js?v=5071259f5c9c';
import {
    ACTIVE_MODE_KEY,
    DAILY_SAVE_KEY,
    getDailyPuzzle,
    getFocusLabel,
    getFocusStars,
    getLocalDateKey,
    markDailyComplete,
} from './daily.js?v=5071259f5c9c';
// LAB (prototype): every lab system lives in js/lab/. Deleting that folder and
// the six `LAB (prototype)` call sites below removes the feature completely.
import { loadLabLevel, syncBloomProgress, labWinConditionMet } from './lab/labMode.js?v=5071259f5c9c';
import { TRAY_LAYOUT } from './playLayout.js?v=5071259f5c9c';
import { CRAZYGAMES_LANDSCAPE } from './platform/runtime.js?v=5071259f5c9c';

const { CANVAS_W, CANVAS_H } = state;
const LANDSCAPE_PLAY = CRAZYGAMES_LANDSCAPE;
const ACTIVE_SAVE_KEY = 'snapblocks.activeLevel.v1';
// One timing contract for the signature mix card and the tutorial pause. The
// board may animate less under reduced motion, but the message remains readable
// for the same amount of time.
const MIX_CELEBRATION_MS = 1700;

// The 300px snapping grid sits inside a 312px card (BOARD_SIZE + CARD_PAD*2),
// spanning y 118..430. PLAY_LAYOUT describes the piece area inside the compact
// reference-style tray, not the tray chrome. The shell bottoms out at y 640,
// leaving 60px for the device safe area (the DOM's --sb-game-safe-bottom uses a
// conservative 44px fallback for WebViews that under-report insets).
//
// The piece band grew UPWARD (trayTop 500 -> 474) into the dead air that used
// to sit between the card and the tray. Growing the band is the only
// lever that actually enlarges tray pieces: every tray scale is a fit against
// this band, so raising BOARD_SIZE alone just makes the fit-scale smaller and
// the pieces render at exactly the same size. pieceBottom and the shell's
// bottom edge (640) are deliberately unchanged — the safe-area budget and
// hintSystem's HINT_SCRIM_BOTTOM both key off that edge.
const PLAY_LAYOUT = {
    trayTop: TRAY_LAYOUT.top,
    trayHeight: TRAY_LAYOUT.bottom - TRAY_LAYOUT.top,
    trayPadX: TRAY_LAYOUT.left,
    trayRight: TRAY_LAYOUT.right,
    trayGap: TRAY_LAYOUT.gap,
    pieceBottom: TRAY_LAYOUT.bottom,
};
// The well is the dashed inner guide rather than a second raised panel.
const TRAY_WELL_PAD = 7;
const TRAY_WELL = {
    x: PLAY_LAYOUT.trayPadX - TRAY_WELL_PAD,
    y: PLAY_LAYOUT.trayTop - TRAY_WELL_PAD,
    w: (PLAY_LAYOUT.trayRight - PLAY_LAYOUT.trayPadX) + TRAY_WELL_PAD * 2,
    h: (PLAY_LAYOUT.pieceBottom - PLAY_LAYOUT.trayTop) + TRAY_WELL_PAD * 2,
};
// The shell keeps its 14px of chrome above the piece band and 16px below, so
// it rises with trayTop. Width is untouched: TRAY_WELL sits 7px inside the
// shell rim on every side, and widening the band without widening the shell
// would push the dashed guide out over the rim.
const TRAY_SHELL = TRAY_LAYOUT.shell;
const MAIN_TRAY_LIMIT = 5;
const RESERVE_SCALE = 0.58;
const SINGLE_ROW_LIMIT = 6;
// Where the overflow shelf's band starts, as a fraction of the piece band.
// The shelf occupies everything from here down to PLAY_LAYOUT.pieceBottom.
const RESERVE_BAND_TOP = 0.56;

// A tray slot stores the piece's UNSCALED origin, but the piece renders from
// getDisplayBounds(scale), which centres the scaled box inside the unscaled
// one. Clamping the raw origin therefore lets scaled pieces spill past the
// well. This converts a desired *visual* top-left into the unscaled origin
// that puts it there, clamped so the visible rect always lands inside the
// piece area.
const traySlotOrigin = (piece, scale, visualX, visualY) => {
    const vw = piece.width * scale;
    const vh = piece.height * scale;
    const maxX = Math.max(PLAY_LAYOUT.trayPadX, PLAY_LAYOUT.trayRight - vw);
    const maxY = Math.max(PLAY_LAYOUT.trayTop, PLAY_LAYOUT.pieceBottom - vh);
    const vx = clamp(visualX, PLAY_LAYOUT.trayPadX, maxX);
    const vy = clamp(visualY, PLAY_LAYOUT.trayTop, maxY);
    return {
        x: Math.round(vx - piece.width * (1 - scale) / 2),
        y: Math.round(vy - piece.height * (1 - scale) / 2),
    };
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getPieceTrayScale = (piece, rowCount) => {
    // The ceiling was once 112, sized for a 112-tall tray, which capped pieces
    // at exactly the tray height and wasted every later increase; it rose to
    // 132 for that reason. It stays at 132 now that the band is 144: 132 is
    // just under the band's own 141 limit, and raising it further would push a
    // single main row down into the overflow shelf's band. The per-row divisor
    // governs two-row layouts, which is where the band growth pays off most
    // (60.8 -> 70.6 per row) because those are the most crowded levels.
    const maxH = Math.min(132, (PLAY_LAYOUT.trayHeight / rowCount) * 0.98);
    const maxW = 112;
    let s = 1.0;
    if (piece.height > maxH) s = Math.min(s, maxH / piece.height);
    if (piece.width > maxW) s = Math.min(s, maxW / piece.width);
    // No hard floor: a floor above the fit scale made tall pieces overflow
    // their row and pile on top of each other. Small tray pieces are fine —
    // they grow to full size under the finger on pickup.
    return s;
};

/**
 * Portal cabinet packer. Mobile's tray is a wide, shallow shelf; reusing that
 * row algorithm in a tall right-hand cabinet made pieces tiny and produced
 * collisions on crowded levels. This grid evaluates sensible column counts,
 * chooses the arrangement with the strongest worst-case scale, and centers
 * every piece in a private cell. Containment and non-overlap are structural.
 */
const getLandscapeTraySlots = (pieces) => {
    const slots = new Map();
    if (!pieces.length) return slots;

    const width = PLAY_LAYOUT.trayRight - PLAY_LAYOUT.trayPadX;
    const height = PLAY_LAYOUT.pieceBottom - PLAY_LAYOUT.trayTop;
    const gap = PLAY_LAYOUT.trayGap;
    const maxColumns = Math.min(4, pieces.length);
    const minColumns = pieces.length <= 3 ? 1 : 2;
    let best = null;

    for (let columns = minColumns; columns <= maxColumns; columns += 1) {
        const rows = Math.ceil(pieces.length / columns);
        const cellW = (width - gap * (columns - 1)) / columns;
        const cellH = (height - gap * (rows - 1)) / rows;
        const scales = pieces.map(piece => Math.min(
            1,
            Math.max(0.1, (cellW - 8) / piece.width),
            Math.max(0.1, (cellH - 8) / piece.height),
        ));
        const minScale = Math.min(...scales);
        const averageScale = scales.reduce((sum, scale) => sum + scale, 0) / scales.length;
        const score = minScale * 3 + averageScale;
        if (!best || score > best.score) best = { columns, rows, cellW, cellH, scales, score };
    }

    // Column-major order keeps the eye moving down the cabinet before moving
    // right, matching the vertical shape of the available space.
    pieces.forEach((piece, index) => {
        const column = Math.floor(index / best.rows);
        const row = index % best.rows;
        const scale = best.scales[index];
        const visualX = PLAY_LAYOUT.trayPadX
            + column * (best.cellW + gap)
            + (best.cellW - piece.width * scale) / 2;
        const visualY = PLAY_LAYOUT.trayTop
            + row * (best.cellH + gap)
            + (best.cellH - piece.height * scale) / 2;
        slots.set(piece, { ...traySlotOrigin(piece, scale, visualX, visualY), scale });
    });

    return slots;
};

const getTraySlots = (pieces) => {
    if (LANDSCAPE_PLAY) return getLandscapeTraySlots(pieces);
    const maxRowW = PLAY_LAYOUT.trayRight - PLAY_LAYOUT.trayPadX;
    const slots = new Map();
    if (!pieces.length) return slots;

    const trayFullH = PLAY_LAYOUT.pieceBottom - PLAY_LAYOUT.trayTop;
    const sorted = [...pieces].sort((a, b) => (b.width * b.height) - (a.width * a.height));

    // Ordinary levels use one centered row at one shared scale. Preserving a
    // common cell size across every shape is what makes the tray read as an
    // intentional composition instead of a collection of unrelated objects.
    if (pieces.length <= SINGLE_ROW_LIMIT) {
        const ordered = [...pieces];
        const gap = PLAY_LAYOUT.trayGap;
        const rawW = ordered.reduce((sum, piece) => sum + piece.width, 0);
        const maxH = Math.max(...ordered.map(piece => piece.height));
        const scale = Math.min(
            1,
            (maxRowW - gap * Math.max(0, ordered.length - 1)) / rawW,
            (trayFullH * 0.82) / maxH,
        );
        const packedW = ordered.reduce((sum, piece) => sum + piece.width * scale, 0)
            + gap * Math.max(0, ordered.length - 1);
        let x = PLAY_LAYOUT.trayPadX + Math.max(0, (maxRowW - packedW) / 2);
        const centerY = PLAY_LAYOUT.trayTop + trayFullH / 2;

        ordered.forEach(piece => {
            const scaledH = piece.height * scale;
            slots.set(piece, {
                ...traySlotOrigin(piece, scale, x, centerY - scaledH / 2),
                scale,
            });
            x += piece.width * scale + gap;
        });
        return slots;
    }

    const mainCount = pieces.length <= 8 ? pieces.length : Math.min(MAIN_TRAY_LIMIT, pieces.length);
    const mainPool = sorted.slice(0, mainCount);
    const reservePieces = sorted.slice(mainCount);

    // Tall sticks (3+ cells high, narrow) become full-height columns on the
    // left. Inside a half-height row they'd shrink to unreadable slivers.
    const isColumn = (p) => p.height >= p.width * 2.5;
    const columnPieces = mainPool.filter(isColumn);
    const mainPieces = mainPool.filter(p => !isColumn(p));

    const pieceScales = new Map();
    let columnsRight = PLAY_LAYOUT.trayPadX;
    if (columnPieces.length) {
        const colGap = 10;
        let x = PLAY_LAYOUT.trayPadX;
        columnPieces.forEach(p => {
            const s = Math.min(1, trayFullH / p.height, 112 / p.width);
            pieceScales.set(p, s);
            const cx = x + (p.width * s) / 2;
            const cy = PLAY_LAYOUT.trayTop + trayFullH / 2;
            slots.set(p, {
                x: Math.round(cx - p.width / 2),
                y: Math.round(cy - p.height / 2),
                scale: s,
            });
            x += p.width * s + colGap;
        });
        columnsRight = x;
    }
    const rowAreaX = columnsRight;
    const rowAreaW = Math.max(60, PLAY_LAYOUT.trayRight - rowAreaX);

    // Adaptive rows: prefer a single row (pieces stay bigger and never stack)
    // and only split into two when the single-row widths genuinely don't fit.
    let rowCount = 1;
    if (mainPieces.length >= 4) {
        const oneRowW = mainPieces.reduce(
            (sum, p) => sum + p.width * getPieceTrayScale(p, 1), 0
        ) + PLAY_LAYOUT.trayGap * (mainPieces.length - 1);
        if (oneRowW > rowAreaW) rowCount = 2;
    }

    mainPieces.forEach(p => {
        pieceScales.set(p, getPieceTrayScale(p, rowCount));
    });

    const rows = Array.from({ length: rowCount }, () => []);
    mainPieces.forEach((piece) => {
        const targetRow = rows
            .map((row, idx) => ({
                idx,
                width: row.reduce((sum, p) => sum + p.width * pieceScales.get(p), 0) + PLAY_LAYOUT.trayGap * row.length,
            }))
            .sort((a, b) => a.width - b.width)[0].idx;
        rows[targetRow].push(piece);
    });

    // Two-row centers leave a 2%-of-band safety lane between the largest
    // possible pieces. Neither row touches a tray edge, so outlines
    // and shadows cannot visually merge or cross the dashed well.
    //
    // The single-row center used to be pinned high (0.42) to leave room for the
    // reserve shelf below. That shelf only exists when there are overflow
    // pieces, so when there aren't the row now centers properly at 0.5 instead
    // of sitting oddly high in a taller tray.
    const singleRowCenter = reservePieces.length ? 0.40 : 0.5;
    const rowCenters = rowCount === 1
        ? [PLAY_LAYOUT.trayTop + PLAY_LAYOUT.trayHeight * singleRowCenter]
        : [
            PLAY_LAYOUT.trayTop + PLAY_LAYOUT.trayHeight * 0.245,
            PLAY_LAYOUT.trayTop + PLAY_LAYOUT.trayHeight * 0.755,
        ];

    rows.forEach((row, rowIdx) => {
        if (!row.length) return;
        // If the row overflows even with a tight gap, shrink every piece in the
        // row proportionally instead of letting them overlap — an overlapping
        // pile reads as broken, small pieces just grow again on pickup.
        const minGap = 6;
        let totalW = row.reduce((sum, piece) => sum + piece.width * pieceScales.get(piece), 0);
        const overflow = totalW + minGap * (row.length - 1) - rowAreaW;
        if (overflow > 0) {
            const shrink = (rowAreaW - minGap * (row.length - 1)) / totalW;
            row.forEach(piece => pieceScales.set(piece, pieceScales.get(piece) * shrink));
            totalW = row.reduce((sum, piece) => sum + piece.width * pieceScales.get(piece), 0);
        }
        const idealGap = row.length > 1 ? (rowAreaW - totalW) / (row.length - 1) : 0;
        const gap = row.length > 1
            ? clamp(idealGap, minGap, PLAY_LAYOUT.trayGap)
            : 0;
        const packedW = totalW + gap * Math.max(0, row.length - 1);
        let x = rowAreaX + Math.max(0, (rowAreaW - packedW) / 2);

        row.forEach((piece) => {
            const scale = pieceScales.get(piece);
            const pw = piece.width * scale;
            const ph = piece.height * scale;

            const maxX = Math.max(rowAreaX, PLAY_LAYOUT.trayRight - pw);
            const wantX = pw > rowAreaW
                ? clamp(rowAreaX + (rowAreaW - pw) / 2, PLAY_LAYOUT.trayPadX, maxX)
                : clamp(x, rowAreaX, maxX);
            // Was: a piece taller than the tray fell back to minY = 5, which
            // parked it near the top of the canvas — on top of the board.
            // getPieceTrayScale already shrinks pieces to fit, so the honest
            // answer when one is still too tall is to pin it to the tray top
            // and let it be clipped there, never to escape the tray.
            const wantY = rowCenters[rowIdx] - ph / 2;

            slots.set(piece, { ...traySlotOrigin(piece, scale, wantX, wantY), scale });
            x += pw + gap;
        });
    });

    if (reservePieces.length) {
        // The overflow shelf gets the lower part of the piece band. Giving it an
        // explicit band (rather than centring on a single shelf line) is what
        // lets the scale below be capped against a real height budget.
        const bandTop = PLAY_LAYOUT.trayTop + PLAY_LAYOUT.trayHeight * RESERVE_BAND_TOP;
        const bandH = PLAY_LAYOUT.pieceBottom - bandTop;
        const shelfY = bandTop + bandH / 2;
        const maxReserveW = PLAY_LAYOUT.trayRight - PLAY_LAYOUT.trayPadX;
        // RESERVE_SCALE alone is a FIXED fraction with no height budget, so a
        // tall piece (a 7-row piece on a 7x7 board is ~312px unscaled) still
        // overflowed the well at 0.58 and traySlotOrigin could only pin it to
        // the top edge, not shrink it. Capping the scale by the band makes
        // containment a property of the layout rather than of the clamp.
        const scaleFor = (piece) => Math.min(
            RESERVE_SCALE,
            bandH / piece.height,
            maxReserveW / piece.width,
        );
        const scaledGap = 9;
        const piecesW = reservePieces.reduce((sum, piece) => sum + piece.width * scaleFor(piece), 0);
        const gapsW = scaledGap * Math.max(0, reservePieces.length - 1);
        // The shelf had no row-fit pass, unlike the main rows above. On the
        // widest levels (13 loose pieces) its row was already ~1.5x wider than
        // the well, and traySlotOrigin could only clamp each piece to the edge
        // — which piles them on top of each other rather than shrinking them.
        // Shrink the whole shelf proportionally instead, exactly as a main row
        // does, so containment is a property of the layout and a taller band
        // can never turn into a wider overflow.
        const rowFit = piecesW + gapsW > maxRowW
            ? Math.max(0, maxRowW - gapsW) / piecesW
            : 1;
        const totalW = piecesW * rowFit + gapsW;
        let x = PLAY_LAYOUT.trayPadX + Math.max(0, (maxRowW - totalW) / 2);
        reservePieces.forEach(piece => {
            const scale = scaleFor(piece) * rowFit;
            const scaledW = piece.width * scale;
            const scaledH = piece.height * scale;
            // Was clamped against the canvas (5 .. CANVAS_W - width - 5) using
            // the unscaled width, which let shelf pieces sit outside the well.
            slots.set(piece, {
                ...traySlotOrigin(piece, scale, x, shelfY - scaledH / 2),
                scale,
            });
            x += scaledW + scaledGap;
        });
    }

    return slots;
};

const arrangeLoosePiecesInTray = (duration = 240) => {
    const loosePieces = state.pieces.filter(p => !p.placed);
    const slots = getTraySlots(loosePieces);
    loosePieces.forEach(piece => {
        const slot = slots.get(piece);
        if (!slot) return;
        stopPieceMotion(piece);
        const targetScale = slot.scale || 1;
        const tx = new Transition(piece.x, slot.x, duration, v => { piece.x = v; }, null, 'cubicout');
        const ty = new Transition(piece.y, slot.y, duration, v => { piece.y = v; }, null, 'cubicout');
        piece._moveTransitions = [tx, ty];
        // Shrink toward tray size during the glide — an instant snap to small
        // read as a glitch when a bumped piece left the board.
        const fromScale = piece.displayScale || 1;
        if (state.config.reducedMotion || Math.abs(fromScale - targetScale) < 0.01) {
            piece.displayScale = targetScale;
        } else {
            const ts = new Transition(fromScale, targetScale, duration, v => { piece.displayScale = v; }, null, 'cubicout');
            piece._moveTransitions.push(ts);
            ts.start();
        }
        tx.start();
        ty.start();
    });
};

const restorePieceAfterInvalidDrop = (piece, origin = null) => {
    if (!piece) return;
    Board.showInvalidDrop(piece);
    stopPieceMotion(piece);
    // Keep the short refusal/return atomic. Without this guard a second drag
    // could occupy the original board cell before the first piece lands,
    // leaving its preserved history out of sync with the board.
    state.lockInput = true;
    const finishReturn = () => { if (!state.victory) state.lockInput = false; };
    const startX = piece.x;
    const startY = piece.y;
    const amplitude = Math.min(8, Math.max(4, state.cellSize * 0.1));
    const settle = () => {
        piece.x = startX;
        // Dragging raises the piece to the end of the draw-order array. Put a
        // rejected piece back at the exact index it had before pickup so tray
        // packing and placed-piece layering remain unchanged by a failed move.
        if (Number.isInteger(origin?.pieceIndex)) {
            const currentIndex = state.pieces.indexOf(piece);
            if (currentIndex >= 0) {
                state.pieces.splice(currentIndex, 1);
                state.pieces.splice(Math.min(origin.pieceIndex, state.pieces.length), 0, piece);
            }
        }
        if (origin?.wasPlaced && Number.isInteger(origin.boardPos?.x) && Number.isInteger(origin.boardPos?.y)) {
            const targetX = Board.x + origin.boardPos.x * state.cellSize;
            const targetY = Board.y + origin.boardPos.y * state.cellSize;
            const tx = new Transition(piece.x, targetX, 220, v => { piece.x = v; }, null, 'cubicout');
            const ty = new Transition(piece.y, targetY, 220, v => { piece.y = v; }, () => {
                if (!Board.placePieceAt(piece, origin.boardPos.x, origin.boardPos.y, false)) {
                    piece.x = origin.x;
                    piece.y = origin.y;
                    piece.placed = false;
                    piece.boardPos = { x: -1, y: -1 };
                    arrangeLoosePiecesInTray(220);
                }
                updateObjectiveProgress();
                finishReturn();
            }, 'cubicout');
            piece._moveTransitions = [tx, ty];
            tx.start();
            ty.start();
            return;
        }
        piece.y = startY;
        piece.placed = false;
        piece.boardPos = { x: -1, y: -1 };
        // Restoring the original order makes the tray layout resolve to the
        // same slot it occupied before pickup. Let arrange animate the return
        // from the rejected drop instead of teleporting through the pickup
        // position first.
        arrangeLoosePiecesInTray(260);
        setTimeout(finishReturn, 270);
    };
    // Skip the shake under reduced motion — just settle the piece back.
    if (state.config.reducedMotion) { settle(); return; }
    const shake = new Transition(0, 1, 150, p => {
        piece.x = startX + Math.sin(p * Math.PI * 4) * amplitude * (1 - p);
    }, settle, 'quadout');
    piece._moveTransitions = [shake];
    shake.start();
};

// Was the finger over the board (with a small margin) when it let go? A
// placed piece released anywhere OFF the board returns to the tray — the old
// rule (only the tray strip counted) made "just take it off" feel broken.
const releaseIsOverBoard = (coords) => {
    if (!coords) return true; // no coords — be conservative, snap back
    const m = 14;
    return coords.x >= Board.x - m && coords.x <= Board.x + Board.w + m
        && coords.y >= Board.y - m && coords.y <= Board.y + Board.h + m;
};

const returnPlacedPieceToTray = (piece) => {
    if (!piece) return;
    stopPieceMotion(piece);
    piece.placed = false;
    piece.boardPos = { x: -1, y: -1 };
    piece.displayScale = 1;
    Board.clearPreview();
    arrangeLoosePiecesInTray(240);
    updateObjectiveProgress();
};

const clearMoveHistory = () => {
    state.undoStack = [];
    state.redoStack = [];
};

const stopPieceMotion = (piece) => {
    if (!piece || !piece._moveTransitions) return;
    piece._moveTransitions.forEach(t => t.stop());
    piece._moveTransitions = [];
};

const removePieceFromHistory = (piece) => {
    state.undoStack = state.undoStack.filter(entry => entry.piece !== piece);
    state.redoStack = state.redoStack.filter(entry => entry.piece !== piece);
};

const pushPlacementHistory = (piece, loosePos, evicted = null) => {
    state.undoStack.push({
        piece,
        boardPos: { x: piece.boardPos.x, y: piece.boardPos.y },
        placedPos: { x: piece.x, y: piece.y },
        loosePos: { x: loosePos.x, y: loosePos.y },
        // Bump placements remember who they evicted (and from where) so undo
        // restores the whole move — dragged piece off, nudged pieces back on.
        evicted: evicted && evicted.length
            ? evicted.map(e => ({ piece: e.piece, boardPos: { ...e.boardPos } }))
            : null,
    });
    state.redoStack = [];
};

// Prism Mix payout — bumps per-level + lifetime counters, awards bonus score,
// notifies the UI so the HUD chip can flash. Called once per release with the
// list of cells that mixed on this placement.
const handleMixes = (mixes) => {
    if (!mixes.length) return;
    const cfg = state.config;
    const isFirstEverMix = !(cfg.lifetimeMixes > 0);
    const isTutorialMix = state.gameMode === 'tutorial'
        && state.tutorialStep === TUTORIAL_LEVELS.length - 1;
    state.levelMixes = (state.levelMixes || 0) + mixes.length;
    state.levelMixBonus = (state.levelMixBonus || 0) + mixes.length * MIX_BONUS;
    cfg.lifetimeMixes = (cfg.lifetimeMixes || 0) + mixes.length;
    saveConfig();
    SoundEngine.mix();
    HapticsEngine.medium();
    if (isTutorialMix) UI.announceTutorialMix?.();
    // The first-ever mix is THE signature moment. Tutorial step 3 always gets
    // the same named-color beat as well, including when the tutorial is replayed.
    if (isFirstEverMix || isTutorialMix) {
        const recipe = mixes[0].recipe || {};
        state.objectiveIntro = {
            startedAt: Date.now(),
            duration: MIX_CELEBRATION_MS,
            full: false,
            title: 'Prism Mix!',
            body: `You made ${recipe.name || 'a new color'}!`,
        };
    }
    if (UI.updateHud) {
        UI.updateHud({ mixes: state.levelMixes, mixBonus: state.levelMixBonus });
    }
    // Mixes count toward Today's Goals (coins auto-granted on completion; the
    // celebration card waits for the complete screen so play stays quiet).
    if (state.gameMode !== 'tutorial') {
        const goalsDone = recordGoalEvent('mix', mixes.length);
        if (goalsDone.length) state.goalsCompleted = [...(state.goalsCompleted || []), ...goalsDone];
    }
    trackEvent('prism_mix', {
        level: state.currentLevel + 1,
        levelIndex: state.currentLevel,
        mixesThisPlacement: mixes.length,
        levelMixes: state.levelMixes,
        lifetimeMixes: cfg.lifetimeMixes,
    });
};

const describeObjective = (progress = state.levelObjectiveProgress) => {
    if (!progress) return '';
    // Compact form for the HUD chip — the title already names the challenge.
    return `${progress.current}/${progress.total}`;
};

// Default third line, shown only on the full (first-time) card. Prism owns this
// wording; the other specials below override it, and the pulse/first-mix cards
// built elsewhere in this file fall back to it unchanged.
const INTRO_HINT_DEFAULT = 'Fill the board, then claim the bonus.';

/**
 * Which "here is what is different about this level" card to show, if any.
 *
 * For a long time only Prism levels had one, because the card was driven off
 * state.levelObjective and only Prism authors an objective in LEVEL_META. Frost
 * and Anchored change the rules just as much — a frozen piece that refuses to
 * move, or pieces that start on the board and cannot be picked up, both read as
 * bugs the first time you meet them — so they get the same treatment.
 *
 * Order is priority, not preference. Prism wins because its objective is a win
 * condition, whereas Frost and Anchored are modifiers on an ordinary win
 * condition; the three are not meant to co-occur (Frost owns chapter position 7,
 * Anchored position 4) but if that ever changes, the objective is the thing the
 * player must be told about.
 *
 * `key` is the persistence key under config.objectiveCoachSeen — per special
 * type, so meeting Frost for the first time still gets the full card even after
 * Prism's has been retired. It is a durable cloud-save field (cloudSaveCore.js),
 * so this is remembered across devices.
 *
 * COPY LENGTH IS A HARD CONSTRAINT. drawPrismGuideIntro paints a fixed-width
 * card (278px full / 236px repeat) and render.text is a bare fillText — no wrap,
 * no clip, so anything too long simply spills outside the card. `body` shows on
 * both widths and must fit the 236 one: keep it under ~24 characters (the
 * authored Prism label, "Prism Challenge", is 15). `hint` only ever appears on
 * the full card and gets ~36 at its smaller size.
 */
const introSpecForLevel = () => {
    const objective = state.levelObjective;
    if (objective) {
        return {
            key: objective.type || 'cells',
            kind: 'prism',
            firstTitle: 'Prism Guide',
            repeatTitle: 'Prism Goal',
            body: objective.label || 'Restore the prism.',
            hint: INTRO_HINT_DEFAULT,
            targetCells: objective.targetCells,
        };
    }

    if (state.frostActive) {
        return {
            key: 'frost',
            kind: 'frost',
            firstTitle: 'Frost Guide',
            repeatTitle: 'Frozen Piece',
            body: 'One piece is frozen',
            // Reads the constant rather than saying "two", so the copy cannot
            // drift away from FROST_THAW_PLACEMENTS the way a literal would.
            hint: `Place ${FROST_THAW_PLACEMENTS} more pieces to thaw it.`,
        };
    }

    if (state.anchoredActive) {
        return {
            key: 'anchored',
            kind: 'anchored',
            firstTitle: 'Anchor Guide',
            repeatTitle: 'Anchored',
            body: 'Some pieces are locked',
            hint: 'They cannot move. Build around them.',
        };
    }

    return null;
};

const startObjectiveIntro = () => {
    const spec = state.gameMode === 'tutorial' ? null : introSpecForLevel();
    if (!spec) {
        state.objectiveIntro = null;
        return;
    }
    const seen = !!state.config.objectiveCoachSeen?.[spec.key];
    const duration = seen ? 1800 : 2850;
    state.objectiveIntro = {
        kind: spec.kind,
        startedAt: Date.now(),
        duration,
        full: !seen,
        title: seen ? spec.repeatTitle : spec.firstTitle,
        body: spec.body,
        hint: spec.hint,
    };
    if (!seen) {
        state.config.objectiveCoachSeen = {
            ...(state.config.objectiveCoachSeen || {}),
            [spec.key]: true,
        };
        saveConfig();
    }
    if (Array.isArray(spec.targetCells)) {
        setTimeout(() => Board.pulseObjectiveCells(spec.targetCells), 260);
    }
};

const updateObjectiveProgress = (pulse = false, previous = state.levelObjectiveProgress) => {
    if (!state.levelObjective) {
        state.levelObjectiveProgress = null;
        return null;
    }
    const progress = Board.getObjectiveProgress(state.levelObjective);
    state.levelObjectiveProgress = progress;
    if (pulse && previous && progress && progress.current > previous.current) {
        if (state.levelObjective.type === 'cells') {
            Board.pulseObjectiveCells(state.levelObjective.targetCells || []);
        } else if (state.levelObjective.type === 'mix') {
            Board.pulseObjectiveCells((state.levelObjective.targetCells || []).slice(0, 1));
        }
    }
    if (UI.updateHud) {
        UI.updateHud({ objective: describeObjective(progress) });
    }
    return progress;
};

// Preserve the solved board as the visual hero of the completion screen. The
// gameplay canvas is cleared as soon as the DOM leaves the game scene, so the
// crop must be taken before UI.show('complete') switches screens.
const captureCompletedBoardSnapshot = () => {
    if (!state.canvas || typeof document === 'undefined') return '';
    const padding = 18;
    const sourceX = Math.max(0, Board.x - padding);
    const sourceY = Math.max(0, Board.y - padding);
    const sourceSize = Math.min(
        Board.w + padding * 2,
        state.canvas.width - sourceX,
        state.canvas.height - sourceY,
    );
    const snapshot = document.createElement('canvas');
    const outputSize = Math.round(sourceSize * 2);
    snapshot.width = outputSize;
    snapshot.height = outputSize;
    const snapshotCtx = snapshot.getContext('2d');
    if (!snapshotCtx) return '';
    snapshotCtx.imageSmoothingEnabled = true;
    snapshotCtx.imageSmoothingQuality = 'high';
    snapshotCtx.drawImage(
        state.canvas,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        outputSize,
        outputSize,
    );
    try {
        return snapshot.toDataURL('image/png');
    } catch (_) {
        return '';
    }
};

const completeIfBoardFilled = () => {
    const { config } = state;
    if (!Board.isComplete()) return;

    // LAB (prototype): a sandbox clear. No stars, coins, streak, goals,
    // treasure, trophies or config.unlocked, and no save churn.
    //
    // A bloom level is NOT won by filling the board — every marked cell must
    // also hold its mix result. Falling through to the normal victory path here
    // would declare a win on a board whose blooms are dark. The levels are
    // authored so that no full-board packing can leave a target unlit (see
    // scripts/validate-lab-levels.mjs), so this branch should be unreachable in
    // practice; it is the backstop that keeps a future hand-edited level from
    // silently awarding a false win.
    if (state.gameMode === 'lab') {
        if (!labWinConditionMet()) return;   // board full, blooms dark — keep playing
        state.playing = false;
        state.victory = true;
        state.levelElapsed = Math.floor((Date.now() - state.levelStartTime) / 1000);
        state.lockInput = true;
        state.labResult = {
            id: state.labLevel?.id || '',
            kind: state.labKind,
            levelIdx: state.labLevelIdx,
            elapsedSec: state.levelElapsed,
        };
        Board.highlight();
        victoryCascade();
        SoundEngine.victory();
        HapticsEngine.success();
        // Deliberately NOT the 'complete' screen: its "Next level" advances the
        // normal pipeline, which would drop the player into real level N+1 while
        // still in lab mode. Returning to the Lab list also runs endLabSession()
        // in ui/index.js, which restores gameMode without persisting anything.
        setTimeout(() => {
            state.lockInput = false;
            UI.show('lab');
        }, 1400);
        return;
    }

    updateObjectiveProgress();
    state.playing = false;
    state.victory = true;
    if (state.gameMode === 'tutorial') {
        // Tutorial: celebrate briefly, then auto-advance to the next mini-puzzle.
        // No level-complete screen, no scoring, no save-game churn. When the
        // step ended on a mix (step 3's first-ever Prism Mix), hold the beat
        // longer so the color bloom + "You made Green!" card actually lands.
        Board.highlight();
        victoryCascade();
        SoundEngine.victory();
        HapticsEngine.success();
        state.lockInput = true;
        setTimeout(() => Tutorial.advance(), state.levelMixes > 0 ? MIX_CELEBRATION_MS : 750);
        return;
    }
    state.justRestoredChapter = -1;
    state.justRestoredStage = 0;
    if (state.gameMode === 'normal' && state.currentLevel === config.unlocked) {
        if (state.currentLevel >= LEVELS.length - 1) config.won = true;
        else config.unlocked++;
        // A chapter heals in 3 acts. The 3rd, 6th and 10th clear within a
        // chapter each trigger a Faded World reveal (meadow → sky → full place),
        // so the first payoff arrives at level 3, not level 10.
        const ch = chapterOf(state.currentLevel);
        const clearedInChapter = config.unlocked - ch * CHAPTER_SIZE;
        const stage = STAGE_AT[clearedInChapter];
        if (stage) {
            state.justRestoredChapter = ch;
            state.justRestoredStage = stage;
            // Stage 3 is the 10th clear — a place fully restored. This is the
            // biggest payoff in the progression spine and the natural cohort
            // boundary, so it gets its own event rather than being inferred
            // from level_complete counts. Retention is best read as "what
            // share of installs reach chapter 1 complete", and that needs a
            // single unambiguous event to funnel on.
            if (stage >= 3) {
                trackEvent('chapter_complete', {
                    chapter: ch + 1,
                    chapterIndex: ch,
                    levelIndex: state.currentLevel,
                    elapsedSec: state.levelElapsed || 0,
                    coinsAvailable: getCoins(),
                });
            }
        }
        saveConfig();
    }
    victoryAnim();
    SoundEngine.victory();
    clearSavedGame(state.gameMode);
};

const getElapsedSec = () => {
    if (state.playing && state.levelStartTime) {
        // While paused (any sheet up), freeze the clock at the pause moment.
        const ref = state.pauseStart || Date.now();
        return Math.max(0, Math.floor((ref - state.levelStartTime) / 1000));
    }
    return state.levelElapsed || 0;
};

/**
 * Shared shape for the "left a level without finishing" funnel events
 * (level_abandoned, level_restart).
 *
 * These are the baseline-health events: level_complete already tells us what
 * players finish, but nothing until now recorded what they *give up on*, which
 * is where a bad difficulty curve actually shows itself. Read them together —
 * a level whose abandon rate outruns its complete rate is the signal, not the
 * raw count of either.
 *
 * progressPct is the interesting one. Abandoning at 10% is a player bouncing
 * off the premise; abandoning at 80% is a player who wanted it and got stuck,
 * which is a different problem with a different fix.
 */
const levelFunnelParams = () => {
    const placed = state.pieces ? state.pieces.filter(p => p.placed).length : 0;
    const total = state.nPieces || 0;
    return {
        mode: state.gameMode,
        level: state.currentLevel + 1,
        levelIndex: state.currentLevel,
        gridDim: state.gridDim,
        elapsedSec: getElapsedSec(),
        piecesPlaced: placed,
        piecesTotal: total,
        piecesRemaining: Math.max(0, total - placed),
        progressPct: total ? Math.round((placed / total) * 100) : 0,
        hintsUsed: state.levelHintsUsed || 0,
        resets: state.levelResets || 0,
        coinsAvailable: getCoins(),
        specialLevel: state.pulseActive ? 'prism_pulse'
            : state.treasureActive ? 'treasure'
            : isFrostLevel(state.currentLevel) ? 'frost'
            : state.anchoredActive ? 'anchored'
            : state.levelMeta?.kind || 'normal',
    };
};

const serializeHistory = (stack) => stack
    .filter(entry => entry.piece?.saveId)
    .map(entry => ({
        pieceId: entry.piece.saveId,
        boardPos: { ...entry.boardPos },
        placedPos: { ...entry.placedPos },
        loosePos: { ...entry.loosePos },
        evicted: entry.evicted
            ? entry.evicted
                .filter(e => e.piece?.saveId)
                .map(e => ({ pieceId: e.piece.saveId, boardPos: { ...e.boardPos } }))
            : undefined,
    }));

/**
 * The saveId set a level's pieces WOULD have if it were loaded right now.
 * Mirrors how createPieces (js/board.js) builds saveId: the flood-fill piece
 * signature, prefixed with how many earlier pieces shared that signature.
 * Used only to detect a save that belongs to a different grid.
 */
const currentPieceIds = (grid) => {
    const counts = new Map();
    return new Set(decomposeLevel(grid).map(({ signature }) => {
        const i = counts.get(signature) || 0;
        counts.set(signature, i + 1);
        return `${i}:${signature}`;
    }));
};

const getSaveKey = (mode = state.gameMode) =>
    mode === 'daily' ? DAILY_SAVE_KEY : ACTIVE_SAVE_KEY;

const clearSavedGame = (mode = state.gameMode) => {
    // LAB (prototype): lab never writes a save, so it must never delete one
    // either — getSaveKey('lab') resolves to the shared normal-level key, so
    // falling through here would wipe the player's real Continue board.
    if (mode === 'lab' || mode === 'tutorial') return;
    try {
        localStorage.removeItem(getSaveKey(mode));
        const activeMode = localStorage.getItem(ACTIVE_MODE_KEY);
        if (activeMode === mode) localStorage.removeItem(ACTIVE_MODE_KEY);
    } catch (e) { /* ignore */ }
};

const saveGameProgress = () => {
    if (!state.pieces.length || state.victory) return;
    // Tutorial puzzles share the level-data shape with real levels, but their
    // pieces & step index don't map onto LEVELS — never persist them or the
    // "Continue" tile on the menu would try to restore a phantom save.
    if (state.gameMode === 'tutorial') return;
    // LAB (prototype): the same reasoning, and a sharper failure mode. getSaveKey
    // returns DAILY_SAVE_KEY only for 'daily'; every other mode — including
    // 'lab' — lands on the SHARED normal-level key. Persisting a lab board would
    // overwrite the player's real save, and readSavedGame('normal') would later
    // restore a prototype board as "Level N" on the Continue tile. The Lab is a
    // sandbox: it must never write a save.
    if (state.gameMode === 'lab') return;
    const placed = state.pieces.some(piece => piece.placed);
    const moved = state.pieces.some(piece => !piece.placed && piece.y >= 0);
    if (!placed && !moved && !state.playing) return;

    const save = {
        version: 1,
        mode: state.gameMode,
        level: state.currentLevel,
        dailyDateKey: state.dailyDateKey,
        dailyLevelIndex: state.dailyLevelIndex,
        elapsedSec: getElapsedSec(),
        savedAt: Date.now(),
        hintsUsed: state.levelHintsUsed || 0,
        resets: state.levelResets || 0,
        pieces: state.pieces.map(piece => ({
            id: piece.saveId,
            x: Math.round(piece.x),
            y: Math.round(piece.y),
            placed: !!piece.placed,
            boardPos: { ...piece.boardPos },
            frozen: !!piece.frozen,
            thaw: piece.thawRemaining || 0,
        })),
        order: state.pieces.map(piece => piece.saveId),
        undoStack: serializeHistory(state.undoStack),
        redoStack: serializeHistory(state.redoStack),
    };

    try {
        localStorage.setItem(getSaveKey(), JSON.stringify(save));
        localStorage.setItem(ACTIVE_MODE_KEY, state.gameMode);
    } catch (e) { /* ignore */ }
};

const readSavedGame = (mode = 'normal') => {
    try {
        const raw = localStorage.getItem(getSaveKey(mode));
        if (!raw) return null;
        const save = JSON.parse(raw);
        if (!save || save.version !== 1 || typeof save.level !== 'number') return null;
        if (!Array.isArray(save.pieces) || !save.pieces.length) return null;
        if (save.level < 0 || save.level >= LEVELS.length) return null;
        if (mode === 'daily' && save.dailyDateKey !== getLocalDateKey()) return null;
        // ANCHORED: this index may have carried a different grid when the save
        // was written (an install that predates the Anchored pack, or a
        // regenerated batch). Its piece ids would not resolve against the new
        // board, and restoreSavedGame would come back with the anchors lifted
        // off and nothing put back. A save for a level that no longer exists in
        // that shape is not a save — drop it and start the level fresh.
        const anchoredGrid = mode === 'normal' ? getAnchoredGrid(save.level) : null;
        if (anchoredGrid) {
            const ids = currentPieceIds(anchoredGrid);
            if (!save.pieces.every(p => ids.has(p.id))) return null;
        }
        return save;
    } catch (e) {
        return null;
    }
};

const restoreHistory = (stack, pieceById) => (Array.isArray(stack) ? stack : [])
    .map(entry => {
        const piece = pieceById.get(entry.pieceId);
        if (!piece) return null;
        return {
            piece,
            boardPos: { x: entry.boardPos?.x ?? -1, y: entry.boardPos?.y ?? -1 },
            placedPos: { x: entry.placedPos?.x ?? piece.x, y: entry.placedPos?.y ?? piece.y },
            loosePos: { x: entry.loosePos?.x ?? piece.x, y: entry.loosePos?.y ?? piece.y },
            evicted: Array.isArray(entry.evicted)
                ? entry.evicted
                    .map(e => {
                        const evictedPiece = pieceById.get(e.pieceId);
                        return evictedPiece
                            ? { piece: evictedPiece, boardPos: { x: e.boardPos?.x ?? -1, y: e.boardPos?.y ?? -1 } }
                            : null;
                    })
                    .filter(Boolean)
                : null,
        };
    })
    .filter(Boolean);

const restoreSavedGame = (save, mode = save?.mode || 'normal') => {
    state.gameMode = mode === 'daily' ? 'daily' : 'normal';
    state.dailyDateKey = state.gameMode === 'daily' ? (save.dailyDateKey || getLocalDateKey()) : '';
    state.dailyLevelIndex = state.gameMode === 'daily' ? (save.dailyLevelIndex ?? save.level) : -1;
    state.dailyLaunchPending = false;
    loadLevel(save.level);
    // ANCHORED: loadLevel pre-places the locked pieces onto the board grid. The
    // restore loop below clears piece.placed directly rather than through
    // Board.liftPiece, so those cells would stay filled and the re-place would
    // fail canPlaceAt, leaving the anchor floating and its cells un-fillable.
    // Lift them properly first; the save re-places them at the same spot,
    // because applyAnchoredModifier picks the anchored piece deterministically.
    state.pieces.forEach(piece => { if (piece.anchored) Board.liftPiece(piece); });

    const pieceById = new Map(state.pieces.map(piece => [piece.saveId, piece]));
    state.pieces = [
        ...(Array.isArray(save.order) ? save.order : [])
            .map(id => pieceById.get(id))
            .filter(Boolean),
        ...state.pieces.filter(piece => !(save.order || []).includes(piece.saveId)),
    ];
    state.nPieces = state.pieces.length;

    // Stash the target positions, but keep non-placed pieces off-screen for
    // a moment so the Board.show + fall-in animation has something to play.
    // Placed pieces snap onto the board (their position is final). Off-board
    // pieces get tweened from y=-height to their saved tray position to
    // match the feel of a fresh levelIntro.
    const restoreTargets = new Map();
    save.pieces.forEach(savedPiece => {
        const piece = pieceById.get(savedPiece.id);
        if (!piece) return;
        stopPieceMotion(piece);
        // Frost state: trust the save (overrides what loadLevel applied) so a
        // half-thawed level resumes exactly where it left off. Old saves
        // without the field keep loadLevel's fresh frost assignment.
        if (typeof savedPiece.frozen === 'boolean' && piece.setFrozen) {
            piece.setFrozen(savedPiece.frozen, savedPiece.thaw || 0);
        }
        const savedX = Number.isFinite(savedPiece.x) ? savedPiece.x : piece.x;
        const savedY = Number.isFinite(savedPiece.y) ? savedPiece.y : piece.y;
        piece.placed = false;
        piece.boardPos = { x: -1, y: -1 };
        if (savedPiece.placed) {
            // Placed pieces — apply final position immediately (handled below).
            piece.x = savedX;
            piece.y = savedY;
        } else {
            // Loose pieces — start above the canvas, store target for tweening.
            piece.x = savedX;
            piece.y = -piece.height;
            restoreTargets.set(piece, { x: savedX, y: savedY });
        }
    });

    save.pieces.forEach(savedPiece => {
        if (!savedPiece.placed) return;
        const piece = pieceById.get(savedPiece.id);
        const bx = savedPiece.boardPos?.x;
        const by = savedPiece.boardPos?.y;
        if (piece && Number.isInteger(bx) && Number.isInteger(by)) {
            Board.placePieceAt(piece, bx, by, false);
        }
    });
    state.frostActive = state.pieces.some(piece => piece.frozen);
    updateObjectiveProgress();
    syncPulseProgress();

    const looseSlots = getTraySlots(state.pieces.filter(piece => !piece.placed));
    restoreTargets.forEach((target, piece) => {
        const slot = looseSlots.get(piece);
        if (!slot) return;
        piece.displayScale = slot.scale || 1;
        target.x = slot.x;
        target.y = slot.y;
    });

    state.undoStack = restoreHistory(save.undoStack, pieceById);
    state.redoStack = restoreHistory(save.redoStack, pieceById);
    state.levelElapsed = Math.max(0, save.elapsedSec || 0);
    state.levelHintsUsed = Math.max(0, save.hintsUsed || 0);
    state.levelResets = Math.max(0, save.resets || 0);
    state.levelStartTime = Date.now() - state.levelElapsed * 1000;
    state.pauseStart = 0;
    state.playing = true;

    // Fall-in the loose pieces — mirrors what levelIntro does for fresh
    // levels. Board fade happens in parallel via Board.show below.
    Board.show(() => {
        restoreTargets.forEach((target, piece) => {
            piece.introDropped = true;
            new Transition(piece.x, target.x, 450, v => { piece.x = v; }, null, 'cubicout').start();
            new Transition(piece.y, target.y, 450, v => { piece.y = v; }, null, 'cubicout').start();
        });
    });
    armIntroWatchdog();
    state.lockInput = false;
    state.victory = false;
    state.gameScene = 'playing';
    return true;
};

// ==================== FROST LEVELS ====================
// Special-level modifier on the main path: from level 31, each chapter's
// 'shape'-tier level starts with its biggest piece frozen. It thaws after
// FROST_THAW_PLACEMENTS successful placements — the anchor piece the player
// would normally lead with becomes the piece they must plan around.
const FROST_MIN_LEVEL = 30;            // 0-based; first frost level is #38 (idx 37)
const FROST_THAW_PLACEMENTS = 2;

const isFrostLevel = (idx) =>
    state.gameMode === 'normal' &&
    idx >= FROST_MIN_LEVEL &&
    LEVEL_META[idx]?.tier === 'shape';

const applyFrostModifier = (idx) => {
    state.frostActive = false;
    state.pieces.forEach(p => p.setFrozen && p.setFrozen(false));
    if (!isFrostLevel(idx)) return;
    // Deterministic pick: the piece covering the most cells (first on ties).
    let target = null;
    let best = -1;
    state.pieces.forEach(p => {
        const cells = p.cellCount ? p.cellCount() : 0;
        if (cells > best) { best = cells; target = p; }
    });
    if (!target || state.pieces.length < 3) return; // need pieces to thaw with
    target.setFrozen(true, FROST_THAW_PLACEMENTS);
    state.frostActive = true;
};

// ==================== ANCHORED LEVELS ====================
// Special-level modifier on the main path: one to three of the level's pieces
// start already placed and permanently locked, so the player solves around a
// fixed skeleton. Anchored levels bring their OWN grid (js/anchoredLevels.js) —
// loadLevel serves it in place of LEVELS[idx] — because locking a piece only
// tightens a board that was designed around the lock.
//
// Sibling of applyFrostModifier above, and deliberately shaped like it. The two
// can never both fire: Frost owns chapter position 7, Anchored owns position 4.
const applyAnchoredModifier = (idx) => {
    state.anchoredActive = false;
    state.pieces.forEach(p => { if (p.setAnchored) p.setAnchored(false); });
    const anchoredLevel = state.gameMode === 'normal' ? getAnchoredLevel(idx) : null;
    if (!anchoredLevel) return;

    // anchoredCells names a CELL, not a piece — the piece that owns that cell is
    // the one that gets locked. Ownership comes from decomposeLevel, the same
    // flood fill createPieces built the tray from, so the origin it reports is
    // exactly where the piece belongs.
    const placements = decomposeLevel(anchoredLevel.grid);
    const claimed = new Set();
    const anchored = [];

    (anchoredLevel.anchoredCells || []).forEach(({ x, y }) => {
        const pi = placements.findIndex((p, i) => {
            if (claimed.has(i)) return false;
            const cell = p.grid[x - p.x]?.[y - p.y];
            return !!cell && cell.some(v => v > 0);
        });
        if (pi < 0) return;
        const placement = placements[pi];
        // Match by signature, not identity: createPieces shuffles the tray. The
        // saveId sort makes the pick DETERMINISTIC, which matters because
        // restoreSavedGame relies on the same piece being anchored on every
        // load — a shuffle-dependent choice would resume a saved board with the
        // lock on a different piece.
        const piece = state.pieces
            .filter(p => !p.anchored && JSON.stringify(p.grid) === placement.signature)
            .sort((a, b) => String(a.saveId).localeCompare(String(b.saveId)))[0];
        if (!piece) return;
        claimed.add(pi);
        // setAnchored (not `piece.anchored = true`) — it bakes the locked skin
        // as well as setting the flag. The raw assignment renders as a normal
        // piece and the player gets no signal that it cannot be moved.
        piece.setAnchored(true);
        Board.placePieceAt(piece, placement.x, placement.y, false, false);
        piece.introDropped = true;   // already on the board; skip the tray fall-in
        anchored.push(piece);
    });

    if (!anchored.length) return;
    // Locked pieces draw beneath loose ones, matching where finalizePlacement
    // moves a piece the moment it is placed.
    state.pieces = [...anchored, ...state.pieces.filter(p => !anchored.includes(p))];
    state.nPieces = state.pieces.length;
    state.anchoredActive = true;
};

// ==================== PRISM PULSE LEVELS ====================
// Three marked cells charge as the player naturally completes them. This is a
// routing incentive, not a blocker: every valid solution still works exactly
// as it did before, but choosing the glowing nodes creates a power-up arc.
const configurePulseModifier = (idx) => {
    state.pulseActive = state.gameMode === 'normal' && isPulseLevel(idx);
    state.pulseTargets = state.pulseActive ? getPulseTargets(idx, state.gridDim) : [];
    state.pulseCharged = 0;
    state.pulseReward = 0;
    state.pulseBurstStartedAt = 0;
};

const syncPulseProgress = ({ celebrate = false } = {}) => {
    if (!state.pulseActive || !state.pulseTargets.length) return;
    const newlyCharged = [];
    state.pulseTargets.forEach((node, idx) => {
        const wasCharged = !!node.charged;
        node.charged = Board.isCellComplete(node.gx, node.gy);
        if (celebrate && node.charged && !wasCharged) newlyCharged.push({ ...node, idx });
    });
    const previous = state.pulseCharged || 0;
    state.pulseCharged = state.pulseTargets.filter(node => node.charged).length;

    newlyCharged.forEach(node => Board.pulsePowerCell(node.gx, node.gy, node.idx, false));
    if (newlyCharged.length) {
        SoundEngine.cleanFit(newlyCharged.length);
        HapticsEngine.medium();
        trackEvent('pulse_node_charged', {
            level: state.currentLevel + 1,
            levelIndex: state.currentLevel,
            nodesCharged: state.pulseCharged,
            nodesTotal: PULSE_NODE_COUNT,
        });
    }

    if (UI.updateHud && state.pulseCharged !== previous) {
        UI.updateHud({ pulse: `${state.pulseCharged}/${PULSE_NODE_COUNT}` });
    }

    if (celebrate && state.pulseCharged >= PULSE_NODE_COUNT && !state.pulseBurstStartedAt) {
        state.pulseBurstStartedAt = Date.now();
        state.pulseTargets.forEach((node, idx) => Board.pulsePowerCell(node.gx, node.gy, idx, true));
        SoundEngine.mix();
        HapticsEngine.success();
        state.objectiveIntro = {
            kind: 'pulse',
            startedAt: Date.now(),
            duration: 1900,
            full: true,
            title: 'Aurora unleashed!',
            body: `All nodes charged · +${REWARD_PULSE} on clear`,
        };
        trackEvent('pulse_unleashed', {
            level: state.currentLevel + 1,
            levelIndex: state.currentLevel,
        });
    }
};

// After each successful placement, frozen pieces creep toward thawing.
const tickFrost = () => {
    if (!state.frostActive) return;
    state.pieces.forEach(p => {
        if (!p.frozen) return;
        p.thawRemaining -= 1;
        if (p.thawRemaining <= 0) {
            p.thaw();
            SoundEngine.thaw();
            HapticsEngine.success();
            // Crack-free pop: overshoot then settle so the thaw reads as release.
            p.placeScale = 1.16;
            new Transition(1.16, 1, 340, v => { p.placeScale = v; }, null, 'cubicout').start();
        }
    });
    state.frostActive = state.pieces.some(p => p.frozen);
};

// Denied pickup on a frozen piece — a brief side-to-side shiver.
const shiverPiece = (piece) => {
    const ox = piece.x;
    new Transition(0, 1, 240, v => {
        piece.x = ox + Math.sin(v * Math.PI * 3) * 4 * (1 - v);
    }, () => { piece.x = ox; }, 'linear').start();
};

// ==================== LEVEL MANAGEMENT ====================
const loadLevel = (idx) => {
    state.currentLevel = idx;
    // ANCHORED: these levels replace the shipped grid for their index rather
    // than living in js/levels.js, which build-world-pack.mjs rewrites whole.
    // Normal mode only — Daily reuses level indices and must keep serving the
    // shipped grid, the same way isFrostLevel gates on mode.
    const level = (state.gameMode === 'normal' && getAnchoredGrid(idx)) || LEVELS[idx];
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
    state.levelMeta = LEVEL_META[idx] || null;
    state.levelObjective = state.levelMeta?.objective || null;
    state.levelObjectiveProgress = null;
    state.objectiveIntro = null;
    state.prismReward = 0;
    state.pulseReward = 0;
    state.dailyResult = null;
    state.levelClearResult = null;
    state.levelCoinsEarned = null;
    state.treasureActive = state.gameMode === 'normal' && isTreasureLevel(idx);
    state.anchoredActive = false;   // set by applyAnchoredModifier below
    state.goalsCompleted = [];
    state.streakMilestoneReward = null;
    clearMoveHistory();
    HintSystem.reset();
    Board.create(createGrid(state.gridDim));
    configurePulseModifier(idx);
    Board.setObjective(state.levelObjective);
    updateObjectiveProgress();
    createPieces(level);
    applyFrostModifier(idx);
    applyAnchoredModifier(idx);
};

// Tutorial mini-puzzles use the same level pipeline as real levels but pull
// their grid data from TUTORIAL_LEVELS. currentLevel here is the tutorial
// step index, not a normal-mode level.
const loadTutorialLevel = (stepIdx) => {
    const level = TUTORIAL_LEVELS[stepIdx];
    state.currentLevel = stepIdx;
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
    state.treasureActive = false;
    state.anchoredActive = false;
    state.pulseActive = false;
    state.pulseTargets = [];
    state.pulseCharged = 0;
    state.pulseReward = 0;
    state.pulseBurstStartedAt = 0;
    state.goalsCompleted = [];
    state.streakMilestoneReward = null;
    clearMoveHistory();
    HintSystem.reset();
    Board.create(createGrid(state.gridDim));
    Board.setObjective(null);
    createPieces(level);
};

// Fall-in for every loose piece that hasn't started its intro drop yet.
// Idempotent — pieces already dropping (or dropped) are left alone, so this is
// safe to call from both the Board.show callback and the watchdog below.
const dropPiecesIntoTray = () => {
    const pending = state.pieces.filter(p => !p.placed && !p.introDropped);
    if (!pending.length) return;
    const slots = getTraySlots(state.pieces.filter(p => !p.placed));
    pending.forEach((p, idx) => {
        p.introDropped = true;
        const slot = slots.get(p) || {
            x: 200 - p.width / 2,
            y: PLAY_LAYOUT.trayTop + idx * 4,
            scale: 1,
        };
        p.displayScale = slot.scale || 1;
        new Transition(p.x, slot.x, 450, v => { p.x = v; }, null, 'cubicout').start();
        new Transition(p.y, slot.y, 450, v => { p.y = v; }, null, 'cubicout').start();
    });
};

// The fall-in rides on a chain of rAF-driven transitions (Board.show → drop).
// If the WebView pauses rAF at the wrong moment (interstitial closing, app
// backgrounded mid-load), the callback can be lost and pieces would sit parked
// above the canvas with no way back but Reset. This watchdog guarantees the
// level becomes playable regardless of what happened to the animation chain.
const armIntroWatchdog = () => {
    setTimeout(() => {
        if (UI.getCurrent() !== 'game' || state.victory) return;
        dropPiecesIntoTray();
        if (!state.playing) {
            state.playing = true;
            state.lockInput = false;
            if (!state.levelStartTime) state.levelStartTime = Date.now();
            state.pauseStart = 0;
            // The watchdog exists because the Board.show callback can be lost;
            // if it was, gameplayStart() was lost with it. Idempotent, so the
            // normal path where both run costs nothing.
            gameplayStart();
        }
    }, 900);
};

const levelIntro = () => {
    startObjectiveIntro();
    Board.show(() => {
        dropPiecesIntoTray();
        state.lockInput = false;
        state.playing = true;
        state.dailyLaunchPending = false;
        state.levelStartTime = Date.now();
        state.pauseStart = 0;
        // Tell a portal host that interruptible time has ended. Placed here
        // rather than at the top of levelIntro() on purpose: the intro
        // animation is exactly the window a host is welcome to use, and play
        // does not begin until the pieces have landed in the tray.
        gameplayStart();
        setTimeout(saveGameProgress, 520);
        SoundEngine.levelStart();
        // LAB (prototype): prototype boards must not pollute the funnel — a lab
        // "level 3" is not level 3, and mixing them into level_start would skew
        // every retention and difficulty read built on this event.
        if (state.gameMode === 'lab') return;
        trackEvent('level_start', {
            mode: state.gameMode,
            level: state.currentLevel + 1,
            levelIndex: state.currentLevel,
            gridDim: state.gridDim,
            pieceCount: state.nPieces,
            coinsAvailable: getCoins(),
            specialLevel: state.pulseActive ? 'prism_pulse' : state.treasureActive ? 'treasure' : isFrostLevel(state.currentLevel) ? 'frost' : state.anchoredActive ? 'anchored' : state.levelMeta?.kind || 'normal',
        });
    });
    armIntroWatchdog();
};

// Victory follow-through: placed pieces do a quick diagonal wave of pops
// across the board (top-left → bottom-right), riding the existing placeScale
// snap-pop channel. The board doesn't just stop — it takes a little bow.
const victoryCascade = () => {
    if (state.config.reducedMotion) return;
    state.pieces.forEach(piece => {
        if (!piece.placed || !piece.boardPos || piece.boardPos.x < 0) return;
        const delay = 120 + Math.min(600, (piece.boardPos.x + piece.boardPos.y) * 45);
        setTimeout(() => {
            piece.placeScale = 1.12;
            new Transition(112, 100, 260, v => { piece.placeScale = v / 100; }, null, 'backOut').start();
        }, delay);
    });
};

const victoryAnim = () => {
    Board.highlight();
    victoryCascade();
    state.levelElapsed = Math.floor((Date.now() - state.levelStartTime) / 1000);
    state.lockInput = true;
    // Input is locked from here to the complete screen, so the host is free to
    // interrupt again — and this is where the between-level interstitial fires.
    gameplayStop();
    HapticsEngine.success();

    const isDaily = state.gameMode === 'daily';
    // Stars are skill-based, not time-based:
    //   3 ★ — solved with no hints AND no resets (a flawless clear)
    //   2 ★ — at most 1 hint OR at most 1 reset
    //   1 ★ — anything else (you still solved it, that's worth celebrating)
    // Time is recognised separately as a "Speedrun" badge below.
    const hintsUsed = state.levelHintsUsed || 0;
    const resets    = state.levelResets    || 0;
    const stars = isDaily
        ? getFocusStars({ elapsedSec: state.levelElapsed, hintsUsed, resets })
        : (hintsUsed === 0 && resets === 0) ? 3
        : (hintsUsed <= 1 && resets <= 1) ? 2
        : 1;

    const timeBonus = Math.max(0, 5000 - state.levelElapsed * 50);
    const objectiveBonus = !isDaily && state.levelObjectiveProgress?.complete ? 1000 : 0;
    state.levelStars = stars;
    state.levelScore = isDaily
        ? 0
        : Math.max(1000, 5000 + stars * 3000 + timeBonus + (state.levelMixBonus || 0) + objectiveBonus);

    if (isDaily) {
        // Any play counts toward THE streak — daily-only players shouldn't see
        // a flame stuck at zero. (dailyStreak stays internal for the weekly
        // constellation; cfg.streak is the one number shown across the UI.)
        checkInPlay();
        const result = markDailyComplete(state.dailyDateKey || getLocalDateKey(), {
            elapsedSec: state.levelElapsed,
            hintsUsed: state.levelHintsUsed || 0,
            resets: state.levelResets || 0,
            stars,
            levelIndex: state.dailyLevelIndex >= 0 ? state.dailyLevelIndex : state.currentLevel,
        });
        state.dailyResult = {
            ...result,
            focusLabel: getFocusLabel({
                stars,
                hintsUsed: state.levelHintsUsed || 0,
                resets: state.levelResets || 0,
            }),
        };
        trackEvent('daily_complete', {
            dateKey: state.dailyDateKey || getLocalDateKey(),
            level: state.currentLevel + 1,
            levelIndex: state.currentLevel,
            elapsedSec: state.levelElapsed,
            hintsUsed: state.levelHintsUsed || 0,
            resets: state.levelResets || 0,
            stars,
            firstCompletion: !!result.firstCompletion,
            rewardCoinsGranted: result.rewardCoinsGranted || 0,
        });
    } else {
        // Progression hub: records stars, bumps streak, unlocks trophies, and
        // tracks per-level personal-best so we can show "New Best!" / Speedrun.
        const result = onLevelClear(state.currentLevel, stars, state.levelElapsed, state.gridDim);
        state.levelClearResult = result;
        state.prismReward = 0;
        state.pulseReward = 0;
        // --- Level-attributed coins: computed here, granted ONCE below ------
        // All five level rewards (first-clear drip, chapter restore, treasure
        // chest, Prism, Prism Pulse) are assembled into `earned` before any
        // coin moves, so exactly one place knows this clear's true total and
        // can hold it under MAX_LEVEL_CLEAR_COINS. They used to be three
        // separate addCoins() calls, so nothing could see the real total —
        // which is how a chapter finale quietly paid 40 level coins (and 95
        // once the same tap also settled goals and a streak milestone).
        //
        // Deliberately OUTSIDE this cap: Today's Goals (missions.js) and the
        // streak milestone (progression.js checkInPlay, already run inside
        // onLevelClear above). Those are day-scoped, not level-scoped —
        // clamping them here would delete a goal the player actually finished.
        const earned = {
            firstClear: result?.isFirstClear ? firstClearReward(stars) : 0,
            chapter: state.justRestoredStage >= 3 ? REWARD_CHAPTER_RESTORE : 0,
            // Golden chest — guaranteed on first clear only; replays pay nothing.
            treasure: state.treasureActive && result?.isFirstClear ? REWARD_TREASURE : 0,
            prism: 0,
            pulse: 0,
        };
        // Prism / Pulse stay first-clear-and-once-only. The claim flag is set
        // whenever the reward enters the bundle, even if the cap trims the
        // payout — a capped grant is still a claimed reward.
        if (state.levelMeta?.kind === 'prism' && result?.isFirstClear) {
            const claimed = state.config.prismRewardsClaimed || {};
            if (!claimed[state.currentLevel]) {
                state.config.prismRewardsClaimed = { ...claimed, [state.currentLevel]: true };
                earned.prism = REWARD_PRISM;
                state.prismReward = REWARD_PRISM; // ui/screens.js renders "Prism +N"
            }
        }
        if (state.pulseActive && state.pulseCharged >= PULSE_NODE_COUNT && result?.isFirstClear) {
            const claimed = state.config.pulseRewardsClaimed || {};
            if (!claimed[state.currentLevel]) {
                state.config.pulseRewardsClaimed = { ...claimed, [state.currentLevel]: true };
                earned.pulse = REWARD_PULSE;
                state.pulseReward = REWARD_PULSE; // ui/screens.js renders "Prism Pulse +N"
            }
        }
        // raw     — what the five sources add up to before the ceiling
        // granted — what was ACTUALLY credited (raw, clamped to the cap)
        // capped  — true when the ceiling trimmed the payout, so a UI can say so
        earned.raw = earned.firstClear + earned.chapter + earned.treasure + earned.prism + earned.pulse;
        earned.granted = Math.min(earned.raw, MAX_LEVEL_CLEAR_COINS);
        earned.capped = earned.granted < earned.raw;
        // NOTE: `total` is now POST-CAP — it is no longer firstClear + chapter
        // + treasure, so the individual line items can sum higher than it when
        // `capped` is true. It keeps its old caller contract of EXCLUDING
        // prism/pulse, because ui/index.js:284 and ui/screens.js:1172 add
        // state.prismReward / state.pulseReward on top of it; folding them in
        // here would double-count on the complete screen. Defined so that
        // total + prismReward + pulseReward === granted, exactly.
        earned.total = Math.max(0, earned.granted - earned.prism - earned.pulse);
        if (earned.granted > 0) addCoins(earned.granted);
        state.levelCoinsEarned = earned;
    }

    // Feed Today's Goals (missions.js). Rewards are auto-granted inside; the
    // returned completions are celebrated on the complete screen.
    const goalsDone = [
        ...recordGoalEvent('clear'),
        ...(hintsUsed === 0 && resets === 0 ? recordGoalEvent('clean') : []),
        ...recordGoalEvent('stars', stars),
        ...(!isDaily && state.levelClearResult?.isFirstClear ? recordGoalEvent('firstclear') : []),
        ...(isDaily && state.dailyResult?.firstCompletion ? recordGoalEvent('daily') : []),
    ];
    if (goalsDone.length) state.goalsCompleted = [...(state.goalsCompleted || []), ...goalsDone];

    trackEvent('level_complete', {
        mode: state.gameMode,
        level: state.currentLevel + 1,
        levelIndex: state.currentLevel,
        gridDim: state.gridDim,
        pieceCount: state.nPieces,
        elapsedSec: state.levelElapsed,
        hintsUsed: state.levelHintsUsed || 0,
        resets: state.levelResets || 0,
        stars,
        ...(!isDaily ? { score: state.levelScore } : {}),
        objective: state.levelObjectiveProgress || null,
        coinsEarned: (state.levelCoinsEarned?.total || 0) + (state.prismReward || 0) + (state.pulseReward || 0),
        specialLevel: state.pulseActive ? 'prism_pulse' : state.treasureActive ? 'treasure' : isFrostLevel(state.currentLevel) ? 'frost' : state.anchoredActive ? 'anchored' : state.levelMeta?.kind || 'normal',
        goalsCompleted: goalsDone.length,
    });

    // The player just cleared a level — the right moment to (once) ask for
    // notification permission and re-plan tomorrow's daily/streak reminders.
    maybeRequestPermissionAndSchedule();

    // Hand off to DOM after a short beat. If this clear completed a chapter,
    // celebrate with the Faded World place-reveal; otherwise the usual screen.
    setTimeout(() => {
        Board.prepareSnapshot();
        state.pieces.forEach(piece => {
            piece.placeScale = 1;
            piece._tilt = 0;
            piece._tiltV = 0;
        });
        // Let the canvas draw one clean frame after clearing fit labels, glows
        // and drag tilt, then copy exactly what the player completed.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            state.completedBoardSnapshot = captureCompletedBoardSnapshot();
            const revealChapter = state.gameMode === 'normal' && state.justRestoredStage > 0;
            UI.show(revealChapter ? 'reveal' : 'complete');
            state.lockInput = false;
        }));
    // Wait until the final snap and victory wave have visually landed before
    // preparing the clean keepsake frame.
    }, 1100);
};

const levelOutro = (cb) => {
    state.lockInput = true;
    Board.hide();
    state.pieces.forEach(p => {
        const tx = 200 - p.width / 2;
        const ty = -p.height - 40;
        new Transition(p.x, tx, 400, v => { p.x = v; }, null, 'quadout').start();
        new Transition(p.y, ty, 400, v => { p.y = v; }, null, 'quadout').start();
    });
    setTimeout(() => { if (cb) cb(); }, 450);
};

// Shared refs for other modules that still reach in via state.modules
state.modules.levelIntro = levelIntro;
state.modules.levelOutro = levelOutro;
state.modules.loadLevel  = loadLevel;
state.modules.loadTutorialLevel = loadTutorialLevel;
// LAB (prototype): the Lab UI's only entry point. It treats a missing /
// throwing / false-returning loader as failure and backs out, so an unknown
// index returns false rather than half-loading a board.
//
// The intro has to be kicked off from HERE, not from the caller: the Lab's
// one-shot launch flag makes ui/index.js skip enterGame (which would reset
// gameMode back to 'normal'), and enterGame is the only thing that normally
// calls levelIntro. Without this the board would never fade in, pieces would
// never fall into the tray, and state.playing would stay false — a dead screen.
state.modules.loadLabLevel = (idx) => {
    if (!loadLabLevel(idx)) return false;
    levelIntro();
    return true;
};
// The HUD memoizes its last values; the Lab must clear it after loading a board
// or the first tick shows the previous level's counts.
state.modules.resetHudMemo = () => resetHudMemo();
state.modules.HintSystem = HintSystem;
// Called by ui/index.js after theme cycle/select so the pre-rendered board
// canvas (boardGfx) and each piece's pre-baked shadow regenerate against
// the new palette. Piece body colors come from static GAME_COLORS so they
// don't need re-render — but shadows do, otherwise dark themes show a
// brown halo behind every piece.
state.modules.rebuildBoardForTheme = () => {
    Board.rebuildGfx();
    (state.pieces || []).forEach(p => {
        if (typeof p.rebuildForTheme === 'function') p.rebuildForTheme();
    });
};

// ==================== GAME INPUT ====================
// Shared post-placement routine for a successful fit — used by both the drag
// release and the "Solve piece" coin sink so they behave identically (history,
// mix payout, frost thaw, objective, victory, tray reflow, save).
const finalizePlacement = (piece, fitResult, origin, objectiveBefore, evicted = null) => {
    const { pieces } = state;
    HintSystem.clearActiveHint();
    pushPlacementHistory(piece, origin || { x: piece.x, y: piece.y }, evicted);
    // Draw newly-placed pieces under the loose ones.
    const idx = pieces.indexOf(piece);
    if (idx >= 0) { pieces.splice(idx, 1); pieces.unshift(piece); }
    const completedCells = Array.isArray(fitResult.completedCells) ? fitResult.completedCells : [];
    SoundEngine.snapPiece();
    HapticsEngine.medium();
    if (completedCells.length) SoundEngine.cleanFit(completedCells.length);
    const mixes = Array.isArray(fitResult.mixes) ? fitResult.mixes : [];
    if (mixes.length) handleMixes(mixes);
    tickFrost();
    syncPulseProgress({ celebrate: true });
    // LAB (prototype): recompute blooms from the live board so a target lights
    // the moment its second half lands (and goes dark again if one is lifted).
    syncBloomProgress();
    updateObjectiveProgress(true, objectiveBefore);
    completeIfBoardFilled();
    if (!state.victory) {
        arrangeLoosePiecesInTray();
        saveGameProgress();
    }
};

// Canvas input only applies when the DOM UI is on the "game" screen and no
// overlay sheet (pause / ad) is up. All other screens capture clicks themselves.
const setupGameInput = () => {
    let dragging = false;
    let dragPiece = null;
    let dragX = 0;
    let dragYPos = 0;
    let dragStart = null;
    let hadSnapPreview = false;

    const canInteract = () =>
        UI.getCurrent() === 'game' &&
        !UI.getCurrentOverlay() &&
        !state.lockInput &&
        state.playing;

    Input.on('press', (c) => {
        SoundEngine.resume();
        if (!canInteract() || dragging) return;
        if (state.victory) return;

        const { pieces, nPieces } = state;
        for (let i = nPieces - 1; i >= 0; i--) {
            if (pieces[i].tapInside(c, state.cellSize)) {
                // isLocked() is frozen || anchored — frost pieces thaw, lab
                // anchors never do, so the two refusals read differently.
                if (pieces[i].isLocked()) {
                    if (pieces[i].frozen) {
                        // Frost level: this piece thaws after more placements.
                        // The shiver is a "not yet" — it implies the lock lifts.
                        SoundEngine.frozenDeny();
                        HapticsEngine.light();
                        shiverPiece(pieces[i]);
                    } else {
                        // LAB (prototype): an anchor is permanent. Shivering here
                        // would keep inviting the player to retry something that
                        // will never work, so the cue is a quieter one-off — a
                        // selection tick and the board's own invalid-target
                        // flash, with no motion on the piece itself.
                        HapticsEngine.selection();
                        Board.showInvalidDrop(pieces[i]);
                    }
                    break;
                }
                dragging = true;
                dragPiece = pieces[i];
                const wasPlaced = dragPiece.placed;
                // Capture the real board/tray origin before a compact tray
                // piece is promoted to full size for dragging. Rejected drops
                // can then restore the same slot, board cell, order and history.
                dragStart = {
                    x: dragPiece.x,
                    y: dragPiece.y,
                    wasPlaced,
                    boardPos: { ...dragPiece.boardPos },
                    pieceIndex: i,
                };
                if (!dragPiece.placed && typeof dragPiece.promoteForDragAt === 'function') {
                    dragPiece.promoteForDragAt(c);
                } else if (typeof dragPiece.beginDrag === 'function') {
                    dragPiece.beginDrag();
                }
                state.activeDragPiece = dragPiece;
                dragX = c.x - dragPiece.x;
                dragYPos = c.y - dragPiece.y;
                hadSnapPreview = false;
                Board.clearPreview();
                HintSystem.stopNudge();
                stopPieceMotion(dragPiece);
                pieces.push(pieces.splice(i, 1)[0]);
                if (dragPiece.placed) {
                    // Keep history intact until release. An occupied/invalid
                    // drop is not a move and must not silently consume Undo.
                    Board.liftPiece(dragPiece);
                    // LAB (prototype): picking a piece back up can break a mix,
                    // so the bloom must go dark while it is in the player's hand.
                    syncBloomProgress();
                }
                SoundEngine.pickup();
                HapticsEngine.light();
                break;
            }
        }
    });

    Input.on('move', (c) => {
        if (!dragging || !canInteract()) return;
        dragPiece.move(c.x, c.y, dragX, dragYPos);
        const previewActive = Board.previewPlacement(dragPiece);
        if (previewActive && !hadSnapPreview) HapticsEngine.selection();
        hadSnapPreview = previewActive;
    });

    Input.on('release', (c) => {
        if (!dragging) return;
        const { pieces } = state;
        // Land exactly where the finger let go — the eased follow may still be
        // a couple of pixels behind the drag target.
        if (typeof dragPiece.settleDrag === 'function') dragPiece.settleDrag();
        const objectiveBefore = state.levelObjective ? Board.getObjectiveProgress(state.levelObjective) : null;
        const fitResult = Board.fitPiece(dragPiece);
        if (fitResult) {
            if (dragStart?.wasPlaced) {
                removePieceFromHistory(dragPiece);
                state.redoStack = [];
            }
            finalizePlacement(dragPiece, fitResult, dragStart || { x: dragPiece.x, y: dragPiece.y }, objectiveBefore);
        } else {
            Board.clearPreview();
            if (dragStart?.wasPlaced && !releaseIsOverBoard(c)) {
                // Releasing a placed piece away from the board is an explicit
                // removal, so this is where its old history is discarded.
                removePieceFromHistory(dragPiece);
                state.redoStack = [];
                SoundEngine.pickup();
                HapticsEngine.light();
                returnPlacedPieceToTray(dragPiece);
                syncPulseProgress();
                setTimeout(saveGameProgress, 260);
            } else {
                // Occupied/invalid board drops never evict a placed piece.
                // Tray pieces glide to their previous tray slot; lifted board
                // pieces glide to their original board cell with history intact.
                SoundEngine.drop();
                HapticsEngine.selection();
                restorePieceAfterInvalidDrop(dragPiece, dragStart);
                // Shake + return flight can take ~410ms; persist only after the
                // restored board/tray state is final.
                setTimeout(saveGameProgress, 450);
            }
        }
        dragging = false;
        dragPiece = null;
        dragStart = null;
        state.activeDragPiece = null;
        hadSnapPreview = false;
    });
};

// ==================== DRAW ====================
const drawBackground = () => {
    const { ctx, render } = state;
    const t = Theme.get();
    render.rect(0, 0, CANVAS_W, CANVAS_H, t.bg1);
    const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    grad.addColorStop(0, t.bg2);
    grad.addColorStop(0.5, t.bg3);
    grad.addColorStop(1, t.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const boardCenterX = Board.x + Board.w / 2;
    const boardCenterY = Board.y + Board.h / 2;
    const boardLight = ctx.createRadialGradient(boardCenterX, boardCenterY, 20, boardCenterX, boardCenterY, 260);
    boardLight.addColorStop(0, t.boardAura);
    boardLight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = boardLight;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Treasure levels get one extra soft golden glow over the board — subtle,
    // not a repaint of the whole scene, so it reads as "special" without
    // fighting the theme's own palette.
    if (state.treasureActive) {
        const treasureGlow = ctx.createRadialGradient(boardCenterX, boardCenterY, 20, boardCenterX, boardCenterY, 250);
        treasureGlow.addColorStop(0, 'rgba(233,196,106,0.16)');
        treasureGlow.addColorStop(1, 'rgba(233,196,106,0)');
        ctx.fillStyle = treasureGlow;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    if (state.pulseActive) {
        // A restrained two-color aurora is always present; charging the third
        // node expands it across the whole board for one unmistakable beat.
        const drift = state.config.reducedMotion ? 0 : Math.sin(Date.now() / 850) * 22;
        const violet = ctx.createRadialGradient(82 + drift, 238, 10, 82 + drift, 238, 220);
        violet.addColorStop(0, 'rgba(140,99,255,0.16)');
        violet.addColorStop(1, 'rgba(140,99,255,0)');
        ctx.fillStyle = violet;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        const cyan = ctx.createRadialGradient(322 - drift, 322, 8, 322 - drift, 322, 210);
        cyan.addColorStop(0, 'rgba(54,201,255,0.13)');
        cyan.addColorStop(1, 'rgba(54,201,255,0)');
        ctx.fillStyle = cyan;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        const elapsed = state.pulseBurstStartedAt ? Date.now() - state.pulseBurstStartedAt : -1;
        if (elapsed >= 0 && elapsed < 1500) {
            const p = state.config.reducedMotion ? 0.7 : Math.min(1, elapsed / 900);
            const alpha = elapsed < 900 ? 0.32 * (1 - p * 0.25) : 0.24 * (1 - (elapsed - 900) / 600);
            const radius = 40 + p * 330;
            const pulseCenterX = Board.x + Board.w / 2;
            const pulseCenterY = Board.y + Board.h / 2;
            const burst = ctx.createRadialGradient(
                pulseCenterX, pulseCenterY, Math.max(0, radius - 60),
                pulseCenterX, pulseCenterY, radius,
            );
            burst.addColorStop(0, 'rgba(255,255,255,0)');
            burst.addColorStop(0.72, `rgba(174,127,255,${Math.max(0, alpha)})`);
            burst.addColorStop(1, 'rgba(54,201,255,0)');
            ctx.fillStyle = burst;
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        }
    }
};

// Flat warm tray with one dashed inner guide, matching the reference.
const drawTray = () => {
    const { ctx, render } = state;
    const t = Theme.get();
    const { x, y, w, h } = TRAY_SHELL;
    const radius = 10;
    const guideRadius = 7;

    render.drawWithShadow(() => {
        render.roundRect(x, y, w, h, radius, t.trayFill);
    }, { blur: 10, offsetY: 4, color: t.trayShadow });

    // The inner area stays flat; the dashed guide below defines the usable
    // piece region without adding another bevel or recessed panel.
    ctx.save();
    ctx.strokeStyle = t.trayStroke;
    ctx.lineWidth = 1;
    render.roundRect(x + 0.6, y + 0.6, w - 1.2, h - 1.2, radius, 'rgba(255,255,255,0)');
    ctx.stroke();
    ctx.strokeStyle = t.trayDash || 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 6]);
    ctx.lineCap = 'butt';
    render.roundRect(TRAY_WELL.x + 0.5, TRAY_WELL.y + 0.5, TRAY_WELL.w - 1, TRAY_WELL.h - 1, guideRadius, 'rgba(255,255,255,0)');
    ctx.stroke();
    ctx.restore();
};

const drawPrismGuideIntro = () => {
    const intro = state.objectiveIntro;
    if (!intro) return;
    const elapsed = Date.now() - intro.startedAt;
    const duration = intro.duration || 1800;
    if (elapsed >= duration) {
        state.objectiveIntro = null;
        return;
    }

    const { ctx, render } = state;
    const t = Theme.get();
    const reducedMotion = state.config.reducedMotion;
    const p = Math.max(0, Math.min(1, elapsed / duration));
    const fadeIn = reducedMotion ? 1 : Math.min(1, p / 0.22);
    const fadeOut = reducedMotion ? 1 : (p > 0.72 ? Math.max(0, 1 - (p - 0.72) / 0.28) : 1);
    const alpha = fadeIn * fadeOut;
    const lift = (1 - fadeIn) * 14;
    const cardW = intro.full ? 278 : 236;
    const cardH = intro.full ? 76 : 58;
    const x = Board.x + (Board.w - cardW) / 2;
    const y = Board.y + 8 - lift;
    const pulse = reducedMotion ? 0 : Math.sin(elapsed / 210) * 3;

    render.withAlpha(alpha, () => {
        render.drawWithShadow(() => {
            const grad = ctx.createLinearGradient(0, y, 0, y + cardH);
            grad.addColorStop(0, t.trayLip);
            grad.addColorStop(1, t.trayFill);
            render.roundRect(x, y, cardW, cardH, 8, grad);
        }, { blur: 22, offsetY: 9, color: t.trayShadow });

        const cx = x + 36;
        const cy = y + cardH / 2 + pulse;
        // Each special gets its own glyph. Reusing the prism gem for a Frost or
        // Anchored card would actively mislead — the gem is the colour-mixing
        // mark, and these two levels have nothing to do with mixing.
        if (intro.kind === 'frost') {
            // Six-spoke crystal. Drawn as strokes through the centre rather than
            // as a filled snowflake polygon, which turns to mush at 40px.
            render.drawWithShadow(() => {
                render.circle(cx, cy, 18, 'rgba(120, 200, 255, 0.22)');
                ctx.save();
                ctx.strokeStyle = '#bfe9ff';
                ctx.lineWidth = 2.4;
                ctx.lineCap = 'round';
                for (let i = 0; i < 3; i += 1) {
                    const a = (Math.PI / 3) * i;
                    const dx = Math.cos(a) * 13;
                    const dy = Math.sin(a) * 13;
                    ctx.beginPath();
                    ctx.moveTo(cx - dx, cy - dy);
                    ctx.lineTo(cx + dx, cy + dy);
                    ctx.stroke();
                }
                ctx.restore();
                render.circle(cx, cy, 3.4, '#ffffff');
            }, { blur: 16, offsetY: 0, color: '#68c8ff' });
        } else if (intro.kind === 'anchored') {
            // A pinned block: the tile the player cannot lift, with the pin head
            // sitting on it. Square corners echo the board's own cells.
            render.drawWithShadow(() => {
                render.roundRect(cx - 15, cy - 11, 30, 24, 6, t.lilac || '#b599cc');
                render.roundRect(cx - 15, cy - 11, 30, 10, 6, t.boardSheen || 'rgba(255,255,255,0.22)');
                render.circle(cx, cy - 13, 6.5, '#fffaf4');
                render.circle(cx, cy - 13, 3, t.titleText || '#3b2f4a');
            }, { blur: 12, offsetY: 0, color: t.hintTargetGlow });
        } else if (intro.kind === 'pulse') {
            render.drawWithShadow(() => {
                render.circle(cx, cy, 19, '#8c63ff');
                render.circle(cx, cy, 13, '#36c9ff');
                render.polygon([
                    [cx + 3, cy - 13], [cx - 8, cy + 1], [cx - 1, cy + 1],
                    [cx - 4, cy + 13], [cx + 9, cy - 2], [cx + 2, cy - 2],
                ], '#fffaf4');
            }, { blur: 18, offsetY: 0, color: '#8c63ff' });
        } else {
            const gem = [
                [cx, cy - 20],
                [cx + 16, cy - 5],
                [cx + 9, cy + 18],
                [cx - 9, cy + 18],
                [cx - 16, cy - 5],
            ];
            render.drawWithShadow(() => {
                render.polygon(gem, t.lilac || '#b599cc');
                render.polygon([[cx, cy - 20], [cx + 16, cy - 5], [cx, cy + 2], [cx - 16, cy - 5]], t.boardSheen || 'rgba(255,255,255,0.22)');
            }, { blur: 12, offsetY: 0, color: t.hintTargetGlow });
        }

        render.text(intro.title, x + 66, y + 15, {
            fill: t.titleText,
            font: '800 14px Outfit, sans-serif',
        });
        render.text(intro.body, x + 66, y + 38, {
            fill: t.levelText,
            font: '700 13px Outfit, sans-serif',
        });
        if (intro.full) {
            // Falls back to the Prism wording so the pulse card and the
            // first-ever-mix card, which predate per-special hints, are unchanged.
            render.text(intro.hint || INTRO_HINT_DEFAULT, x + 66, y + 57, {
                fill: t.subText,
                font: '600 11px Outfit, sans-serif',
            });
        }
    });
};

// ==================== HUD TICK ====================
// Live HUD updates go through UI.updateHud(). We throttle timer writes to
// whole seconds so we're not thrashing the DOM every frame.
let lastHudSec = -1;
let lastHudPlaced = -1;
let lastHudCoins = -1;

const tickHud = () => {
    if (UI.getCurrent() !== 'game') return;
    const elapsed = getElapsedSec();
    const placed = state.pieces.reduce((n, p) => n + (p.placed ? 1 : 0), 0);
    const coins = getCoins();

    const patch = {};
    if (elapsed !== lastHudSec)   { patch.elapsedSec = elapsed; lastHudSec = elapsed; }
    if (placed !== lastHudPlaced) { patch.placed = placed; patch.total = state.nPieces; lastHudPlaced = placed; }
    if (coins !== lastHudCoins)   { patch.coins = coins; lastHudCoins = coins; }
    if (state.levelObjectiveProgress) patch.objective = describeObjective();
    if (Object.keys(patch).length) UI.updateHud(patch);
};

const resetHudMemo = () => {
    lastHudSec = -1;
    lastHudPlaced = -1;
    lastHudCoins = -1;
};

const draw = () => {
    const { render, pieces, nPieces, ctx } = state;

    // Clear — the DOM UI sits on top of the canvas, so we only need to paint
    // when the "game" screen is visible. For other screens the DOM has its
    // own opaque background and covers whatever the canvas draws.
    const onGame = UI.getCurrent() === 'game';

    if (onGame) {
        drawBackground();
        state.floaters.forEach(f => { f.update(); f.draw(render); });
        // The dragged piece eases toward the finger between input events, so
        // refresh the snap preview every frame to track its real position.
        if (state.activeDragPiece && !state.config.reducedMotion) {
            Board.previewPlacement(state.activeDragPiece);
        }
        Board.draw();
        drawTray();
        // Strict z-order so nothing ever paints over the piece the player is
        // moving: placed pieces sit low, board fx above them, tray/flying
        // pieces above that, and the piece in hand is always topmost.
        const dragP = state.activeDragPiece;
        for (let i = 0; i < nPieces; i++) {
            const p = pieces[i];
            if (p.placed && p !== dragP) p.draw(render, false, Board.hasPreviewFor(p));
        }
        Board.drawTopEffects();
        for (let i = 0; i < nPieces; i++) {
            const p = pieces[i];
            if (!p.placed && p !== dragP) p.draw(render, false, Board.hasPreviewFor(p));
        }
        if (dragP) dragP.draw(render, true, Board.hasPreviewFor(dragP));
        drawPrismGuideIntro();
        HintSystem.drawBoardHint();
        HintSystem.draw();
        tickHud();
    } else if (ctx) {
        // Wipe the canvas so stale frames don't peek through transparent spots
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    }

    requestAnimationFrame(draw);
};

// ==================== RESIZE ====================
const refreshSize = () => {
    if (!state.canvas) return;
    const stage = state.canvas.parentElement;
    const stageWidth = stage?.clientWidth || CANVAS_W;
    const stageHeight = stage?.clientHeight || CANVAS_H;

    // Fit the active logical drawing surface with one uniform scale. Filling width
    // and height independently made every canvas square slightly taller on
    // phones whose viewport is not exactly 4:7. Uniform sizing keeps board
    // cells, placed pieces, dots and circular effects geometrically correct.
    const scale = Math.min(stageWidth / CANVAS_W, stageHeight / CANVAS_H);
    state.canvas.style.inset = 'auto';
    state.canvas.style.left = '50%';
    state.canvas.style.top = '50%';
    state.canvas.style.transform = 'translate(-50%, -50%)';
    state.canvas.style.width = `${CANVAS_W * scale}px`;
    state.canvas.style.height = `${CANVAS_H * scale}px`;
};

// ==================== SCENE HOOKS ====================
// These are the verbs the DOM UI calls to drive gameplay. They let ui/index.js
// stay decoupled from game internals.
const sceneHooks = {
    enterGame: (levelHint) => {
        // Tutorial mode owns its own lifecycle — playTutorial() set things up,
        // so just acknowledge the scene transition without resetting mode.
        if (state.gameMode === 'tutorial') {
            state.gameScene = 'playing';
            resetHudMemo();
            return;
        }
        if (state.gameMode === 'daily' && levelHint === null && (state.playing || state.dailyLaunchPending)) {
            state.gameScene = 'playing';
            resetHudMemo();
            return;
        }
        const wasDailyMode = state.gameMode === 'daily';
        state.tutorialJustFinished = false; // one-time intro card has done its job
        state.dailyDateKey = '';
        state.dailyLevelIndex = -1;
        state.dailyLaunchPending = false;
        const target = (typeof levelHint === 'number' && !isNaN(levelHint))
            ? Math.max(0, Math.min(levelHint, LEVELS.length - 1))
            : wasDailyMode ? (state.config.unlocked || 0) : state.currentLevel;
        state.gameMode = 'normal';
        if (target !== state.currentLevel || !state.playing) {
            const savedGame = readSavedGame('normal');
            if (savedGame && savedGame.level === target) {
                restoreSavedGame(savedGame, 'normal');
            } else {
                if (target !== state.currentLevel) clearSavedGame('normal');
                loadLevel(target);
                levelIntro();
            }
        }
        state.gameScene = 'playing';
        resetHudMemo();
    },

    exitGame: () => {
        // Fire BEFORE saveGameProgress/state teardown — both mutate the fields
        // levelFunnelParams reads, and getElapsedSec needs state.playing true
        // to report live time rather than the last saved value.
        //
        // Guarded on !state.victory because exitGame also runs on the way out
        // of a *cleared* level; counting those as abandonment would make the
        // metric meaningless. Lab is excluded for the same reason level_start
        // excludes it — a prototype board is not level N.
        if (state.playing && !state.victory && state.gameMode !== 'lab' && state.gameMode !== 'tutorial') {
            trackEvent('level_abandoned', levelFunnelParams());
        }
        saveGameProgress();
        state.playing = false;
        state.lockInput = true;
        state.gameScene = 'menu';
    },

    nextLevel: async ({ suppressInterstitial = false } = {}) => {
        const clearedLevel = state.currentLevel;
        const clearedMeta = state.levelMeta || {};
        state.config.levelsSinceInterstitial = (state.config.levelsSinceInterstitial || 0) + 1;
        const adDecision = suppressInterstitial
            ? { show: false, reason: 'rating_prompt' }
            : interstitialDecision(state.config, {
                levelIndex: clearedLevel,
                isDaily: state.gameMode === 'daily',
                isPrism: clearedMeta.kind === 'prism',
                tier: clearedMeta.tier || 'easy',
            });
        if (adDecision.show) {
            const shown = await showInterstitialAd();
            if (shown) {
                state.config.lastInterstitialTs = Date.now();
                state.config.levelsSinceInterstitial = 0;
                trackEvent('ad_interstitial_shown', {
                    placement: 'between_levels',
                    afterLevelIndex: clearedLevel,
                    afterLevel: clearedLevel + 1,
                });
            } else {
                // Pacing said yes but the SDK had nothing to show (no fill,
                // not loaded, or plugin missing) — the level counter keeps
                // accruing so the next level retries.
                trackEvent('ad_interstitial_failed', { afterLevelIndex: clearedLevel });
            }
        } else {
            trackEvent('ad_interstitial_skipped', {
                reason: adDecision.reason,
                afterLevelIndex: clearedLevel,
                levelsSince: state.config.levelsSinceInterstitial || 0,
            });
        }
        saveConfig();
        state.gameMode = 'normal';
        state.dailyDateKey = '';
        state.dailyLevelIndex = -1;
        clearSavedGame('normal');
        let idx = state.currentLevel + 1;
        if (idx >= LEVELS.length) idx = 0;
        // Stage the next level for the intro screen. The actual load + timer
        // start happen when the player taps Start (game screen mounts), so
        // reading the intro never costs them time.
        state.introLevel = { idx };
    },

    replay: () => {
        const mode = state.gameMode;
        if (mode === 'tutorial') {
            loadTutorialLevel(state.tutorialStep || 0);
            levelIntro();
            resetHudMemo();
            return;
        }
        // Same ordering rule as level_abandoned: read the funnel params before
        // loadLevel wipes them. A restart is a softer distress signal than an
        // abandon — the player still wants the level — so the two are separate
        // events rather than one with a flag.
        if (mode !== 'lab') trackEvent('level_restart', levelFunnelParams());
        const dailyDateKey = state.dailyDateKey;
        const dailyLevelIndex = state.dailyLevelIndex;
        const nextResetCount = mode === 'daily' ? (state.levelResets || 0) + 1 : 0;
        clearSavedGame(mode);
        loadLevel(state.currentLevel);
        if (mode === 'daily') {
            state.gameMode = 'daily';
            state.dailyDateKey = dailyDateKey || getLocalDateKey();
            state.dailyLevelIndex = dailyLevelIndex >= 0 ? dailyLevelIndex : state.currentLevel;
            state.levelResets = nextResetCount;
            state.dailyLaunchPending = true;
        }
        levelIntro();
        resetHudMemo();
    },

    playTutorial: () => {
        Tutorial.start();
        state.gameScene = 'playing';
        resetHudMemo();
    },

    // Fired by the UI when the place-restored reveal blooms, so the audio swell
    // lands together with the color flooding back into the scene.
    celebrate: () => {
        SoundEngine.restore();
        HapticsEngine.success();
    },

    skipTutorial: () => {
        Tutorial.skip();
        resetHudMemo();
    },

    playDaily: () => {
        const dateKey = getLocalDateKey();
        const daily = getDailyPuzzle(dateKey);
        state.gameMode = 'daily';
        state.dailyDateKey = dateKey;
        state.dailyLevelIndex = daily.levelIndex;
        state.dailyLaunchPending = true;
        const savedGame = readSavedGame('daily');
        if (savedGame && savedGame.dailyDateKey === dateKey && savedGame.level === daily.levelIndex) {
            restoreSavedGame(savedGame, 'daily');
            state.dailyLaunchPending = false;
        } else {
            clearSavedGame('daily');
            loadLevel(daily.levelIndex);
            state.gameMode = 'daily';
            state.dailyDateKey = dateKey;
            state.dailyLevelIndex = daily.levelIndex;
            state.dailyLaunchPending = true;
            levelIntro();
        }
        state.gameScene = 'playing';
        resetHudMemo();
    },

    pauseGame: () => {
        saveGameProgress();
        state.lockInput = true;
        // Freeze the level clock while any sheet (pause/ad/settings) is open.
        if (state.playing && !state.pauseStart) state.pauseStart = Date.now();
    },

    resumeGame: () => {
        // Push the start time forward by however long we were paused, so the
        // paused interval doesn't count toward the clear time.
        if (state.pauseStart) {
            state.levelStartTime += Date.now() - state.pauseStart;
            state.pauseStart = 0;
        }
        if (!state.victory) state.lockInput = false;
    },

    toggleSound: (on) => {
        if (SoundEngine.isEnabled() !== on) {
            // SoundEngine.toggle flips its own internal flag; keep it aligned
            // with the config value that the DOM UI just persisted.
            SoundEngine.toggle();
        }
        if (on) {
            SoundEngine.resume();
            SoundEngine.menuOpen();
        }
    },

    toggleMusic: (on) => {
        MusicEngine.setEnabled(on);
        if (on) MusicEngine.start();
    },

    undo: () => {
        while (state.undoStack.length) {
            const entry = state.undoStack.pop();
            if (!entry.piece.placed) continue;
            HintSystem.clearActiveHint();
            Board.liftPiece(entry.piece);
            // Bump placement: put the evicted pieces back where they were so
            // one undo reverses the whole move, not half of it.
            (entry.evicted || []).forEach(({ piece, boardPos }) => {
                if (!piece.placed && Number.isInteger(boardPos?.x) && boardPos.x >= 0) {
                    stopPieceMotion(piece);
                    Board.placePieceAt(piece, boardPos.x, boardPos.y, true);
                }
            });
            state.redoStack.push(entry);
            SoundEngine.pickup();
            HapticsEngine.light();
            arrangeLoosePiecesInTray();
            updateObjectiveProgress();
            syncPulseProgress();
            // LAB (prototype): lifting half of a mix cell must put the bloom out.
            syncBloomProgress();
            setTimeout(saveGameProgress, 260);
            break;
        }
    },

    redo: () => {
        while (state.redoStack.length) {
            const entry = state.redoStack.pop();
            if (entry.piece.placed) continue;
            stopPieceMotion(entry.piece);
            // Bump placement: redo replays the whole move, so the pieces it
            // evicted are lifted again before the piece takes the spot.
            const relifted = [];
            (entry.evicted || []).forEach(({ piece }) => {
                if (piece.placed) {
                    Board.liftPiece(piece);
                    relifted.push(piece);
                }
            });
            if (!Board.placePieceAt(entry.piece, entry.boardPos.x, entry.boardPos.y)) {
                // Couldn't replay — restore whatever was just lifted and bail.
                relifted.forEach(piece => {
                    const at = (entry.evicted || []).find(e => e.piece === piece);
                    if (at) Board.placePieceAt(piece, at.boardPos.x, at.boardPos.y, false);
                });
                SoundEngine.drop();
                HapticsEngine.selection();
                return;
            }
            HintSystem.clearActiveHint();
            state.undoStack.push(entry);
            SoundEngine.snapPiece();
            HapticsEngine.medium();
            updateObjectiveProgress(true);
            syncPulseProgress({ celebrate: true });
            syncBloomProgress();   // LAB (prototype)
            completeIfBoardFilled();
            if (!state.victory) {
                arrangeLoosePiecesInTray();
                saveGameProgress();
            }
            break;
        }
    },

    useHint: () => {
        // Delegate to HintSystem — it spends coins to flash a placement, or no-ops
        // when the player can't afford it (the DOM opens the coins/ad sheet).
        if (UI.getCurrent() !== 'game' || UI.getCurrentOverlay()) return;
        const before = getCoins();
        HintSystem.useHint();
        if (getCoins() < before) {
            state.levelHintsUsed = (state.levelHintsUsed || 0) + 1;
            trackEvent('hint_used', {
                mode: state.gameMode,
                level: state.currentLevel + 1,
                levelIndex: state.currentLevel,
                coinsRemaining: getCoins(),
                levelHintsUsed: state.levelHintsUsed,
            });
            saveGameProgress();
        }
    },

    // Solve Piece — the SOLVE_COST "just place one for me" help. It runs the
    // exact same finalizePlacement as a manual drop (mixes, frost, victory) and
    // counts as a help toward stars, same as a hint.
    //
    // findSolvablePlacement tries three things in order, cheapest move first:
    //   1. an unplaced piece whose correct spot is already free
    //   2. a misplaced piece that can move straight to its own correct spot
    //   3. evict the wrong pieces blocking a correct spot, then fill it
    //
    // Step 3 is what makes this dependable. Without it, a board where the
    // player had wedged several wrong pieces into each other's homes produced
    // no placement at all, so Solve appeared to do nothing on the second or
    // third press. Coins are only spent AFTER a placement is found, so the
    // dead press never charged — but a paid button that no-ops is still broken.
    solvePiece: () => {
        if (UI.getCurrent() !== 'game' || UI.getCurrentOverlay()) return;
        if (!state.playing || state.lockInput || state.victory) return;
        const placement = HintSystem.findSolvablePlacement();
        if (!placement) {
            SoundEngine.drop();
            HapticsEngine.selection();
            HintSystem.showMessage('Nothing to solve right now');
            return;
        }
        if (!spendCoins(SOLVE_COST)) {
            // Solve is reachable without the DOM's canAfford gate (and coins can
            // change between the tap and here), so failing to pay must open the
            // out-of-coins sheet rather than silently no-op. spendCoins deducts
            // nothing when it returns false.
            SoundEngine.menuOpen();
            HapticsEngine.selection();
            UI.promptForCoins('solve');
            return;
        }
        state.levelHintsUsed = (state.levelHintsUsed || 0) + 1;
        trackEvent('solve_piece_used', {
            mode: state.gameMode,
            level: state.currentLevel + 1,
            levelIndex: state.currentLevel,
            coinsRemaining: getCoins(),
            levelHintsUsed: state.levelHintsUsed,
        });
        const piece = placement.piece;
        const origin = placement.wasPlaced
            ? { x: piece.x, y: piece.y, wasPlaced: true, boardPos: { ...piece.boardPos } }
            : { x: piece.x, y: piece.y };
        const objectiveBefore = state.levelObjective
            ? Board.getObjectiveProgress(state.levelObjective)
            : null;
        HintSystem.clearActiveHint();
        HintSystem.stopNudge();
        // Eviction: the correct spot is buried under wrong pieces, so they go
        // back to the tray before the right one lands. Order matters — this
        // runs BEFORE stopPieceMotion, because arrangeLoosePiecesInTray below
        // starts a glide on every loose piece including `piece` itself, and
        // stopPieceMotion is what cancels it so the flight to the board wins.
        const evicted = placement.evict || [];
        if (evicted.length) {
            evicted.forEach(blocker => {
                stopPieceMotion(blocker);
                removePieceFromHistory(blocker);
                Board.liftPiece(blocker);
            });
            // A solve that rearranges the board cannot be half-undone, and the
            // evicted pieces' entries are gone from the stack either way.
            state.redoStack = [];
            arrangeLoosePiecesInTray();
            updateObjectiveProgress();
        }
        stopPieceMotion(piece);
        // Relocation: lift the misplaced piece off the board (same history
        // bookkeeping as a manual re-grab) so it glides to its correct spot.
        if (placement.wasPlaced && piece.placed) {
            removePieceFromHistory(piece);
            state.redoStack = [];
            Board.liftPiece(piece);
        }
        piece.displayScale = 1;
        SoundEngine.pickup();
        HapticsEngine.light();
        // Lock input for the short glide so a drag can't grab the piece mid-flight.
        state.lockInput = true;
        const flightMs = state.config.reducedMotion ? 0 : 340;
        const land = () => {
            state.lockInput = false;
            const fitResult = Board.placePieceAt(piece, placement.boardX, placement.boardY, true, true);
            if (fitResult) {
                finalizePlacement(piece, fitResult, origin, objectiveBefore);
            } else {
                // Board changed mid-flight (shouldn't happen with input locked) —
                // refund and settle the piece back rather than eating the coins.
                addCoins(SOLVE_COST);
                state.levelHintsUsed = Math.max(0, (state.levelHintsUsed || 0) - 1);
                restorePieceAfterInvalidDrop(piece, origin);
            }
        };
        if (flightMs === 0) { land(); return; }
        new Transition(piece.x, placement.targetX, flightMs, v => { piece.x = v; }, null, 'cubicout').start();
        new Transition(piece.y, placement.targetY, flightMs, v => { piece.y = v; }, land, 'cubicout').start();
    },

};

// ==================== INIT ====================
const init = () => {
    state.canvas = document.getElementById('gameCanvas');
    // index.html keeps conservative mobile fallback attributes for first paint;
    // the platform-aware logical size is authoritative once modules initialise.
    state.canvas.width = CANVAS_W;
    state.canvas.height = CANVAS_H;
    state.ctx = state.canvas.getContext('2d');
    state.render = new Renderer(state.ctx);
    Input.init(state.canvas);
    loadConfig();

    const { config } = state;
    Theme.set(config.theme);

    for (let i = 0; i < 14; i++) state.floaters.push(new FloatingBlock(CANVAS_W, CANVAS_H));

    if (config.sound === false) SoundEngine.toggle();
    if (config.music === false) MusicEngine.setEnabled(false);
    if (config.unlocked > LEVELS.length - 1) config.unlocked = LEVELS.length - 1;

    // Session-open snapshot of who this player is. The analytics vendor tracks
    // sessions on
    // its own, but not *state* — without these params there is no way to slice
    // any other metric by progress depth, which is the cut that matters when
    // asking "does the curve flatten out for people who get past chapter 3".
    // Logged once per cold start, after loadConfig so the values are real.
    //
    // NOT named `session_start` — that is a RESERVED vendor automatic event
    // and logging it would be rejected. The reserved-name guard in
    // the vendor prefix screen does not cover it, so it
    // would not have caught this. Same trap applies to first_open, app_update,
    // screen_view, user_engagement and ad_impression if events are added here
    // later.
    trackEvent('player_session', {
        unlocked: config.unlocked || 0,
        chapter: chapterOf(config.unlocked || 0) + 1,
        coins: getCoins(),
        streak: config.streak || 0,
        theme: config.theme || 'cream',
        colorblind: !!config.colorblind,
        reducedMotion: !!config.reducedMotion,
        adsRemoved: !!config.adsRemoved,
        notifications: config.notifications !== false,
    });

    // Keep startup in the DOM shell. Saved games are restored only when the
    // player taps Continue/Daily, so the app does not jump straight to canvas.
    loadLevel(config.unlocked);
    setupGameInput();

    refreshSize();
    window.addEventListener('resize', refreshSize);
    document.addEventListener('snapblocks:screen-changed', refreshSize);
    window.addEventListener('pagehide', saveGameProgress);

    // Pause music + save when the app is hidden/backgrounded; resume music when
    // it comes back (only if the player has music on). Without this, the
    // procedural music keeps looping after the user leaves the app.
    const onHidden = () => { saveGameProgress(); CloudSave.flush(); MusicEngine.stop(); };
    const onVisible = () => { if (state.config.music) MusicEngine.start(); UpdateCheck.run('resume'); };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') onHidden();
        else onVisible();
    });
    // Native Capacitor signal — fires reliably on Android background/foreground
    // even when the WebView doesn't emit visibilitychange.
    const capApp = window.Capacitor?.Plugins?.App;
    if (capApp && capApp.addListener) {
        capApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) onVisible();
            else onHidden();
        });
        capApp.addListener('pause', onHidden);
        capApp.addListener('resume', onVisible);
    }

    // Start music on first user interaction (autoplay policy)
    const startMusic = () => {
        if (state.config.music) MusicEngine.start();
        window.removeEventListener('pointerdown', startMusic);
    };
    window.addEventListener('pointerdown', startMusic, { once: true });

    // Hand UI the scene hooks. UI.init() routes to splash→onboarding for new
    // players or straight to the menu for returning players.
    UI.init(sceneHooks);
    CloudSave.initialize();
    initializeAds().then((ok) => {
        if (ok) {
            loadRewardedHintAd();
            loadInterstitialAd();
        }
    });
    // Check for a newer published build once the menu is up (after the studio
    // ident + splash routes), so the update sheet overlays the menu.
    setTimeout(() => UpdateCheck.run('launch'), 3800);
    // Re-plan the daily/streak reminders against today's state. No-op until
    // the player has granted permission (asked lazily after a level clear).
    rescheduleNotifications();
    draw();
};

window.addEventListener('load', init, false);
