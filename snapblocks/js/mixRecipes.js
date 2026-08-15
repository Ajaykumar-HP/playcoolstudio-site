/**
 * Prism Mix recipes — color combinations that trigger a "mix" event when
 * two base-coloured piece facets share a single cell.
 *
 * Detection is engine-additive: pieces still snap by geometry, and the
 * tangram fundamentals are untouched. After a successful piece placement
 * we scan the cells the piece covered. If a cell is now fully filled and
 * its facet colours match a recipe's base pair, the cell "mixes" — the
 * UI animates a colour morph + plays a sound + awards bonus score.
 *
 * Color indices reference GAME_COLORS in levels.js:
 *   1 = coral / red, 2 = butter / yellow, 4 = sky / blue
 */

// Each recipe matches when a fully-filled cell's unique non-zero facet
// colours exactly equal `bases`. Order in `bases` doesn't matter.
export const MIX_RECIPES = [
    { id: 'green',  bases: [2, 4], targetHex: '#18a96f', name: 'Green',  bonus: 500 },
    { id: 'purple', bases: [4, 1], targetHex: '#8257d6', name: 'Purple', bonus: 500 },
    { id: 'orange', bases: [1, 2], targetHex: '#f48a40', name: 'Orange', bonus: 500 },
];

const recipeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
const RECIPE_BY_PAIR = new Map(MIX_RECIPES.map(r => [recipeKey(r.bases[0], r.bases[1]), r]));

/**
 * Return the recipe whose base pair matches `cellFacets` exactly, or null.
 * `cellFacets` is the 4-facet array [top, left, right, bottom] for one cell.
 * A cell qualifies only when:
 *   - All 4 facets are non-zero (cell is fully filled).
 *   - The set of unique facet colors has exactly 2 entries.
 *   - Those 2 colors are the bases of a registered recipe.
 */
export const findRecipeForCell = (cellFacets) => {
    if (!cellFacets) return null;
    if (cellFacets.some(c => !c)) return null;
    const unique = [...new Set(cellFacets)];
    if (unique.length !== 2) return null;
    return RECIPE_BY_PAIR.get(recipeKey(unique[0], unique[1])) || null;
};

export const MIX_BONUS = 500;
