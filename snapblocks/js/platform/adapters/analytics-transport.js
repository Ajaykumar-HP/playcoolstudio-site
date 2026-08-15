/**
 * Analytics transport — Firebase (Android).
 *
 * Split out of js/analytics.js for the same packaging reason as the ad
 * transport: portals grep the uploaded package rather than reason about which
 * branches can run. Firebase is not an ad SDK, so it is a softer finding than
 * `ca-app-pub-…` — but YouTube Playables forbids external network calls
 * outright, and a reviewer who greps a bundle for analytics vendors and finds
 * one has to decide whether to trust that it is inert. Not shipping it is
 * cheaper than explaining it.
 *
 * The facade in js/analytics.js keeps the parts that are genuinely
 * platform-agnostic: event-name validation, param sanitising limits, the
 * `snapblocks:analytics` CustomEvent, and the window.gtag path. Only the native
 * bridge and Firebase's own naming rules live here.
 *
 * EXPORTS MUST MATCH analytics-transport.portal.js. build-web.mjs compares the
 * two and refuses to build on divergence.
 */

import { caps } from '../index.js?v=3bd14eb0045c';

const TRANSPORT_KEY = '__snapblocksFirebaseAnalyticsTransport';
const MAX_PARAMS = 25;
const MAX_PARAM_KEY_LENGTH = 40;
const MAX_STRING_LENGTH = 100;
const RESERVED_PREFIX_RE = /^(firebase_|google_|ga_)/i;

// Firebase collects these automatically. Logging one of our own under the same
// name is rejected on the native side — silently, in a release build — so it is
// cheaper to fail here where it is greppable. The prefix rule above does NOT
// cover these: they carry no reserved prefix, which is exactly what makes them
// easy to pick by accident (session_start was chosen once already).
const RESERVED_EVENT_NAMES = new Set([
    'ad_activeview', 'ad_click', 'ad_exposure', 'ad_impression', 'ad_query',
    'ad_reward', 'adunit_exposure', 'app_clear_data', 'app_exception',
    'app_remove', 'app_store_refund', 'app_store_subscription_cancel',
    'app_store_subscription_convert', 'app_store_subscription_renew',
    'app_update', 'app_upgrade', 'dynamic_link_app_open',
    'dynamic_link_app_update', 'dynamic_link_first_open', 'error',
    'first_open', 'first_visit', 'in_app_purchase', 'notification_dismiss',
    'notification_foreground', 'notification_open', 'notification_receive',
    'os_update', 'screen_view', 'session_start', 'user_engagement',
]);

/**
 * Vendor-specific half of event-name validation. js/analytics.js owns the
 * generic shape rule; this owns "and the vendor will also reject these".
 */
export const reservedEventName = name =>
    RESERVED_PREFIX_RE.test(name || '') ||
    RESERVED_EVENT_NAMES.has(String(name || '').toLowerCase());

const getPlugin = () => window.Capacitor?.Plugins?.FirebaseAnalytics || null;

/**
 * True when a native transport is actually present. js/analytics.js uses this
 * to avoid double-counting an event through both the native bridge and gtag in
 * a WebView that happens to expose both.
 */
export const hasNativeTransport = () => !!getPlugin();

const cleanParamKey = (key) => {
    let cleaned = String(key).trim().replace(/[^A-Za-z0-9_]/g, '_');
    if (!/^[A-Za-z]/.test(cleaned)) cleaned = `p_${cleaned}`;
    if (RESERVED_PREFIX_RE.test(cleaned)) cleaned = `sb_${cleaned}`;
    return cleaned.slice(0, MAX_PARAM_KEY_LENGTH);
};

const cleanParamValue = (value) => {
    if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'bigint') {
        const numberValue = Number(value);
        return Number.isSafeInteger(numberValue)
            ? numberValue
            : String(value).slice(0, MAX_STRING_LENGTH);
    }
    return undefined;
};

const vendorParams = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return {};

    const cleaned = {};
    let count = 0;
    for (const [rawKey, rawValue] of Object.entries(params)) {
        if (count >= MAX_PARAMS) break;
        const key = cleanParamKey(rawKey);
        const value = cleanParamValue(rawValue);
        if (!key || value === undefined || Object.prototype.hasOwnProperty.call(cleaned, key)) continue;
        cleaned[key] = value;
        count += 1;
    }
    return cleaned;
};

/**
 * @param eventName  the CustomEvent name js/analytics.js dispatches on
 * @param isValid    the facade's own name validator, so the shape rule stays
 *                   in one place rather than being duplicated per transport
 * @param onDebug    debug logger, owned by the facade
 */
export const installTransport = (eventName, isValid, onDebug) => {
    if (typeof window === 'undefined' || !caps.analytics || window[TRANSPORT_KEY]) return;

    const listener = ({ detail } = {}) => {
        if (!detail || !isValid(detail.event)) return;

        const plugin = getPlugin();
        if (!plugin || typeof plugin.logEvent !== 'function') return;

        const { event, ts: _timestamp, ...params } = detail;
        try {
            Promise.resolve(plugin.logEvent({
                name: event,
                params: vendorParams(params),
            })).catch((error) => onDebug?.('event failed', event, error));
        } catch (error) {
            onDebug?.('event failed', event, error);
        }
    };

    window.addEventListener(eventName, listener);
    // Module re-evaluation must not register a second native transport.
    window[TRANSPORT_KEY] = listener;
};