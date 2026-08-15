/**
 * Lightweight analytics facade.
 *
 * Gameplay emits one `snapblocks:analytics` CustomEvent and never talks to a
 * vendor directly. On Android a transport listens for that event and forwards
 * it through Capacitor's global plugin proxy (this project ships raw ES
 * modules, not a bundler). Browsers can provide `window.gtag` instead.
 *
 * The vendor half lives in js/platform/adapters/analytics-transport.js so a
 * portal package can exclude it — see that file for why shipping it inert is
 * not good enough. Everything here is vendor-neutral: the event shape rule, the
 * debug switch, and the dispatch itself.
 */

import { hasNativeTransport, installTransport, reservedEventName } from './platform/adapters/analytics-transport.js?v=3bd14eb0045c';

const ANALYTICS_EVENT = 'snapblocks:analytics';
const EVENT_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

// Two independent rules: the generic shape (owned here, true everywhere) and
// the vendor's own reserved names (owned by the transport, since they only
// exist because a vendor rejects them).
const validEventName = name => EVENT_NAME_RE.test(name || '') && !reservedEventName(name);

const debugEnabled = () => {
    try {
        return window.localStorage?.getItem('snapblocks.analyticsDebug') === 'true';
    } catch (e) {
        // Storage can be unavailable in private mode / restricted WebViews.
        return false;
    }
};

const debugLog = (...args) => {
    if (debugEnabled()) console.warn('[analytics]', ...args);
};

// The transport gates itself on caps.analytics, so this call is unconditional
// and the portal build's version is simply a no-op.
installTransport(ANALYTICS_EVENT, validEventName, debugLog);

export const trackEvent = (name, params = {}) => {
    if (typeof window === 'undefined' || !name) return;

    const payload = {
        ...(params && typeof params === 'object' && !Array.isArray(params) ? params : {}),
        event: String(name),
        ts: Date.now(),
    };

    // Avoid sending the same event through both the native bridge and gtag when
    // a WebView happens to expose both transports.
    if (!hasNativeTransport() && typeof window.gtag === 'function') {
        window.gtag('event', String(name), params);
    }

    window.dispatchEvent(new CustomEvent(ANALYTICS_EVENT, { detail: payload }));

    if (debugEnabled()) console.info('[analytics]', name, params);
};