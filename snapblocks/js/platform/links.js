/**
 * Outbound links and endpoints — plain browser build (playcoolstudio.com).
 *
 * A third variant exists because `web` is neither Android nor a portal, and
 * both of the other files are wrong for it:
 *
 *   links.js       keeps the AdMob-era store deep links and the version.json
 *                  endpoint. Nothing reads them on web (caps.storeLinks and
 *                  caps.updateCheck are both false), so they are dead strings
 *                  that a Poki or MSN reviewer nonetheless finds by viewing
 *                  source on the very link we sent them.
 *   links.portal.js blanks everything including PRIVACY_URL, which leaves the
 *                  Settings privacy row pointing at nothing.
 *
 * So: keep the one URL the browser build genuinely uses, drop the rest. The
 * privacy policy is a legal affordance rather than a capability, which is why
 * it survives here and the store links do not.
 *
 * scripts/build-web.mjs swaps this over links.js for --platform=web and refuses
 * to build if the exports have drifted from links.js.
 *
 * EXPORTS MUST MATCH links.js.
 */

// Empty rather than null/undefined so a consumer interpolating one into a
// template produces nothing instead of the string "undefined" — same contract
// as links.portal.js.
export const APP_PACKAGE_ID = '';
export const PLAY_STORE_URL = '';
export const storeDeepLink = () => '';
export const SHARE_INSTALL_URL = '';

export const PRIVACY_URL = 'https://playcoolstudio.com/privacy';

// The in-app update check is Android-only: a browser has no installed
// versionCode to compare against, so there is nothing to poll for.
export const VERSION_URL = '';
