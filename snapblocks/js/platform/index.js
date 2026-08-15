import { DISPLAY_PLATFORM, PLATFORM } from './runtime.js?v=3bd14eb0045c';

/**
 * Platform capability seam.
 *
 * SnapBlocks ships as an Android/Capacitor app and as a plain browser build
 * (playcoolstudio.com now; CrazyGames / Poki / YouTube Playables / MSN later).
 * Everything that only exists inside the Capacitor WebView — the ad SDK, the
 * analytics bridge, Play Games, local notifications, the version.json check and
 * the store deep links — is gated on a capability flag rather than on a
 * `window.Capacitor` probe at each call site, so a portal build can be described
 * by one object instead of by the absence of plugins.
 *
 * Import this from any module that reaches for a native bridge. The rest of
 * the codebase keeps its `window.Capacitor?.Plugins?.X` accessors; the cap
 * decides whether that accessor is even consulted.
 */

/**
 * Every browser target starts here. Each portal then overrides only the caps it
 * actually differs on, so a row stays a diff against "plain browser" rather than
 * a copy that can drift out of step when a shared default changes.
 */
const BROWSER_CAPS = {
    ads: false,           // no AdMob SDK in a browser; portals bring their own
    analytics: false,     // no native bridge — trackEvent still feeds window.gtag
    cloudSave: false,     // Play Games Saved Games is Android-only; localStorage stays authoritative
    notifications: false, // Capacitor LocalNotifications only; no web-push story yet
    // TRUE on purpose. This cap means "the share affordance works", not
    // "the Capacitor Share plugin exists" — shareScore() already falls
    // through native share -> navigator.share -> clipboard, and the last
    // two are browser features. Turning it off would hide a button that
    // works everywhere.
    nativeShare: true,
    updateCheck: false,   // the app's only outbound request; portal rules forbid external calls
    storeLinks: false,    // store deep links are meaningless off-device
    safeAreaInsets: false,
    // Does this environment want gameplayStart/gameplayStop reported to a host?
    // See js/platform/lifecycle.js. False until a portal SDK is actually
    // integrated — reporting to nothing is not free, it is a call site that
    // looks integrated and is not.
    hostLifecycle: false,
    // May the build contain third-party ad SDK code or identifiers at all?
    // Distinct from `ads`: `ads` is "can I show one right now", this is "is the
    // string ca-app-pub-… allowed to exist in the shipped bundle". Portals scan
    // for it. scripts/validate-web-bundle.mjs enforces the false case.
    thirdPartyAdSdk: false,
};

const CAPS_BY_PLATFORM = {
    android: {
        ads: true,
        analytics: true,
        cloudSave: true,
        notifications: true,
        nativeShare: true,
        updateCheck: true,
        storeLinks: true,
        safeAreaInsets: true,
        hostLifecycle: false, // Android has no host to report to
        thirdPartyAdSdk: true,
    },

    // Plain browser — playcoolstudio.com, and the default for anything unknown.
    web: { ...BROWSER_CAPS },

    // CrazyGames Basic Launch: two weeks, limited audience, no SDK required.
    // Identical to `web` on purpose — the row exists so the platform name
    // survives detection (an unknown name collapses to 'web'), which is what
    // lets the lifecycle and ad adapters select on it later without a second
    // build flag. Full Launch flips ads + hostLifecycle here.
    crazygames: { ...BROWSER_CAPS },

    // Poki mandates its SDK from day one, so ads and lifecycle turn on together
    // with the adapter. Both stay false until js/platform/adapters/poki.js
    // exists; a true cap with no transport behind it is worse than a false one.
    poki: { ...BROWSER_CAPS },

    // YouTube Playables: sandboxed iframe, ZIP bundle, and — the constraint that
    // shapes everything — zero external network calls permitted.
    playables: { ...BROWSER_CAPS },

    // MSN and the aggregator route (Playgama, GamePix, Famobi). They inject
    // their own ad layer around the bundle and want one with none of its own,
    // which is exactly the browser baseline.
    aggregator: { ...BROWSER_CAPS },
};

// Build-time override for portal builds — injected into the page before the
// module graph loads (an inline <script> in index.html, or the portal's own
// wrapper). It must name a platform that has a capability row: an unknown
// string collapses to 'web', because a platform we cannot describe is one
// whose native bridges we must not assume, and because CSS and the rest of
// the app are written against a closed set of data-platform values.
export { PLATFORM } from './runtime.js?v=3bd14eb0045c';

export const caps = Object.freeze({ ...CAPS_BY_PLATFORM[PLATFORM] });

// css/layout.css keys off [data-platform]:not([data-platform="android"]), so
// stamp the root as early as the module graph allows — this runs on import,
// before any screen is mounted. The selector treats an *absent* attribute as
// "not a browser", which is what keeps Android from flashing scaled layout in
// the window before this line runs. Guarded because the Node validators import
// this graph with a stub `document`.
const rootEl = typeof document !== 'undefined' ? document.documentElement : null;
if (rootEl?.dataset) {
    rootEl.dataset.hostPlatform = PLATFORM;
    rootEl.dataset.platform = DISPLAY_PLATFORM;
}
