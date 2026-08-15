/**
 * Import-free runtime target detection.
 *
 * Keep this module a leaf: low-level layout/state modules may import it before
 * the capability graph is evaluated. That prevents state -> platform/index ->
 * state cycles while preserving one authoritative build target.
 */

const KNOWN_PLATFORMS = new Set([
    'android',
    'web',
    'crazygames',
    'poki',
    'playables',
    'aggregator',
]);

const overridePlatform = () => {
    if (typeof window === 'undefined') return '';
    const value = window.__SNAPBLOCKS_PLATFORM__;
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) return '';
    return KNOWN_PLATFORMS.has(name) ? name : 'web';
};

const detectPlatform = () => {
    const override = overridePlatform();
    if (override) return override;
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    return cap?.isNativePlatform?.() ? 'android' : 'web';
};

export const PLATFORM = detectPlatform();

/**
 * CrazyGames is a host, not a form factor. The Basic Launch build used to
 * equate the two, which forced the 760 x 520 desktop shell into the portal's
 * Android app and shrank it into a short strip in the middle of a phone.
 *
 * Pick geometry once, before state/canvas constants are created. A real mobile
 * user agent always receives the established 400 x 700 composition; a portrait
 * desktop preview does too, which makes the portal's mobile QR check useful
 * even when its embedded user-agent hint is incomplete.
 */
const crazyGamesWantsMobileLayout = () => {
    if (typeof window === 'undefined') return false;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const ua = nav?.userAgent || '';
    const mobileHint = nav?.userAgentData?.mobile === true
        || /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(ua)
        || (/Macintosh/i.test(ua) && (nav?.maxTouchPoints || 0) > 1);
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth || 0;
    const height = viewport?.height || window.innerHeight || 0;
    const portraitViewport = width > 0 && height > width;
    return mobileHint || portraitViewport;
};

export const CRAZYGAMES_LANDSCAPE = PLATFORM === 'crazygames'
    && !crazyGamesWantsMobileLayout();

// CSS uses data-platform as its visual-layout selector. Keep the actual host in
// PLATFORM/caps, while a compact CrazyGames session deliberately consumes the
// same styles as the ordinary responsive web/mobile surface.
export const DISPLAY_PLATFORM = PLATFORM === 'crazygames' && !CRAZYGAMES_LANDSCAPE
    ? 'web'
    : PLATFORM;
