/**
 * Ad transport — AdMob (Android).
 *
 * Split out of js/ads.js so a portal package can physically exclude it. That
 * file keeps the pacing half, which is platform-agnostic and stays live
 * everywhere; this file holds the two things a portal must never receive:
 * the publisher/unit identifiers, and the calls into the AdMob plugin.
 *
 * Portals do not check whether ad code is reachable — they grep the uploaded
 * package. CrazyGames, Poki, Playables and the MSN aggregators all permit ads
 * only through their own SDK, so `ca-app-pub-…` appearing anywhere in the ZIP
 * is a finding even though caps.ads is false and none of this can run.
 * scripts/build-web.mjs swaps this file for ads-transport.portal.js in portal
 * builds; scripts/validate-web-bundle.mjs verifies the swap happened.
 *
 * KEEP THE EXPORT LIST IN SYNC with ads-transport.portal.js. build-web.mjs
 * compares the two and refuses to build if they diverge, because a missing
 * export here is a blank screen on the portal rather than a lost ad.
 */

import { caps } from '../index.js?v=3bd14eb0045c';

const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_REWARDED_ID = 'ca-app-pub-3940256099942544/5224354917';
const TEST_INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';

const PROD_APP_ID = 'ca-app-pub-8057701434795031~2454101074';
const PROD_REWARDED_ID = 'ca-app-pub-8057701434795031/2055723824';
const PROD_INTERSTITIAL_ID = 'ca-app-pub-8057701434795031/9000406128';

const MAX_AD_CONTENT_RATING = 'Teen';

let initialized = false;
let preparing = null;
let ready = false;
let interstitialPreparing = null;
let interstitialReady = false;

// Single choke point for the whole transport: every load/show call starts by
// asking for the plugin and returns its usual "no fill" value when it is
// missing, so a platform without ads takes the exact same path a device with a
// dead SDK already takes. Nothing downstream needs a new branch.
const getAdMob = () => {
    if (!caps.ads) return null;
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    return cap && cap.Plugins && cap.Plugins.AdMob ? cap.Plugins.AdMob : null;
};

const isRealAdUnit = (id) =>
    typeof id === 'string' &&
    /^ca-app-pub-\d{16}\/\d{10}$/.test(id) &&
    !id.includes('3940256099942544');

const isRealAppId = (id) =>
    typeof id === 'string' &&
    /^ca-app-pub-\d{16}~\d{10}$/.test(id) &&
    !id.includes('3940256099942544');

// The service falls back to Google's sample units while any production ID is
// blank or still points at Google's sample publisher.
export const usingProductionAds = () =>
    isRealAppId(PROD_APP_ID) &&
    isRealAdUnit(PROD_REWARDED_ID) &&
    isRealAdUnit(PROD_INTERSTITIAL_ID);

const rewardedAdId = () => (usingProductionAds() ? PROD_REWARDED_ID : TEST_REWARDED_ID);
const interstitialAdId = () => (usingProductionAds() ? PROD_INTERSTITIAL_ID : TEST_INTERSTITIAL_ID);

const rewardOptions = () => ({
    adId: rewardedAdId(),
    isTesting: !usingProductionAds(),
    npa: true,
    immersiveMode: true,
});

const interstitialOptions = () => ({
    adId: interstitialAdId(),
    isTesting: !usingProductionAds(),
    npa: true,
    immersiveMode: true,
});

export const initializeAds = async () => {
    if (initialized) return true;
    const AdMob = getAdMob();
    if (!AdMob || !AdMob.initialize) return false;

    await AdMob.initialize({
        maxAdContentRating: MAX_AD_CONTENT_RATING,
    });
    initialized = true;
    return true;
};

export const isRewardedReady = () => ready;

export const loadRewardedHintAd = async () => {
    const AdMob = getAdMob();
    if (!AdMob || !AdMob.prepareRewardVideoAd) return false;
    if (ready) return true;
    if (preparing) return preparing;

    preparing = (async () => {
        try {
            await initializeAds();
            await AdMob.prepareRewardVideoAd(rewardOptions());
            ready = true;
            return true;
        } catch (e) {
            ready = false;
            return false;
        } finally {
            preparing = null;
        }
    })();

    return preparing;
};

export const showRewardedHintAd = async () => {
    const AdMob = getAdMob();
    if (!AdMob || !AdMob.showRewardVideoAd) return false;

    const loaded = ready || await loadRewardedHintAd();
    if (!loaded) return false;

    try {
        const reward = await AdMob.showRewardVideoAd();
        return !!reward;
    } catch (e) {
        return false;
    } finally {
        ready = false;
        loadRewardedHintAd();
    }
};

export const loadInterstitialAd = async () => {
    const AdMob = getAdMob();
    if (!AdMob || !AdMob.prepareInterstitial) return false;
    if (interstitialReady) return true;
    if (interstitialPreparing) return interstitialPreparing;

    interstitialPreparing = (async () => {
        try {
            await initializeAds();
            await AdMob.prepareInterstitial(interstitialOptions());
            interstitialReady = true;
            return true;
        } catch (e) {
            interstitialReady = false;
            return false;
        } finally {
            interstitialPreparing = null;
        }
    })();

    return interstitialPreparing;
};

export const showInterstitialAd = async () => {
    const AdMob = getAdMob();
    if (!AdMob || !AdMob.showInterstitial) return false;

    const loaded = interstitialReady || await loadInterstitialAd();
    if (!loaded) return false;

    try {
        await AdMob.showInterstitial();
        return true;
    } catch (e) {
        return false;
    } finally {
        interstitialReady = false;
        loadInterstitialAd();
    }
};