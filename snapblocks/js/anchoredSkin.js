/**
 * ANCHORED (locked) piece skin — SHIPPED.
 *
 * This began as a Lab prototype under js/lab/ and moved here when Anchored
 * became a real special level type (js/anchored.js, js/anchoredLevels.js).
 * It had to move: js/lab/ is documented as deletable without affecting the
 * shipped game, and gamePiece.js imports this file on the main render path, so
 * leaving it there made that promise false.
 *
 * Scope note: this file exists so the locked treatment can be tuned without
 * editing the shipped piece renderer. gamePiece.js gains only the state flag
 * and a canvas-selection branch; every pixel of the locked treatment is baked
 * here.
 *
 * The read we are after is SOLID COLOUR, SET INTO the board:
 *   1. full palette chroma, matching the live pieces,
 *   2. restrained inset lighting instead of a pale grey wash,
 *   3. a narrow inner shadow/light rim for the carved cue,
 *   4. a dark padlock sitting directly on the piece body.
 *
 * Everything here is baked ONCE per piece and blitted thereafter. Nothing in
 * this file reads Theme: the skin is derived entirely from the piece's own
 * GAME_COLORS body, which is theme-independent, so an anchored piece can never
 * go stale on a theme switch and needs no rebuild hook. (rebuildForTheme still
 * re-bakes the drop shadow, which is the only themed part of a piece.)
 */

// Trivial colour utilities, local on purpose — importing them would mean
// exporting gamePiece.js internals for a prototype.
const parseHex = (color) => {
    const raw = String(color).replace('#', '');
    const hex = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
    const int = parseInt(hex, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
};

const clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));

const mixColor = (color, target, amount) => ({
    r: clamp255(color.r + (target.r - color.r) * amount),
    g: clamp255(color.g + (target.g - color.g) * amount),
    b: clamp255(color.b + (target.b - color.b) * amount),
});

const toRgba = ({ r, g, b }, alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

// ---- Tuning -------------------------------------------------------------
// How far the inner shadow reaches, as a fraction of the shorter piece
// dimension, clamped so a 1-cell piece and a 4-cell piece read the same depth.
const INNER_SHADOW_PX = 2.5;
// Padlock size as a fraction of the smaller piece dimension. 0.34 keeps the
// glyph inside a single facet triangle at the smallest board scale.
const LOCK_FRACTION = 0.34;
const LOCK_MIN = 9;
const LOCK_MAX = 22;

/** Fill the alpha silhouette of `src` with `color` on a fresh canvas. */
const silhouette = (src, color) => {
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, out.width, out.height);
    return out;
};

/**
 * An inner-shadow band: the silhouette MINUS a copy of itself shifted by
 * (dx, dy), which leaves colour only along the edge the shift uncovers.
 * This is why no piece geometry is needed — the alpha channel already is the
 * silhouette, including the gap inset and the rounded corners.
 */
const innerEdge = (src, color, dx, dy) => {
    const band = silhouette(src, color);
    const ctx = band.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(src, dx, dy);
    return band;
};

/**
 * Centre point for the padlock, in canvas coordinates.
 *
 * Not the bounding-box centre: an L-shaped or diagonal piece has no body at
 * its bounding-box centre, and because the whole skin is composited
 * source-atop the glyph would be silently clipped away. Instead pick the cell
 * carrying the most facets (ties broken by proximity to the piece centre) and
 * sit on the average centroid of that cell's filled facets, which is always
 * inside painted pixels.
 */
const lockAnchor = (piece, pad) => {
    const cs = piece.width / piece.gridW;
    // Facet order is [top, left, right, bottom]; these are the triangle
    // centroids of each facet within a cell of side cs.
    const FACET_CENTROID = [
        [cs / 2, cs / 6],
        [cs / 6, cs / 2],
        [cs * 5 / 6, cs / 2],
        [cs / 2, cs * 5 / 6],
    ];
    const midX = piece.gridW / 2 - 0.5;
    const midY = piece.gridH / 2 - 0.5;

    let best = null;
    for (let y = 0; y < piece.gridH; y++) {
        for (let x = 0; x < piece.gridW; x++) {
            const cell = piece.grid[x][y];
            const filled = [0, 1, 2, 3].filter(i => cell[i] > 0);
            if (!filled.length) continue;
            const dist = Math.hypot(x - midX, y - midY);
            if (best && (filled.length < best.filled.length
                || (filled.length === best.filled.length && dist >= best.dist))) continue;
            best = { x, y, filled, dist };
        }
    }
    if (!best) return { cx: pad + piece.width / 2, cy: pad + piece.height / 2, cs };

    const sum = best.filled.reduce((acc, i) => {
        acc[0] += FACET_CENTROID[i][0];
        acc[1] += FACET_CENTROID[i][1];
        return acc;
    }, [0, 0]);
    return {
        cx: pad + best.x * cs + sum[0] / best.filled.length,
        cy: pad + best.y * cs + sum[1] / best.filled.length,
        cs,
    };
};

/** Trace the padlock outline (shackle arc + body) as one path, centred on 0,0. */
const lockPath = (ctx, size) => {
    const bodyW = size * 0.78;
    const bodyH = size * 0.56;
    const bodyY = size * 0.06;
    const radius = bodyH * 0.26;
    const shackleR = bodyW * 0.30;
    const shackleY = bodyY - shackleR * 0.62;
    const lineW = Math.max(1.2, size * 0.13);

    ctx.beginPath();
    // Shackle: an open arc, drawn as a stroke so it reads at 9px.
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.arc(0, shackleY, shackleR, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Body: rounded rect, filled.
    const x = -bodyW / 2;
    const y = bodyY;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + bodyW - radius, y);
    ctx.arcTo(x + bodyW, y, x + bodyW, y + radius, radius);
    ctx.lineTo(x + bodyW, y + bodyH - radius);
    ctx.arcTo(x + bodyW, y + bodyH, x + bodyW - radius, y + bodyH, radius);
    ctx.lineTo(x + radius, y + bodyH);
    ctx.arcTo(x, y + bodyH, x, y + bodyH - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
    ctx.fill();
};

/**
 * Bake the locked skin for `piece` from one of its already-composed body
 * canvases. Call once per base canvas (plain + colourblind pattern) so
 * _getActiveCanvas can keep resolving the colourblind contract.
 */
export const buildAnchoredSkin = (piece, baseCanvas) => {
    const out = document.createElement('canvas');
    out.width = baseCanvas.width;
    out.height = baseCanvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(baseCanvas, 0, 0);

    // Every baked piece canvas pads the piece symmetrically (see _roundPad in
    // gamePiece.js), so the pad is recoverable from the canvas size. Deriving
    // it rather than reading the private field keeps this file decoupled.
    const pad = (out.width - piece.width) / 2;
    const base = parseHex(piece.color);

    // 1. Inner shadow along the top-left, light along the bottom-right — the
    //    inverted drop shadow. Composited source-atop so neither band can
    //    escape the silhouette.
    const depth = Math.max(1.5, Math.min(INNER_SHADOW_PX, Math.min(piece.width, piece.height) * 0.08));
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.34;
    ctx.drawImage(innerEdge(baseCanvas, 'rgba(0,0,0,1)', depth, depth), 0, 0);
    ctx.globalAlpha = 0.16;
    ctx.drawImage(innerEdge(baseCanvas, 'rgba(255,255,255,1)', -depth, -depth), 0, 0);
    ctx.restore();

    // 2. Padlock. Dark ink mixed from the body colour (never a flat black, so
    //    it stays "engraved into this piece" rather than "sticker on top"),
    //    with a 1px light emboss under it so it survives on the darker entries
    //    of GAME_COLORS where a dark glyph alone would disappear.
    const { cx, cy } = lockAnchor(piece, pad);
    const size = Math.max(LOCK_MIN, Math.min(LOCK_MAX, Math.min(piece.width, piece.height) * LOCK_FRACTION));
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.translate(cx, cy + size * 0.06);

    ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.save();
    ctx.translate(0, Math.max(1, size * 0.07));
    lockPath(ctx, size);
    ctx.restore();

    const ink = toRgba(mixColor(base, { r: 14, g: 10, b: 22 }, 0.74), 0.62);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    lockPath(ctx, size);

    // Keyhole, punched back out in the light emboss colour so the glyph reads
    // as a lock and not as a plain rounded blob at small sizes.
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.arc(0, size * 0.30, Math.max(0.9, size * 0.09), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    return out;
};

export default buildAnchoredSkin;
