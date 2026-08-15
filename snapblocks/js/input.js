/**
 * Input Manager - Unified mouse + touch input handling
 */

let element;
const callbacks = { press: [], move: [], release: [] };
let activeTouch = false;

const isPrimaryMouseButton = (e) => {
    if (typeof e.button === 'number') return e.button === 0;
    if (typeof e.which === 'number') return e.which === 1;
    return true;
};

const coords = (e, touch) => {
    const b = element.getBoundingClientRect();
    const scaleX = element.width / b.width;
    const scaleY = element.height / b.height;
    const px = touch ? e.changedTouches[0].clientX : e.clientX;
    const py = touch ? e.changedTouches[0].clientY : e.clientY;
    return {
        x: Math.floor((px - b.left) * scaleX),
        y: Math.floor((py - b.top) * scaleY),
    };
};

const fire = (list, e, touch) => {
    if (touch && e.touches && e.touches.length > 1) return;
    if (e.preventDefault) e.preventDefault();
    if (!touch && list !== callbacks.move && !isPrimaryMouseButton(e)) return;
    const c = coords(e, touch);
    list.forEach(fn => fn(c));
    return false;
};

const Input = {
    init(el) {
        element = el;
        el.addEventListener('mousedown', e => fire(callbacks.press, e, false), false);
        el.addEventListener('touchstart', (e) => {
            activeTouch = true;
            fire(callbacks.press, e, true);
        }, { passive: false });
        window.addEventListener('mousemove', e => fire(callbacks.move, e, false), false);
        window.addEventListener('touchmove', (e) => {
            if (!activeTouch) return;
            fire(callbacks.move, e, true);
        }, { passive: false });
        window.addEventListener('mouseup', e => fire(callbacks.release, e, false), false);
        window.addEventListener('touchend', (e) => {
            if (!activeTouch) return;
            fire(callbacks.release, e, true);
            activeTouch = false;
        }, false);
        window.addEventListener('touchcancel', () => {
            activeTouch = false;
        }, false);
    },

    on(type, fn) {
        if (callbacks[type]) callbacks[type].push(fn);
    },
};

export default Input;
