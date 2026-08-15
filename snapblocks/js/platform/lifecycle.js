/**
 * Host gameplay lifecycle.
 *
 * CrazyGames and Poki both require the game to tell the host when active play
 * starts and stops, so the portal knows when it is safe to interrupt with an ad,
 * dim audio, or pause a background video. Their SDKs expose this next to their
 * ad calls, which makes it tempting to fold into the ad adapter.
 *
 * It is kept separate deliberately. "Is the player currently playing" is session
 * state, not advertising: an aggregator build with no ad layer at all still has
 * a correct answer to it, and a portal that later wants only analytics or only
 * pause-on-blur would otherwise force us to instantiate an ad adapter to get it.
 * Two small adapters that each mean one thing beat one that means two.
 *
 * Everything here no-ops until a portal SDK is actually integrated
 * (caps.hostLifecycle). The call sites go in first because they are the part
 * that needs judgement about *where* play begins and ends; wiring an SDK to
 * already-correct call sites is mechanical.
 */

import { PLATFORM, caps } from './index.js?v=5071259f5c9c';

/**
 * Per-platform implementations. Keyed by PLATFORM so a portal build selects its
 * own without a second build flag. Empty until an SDK lands — an absent entry
 * falls through to the no-op below, which is the correct behaviour for the
 * browser, aggregator and CrazyGames Basic Launch builds.
 *
 * A future entry looks like:
 *   crazygames: {
 *       start: () => window.CrazyGames?.SDK?.game?.gameplayStart(),
 *       stop:  () => window.CrazyGames?.SDK?.game?.gameplayStop(),
 *   }
 */
const ADAPTERS = {};

const adapter = () => (caps.hostLifecycle ? ADAPTERS[PLATFORM] || null : null);

/**
 * Both SDKs treat these as edge-triggered and misbehave on a repeated start.
 * SnapBlocks can legitimately call start twice — levelIntro() runs its body from
 * a Board.show callback that an intro watchdog may also complete — so the guard
 * lives here rather than at each call site, which keeps the call sites free to
 * be defensive.
 */
let playing = false;

export const gameplayStart = () => {
    if (playing) return;
    playing = true;
    try { adapter()?.start?.(); } catch { /* a host SDK must never break play */ }
};

export const gameplayStop = () => {
    if (!playing) return;
    playing = false;
    try { adapter()?.stop?.(); } catch { /* as above */ }
};

export const isGameplayActive = () => playing;