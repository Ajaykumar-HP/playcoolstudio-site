/**
 * Analytics transport — portal builds (no native vendor).
 *
 * scripts/build-web.mjs copies this over analytics-transport.js for portal
 * targets. `caps.analytics` is already false in a browser, so nothing changes
 * at runtime; this exists so the shipped package names no analytics vendor at
 * all.
 *
 * js/analytics.js still dispatches its `snapblocks:analytics` CustomEvent and
 * still feeds window.gtag, so a portal that injects its own measurement snippet
 * gets every event without any change here.
 *
 * `reservedEventName` returns false rather than keeping the vendor's reserved
 * list: with no vendor there is nothing to be rejected by, and the facade's own
 * shape rule still applies. Events are validated, just not against rules that
 * no longer bind.
 *
 * EXPORTS MUST MATCH analytics-transport.js. build-web.mjs enforces it.
 */

export const reservedEventName = () => false;
export const hasNativeTransport = () => false;
export const installTransport = () => {};