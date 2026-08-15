/**
 * Update check — "a new version is available" prompt at app open.
 *
 * On launch (and on resume, throttled) we fetch a tiny JSON from our own
 * domain and compare its version code against the installed build. If the
 * store has a newer build, we surface an in-app sheet with an "Update now"
 * button that deep-links to the Play Store.
 *
 * This is the in-app half of "notify users about a new update". The other half
 * — an OS push that reaches users who haven't opened the app — needs a push
 * backend and is intentionally not handled here.
 *
 * version.json shape (host at VERSION_URL, bump on every release):
 *   {
 *     "latestVersionCode": 43,            // Android versionCode of the new build
 *     "latestVersionName": "1.1.0",
 *     "minVersionCode": 40,               // optional — below this = forced update
 *     "title": "New update available",
 *     "message": "What's new in this release.",
 *     "url": <the store listing URL>
 *   }
 *
 * Everything fails open: no network, bad JSON, or no plugin → silent no-op.
 *
 * Both endpoints come from js/platform/links.js, which a portal build swaps for
 * an empty set — this is the app's only outbound request, and a package that is
 * supposed to make none should not contain the URL either.
 */

import state, { saveConfig } from './state.js?v=5071259f5c9c';
import { trackEvent } from './analytics.js?v=5071259f5c9c';
import { caps } from './platform/index.js?v=5071259f5c9c';
import { PLAY_STORE_URL as PLAY_URL, VERSION_URL } from './platform/links.js?v=5071259f5c9c';
const THROTTLE_MS = 6 * 60 * 60 * 1000; // re-check at most every 6h on resume

let lastCheckAt = 0;

const getCap = () => (typeof window !== 'undefined' ? window.Capacitor : null);

// Installed Android versionCode (App.getInfo().build). In a browser there's no
// build, so we report 0 and the check no-ops (nothing is ever "newer").
const getInstalledCode = async () => {
    const App = getCap()?.Plugins?.App;
    if (!App || !App.getInfo) return 0;
    try {
        const info = await App.getInfo();
        const n = parseInt(info?.build, 10);
        return Number.isFinite(n) ? n : 0;
    } catch (e) {
        return 0;
    }
};

// Fetch JSON via the native HTTP bridge when available (bypasses WebView CORS),
// else plain fetch. Cache-busted so a freshly-published version.json is seen.
const fetchJson = async (url) => {
    const bust = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const Http = getCap()?.Plugins?.CapacitorHttp;
    if (Http && Http.get) {
        const res = await Http.get({ url: bust, headers: { 'Cache-Control': 'no-cache' } });
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    }
    const res = await fetch(bust, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
};

const openStore = async (url) => {
    const App = getCap()?.Plugins?.App;
    try {
        if (App && App.openUrl) { await App.openUrl({ url }); return; }
    } catch (e) { /* fall through to web */ }
    if (typeof window !== 'undefined' && window.open) window.open(url, '_blank', 'noopener');
};

const UpdateCheck = {
    /**
     * Run the check. `reason` is just for telemetry ('launch' | 'resume').
     * Shows the update sheet via the UI module if a newer build exists.
     */
    async run(reason = 'launch') {
        // fetchJson below is the only outbound request the game makes. Portal
        // hosts forbid external calls outright, and a browser build has no
        // installed versionCode to compare against, so never start the check.
        if (!caps.updateCheck) return;
        const now = Date.now();
        if (reason === 'resume' && now - lastCheckAt < THROTTLE_MS) return;
        lastCheckAt = now;

        let data;
        try {
            data = await fetchJson(VERSION_URL);
        } catch (e) {
            return; // offline / not hosted yet — say nothing
        }
        if (!data || !Number.isFinite(Number(data.latestVersionCode))) return;

        const installed = await getInstalledCode();
        if (installed <= 0) return; // unknown (browser) — never prompt
        const latest = Number(data.latestVersionCode);
        if (latest <= installed) return; // already up to date

        const forced = Number.isFinite(Number(data.minVersionCode)) && installed < Number(data.minVersionCode);

        // Only allow store-ish URL schemes from the remote JSON; anything else
        // (javascript:, intent:, file:, ...) falls back to our Play Store page.
        const safeUrl = typeof data.url === 'string' && /^(https:\/\/|market:\/\/)/i.test(data.url.trim())
            ? data.url.trim()
            : PLAY_URL;

        // Optional updates only nag once per version code; forced always shows.
        if (!forced && (state.config.lastDismissedUpdateCode || 0) >= latest) return;

        state.updateInfo = {
            forced,
            latestCode: latest,
            versionName: data.latestVersionName || '',
            title: data.title || (forced ? 'Update required' : 'New update available'),
            message: data.message || 'A new version of SnapBlocks is ready with the latest fixes and content.',
            url: safeUrl,
        };
        trackEvent('update_prompt_shown', { reason, latestCode: latest, installedCode: installed, forced });
        if (state.modules.showScreen) state.modules.showScreen('update');
    },

    openStore,

    /** "Later" — remember this version code so we don't nag again until the next one. */
    dismiss() {
        const code = state.updateInfo?.latestCode || 0;
        if (code) {
            state.config.lastDismissedUpdateCode = code;
            saveConfig();
        }
        trackEvent('update_prompt_dismissed', { latestCode: code });
        state.updateInfo = null;
    },
};

export default UpdateCheck;
