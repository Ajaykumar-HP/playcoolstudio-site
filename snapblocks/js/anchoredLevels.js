/**
 * SnapBlocks — ANCHORED levels.
 *
 * !!! GENERATED FILE — DO NOT HAND-EDIT !!!
 * Written wholesale by scripts/build-anchored.mjs. Any edit here is destroyed
 * the next time that script runs, with no error. Edit the generator instead.
 *
 * WHAT AN ANCHORED LEVEL IS
 * -------------------------
 * One to three of the level's pieces start already placed on the board and
 * permanently locked. The player solves around a fixed skeleton instead of an
 * empty grid.
 *
 * WHY IT EXISTS
 * -------------
 * Difficulty in this game is the number of distinct exact-cover PACKINGS, and
 * two measured facts (docs/experiments/tangram-pack/) box in every other lever:
 * adding pieces makes a board EASIER, and a solid-cell partition cannot be both
 * many-piece and tight. Locking pieces deletes packings without adding a single
 * diagonal split, so the board stays visually identical to the shipped game —
 * which matters, because a diagonal cell in SnapBlocks MEANS "this is a mix
 * cell", and the previous difficulty attempt was rejected on playtest for
 * diluting exactly that.
 *
 * Every grid here is solid cells only, on purpose.
 *
 * HOW IT REACHES THE PLAYER
 * -------------------------
 * These levels do NOT live in js/levels.js — that file is regenerated wholesale
 * by scripts/build-world-pack.mjs and would destroy them. Instead js/anchored.js
 * maps each entry onto a level index, and js/game.js loadLevel serves this grid
 * in place of LEVELS[idx] when the index matches. The shipped pack is untouched.
 *
 * Because the grid travels with the entry, its DIMENSION is free: an Anchored
 * level is not bound to the size LEVELS[idx] happened to be.
 *
 * THIS BATCH
 * ----------
 *   boards:    4 x 4x4, 30 x 5x5, 14 x 6x6
 *   coverage:  20% -> 33% of cells locked
 *   packings WITH anchors applied:
 *     easy   (9-60): 14
 *     medium (3-8):  24
 *     hard   (1-2):  10
 *
 * 48 levels, the agreed 30-50 ceiling — not the 88 free cadence slots,
 * which would push the pack to ~46% special against the "keep Regular dominant
 * (~70%)" target in CLAUDE.md.
 *
 * Validated by scripts/validate-anchored-levels.mjs, which runs a real solver
 * with the anchors fixed. validate-levels.mjs does not check solvability and
 * would happily pass an unsolvable anchored board.
 *
 * No imports, so the validator can load this in a vm context with `export`
 * stripped rather than duplicating the data.
 */

const S = (c) => [c, c, c, c];

// Authored row-major (rows[y][x]) because that reads like the board looks, then
// transposed to the engine's column-major level[x][y].
const fromRows = (rows) => {
    const dim = rows.length;
    const out = [];
    for (let x = 0; x < dim; x++) {
        out[x] = [];
        for (let y = 0; y < dim; y++) out[x][y] = rows[y][x].slice();
    }
    return out;
};

// Cadence, consumed by js/anchored.js so the rule has ONE definition. Position
// 4 of every chapter from chapter 2 on. Anchored YIELDS to Prism, Frost and
// Treasure — see js/anchored.js for the exclusion chain.
export const ANCHORED_FIRST_LEVEL = 14;
export const ANCHORED_INTERVAL = 10;

export const ANCHORED_LEVELS = [
    // EASY   4x4  6 pieces (5 loose)  4/16 cells locked (25%)  12 packings with anchors applied
    {
        id: 'anchored-01',
        index: 14,
        name: 'Set Stone',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S(14), S(14), S(19), S(19)],
            [S(28), S(14), S(16), S(16)],
            [S(28), S(21), S(21), S(25)],
            [S(28), S(28), S(25), S(25)],
        ]),
        anchoredCells: [{ x: 0, y: 1 }],
    },
    // EASY   4x4  6 pieces (5 loose)  4/16 cells locked (25%)  18 packings with anchors applied
    {
        id: 'anchored-02',
        index: 34,
        name: 'Fixed Point',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S( 8), S(29), S(29), S(11)],
            [S( 8), S(29), S(22), S(11)],
            [S(23), S(23), S(22), S(27)],
            [S(23), S(23), S(27), S(27)],
        ]),
        anchoredCells: [{ x: 0, y: 2 }],
    },
    // EASY   4x4  6 pieces (5 loose)  4/16 cells locked (25%)  24 packings with anchors applied
    {
        id: 'anchored-03',
        index: 44,
        name: 'The Given',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S(21), S(21), S(21), S(25)],
            [S(22), S(16), S(16), S(25)],
            [S(22), S(17), S(17), S(25)],
            [S(22), S( 8), S( 8), S(25)],
        ]),
        anchoredCells: [{ x: 3, y: 0 }],
    },
    // MEDIUM 4x4  6 pieces (5 loose)  4/16 cells locked (25%)  6 packings with anchors applied
    {
        id: 'anchored-04',
        index: 54,
        name: 'Held Corner',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S(26), S(26), S(28), S(28)],
            [S(21), S(26), S(28), S(28)],
            [S(21), S(24), S(24), S( 7)],
            [S(21), S(27), S(27), S( 7)],
        ]),
        anchoredCells: [{ x: 2, y: 0 }],
    },
    // EASY   5x5  7 pieces (5 loose)  5/25 cells locked (20%)  16 packings with anchors applied
    {
        id: 'anchored-05',
        index: 64,
        name: 'Quiet Anchor',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(22), S(22), S(22), S(27), S(27)],
            [S(22), S(22), S(22), S(27), S(27)],
            [S( 8), S( 8), S(29), S(29), S(29)],
            [S(11), S(11), S(10), S(14), S(14)],
            [S(11), S(10), S(10), S(14), S(14)],
        ]),
        anchoredCells: [{ x: 0, y: 2 }, { x: 2, y: 2 }],
    },
    // EASY   5x5  7 pieces (6 loose)  5/25 cells locked (20%)  12 packings with anchors applied
    {
        id: 'anchored-06',
        index: 74,
        name: 'Standing Wall',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S(22), S(22), S(22), S(20), S(20)],
            [S(23), S(23), S(20), S(20), S(20)],
            [S(23), S(29), S(29), S(29), S(29)],
            [S(27), S(11), S(11), S( 8), S( 8)],
            [S(27), S(11), S(11), S( 8), S( 8)],
        ]),
        anchoredCells: [{ x: 3, y: 0 }],
    },
    // EASY   5x5  7 pieces (6 loose)  5/25 cells locked (20%)  24 packings with anchors applied
    {
        id: 'anchored-07',
        index: 84,
        name: 'Old Foundation',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S(14), S(14), S(14), S(24), S(24)],
            [S(14), S(14), S(10), S(10), S(24)],
            [S(21), S(21), S(10), S(10), S(24)],
            [S(21), S(21), S(20), S(20), S(24)],
            [S(22), S(22), S(22), S( 7), S( 7)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }],
    },
    // EASY   5x5  7 pieces (5 loose)  5/25 cells locked (20%)  24 packings with anchors applied
    {
        id: 'anchored-08',
        index: 94,
        name: 'Rooted',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(14), S(24), S(24), S(24), S(24)],
            [S(14), S(10), S(10), S(26), S(26)],
            [S(14), S(10), S(10), S(26), S(26)],
            [S(14), S(23), S(23), S(23), S(23)],
            [S(21), S(21), S(28), S(28), S(28)],
        ]),
        anchoredCells: [{ x: 0, y: 4 }, { x: 2, y: 4 }],
    },
    // EASY   5x5  7 pieces (6 loose)  5/25 cells locked (20%)  32 packings with anchors applied
    {
        id: 'anchored-09',
        index: 104,
        name: 'The Remainder',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S(11), S(11), S( 9), S( 9), S(19)],
            [S(11), S(11), S( 9), S(19), S(19)],
            [S(10), S(10), S( 9), S(19), S(19)],
            [S(10), S(10), S(18), S(18), S(18)],
            [S( 7), S( 7), S( 7), S(12), S(12)],
        ]),
        anchoredCells: [{ x: 4, y: 0 }],
    },
    // MEDIUM 5x5  7 pieces (5 loose)  5/25 cells locked (20%)  4 packings with anchors applied
    {
        id: 'anchored-10',
        index: 124,
        name: 'Cast Shadow',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(22), S(22), S(24), S(24), S(24)],
            [S(19), S(19), S(10), S(10), S(10)],
            [S(28), S(14), S(14), S(14), S(21)],
            [S(28), S(28), S(14), S(21), S(21)],
            [S(28), S(28), S(14), S(21), S(21)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
    },
    // EASY   5x5  7 pieces (6 loose)  5/25 cells locked (20%)  12 packings with anchors applied
    {
        id: 'anchored-11',
        index: 134,
        name: 'Two Certainties',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S(21), S(10), S(10), S(10), S(19)],
            [S(21), S(24), S(24), S(24), S(19)],
            [S(21), S(21), S(22), S(22), S(22)],
            [S(21), S(28), S(28), S(28), S(28)],
            [S(13), S(13), S(13), S(13), S(13)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }],
    },
    // MEDIUM 5x5  7 pieces (6 loose)  5/25 cells locked (20%)  6 packings with anchors applied
    {
        id: 'anchored-12',
        index: 144,
        name: 'Split Ground',
        hint: 'One piece is already set. Build out from it.',
        grid: fromRows([
            [S(12), S( 7), S( 7), S( 7), S( 7)],
            [S(12), S(12), S(12), S(22), S( 7)],
            [S(12), S(12), S( 8), S(22), S(22)],
            [S(25), S(21), S( 8), S(17), S(17)],
            [S(25), S(21), S( 8), S(17), S(17)],
        ]),
        anchoredCells: [{ x: 1, y: 0 }],
    },
    // EASY   5x5  7 pieces (5 loose)  6/25 cells locked (24%)  16 packings with anchors applied
    {
        id: 'anchored-13',
        index: 154,
        name: 'Narrow Pass',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(24), S(24), S(20), S(13), S(29)],
            [S(24), S(24), S(20), S(13), S(29)],
            [S(20), S(20), S(20), S(13), S(29)],
            [S(18), S(18), S(10), S(10), S(10)],
            [S(18), S(18), S(21), S(21), S(21)],
        ]),
        anchoredCells: [{ x: 3, y: 0 }, { x: 4, y: 0 }],
    },
    // EASY   5x5  7 pieces (5 loose)  6/25 cells locked (24%)  12 packings with anchors applied
    {
        id: 'anchored-14',
        index: 164,
        name: 'Bound Spine',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(22), S(22), S( 8), S( 8), S( 8)],
            [S(22), S(22), S(29), S(29), S(29)],
            [S(27), S(27), S(27), S(19), S(19)],
            [S(27), S(13), S(13), S(19), S(19)],
            [S(27), S(13), S(13), S( 9), S( 9)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 3, y: 4 }],
    },
    // MEDIUM 5x5  7 pieces (5 loose)  6/25 cells locked (24%)  4 packings with anchors applied
    {
        id: 'anchored-15',
        index: 174,
        name: 'Left Behind',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(28), S(28), S(21), S(21), S(21)],
            [S(28), S(28), S(21), S(16), S(16)],
            [S(29), S(25), S(25), S(16), S(16)],
            [S(29), S(25), S(25), S(16), S(17)],
            [S(10), S(10), S(17), S(17), S(17)],
        ]),
        anchoredCells: [{ x: 2, y: 0 }, { x: 0, y: 4 }],
    },
    // EASY   5x5  7 pieces (5 loose)  6/25 cells locked (24%)  20 packings with anchors applied
    {
        id: 'anchored-16',
        index: 184,
        name: 'Weight Bearing',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(10), S(10), S(10), S(25), S(25)],
            [S(29), S(29), S(29), S(29), S(25)],
            [S(23), S(23), S(27), S(27), S(17)],
            [S(23), S(23), S(27), S(27), S(17)],
            [S(22), S(22), S(22), S(22), S(17)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 3, y: 0 }],
    },
    // MEDIUM 5x5  7 pieces (5 loose)  6/25 cells locked (24%)  6 packings with anchors applied
    {
        id: 'anchored-17',
        index: 194,
        name: 'The Fixed Arm',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(17), S(17), S( 7), S(22), S(22)],
            [S(17), S( 7), S( 7), S(22), S(12)],
            [S(27), S(27), S( 7), S(12), S(12)],
            [S(27), S(14), S(14), S(12), S(12)],
            [S(21), S(21), S(14), S(14), S(14)],
        ]),
        anchoredCells: [{ x: 2, y: 0 }, { x: 0, y: 4 }],
    },
    // MEDIUM 5x5  7 pieces (5 loose)  6/25 cells locked (24%)  4 packings with anchors applied
    {
        id: 'anchored-18',
        index: 214,
        name: 'Counterweight',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(27), S(27), S(22), S(22), S(22)],
            [S(17), S(27), S(11), S(29), S(29)],
            [S(17), S(27), S(11), S(11), S(29)],
            [S(17), S(17), S(20), S(11), S(29)],
            [S(23), S(23), S(20), S(20), S(20)],
        ]),
        anchoredCells: [{ x: 0, y: 1 }, { x: 0, y: 4 }],
    },
    // MEDIUM 5x5  7 pieces (5 loose)  6/25 cells locked (24%)  3 packings with anchors applied
    {
        id: 'anchored-19',
        index: 224,
        name: 'Immovable',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S( 9), S( 9), S(22), S(22), S(22)],
            [S( 9), S( 9), S(19), S(22), S(22)],
            [S(18), S(19), S(19), S(19), S(19)],
            [S(18), S(18), S(10), S(10), S(10)],
            [S( 7), S( 7), S( 7), S(12), S(12)],
        ]),
        anchoredCells: [{ x: 0, y: 2 }, { x: 0, y: 4 }],
    },
    // HARD   5x5  7 pieces (5 loose)  6/25 cells locked (24%)  2 packings with anchors applied
    {
        id: 'anchored-20',
        index: 234,
        name: 'Wedged',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(28), S(10), S(10), S(17), S(17)],
            [S(28), S(28), S(10), S(14), S(17)],
            [S(28), S(21), S(10), S(14), S(14)],
            [S(21), S(21), S(21), S(14), S(24)],
            [S(22), S(22), S(22), S(24), S(24)],
        ]),
        anchoredCells: [{ x: 3, y: 0 }, { x: 0, y: 4 }],
    },
    // MEDIUM 5x5  8 pieces (6 loose)  7/25 cells locked (28%)  4 packings with anchors applied
    {
        id: 'anchored-21',
        index: 244,
        name: 'Three Pillars',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(20), S(14), S(14), S(29), S(23)],
            [S(20), S(20), S(14), S(29), S(23)],
            [S(11), S(11), S(11), S(29), S(23)],
            [S(11), S(17), S(17), S(16), S(22)],
            [S(17), S(17), S(16), S(16), S(22)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 0, y: 2 }],
    },
    // EASY   5x5  8 pieces (6 loose)  7/25 cells locked (28%)  16 packings with anchors applied
    {
        id: 'anchored-22',
        index: 254,
        name: 'Locked Frame',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(10), S(10), S(24), S(14), S(14)],
            [S(10), S(24), S(24), S(14), S(14)],
            [S(19), S(19), S(27), S(27), S(27)],
            [S(22), S(19), S(12), S(13), S(13)],
            [S(22), S(22), S(12), S(12), S(13)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 3, y: 0 }],
    },
    // EASY   5x5  8 pieces (6 loose)  7/25 cells locked (28%)  12 packings with anchors applied
    {
        id: 'anchored-23',
        index: 264,
        name: 'Dense Ground',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(11), S(11), S(11), S(10), S(25)],
            [S(11), S(29), S(29), S(10), S(25)],
            [S(11), S(22), S(29), S(29), S(25)],
            [S(22), S(22), S( 8), S(13), S(28)],
            [S(22), S( 8), S( 8), S(13), S(28)],
        ]),
        anchoredCells: [{ x: 1, y: 1 }, { x: 2, y: 3 }],
    },
    // MEDIUM 5x5  8 pieces (6 loose)  7/25 cells locked (28%)  4 packings with anchors applied
    {
        id: 'anchored-24',
        index: 274,
        name: 'Tight Quarters',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(26), S( 8), S( 8), S(22), S(22)],
            [S(26), S(26), S( 8), S(22), S( 7)],
            [S(26), S(29), S(29), S(29), S( 7)],
            [S(23), S(14), S(14), S(14), S( 7)],
            [S(23), S(23), S(27), S(27), S(27)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 1, y: 2 }],
    },
    // MEDIUM 5x5  8 pieces (6 loose)  7/25 cells locked (28%)  3 packings with anchors applied
    {
        id: 'anchored-25',
        index: 284,
        name: 'Little Room',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(22), S(16), S(16), S(25), S(25)],
            [S(22), S(22), S(16), S(25), S(25)],
            [S(29), S(19), S(19), S(17), S(17)],
            [S(29), S(29), S(19), S(19), S(27)],
            [S(18), S(18), S(18), S(27), S(27)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 3, y: 0 }],
    },
    // HARD   5x5  8 pieces (5 loose)  7/25 cells locked (28%)  2 packings with anchors applied
    {
        id: 'anchored-26',
        index: 304,
        name: 'Braced',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(11), S(11), S(29), S(10), S(10)],
            [S(11), S(11), S(29), S(23), S(17)],
            [S(11), S(11), S(29), S(23), S(17)],
            [S(20), S(20), S(20), S(22), S(16)],
            [S(20), S(20), S(20), S(22), S(16)],
        ]),
        anchoredCells: [{ x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 3 }],
    },
    // MEDIUM 5x5  8 pieces (6 loose)  7/25 cells locked (28%)  4 packings with anchors applied
    {
        id: 'anchored-27',
        index: 314,
        name: 'Set Deep',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S( 7), S(10), S( 9), S( 9), S( 9)],
            [S( 7), S(10), S(10), S(14), S(14)],
            [S( 7), S( 7), S(12), S(12), S(14)],
            [S(22), S(22), S(22), S(27), S(27)],
            [S(19), S(19), S(19), S(27), S(27)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
    },
    // MEDIUM 5x5  8 pieces (6 loose)  7/25 cells locked (28%)  3 packings with anchors applied
    {
        id: 'anchored-28',
        index: 324,
        name: 'The Last Gap',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(20), S(20), S(20), S(29), S(29)],
            [S(22), S(22), S(11), S(11), S(29)],
            [S(22), S(17), S(11), S(28), S(19)],
            [S(22), S(17), S(28), S(28), S(19)],
            [S(17), S(17), S(18), S(18), S(18)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 0, y: 1 }],
    },
    // MEDIUM 5x5  8 pieces (6 loose)  8/25 cells locked (32%)  6 packings with anchors applied
    {
        id: 'anchored-29',
        index: 334,
        name: 'No Second Way',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(29), S(29), S(29), S(29), S(29)],
            [S(27), S(27), S(27), S(27), S(23)],
            [S(21), S(21), S(21), S(23), S(23)],
            [S(11), S(11), S(21), S( 8), S(17)],
            [S(11), S(22), S(22), S( 8), S(17)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 4, y: 1 }],
    },
    // MEDIUM 5x5  8 pieces (6 loose)  8/25 cells locked (32%)  3 packings with anchors applied
    {
        id: 'anchored-30',
        index: 344,
        name: 'Cornerstone',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(16), S(16), S(16), S(10), S(10)],
            [S(22), S(13), S(13), S(21), S(14)],
            [S(22), S(13), S(21), S(21), S(14)],
            [S(17), S(13), S(28), S(28), S(14)],
            [S(17), S(17), S(28), S(28), S(14)],
        ]),
        anchoredCells: [{ x: 4, y: 1 }, { x: 2, y: 3 }],
    },
    // HARD   5x5  8 pieces (6 loose)  8/25 cells locked (32%)  2 packings with anchors applied
    {
        id: 'anchored-31',
        index: 354,
        name: 'Deep Footing',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(26), S(26), S(26), S(26), S(12)],
            [S( 9), S( 9), S( 7), S( 7), S(12)],
            [S( 9), S(10), S(10), S( 7), S(12)],
            [S(14), S(10), S(19), S(22), S(22)],
            [S(14), S(14), S(19), S(22), S(22)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 3, y: 3 }],
    },
    // MEDIUM 5x5  8 pieces (5 loose)  8/25 cells locked (32%)  6 packings with anchors applied
    {
        id: 'anchored-32',
        index: 364,
        name: 'Held Ground',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(28), S(13), S(13), S(13), S(16)],
            [S(28), S(10), S(21), S(21), S(16)],
            [S(10), S(10), S(21), S(21), S(16)],
            [S(26), S(26), S( 9), S( 9), S(25)],
            [S(26), S( 9), S( 9), S(25), S(25)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 4, y: 0 }],
    },
    // MEDIUM 5x5  8 pieces (6 loose)  8/25 cells locked (32%)  8 packings with anchors applied
    {
        id: 'anchored-33',
        index: 374,
        name: 'The Long Wall',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(19), S(19), S(14), S(14), S(27)],
            [S(19), S(19), S(19), S(14), S(27)],
            [S(22), S(22), S(22), S( 9), S(13)],
            [S(29), S(11), S(11), S( 9), S(13)],
            [S(29), S(29), S(11), S( 9), S(13)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 0, y: 2 }],
    },
    // HARD   5x5  8 pieces (5 loose)  8/25 cells locked (32%)  1 packing with anchors applied
    {
        id: 'anchored-34',
        index: 394,
        name: 'Keystone',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(26), S(17), S(25), S(16), S(16)],
            [S(26), S(17), S(25), S(25), S(16)],
            [S(20), S(20), S(21), S(21), S(16)],
            [S(22), S(20), S(21), S(13), S(13)],
            [S(22), S(22), S(22), S(13), S(13)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }],
    },
    // MEDIUM 6x6  10 pieces (8 loose)  10/36 cells locked (28%)  6 packings with anchors applied
    {
        id: 'anchored-35',
        index: 404,
        name: 'Buttress',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(20), S(21), S(21), S(18), S(18), S(18)],
            [S(20), S(20), S(21), S(18), S(17), S(18)],
            [S(14), S(14), S(14), S(17), S(17), S(17)],
            [S(28), S(14), S(12), S(17), S(27), S(26)],
            [S(28), S(28), S(12), S(12), S(27), S(26)],
            [S(23), S(23), S(23), S(27), S(27), S(26)],
        ]),
        anchoredCells: [{ x: 3, y: 0 }, { x: 4, y: 1 }],
    },
    // MEDIUM 6x6  10 pieces (8 loose)  10/36 cells locked (28%)  6 packings with anchors applied
    {
        id: 'anchored-36',
        index: 414,
        name: 'Iron Seam',
        hint: 'Two anchors are fixed. Fill what is left between them.',
        grid: fromRows([
            [S(19), S(26), S(26), S(26), S(10), S(10)],
            [S(19), S(26), S(26), S(24), S(24), S(10)],
            [S(19), S(19), S(19), S(19), S(24), S( 7)],
            [S(12), S(14), S(14), S(14), S(14), S( 7)],
            [S(12), S(23), S(17), S(17), S(17), S(17)],
            [S(12), S(23), S(23), S(23), S(28), S(28)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 1, y: 3 }],
    },
    // HARD   6x6  10 pieces (7 loose)  10/36 cells locked (28%)  2 packings with anchors applied
    {
        id: 'anchored-37',
        index: 424,
        name: 'Fixed Order',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(25), S(25), S(25), S(25), S(16), S(16)],
            [S(10), S(17), S(25), S(19), S(16), S(16)],
            [S(10), S(17), S(17), S(19), S(16), S(16)],
            [S(13), S(13), S(27), S(19), S(19), S(22)],
            [S(20), S(13), S(27), S(27), S(22), S(22)],
            [S(20), S(20), S(23), S(23), S(23), S(23)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 4 }],
    },
    // MEDIUM 6x6  10 pieces (7 loose)  10/36 cells locked (28%)  5 packings with anchors applied
    {
        id: 'anchored-38',
        index: 434,
        name: 'Bedrock',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(28), S(14), S(14), S(14), S(11), S(11)],
            [S(28), S(14), S(17), S(17), S(11), S(11)],
            [S(28), S(28), S(17), S(17), S(17), S(11)],
            [S(25), S(25), S(25), S(10), S(22), S(22)],
            [S(16), S(16), S(10), S(10), S(22), S(22)],
            [S(16), S(13), S(13), S(13), S( 8), S( 8)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 3, y: 3 }],
    },
    // HARD   6x6  10 pieces (7 loose)  10/36 cells locked (28%)  2 packings with anchors applied
    {
        id: 'anchored-39',
        index: 444,
        name: 'The Only Route',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(17), S(17), S(14), S(14), S(27), S(27)],
            [S(28), S(17), S(14), S(14), S(21), S(27)],
            [S(28), S(17), S(20), S(20), S(21), S(21)],
            [S(28), S(13), S(29), S(20), S(22), S(22)],
            [S(13), S(13), S(29), S(20), S(19), S(22)],
            [S(13), S(13), S(29), S(19), S(19), S(22)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 1 }],
    },
    // MEDIUM 6x6  10 pieces (7 loose)  10/36 cells locked (28%)  4 packings with anchors applied
    {
        id: 'anchored-40',
        index: 454,
        name: 'Pinned',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(21), S(21), S(10), S(10), S(29), S(29)],
            [S(22), S(21), S(21), S(10), S(11), S(29)],
            [S(22), S(20), S(20), S(11), S(11), S(27)],
            [S(22), S(20), S(20), S(14), S(14), S(27)],
            [S(22), S(19), S(19), S(14), S(24), S(27)],
            [S(22), S(19), S(19), S(14), S(24), S(24)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 2 }],
    },
    // HARD   6x6  10 pieces (7 loose)  10/36 cells locked (28%)  1 packing with anchors applied
    {
        id: 'anchored-41',
        index: 464,
        name: 'Stone Lattice',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(25), S(25), S(25), S(16), S(16), S(16)],
            [S(28), S(28), S(28), S(22), S( 7), S( 7)],
            [S(13), S(13), S(13), S(22), S( 7), S(10)],
            [S(13), S(22), S(22), S(22), S(10), S(10)],
            [S(27), S(24), S(24), S(24), S(10), S(19)],
            [S(27), S(27), S(27), S(24), S(19), S(19)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 2 }],
    },
    // MEDIUM 6x6  10 pieces (7 loose)  12/36 cells locked (33%)  3 packings with anchors applied
    {
        id: 'anchored-42',
        index: 484,
        name: 'Close Weave',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(10), S(10), S(17), S(17), S(27), S(23)],
            [S( 9), S(10), S(10), S(17), S(27), S(23)],
            [S( 9), S( 9), S(11), S(11), S(27), S(22)],
            [S( 9), S(11), S(11), S(11), S(22), S(22)],
            [S(14), S(14), S(29), S(29), S( 8), S( 8)],
            [S(14), S(14), S(14), S(29), S( 8), S( 8)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }],
    },
    // HARD   6x6  10 pieces (7 loose)  12/36 cells locked (33%)  2 packings with anchors applied
    {
        id: 'anchored-43',
        index: 494,
        name: 'Narrow Margin',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(13), S(13), S(21), S(21), S(10), S(10)],
            [S(13), S(13), S(16), S(21), S(21), S(10)],
            [S(16), S(16), S(16), S(16), S(25), S(25)],
            [S(17), S(17), S(17), S(17), S(25), S(25)],
            [S(27), S(18), S(18), S(18), S(28), S(28)],
            [S(27), S(27), S(29), S(29), S(28), S(28)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 4 }],
    },
    // MEDIUM 6x6  10 pieces (7 loose)  12/36 cells locked (33%)  3 packings with anchors applied
    {
        id: 'anchored-44',
        index: 504,
        name: 'Riveted',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(19), S(19), S(19), S(27), S(27), S( 9)],
            [S(19), S(12), S(27), S(27), S(27), S( 9)],
            [S(14), S(12), S(26), S(26), S( 9), S( 9)],
            [S(14), S(12), S(26), S(10), S(10), S( 9)],
            [S( 7), S(12), S(26), S(10), S(10), S(18)],
            [S( 7), S( 7), S(24), S(24), S(18), S(18)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }],
    },
    // HARD   6x6  10 pieces (7 loose)  12/36 cells locked (33%)  2 packings with anchors applied
    {
        id: 'anchored-45',
        index: 514,
        name: 'Last Certainty',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(22), S(27), S(18), S(18), S(18), S(29)],
            [S(22), S(27), S(19), S(19), S(19), S(29)],
            [S(22), S(27), S(17), S(17), S(26), S(29)],
            [S(22), S(27), S(17), S(26), S(26), S(26)],
            [S(23), S(23), S(17), S( 8), S( 8), S(21)],
            [S(23), S(23), S(23), S( 8), S( 8), S(21)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 4 }],
    },
    // MEDIUM 6x6  10 pieces (7 loose)  12/36 cells locked (33%)  6 packings with anchors applied
    {
        id: 'anchored-46',
        index: 524,
        name: 'Anchor Deep',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(29), S(29), S(22), S(22), S( 9), S( 9)],
            [S(29), S(29), S(22), S(22), S(21), S( 9)],
            [S(10), S(10), S(23), S(21), S(21), S(21)],
            [S(10), S(10), S(23), S(12), S(12), S(14)],
            [S(24), S(24), S(23), S(27), S(12), S(14)],
            [S(24), S(24), S(23), S(27), S(27), S(14)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
    },
    // MEDIUM 6x6  10 pieces (7 loose)  12/36 cells locked (33%)  4 packings with anchors applied
    {
        id: 'anchored-47',
        index: 534,
        name: 'The Tight End',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(21), S(21), S(26), S(10), S(25), S(25)],
            [S(16), S(16), S(26), S(10), S(17), S(17)],
            [S(19), S(16), S(26), S(10), S(17), S(17)],
            [S(19), S(22), S(12), S(10), S(10), S(17)],
            [S(19), S(22), S(12), S(14), S(14), S(14)],
            [S(22), S(22), S(12), S(12), S(14), S(14)],
        ]),
        anchoredCells: [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 3 }],
    },
    // HARD   6x6  10 pieces (7 loose)  12/36 cells locked (33%)  2 packings with anchors applied
    {
        id: 'anchored-48',
        index: 544,
        name: 'Foundation Stone',
        hint: 'Three anchors. Very little room to be wrong.',
        grid: fromRows([
            [S(19), S(19), S(16), S( 7), S( 7), S( 9)],
            [S(19), S(19), S(16), S(16), S( 7), S( 9)],
            [S(10), S(10), S(16), S(22), S( 7), S( 9)],
            [S(10), S(10), S(22), S(22), S(27), S(27)],
            [S(29), S(29), S(22), S(11), S(27), S(12)],
            [S(29), S(29), S(11), S(11), S(12), S(12)],
        ]),
        anchoredCells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
    },
];

export default ANCHORED_LEVELS;
