/**
 * SnapBlocks — Lab Mode prototype levels (HAND-AUTHORED, NOT GENERATED).
 *
 * Everything under js/lab/ is a self-contained prototype: delete the folder and
 * the two mechanics below vanish without touching the shipped game. In
 * particular this is NOT js/levels.js, which scripts/build-world-pack.mjs
 * rewrites wholesale — a hand-authored level placed there would be silently
 * destroyed on the next regeneration. The generator never reads or writes this
 * folder, so edits here are durable.
 *
 * Two mechanics are on trial:
 *
 *   bloom     — one or more cells are marked as Color Bloom targets. Filling the
 *               board is not enough; every marked cell must actually end up
 *               holding a Prism Mix result colour. Because a mix cell is
 *               authored as a diagonal split of two BASE colours, its two halves
 *               always belong to two different pieces — the bloom only lights
 *               when both arrive.
 *
 *   anchored  — one or more pieces start pre-placed and locked. They cover
 *               20-35% of the board's filled cells, so the player solves around
 *               a fixed skeleton instead of an empty grid.
 *
 * ---------------------------------------------------------------------------
 * AUTHORING RULES (same engine as the main pack — see .claude/skills/level-authoring)
 * ---------------------------------------------------------------------------
 * - A level is `level[x][y] = [top, left, right, bottom]` colour indices into
 *   GAME_COLORS (1-based; 0 = empty). Grids here are written ROW-major for
 *   legibility and transposed by `fromRows` below.
 * - Pieces are NOT declared. A piece is a flood-filled region of connected
 *   same-colour facets. Two same-coloured regions that share an edge become ONE
 *   piece, so every layout below keeps like colours edge-separated on purpose.
 * - Colour semantics: 1 red / 2 yellow / 4 blue are the mix BASES; 3 green /
 *   5 purple / 6 orange are the mix RESULTS and are never painted directly;
 *   7+ are fillers.
 * - Recipes: 2+4 -> 3 green, 4+1 -> 5 purple, 1+2 -> 6 orange.
 *
 * Anchored levels use solid cells only. That is a deliberate simplification:
 * with no diagonal splits a piece owns whole cells, so "what fraction of the
 * board is locked" is an unambiguous cell count rather than a facet fraction.
 *
 * Every level here is verified by scripts/validate-lab-levels.mjs, which runs a
 * real exact-cover solver. The main pack's validator does NOT check solvability
 * and would happily pass an unsolvable bloom level.
 *
 * This module deliberately has NO imports so the validator can load it in a
 * `vm` context with `export` stripped, instead of duplicating the level data.
 */

const S = (c) => [c, c, c, c];
const DL = (c1, c2) => [c1, c1, c2, c2];   // "\" split: top+left = c1, right+bottom = c2
const DR = (c1, c2) => [c1, c2, c1, c2];   // "/" split: top+right = c1, left+bottom = c2

// Author row-major (rows[y][x]) because that reads like the board looks, then
// transpose to the engine's column-major level[x][y].
const fromRows = (rows) => {
    const dim = rows.length;
    const out = [];
    for (let x = 0; x < dim; x++) {
        out[x] = [];
        for (let y = 0; y < dim; y++) out[x][y] = rows[y][x].slice();
    }
    return out;
};

// GAME_COLORS index for each Prism Mix result. Only these three are legal
// `blooms[].target` values — a bloom is by definition something you MIXED.
export const BLOOM_TARGET_COLORS = { GREEN: 3, PURPLE: 5, ORANGE: 6 };

// ---------------------------------------------------------------------------
// THE TRAP THAT SHAPED EVERY BLOOM LAYOUT BELOW
//
// Pieces snap by GEOMETRY only — the engine never checks that a piece's colours
// match the cell it lands in. On a normal level that is harmless: board full is
// board won. On a bloom level it is not, because the two halves of a mix cell
// travel together as a rigid pair, so the pair can be placed one row or one
// column away from its authored home and the board still fills completely — with
// the bloom lit in the WRONG cell, or not at all. The player would be staring at
// a full board that refuses to complete.
//
// The first drafts of bloom-1, -3, -4 and -5 all had exactly this dead end
// (scripts/validate-lab-levels.mjs found them; no structural check would have).
// Two devices fix it, and both are used deliberately below:
//
//   1. Kill global translation. Every 5x5 carries an L-shaped piece that spans
//      the full board height (so no vertical shift is possible) plus a piece
//      pinned against the opposite edge (so no horizontal shift is possible).
//      Note the two must be DIFFERENT shapes — two identical full-height bars
//      just swap columns and the shift comes back.
//
//   2. Kill local relocation. At least one piece of each mix pair is given a
//      long, distinctive footprint (an L or S, not a domino) so the pair has no
//      second place on the board it could legally sit.
//
// The validator enumerates every exact-cover packing of each board and asserts
// all of them light all targets. Re-run it after ANY edit to a bloom grid — a
// one-cell recolour is enough to reopen a dead end.
// ---------------------------------------------------------------------------

export const LAB_LEVELS = [
    // ============================ COLOR BLOOM ============================

    // 1 target, 6 pieces, 4x4. Yellow enters the mix cell from the left, the blue
    // L from the right — the split cell is the only place the two can meet.
    // The three trominoes are all different shapes, which is what stops the
    // whole board sliding down a row (an earlier draft with a full-width bottom
    // bar did exactly that).
    {
        id: 'bloom-1',
        kind: 'bloom',
        name: 'First Light',
        hint: 'Mix yellow and blue to wake the meadow.',
        grid: fromRows([
            [S(8),  S(8),     S(8),  S(14)],
            [S(2),  DL(2, 4), S(4),  S(14)],
            [S(22), S(22),    S(4),  S(14)],
            [S(22), S(25),    S(25), S(25)],
        ]),
        blooms: [{ x: 1, y: 1, target: 3 }],
    },

    // 1 target, 5 pieces, 4x4. Orange instead of green, and the mix cell is fed
    // from ABOVE and to the RIGHT, so "a split cell always looks like that one"
    // never becomes the lesson. Exactly one packing exists — the tightest board
    // in the set.
    {
        id: 'bloom-2',
        kind: 'bloom',
        name: 'Ember Seam',
        hint: 'Red meets yellow along the seam.',
        grid: fromRows([
            [S(11), S(11), S(2),     S(2)],
            [S(11), S(17), DL(2, 1), S(1)],
            [S(25), S(17), S(17),    S(1)],
            [S(25), S(25), S(25),    S(1)],
        ]),
        blooms: [{ x: 2, y: 1, target: 6 }],
    },

    // 2 targets, 9 pieces, 5x5. One blue snake feeds BOTH mix cells, so the two
    // blooms cannot be satisfied independently — placing that single piece is
    // most of the level. Column 0 is an L that reaches into the bottom row
    // (full height, so nothing shifts vertically); the red piece hugs the right
    // edge (so nothing shifts horizontally).
    {
        id: 'bloom-3',
        kind: 'bloom',
        name: 'Meadow and Dusk',
        hint: 'One blue vein lights two blooms.',
        grid: fromRows([
            [S(17), S(8),  S(8),     S(8),     S(27)],
            [S(17), S(2),  DL(2, 4), S(4),     S(27)],
            [S(17), S(8),  S(8),     S(4),     S(27)],
            [S(17), S(11), S(11),    DL(4, 1), S(1)],
            [S(17), S(17), S(29),    S(29),    S(1)],
        ]),
        blooms: [
            { x: 2, y: 1, target: 3 },
            { x: 3, y: 3, target: 5 },
        ],
    },

    // 2 targets, 8 pieces, 5x5. Two SEPARATE yellow pieces on one board — the
    // readability trap this mechanic has to survive. One feeds green, the other
    // feeds orange, and the blue S-piece threads between them. Exactly one
    // packing exists, so there is no wrong way to fill this board.
    {
        id: 'bloom-4',
        kind: 'bloom',
        name: 'Twin Kilns',
        hint: 'Two yellows, two very different jobs.',
        grid: fromRows([
            [S(17), S(17), S(2),     S(2),     S(22)],
            [S(17), S(4),  S(4),     DR(2, 4), S(22)],
            [S(17), S(1),  S(4),     S(25),    S(25)],
            [S(17), S(1),  DL(1, 2), S(2),     S(25)],
            [S(17), S(17), S(29),    S(29),    S(25)],
        ]),
        blooms: [
            { x: 3, y: 1, target: 3 },
            { x: 2, y: 3, target: 6 },
        ],
    },

    // 3 targets, 9 pieces, 5x5 — all three recipes on one board, spread from the
    // top edge to the right edge to the bottom edge so no single placement
    // resolves two of them. The long red J down column 1 is what pins the orange
    // pair; without it the pair relocates and the orange lights in the wrong cell.
    {
        id: 'bloom-5',
        kind: 'bloom',
        name: 'Prism Bloom',
        hint: 'Green, purple and orange — all three, or nothing.',
        grid: fromRows([
            [S(17), S(17), S(2),     DL(2, 4), S(4)],
            [S(17), S(11), S(11),    S(8),     S(4)],
            [S(17), S(1),  S(8),     S(8),     DL(4, 1)],
            [S(17), S(1),  S(27),    S(27),    S(1)],
            [S(17), S(1),  DL(1, 2), S(2),     S(1)],
        ]),
        blooms: [
            { x: 3, y: 0, target: 3 },
            { x: 4, y: 2, target: 5 },
            { x: 2, y: 4, target: 6 },
        ],
    },

    // ============================= ANCHORED ==============================

    // 4/16 cells locked (25%). A corner 2x2 — the gentlest possible version:
    // the locked piece removes a corner rather than fragmenting the board.
    {
        id: 'anchored-1',
        kind: 'anchored',
        name: 'Cornerstone',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S(8),  S(8),  S(14), S(14)],
            [S(8),  S(8),  S(14), S(14)],
            [S(22), S(11), S(11), S(17)],
            [S(22), S(22), S(17), S(17)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }],
    },

    // 5/16 cells locked (31%). The locked piece is an L that reaches down the
    // middle of the board, so the remaining space is genuinely awkward.
    {
        id: 'anchored-2',
        kind: 'anchored',
        name: 'Held Fast',
        hint: 'The locked arm splits the board. Work around it.',
        grid: fromRows([
            [S(11), S(11), S(11), S(14)],
            [S(8),  S(8),  S(11), S(14)],
            [S(22), S(8),  S(11), S(17)],
            [S(22), S(25), S(25), S(17)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }],
    },

    // 6/25 cells locked (24%) across TWO pieces — the first level where the
    // anchors are not one contiguous mass.
    {
        id: 'anchored-3',
        kind: 'anchored',
        name: 'Two Pillars',
        hint: 'Two fixed points, one path between them.',
        grid: fromRows([
            [S(8),  S(8),  S(8),  S(14), S(14)],
            [S(8),  S(11), S(11), S(14), S(17)],
            [S(22), S(22), S(11), S(27), S(17)],
            [S(25), S(22), S(29), S(27), S(17)],
            [S(25), S(25), S(29), S(29), S(29)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 3, y: 2 }],
    },

    // 7/25 cells locked (28%). A locked top edge plus a locked spine down the
    // centre — the board is cut into a left and a right pocket.
    {
        id: 'anchored-4',
        kind: 'anchored',
        name: 'Frame and Fill',
        hint: 'The frame is set. Fill both pockets.',
        grid: fromRows([
            [S(14), S(14), S(14), S(14), S(8)],
            [S(17), S(11), S(11), S(22), S(8)],
            [S(17), S(11), S(27), S(22), S(8)],
            [S(17), S(29), S(27), S(22), S(25)],
            [S(29), S(29), S(27), S(25), S(25)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 2, y: 2 }],
    },

    // 8/25 cells locked (32%) across THREE pieces — the upper bound of the range
    // this prototype is meant to evaluate.
    {
        id: 'anchored-5',
        kind: 'anchored',
        name: 'Locked Lattice',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(11), S(11), S(8),  S(8),  S(8)],
            [S(11), S(14), S(14), S(22), S(8)],
            [S(17), S(17), S(14), S(22), S(27)],
            [S(25), S(17), S(29), S(22), S(27)],
            [S(25), S(25), S(29), S(29), S(29)],
        ]),
        anchoredCells: [{ x: 1, y: 1 }, { x: 4, y: 2 }, { x: 0, y: 3 }],
    },
];

export default LAB_LEVELS;
