/**
 * Outbound links and endpoints — Android.
 *
 * Every absolute URL and every `market://` deep link in the game is declared
 * here so a portal package can be built with none of them. Three reasons they
 * cannot simply stay behind their capability gates:
 *
 *   - YouTube Playables forbids external network calls entirely, and a reviewer
 *     checks by scanning the bundle, not by watching it run.
 *   - A Play Store link inside a portal build reads as sending the portal's
 *     traffic to a competing store, which is the kind of thing that gets a game
 *     pulled rather than asked about.
 *   - `version.json` is the app's only outbound request. In a package that is
 *     supposed to make none, one is worth removing rather than gating.
 *
 * scripts/build-web.mjs swaps this file for links.portal.js on portal targets,
 * and refuses to build if the two files' exports have drifted apart.
 *
 * Consumers must treat every value here as possibly empty — see links.portal.js
 * for the contract. `storeLinks`/`updateCheck` in js/platform/index.js already
 * gate the call sites; these values going blank is the packaging half of the
 * same decision.
 */

export const APP_PACKAGE_ID = 'com.snapblocks.game';

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE_ID}`;

// Native opener target, so a tap lands in the Play Store app rather than a
// browser tab. Falls back to PLAY_STORE_URL when the scheme is unhandled.
export const storeDeepLink = () => `market://details?id=${APP_PACKAGE_ID}`;

// Prefer a cross-platform PlayCool Studio smart link here once the iOS listing
// is live. Until then, the published Google Play listing is the honest target.
export const SHARE_INSTALL_URL = PLAY_STORE_URL;

export const PRIVACY_URL = 'https://playcoolstudio.com/privacy';

// Polled by js/updateCheck.js. See that file for the payload shape.
export const VERSION_URL = 'https://playcoolstudio.com/version.json';