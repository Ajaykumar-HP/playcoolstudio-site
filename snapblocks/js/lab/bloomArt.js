/**
 * Lab prototype — COLOR BLOOM target art.
 *
 * Scope note: board.js owns the fx CHANNEL (the array, the Transitions, the
 * per-frame tick and cull); this file owns the pixels. That split is
 * deliberate — the channel convention is a shipped rule worth following, the
 * art is prototype material that should be cheap to throw away.
 *
 * A bloom target is a board cell holding a faded object the player restores by
 * creating a specific colour there via Prism Mix.
 *
 *   unbloomed -> a greyed geometric motif + an indicator of the wanted colour
 *   bloomed   -> the motif filled with that colour, plus a one-shot burst
 *
 * The unbloomed art is BAKED into a board-sized layer (see buildBloomLayer)
 * that board.js blits under the pieces. The bloomed motif is baked per target
 * colour and blitted over the pieces, because by the time a cell blooms it is
 * covered by the pieces that filled it.
 */

import Theme from '../theme.js?v=3bd14eb0045c';
import Renderer from '../renderer.js?v=3bd14eb0045c';
import GamePiece from '../gamePiece.js?v=3bd14eb0045c';
import { GAME_COLORS } from '../levels.js?v=3bd14eb0045c';
import { MIX_RECIPES } from '../mixRecipes.js?v=3bd14eb0045c';

// ---- Recipe lookup -------------------------------------------------------
// MIX_RECIPES stores each result as a display hex, not as a palette index, so
// the mapping from a recipe to the GAME_COLORS entry a bloom target names has
// to live somewhere. Indices are the mix-semantics slots documented in
// levels.js (3 green, 5 purple, 6 orange) and must never be reordered.
const MIX_RESULT_INDEX = { green: 3, purple: 5, orange: 6 };

const RECIPE_BY_RESULT = new Map(
    MIX_RECIPES
        .filter(recipe => MIX_RESULT_INDEX[recipe.id])
        .map(recipe => [MIX_RESULT_INDEX[recipe.id], recipe]),
);

/**
 * GAME_COLORS is 1-based everywhere in level data; bloom targets follow suit.
 * Out-of-range indices resolve to slot 1 rather than undefined — lab level data
 * is authored in a parallel workstream, and a typo'd target index should show
 * the wrong flower, not take the whole renderer down mid-frame.
 */
const safeIndex = (target) => {
    const idx = Math.max(1, target | 0);
    return idx <= GAME_COLORS.length ? idx : 1;
};

export const bloomHexFor = (target) => GAME_COLORS[safeIndex(target) - 1];

export const recipeForTarget = (target) => RECIPE_BY_RESULT.get(safeIndex(target)) || null;

// ---- Motif geometry ------------------------------------------------------
// Six rhombic petals around a core. Geometric on purpose: the motif has to
// stay legible at cellSize 40 (a 7x7 board) as well as 56 (a 5x5 one), and a
// straight-edged rhombus survives that reduction where anything with an
// internal curve turns to mush. It also gives the bloom animation a free
// "petals push outward" beat via a single radial offset.
const PETALS = 6;

const petalPoly = (cx, cy, r, angle, spread) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const at = (u, v) => [cx + (u + spread) * cos - v * sin, cy + (u + spread) * sin + v * cos];
    return [at(r, 0), at(r * 0.62, r * 0.30), at(r * 0.26, 0), at(r * 0.62, -r * 0.30)];
};

/** Draw the motif. `spread` pushes every petal outward along its own axis. */
export const drawMotif = (render, cx, cy, r, petalFill, coreFill, spread = 0) => {
    for (let i = 0; i < PETALS; i++) {
        const angle = (Math.PI * 2 * i) / PETALS - Math.PI / 2;
        render.polygon(petalPoly(cx, cy, r, angle, spread), petalFill);
    }
    if (coreFill) render.circle(cx, cy, r * 0.26, coreFill);
};

// ---- Colourblind recipe chips -------------------------------------------
// Chips are cut from a throwaway 1x1 GamePiece in the relevant colour, so the
// pattern a chip wears is BY CONSTRUCTION the pattern that colour's pieces
// wear. Deriving it any other way (a local copy of the pattern table) would
// let the two drift, and a recipe drawn in patterns that match no piece on the
// board is worse than no recipe at all.
//
// Baked at a fixed 22px cell rather than at final chip size: GamePiece sizes
// its pattern tile as max(12, cellSize * 0.58), so at 22 the tile is 12px and
// repeats ~1.8 times across the chip. Baking directly at the ~15px final size
// would clamp the tile to 12 on a 15px chip — barely one repeat, which reads
// as a stray mark rather than a pattern. Downscaling 22 -> 15 keeps the
// density and only costs a little softness.
const CHIP_BAKE_CELL = 22;
const chipCache = new Map();

const chipCanvas = (colorIdx, patterned) => {
    const idx = safeIndex(colorIdx);
    const key = `${idx}|${patterned ? 1 : 0}`;
    if (chipCache.has(key)) return chipCache.get(key);
    const solidCell = [[[idx, idx, idx, idx]]];
    const piece = new GamePiece(solidCell, CHIP_BAKE_CELL, 2, GAME_COLORS);
    const canvas = piece.swatchCanvas(patterned);
    chipCache.set(key, canvas);
    return canvas;
};

/** Small "+" / "=" operator glyphs between chips. Ink comes from the theme. */
const drawOperator = (ctx, cx, cy, size, kind, ink) => {
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, size * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (kind === 'plus') {
        ctx.moveTo(cx - size / 2, cy);
        ctx.lineTo(cx + size / 2, cy);
        ctx.moveTo(cx, cy - size / 2);
        ctx.lineTo(cx, cy + size / 2);
    } else {
        ctx.moveTo(cx - size / 2, cy - size * 0.22);
        ctx.lineTo(cx + size / 2, cy - size * 0.22);
        ctx.moveTo(cx - size / 2, cy + size * 0.22);
        ctx.lineTo(cx + size / 2, cy + size * 0.22);
    }
    ctx.stroke();
    ctx.restore();
};

/**
 * The colourblind objective read: `A + B` over `= T`, filling the cell.
 *
 * This REPLACES the flower when colourblind is on rather than sitting beside
 * it. The reason is the accessibility requirement itself: colourblind mode
 * swaps piece fills for hatching, so a colour-valued objective would otherwise
 * ask the player to do arithmetic on hatching patterns they can only infer.
 * A chip row tucked into a spare corner at ~10px is too small for any hatch to
 * survive; spending the cell on the recipe is the only version that actually
 * works at board scale. A greyed petal ring stays around the outside so the
 * cell still reads as a bloom target and not as decoration.
 */
const drawRecipeDiagram = (render, ctx, cx, cy, cs, target, theme) => {
    const recipe = recipeForTarget(target);
    if (!recipe) return false;
    const [a, b] = recipe.bases;

    const chip = Math.max(11, cs * 0.38);
    const op = Math.max(5, cs * 0.16);
    const gap = Math.max(2, cs * 0.05);
    const ink = theme.ink2 || theme.ink;

    // Row 1: A + B
    const rowW = chip * 2 + op + gap * 2;
    const rowY = cy - cs * 0.22;
    let x = cx - rowW / 2;
    render.image(chipCanvas(a, true), x, rowY - chip / 2, chip, chip);
    x += chip + gap;
    drawOperator(ctx, x + op / 2, rowY, op, 'plus', ink);
    x += op + gap;
    render.image(chipCanvas(b, true), x, rowY - chip / 2, chip, chip);

    // Row 2: = T
    const row2W = chip + op + gap;
    const row2Y = cy + cs * 0.22;
    let x2 = cx - row2W / 2;
    drawOperator(ctx, x2 + op / 2, row2Y, op, 'equals', ink);
    x2 += op + gap;
    render.image(chipCanvas(target, true), x2, row2Y - chip / 2, chip, chip);
    return true;
};

// ---- Baked layers --------------------------------------------------------

/**
 * Bake the UNBLOOMED art for every target into one board-sized layer.
 * `originX/originY` are the board card's own offset inside that layer, so the
 * caller can blit it at exactly the same position as boardGfx.
 *
 * Colours are theme tokens only (inkSoft / ink2) plus the target's own
 * GAME_COLORS hex — no literals — so Cream's warm greys and Midnight's cool
 * ones both land on their respective cell fills. Re-baked by board.js whenever
 * the board graphics are, which covers theme switches and colourblind toggles.
 */
export const buildBloomLayer = ({ width, height, originX, originY, cellSize, targets, colorblind }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    if (!targets || !targets.length) return canvas;

    const ctx = canvas.getContext('2d');
    const render = new Renderer(ctx);
    const t = Theme.get();

    targets.forEach(target => {
        const cx = originX + (target.x + 0.5) * cellSize;
        const cy = originY + (target.y + 0.5) * cellSize;
        const hex = bloomHexFor(target.target);

        if (colorblind && drawRecipeDiagram(render, ctx, cx, cy, cellSize, target.target, t)) {
            // Faint petal ring around the diagram: the "this is a bloom cell"
            // signal, kept low enough not to compete with the chips.
            ctx.save();
            ctx.globalAlpha = 0.28;
            drawMotif(render, cx, cy, cellSize * 0.44, t.inkSoft, null, 0);
            ctx.restore();
            return;
        }

        // Greyed motif. inkSoft is a mid-tone in all four themes, so it holds
        // against Cream's near-white cell well and Midnight's near-black one.
        ctx.save();
        ctx.globalAlpha = 0.52;
        drawMotif(render, cx, cy, cellSize * 0.30, t.inkSoft, null, 0);
        ctx.restore();

        // The required colour, stated twice and quietly: a small solid core
        // and a thin ring. Subtle by design — this is the puzzle's answer, and
        // shouting it would flatten the level.
        ctx.save();
        ctx.globalAlpha = 0.78;
        render.circle(cx, cy, cellSize * 0.082, hex);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.30;
        ctx.strokeStyle = hex;
        ctx.lineWidth = Math.max(1.2, cellSize * 0.035);
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    });

    return canvas;
};

/**
 * Bake the BLOOMED motif for one target colour, centred in its own canvas.
 *
 * Sized 1.5x the cell so the halo has room; board.js blits it centred, so the
 * overhang is symmetric and scaling about the centre stays registered.
 *
 * The white halo is a rim light, not a theme colour: this sprite is composited
 * over placed PIECES (theme-independent GAME_COLORS bodies), so it has to hold
 * against an arbitrary saturated hue rather than against a board token. The
 * existing pulse-node art makes the same call for the same reason.
 */
export const buildBloomSprite = (target, cellSize, colorblind) => {
    const size = Math.ceil(cellSize * 1.5);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const render = new Renderer(ctx);
    const hex = bloomHexFor(target);
    const c = size / 2;
    const r = cellSize * 0.34;

    drawMotif(render, c, c, r * 1.12, 'rgba(255,255,255,0.72)', 'rgba(255,255,255,0.72)', 0);
    drawMotif(render, c, c, r, hex, null, 0);
    render.circle(c, c, r * 0.26, 'rgba(255,255,255,0.92)');

    if (colorblind) {
        // Keep the restored object identifiable without colour. A centred chip
        // rather than a tiled overlay: the chip canvas carries a transparent
        // pad (it is a real piece canvas), so tiling it would seam, and
        // stretching one 22px tile across the whole motif would smear the
        // hatch past the size it was designed to read at. At native scale the
        // badge says "this is now the <pattern> colour" unambiguously.
        const badge = cellSize * 0.34;
        render.image(chipCanvas(target, true), c - badge / 2, c - badge / 2, badge, badge);
    }

    return canvas;
};

/**
 * The one-shot burst: an expanding ring plus a soft radiant core, driven
 * entirely by values board.js ticks. Uses shadow-blur for the radiance rather
 * than a radial gradient, so nothing is constructed per frame.
 */
export const drawBloomBurst = (render, cx, cy, cellSize, fx) => {
    const ctx = render.ctx;
    if (fx.glowA > 0.01) {
        render.withAlpha(fx.glowA, () => {
            render.drawWithShadow(() => {
                render.circle(cx, cy, cellSize * 0.20, fx.hex);
            }, { blur: 26, offsetY: 0, color: fx.hex });
        });
    }
    if (fx.ringAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = fx.ringAlpha;
        ctx.strokeStyle = fx.hex;
        ctx.lineWidth = Math.max(2, cellSize * 0.05);
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * fx.ring * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    if (fx.spreadA > 0.01) {
        render.withAlpha(fx.spreadA, () => {
            drawMotif(render, cx, cy, cellSize * 0.30, fx.hex, null, fx.spread);
        });
    }
};

/** Discard cached chip canvases (colourblind toggle, level teardown). */
export const clearBloomCaches = () => chipCache.clear();