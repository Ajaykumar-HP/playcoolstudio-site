/**
 * Trophies — Stats/achievements overlay accessible from main menu
 */

import state from './state.js?v=5071259f5c9c';
import { LEVELS } from './levels.js?v=5071259f5c9c';
import SoundEngine from './sound.js?v=5071259f5c9c';
import Transition from './transition.js?v=5071259f5c9c';

const { CANVAS_W, CANVAS_H } = state;

const Trophies = (() => {
    let active = false;
    let alpha = 0;
    let cardY = 0;
    let contentAlpha = 0;

    const closeBtnX = 100, closeBtnY = 570, closeBtnW = 200, closeBtnH = 48;

    const show = () => {
        if (active) return;
        active = true;
        alpha = 0;
        cardY = 30;
        contentAlpha = 0;

        new Transition(0, 100, 350, v => { alpha = v / 100; }, null, 'quadin').start();
        new Transition(30, 0, 450, v => { cardY = v; }, null, 'cubicout').start();
        setTimeout(() => {
            new Transition(0, 100, 400, v => { contentAlpha = v / 100; }, null, 'quadin').start();
        }, 250);
    };

    const hide = (cb) => {
        new Transition(100, 0, 250, v => { alpha = v / 100; }, () => {
            active = false;
            if (cb) cb();
        }, 'quadout').start();
    };

    const handleTap = (c) => {
        if (!active) return false;
        // Close button or tap outside card
        if ((c.x >= closeBtnX && c.x <= closeBtnX + closeBtnW &&
             c.y >= closeBtnY && c.y <= closeBtnY + closeBtnH) ||
            c.y < 100 + cardY || c.y > 560) {
            SoundEngine.menuOpen();
            hide();
            return true;
        }
        return true;
    };

    const drawStar = (cx, cy, size, color) => {
        const { ctx } = state;
        const spikes = 5, inner = size * 0.42;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? size : inner;
            const angle = (i * Math.PI / spikes) - Math.PI / 2;
            ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    };

    const draw = () => {
        if (!active || alpha <= 0) return;
        const { ctx, render, config } = state;
        const unlocked = config.unlocked + 1;
        const total = LEVELS.length;
        const pct = Math.round((unlocked / total) * 100);

        render.withAlpha(alpha, () => {
            // Background
            const bgGrad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
            bgGrad.addColorStop(0, '#f5f0ff');
            bgGrad.addColorStop(0.5, '#efe8fc');
            bgGrad.addColorStop(1, '#f8f4ff');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

            render.withAlpha(0.05, () => {
                render.circle(320, 150, 100, '#a855f7');
                render.circle(80, 550, 80, '#4fc3f7');
            });

            // Card
            const cardX = 30, cardTopY = 100 + cardY, cardW = 340, cardH = 440;
            const cr = 24;

            render.withAlpha(0.08, () => {
                render.roundRect(cardX + 4, cardTopY + 6, cardW, cardH, cr, '#7c3aed');
            });

            const cardGrad = ctx.createLinearGradient(cardX, cardTopY, cardX + cardW, cardTopY + cardH);
            cardGrad.addColorStop(0, '#f0eaff');
            cardGrad.addColorStop(1, '#e8e0f8');
            ctx.fillStyle = cardGrad;
            ctx.beginPath();
            ctx.moveTo(cardX + cr, cardTopY);
            ctx.arcTo(cardX + cardW, cardTopY, cardX + cardW, cardTopY + cardH, cr);
            ctx.arcTo(cardX + cardW, cardTopY + cardH, cardX, cardTopY + cardH, cr);
            ctx.arcTo(cardX, cardTopY + cardH, cardX, cardTopY, cr);
            ctx.arcTo(cardX, cardTopY, cardX + cardW, cardTopY, cr);
            ctx.closePath();
            ctx.fill();

            // Trophy icon
            ctx.save();
            ctx.translate(CANVAS_W / 2, cardTopY + 55);
            // Cup
            const cupGrad = ctx.createLinearGradient(-20, -25, 20, 15);
            cupGrad.addColorStop(0, '#f4d03f');
            cupGrad.addColorStop(1, '#d4a017');
            ctx.fillStyle = cupGrad;
            ctx.beginPath();
            ctx.moveTo(-18, -22);
            ctx.lineTo(18, -22);
            ctx.lineTo(14, 5);
            ctx.quadraticCurveTo(0, 18, -14, 5);
            ctx.closePath();
            ctx.fill();
            // Stem & base
            ctx.fillStyle = '#d4a017';
            ctx.fillRect(-4, 8, 8, 8);
            ctx.fillStyle = '#f4d03f';
            ctx.beginPath();
            ctx.ellipse(0, 18, 12, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            // Handles
            ctx.strokeStyle = '#d4a017';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(-20, -8, 8, -Math.PI * 0.4, Math.PI * 0.4);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(20, -8, 8, Math.PI * 0.6, Math.PI * 1.4);
            ctx.stroke();
            ctx.restore();

            render.withAlpha(contentAlpha, () => {
                // Title
                render.text('Trophies', CANVAS_W / 2, cardTopY + 105, {
                    fill: '#7c3aed', align: 'center',
                    font: 'bold 30px Outfit, sans-serif',
                });

                // Stats grid (2x2)
                const gridX = cardX + 20, gridY = cardTopY + 140;
                const cellW = (cardW - 60) / 2, cellH = 80, gap = 16;

                const stats = [
                    { label: 'Levels Cleared', value: `${unlocked}`, color: '#0d8a8a' },
                    { label: 'Total Levels', value: `${total}`, color: '#7c3aed' },
                    { label: 'Completion', value: `${pct}%`, color: '#e88a8a' },
                    { label: 'Hints Left', value: `${config.hints}`, color: '#f4d03f' },
                ];

                stats.forEach((s, i) => {
                    const col = i % 2;
                    const row = Math.floor(i / 2);
                    const sx = gridX + col * (cellW + gap);
                    const sy = gridY + row * (cellH + gap);

                    render.withAlpha(0.06, () => {
                        render.roundRect(sx + 2, sy + 3, cellW, cellH, 14, '#7c3aed');
                    });
                    render.roundRect(sx, sy, cellW, cellH, 14, '#fff');

                    render.text(s.label, sx + cellW / 2, sy + 16, {
                        fill: '#8a7faa', align: 'center',
                        font: '500 11px Outfit, sans-serif',
                    });
                    render.text(s.value, sx + cellW / 2, sy + 40, {
                        fill: s.color, align: 'center',
                        font: 'bold 26px Outfit, sans-serif',
                    });
                });

                // Progress bar
                const pbX = gridX, pbY = gridY + 2 * (cellH + gap) + 10;
                const pbW = cardW - 40, pbH = 10;
                render.roundRect(pbX, pbY, pbW, pbH, pbH / 2, '#e0d6f8');
                const fillW = Math.max(pbH, pbW * (unlocked / total));
                const pbGrad = ctx.createLinearGradient(pbX, pbY, pbX + fillW, pbY);
                pbGrad.addColorStop(0, '#4fc3f7');
                pbGrad.addColorStop(1, '#0d8a8a');
                ctx.fillStyle = pbGrad;
                ctx.beginPath();
                const r = pbH / 2;
                ctx.moveTo(pbX + r, pbY);
                ctx.arcTo(pbX + fillW, pbY, pbX + fillW, pbY + pbH, r);
                ctx.arcTo(pbX + fillW, pbY + pbH, pbX, pbY + pbH, r);
                ctx.arcTo(pbX, pbY + pbH, pbX, pbY, r);
                ctx.arcTo(pbX, pbY, pbX + fillW, pbY, r);
                ctx.closePath();
                ctx.fill();

                render.text(`${unlocked} / ${total} levels`, CANVAS_W / 2, pbY + 20, {
                    fill: '#8a7faa', align: 'center',
                    font: '500 12px Outfit, sans-serif',
                });

                // Stars row
                const starY = pbY + 50;
                for (let i = 0; i < 5; i++) {
                    const earned = i < Math.ceil(unlocked / (total / 5));
                    drawStar(CANVAS_W / 2 - 60 + i * 30, starY, 12, earned ? '#f4d03f' : '#ddd6fe');
                }
            });

            // Close button
            render.withAlpha(contentAlpha, () => {
                render.withAlpha(0.06, () => {
                    render.roundRect(closeBtnX + 2, closeBtnY + 3, closeBtnW, closeBtnH, closeBtnH / 2, '#7c3aed');
                });
                render.roundRect(closeBtnX, closeBtnY, closeBtnW, closeBtnH, closeBtnH / 2, '#ede5ff');
                render.text('Close', CANVAS_W / 2, closeBtnY + closeBtnH / 2 - 11, {
                    fill: '#7c3aed', align: 'center',
                    font: '600 17px Outfit, sans-serif',
                });
            });
        });
    };

    return {
        show,
        hide,
        draw,
        handleTap,
        isActive() { return active; },
    };
})();

export default Trophies;
