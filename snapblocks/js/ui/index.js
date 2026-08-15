/**
 * UI facade — mounts DOM screens into #sb-ui-root and wires delegated clicks
 * to navigation ([data-nav]) and actions ([data-action]).
 *
 * Two layers:
 *   - #sb-base    (one of the "base" screens; always present once initialized)
 *   - #sb-overlay (optional sheet on top — pause / ad)
 *
 * game.js calls UI.init(hooks) once with callbacks for gameplay verbs
 * (enterGame, exitGame, nextLevel, replay, toggleSound, ...). Every action
 * handled below either mutates state + persists, calls a hook, or navigates.
 */

import state, { saveConfig } from '../state.js?v=3bd14eb0045c';
import Theme from '../theme.js?v=3bd14eb0045c';
import { SCREENS } from './screens.js?v=3bd14eb0045c';
import icons from './icons.js?v=3bd14eb0045c';
import { evaluateTrophies, isThemeUnlocked, THEME_UNLOCKS } from '../progression.js?v=3bd14eb0045c';
import { getDailyCountdown } from '../daily.js?v=3bd14eb0045c';
import { setNotificationsEnabled } from '../notifications.js?v=3bd14eb0045c';
import {
    CLEAR_BONUS_AD_COINS,
    REWARDED_AD_COINS,
    loadRewardedHintAd,
    shouldOfferCleanClearBonus,
    showRewardedHintAd,
} from '../ads.js?v=3bd14eb0045c';
import { addCoins, canAfford, getCoins, HINT_COST, SOLVE_COST } from '../economy.js?v=3bd14eb0045c';
import { LEVEL_META } from '../levels.js?v=3bd14eb0045c';
import { SIZE as CHAPTER_SIZE } from '../chapters.js?v=3bd14eb0045c';
import { isTreasureLevel } from '../treasure.js?v=3bd14eb0045c';
import UpdateCheck from '../updateCheck.js?v=3bd14eb0045c';
import { trackEvent } from '../analytics.js?v=3bd14eb0045c';
import { caps, PLATFORM } from '../platform/index.js?v=3bd14eb0045c';
import { CRAZYGAMES_LANDSCAPE } from '../platform/runtime.js?v=3bd14eb0045c';
import { gameplayStop } from '../platform/lifecycle.js?v=3bd14eb0045c';
import { PLAY_STORE_URL, PRIVACY_URL, SHARE_INSTALL_URL, storeDeepLink } from '../platform/links.js?v=3bd14eb0045c';
import { countUp, springIn, breathe } from './motion.js?v=3bd14eb0045c';
// Browser-only gutter chrome outside the stage. Self-installing on import and a
// no-op on Android; the export exists so its progress block can be refreshed on
// the one event that can change it (see showBase).
import { refreshSidePanels } from './sidePanels.js?v=3bd14eb0045c';
// LAB (prototype) — self-contained in js/ui/lab/. Safe to delete with its call sites.
import { consumeLabLaunch, endLabSession, isLabMode, labPauseGuard, restartLabLevel, startLabLevel } from './lab/index.js?v=3bd14eb0045c';

const BASE_SCREENS    = ['splash', 'onboarding', 'menu', 'map', 'reveal', 'levels', 'level-intro', 'game', 'complete', 'daily', 'trophies', 'shop', 'settings', 'lab'];
const OVERLAY_SCREENS = ['pause', 'ad', 'game-settings', 'confirm-reset', 'reward', 'scene-view', 'update', 'cloud-conflict', 'rating'];
// Was 2800 to cover a two-stage studio-ident → app-intro sequence. With the
// studio ident removed the splash only has to cover module init and the first
// theme paint, so it holds just long enough to read the wordmark.
const STARTUP_SPLASH_MS = 1200;
const DIRECT_PORTAL_TUTORIAL = PLATFORM === 'crazygames';

// Store/links used by Settings (#7) now live in js/platform/links.js, so a
// portal build can ship without any of them. All three call sites below are
// already gated on caps.storeLinks; see links.portal.js for the empty contract.
const RATING_PROMPT_MIN_LEVEL = 10;
const RATING_PROMPT_LEVEL_GAP = 30;
const RATING_PROMPT_TIME_GAP_MS = 30 * 24 * 60 * 60 * 1000;
const RATING_PROMPT_MAX_DISMISSALS = 3;

let root, baseEl, overlayEl;
let currentBase = null;
let currentOverlay = null;
let sceneHooks = {};
let lastPointerActionAt = 0;
let dailyCountdownTimer = null;
let unsubscribeCloudSave = null;
let cloudConflictChoice = '';
let dismissedCloudConflict = '';

// ============================================================
// Mount / navigation
// ============================================================

const mount = () => {
    root = document.getElementById('sb-ui-root');
    root.innerHTML = `
        <div id="sb-base" class="sb-base-layer"></div>
        <div id="sb-overlay" class="sb-overlay" role="dialog" aria-hidden="true"></div>
        <div id="sb-tutorial-mix-status" class="sb-visually-hidden" role="status" aria-live="polite" aria-atomic="true"></div>
    `;
    baseEl    = document.getElementById('sb-base');
    overlayEl = document.getElementById('sb-overlay');

    // The game screen deliberately lets canvas touches pass through, so listen
    // at document level and only handle events that originate inside #sb-ui-root.
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('click', onClick);
    applyReducedMotion();
};

// Mirror config.reducedMotion to <html data-reduced-motion="..."> so the
// CSS selectors in components.css can dampen animations globally.
const applyReducedMotion = () => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute(
        'data-reduced-motion',
        state.config.reducedMotion ? 'true' : 'false'
    );
};

// Canvas effects are invisible to assistive technology. This dedicated live
// region is updated only by the successful tutorial mix event, never by a
// screen re-render, so replaying the tutorial announces once per actual mix.
const announceTutorialMix = () => {
    const region = document.getElementById('sb-tutorial-mix-status');
    if (!region) return;
    region.textContent = '';
    requestAnimationFrame(() => {
        region.textContent = 'Yellow and blue made green';
    });
};

// Give premium help assets enough time to finish their tactile response after a
// pointer release. Keeping this independent from the action itself means the
// hint/solve economy and game hooks remain unchanged.
const animateHelpAction = (el) => {
    if (!el?.classList.contains('sb-premium-help-action')) return;
    el.classList.remove('sb-help-activated');
    requestAnimationFrame(() => {
        el.classList.add('sb-help-activated');
        setTimeout(() => el.classList.remove('sb-help-activated'), 760);
    });
};

const handleUiEvent = (e) => {
    if (!root || !root.contains(e.target)) return false;
    const navEl = e.target.closest('[data-nav]');
    const actEl = e.target.closest('[data-action]');
    // When both match, the deeper element wins — so a [data-action] button nested
    // inside a [data-nav] card (e.g. the "view" eye on a place card) fires the
    // action instead of navigating.
    const useAction = actEl && (!navEl || (navEl.contains(actEl) && actEl !== navEl));
    if (useAction) {
        e.preventDefault();
        animateHelpAction(actEl);
        runAction(actEl.getAttribute('data-action'), actEl);
        return true;
    }
    if (navEl) {
        e.preventDefault();
        show(navEl.getAttribute('data-nav'), navEl);
        return true;
    }
    return false;
};

const onPointerUp = (e) => {
    if (handleUiEvent(e)) lastPointerActionAt = Date.now();
};

const onClick = (e) => {
    if (Date.now() - lastPointerActionAt < 450) {
        e.preventDefault();
        return;
    }
    handleUiEvent(e);
};

const show = (id, trigger) => {
    if (OVERLAY_SCREENS.includes(id)) showOverlay(id);
    else if (BASE_SCREENS.includes(id)) showBase(id, trigger);
};

// Live ticker for [data-hud="daily-reset"] — updates the HH:MM:SS countdown
// every second while the daily screen is visible. Cleared on navigation.
const startDailyCountdown = () => {
    stopDailyCountdown();
    const tick = () => {
        const nodes = baseEl ? baseEl.querySelectorAll('[data-hud="daily-reset"]') : [];
        if (!nodes.length) { stopDailyCountdown(); return; }
        const stamp = getDailyCountdown();
        nodes.forEach(n => { n.textContent = stamp; });
    };
    tick();
    dailyCountdownTimer = setInterval(tick, 1000);
};
const stopDailyCountdown = () => {
    if (dailyCountdownTimer) {
        clearInterval(dailyCountdownTimer);
        dailyCountdownTimer = null;
    }
};

const showBase = (id, trigger) => {
    hideOverlay();
    const prev = currentBase;
    // Only the portal shell consumes a global screen stamp. Android should not
    // acquire browser-layout state as a side effect of ordinary navigation.
    if (CRAZYGAMES_LANDSCAPE) document.documentElement.dataset.screen = id;
    let levelHint = null;
    if (id === 'game') {
        // LAB (prototype): the lab action already loaded its own board, and
        // enterGame would reset gameMode back to 'normal'. One-shot flag, so a
        // normal Play tap still takes the standard entry path.
        if (!consumeLabLaunch()) {
            levelHint = trigger && trigger.hasAttribute('data-level')
                ? parseInt(trigger.getAttribute('data-level'), 10)
                : null;
            sceneHooks.enterGame && sceneHooks.enterGame(levelHint);
        }
    } else if (prev === 'game') {
        // Leaving the board — quit, restart-to-menu, or a win routed straight to
        // the complete screen. victoryAnim() already stopped in the win case;
        // gameplayStop() is idempotent, so this is the catch-all for every exit
        // that is not a win rather than a duplicate of it.
        gameplayStop();
        // LAB (prototype): endLabSession returns true when it tore a lab board
        // down itself (it must not persist); false everywhere else.
        if (!endLabSession()) sceneHooks.exitGame && sceneHooks.exitGame();
    }

    // Grant + stage complete-screen rewards BEFORE render so the template can
    // show the earned coins and the optional inline "double it" button.
    // LAB (prototype): a lab clear must never grant or stage real coins, even if
    // game.js ends up routing a lab victory through the complete screen.
    if (id === 'complete') { if (isLabMode()) state.rewardInfo = null; else stageCompleteRewards(); }

    currentBase = id;
    baseEl.innerHTML = `<div class="sb-screen" data-screen="${id}">${SCREENS[id]()}</div>`;
    const screenEl = baseEl.firstElementChild;
    // Activate in next frame so CSS transition runs
    requestAnimationFrame(() => screenEl.classList.add('active'));

    // Per-screen lifecycle: start/stop the daily countdown ticker
    if (id === 'daily') startDailyCountdown();
    else stopDailyCountdown();

    // Post-render hooks that need the DOM in place
    if (id === 'complete') { countUpScore(); animateCompleteMoments(); }
    if (id === 'reveal') playReveal();
    if (id === 'settings') patchAppVersion();
    // The desktop gutter panels only ever show state that moves at a level
    // clear, and a level clear always navigates — so a screen change is a
    // sufficient refresh signal and no live subscription is needed.
    refreshSidePanels();
    maybeShowCloudConflict();
    if (CRAZYGAMES_LANDSCAPE) {
        document.dispatchEvent(new CustomEvent('snapblocks:screen-changed', { detail: { screen: id } }));
    }
};

// JS-driven flourishes on the win screen (WAAPI via motion.js): the earned
// coin total ticks up from 0, the reward cards spring in, and the Double-it
// CTA softly breathes for attention. Stars keep their CSS pop (screens.css) —
// this only covers what CSS can't: values we just computed and imperative
// per-mount animation. Everything inside is reduced-motion safe (motion.js
// jumps to final state), and re-renders via refreshCurrent simply show the
// template's true values with no animation.
const animateCompleteMoments = () => {
    if (!baseEl) return;
    const earnedEl = baseEl.querySelector('[data-earned-count]');
    if (earnedEl) {
        const total = parseInt(earnedEl.getAttribute('data-earned-count'), 10) || 0;
        earnedEl.textContent = '+0 coins';
        countUp(earnedEl, total, { prefix: '+', suffix: ' coins', duration: 760 });
    }
    springIn(baseEl.querySelector('.sb-complete-reward-line'), { delay: 520 });
    breathe(baseEl.querySelector('.sb-complete-double-btn'), { period: 3200 });
};

// Coin-fly: the coins earned on this clear arc from the win medal up to the
// header coin pill, which bumps as they land. Pure DOM in one pooled layer;
// skipped entirely under reduced motion.
const playCoinFly = () => {
    if (state.config.reducedMotion) return;
    // Level coins only — the arc has to match the headline it flies away from.
    // Day-scoped goal/streak coins are banked to the day and reported on the
    // menu, so counting them here would inflate the burst past the number.
    const total = getLevelEarnedCoins();
    if (total <= 0) return;
    const from = baseEl.querySelector('.sb-complete-medal');
    const to = baseEl.querySelector('[data-coin-target]');
    if (!from || !to) return;
    const f = from.getBoundingClientRect();
    const t = to.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'sb-coinfly';
    document.body.appendChild(layer);
    const count = Math.min(10, 4 + Math.ceil(total / 8));
    for (let i = 0; i < count; i++) {
        const c = document.createElement('i');
        c.innerHTML = icons.coin;
        const sx = f.left + f.width / 2 + (Math.random() * 44 - 22);
        const sy = f.top + f.height / 2 + (Math.random() * 24 - 12);
        c.style.left = `${sx}px`;
        c.style.top = `${sy}px`;
        c.style.setProperty('--dx', `${t.left + t.width / 2 - sx}px`);
        c.style.setProperty('--dy', `${t.top + t.height / 2 - sy}px`);
        c.style.animationDelay = `${500 + i * 80}ms`;
        layer.appendChild(c);
    }
    const lastDelay = 500 + (count - 1) * 80;
    setTimeout(() => {
        const pill = baseEl && baseEl.querySelector('[data-coin-target]');
        if (pill) {
            pill.classList.add('bump');
            setTimeout(() => pill.classList.remove('bump'), 450);
        }
    }, lastDelay + 480);
    setTimeout(() => layer.remove(), lastDelay + 1100);
};

// Animate any [data-hud="score"][data-target] from 0 to target. Runs once
// when the complete screen mounts. No-op under reduced motion.

// Stage the level-complete rewards. IMPORTANT: this NO LONGER auto-pops a
// "watch ad to double" dialog — doing that the instant a level ends felt like
// an ad ambush and is a top uninstall trigger. Earned coins are shown as cards
// on the complete screen, and the optional "Double it" lives as a calm inline
// button there (data-action="double-reward"). Nothing blocks the win moment.
// Coins THIS LEVEL paid (already credited): the one bundle game.js assembled
// and clamped — first-clear drip, chapter restore, treasure chest, Prism,
// Prism Pulse — plus the Daily reward, because on a Daily run that puzzle IS
// the level that was just played.
//
// Deliberately EXCLUDES Today's Goals (missions.js) and streak milestones
// (progression.js). Those are day-scoped: earned across a whole day of play,
// they merely settle on whichever level happened to end last. Doubling them
// made this one button worth 5 coins after an ordinary clear and ~95 after a
// chapter finale — a ~19x swing with the largest payout landing exactly where
// the player was already most engaged. They are still granted the instant they
// complete; they are reported on the menu's Today's goals card and the Daily
// screen's streak chip instead.
const getLevelEarnedCoins = () => {
    const earned = state.levelCoinsEarned || {};
    // `granted` is game.js's post-cap figure and already folds in prism/pulse.
    // The sum is the fallback for a save/state shape written before the cap.
    const bundle = Number.isFinite(earned.granted)
        ? earned.granted
        : (earned.total || 0) + (state.prismReward || 0) + (state.pulseReward || 0);
    return bundle + (state.dailyResult?.rewardCoinsGranted || 0);
};

// Floor for the "Double it" rewarded offer. A 30-second ad has to be worth at
// least one hint (HINT_COST = 10) or it reads as a bad trade and teaches the
// player to ignore the button — a mid-chapter clear only pays 2-5 coins, so a
// literal 2x would have offered +4. Doubling a level-scoped bundle already
// caps the top end at MAX_LEVEL_CLEAR_COINS, so this narrows the offer's whole
// range to 10-30 instead of 4-95.
const MIN_DOUBLE_OFFER_COINS = 10;

const stageCompleteRewards = () => {
    // rewardInfo exists only to drive the rewarded-ad offers (the inline
    // "Double it" on the complete screen and the reward sheet). With no ad
    // transport those buttons could never pay out, so stage nothing rather
    // than render an offer that always fails. Coins already granted by game.js
    // are unaffected — they are read from state.levelCoinsEarned, not here.
    if (!caps.ads) { state.rewardInfo = null; return; }
    // Level coins are already credited — the inline button offers to top them
    // up by the same amount again (or by the floor, whichever is larger).
    const levelCoins = getLevelEarnedCoins();
    if (levelCoins > 0) {
        const amount = Math.max(MIN_DOUBLE_OFFER_COINS, levelCoins);
        state.rewardInfo = {
            amount,
            doubled: false,
            preGranted: true,
            // The floor lifted the payout above a true 2x, so the button must
            // say "+N coins", not "2x reward". screens.js reads this.
            floored: amount > levelCoins,
            placement: 'reward_double',
        };
        return;
    }

    const meta = state.levelMeta || {};
    const shouldOffer = shouldOfferCleanClearBonus(state.config, {
        levelIndex: state.currentLevel,
        isDaily: state.gameMode === 'daily',
        isPrism: meta.kind === 'prism',
        stars: state.levelStars || 0,
        hintsUsed: state.levelHintsUsed || 0,
        resets: state.levelResets || 0,
        tier: meta.tier || 'easy',
    });
    if (!shouldOffer) { state.rewardInfo = null; return; }

    // Milestone clean clear: NO free coins (that steady drip let players skip
    // rewarded ads). Instead offer an OPTIONAL rewarded ad to EARN the bonus —
    // preGranted:false makes the inline button read "Watch ad for +N coins".
    state.config.lastCleanClearBonusOfferLevel = state.currentLevel;
    saveConfig();
    state.rewardInfo = {
        amount: CLEAR_BONUS_AD_COINS,
        doubled: false,
        preGranted: false,
        placement: 'clean_clear_earn',
    };
};

const countUpScore = () => {
    const el = baseEl.querySelector('[data-hud="score"]');
    if (!el) return;
    const target = parseInt(el.getAttribute('data-target') || '0', 10);
    if (state.config.reducedMotion || target <= 0) {
        el.textContent = target.toLocaleString();
        return;
    }
    const dur = 900;
    const t0 = performance.now();
    const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.floor(target * eased).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
};

// A short, pooled confetti burst over a target element. Pure DOM so it stays
// self-contained; skipped entirely under reduced motion.
const CONFETTI_COLORS = ['#f2453a', '#eab820', '#0ebc74', '#1e96e8', '#8d4ef5', '#fb7f18'];
const confettiBurst = (target, count = 26) => {
    if (state.config.reducedMotion || !target) return;
    const rect = target.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'sb-confetti';
    document.body.appendChild(layer);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.42;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('i');
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const dist = 90 + Math.random() * 150;
        p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
        p.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
        p.style.setProperty('--rot', `${(Math.random() * 720 - 360)}deg`);
        p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        p.style.left = `${cx}px`;
        p.style.top = `${cy}px`;
        p.style.animationDelay = `${Math.random() * 80}ms`;
        layer.appendChild(p);
    }
    setTimeout(() => layer.remove(), 1400);
};

// The restoration beat: the scene starts at the previous stage and blooms up
// to the newly-reached stage, with an audio swell. The full place (stage 3)
// also gets confetti. Honors reduced motion (instant, no particles).
const playReveal = () => {
    const scene = baseEl ? baseEl.querySelector('[data-reveal-scene]') : null;
    if (!scene) return;
    const target = state.justRestoredStage || 3;
    const bloom = () => {
        scene.setAttribute('data-stage', String(target));
        sceneHooks.celebrate && sceneHooks.celebrate();
        if (target >= 3) confettiBurst(scene);
    };
    if (state.config.reducedMotion) { bloom(); return; }
    setTimeout(bloom, 500);
};

// ============================================================
// Play Games account + cloud-conflict UI
// ============================================================

const getCloudSave = () => state.modules.cloudSave || null;
const cloudConflictSignature = conflict => conflict ? JSON.stringify(conflict) : '';

const refreshBaseOnly = () => {
    if (!currentBase || !baseEl) return;
    baseEl.innerHTML = `<div class="sb-screen active" data-screen="${currentBase}">${SCREENS[currentBase]()}</div>`;
    if (currentBase === 'settings') patchAppVersion();
};

const maybeShowCloudConflict = (cloud = getCloudSave()?.getState?.()) => {
    if (!cloud?.conflict || !currentBase || ['splash', 'onboarding', 'game'].includes(currentBase)) return;
    const signature = cloudConflictSignature(cloud.conflict);
    if (!signature || signature === dismissedCloudConflict || currentOverlay === 'cloud-conflict') return;
    cloudConflictChoice = '';
    showOverlay('cloud-conflict');
};

const onCloudStateChanged = (cloud) => {
    if (currentBase === 'settings') refreshBaseOnly();
    maybeShowCloudConflict(cloud);
};

const setupCloudSaveUI = () => {
    if (unsubscribeCloudSave) return;
    // Without a cloud transport there is no state worth re-rendering Settings
    // for and no conflict that can ever be raised.
    if (!caps.cloudSave) return;
    const cloud = getCloudSave();
    if (!cloud?.subscribe) return;
    unsubscribeCloudSave = cloud.subscribe(onCloudStateChanged);
    window.addEventListener('snapblocks:cloud-config-applied', () => {
        Theme.set(state.config.theme || 'cream');
        applyReducedMotion();
        refreshBaseOnly();
    });
};

const setCloudActionBusy = (el, label) => {
    if (!el) return;
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
    el.innerHTML = `<span class="sb-cloud-spinner" aria-hidden="true">${icons.refresh}</span>${label}`;
};

const selectCloudConflict = (choice) => {
    if (!overlayEl || currentOverlay !== 'cloud-conflict' || !choice) return;
    cloudConflictChoice = choice;
    overlayEl.querySelectorAll('[data-cloud-choice]').forEach(option => {
        const selected = option.getAttribute('data-cloud-choice') === choice;
        option.classList.toggle('selected', selected);
        option.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    const messages = {
        device: 'Confirming will overwrite the cloud save with this device’s progress.',
        cloud: 'Confirming will overwrite this device’s progress with the cloud save.',
        current: 'Confirming will use Cloud save A and overwrite this device and Cloud save B.',
        conflicting: 'Confirming will use Cloud save B and overwrite this device and Cloud save A.',
    };
    const labels = {
        device: 'Use this device',
        cloud: 'Use cloud save',
        current: 'Use Cloud save A',
        conflicting: 'Use Cloud save B',
    };
    const note = overlayEl.querySelector('.sb-cloud-overwrite-note');
    if (note) note.textContent = messages[choice] || 'Review this selection before confirming.';
    const confirm = overlayEl.querySelector('[data-action="cloud-confirm-conflict"]');
    if (confirm) {
        confirm.textContent = labels[choice] || 'Use selected progress';
        confirm.disabled = false;
        confirm.setAttribute('aria-disabled', 'false');
    }
};

const showOverlay = (id) => {
    currentOverlay = id;
    overlayEl.innerHTML = SCREENS[id]();
    overlayEl.setAttribute('aria-hidden', 'false');
    if (id === 'cloud-conflict') {
        overlayEl.setAttribute('aria-modal', 'true');
        overlayEl.setAttribute('aria-labelledby', 'cloud-conflict-title');
        overlayEl.setAttribute('aria-describedby', 'cloud-conflict-description');
    } else {
        overlayEl.removeAttribute('aria-modal');
        overlayEl.removeAttribute('aria-labelledby');
        overlayEl.removeAttribute('aria-describedby');
    }
    // Guard against a fast open→close: if the overlay was already dismissed by
    // the time this frame runs, re-adding 'active' would strand its blur
    // backdrop over the whole app.
    requestAnimationFrame(() => {
        if (currentOverlay === id) {
            overlayEl.classList.add('active');
            if (id === 'cloud-conflict') overlayEl.querySelector('[data-cloud-choice]')?.focus();
        }
    });
    // LAB (prototype): labPauseGuard does the same freeze without persisting.
    if (!labPauseGuard()) sceneHooks.pauseGame && sceneHooks.pauseGame();
};

/**
 * The single entry point for "you can't afford this help" anywhere in the app.
 * `kind` is 'hint' | 'solve' (or null for a generic prompt) and only decides
 * the sheet's heading — the sheet itself is the same rewarded-ad offer.
 *
 * Gameplay modules reach this through state.modules.promptForCoins (registered
 * in init) so js/game.js and js/hintSystem.js never have to import the UI.
 */
const promptForCoins = (kind = null) => {
    state.coinPrompt = (kind === 'hint' || kind === 'solve') ? kind : null;
    showOverlay('ad');
};

const hideOverlay = () => {
    if (!currentOverlay) return;
    if (currentOverlay === 'ad') state.coinPrompt = null;
    overlayEl.classList.remove('active');
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.removeAttribute('aria-modal');
    overlayEl.removeAttribute('aria-labelledby');
    overlayEl.removeAttribute('aria-describedby');
    currentOverlay = null;
    // Clean up DOM after transition finishes
    setTimeout(() => {
        if (!currentOverlay) overlayEl.innerHTML = '';
    }, 240);
    sceneHooks.resumeGame && sceneHooks.resumeGame();
};

const refreshCurrent = () => {
    if (currentBase)    baseEl.innerHTML    = `<div class="sb-screen active" data-screen="${currentBase}">${SCREENS[currentBase]()}</div>`;
    if (currentOverlay) overlayEl.innerHTML = SCREENS[currentOverlay]();
};

const setAdStatus = (message, loading = false) => {
    if (!overlayEl) return;
    const status = overlayEl.querySelector('[data-ad-status]');
    const btn = overlayEl.querySelector('[data-action="watch-ad-for-hint"]');
    if (status) status.textContent = message;
    if (btn) {
        btn.disabled = loading;
        btn.innerHTML = loading
            ? `${icons.clock} Loading ad...`
            : `${icons.play} Watch ad for +${REWARDED_AD_COINS}`;
    }
};

// ============================================================
// Live HUD updates — surgical DOM edits while the game screen is up.
// Avoids re-rendering the whole screen on every frame.
// ============================================================

// Query both the base screen layer and any active overlay so the same
// data-hud attribute updates the pause sheet alongside the gameplay HUD.
const setHud = (key, value) => {
    [baseEl, overlayEl].forEach(layer => {
        if (!layer) return;
        layer.querySelectorAll(`[data-hud="${key}"]`).forEach(n => { n.textContent = value; });
    });
};

const setProgressBar = (fraction) => {
    [baseEl, overlayEl].forEach(layer => {
        if (!layer) return;
        const bar = layer.querySelector('[data-hud="progress"] > span');
        if (bar) bar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    });
};

const updateHud = ({ elapsedSec, placed, total, coins, mixes, mixBonus, objective, pulse } = {}) => {
    if (currentBase !== 'game') return;
    if (typeof elapsedSec === 'number') {
        const m = Math.floor(elapsedSec / 60);
        const s = elapsedSec % 60;
        const stamp = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        setHud('timer', stamp);
        setHud('pause-time', stamp);
    }
    if (typeof placed === 'number' && typeof total === 'number') {
        setHud('count', `${placed}/${total}`);
        setHud('pause-count', `${placed} / ${total}`);
        setProgressBar(total ? placed / total : 0);
    }
    if (typeof coins === 'number') {
        setHud('coins', coins);
    }
    if (typeof mixes === 'number') {
        setHud('mixes', mixes);
        // Pulse the mix chip so the player notices the count climbed.
        const chip = baseEl ? baseEl.querySelector('.sb-mix-chip') : null;
        if (chip) {
            chip.classList.remove('pulse');
            // Force reflow so the animation re-triggers
            void chip.offsetWidth;
            chip.classList.add('pulse');
        }
    }
    if (typeof objective === 'string') {
        setHud('objective', objective);
    }
    if (typeof pulse === 'string') {
        setHud('pulse', pulse);
        const chip = baseEl ? baseEl.querySelector('.sb-pulse-chip') : null;
        if (chip) {
            chip.classList.remove('pulse');
            void chip.offsetWidth;
            chip.classList.add('pulse');
        }
    }
};

// ============================================================
// Actions
// ============================================================

// Set + persist a theme the player is allowed to use. Owned themes are
// remembered so a theme stays usable even if star requirements change later.
const applyTheme = (name) => {
    Theme.set(name);
    state.config.theme = name;
    const owned = state.config.ownedThemes || [];
    if (!owned.includes(name)) owned.push(name);
    state.config.ownedThemes = owned;
    saveConfig();
    evaluateTrophies();
    // Pre-rendered board canvas is baked with the previous theme's
    // colors; tell game.js to redraw it before we re-render the UI.
    if (state.modules.rebuildBoardForTheme) state.modules.rebuildBoardForTheme();
    refreshCurrent();
};

const isRatingMilestone = (completedLevel) => completedLevel === RATING_PROMPT_MIN_LEVEL
    || (completedLevel > RATING_PROMPT_MIN_LEVEL
        && (completedLevel - RATING_PROMPT_MIN_LEVEL) % RATING_PROMPT_LEVEL_GAP === 0);

const shouldShowRatingPrompt = () => {
    // The sheet's only real button opens the Play listing, so without store
    // links there is nothing left to ask for.
    if (!caps.storeLinks) return false;
    const cfg = state.config;
    const completedLevel = (state.currentLevel || 0) + 1;
    const now = Date.now();
    if (state.gameMode !== 'normal' || currentBase !== 'complete' || currentOverlay) return false;
    if (!state.levelClearResult?.isFirstClear || (state.levelStars || 0) < 3) return false;
    if ((cfg.unlocked || 0) < RATING_PROMPT_MIN_LEVEL || !isRatingMilestone(completedLevel)) return false;
    if (cfg.ratingPromptAccepted || (cfg.ratingPromptDismissals || 0) >= RATING_PROMPT_MAX_DISMISSALS) return false;
    if ((cfg.ratingPromptLastLevel ?? -1) >= 0
        && completedLevel - cfg.ratingPromptLastLevel < RATING_PROMPT_LEVEL_GAP) return false;
    if ((cfg.ratingPromptLastTs || 0) > 0
        && now - cfg.ratingPromptLastTs < RATING_PROMPT_TIME_GAP_MS) return false;
    if ((cfg.lastRewardedAdTs || 0) > 0 && now - cfg.lastRewardedAdTs < 60_000) return false;
    return true;
};

const stageRatingPrompt = () => {
    const completedLevel = (state.currentLevel || 0) + 1;
    state.config.ratingPromptLastLevel = completedLevel;
    state.config.ratingPromptLastTs = Date.now();
    saveConfig();
    trackEvent('review_prompt_shown', {
        levelIndex: state.currentLevel || 0,
        level: completedLevel,
        stars: state.levelStars || 0,
        dismissalCount: state.config.ratingPromptDismissals || 0,
    });
};

const advanceToNextLevel = async ({ suppressInterstitial = false } = {}) => {
    if (sceneHooks.nextLevel) await sceneHooks.nextLevel({ suppressInterstitial });
    const idx = state.introLevel?.idx ?? 0;
    const meta = LEVEL_META[idx] || {};
    const isFrost = meta.tier === 'shape' && idx >= 30;
    if (meta.kind === 'prism' || isFrost || isTreasureLevel(idx) || idx % CHAPTER_SIZE === 0) {
        show('level-intro');
    } else {
        const trigger = document.createElement('button');
        trigger.setAttribute('data-level', String(idx));
        show('game', trigger);
    }
};

const runAction = async (action, el) => {
    switch (action) {
        case 'finish-onboarding':
            // End of the passive carousel — kick into the interactive tutorial.
            // tutorialCompleted is only flipped once the player actually clears
            // the three tutorial puzzles (or hits "skip" inside the coachmark).
            state.onboardingStep = 0;
            state.onboardingTourMode = false;
            sceneHooks.playTutorial && sceneHooks.playTutorial();
            show('game');
            break;

        case 'skip-onboarding':
            // Hard skip from the carousel: jump straight to the menu without
            // playing the tutorial. Marks tutorialCompleted so we don't pester.
            state.config.tutorialCompleted = true;
            state.onboardingStep = 0;
            state.onboardingTourMode = false;
            saveConfig();
            show('menu');
            break;

        case 'skip-tutorial':
            sceneHooks.skipTutorial && sceneHooks.skipTutorial();
            break;

        case 'replay-tutorial':
            sceneHooks.playTutorial && sceneHooks.playTutorial();
            show('game');
            break;

        case 'replay-tour':
            // Tour mode shows the full 5-card carousel; first-run onboarding
            // is trimmed to 2 cards so new players reach the tutorial fast.
            state.onboardingTourMode = true;
            state.onboardingStep = 0;
            show('onboarding');
            break;

        case 'dismiss-mix-coach':
            state.config.mixCoachSeen = true;
            saveConfig();
            refreshCurrent();
            break;

        case 'dismiss-frost-coach':
            state.config.frostCoachSeen = true;
            saveConfig();
            refreshCurrent();
            break;

        case 'dismiss-pulse-coach':
            state.config.pulseCoachSeen = true;
            saveConfig();
            refreshCurrent();
            break;

        case 'dismiss-anchored-coach':
            state.config.anchoredCoachSeen = true;
            saveConfig();
            refreshCurrent();
            break;

        case 'next-onboarding':
            state.onboardingStep = Math.min(4, (state.onboardingStep || 0) + 1);
            refreshCurrent();
            break;

        case 'prev-onboarding':
            state.onboardingStep = Math.max(0, (state.onboardingStep || 0) - 1);
            refreshCurrent();
            break;

        case 'resume':
            show('game', el);
            break;

        case 'show-complete-after-reveal':
            // Restoration is the emotional payoff; the normal completion
            // screen still follows so players can review their solved board,
            // stars and rewards before explicitly starting the next level.
            show('complete', el);
            break;

        case 'next-level': {
            // Prepare the next level (interstitial + index). The full intro
            // screen only appears where it earns its tap — chapter openers and
            // special levels (Prism / Frost). Routine levels flow straight into
            // play so the loop stays one tap per level.
            if (shouldShowRatingPrompt()) {
                stageRatingPrompt();
                showOverlay('rating');
                break;
            }
            await advanceToNextLevel();
            break;
        }

        case 'replay':
            sceneHooks.replay && sceneHooks.replay();
            if (currentBase !== 'game') show('game');
            break;

        case 'reset-level':
            showOverlay('confirm-reset');
            break;

        case 'confirm-reset-level':
            hideOverlay();
            sceneHooks.replay && sceneHooks.replay();
            if (currentBase !== 'game') show('game');
            break;

        case 'quit-to-menu': {
            // LAB (prototype): leaving a lab board returns to the Lab list, not
            // the normal level flow. Read the mode before showBase clears it.
            const dest = isLabMode() ? 'lab' : 'menu';
            hideOverlay();
            show(dest);
            break;
        }

        // ---- LAB (prototype) actions ----
        case 'play-lab': {
            const idx = parseInt(el?.getAttribute('data-lab-index') || '', 10);
            if (!startLabLevel(idx)) {
                showBackToast('Lab levels are not available in this build yet');
                break;
            }
            show('game');
            break;
        }

        case 'restart-lab':
            hideOverlay();
            if (!restartLabLevel()) { showBackToast('Could not restart this lab level'); break; }
            // Already on the game screen — clear the one-shot launch flag so it
            // can't suppress the next real enterGame.
            if (currentBase === 'game') consumeLabLaunch();
            else show('game');
            break;
        // ---- end LAB actions ----

        case 'cloud-sign-in': {
            const cloud = getCloudSave();
            if (!cloud?.signIn) break;
            setCloudActionBusy(el, 'Signing in…');
            await cloud.signIn();
            break;
        }

        case 'cloud-sync-now': {
            const cloud = getCloudSave();
            if (!cloud?.syncNow) break;
            setCloudActionBusy(el, 'Syncing…');
            await cloud.syncNow();
            break;
        }

        case 'cloud-retry': {
            const cloud = getCloudSave();
            if (!cloud?.refresh) break;
            setCloudActionBusy(el, 'Checking…');
            await cloud.refresh();
            break;
        }

        case 'cloud-review-conflict':
            dismissedCloudConflict = '';
            cloudConflictChoice = '';
            showOverlay('cloud-conflict');
            break;

        case 'cloud-select-conflict':
            selectCloudConflict(el?.getAttribute('data-cloud-choice') || '');
            break;

        case 'cloud-confirm-conflict': {
            const cloud = getCloudSave();
            if (!cloud?.resolveConflict || !cloudConflictChoice) break;
            const selected = cloudConflictChoice;
            setCloudActionBusy(el, 'Applying progress…');
            const note = overlayEl?.querySelector('.sb-cloud-overwrite-note');
            if (note) note.textContent = 'Applying the selected progress. Keep SnapBlocks open…';
            const applied = await cloud.resolveConflict(selected);
            const next = cloud.getState?.();
            if (applied && !next?.conflict) {
                cloudConflictChoice = '';
                dismissedCloudConflict = '';
                hideOverlay();
                if (currentBase === 'settings') refreshBaseOnly();
                showBackToast('Progress synced');
            } else {
                cloudConflictChoice = '';
                if (currentOverlay === 'cloud-conflict') {
                    overlayEl.innerHTML = SCREENS['cloud-conflict']();
                    const status = overlayEl.querySelector('.sb-cloud-overwrite-note');
                    if (status) status.textContent = 'Could not apply that save. Both copies are still safe; try again.';
                }
            }
            break;
        }

        case 'cloud-cancel-conflict': {
            const conflict = getCloudSave()?.getState?.().conflict;
            dismissedCloudConflict = cloudConflictSignature(conflict);
            cloudConflictChoice = '';
            hideOverlay();
            if (currentBase === 'settings') refreshBaseOnly();
            break;
        }

        case 'rate-app':
            state.config.ratingPromptAccepted = true;
            saveConfig();
            trackEvent('review_store_opened', { placement: 'settings' });
            await openExternal(storeDeepLink(), PLAY_STORE_URL);
            break;

        case 'rating-rate-now':
            state.config.ratingPromptAccepted = true;
            saveConfig();
            trackEvent('review_store_opened', {
                placement: 'between_levels',
                levelIndex: state.currentLevel || 0,
            });
            hideOverlay();
            await openExternal(storeDeepLink(), PLAY_STORE_URL);
            await advanceToNextLevel({ suppressInterstitial: true });
            break;

        case 'rating-later':
            state.config.ratingPromptDismissals = Math.min(
                RATING_PROMPT_MAX_DISMISSALS,
                (state.config.ratingPromptDismissals || 0) + 1
            );
            saveConfig();
            trackEvent('review_prompt_dismissed', {
                levelIndex: state.currentLevel || 0,
                dismissalCount: state.config.ratingPromptDismissals,
            });
            hideOverlay();
            await advanceToNextLevel({ suppressInterstitial: true });
            break;

        case 'open-privacy':
            openExternal(PRIVACY_URL);
            break;

        case 'update-now':
            UpdateCheck.openStore(state.updateInfo?.url);
            break;

        case 'update-later':
            UpdateCheck.dismiss();
            hideOverlay();
            break;

        case 'play-daily':
            sceneHooks.playDaily && sceneHooks.playDaily();
            show('game');
            break;

        case 'close-overlay':
            hideOverlay();
            break;

        case 'view-scene': {
            const ch = parseInt(el?.getAttribute('data-chapter'), 10);
            state.viewSceneChapter = Number.isFinite(ch) ? ch : 0;
            showOverlay('scene-view');
            break;
        }

        case 'close-reward':
            state.rewardInfo = null;
            hideOverlay();
            break;

        case 'double-reward': {
            const info = state.rewardInfo || {};
            const amt = info.amount || 0;
            if (amt <= 0 || info.doubled) { if (currentOverlay) hideOverlay(); break; }
            if (el) { el.disabled = true; el.innerHTML = `${icons.clock} Loading ad...`; }
            const placement = info.placement || 'reward_double';
            trackEvent('ad_reward_started', { placement, reward: 'coins', rewardAmount: amt });
            (async () => {
                const rewarded = await showRewardedHintAd();
                if (rewarded) {
                    addCoins(amt); // grant the same again = doubled
                    state.config.lastRewardedAdTs = Date.now();
                    state.rewardInfo = { ...info, doubled: true };
                    saveConfig();
                    updateHud({ coins: getCoins() });
                    trackEvent('ad_reward_granted', { placement, reward: 'coins', rewardAmount: amt, coinsAvailable: getCoins() });
                    loadRewardedHintAd();
                    refreshCurrent(); // re-render so the button shows its "doubled" state
                } else if (el) {
                    // Restore the label the template chose. A flat "Double it"
                    // here lied on the two offers that are not a literal 2x:
                    // the clean-clear earn and a floored double.
                    el.disabled = false;
                    el.innerHTML = `${icons.play} ${info.preGranted && !info.floored ? 'Double it — watch ad' : `Watch a short ad for +${amt} coins`}`;
                }
            })();
            break;
        }

        case 'undo':
            sceneHooks.undo && sceneHooks.undo();
            break;

        case 'redo':
            sceneHooks.redo && sceneHooks.redo();
            break;

        case 'use-hint':
            if (canAfford(HINT_COST)) {
                sceneHooks.useHint && sceneHooks.useHint();
                updateHud({ coins: getCoins() });
            } else {
                promptForCoins('hint');
            }
            break;

        case 'solve-piece':
            if (canAfford(SOLVE_COST)) {
                sceneHooks.solvePiece && sceneHooks.solvePiece();
                updateHud({ coins: getCoins() });
            } else {
                promptForCoins('solve');
            }
            break;

        case 'watch-ad-for-hint':
            setAdStatus('Preparing rewarded ad...', true);
            trackEvent('ad_reward_started', {
                placement: 'out_of_coins',
                reward: 'coins',
                rewardAmount: REWARDED_AD_COINS,
            });
            (async () => {
                const rewarded = await showRewardedHintAd();
                if (rewarded) {
                    addCoins(REWARDED_AD_COINS);
                    state.config.lastRewardedAdTs = Date.now();
                    saveConfig();
                    updateHud({ coins: getCoins() });
                    trackEvent('ad_reward_granted', {
                        placement: 'out_of_coins',
                        reward: 'coins',
                        rewardAmount: REWARDED_AD_COINS,
                        coinsAvailable: getCoins(),
                    });
                    // Celebrate the earned coins (with an optional double-it).
                    state.rewardInfo = { amount: REWARDED_AD_COINS, doubled: false };
                    showOverlay('reward');
                    loadRewardedHintAd();
                } else {
                    setAdStatus('Ad is not ready yet. Try Focus Prism or tap again in a moment.', false);
                }
            })();
            break;


        case 'share-score':
            shareScore(el);
            break;

        case 'toggle-sound':
            state.config.sound = !state.config.sound;
            sceneHooks.toggleSound && sceneHooks.toggleSound(state.config.sound);
            saveConfig();
            if (currentOverlay) {
                refreshCurrent();
            } else if (currentBase === 'game') {
                const btn = baseEl.querySelector('[data-action="toggle-sound"]');
                if (btn) {
                    btn.classList.toggle('muted', !state.config.sound);
                    const icon = btn.querySelector('.sb-ctrl-icon');
                    if (icon) icon.innerHTML = state.config.sound ? icons.volume : icons.mute;
                    const label = btn.querySelector('.sb-ctrl-label');
                    if (label) label.textContent = state.config.sound ? 'Sound' : 'Muted';
                }
            } else {
                refreshCurrent();
            }
            break;

        case 'toggle-music':
            state.config.music = !state.config.music;
            sceneHooks.toggleMusic && sceneHooks.toggleMusic(state.config.music);
            saveConfig();
            if (currentOverlay) {
                refreshCurrent();
            } else if (currentBase === 'game') {
                const btn = baseEl.querySelector('[data-action="toggle-music"]');
                if (btn) {
                    btn.classList.toggle('muted', !state.config.music);
                    const icon = btn.querySelector('.sb-ctrl-icon');
                    if (icon) icon.innerHTML = state.config.music ? icons.music : icons.musicOff;
                    const label = btn.querySelector('.sb-ctrl-label');
                    if (label) label.textContent = state.config.music ? 'Music' : 'Quiet';
                }
            } else {
                refreshCurrent();
            }
            break;

        case 'toggle-haptics':
            state.config.haptics = !state.config.haptics;
            saveConfig();
            refreshCurrent();
            break;

        case 'toggle-colorblind':
            state.config.colorblind = !state.config.colorblind;
            saveConfig();
            refreshCurrent();
            break;

        case 'toggle-reducedmotion':
            state.config.reducedMotion = !state.config.reducedMotion;
            saveConfig();
            applyReducedMotion();
            refreshCurrent();
            break;

        case 'toggle-notifications':
            // setNotificationsEnabled persists the flag and handles the OS
            // permission dialog / cancellation; we just flip and re-render.
            setNotificationsEnabled(!state.config.notifications);
            refreshCurrent();
            break;

        case 'cycle-theme': {
            // Cycle through unlocked themes only — locked ones are visible in
            // the settings picker with their star price, not reachable here.
            const keys = THEME_UNLOCKS.filter(t => isThemeUnlocked(t.key)).map(t => t.key);
            const idx = keys.indexOf(Theme.getKey());
            applyTheme(keys[(idx + 1) % keys.length] || 'cream');
            break;
        }

        case 'select-theme': {
            const name = el.getAttribute('data-theme-name');
            const known = THEME_UNLOCKS.some(t => t.key === name);
            if (known && isThemeUnlocked(name)) applyTheme(name);
            break;
        }

        default:
            // Unknown action — silently ignore
            break;
    }
};

const writeClipboardFallback = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (e) {
        copied = false;
    }
    document.body.removeChild(ta);
    return copied ? Promise.resolve() : Promise.reject(new Error('copy failed'));
};

const markShareCopied = (el) => {
    if (!el) return;
    const previous = el.innerHTML;
    el.innerHTML = `${icons.check} Copied`;
    el.disabled = true;
    setTimeout(() => {
        el.innerHTML = previous;
        el.disabled = false;
    }, 1400);
};

const getNativeShare = () => {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins.Share ? cap.Plugins.Share : null;
};

const shareWasCancelled = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    return error?.name === 'AbortError' || message.includes('cancel');
};

const shareScore = async (el) => {
    const lv = (state.currentLevel || 0) + 1;
    const sec = state.levelElapsed || 0;
    const time = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const mixes = state.levelMixes || 0;
    const stars = state.levelStars || 1;
    const newBest = !!state.levelClearResult?.bestTime?.isNewBest;
    const text = state.gameMode === 'daily'
        ? `I completed today's SnapBlocks Focus Prism with ${stars}/3 stars in ${time}! Can you restore the color too?`
        : `I solved SnapBlocks Level ${lv} with ${stars}/3 stars in ${time}${mixes ? ` and made ${mixes} Prism Mix${mixes === 1 ? '' : 'es'}` : ''}${newBest ? ' — a new personal best!' : '!'} Can you beat it?`;
    const shareData = {
        title: 'SnapBlocks',
        text,
        url: SHARE_INSTALL_URL,
        dialogTitle: 'Share your SnapBlocks achievement',
    };

    try {
        trackEvent('achievement_share_opened', {
            mode: state.gameMode || 'normal',
            levelIndex: state.currentLevel || 0,
            stars,
        });
        const nativeShare = getNativeShare();
        if (nativeShare && nativeShare.share) {
            await nativeShare.share(shareData);
            trackEvent('achievement_share_completed', { channel: 'native' });
            return;
        }
        if (navigator.share) {
            await navigator.share({ title: shareData.title, text: shareData.text, url: shareData.url });
            trackEvent('achievement_share_completed', { channel: 'web' });
            return;
        }
    } catch (e) {
        if (shareWasCancelled(e)) return;
        // Fall through to clipboard when Android WebView declines native share.
    }

    try {
        await writeClipboardFallback(`${text}\n${SHARE_INSTALL_URL}`);
        markShareCopied(el);
        trackEvent('achievement_share_completed', { channel: 'clipboard' });
    } catch (e) {
        if (el) {
            const previous = el.innerHTML;
            el.innerHTML = `${icons.info} Unable`;
            setTimeout(() => { el.innerHTML = previous; }, 1400);
        }
    }
};

// ============================================================
// Android hardware back button (#1) — graceful navigation + exit.
// ============================================================

let lastBackAt = 0;
let backToast = null;
let backToastTimer = null;

const getCapApp = () => {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    return cap && cap.Plugins && cap.Plugins.App ? cap.Plugins.App : null;
};

// Open a URL outside the game. Prefers the native opener (so a store deep link
// hits the store app), falling back to a web URL / new tab when that fails.
const openExternal = async (primaryUrl, fallbackUrl) => {
    const App = getCapApp();
    try {
        if (App && App.openUrl) { await App.openUrl({ url: primaryUrl }); return; }
    } catch (e) { /* scheme unhandled (e.g. browser) — fall through */ }
    const url = fallbackUrl || primaryUrl;
    if (typeof window !== 'undefined' && window.open) window.open(url, '_blank', 'noopener');
};

// Replace the fallback version string with the real native build when available.
const patchAppVersion = async () => {
    const App = getCapApp();
    if (!App || !App.getInfo) return;
    try {
        const info = await App.getInfo();
        const el = baseEl && baseEl.querySelector('[data-hud="app-version"]');
        if (el && info && info.version) el.textContent = `${info.version} · build ${info.build}`;
    } catch (e) { /* keep the static fallback */ }
};

const showBackToast = (msg) => {
    if (!backToast) {
        backToast = document.createElement('div');
        backToast.className = 'sb-toast';
        document.body.appendChild(backToast);
    }
    backToast.textContent = msg;
    backToast.classList.add('show');
    if (backToastTimer) clearTimeout(backToastTimer);
    backToastTimer = setTimeout(() => backToast && backToast.classList.remove('show'), 1900);
};

// Screens from which "back" should land on the menu rather than exit.
const BACK_TO_MENU = new Set(['map', 'reveal', 'levels', 'level-intro', 'complete', 'daily', 'trophies', 'shop', 'settings', 'scene-view', 'lab']);

const handleBackButton = () => {
    // A forced update is a hard gate — back can't dismiss it.
    if (currentOverlay === 'update' && state.updateInfo?.forced) return;
    // Treat Android back on the conflict sheet exactly like its Cancel button:
    // close the UI without asking the service to resolve or overwrite anything.
    if (currentOverlay === 'cloud-conflict') {
        const conflict = getCloudSave()?.getState?.().conflict;
        dismissedCloudConflict = cloudConflictSignature(conflict);
        cloudConflictChoice = '';
        hideOverlay();
        if (currentBase === 'settings') refreshBaseOnly();
        return;
    }
    // 1. Any overlay sheet open → just close it.
    if (currentOverlay) { hideOverlay(); return; }
    // 2. In a level → save and return to the menu (exitGame hook persists).
    // LAB (prototype): back out of a lab board to the Lab list, not the menu.
    if (currentBase === 'game') { show(isLabMode() ? 'lab' : 'menu'); return; }
    // 3. A secondary screen → back to the menu.
    if (BACK_TO_MENU.has(currentBase)) { show('menu'); return; }
    // 4. On the menu (or splash/onboarding) → press back twice to quit.
    const App = getCapApp();
    const now = Date.now();
    if (now - lastBackAt < 2000) {
        if (App && App.exitApp) App.exitApp();
        return;
    }
    lastBackAt = now;
    showBackToast('Press back again to exit');
};

const setupBackButton = () => {
    const App = getCapApp();
    if (App && App.addListener) App.addListener('backButton', handleBackButton);
};

// ============================================================
// Public facade
// ============================================================

const UI = {
    /**
     * One-time init. `hooks` are callbacks implemented in game.js that let the
     * UI drive the canvas game: enterGame, exitGame, nextLevel, replay,
     * pauseGame, resumeGame, toggleSound, toggleMusic, undo, useHint.
     */
    init(hooks = {}) {
        sceneHooks = hooks;
        // Expose UI verbs the Tutorial module needs (navigate + refresh) so it
        // can stay decoupled from the UI internals.
        state.modules.showScreen = (id) => show(id);
        state.modules.refreshUI  = () => refreshCurrent();
        // Gameplay-side seam: any code path that finds the player can't afford
        // a hint/solve calls this instead of inventing its own dead-end message.
        state.modules.promptForCoins = (kind) => promptForCoins(kind);
        mount();
        setupCloudSaveUI();
        setupBackButton();

        // CrazyGames players decide whether to continue within seconds. A new
        // portal player therefore lands directly in the playable tutorial,
        // skipping both the studio splash and passive onboarding carousel.
        // Android retains the complete branded first-run sequence.
        if (DIRECT_PORTAL_TUTORIAL) {
            if (!state.config.tutorialCompleted) {
                sceneHooks.playTutorial && sceneHooks.playTutorial();
                showBase('game');
            } else {
                showBase('menu');
            }
            return;
        }

        // Android/plain web: preserve the established branded launch flow.
        showBase('splash');
        setTimeout(() => {
            if (currentBase === 'splash') {
                showBase(state.config.tutorialCompleted ? 'menu' : 'onboarding');
            }
        }, STARTUP_SPLASH_MS);
    },

    show,
    showBase,
    showOverlay,
    hideOverlay,
    promptForCoins,
    refresh: refreshCurrent,
    updateHud,
    announceTutorialMix,

    getCurrent() { return currentBase; },
    getCurrentOverlay() { return currentOverlay; },
};

export default UI;
