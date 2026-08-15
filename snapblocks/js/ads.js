/**
 * Ad pacing and economy constants.
 *
 * This file is deliberately transport-free. Everything below is a pure function
 * of game state — the honeymoon cadence, the rewarded quiet window, the
 * clean-clear offer rule — and is worth keeping identical on every platform,
 * because a portal ad adapter wants the same cadence AdMob gets.
 *
 * The transport lives in js/platform/adapters/ads-transport.js and is
 * re-exported below, so call sites keep importing everything from './ads.js?v=3bd14eb0045c'
 * and do not care which adapter is in the build. That indirection is what lets
 * scripts/build-web.mjs drop a portal-safe transport in without touching a
 * single call site. See ads-transport.portal.js for why that matters.
 */

export {
    initializeAds,
    isRewardedReady,
    loadRewardedHintAd,
    showRewardedHintAd,
    loadInterstitialAd,
    showInterstitialAd,
    usingProductionAds,
} from './platform/adapters/ads-transport.js?v=3bd14eb0045c';

// One rewarded ad grants this many coins (= 1 hint's worth). Named *_COINS
// since the hint economy became a coin economy; see economy.js.
export const REWARDED_AD_COINS = 10;

// Milestone clean-clear: the player can WATCH a rewarded ad to EARN these coins
// (no longer handed out for free — that was letting players skip ads entirely).
// Set above a single hint so the optional ad is clearly worth the watch.
export const CLEAR_BONUS_AD_COINS = 20;

// Quiet time after any rewarded ad before an interstitial may show. Was 120s,
// which starved interstitials completely for players who tap "double it"
// every level — 60s still guarantees breathing room (a level takes about that
// long) without turning frequent rewarded viewers into a no-interstitial lane.
export const REWARDED_QUIET_MS = 60000;

/**
 * Interstitial pacing decision with the reason attached — the reason is
 * logged from game.js so "why aren't interstitials showing" is answerable
 * from analytics instead of guesswork on a device.
 */
export const interstitialDecision = (config, {
    levelIndex = 0,
    isDaily = false,
    isPrism = false,
    tier = 'easy',
} = {}) => {
    if (!config || config.adsRemoved) return { show: false, reason: 'ads_removed' };
    if (isDaily || isPrism) return { show: false, reason: 'special_level' };
    if (tier === 'hard' || tier === 'prism-finale') return { show: false, reason: 'hard_level' };
    if (levelIndex < 7) return { show: false, reason: 'honeymoon' };

    // Two-phase pacing: a gentle honeymoon (levels 8-20), then standard genre
    // cadence once the player is invested. Rewarded ads always buy quiet time.
    const ramped = levelIndex >= 20;
    const minGapMs = ramped ? 60000 : 80000;
    const minLevels = ramped ? 2 : 3;

    const now = Date.now();
    if (now - (config.lastInterstitialTs || 0) < minGapMs) return { show: false, reason: 'min_gap' };
    if (now - (config.lastRewardedAdTs || 0) < REWARDED_QUIET_MS) return { show: false, reason: 'rewarded_quiet' };
    if ((config.levelsSinceInterstitial || 0) < minLevels) return { show: false, reason: 'min_levels' };
    return { show: true, reason: 'ok' };
};

export const shouldShowInterstitialAfterLevel = (config, opts = {}) =>
    interstitialDecision(config, opts).show;

export const shouldOfferCleanClearBonus = (config, {
    levelIndex = 0,
    isDaily = false,
    isPrism = false,
    stars = 0,
    hintsUsed = 0,
    resets = 0,
    tier = 'easy',
} = {}) => {
    if (!config || config.adsRemoved) return false;
    if (isDaily || isPrism) return false;
    if (tier === 'hard' || tier === 'prism-finale') return false;
    if (stars < 3 || hintsUsed > 0 || resets > 0) return false;
    if (levelIndex < 5) return false;
    if ((levelIndex + 1) % 4 !== 0) return false;
    if (config.lastCleanClearBonusOfferLevel === levelIndex) return false;

    const sinceRewarded = Date.now() - (config.lastRewardedAdTs || 0);
    if (sinceRewarded < 120000) return false;

    return true;
};
