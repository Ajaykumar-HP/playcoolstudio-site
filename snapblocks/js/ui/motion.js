/**
 * motion.js — small Web Animations API (WAAPI) helpers for celebratory UI
 * moments (level-complete screen, reward callouts, HUD bumps).
 *
 * Why WAAPI instead of more CSS keyframes: these animations are triggered
 * imperatively (on mount, in a stagger loop, in response to a value we just
 * computed), and `element.animate()` gives us that without injecting inline
 * <style> blocks or juggling animationend listeners just to know "is it
 * still running." CSS keyframes remain the right tool for ambient/looping
 * decoration baked into a template (see screens.css) — this module is for
 * the springy, one-off flourishes layered on top of specific elements.
 *
 * Every export is reduced-motion safe: it jumps straight to the final state
 * instead of skipping the visual, so whatever the player reads (a coin
 * total, a star fill) is never caught mid-animation and never wrong.
 */

// True when motion should be dampened — either our own in-app toggle
// (Settings mirrors it onto <html data-reduced-motion> in ui/index.js) or
// the OS-level prefers-reduced-motion media query. Checked live rather than
// cached because the in-app toggle can flip mid-session.
export const reducedMotion = () => {
    if (typeof document === 'undefined') return false;
    if (document.documentElement.dataset.reducedMotion === 'true') return true;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Count an integer up to `to`, formatted as `${prefix}${n}${suffix}` so a
// caller can drive text like "+37 coins earned" without re-templating the
// surrounding string. This uses rAF, not WAAPI, because we're mutating text
// content — WAAPI interpolates CSS property values, not strings. The final
// frame always writes the exact target text so rounding error can never
// leave a stale number on screen.
export const countUp = (el, to, { duration = 700, prefix = '', suffix = '' } = {}) => {
    if (!el) return;
    const target = Math.round(to);
    if (reducedMotion() || duration <= 0) {
        el.textContent = `${prefix}${target}${suffix}`;
        return;
    }
    const current = parseInt((el.textContent || '').replace(prefix, '').replace(suffix, ''), 10);
    const start = Number.isFinite(current) ? current : 0;
    const t0 = performance.now();
    const tick = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic — fast start, gentle landing
        if (p < 1) {
            el.textContent = `${prefix}${Math.round(start + (target - start) * eased)}${suffix}`;
            requestAnimationFrame(tick);
        } else {
            el.textContent = `${prefix}${target}${suffix}`; // exact landing, no float drift
        }
    };
    requestAnimationFrame(tick);
};

// A spring-ish entrance: overshoot past 1, settle short, land on 1. Four
// keyframes approximate a damped spring cheaply (a real spring() easing
// isn't in browsers yet) without pulling in a physics/animation library for
// vanilla-JS code that ships no bundler.
export const springIn = (el, { delay = 0 } = {}) => {
    if (!el) return null;
    if (reducedMotion()) return null; // final state is already scale:1/opacity:1 at rest — nothing to jump to
    return el.animate([
        { transform: 'scale(0.6)',  opacity: 0, offset: 0 },
        { transform: 'scale(1.06)', opacity: 1, offset: 0.6 },
        { transform: 'scale(0.98)', opacity: 1, offset: 0.85 },
        { transform: 'scale(1)',    opacity: 1, offset: 1 },
    ], { duration: 450, delay, easing: 'ease-out', fill: 'backwards' });
};

// One-shot attention pop for a value that just changed (a HUD number, a
// badge). Short and un-delayed on purpose — it's meant to read as "notice
// this" without stealing focus from whatever triggered it.
export const popPulse = (el) => {
    if (!el) return null;
    if (reducedMotion()) return null;
    return el.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.12)', offset: 0.5 },
        { transform: 'scale(1)' },
    ], { duration: 260, easing: 'ease-out' });
};

// Soft infinite "tap me" loop for a CTA (e.g. the gold Double-it button).
// Returns the Animation so a caller CAN cancel it early, but nothing here
// wires that up automatically: this app swaps whole screens via
// `baseEl.innerHTML = ...` (see ui/index.js), which detaches the button
// node outright. An infinite WAAPI animation only keeps running while its
// target is reachable — once the element is detached and dereferenced it's
// eligible for GC same as the animation. So the intended lifecycle here is
// "dies with the node"; only reach for cancel() if you ever animate an
// element that persists across a re-render instead of being replaced.
export const breathe = (el, { period = 2400 } = {}) => {
    if (!el) return null;
    if (reducedMotion()) return null;
    return el.animate([
        { transform: 'scale(1)',    filter: 'brightness(1)' },
        { transform: 'scale(1.03)', filter: 'brightness(1.08)', offset: 0.5 },
        { transform: 'scale(1)',    filter: 'brightness(1)' },
    ], { duration: period, easing: 'ease-in-out', iterations: Infinity });
};
