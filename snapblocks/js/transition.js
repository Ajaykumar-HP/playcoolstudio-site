/**
 * Transition - Generic animation tweener with expanded easing support.
 */

import state from './state.js?v=5071259f5c9c';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const bounceOutAt = (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

const springEase = (stiffness = 180, damping = 16) => {
    const s = Math.max(60, stiffness);
    const d = Math.max(6, damping);
    const frequency = Math.sqrt(s) / 11;
    const dampingRatio = clamp01(d / 28);
    const angular = frequency * Math.sqrt(Math.max(0.01, 1 - dampingRatio * dampingRatio));
    const coeff = dampingRatio / Math.sqrt(Math.max(0.01, 1 - dampingRatio * dampingRatio));

    return (t) => {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        const envelope = Math.exp(-dampingRatio * frequency * t * 4);
        return 1 - envelope * (Math.cos(angular * t * 4) + coeff * Math.sin(angular * t * 4));
    };
};

const EASE_FNS = {
    linear: (t) => t,
    quadin: (t) => t * t,
    quadout: (t) => 1 - Math.pow(1 - t, 2),
    cubicout: (t) => 1 - Math.pow(1 - t, 3),
    expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    backOut: (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    elasticOut: (t) => {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    bounceOut: bounceOutAt,
    spring: springEase(),
};

const normalizeEasing = (easing) => {
    if (typeof easing === 'function') return easing;
    if (typeof easing === 'object' && easing) {
        if (easing.name === 'spring') return springEase(easing.stiffness, easing.damping);
        if (typeof easing.fn === 'function') return easing.fn;
    }
    return EASE_FNS[easing] || EASE_FNS.linear;
};

const resolveEase = (easing) => {
    if (state.config?.reducedMotion) return EASE_FNS.quadout;
    return normalizeEasing(easing);
};

export default class Transition {
    /** Creates a configurable spring easing descriptor. */
    static spring(stiffness = 180, damping = 16) {
        return { name: 'spring', stiffness, damping };
    }

    constructor(from, to, duration, onUpdate, onDone, easing = 'linear') {
        let frameId = null;
        let startTime = 0;
        const delta = to - from;
        const safeDuration = Math.max(0, duration);
        const easeFn = resolveEase(easing);

        const finish = (shouldUpdate = true) => {
            frameId = null;
            if (shouldUpdate && onUpdate) onUpdate(to);
            if (onDone) onDone();
        };

        const step = (now) => {
            if (!startTime) startTime = now;
            const progress = safeDuration === 0 ? 1 : clamp01((now - startTime) / safeDuration);
            const eased = easeFn(progress);
            if (onUpdate) onUpdate(from + delta * eased);
            if (progress >= 1) {
                finish(false);
                return;
            }
            frameId = requestAnimationFrame(step);
        };

        this.start = () => {
            if (frameId !== null) return;
            if (safeDuration === 0) {
                finish();
                return;
            }
            startTime = 0;
            frameId = requestAnimationFrame(step);
        };

        this.stop = () => {
            if (frameId !== null) cancelAnimationFrame(frameId);
            frameId = null;
            startTime = 0;
        };

        this.restart = () => {
            this.stop();
            this.start();
        };

        this.isActive = () => frameId !== null;
    }
}
