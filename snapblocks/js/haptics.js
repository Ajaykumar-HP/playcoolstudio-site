/**
 * Haptics helper - uses Capacitor Haptics when available, vibrate as fallback
 */

import state from './state.js?v=5071259f5c9c';

const getPlugin = () => window.Capacitor?.Plugins?.Haptics;

const fallback = (pattern) => {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* ignore */ }
};

const run = (method, options, pattern) => {
    if (state.config?.haptics === false) return;
    try {
        const plugin = getPlugin();
        if (plugin && typeof plugin[method] === 'function') {
            const res = options ? plugin[method](options) : plugin[method]();
            if (res && typeof res.catch === 'function') res.catch(() => fallback(pattern));
            return;
        }
    } catch (e) { /* ignore */ }
    fallback(pattern);
};

/**
 * Whether haptic feedback can actually do anything here — the question the
 * Settings toggle needs answered, and deliberately NOT "is this Android".
 *
 * Capacitor's Haptics plugin is the definitive yes, and the native-platform
 * probe backs it up so the control can never vanish from the Android build over
 * a plugin-registration timing quirk. Off-device the engine falls back to
 * navigator.vibrate, which genuinely fires on Android Chrome — so a mobile-web
 * player, the bulk of portal traffic, must keep the switch. But that property
 * also EXISTS as a silent no-op on desktop Chrome and Firefox, which is why its
 * presence alone is not the test: pairing it with `pointer: coarse` is what
 * separates a phone or tablet from a desktop, and still reads false on a
 * touchscreen laptop whose primary pointer is a mouse. iOS Safari implements no
 * Vibration API at all and correctly drops out.
 */
export const hapticsSupported = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (getPlugin() || window.Capacitor?.isNativePlatform?.()) return true;
    if (typeof navigator.vibrate !== 'function') return false;
    return !!window.matchMedia?.('(pointer: coarse)')?.matches;
};

const HapticsEngine = {
    selection() {
        run('selectionChanged', null, [18]);
    },

    light() {
        run('impact', { style: 'LIGHT' }, [20]);
    },

    medium() {
        run('impact', { style: 'MEDIUM' }, [36]);
    },

    success() {
        run('notification', { type: 'SUCCESS' }, [20, 28, 18]);
    },
};

export default HapticsEngine;
