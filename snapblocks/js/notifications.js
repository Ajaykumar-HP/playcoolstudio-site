/**
 * Local notifications — gentle "come play" reminders.
 *
 * Three soft daily reminders that repeat at fixed local times so a returning
 * player sees a friendly nudge and can hop in:
 *
 *   - 11:00 — late-morning break
 *   - 13:00 — midday / lunch break
 *   - 20:00 — evening wind-down (streak-aware copy when a streak is going)
 *
 * They use the plugin's daily `on: { hour, minute }` recurrence, so they keep
 * firing every day even if the app isn't reopened — that's the re-engagement
 * point. We still re-plan them on each app open so the copy reflects current
 * state (and to honor the settings toggle / permission).
 *
 * The plugin is accessed via window.Capacitor.Plugins because the app ships
 * raw ES modules (same pattern as ads.js / haptics.js). In a plain browser
 * this module is a silent no-op.
 *
 * Permission is requested lazily — after the player's first real level clear,
 * never at install — and only once; declining is remembered and respected.
 */

import state, { saveConfig } from './state.js?v=3bd14eb0045c';
import { trackEvent } from './analytics.js?v=3bd14eb0045c';
import { caps } from './platform/index.js?v=3bd14eb0045c';

// Stable ids so re-planning replaces (never duplicates) each slot.
// 101 morning · 102 midday · 103 evening · 104 streak-ended.
const SLOT_IDS = [101, 102, 103, 104];
const DAY_MS = 24 * 60 * 60 * 1000;

const dayStartMs = (ts) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

// Gentle, time-appropriate copy. A few variants per slot, rotated by day so it
// doesn't read identically every morning. Evening copy is built dynamically so
// it can nod to an active streak.
const MORNING = [
    { title: 'A bright little puzzle 🌼', body: 'Take a calm break and bring back a bit more of your world.' },
    { title: 'Good morning, puzzler ☀️', body: 'A fresh board is waiting whenever you are.' },
    { title: 'Mix a few colors?', body: 'A quiet morning puzzle to ease into the day.' },
];
const MIDDAY = [
    { title: 'Midday mix break', body: 'A quick puzzle to reset your afternoon.' },
    { title: 'Lunch-break puzzle?', body: 'One calm solve — your world is waiting.' },
    { title: 'Stretch your brain 🧩', body: 'A short, satisfying puzzle for the afternoon.' },
];

// Every exported verb below already bails on a missing plugin, so gating the
// accessor is the whole platform story: on web notificationsSupported() is
// false and scheduling/permission calls are no-ops.
const getPlugin = () => {
    if (!caps.notifications) return null;
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    return cap && cap.Plugins && cap.Plugins.LocalNotifications
        ? cap.Plugins.LocalNotifications
        : null;
};

export const notificationsSupported = () => !!getPlugin();

const hasPermission = async () => {
    const LocalNotifications = getPlugin();
    if (!LocalNotifications || !LocalNotifications.checkPermissions) return false;
    try {
        const perm = await LocalNotifications.checkPermissions();
        return perm && perm.display === 'granted';
    } catch (e) {
        return false;
    }
};

export const cancelAllNotifications = async () => {
    const LocalNotifications = getPlugin();
    if (!LocalNotifications || !LocalNotifications.cancel) return;
    try {
        await LocalNotifications.cancel({ notifications: SLOT_IDS.map(id => ({ id })) });
    } catch (e) { /* nothing scheduled yet */ }
};

// Day-of-year, to rotate copy variants.
const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);

// Generic evening wind-down — used when there's no active streak to nudge
// (streak evenings are handled separately in rescheduleNotifications).
const EVENING = [
    { title: 'Unwind with a puzzle 🌙', body: 'End the day with a calm color puzzle.' },
    { title: 'One quiet puzzle before bed?', body: 'A gentle way to wind down tonight.' },
];

/**
 * Cancel + re-plan all reminders from current config. Safe to call often;
 * no-ops without the plugin, permission, or the settings toggle.
 *
 * Morning (11) + midday (13) are always-on gentle repeats. The evening (20)
 * and the streak-ended slot are streak-intelligent one-shots, scheduled ahead
 * from the last-played date and replanned on every open — so a returning
 * player auto-cancels them, and a lapsing player gets exactly the right one.
 */
export const rescheduleNotifications = async () => {
    const LocalNotifications = getPlugin();
    if (!LocalNotifications || !LocalNotifications.schedule) return false;
    if (!state.config.notifications) {
        await cancelAllNotifications();
        return false;
    }
    if (!await hasPermission()) return false;

    await cancelAllNotifications();

    const cfg = state.config;
    const now = Date.now();
    const pick = (arr) => arr[dayOfYear(new Date()) % arr.length];
    const morning = pick(MORNING);
    const midday = pick(MIDDAY);

    // `on: { hour, minute }` repeats daily at that local time.
    const notifications = [
        { id: SLOT_IDS[0], title: morning.title, body: morning.body, schedule: { on: { hour: 11, minute: 0 }, allowWhileIdle: true } },
        { id: SLOT_IDS[1], title: midday.title,  body: midday.body,  schedule: { on: { hour: 13, minute: 0 }, allowWhileIdle: true } },
    ];

    // --- Streak intelligence -------------------------------------------------
    // A streak survives if you play on its last-played day or the next day, and
    // breaks once a full day is skipped (see progression.checkInPlay). So from
    // the last-played day we know exactly when it's at risk and when it lapses.
    const streak = cfg.streak || 0;
    const hasStreak = streak >= 2 && cfg.lastDailyTs > 0;
    const lastDay = hasStreak ? dayStartMs(cfg.lastDailyTs) : 0;
    // The streak's last-played day is `lastDay`; it must be played again by the
    // next day. So the grace evening (8pm of that next day) is always the right
    // moment to nudge — pre-scheduled even if the player won't reopen tomorrow.
    const graceEvening = lastDay + DAY_MS + 20 * 3600000;        // 8pm of the must-play day
    const lapsedMorning = lastDay + 2 * DAY_MS + 11.5 * 3600000; // 11:30 after it's gone
    const atRisk = hasStreak && now < graceEvening;

    if (atRisk) {
        // Evening slot becomes the streak save-it nudge (with the live count).
        notifications.push({
            id: SLOT_IDS[2],
            title: `🔥 Keep your ${streak}-day streak`,
            body: 'One quick puzzle before midnight keeps it alive.',
            schedule: { at: new Date(graceEvening), allowWhileIdle: true },
        });
    } else {
        // Otherwise a gentle, always-on evening wind-down.
        const evening = pick(EVENING);
        notifications.push({
            id: SLOT_IDS[2],
            title: evening.title,
            body: evening.body,
            schedule: { on: { hour: 20, minute: 0 }, allowWhileIdle: true },
        });
    }

    // "Streak ended" — fires the morning after the streak has definitely lapsed,
    // unless the player returns first (which cancels + replans this).
    if (hasStreak && lapsedMorning > now) {
        notifications.push({
            id: SLOT_IDS[3],
            title: `💔 Your ${streak}-day streak ended`,
            body: 'No worries — start a fresh streak today!',
            schedule: { at: new Date(lapsedMorning), allowWhileIdle: true },
        });
    }

    try {
        await LocalNotifications.schedule({ notifications });
        trackEvent('notif_scheduled', { slots: notifications.length, atRisk, streak });
        return true;
    } catch (e) {
        return false;
    }
};

/**
 * One-time lazy permission ask, then (re)schedule. Called after a real level
 * clear — the moment the player has demonstrated interest, not at install.
 */
export const maybeRequestPermissionAndSchedule = async () => {
    const LocalNotifications = getPlugin();
    if (!LocalNotifications) return;
    if (!state.config.notifications) return;

    // Hold the one-time ask until the first restoration beat has landed
    // (3 clears) — the player has just seen what there is to come back for.
    const invested = (state.config.unlocked || 0) >= 3;
    if (invested && !state.config.notifPermAsked && LocalNotifications.requestPermissions) {
        state.config.notifPermAsked = true;
        saveConfig();
        try {
            const perm = await LocalNotifications.requestPermissions();
            trackEvent('notif_permission_result', {
                granted: !!(perm && perm.display === 'granted'),
            });
        } catch (e) { /* dialog dismissed */ }
    }

    rescheduleNotifications();
};

/**
 * Settings toggle handler. Turning on may trigger the system permission
 * dialog; turning off cancels everything scheduled.
 */
export const setNotificationsEnabled = async (enabled) => {
    state.config.notifications = !!enabled;
    saveConfig();
    if (!enabled) {
        await cancelAllNotifications();
        return;
    }
    const LocalNotifications = getPlugin();
    if (LocalNotifications && LocalNotifications.requestPermissions && !await hasPermission()) {
        state.config.notifPermAsked = true;
        saveConfig();
        try { await LocalNotifications.requestPermissions(); } catch (e) { /* ignore */ }
    }
    rescheduleNotifications();
};
