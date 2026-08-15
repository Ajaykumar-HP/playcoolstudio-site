/**
 * FloatingBlock - Animated background decoration blocks
 */

import { GAME_COLORS } from './levels.js?v=3bd14eb0045c';
import Renderer from './renderer.js?v=3bd14eb0045c';

export default class FloatingBlock {
    constructor(canvasW, canvasH) {
        this.cw = canvasW;
        this.ch = canvasH;
        this.reset(true);
    }

    reset(init) {
        this.size = 12 + Math.random() * 28;
        this.x = Math.random() * this.cw;
        this.y = init ? Math.random() * this.ch : this.ch + this.size;
        this.speed = 0.15 + Math.random() * 0.35;
        this.rot = Math.random() * 360;
        this.rotSpeed = (Math.random() - 0.5) * 0.8;
        this.alpha = 0.06 + Math.random() * 0.1;
        this.color = GAME_COLORS[Math.floor(Math.random() * GAME_COLORS.length)];
        this.drift = (Math.random() - 0.5) * 0.3;
    }

    update() {
        this.y -= this.speed;
        this.x += this.drift;
        this.rot += this.rotSpeed;
        if (this.y < -this.size * 2) this.reset(false);
    }

    /** @param {Renderer} render */
    draw(render) {
        render.withAlpha(this.alpha, () => {
            render.rotate(this.rot, this.x, this.y, () => {
                const hs = this.size / 2;
                render.roundRect(this.x - hs, this.y - hs, this.size, this.size, 3, this.color);
            });
        });
    }
}
