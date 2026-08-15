/**
 * SnapBlocks — Web stage scaling
 *
 * The whole game lives in one fixed logical coordinate space (400 × 700, declared
 * in js/state.js): the canvas draws in it and every DOM screen in ui/screens.js is
 * written against it, perfectly overlaid. On a phone that space is roughly the
 * viewport, so css/layout.css can just pin #sb-stage to it. In a desktop browser
 * the same pin leaves a phone-shaped box marooned in a large empty page.
 *
 * The fix has to be a uniform *scale*, not a fluid layout — canvas and DOM must be
 * multiplied by the same number or they stop overlaying. CSS cannot divide one
 * length by another to yield a unitless factor, so that number is computed here
 * and published as --sb-stage-scale for css/layout.css to consume via
 * `transform: scale(...)`.
 *
 * Android is untouched: every path below no-ops unless <html> carries a
 * data-platform that is not "android" (stamped by js/platform/index.js). See
 * isWeb() for why the test is phrased that way rather than as === 'web'.
 *
 * Why a CSS transform is safe for dragging — this is the part that would make the
 * game unplayable if it were wrong. js/input.js maps pointer events like this:
 *
 *     const b = element.getBoundingClientRect();
 *     const scaleX = element.width / b.width;   // 400 / on-screen width
 *     x = Math.floor((px - b.left) * scaleX);
 *
 * getBoundingClientRect() reports the *transformed* box, so b.width and b.left
 * already include any ancestor scale, and dividing by them lands back in logical
 * 400 × 700 space at any scale. Raw offsetX/offsetY would NOT survive this; the
 * rect-based mapping does. js/game.js's refreshSize() is likewise safe: it reads
 * stage.clientWidth/clientHeight, which are layout values a transform does not
 * touch, so the stage keeps reporting 400 × 700 and the canvas keeps its 1:1 fit.
 */

import state from '../state.js?v=3bd14eb0045c';
import { CRAZYGAMES_LANDSCAPE } from '../platform/runtime.js?v=3bd14eb0045c';
// Side-effect import, and load-bearing: isWeb() reads the data-platform stamp
// that js/platform/index.js writes on evaluation, and an absent stamp reads as
// "not a browser". Declaring the dependency here means the module graph
// guarantees the stamp exists before this file runs, instead of it happening to
// work because of the import order in js/game.js. Built web bundles also
// pre-stamp the attribute in index.html (scripts/build-web.mjs) to avoid a
// frame of unscaled paint; this covers running from source, where nothing does.
import '../platform/index.js?v=3bd14eb0045c';

const PORTRAIT_W = 400;
const PORTRAIT_H = 700;

/**
 * A 4K monitor would otherwise render a 400 × 700 phone at ~2.9×, which reads as
 * a novelty rather than a game. 1.5× (600 × 1050) is about as large as the layout
 * stays comfortable, and it is also as far as the canvas upscales cleanly — its
 * backing store is a fixed 400 × 700 bitmap, so every step beyond 1× is
 * interpolation. With the gutter below in play a 1080p desktop lands near 1.21×
 * (1.41× if the window is genuinely 1080 tall), so the cap only binds from about
 * a 1150px-tall viewport upward — 1440p and 4K.
 */
const MAX_SCALE = 1.5;

/**
 * Breathing room reserved around the framed stage, as a share of the SURPLUS in
 * each axis rather than as a flat margin.
 *
 * #sb-stage is presented as an object: a 28px radius and a
 * `0 48px 120px -36px` drop shadow (css/layout.css). Fitting to the raw
 * container box makes the binding axis exactly flush, so at 1440x900 the stage
 * measured 514.4 x 900.2 inside a 900px window — the whole shadow off-screen and
 * the rounded corners butting the window edge.
 *
 * A flat margin is the wrong instrument. At 390x844 the stage is width-bound and
 * *correctly* flush left-to-right: a phone should fill its screen, and
 * subtracting a fixed gutter there would shrink the game to make room for
 * scenery nobody can see. So the reserve is a fraction of how much the axis
 * exceeds the logical 400 x 700 instead. An axis with no surplus — any phone,
 * any window smaller than the logical space — gives back nothing and behaves
 * exactly as it does today; past 1:1 the stage grows at half the rate the
 * viewport does, so the margin ramps in continuously from zero instead of
 * snapping on at a breakpoint and jolting the layout.
 *
 * The cap is what keeps MAX_SCALE reachable. Unbounded, half of a 4K surplus
 * would hold the stage near 1.27x forever. 96px total is 48px per side — the
 * shadow's own y-offset, i.e. the distance at which it is densest — and leaves
 * 1.5x attainable from a viewport around 1150px tall.
 */
const GUTTER_SHARE = 0.5;
const MAX_GUTTER = 96;

const fitAxis = (avail, logical) => {
    const surplus = avail - logical;
    if (surplus <= 0) return avail;
    return avail - Math.min(surplus * GUTTER_SHARE, MAX_GUTTER);
};

const root = document.documentElement;

let lastScale = -1;
let lastSizeKey = '';
let frame = 0;

const logicalSize = () => {
    return CRAZYGAMES_LANDSCAPE
        ? { w: state.CANVAS_W, h: state.CANVAS_H }
        : { w: PORTRAIT_W, h: PORTRAIT_H };
};

/**
 * Mirrors the selector css/layout.css uses, and for the same two reasons:
 * js/platform/index.js stamps whatever window.__SNAPBLOCKS_PLATFORM__ says, so a
 * portal build is legitimately 'crazygames' or 'poki' rather than 'web' — every
 * one of them a browser that wants scaling. And an *absent* attribute means that
 * module has not evaluated yet, which must read as "not a browser" so Android
 * can never be scaled during boot.
 */
const isWeb = () => {
    const p = root.dataset.platform;
    return !!p && p !== 'android';
};

// Mobile CrazyGames keeps the portal capability set, but deliberately uses the
// responsive portrait shell (data-platform="web"). That shell is full-viewport
// like Android and must not inherit the desktop web stage transform or its
// letterbox offset. The canvas performs its own uniform fit within the stage.
const isFluidPortalMobile = () => (
    root.dataset.hostPlatform === 'crazygames'
    && root.dataset.platform === 'web'
);

const measure = () => {
    // #game-container is position:fixed inset:0 height:100dvh, so its content box
    // already tracks whatever the browser currently calls "available" — including
    // iOS Safari's collapsing toolbar. Reading it beats window.innerHeight, which
    // disagrees with dvh while that toolbar is in motion.
    const box = document.getElementById('game-container');
    if (box && box.clientWidth > 0 && box.clientHeight > 0) {
        return { w: box.clientWidth, h: box.clientHeight };
    }
    const logical = logicalSize();
    return { w: window.innerWidth || logical.w, h: window.innerHeight || logical.h };
};

const apply = () => {
    if (!isWeb()) return;

    if (isFluidPortalMobile()) {
        lastScale = 1;
        lastSizeKey = 'fluid-portal-mobile';
        root.style.setProperty('--sb-stage-scale', '1');
        root.style.setProperty('--sb-stage-frame-bottom', '0px');
        return;
    }

    const { w, h } = measure();
    const logical = logicalSize();
    const raw = Math.min(
        fitAxis(w, logical.w) / logical.w,
        fitAxis(h, logical.h) / logical.h,
        MAX_SCALE,
    );
    // Quantised to 3dp so a one-pixel resize jitter does not force the browser to
    // re-rasterise every text layer in the stage. Guarded above 0 so a hidden or
    // not-yet-laid-out container can never collapse the stage to nothing.
    const scale = Math.max(0.1, Math.round(raw * 1000) / 1000);
    const sizeKey = `${logical.w}x${logical.h}`;
    if (sizeKey === lastSizeKey && Math.abs(scale - lastScale) < 0.002) return;
    lastScale = scale;
    lastSizeKey = sizeKey;

    root.style.setProperty('--sb-stage-scale', String(scale));
    // Distance from the bottom of the available box to the bottom of the scaled
    // stage. Body-level chrome that is fixed to the viewport (the .sb-toast in
    // ui/index.js) uses this to sit inside the frame instead of below it.
    const gap = Math.max(0, Math.round((h - logical.h * scale) / 2));
    root.style.setProperty('--sb-stage-frame-bottom', `${gap}px`);
};

const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; apply(); });
};

// Primary signal: the container's own box changing covers resize, orientation,
// and the dvh shifts a mobile browser makes when its toolbar slides away —
// several of which do not reliably fire a window resize event.
const box = document.getElementById('game-container');
if (box && typeof ResizeObserver === 'function') {
    new ResizeObserver(schedule).observe(box);
}
window.addEventListener('resize', schedule);
window.addEventListener('orientationchange', schedule);
// Navigation must update synchronously; otherwise the first frame after a
// screen change briefly uses the previous scale and visibly jumps.
document.addEventListener('snapblocks:screen-changed', apply);
if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);

// Run now for the common case, then again on the next frame. This module may be
// imported before js/platform/index.js has stamped data-platform on <html>, and
// by the first animation frame the whole module graph has finished evaluating —
// so the rAF pass is what actually guarantees we see the final platform value.
apply();
schedule();
