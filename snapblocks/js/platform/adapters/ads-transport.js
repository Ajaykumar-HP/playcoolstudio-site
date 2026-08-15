/**
 * Ad transport — portal builds (no ad SDK at all).
 *
 * scripts/build-web.mjs copies this file over ads-transport.js when building
 * for a portal target, so the shipped package contains no ad identifiers and no
 * ad SDK calls. That is a packaging requirement, not a runtime one: caps.ads is
 * already false in a browser, so nothing here ever behaved differently — the
 * point is that a reviewer grepping the ZIP finds nothing to find.
 *
 * Every function returns the value the real transport returns when there is no
 * fill. js/ads.js and js/ui/index.js already handle that path (it is what a
 * device with a dead SDK does), so no call site needs a portal branch.
 *
 * When a portal SDK is integrated, it goes in a sibling — ads-transport.poki.js
 * and so on — selected by the same substitution map. This file stays as the
 * honest "no ads here" build for CrazyGames Basic Launch and the aggregators.
 *
 * EXPORTS MUST MATCH ads-transport.js exactly. build-web.mjs compares them and
 * refuses to build on any divergence.
 */

export const usingProductionAds = () => false;
export const initializeAds = async () => false;
export const isRewardedReady = () => false;
export const loadRewardedHintAd = async () => false;
export const showRewardedHintAd = async () => false;
export const loadInterstitialAd = async () => false;
export const showInterstitialAd = async () => false;