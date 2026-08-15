/**
 * chapters.js — the "Faded World" progression spine.
 *
 * Chapters are DERIVED from the level index (never hand-listed), so this scales
 * to thousands of levels for free. Every CHAPTER_SIZE levels form one chapter;
 * completing a chapter restores one storybook PLACE — a procedurally generated
 * scene that heals from grey to full color and joins the player's world map.
 *
 *   chapter c  ==  levels [c*SIZE .. c*SIZE+SIZE-1]
 *   chapter c restored  ==  config.unlocked >= (c+1)*SIZE   (all its levels cleared)
 *
 * Places scale via a seeded scene generator (sceneSVG) — no per-place art needed.
 * Lands group every 10 chapters under a shared palette for visual cohesion.
 */
import { CHAPTER_SIZE, LEVELS, PLACE_SEEDS } from './levels.js?v=5071259f5c9c';
import state from './state.js?v=5071259f5c9c';

export const SIZE = CHAPTER_SIZE;
export const chapterCount = () => Math.ceil(LEVELS.length / SIZE);
export const chapterOf = (levelIdx) => Math.floor(levelIdx / SIZE);
export const chapterStart = (ch) => ch * SIZE;
export const chapterEnd = (ch) => Math.min(LEVELS.length, ch * SIZE + SIZE) - 1;
export const levelsInChapter = (ch) => LEVELS.slice(ch * SIZE, ch * SIZE + SIZE);

/** Number of levels cleared = config.unlocked (index of the next level to play). */
export const clearedCount = () => Math.max(0, state.config.unlocked || 0);
export const isChapterRestored = (ch) => clearedCount() >= (ch + 1) * SIZE;
/** The chapter the player is currently working through. */
export const activeChapter = () => Math.min(chapterCount() - 1, chapterOf(clearedCount()));
/** 0..1 progress within the active (or given) chapter. */
export const chapterProgress = (ch = activeChapter()) =>
    Math.max(0, Math.min(SIZE, clearedCount() - ch * SIZE)) / SIZE;
/** Total places restored so far. */
export const restoredPlaces = () => Math.floor(clearedCount() / SIZE);

// ----- lands (every 10 chapters share a palette + name) -----------------
const LANDS = [
    { name: 'The Lantern Coast', sky: ['#bfe3f6', '#eaf6fb'], ground: '#3f9d5a', far: '#7bbf8a', water: '#2f9bd6', accent: '#ffd34e', dusk: false },
    { name: 'Amberwood',         sky: ['#fbe0b8', '#fff4e2'], ground: '#c8843a', far: '#e0a85a', water: '#3f9d8a', accent: '#e2604f', dusk: false },
    { name: 'The Glasslands',    sky: ['#d8e9f2', '#f4fafd'], ground: '#5aa6a0', far: '#8fc7c0', water: '#4aa6c8', accent: '#8257d6', dusk: false },
    { name: 'Tidewatch',         sky: ['#acd6ea', '#e6f4fa'], ground: '#3f8d9d', far: '#73b6c2', water: '#1f78b4', accent: '#ffd34e', dusk: false },
    { name: 'Emberfell',         sky: ['#f6c9a8', '#ffe9d6'], ground: '#a85a3a', far: '#d08858', water: '#c25a3a', accent: '#ecc957', dusk: true  },
    { name: 'Hollowmere',        sky: ['#cdd6ee', '#eef1fb'], ground: '#5a7a6a', far: '#86a795', water: '#3a6a8a', accent: '#a17bea', dusk: true  },
    { name: 'Sunspire',          sky: ['#ffe6a8', '#fff7e0'], ground: '#4f9d5a', far: '#8fc78a', water: '#369bd2', accent: '#e2604f', dusk: false },
    { name: 'The Frostreach',    sky: ['#dceaf4', '#f6fbff'], ground: '#8aa6b0', far: '#b6cdd6', water: '#6aa6c8', accent: '#a17bea', dusk: false },
    { name: 'Verdant Wilds',     sky: ['#cfeecb', '#eefbe9'], ground: '#2f8d4a', far: '#6abf7a', water: '#2f9bd6', accent: '#ffd34e', dusk: false },
    { name: 'Dawnmark',          sky: ['#f6d6e0', '#fff0f4'], ground: '#9d5a7a', far: '#c78aa5', water: '#8257d6', accent: '#ecc957', dusk: true  },
];
export const landOf = (ch) => LANDS[Math.floor(ch / 10) % LANDS.length];
export const landName = (ch) => landOf(ch).name;

// ----- place names (seeded, storybook flavor) ---------------------------
const ADJ = ['Amber', 'Misty', 'Golden', 'Quiet', 'Hidden', 'Silver', 'Sunlit', 'Dawn', 'Twilight', 'Crimson',
    'Azure', 'Verdant', 'Frosted', 'Wild', 'Lantern', 'Echo', 'Whisper', 'Driftwood', 'Mossy', 'Coral',
    'Hollow', 'Gilded', 'Dusk', 'Pale', 'Bright', 'Still', 'Wandering', 'Ember', 'Glass', 'Fern'];
const NOUN = ['Path', 'Hollow', 'Harbor', 'Meadow', 'Vale', 'Ridge', 'Glen', 'Cove', 'Grove', 'Bluff',
    'Reach', 'Springs', 'Cliffs', 'Marsh', 'Dunes', 'Falls', 'Bay', 'Fields', 'Thicket', 'Crossing'];
export const placeName = (ch) => {
    const s = PLACE_SEEDS[ch] >>> 0;
    // >>> keeps the shifted seed unsigned — `>>` goes negative for seeds with
    // the high bit set, which indexed NOUN[-k] and produced "undefined" names.
    return `${ADJ[s % ADJ.length]} ${NOUN[(s >>> 9) % NOUN.length]}`;
};

// ----- seeded RNG for scene composition ---------------------------------
const rngFrom = (seed) => {
    let x = (seed >>> 0) || 1;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
};

/**
 * Procedurally compose a clean, flat storybook scene as an SVG string.
 * Deterministic per chapter seed; palette comes from the land for cohesion.
 * The markup is wrapped so callers can toggle `faded` (grey) / `lit` (color).
 */
export const sceneSVG = (ch) => {
    const seed = (PLACE_SEEDS[ch] ^ 0x9e3779b9) >>> 0;
    const r = rngFrom(seed);
    const land = landOf(ch);
    const W = 440, H = 280;
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const between = (a, b) => a + r() * (b - a);

    // Each element is tagged with a restoration stage so a chapter can heal in
    // three acts that match the colors the player mixes:
    //   s1 — the GREEN land (hills, ground, trees)   → restored by level 3
    //   s2 — the BLUE sky & water (sky, mountains, water, clouds) → by level 6
    //   s3 — WARM life (sun, flowers, birds)          → by level 10
    const parts = [];
    // sky (s2 — blue)
    parts.push(`<rect class="rg s2" x="0" y="0" width="${W}" height="${H}" fill="url(#sky${ch})"/>`);
    // drifting clouds (s2, animated)
    const cloudN = 1 + Math.floor(r() * 2);
    for (let i = 0; i < cloudN; i++) {
        const cx = between(40, W - 60), cy = between(40, 110), cw = between(40, 70);
        parts.push(`<g class="rg s2 sc-cloud" style="--cd:${(i * 2.5).toFixed(1)}s"><ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${cw.toFixed(0)}" ry="${(cw * 0.4).toFixed(0)}" fill="#ffffff" opacity="0.7"/><ellipse cx="${(cx + cw * 0.5).toFixed(0)}" cy="${(cy - 6).toFixed(0)}" rx="${(cw * 0.5).toFixed(0)}" ry="${(cw * 0.34).toFixed(0)}" fill="#ffffff" opacity="0.7"/></g>`);
    }
    // stars in dusk skies (s2 — return with the sky)
    if (land.dusk) {
        const starN = 5 + Math.floor(r() * 5);
        for (let i = 0; i < starN; i++) {
            const sx = between(16, W - 16), sy = between(14, H * 0.4);
            parts.push(`<circle class="rg s2 sc-star" style="--sd:${(i * 0.7).toFixed(1)}s" cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" r="${between(1, 2.2).toFixed(1)}" fill="#fffaf0" opacity="0.9"/>`);
        }
    }
    // sun / moon with a soft halo (s3 — warm)
    const orbX = between(60, 380), orbY = between(36, 96), orbR = between(26, 40);
    const orbFill = land.dusk ? '#fdf3df' : land.accent;
    parts.push(`<circle class="rg s3 sc-halo" cx="${orbX.toFixed(0)}" cy="${orbY.toFixed(0)}" r="${(orbR * 1.9).toFixed(0)}" fill="${orbFill}" opacity="0.22"/>`);
    parts.push(`<circle class="rg s3 sc-sun" cx="${orbX.toFixed(0)}" cy="${orbY.toFixed(0)}" r="${orbR.toFixed(0)}" fill="${orbFill}" opacity="${land.dusk ? '0.92' : '1'}"/>`);
    // distant mountains with snow caps (optional, s2 — distant/blue)
    if (r() < 0.55) {
        const pts = [{ x: -20, y: H * 0.62 }];
        let x = -20;
        while (x < W + 20) { const px = x + between(50, 90); const py = between(H * 0.34, H * 0.5); pts.push({ x: px, y: py }); x = px; }
        pts.push({ x: W + 20, y: H * 0.62 });
        const d = `M${pts.map(p => `${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join(' L')} Z`;
        parts.push(`<path class="rg s2" d="${d}" fill="${land.far}" opacity="0.7"/>`);
        // snow caps on the two tallest interior peaks
        const peaks = pts.slice(1, -1).sort((a, b) => a.y - b.y).slice(0, 2);
        peaks.forEach(p => {
            parts.push(`<path class="rg s2" d="M${(p.x - 14).toFixed(0)} ${(p.y + 12).toFixed(0)} L${p.x.toFixed(0)} ${p.y.toFixed(0)} L${(p.x + 14).toFixed(0)} ${(p.y + 12).toFixed(0)} Q${p.x.toFixed(0)} ${(p.y + 7).toFixed(0)} ${(p.x - 14).toFixed(0)} ${(p.y + 12).toFixed(0)} Z" fill="#ffffff" opacity="0.85"/>`);
        });
    }
    // rolling far hill (s1 — green land)
    const h1 = between(H * 0.52, H * 0.6);
    parts.push(`<path class="rg s1" d="M0 ${h1.toFixed(0)} Q${(W * 0.3).toFixed(0)} ${(h1 - between(20, 50)).toFixed(0)} ${(W * 0.55).toFixed(0)} ${h1.toFixed(0)} T${W} ${(h1 - 10).toFixed(0)} V${H} H0 Z" fill="${land.far}"/>`);
    // near ground (s1 — green land)
    const h2 = between(H * 0.66, H * 0.74);
    parts.push(`<path class="rg s1" d="M0 ${h2.toFixed(0)} Q${(W * 0.5).toFixed(0)} ${(h2 - between(20, 44)).toFixed(0)} ${W} ${(h2 + 8).toFixed(0)} V${H} H0 Z" fill="${land.ground}"/>`);
    // water / river (optional, s2 — blue, animated shimmer) + a bobbing boat
    if (r() < 0.6) {
        const rx = between(W * 0.25, W * 0.7);
        parts.push(`<path class="rg s2 sc-water" d="M${rx.toFixed(0)} ${H} Q${(rx + 18).toFixed(0)} ${(h2 + 24).toFixed(0)} ${(rx - 6).toFixed(0)} ${h2.toFixed(0)} Q${(rx - 18).toFixed(0)} ${(h2 - 16).toFixed(0)} ${(rx + 22).toFixed(0)} ${(h2 - 30).toFixed(0)} L${(rx + 46).toFixed(0)} ${(h2 - 18).toFixed(0)} Q${(rx + 6).toFixed(0)} ${(h2 + 2).toFixed(0)} ${(rx + 30).toFixed(0)} ${(h2 + 28).toFixed(0)} Q${(rx + 44).toFixed(0)} ${H} ${(rx + 20).toFixed(0)} ${H} Z" fill="${land.water}" opacity="0.92"/>`);
        if (r() < 0.5) {
            const bx = rx + 14, by = h2 + 14;
            parts.push(`<g class="rg s2 sc-boat"><path d="M${(bx - 12).toFixed(0)} ${by.toFixed(0)} L${(bx + 12).toFixed(0)} ${by.toFixed(0)} L${(bx + 7).toFixed(0)} ${(by + 7).toFixed(0)} L${(bx - 7).toFixed(0)} ${(by + 7).toFixed(0)} Z" fill="#7a4a25"/><line x1="${bx.toFixed(0)}" y1="${by.toFixed(0)}" x2="${bx.toFixed(0)}" y2="${(by - 14).toFixed(0)}" stroke="#7a4a25" stroke-width="2"/><path d="M${bx.toFixed(0)} ${(by - 14).toFixed(0)} L${(bx + 10).toFixed(0)} ${(by - 4).toFixed(0)} L${bx.toFixed(0)} ${(by - 4).toFixed(0)} Z" fill="#fff6e8"/></g>`);
        }
    }
    // cottage with a lit window (s3 — warm life comes home)
    if (r() < 0.55) {
        const hx = between(56, W - 80), hy = between(h2 + 6, H - 44);
        parts.push(`<g class="rg s3">
            <rect x="${hx.toFixed(0)}" y="${hy.toFixed(0)}" width="44" height="30" rx="3" fill="#f3e4ce"/>
            <path d="M${(hx - 6).toFixed(0)} ${hy.toFixed(0)} L${(hx + 22).toFixed(0)} ${(hy - 22).toFixed(0)} L${(hx + 50).toFixed(0)} ${hy.toFixed(0)} Z" fill="${land.accent}"/>
            <rect class="sc-window" x="${(hx + 16).toFixed(0)}" y="${(hy + 10).toFixed(0)}" width="12" height="12" rx="2" fill="#ffd34e"/>
        </g>`);
    }
    // trees (1-3, s1 — green life)
    const treeCount = 1 + Math.floor(r() * 3);
    for (let i = 0; i < treeCount; i++) {
        const tx = between(40, W - 40), ty = between(h2 + 2, H - 30);
        const tr = between(16, 28);
        parts.push(`<rect class="rg s1" x="${(tx - 4).toFixed(0)}" y="${ty.toFixed(0)}" width="8" height="${(tr * 1.1).toFixed(0)}" fill="#7a4a25"/>`);
        parts.push(`<circle class="rg s1 sc-tree" style="--td:${(i * 0.6).toFixed(1)}s" cx="${tx.toFixed(0)}" cy="${(ty - tr * 0.3).toFixed(0)}" r="${tr.toFixed(0)}" fill="${i % 2 ? '#18a96f' : '#2bb77d'}"/>`);
    }
    // flowers accent dots (s3 — warm life)
    const dots = 2 + Math.floor(r() * 4);
    const dotColors = ['#e0518a', '#8257d6', '#e07a2a', '#ffd34e'];
    for (let i = 0; i < dots; i++) {
        const dx = between(30, W - 30), dy = between(h2 + 12, H - 14);
        parts.push(`<circle class="rg s3 sc-flower" style="--fd:${(i * 0.4).toFixed(1)}s" cx="${dx.toFixed(0)}" cy="${dy.toFixed(0)}" r="${between(5, 9).toFixed(0)}" fill="${pick(dotColors)}"/>`);
    }
    // birds (optional, s3)
    if (r() < 0.5) {
        for (let i = 0; i < 3; i++) {
            const bx = between(60, W - 60), by = between(50, 120);
            parts.push(`<path class="rg s3" d="M${bx.toFixed(0)} ${by.toFixed(0)} q6 -6 12 0 q6 -6 12 0" stroke="#5a5570" stroke-width="2.5" fill="none" stroke-linecap="round"/>`);
        }
    }
    // fireflies at dusk / butterflies by day (s3 — the place breathes)
    const flyN = 2 + Math.floor(r() * 3);
    for (let i = 0; i < flyN; i++) {
        const fx = between(40, W - 40), fy = between(h2 - 30, H - 24);
        if (land.dusk) {
            parts.push(`<circle class="rg s3 sc-firefly" style="--gd:${(i * 0.8).toFixed(1)}s" cx="${fx.toFixed(0)}" cy="${fy.toFixed(0)}" r="2.4" fill="#ffe28a"/>`);
        } else {
            parts.push(`<g class="rg s3 sc-butterfly" style="--bd:${(i * 0.9).toFixed(1)}s"><ellipse cx="${(fx - 3).toFixed(0)}" cy="${fy.toFixed(0)}" rx="3.5" ry="2.4" fill="${pick(dotColors)}"/><ellipse cx="${(fx + 3).toFixed(0)}" cy="${fy.toFixed(0)}" rx="3.5" ry="2.4" fill="${pick(dotColors)}" opacity="0.8"/></g>`);
        }
    }

    // `meet` keeps the complete generated world visible in wide desktop cards
    // and tall intro panels. `slice` cropped landmarks whenever the container
    // did not share the source scene's 11:7 aspect ratio.
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="sky${ch}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${land.sky[0]}"/><stop offset="1" stop-color="${land.sky[1]}"/>
  </linearGradient></defs>
  ${parts.join('\n  ')}
</svg>`;
};

// ----- restoration stages -----------------------------------------------
// A chapter heals in 3 acts tied to the colors the player mixes. Thresholds
// are in levels-cleared within the chapter (out of SIZE=10).
export const stageFromProgress = (p) => (p >= 1 ? 3 : p >= 0.6 ? 2 : p >= 0.3 ? 1 : 0);
export const stageOf = (ch) =>
    isChapterRestored(ch) ? 3 : (ch === activeChapter() ? stageFromProgress(chapterProgress(ch)) : 0);

// Copy for each stage's mini-reveal (color-causal framing).
export const STAGE_INFO = [
    null,
    { key: 'green', title: 'The meadow returns', body: 'Your green mixes brought the grass and trees back to life.' },
    { key: 'blue',  title: 'The sky clears',     body: 'Blue floods back into the sky and the streams below.' },
    { key: 'warm',  title: 'Place restored!',    body: 'Sunlight and blossoms — the place is whole again.' },
];
// Which level-within-chapter triggers each stage (1-indexed clears: 3, 6, 10).
export const STAGE_AT = { 3: 1, 6: 2, 10: 3 };

// Forward-looking nudge for the level-complete screen: how close the player is
// to the next restoration, and what it brings back. Pulls players toward the
// world instead of a scoreboard.
const STAGE_RESTORES = ['', 'the meadow', 'the sky', null]; // stage 3 = the whole place
export const nextRestoration = () => {
    const ch = activeChapter();
    const cleared = Math.max(0, Math.min(SIZE, clearedCount() - ch * SIZE));
    const thresh = [3, 6, 10].find((t) => t > cleared);
    if (!thresh) return null;
    const stage = STAGE_AT[thresh];
    const what = stage >= 3 ? `${placeName(ch)} is fully restored` : `${STAGE_RESTORES[stage]} returns`;
    return { chapter: ch, remaining: thresh - cleared, stage, what, place: placeName(ch), land: landName(ch) };
};

/** A place descriptor for the map UI. */
export const place = (ch) => ({
    chapter: ch,
    id: `place-${ch}`,
    name: placeName(ch),
    land: landName(ch),
    restored: isChapterRestored(ch),
    progress: ch === activeChapter() ? chapterProgress(ch) : (isChapterRestored(ch) ? 1 : 0),
    svg: sceneSVG(ch),
});

