/**
 * Renderer - Canvas drawing abstraction
 */

export default class Renderer {
    constructor(ctx) {
        this.ctx = ctx;
    }

    _normalizeRadius(r, w, h) {
        const maxRadius = Math.max(0, Math.min(w, h) / 2);
        if (typeof r === 'number') {
            const value = Math.min(maxRadius, Math.max(0, r));
            return { tl: value, tr: value, br: value, bl: value };
        }
        return {
            tl: Math.min(maxRadius, Math.max(0, r?.tl || 0)),
            tr: Math.min(maxRadius, Math.max(0, r?.tr || 0)),
            br: Math.min(maxRadius, Math.max(0, r?.br || 0)),
            bl: Math.min(maxRadius, Math.max(0, r?.bl || 0)),
        };
    }

    setAlpha(a) {
        this.ctx.globalAlpha = a === undefined ? 1 : Math.min(1, Math.max(0, a));
    }

    withAlpha(a, fn) {
        this.setAlpha(a);
        fn();
        this.setAlpha(1);
    }

    rect(x, y, w, h, fill = '#fff') {
        this.ctx.fillStyle = fill;
        this.ctx.fillRect(x, y, w, h);
    }

    circle(x, y, r, fill = '#fff') {
        this.ctx.fillStyle = fill;
        this.ctx.beginPath();
        this.ctx.arc(x, y, r, 0, Math.PI * 2);
        this.ctx.fill();
    }

    polygon(pts, fill = '#fff') {
        this.ctx.fillStyle = fill;
        this.ctx.beginPath();
        this.ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            this.ctx.lineTo(pts[i][0], pts[i][1]);
        }
        this.ctx.closePath();
        this.ctx.fill();
    }

    outlinePoly(pts, stroke = '#fff', w = 0.5) {
        this.ctx.strokeStyle = stroke;
        this.ctx.lineWidth = w;
        for (let i = 0; i < pts.length; i++) {
            const n = (i + 1) % pts.length;
            this.ctx.beginPath();
            this.ctx.moveTo(pts[i][0], pts[i][1]);
            this.ctx.lineTo(pts[n][0], pts[n][1]);
            this.ctx.stroke();
        }
    }

    /**
     * Stroke a closed polygon as ONE path with round joins, so corners come
     * out softened instead of mitred to a point.
     *
     * This exists because `outlinePoly` opens a new path per edge, which means
     * the corners have no join at all — the reason piece silhouettes read as
     * hard-edged. Stroking the closed path instead rounds every convex corner
     * by roughly w/2, and because the stroke is drawn in the piece's own fill
     * colour the effect is a slightly softened silhouette rather than a
     * visible outline.
     *
     * Deliberately not a geometry change: the tangram facets keep their exact
     * polygons, so connected diagonals still meet cleanly. Cells belonging to
     * the same piece overlap along their shared edges, so internal joints stay
     * solid and only the outer silhouette reads as rounded.
     */
    strokePolyRound(pts, stroke = '#fff', w = 1) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = w;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    image(img, x, y, w, h) {
        if (w !== undefined) this.ctx.drawImage(img, x, y, w, h);
        else this.ctx.drawImage(img, x, y);
    }

    text(txt, x, y, opts = {}) {
        this.ctx.fillStyle = opts.fill || '#fff';
        this.ctx.textAlign = opts.align || 'left';
        this.ctx.textBaseline = opts.baseline || 'top';
        this.ctx.font = opts.font || '14px Outfit, sans-serif';
        this.ctx.fillText(txt, x, y);
    }

    /** Draws the current path as a rounded surface primitive. */
    roundRect(x, y, w, h, r, fill = '#fff') {
        const radius = this._normalizeRadius(r, w, h);
        this.ctx.fillStyle = fill;
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius.tl, y);
        this.ctx.lineTo(x + w - radius.tr, y);
        this.ctx.arcTo(x + w, y, x + w, y + radius.tr, radius.tr);
        this.ctx.lineTo(x + w, y + h - radius.br);
        this.ctx.arcTo(x + w, y + h, x + w - radius.br, y + h, radius.br);
        this.ctx.lineTo(x + radius.bl, y + h);
        this.ctx.arcTo(x, y + h, x, y + h - radius.bl, radius.bl);
        this.ctx.lineTo(x, y + radius.tl);
        this.ctx.arcTo(x, y, x + radius.tl, y, radius.tl);
        this.ctx.closePath();
        this.ctx.fill();
    }

    /** Creates a linear gradient from either coordinates or a descriptor object. */
    linearGradient(x0, y0, x1, y1, stops) {
        let fromX = x0;
        let fromY = y0;
        let toX = x1;
        let toY = y1;
        let colorStops = stops;

        if (Array.isArray(x0)) {
            fromX = 0;
            fromY = 0;
            toX = this.ctx.canvas.width;
            toY = 0;
            colorStops = x0;
        } else if (typeof x0 === 'object' && x0) {
            fromX = x0.from?.[0] ?? 0;
            fromY = x0.from?.[1] ?? 0;
            toX = x0.to?.[0] ?? this.ctx.canvas.width;
            toY = x0.to?.[1] ?? 0;
            colorStops = x0.stops || [];
        }

        const gradient = this.ctx.createLinearGradient(fromX, fromY, toX, toY);
        (colorStops || []).forEach(({ offset, color }) => gradient.addColorStop(offset, color));
        return gradient;
    }

    /** Applies a shadow preset to the active 2D context. */
    shadow(blur = 0, offsetY = 0, color = 'rgba(0,0,0,0.2)', offsetX = 0) {
        this.ctx.shadowBlur = blur;
        this.ctx.shadowOffsetX = offsetX;
        this.ctx.shadowOffsetY = offsetY;
        this.ctx.shadowColor = color;
    }

    /** Applies a centered glow preset to the active 2D context. */
    glow(color = 'rgba(255,255,255,0.25)', radius = 12) {
        this.shadow(radius, 0, color, 0);
    }

    /** Executes a draw callback with temporary shadow state. */
    drawWithShadow(fn, opts = {}) {
        this.ctx.save();
        if (opts.glow) this.glow(opts.glow.color, opts.glow.radius);
        else this.shadow(opts.blur || 0, opts.offsetY || 0, opts.color || 'rgba(0,0,0,0.2)', opts.offsetX || 0);
        fn();
        this.ctx.restore();
    }

    rotate(angle, cx, cy, fn) {
        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.rotate(angle * Math.PI / 180);
        this.ctx.translate(-cx, -cy);
        fn();
        this.ctx.restore();
    }
}
