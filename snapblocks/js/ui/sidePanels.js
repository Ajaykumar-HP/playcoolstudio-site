/**
 * SnapBlocks — Desktop gutter panels (browser build only)
 *
 * The game is one fixed 400 × 700 portrait space and stays that way. On a
 * desktop that leaves a lot of backdrop: at 1440 × 900 the scaled stage is
 * ~460px wide and centred, so ~490px of each side is empty. Read as a page,
 * that is a phone marooned in a void rather than a designed game page — the
 * thing every portrait game on a portal solves by putting real content in the
 * gutters. This module is that content.
 *
 * WHY THE PANELS LIVE OUTSIDE #sb-stage
 * Dragging survives the stage's CSS scale because js/input.js maps pointers
 * through getBoundingClientRect(), which reports the transformed box. Anything
 * that moved or resized the stage would move that box, so the panels must be
 * provably unable to. They are appended to #game-container as siblings of the
 * stage and positioned `absolute`, which takes them out of that flex container's
 * flow entirely: the stage remains the only in-flow child, so its layout is
 * byte-for-byte what it was before. They are also outside #sb-ui-root, so the
 * delegated click handler in ui/index.js (which tests `root.contains(target)`)
 * never even sees them.
 *
 * WHY THEY ANCHOR TO THE STAGE, NOT TO THE PAGE EDGE
 * The gutter width is a function of the live --sb-stage-scale, so a panel pinned
 * to the window edge would drift toward or away from the frame as the window
 * resizes. css/layout.css instead derives the panel's x from the stage's own
 * visual half-width (200px × the published scale), which keeps the gap to the
 * frame constant at every size. That is CSS-only; nothing here measures layout.
 *
 * WHY THE PROGRESS BLOCK REFRESHES ONLY ON SCREEN CHANGE
 * A second live copy of the HUD is worse than no panel — it drifts. So the only
 * state shown is state that cannot change without a screen transition: levels
 * cleared, stars, and the active chapter all move at a level clear, which always
 * navigates. ui/index.js calls refreshSidePanels() from showBase(); there is no
 * timer, no observer, and nothing here reads state during play.
 */

import { GAME_COLORS } from '../levels.js?v=3bd14eb0045c';
import { MIX_RECIPES } from '../mixRecipes.js?v=3bd14eb0045c';
import { activeChapter, chapterCount, placeName } from '../chapters.js?v=3bd14eb0045c';
import { levelsCleared, totalStars } from '../progression.js?v=3bd14eb0045c';
import { menuAppLogo, wordmark } from './logo.js?v=3bd14eb0045c';
// Side-effect import for the same reason stageScale.js declares it: isWeb()
// reads the data-platform stamp js/platform/index.js writes on evaluation, and
// an absent stamp must read as "not a browser" so Android can never grow chrome
// it has no room for.
import '../platform/index.js?v=3bd14eb0045c';

const root = document.documentElement;

/**
 * Mirrors css/layout.css and js/ui/stageScale.js: a portal build is stamped
 * 'crazygames' or 'poki' rather than 'web', and an absent attribute means the
 * platform module has not evaluated yet — which must read as Android.
 */
const isWeb = () => {
    const p = root.dataset.platform;
    return !!p && p !== 'android';
};

// GAME_COLORS is the canvas piece palette and is deliberately theme-independent
// (js/levels.js), so the mix chips use those hexes rather than css/tokens.css
// accents: the chip has to be the colour the player will actually pick up off
// the tray, not a themed approximation of it. MIX_RECIPES.targetHex is likewise
// the exact colour a mixed cell morphs to on the board.
const BASE_NAME = { 1: 'Red', 2: 'Yellow', 4: 'Blue' };
const chip = hex => `<i class="sb-side-chip" style="background:${hex}"></i>`;

const mixRow = (recipe) => {
    const [a, b] = recipe.bases;
    return `
        <li>
            ${chip(GAME_COLORS[a - 1])}<span class="sb-side-op">+</span>${chip(GAME_COLORS[b - 1])}<span class="sb-side-op">=</span>${chip(recipe.targetHex)}
            <span class="sb-side-mix-label">${recipe.name}</span>
            <span class="sb-visually-hidden">${BASE_NAME[a]} plus ${BASE_NAME[b]} makes ${recipe.name}</span>
        </li>`;
};

const brandPanel = () => `
    <div class="sb-side-inner">
        <div class="sb-side-brand">
            ${menuAppLogo(46)}
            ${wordmark()}
        </div>
        <p class="sb-side-tagline">A calm colour-mixing tangram puzzle. Fit every piece, mix the colours, and bring a faded world back to life.</p>
        <div class="sb-side-block">
            <h2 class="sb-side-title">Prism Mix</h2>
            <p class="sb-side-note">Land two colours in one cell and they become a third.</p>
            <ul class="sb-side-mixes">${MIX_RECIPES.map(mixRow).join('')}</ul>
        </div>
    </div>
`;

const playPanel = () => `
    <div class="sb-side-inner">
        <h2 class="sb-side-title">How to play</h2>
        <ol class="sb-side-steps">
            <li><b>1</b><span>Drag a piece out of the tray and onto the board.</span></li>
            <li><b>2</b><span>It snaps when it lines up. Drag it back to the tray to take it out again.</span></li>
            <li><b>3</b><span>Fill every facet to solve the puzzle — clear ten and a place is restored.</span></li>
        </ol>
        <div class="sb-side-block">
            <h2 class="sb-side-title">Your progress</h2>
            <div class="sb-side-stats">
                <div><b data-side-stat="cleared">0</b><span>levels cleared</span></div>
                <div><b data-side-stat="stars">0</b><span>stars earned</span></div>
            </div>
            <p class="sb-side-note" data-side-stat="chapter"></p>
        </div>
    </div>
`;

let panelsEl = null;

const setStat = (key, value) => {
    if (!panelsEl) return;
    const node = panelsEl.querySelector(`[data-side-stat="${key}"]`);
    if (node) node.textContent = value;
};

export const refreshSidePanels = () => {
    if (!panelsEl) return;
    const ch = activeChapter();
    setStat('cleared', String(levelsCleared()));
    setStat('stars', String(totalStars()));
    setStat('chapter', `Chapter ${ch + 1} of ${chapterCount()} · ${placeName(ch)}`);
};

const build = () => {
    const container = document.getElementById('game-container');
    const stage = document.getElementById('sb-stage');
    if (!container || !stage) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <aside class="sb-side-panel sb-side-panel--brand">${brandPanel()}</aside>
        <aside class="sb-side-panel sb-side-panel--play">${playPanel()}</aside>
    `;
    // Inserted BEFORE the stage so the stage's own cast shadow paints over the
    // panels' outer edge rather than under it. They never overlap the frame, but
    // the shadow's 120px blur reaches into the gutter and should read as the
    // stage sitting in front.
    [...wrap.children].forEach(node => container.insertBefore(node, stage));
    panelsEl = container;

    refreshSidePanels();
};

if (isWeb()) build();
