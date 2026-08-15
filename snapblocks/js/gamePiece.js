/**
 * GamePiece - A draggable puzzle piece with pre-rendered canvas
 */

import state from './state.js?v=3bd14eb0045c';
import Renderer from './renderer.js?v=3bd14eb0045c';
import Theme from './theme.js?v=3bd14eb0045c';
import { buildAnchoredSkin } from './anchoredSkin.js?v=3bd14eb0045c';
import { DRAG_BOUNDS } from './playLayout.js?v=3bd14eb0045c';

// Colorblind-mode textures, indexed by (colorIdx - 1) % length. The length is
// load-bearing: with 4 entries, indices 5/17/21/29 all landed on 'diagonal',
// and since idx 21 became orchid that bucket held four purple-family colours
// telling themselves apart by nothing but hue — the exact failure this mode
// exists to prevent. A 5th entry spreads them to 4/1/0/3 and measurably lowers
// the number of same-pattern colour pairs that actually co-occur on a level.
const PATTERN_TYPES = ['diagonal', 'dots', 'crosshatch', 'dashes', 'rings'];

// Corner softening on the piece silhouette, as a fraction of cellSize. Applied
// as the width of a round-joined stroke in the piece's own colour, so the
// resulting corner radius is about half this. Kept deliberately small: these
// are tangram facets, and a large radius stops connected diagonals from
// looking like they meet.
const PIECE_ROUND = 0.05;

// THE GAP DIAL. Visual channel between adjacent PLACED pieces, as a fraction
// of cellSize. This is the single tuning point — nothing else in the file
// should carry a gap value.
//
// It is a per-edge inset, so the channel a player actually sees between two
// touching pieces is TWICE this: 0.05 -> 2px inset per piece -> a 4px channel
// at cellSize 40. That is deliberately keyed to the board: Board.createGfx
// draws each cell well inset by cellSize * 0.045, so a 0.05 piece inset lands
// the piece edge just inside its own well and the well's rim reads as the
// channel between pieces.
//
// The trade-off runs both ways. Too little and pieces look like they overlap
// or bleed into one another, which is what this exists to fix. Too much and
// the tangram stops paying off its whole premise — "everything fits together"
// is the genre's reward, and a wide moat makes a solved board read as loose
// tiles scattered on a grid rather than one interlocked picture.
//
// Applies ONLY to axis-aligned (cell-to-cell) silhouette edges. Diagonal
// silhouette edges are intra-cell facet boundaries — the other side of a
// diagonal is the other half of a mixing cell — and are left at full extent so
// Prism Mix never shows a gutter down its middle. See _insetCellPoly.
const PIECE_GAP = 0.05;

// ---- Drag feel tuning (the "hand feel" of the whole game) ----
// Pickup lift: the piece grows/rises under the finger instead of teleporting
// to full size — LIFT_MS with a backOut ease gives a slight overshoot pop.
const LIFT_MS = 160;
// Per-frame lerp factor toward the finger. 1 = rigid 1:1; ~0.55 trails the
// finger by 2-3 frames which reads as weight/smoothness, not lag.
const DRAG_FOLLOW = 0.55;
// Velocity tilt: dragged pieces lean into their movement direction a few
// degrees and spring back upright when the finger stops.
const TILT_GAIN = 0.0016;   // radians per px/frame of horizontal velocity
const TILT_MAX = 0.055;     // ~3.2°
const TILT_DECAY = 0.82;    // per-frame spring back toward upright

const easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const clampChannel = (value) => Math.min(255, Math.max(0, Math.round(value)));

const parseHex = (color) => {
    const raw = color.replace('#', '');
    const hex = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
    const int = parseInt(hex, 16);
    return {
        r: (int >> 16) & 255,
        g: (int >> 8) & 255,
        b: int & 255,
    };
};

const toRgba = ({ r, g, b }, alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

const luminance = ({ r, g, b }) => {
    const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const mixColor = (color, target, amount) => ({
    r: clampChannel(color.r + (target.r - color.r) * amount),
    g: clampChannel(color.g + (target.g - color.g) * amount),
    b: clampChannel(color.b + (target.b - color.b) * amount),
});

// Push a color toward or away from its own grey. amount > 1 boosts saturation.
// The authored palette is deliberately balanced across 30 hues; the canvas
// body gets a controlled lift so those colours remain bright at tray scale.
const saturate = (color, amount) => {
    const avg = (color.r + color.g + color.b) / 3;
    return {
        r: clampChannel(avg + (color.r - avg) * amount),
        g: clampChannel(avg + (color.g - avg) * amount),
        b: clampChannel(avg + (color.b - avg) * amount),
    };
};

// A true solid body. The reference treatment reads premium because its colour
// is consistent from corner to corner; dimensionality comes from the existing
// baked shadow, silhouette rounding and inter-piece channel instead.
// The lift now lives in GAME_COLORS itself (see the retune note in
// js/levels.js), so this is a pass-through. Boosting again here would clip:
// 17 of the 30 entries already sit on a channel ceiling, and RGB saturation
// is not hue-preserving, so a second pass would flatten exactly the colours
// the retune worked hardest on. Retune the palette, not this number.
const premiumFill = (color) => toRgba(saturate(parseHex(color), 1.00));

export default class GamePiece {
    constructor(grid, cellSize, dotSize, colors) {
        this.grid = grid;
        this.gridW = grid.length;
        this.gridH = grid[0].length;
        this.width = this.gridW * cellSize;
        this.height = this.gridH * cellSize;
        this.x = 200 - Math.floor(this.width / 2);
        this.y = -this.height;
        this.placed = false;
        this.boardPos = { x: -1, y: -1 };
        this.alpha = 1;
        this.displayScale = 1;
        this.placeScale = 1; // transient snap-pop scale (1 = at rest)
        this.frozen = false;       // frost levels: piece can't be dragged yet
        this.thawRemaining = 0;    // placements left before it thaws
        this.anchored = false;     // lab prototype: pre-placed and permanently locked

        // Find piece color
        let pieceColor = '#fff';
        let pieceColorIdx = 1;
        findColor:
        for (let y = 0; y < this.gridH; y++) {
            for (let x = 0; x < this.gridW; x++) {
                for (let i = 0; i < 4; i++) {
                    if (grid[x][y][i] > 0) {
                        pieceColorIdx = grid[x][y][i];
                        pieceColor = colors[pieceColorIdx - 1];
                        break findColor;
                    }
                }
            }
        }
        this.color = pieceColor;
        this.patternType = PATTERN_TYPES[(pieceColorIdx - 1) % PATTERN_TYPES.length];
        this.edgeColor = this._getEdgeColor(pieceColor);
        this.patternColor = this._getPatternColor(pieceColor);

        // Stroke widths used to round the silhouette. Derived once here and
        // reused by _buildPatternCanvas so the pad can never drift from the
        // stroke it exists to protect.
        this._bodyStrokeW = Math.max(2, cellSize * PIECE_ROUND);
        this._patternStrokeW = Math.max(1, cellSize * 0.025);
        // A canvas stroke is CENTRED on its path, so half of it lands outside
        // the polygon. Every corner sitting on the piece's bounding box would
        // have that outer half clipped by the canvas edge — which is exactly
        // the outer silhouette PIECE_ROUND exists to soften, so a plain
        // rectangular piece used to round nowhere at all. Pad the baked canvas
        // by half the widest stroke (+1 for antialias spill) and offset all
        // geometry by the same amount. The pad is symmetric, which is what
        // keeps _drawScaled (which scales about the image centre) registered
        // with the piece at every scale.
        this._roundPad = Math.ceil(Math.max(this._bodyStrokeW, this._patternStrokeW) / 2) + 1;
        const pad = this._roundPad;

        // Pre-render piece canvas
        this._pieceCanvas = document.createElement('canvas');
        this._pieceCanvas.width = this.width + pad * 2;
        this._pieceCanvas.height = this.height + pad * 2;
        const pCtx = this._pieceCanvas.getContext('2d');
        const pRender = new Renderer(pCtx);

        const center = cellSize / 2;
        const fill = premiumFill(pieceColor);
        const polys = [];
        for (let y = 0; y < this.gridH; y++) {
            for (let x = 0; x < this.gridW; x++) {
                const cell = grid[x][y];
                const c = [cell[0] > 0, cell[1] > 0, cell[2] > 0, cell[3] > 0];
                if (!c[0] && !c[1] && !c[2] && !c[3]) continue;

                const cs = cellSize;
                const poly = this._buildCellPoly(c, cs, center);

                // +pad: geometry lives inside the padded canvas, so the outer
                // half of the rounding stroke below has room instead of being
                // clipped flat against the canvas edge.
                const px = x * cellSize + pad;
                const py = y * cellSize + pad;
                const rp = poly.map(p => [px + p[0], py + p[1]]);
                pRender.polygon(rp, fill);
                // Round-joined stroke in the fill colour: softens the piece's
                // outer corners by ~w/2 without altering the facet geometry.
                // 5% of a cell gives roughly a 1.5px corner at normal board
                // scale — slightly rounded, not pill-shaped, and small enough
                // that a diagonal facet still reads as meeting its neighbour.
                pRender.strokePolyRound(rp, fill, this._bodyStrokeW);
                polys.push(rp);
            }
        }

        // Gap pass. Built and applied LAST, on the fully composed body — after
        // the cell fills and after the PIECE_ROUND silhouette stroke — so it
        // trims the real rendered silhouette rather than an intermediate
        // stage that later drawing could paint over.
        this._gapMask = this._buildGapMask(cellSize, pad);
        this._applyGapMask(this._pieceCanvas);

        // Built from the already-trimmed body, then re-masked at the end of
        // _buildPatternCanvas because it strokes the ORIGINAL cell polys.
        this._patternCanvas = this._buildPatternCanvas(cellSize);

        // Shadow canvas — colour pulled from the active theme so dark
        // themes don't show a soft brown halo behind every piece.
        //
        // SHADOW_BLUR_PAD must exceed shadowBlur/2 + |shadowOffsetY| or the
        // baked shadow clips against its own canvas edge and shows a hard cut.
        // Blur 20 + offsetY 5 wants 14.
        //
        // The source blitted in is _pieceCanvas, which is itself already
        // width + 2*_roundPad wide. So the arithmetic is:
        //   shadow canvas = pieceCanvas size + 2*SHADOW_BLUR_PAD
        //                 = width + 2*_roundPad + 2*SHADOW_BLUR_PAD
        //                 = width + 2*(_roundPad + SHADOW_BLUR_PAD)
        // Defining _shadowPad = _roundPad + SHADOW_BLUR_PAD therefore keeps
        // the canvas at exactly width + 2*_shadowPad and the piece's logical
        // origin at (_shadowPad, _shadowPad) inside it — so the draw sites,
        // which offset by -_shadowPad, need no change. _bakeShadow blits at
        // (_shadowPad - _roundPad) = SHADOW_BLUR_PAD.
        //
        // The pad stays symmetric, so the piece remains centred in the shadow
        // canvas and _drawScaled (which scales about the image centre) keeps
        // the shadow registered with the piece at any scale.
        const SHADOW_BLUR_PAD = 14;
        this._shadowPad = this._roundPad + SHADOW_BLUR_PAD;
        this._shadowCanvas = document.createElement('canvas');
        this._shadowCanvas.width = this.width + this._shadowPad * 2;
        this._shadowCanvas.height = this.height + this._shadowPad * 2;
        // Baked AFTER the gap pass, and _bakeShadow blits _pieceCanvas, so the
        // drop shadow traces the trimmed silhouette for free — no separate
        // gap handling in the shadow path, and rebuildForTheme stays correct
        // because it re-blits the same already-trimmed canvas.
        this._bakeShadow();
    }

    _bakeShadow() {
        const sCtx = this._shadowCanvas.getContext('2d');
        sCtx.clearRect(0, 0, this._shadowCanvas.width, this._shadowCanvas.height);
        const themed = Theme.get();
        sCtx.shadowColor = themed.pieceShadow || 'rgba(42,28,22,0.34)';
        // Softer and closer: a matte object sitting ON the surface, not
        // floating above it. More blur diffuses the contact edge, less Y
        // offset shortens the throw, which reads as weight rather than lift.
        sCtx.shadowBlur = 20;
        sCtx.shadowOffsetX = 1;
        sCtx.shadowOffsetY = 5;
        // Blit at SHADOW_BLUR_PAD, i.e. _shadowPad - _roundPad: _pieceCanvas
        // already carries _roundPad of its own margin, so blitting at the full
        // _shadowPad would double-count it and push the shadow off-register.
        const blit = this._shadowPad - this._roundPad;
        sCtx.drawImage(this._pieceCanvas, blit, blit);
    }

    // Called after a theme toggle so the pre-baked shadow tint matches
    // the new background. Cheap: just re-blits the existing piece canvas
    // with the new shadow colour.
    rebuildForTheme() {
        this._bakeShadow();
    }

    _getEdgeColor(color) {
        const rgb = parseHex(color);
        const isLight = luminance(rgb) > 0.58;
        const target = isLight ? { r: 45, g: 35, b: 52 } : { r: 255, g: 255, b: 255 };
        return toRgba(mixColor(rgb, target, isLight ? 0.44 : 0.46), isLight ? 0.38 : 0.28);
    }

    _getPatternColor(color) {
        const rgb = parseHex(color);
        const target = luminance(rgb) > 0.58 ? { r: 16, g: 22, b: 28 } : { r: 255, g: 255, b: 255 };
        return toRgba(mixColor(rgb, target, 0.72), luminance(rgb) > 0.58 ? 0.26 : 0.22);
    }

    _buildPatternTile(size) {
        const tile = document.createElement('canvas');
        tile.width = size;
        tile.height = size;
        const ctx = tile.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = this.patternColor;
        ctx.fillStyle = this.patternColor;
        ctx.lineWidth = Math.max(1, size * 0.1);
        ctx.lineCap = 'round';

        if (this.patternType === 'diagonal') {
            ctx.beginPath();
            ctx.moveTo(-size * 0.2, size * 0.75);
            ctx.lineTo(size * 0.45, size * 0.1);
            ctx.moveTo(size * 0.35, size * 1.05);
            ctx.lineTo(size * 1.05, size * 0.35);
            ctx.stroke();
        } else if (this.patternType === 'dots') {
            const radius = Math.max(1.2, size * 0.09);
            [
                [size * 0.28, size * 0.28],
                [size * 0.72, size * 0.28],
                [size * 0.5, size * 0.65],
            ].forEach(([x, y]) => {
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            });
        } else if (this.patternType === 'crosshatch') {
            ctx.beginPath();
            ctx.moveTo(size * 0.2, 0);
            ctx.lineTo(size * 0.2, size);
            ctx.moveTo(size * 0.68, 0);
            ctx.lineTo(size * 0.68, size);
            ctx.moveTo(0, size * 0.22);
            ctx.lineTo(size, size * 0.22);
            ctx.moveTo(0, size * 0.7);
            ctx.lineTo(size, size * 0.7);
            ctx.stroke();
        } else if (this.patternType === 'rings') {
            // Concentric bullseye, centred so it tiles cleanly on 'repeat' —
            // both arcs stay inside the tile, so there is no edge to seam.
            // Radii are deliberately far apart (0.38 vs 0.16) rather than
            // evenly spaced: at RESERVE_SCALE 0.58 a ~23px tile renders around
            // 13px, and closely spaced rings merge into a blob at that size,
            // whereas a wide ring around a small one still reads as a target
            // and never as 'dots' (3 offset blobs) or 'crosshatch'.
            ctx.beginPath();
            ctx.arc(size * 0.5, size * 0.5, size * 0.38, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(size * 0.5, size * 0.5, size * 0.16, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.patternType === 'dashes') {
            ctx.beginPath();
            ctx.moveTo(size * 0.12, size * 0.25);
            ctx.lineTo(size * 0.42, size * 0.25);
            ctx.moveTo(size * 0.58, size * 0.25);
            ctx.lineTo(size * 0.88, size * 0.25);
            ctx.moveTo(size * 0.12, size * 0.72);
            ctx.lineTo(size * 0.42, size * 0.72);
            ctx.moveTo(size * 0.58, size * 0.72);
            ctx.lineTo(size * 0.88, size * 0.72);
            ctx.stroke();
        }
        // No bare else: an unrecognised patternType now yields an empty tile
        // (pattern simply absent) instead of silently masquerading as dashes,
        // which would hide a typo in PATTERN_TYPES until a player reported it.

        return tile;
    }

    _buildPatternCanvas(cellSize) {
        // Same dimensions as _pieceCanvas (which is padded by _roundPad) so the
        // blit below stays aligned and _getActiveCanvas can hand either canvas
        // to the same draw path without the piece jumping.
        const pad = this._roundPad;
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = this.width + pad * 2;
        patternCanvas.height = this.height + pad * 2;
        const ctx = patternCanvas.getContext('2d');
        const render = new Renderer(ctx);
        const tile = this._buildPatternTile(Math.max(12, Math.round(cellSize * 0.58)));

        ctx.drawImage(this._pieceCanvas, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = ctx.createPattern(tile, 'repeat');
        ctx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
        ctx.restore();

        for (let y = 0; y < this.gridH; y++) {
            for (let x = 0; x < this.gridW; x++) {
                const cell = this.grid[x][y];
                const c = [cell[0] > 0, cell[1] > 0, cell[2] > 0, cell[3] > 0];
                if (!c[0] && !c[1] && !c[2] && !c[3]) continue;
                const poly = this._buildCellPoly(c, cellSize, cellSize / 2);
                const px = x * cellSize + pad;
                const py = y * cellSize + pad;
                // Same round-joined treatment on the colorblind pattern canvas,
                // so both piece renders share one silhouette. This stroke is
                // thinner than the body stroke, but _roundPad is sized from the
                // larger of the two, so it can't clip either.
                render.strokePolyRound(poly.map(p => [px + p[0], py + p[1]]), this.edgeColor, this._patternStrokeW);
            }
        }

        // These outlines follow the ORIGINAL (un-inset) polys, so they would
        // otherwise paint the gap back in as a coloured rim. Re-trim so all
        // three baked canvases share one silhouette and _getActiveCanvas can
        // hand any of them to the same draw path.
        this._applyGapMask(patternCanvas);

        return patternCanvas;
    }

    _getActiveCanvas() {
        if (this.frozen && this._frozenCanvas) return this._frozenCanvas;
        // Anchored keeps the colorblind branch, unlike frozen: a locked piece
        // stays on the board for the whole level, so losing its pattern would
        // remove information a colorblind player needs the entire time.
        if (this.anchored && this._anchoredCanvas) {
            return state.config.colorblind ? this._anchoredPatternCanvas : this._anchoredCanvas;
        }
        return state.config.colorblind ? this._patternCanvas : this._pieceCanvas;
    }

    /**
     * Lab prototype — Anchored pieces. Bakes a "set into the board" skin from
     * both already-composed body canvases so _getActiveCanvas can still honour
     * colorblind mode. Idempotent; both skins are theme-independent (derived
     * from the piece's own GAME_COLORS body), so no rebuild hook is needed.
     */
    setAnchored(on) {
        this.anchored = !!on;
        if (this.anchored && !this._anchoredCanvas) {
            this._anchoredCanvas = buildAnchoredSkin(this, this._pieceCanvas);
            this._anchoredPatternCanvas = buildAnchoredSkin(this, this._patternCanvas);
        }
    }

    /** True when this piece must refuse a drag (frost or lab anchor). */
    isLocked() {
        return !!(this.frozen || this.anchored);
    }

    /**
     * Read-only access to a baked body canvas, for board-side swatches that
     * must match how this colour's pieces actually render.
     */
    swatchCanvas(patterned = false) {
        return patterned ? this._patternCanvas : this._pieceCanvas;
    }

    /** Number of grid cells this piece covers (any facet filled). */
    cellCount() {
        let n = 0;
        for (let y = 0; y < this.gridH; y++) {
            for (let x = 0; x < this.gridW; x++) {
                const cell = this.grid[x][y];
                if (cell[0] > 0 || cell[1] > 0 || cell[2] > 0 || cell[3] > 0) n++;
            }
        }
        return n;
    }

    /**
     * Frost levels: freeze/unfreeze this piece. The icy skin is baked once,
     * lazily — a desaturated blue-white glaze over the normal piece render
     * plus a frost rim, so the piece reads as "there but not available".
     */
    setFrozen(on, thaw = 0) {
        this.frozen = !!on;
        this.thawRemaining = on ? thaw : 0;
        if (on && !this._frozenCanvas) this._frozenCanvas = this._buildFrozenCanvas();
    }

    thaw() {
        this.frozen = false;
        this.thawRemaining = 0;
    }

    _buildFrozenCanvas() {
        // Padded to match _pieceCanvas so the blit lands 1:1 and the frozen
        // skin swaps in without shifting the piece.
        const pad = this._roundPad;
        const c = document.createElement('canvas');
        c.width = this.width + pad * 2;
        c.height = this.height + pad * 2;
        const ctx = c.getContext('2d');
        ctx.drawImage(this._pieceCanvas, 0, 0);
        ctx.save();
        // Work in piece-local coords; the washes below are grown by pad so the
        // rounded rim in the margin is glazed too.
        ctx.translate(pad, pad);
        ctx.globalCompositeOperation = 'source-atop';
        // Icy glaze: cool wash + a restrained top sheen. The cool WASH is what
        // says "frozen" — it stays at full strength. The white sheen is the
        // material finish, and it is halved to stay in the same matte family
        // as the base piece; a glossy frost over a matte body would make Frost
        // levels look like they came from a different game. The blue bottom
        // stop is a shade, not a highlight, so it keeps its weight and now
        // carries more of the ice read than the sheen does.
        ctx.fillStyle = 'rgba(190, 222, 255, 0.55)';
        ctx.fillRect(-pad, -pad, this.width + pad * 2, this.height + pad * 2);
        const sheen = ctx.createLinearGradient(0, 0, 0, this.height);
        sheen.addColorStop(0, 'rgba(255,255,255,0.26)');
        sheen.addColorStop(0.4, 'rgba(255,255,255,0.04)');
        sheen.addColorStop(1, 'rgba(120,160,210,0.30)');
        ctx.fillStyle = sheen;
        ctx.fillRect(-pad, -pad, this.width + pad * 2, this.height + pad * 2);
        // Hairline cracks so it reads as ice, not just a tint. Dimmed less
        // than the sheen — these are the literal "this is ice" signal and the
        // only thing distinguishing frozen from a plain blue tint, so they
        // stay legible even though they are the brightest thing on the piece.
        ctx.strokeStyle = 'rgba(255,255,255,0.38)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const w = this.width, h = this.height;
        ctx.moveTo(w * 0.18, h * 0.22); ctx.lineTo(w * 0.42, h * 0.40); ctx.lineTo(w * 0.36, h * 0.62);
        ctx.moveTo(w * 0.42, h * 0.40); ctx.lineTo(w * 0.66, h * 0.34);
        ctx.moveTo(w * 0.62, h * 0.70); ctx.lineTo(w * 0.80, h * 0.52);
        ctx.stroke();
        ctx.restore();
        // Belt and braces: every wash above is source-atop over an already
        // trimmed body, so this is a no-op today. It stays so the "all three
        // baked canvases share one silhouette" invariant survives anyone
        // adding a source-over layer to the frost pass later.
        this._applyGapMask(c);
        return c;
    }

    /** Small "place N to thaw" badge drawn over a frozen piece. */
    _drawThawBadge(ctx, scale) {
        const bounds = this.getDisplayBounds(this.placed ? 1 : (this.displayScale || 1));
        const cx = bounds.x + bounds.w / 2;
        const cy = bounds.y + bounds.h / 2;
        const r = Math.max(11, 13 * scale);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(36, 64, 104, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#eaf4ff';
        ctx.font = `800 ${Math.round(r * 1.1)}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${this.thawRemaining}`, cx, cy + 0.5);
        ctx.restore();
    }

    // ---- Inter-piece gap (see PIECE_GAP) ----------------------------------
    //
    // Technique: geometric polygon insetting into an alpha mask, applied with
    // destination-in.
    //
    // Why not a raster erode of the union mask: erosion is isotropic, so it
    // would eat the diagonals too and open a gutter down the middle of every
    // mixing cell — the one outcome the feature must not produce. Insetting
    // edge LINES lets each edge be treated according to what it actually is,
    // and it is exact for the pentagon facets because it never reasons about
    // vertices, only about the lines they sit on.
    //
    // Why it cannot produce internal seams: the inset is computed per cell,
    // but an edge only moves when it is on the piece's OUTER silhouette. An
    // edge shared with another cell of the same piece is left exactly where it
    // was, so neighbouring inset polys still share identical coordinates and
    // the union is one continuous shape. They are then filled as a SINGLE path
    // (one beginPath, many subpaths, one fill), so shared edges get no
    // half-alpha antialiasing hairline either.

    /**
     * Which cell side, if any, an edge lies on. Every axis-aligned edge
     * produced by _buildCellPoly is a FULL cell side lying exactly on x=0,
     * x=cs, y=0 or y=cs — true for all of the facet combinations below,
     * including the four pentagons. Anything else is a facet diagonal.
     * Read from geometry rather than from the facet flags, so the fallback
     * square (facet combos _buildCellPoly does not special-case) is handled
     * correctly too.
     */
    _axisSide(a, b, cs) {
        if (a[1] === b[1]) {
            if (a[1] === 0) return 'top';
            if (a[1] === cs) return 'bottom';
        }
        if (a[0] === b[0]) {
            if (a[0] === 0) return 'left';
            if (a[0] === cs) return 'right';
        }
        return null;
    }

    /**
     * True when the given cell side faces open space or a DIFFERENT piece —
     * i.e. it is on this piece's outer silhouette and should be gapped.
     * False when the neighbouring cell of this same piece fills the facet on
     * the other side of that boundary, which makes the edge internal.
     */
    _isOuterSide(gx, gy, side) {
        // [dx, dy, facet index of the neighbour facet across this boundary].
        // Facet order is [top, left, right, bottom].
        const N = {
            top: [0, -1, 3],
            bottom: [0, 1, 0],
            left: [-1, 0, 2],
            right: [1, 0, 1],
        }[side];
        const nx = gx + N[0];
        const ny = gy + N[1];
        if (nx < 0 || ny < 0 || nx >= this.gridW || ny >= this.gridH) return true;
        return !(this.grid[nx][ny][N[2]] > 0);
    }

    /**
     * Push this cell's outer axis-aligned edges inward by `gap`, leaving
     * diagonal edges and internal edges on their original lines, then rebuild
     * the vertices as intersections of consecutive edge lines.
     *
     * Working in lines rather than points is what makes the pentagons correct:
     * a vertex where a moved axis edge meets an unmoved diagonal simply slides
     * ALONG the diagonal to the new meeting point, so the diagonal keeps its
     * full extent and its exact angle. Two pieces sharing a mixing cell each
     * keep their half of that diagonal and still meet flush.
     */
    _insetCellPoly(poly, cs, gx, gy, gap) {
        const n = poly.length;
        const lines = [];
        for (let i = 0; i < n; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % n];
            let ox = 0, oy = 0;
            const side = this._axisSide(a, b, cs);
            if (side && this._isOuterSide(gx, gy, side)) {
                if (side === 'top') oy = gap;
                else if (side === 'bottom') oy = -gap;
                else if (side === 'left') ox = gap;
                else ox = -gap;
            }
            lines.push({ px: a[0] + ox, py: a[1] + oy, dx: b[0] - a[0], dy: b[1] - a[1] });
        }

        const out = [];
        for (let i = 0; i < n; i++) {
            const L0 = lines[(i - 1 + n) % n]; // edge arriving at vertex i
            const L1 = lines[i];               // edge leaving vertex i
            const cross = L0.dx * L1.dy - L0.dy * L1.dx;
            // Consecutive edges of a cell poly always turn, so this is a guard
            // against pathological data, never a normal path.
            if (Math.abs(cross) < 1e-9) { out.push([poly[i][0], poly[i][1]]); continue; }
            const t = ((L1.px - L0.px) * L1.dy - (L1.py - L0.py) * L1.dx) / cross;
            out.push([L0.px + L0.dx * t, L0.py + L0.dy * t]);
        }
        return out;
    }

    /**
     * Alpha mask of the piece's trimmed silhouette, at _pieceCanvas dimensions.
     *
     * The inset distance is PIECE_GAP * cs PLUS _bodyStrokeW / 2, because the
     * mask is then round-stroked by _bodyStrokeW — the same treatment the body
     * itself gets — which pushes it back out by _bodyStrokeW / 2. The two
     * cancel on every flat run, so the NET silhouette is:
     *   - axis-aligned faces: exactly PIECE_GAP * cs inside the logical cell
     *     boundary, flat.
     *   - diagonal faces: unchanged from before this change (still
     *     _bodyStrokeW / 2 outside the true facet line), because a diagonal
     *     line is never inset but is still stroked.
     *   - convex corners: still rounded by ~_bodyStrokeW / 2, tangent to the
     *     flat runs, so the rounding survives and never pokes past the gap.
     * PIECE_ROUND therefore keeps doing exactly what it did; the gap is layered
     * under it rather than fighting it.
     */
    _buildGapMask(cellSize, pad) {
        const cs = cellSize;
        const gap = cs * PIECE_GAP + this._bodyStrokeW / 2;
        const mask = document.createElement('canvas');
        mask.width = this._pieceCanvas.width;
        mask.height = this._pieceCanvas.height;
        const ctx = mask.getContext('2d');
        const render = new Renderer(ctx);

        const polys = [];
        for (let y = 0; y < this.gridH; y++) {
            for (let x = 0; x < this.gridW; x++) {
                const cell = this.grid[x][y];
                const c = [cell[0] > 0, cell[1] > 0, cell[2] > 0, cell[3] > 0];
                if (!c[0] && !c[1] && !c[2] && !c[3]) continue;
                const inset = this._insetCellPoly(this._buildCellPoly(c, cs, cs / 2), cs, x, y, gap);
                const px = x * cs + pad;
                const py = y * cs + pad;
                polys.push(inset.map(p => [px + p[0], py + p[1]]));
            }
        }

        // ONE path, one fill. Cell polys never overlap in area, so nonzero
        // winding cannot punch a hole even where two cells wind oppositely,
        // and shared edges are rasterised once instead of as two half-covered
        // passes that would sum to a visible hairline.
        ctx.beginPath();
        for (const p of polys) {
            ctx.moveTo(p[0][0], p[0][1]);
            for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
            ctx.closePath();
        }
        ctx.fillStyle = '#fff';
        ctx.fill();

        // Per-cell round stroke. Safe on a mask: dilation distributes over a
        // union, so stroking each cell separately yields the same shape as
        // stroking the merged outline, and opaque white over opaque white
        // leaves no internal trace.
        for (const p of polys) render.strokePolyRound(p, '#fff', this._bodyStrokeW);

        return mask;
    }

    /** Trim a composed piece canvas down to the gapped silhouette. */
    _applyGapMask(canvas) {
        if (!this._gapMask) return;
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(this._gapMask, 0, 0);
        ctx.restore();
    }

    _buildCellPoly(c, cs, center) {
        if (c[0] && c[1] && c[2] && c[3]) return [[0, 0], [cs, 0], [cs, cs], [0, cs]];
        if (c[0] && !c[1] && !c[2] && !c[3]) return [[0, 0], [cs, 0], [center, center]];
        if (!c[0] && c[1] && !c[2] && !c[3]) return [[0, 0], [center, center], [0, cs]];
        if (!c[0] && !c[1] && c[2] && !c[3]) return [[cs, 0], [center, center], [cs, cs]];
        if (!c[0] && !c[1] && !c[2] && c[3]) return [[0, cs], [center, center], [cs, cs]];
        if (c[0] && c[1] && !c[2] && !c[3]) return [[0, 0], [cs, 0], [0, cs]];
        if (c[0] && !c[1] && c[2] && !c[3]) return [[0, 0], [cs, 0], [cs, cs]];
        if (!c[0] && c[1] && !c[2] && c[3]) return [[0, 0], [cs, cs], [0, cs]];
        if (!c[0] && !c[1] && c[2] && c[3]) return [[0, cs], [cs, 0], [cs, cs]];
        if (!c[0] && c[1] && c[2] && c[3]) return [[0, 0], [center, center], [cs, 0], [cs, cs], [0, cs]];
        if (c[0] && !c[1] && c[2] && c[3]) return [[0, 0], [cs, 0], [cs, cs], [0, cs], [center, center]];
        if (c[0] && c[1] && !c[2] && c[3]) return [[0, 0], [cs, 0], [center, center], [cs, cs], [0, cs]];
        if (c[0] && c[1] && c[2] && !c[3]) return [[0, 0], [cs, 0], [cs, cs], [center, center], [0, cs]];
        return [[0, 0], [cs, 0], [cs, cs], [0, cs]];
    }

    // Scales about the IMAGE centre. Every baked canvas here pads the piece
    // symmetrically, so the image centre is the piece centre and registration
    // is pad-invariant at any scale — callers only have to subtract the pad
    // once, from the top-left they pass in.
    _drawScaled(ctx, img, x, y, scale = 1, alpha = 1, glow = null) {
        const w = img.width * scale;
        const h = img.height * scale;
        const dx = x - (w - img.width) / 2;
        const dy = y - (h - img.height) / 2;
        ctx.save();
        ctx.globalAlpha = alpha;
        if (glow) {
            ctx.shadowColor = glow.color;
            ctx.shadowBlur = glow.blur;
        }
        ctx.drawImage(img, dx, dy, w, h);
        ctx.restore();
    }

    getDisplayBounds(scale = this.displayScale || 1) {
        const w = this.width * scale;
        const h = this.height * scale;
        return {
            x: this.x + (this.width - w) / 2,
            y: this.y + (this.height - h) / 2,
            w,
            h,
            scale,
        };
    }

    promoteForDragAt(coords = null) {
        const bounds = this.getDisplayBounds();
        if (coords && bounds.scale > 0) {
            this.x = coords.x - ((coords.x - bounds.x) / bounds.scale);
            this.y = coords.y - ((coords.y - bounds.y) / bounds.scale);
        } else {
            this.x = bounds.x;
            this.y = bounds.y;
        }
        this.displayScale = 1;
        this.beginDrag();
    }

    // Reset drag-follow state + start the pickup lift. Called on EVERY grab
    // (tray pieces via promoteForDragAt, placed pieces directly) so a stale
    // target from a previous drag can never yank the piece across the board.
    beginDrag() {
        this._liftStart = state.config.reducedMotion ? 0 : Date.now();
        this._tilt = 0;
        this._tiltV = 0;
        this._dragTargetX = this.x;
        this._dragTargetY = this.y;
    }

    // Snap position to the drag target instantly — called on release so the
    // fit check uses exactly where the finger let go, not the eased position.
    settleDrag() {
        if (typeof this._dragTargetX === 'number') {
            this.x = this._dragTargetX;
            this.y = this._dragTargetY;
        }
        this._tilt = 0;
        this._tiltV = 0;
    }

    // Eased pickup-lift progress: 0 at grab, 1 once fully lifted.
    _liftProgress() {
        if (!this._liftStart) return 1;
        const t = (Date.now() - this._liftStart) / LIFT_MS;
        if (t >= 1) { this._liftStart = 0; return 1; }
        return easeOutBack(Math.max(0, t));
    }

    drawGhost(render, x, y, alpha = 0.24, emphasize = false) {
        // x/y are a LOGICAL piece top-left from the caller; the baked canvas is
        // padded, so subtract the pad to land the piece where it was asked for.
        const p = this._roundPad;
        this._drawScaled(render.ctx, this._getActiveCanvas(), x - p, y - p, emphasize ? 1.03 : 1, alpha, emphasize ? {
            color: this.color,
            blur: 16,
        } : null);
    }

    draw(render, dragging, previewActive = false) {
        const activeCanvas = this._getActiveCanvas();
        // The body/pattern/frozen canvases are padded by _roundPad; this.x/this.y
        // stay LOGICAL (hit-testing, snapping and tray layout depend on that), so
        // every blit of a padded canvas subtracts the pad. The shadow canvas is
        // padded by _shadowPad, which already includes _roundPad.
        const p = this._roundPad;
        if (!dragging) {
            // placeScale drives the snap "pop" (overshoot then settle) on a
            // freshly placed piece; 1 the rest of the time.
            const pop = this.placeScale || 1;
            const scale = (this.placed ? 1 : (this.displayScale || 1)) * pop;
            if (!this.placed) {
                this._drawScaled(render.ctx, this._shadowCanvas, this.x - this._shadowPad, this.y - this._shadowPad + 4, scale, scale < 1 ? 0.14 : 0.24);
            }
            render.withAlpha(this.alpha, () => {
                if (scale === 1) render.image(activeCanvas, this.x - p, this.y - p);
                else this._drawScaled(render.ctx, activeCanvas, this.x - p, this.y - p, scale, 1);
            });
            if (this.frozen && this.thawRemaining > 0) {
                this._drawThawBadge(render.ctx, scale);
            }
            return;
        }

        // Frame-driven drag feel: ease toward the finger (weighty, silky follow),
        // lean into the movement direction, and rise while the lift plays.
        const ctx = render.ctx;
        const reduced = state.config.reducedMotion;
        if (!reduced && typeof this._dragTargetX === 'number') {
            this.x += (this._dragTargetX - this.x) * DRAG_FOLLOW;
            this.y += (this._dragTargetY - this.y) * DRAG_FOLLOW;
            this._tilt = Math.max(-TILT_MAX, Math.min(TILT_MAX, (this._tilt || 0) * TILT_DECAY + (this._tiltV || 0) * TILT_GAIN));
            this._tiltV = (this._tiltV || 0) * TILT_DECAY;
        }
        const lift = reduced ? 1 : this._liftProgress();
        const scale = (previewActive ? 1.06 : 1.03) * (0.94 + 0.06 * lift);
        const rise = 4 * lift;

        ctx.save();
        if (this._tilt) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(this._tilt);
            ctx.translate(-cx, -cy);
        }
        // Shadow sinks + strengthens as the piece rises — the elevation read.
        this._drawScaled(ctx, this._shadowCanvas, this.x - this._shadowPad, this.y - this._shadowPad + 6 + rise * 0.8, scale, (previewActive ? 0.62 : 0.46) * (0.5 + 0.5 * Math.min(1, lift)));
        if (previewActive) {
            this._drawScaled(ctx, activeCanvas, this.x - p, this.y - p - rise, 1.02, 0.24, {
                color: this.color,
                blur: 18,
            });
        }
        this._drawScaled(ctx, activeCanvas, this.x - p, this.y - p - rise, scale, this.alpha);
        ctx.restore();
    }

    tapInside(coords, cellSize) {
        const bounds = this.placed ? { x: this.x, y: this.y, scale: 1, w: this.width, h: this.height } : this.getDisplayBounds();
        const nx = coords.x - bounds.x;
        const ny = coords.y - bounds.y;
        if (nx < 0 || ny < 0 || nx >= bounds.w || ny >= bounds.h) return false;
        const localX = nx / bounds.scale;
        const localY = ny / bounds.scale;
        const cx = Math.floor(localX / cellSize);
        const cy = Math.floor(localY / cellSize);
        if (cx < 0 || cy < 0 || cx >= this.gridW || cy >= this.gridH) return false;
        const rx = localX - cx * cellSize;
        const ry = localY - cy * cellSize;
        const c1 = ry > cellSize - rx;
        const c2 = ry < rx;
        let idx;
        if (!c1 && c2) idx = 0;
        else if (!c1 && !c2) idx = 1;
        else if (c1 && c2) idx = 2;
        else idx = 3;
        return this.grid[cx][cy][idx] > 0;
    }

    move(mx, my, dx, dy) {
        // Clamp both axes by the piece's full bounds (not just the cursor),
        // so a wide piece dragged near the canvas edge can't slide off-screen.
        const minX = DRAG_BOUNDS.left;
        const maxX = Math.max(minX, DRAG_BOUNDS.right - this.width);
        const minY = DRAG_BOUNDS.top;
        const maxY = Math.max(minY, DRAG_BOUNDS.bottom - this.height);
        const nx = Math.min(maxX, Math.max(minX, mx - dx));
        const ny = Math.min(maxY, Math.max(minY, my - dy));
        // Smoothed horizontal velocity feeds the drag tilt in draw().
        const prev = typeof this._dragTargetX === 'number' ? this._dragTargetX : nx;
        this._tiltV = (this._tiltV || 0) * 0.5 + (nx - prev) * 0.5;
        this._dragTargetX = nx;
        this._dragTargetY = ny;
        if (state.config.reducedMotion) {
            this.x = nx;
            this.y = ny;
        }
    }
}
