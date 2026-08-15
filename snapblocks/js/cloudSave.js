import state, { importConfig, sanitizeConfigCandidate } from './state.js?v=5071259f5c9c';
import {
    SNAPSHOT_NAME,
    chooseInitialAction,
    createEnvelope,
    decodeEnvelope,
    encodeEnvelope,
    extractDurableConfig,
    fingerprintConfig,
    isDefaultConfig,
    summarizeConfig,
} from './cloudSaveCore.js?v=5071259f5c9c';
import { caps } from './platform/index.js?v=5071259f5c9c';

const META_KEY = 'snapblocks.cloud.meta.v1';
const STATE_EVENT = 'snapblocks:cloud-state';
const CONFIG_APPLIED_EVENT = 'snapblocks:cloud-config-applied';
const SAVE_DEBOUNCE_MS = 4000;
const APP_VERSION = '1.0.6';

let cloudState = {
    available: false,
    configured: false,
    authenticated: false,
    player: null,
    status: 'idle',
    pending: false,
    lastSyncedAt: 0,
    conflict: null,
    error: null,
};

let meta = loadMeta();
let initialized = false;
let initializePromise = null;
let operationPromise = null;
let saveTimer = null;
let dirty = false;
let internalConflict = null;
let lastObservedFingerprint = '';
let reconnectPromise = null;

const clone = value => JSON.parse(JSON.stringify(value));
// Only the Play Games transport is platform-bound. The envelope, fingerprint
// and reconciliation logic in cloudSaveCore.js is portable and stays loaded;
// a future portal backend would swap this accessor, not that module.
const plugin = () => (caps.cloudSave ? window.Capacitor?.Plugins?.PlayGames || null : null);
const errorMessage = error => String(error?.message || error || 'Play Games request failed.').slice(0, 180);
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const CONNECTION_ERROR_RE = /(network|offline|timed?\s*out|timeout|connection|host|socket|unavailable)/i;

const isConnectionFailure = (error) => {
    if (!isOnline()) return true;
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    // Google Play services common status codes: 7=network, 14=interrupted,
    // 15=timeout. Native error codes append the status number.
    return /_(7|14|15)$/.test(code) || CONNECTION_ERROR_RE.test(`${code} ${message}`);
};

function createInstallId() {
    try {
        if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    } catch (error) { /* fall through */ }
    return `install-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function loadMeta() {
    let loaded = {};
    try { loaded = JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (error) { /* use defaults */ }
    return {
        installId: typeof loaded.installId === 'string' && loaded.installId ? loaded.installId : createInstallId(),
        revision: Math.max(0, Math.floor(Number(loaded.revision) || 0)),
        lastCloudFingerprint: typeof loaded.lastCloudFingerprint === 'string' ? loaded.lastCloudFingerprint : '',
        lastSyncedAt: Math.max(0, Number(loaded.lastSyncedAt) || 0),
    };
}

function persistMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (error) { /* local save remains authoritative */ }
}

function emitState() {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    window.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: getState() }));
}

function updateState(patch) {
    cloudState = { ...cloudState, ...patch };
    emitState();
}

function setOffline() {
    dirty = dirty || cloudState.pending;
    updateState({ status: 'offline', pending: dirty, error: null });
}

function handleFailure(error) {
    if (isConnectionFailure(error)) {
        setOffline();
        return false;
    }
    updateState({ status: 'error', error: errorMessage(error), pending: dirty || cloudState.pending });
    return false;
}

function publicConflict(conflict) {
    if (!conflict) return null;
    if (conflict.kind === 'reconcile') {
        return {
            type: 'device_or_cloud',
            choices: ['device', 'cloud'],
            device: summarizeConfig(state.config),
            cloud: summarizeConfig(conflict.remote.config, conflict.remote.writtenAt),
        };
    }
    if (conflict.kind === 'invalid_cloud') {
        return {
            type: 'invalid_cloud',
            reason: conflict.reason,
            choices: ['device'],
            device: summarizeConfig(state.config),
        };
    }
    return {
        type: 'snapshot_conflict',
        choices: ['device', 'current', 'conflicting'],
        device: summarizeConfig(state.config),
        current: conflict.current?.envelope
            ? summarizeConfig(conflict.current.envelope.config, conflict.current.envelope.writtenAt)
            : { invalid: true },
        conflicting: conflict.conflicting?.envelope
            ? summarizeConfig(conflict.conflicting.envelope.config, conflict.conflicting.envelope.writtenAt)
            : { invalid: true },
    };
}

function setConflict(conflict) {
    internalConflict = conflict;
    updateState({
        status: 'conflict',
        pending: dirty,
        conflict: publicConflict(conflict),
        error: null,
    });
}

function parseRemote(raw) {
    const decoded = decodeEnvelope(raw);
    if (!decoded.ok) return decoded;
    const sanitized = sanitizeConfigCandidate(decoded.envelope.config);
    if (!sanitized) return { ok: false, error: 'invalid_config' };
    decoded.envelope.config = extractDurableConfig(sanitized);
    return decoded;
}

function applyRemote(envelope) {
    const safe = sanitizeConfigCandidate(envelope.config);
    if (!safe || !importConfig(extractDurableConfig(safe), { notify: false })) return false;
    const fingerprint = fingerprintConfig(state.config);
    lastObservedFingerprint = fingerprint;
    meta.revision = Math.max(meta.revision, envelope.revision || 0);
    meta.lastCloudFingerprint = fingerprint;
    meta.lastSyncedAt = Date.now();
    persistMeta();
    dirty = false;
    internalConflict = null;
    updateState({
        status: 'synced',
        pending: false,
        lastSyncedAt: meta.lastSyncedAt,
        conflict: null,
        error: null,
    });
    window.dispatchEvent(new CustomEvent(CONFIG_APPLIED_EVENT, {
        detail: { source: 'cloud', summary: summarizeConfig(state.config, envelope.writtenAt) },
    }));
    return true;
}

function markSynced(envelope) {
    const fingerprint = fingerprintConfig(state.config);
    lastObservedFingerprint = fingerprint;
    meta.revision = Math.max(meta.revision, envelope?.revision || 0);
    meta.lastCloudFingerprint = fingerprint;
    meta.lastSyncedAt = Date.now();
    persistMeta();
    dirty = false;
    internalConflict = null;
    updateState({ status: 'synced', pending: false, lastSyncedAt: meta.lastSyncedAt, conflict: null, error: null });
}

function handleNativeConflict(result) {
    const current = parseRemote(result.current?.data || '');
    const conflicting = parseRemote(result.conflicting?.data || '');
    setConflict({
        kind: 'snapshot',
        conflictId: result.conflictId,
        current: current.ok ? current : { error: current.error },
        conflicting: conflicting.ok ? conflicting : { error: conflicting.error },
    });
}

async function uploadInternal() {
    const native = plugin();
    if (!native || !cloudState.authenticated) return false;

    const durable = extractDurableConfig(state.config);
    const capturedFingerprint = fingerprintConfig(durable);
    meta.revision = Math.max(1, meta.revision);
    const envelope = createEnvelope({
        config: durable,
        installId: meta.installId,
        revision: meta.revision,
        appVersion: APP_VERSION,
    });
    const stars = summarizeConfig(durable).stars;
    const result = await native.saveSnapshot({
        name: SNAPSHOT_NAME,
        data: encodeEnvelope(envelope),
        description: `Level ${Math.max(1, (durable.unlocked || 0) + 1)} · ${stars} stars`,
        playedTimeMs: 0,
        progressValue: Math.max(0, Number(durable.unlocked) || 0),
    });

    if (result?.status === 'conflict') {
        handleNativeConflict(result);
        return false;
    }

    meta.lastCloudFingerprint = capturedFingerprint;
    meta.lastSyncedAt = Date.now();
    persistMeta();
    const currentFingerprint = fingerprintConfig(state.config);
    dirty = currentFingerprint !== capturedFingerprint;
    lastObservedFingerprint = currentFingerprint;
    updateState({
        status: dirty ? 'local_changes' : 'synced',
        pending: dirty,
        lastSyncedAt: meta.lastSyncedAt,
        conflict: null,
        error: null,
    });
    if (dirty) scheduleSave();
    return true;
}

async function reconcileInternal() {
    const native = plugin();
    if (!native || !cloudState.authenticated || internalConflict) return false;
    updateState({ status: 'syncing', error: null });

    const result = await native.loadSnapshot({ name: SNAPSHOT_NAME });
    if (result?.status === 'conflict') {
        handleNativeConflict(result);
        return false;
    }

    const parsed = parseRemote(result?.data || '');
    if (parsed.empty) {
        dirty = true;
        return uploadInternal();
    }
    if (!parsed.ok) {
        setConflict({ kind: 'invalid_cloud', reason: parsed.error });
        return false;
    }

    const remote = parsed.envelope;
    const action = chooseInitialAction({
        localConfig: state.config,
        remoteConfig: remote.config,
        lastCloudFingerprint: meta.lastCloudFingerprint,
    });
    meta.revision = Math.max(meta.revision, remote.revision || 0);

    if (action === 'synced') {
        markSynced(remote);
        return true;
    }
    if (action === 'cloud') return applyRemote(remote);
    if (action === 'device') {
        dirty = true;
        meta.revision += 1;
        persistMeta();
        return uploadInternal();
    }
    setConflict({ kind: 'reconcile', remote });
    return false;
}

function runExclusive(task) {
    if (operationPromise) return operationPromise;
    operationPromise = Promise.resolve()
        .then(task)
        .catch(handleFailure)
        .finally(() => { operationPromise = null; });
    return operationPromise;
}

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    if (!cloudState.authenticated || internalConflict) return;
    if (!isOnline()) {
        saveTimer = null;
        setOffline();
        return;
    }
    saveTimer = setTimeout(() => {
        saveTimer = null;
        syncNow();
    }, SAVE_DEBOUNCE_MS);
}

function onLocalConfigSaved() {
    const fingerprint = fingerprintConfig(state.config);
    if (fingerprint === lastObservedFingerprint) return;
    lastObservedFingerprint = fingerprint;
    dirty = true;
    meta.revision += 1;
    persistMeta();
    updateState({ status: cloudState.authenticated ? 'local_changes' : cloudState.status, pending: true });
    scheduleSave();
}

function installListeners() {
    window.addEventListener('snapblocks:config-saved', onLocalConfigSaved);
    window.addEventListener('pagehide', () => { flush(); });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('offline', () => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        setOffline();
    });
    window.addEventListener('online', () => {
        if (reconnectPromise || isOnline() === false) return;
        reconnectPromise = (async () => {
            // If connectivity returned while an old request is still unwinding,
            // let it settle before starting one fresh auth/reconcile sequence.
            if (operationPromise) await operationPromise;
            return refresh();
        })().finally(() => { reconnectPromise = null; });
    });
}

function applyAuthStatus(result) {
    const configured = result?.configured === true;
    const authenticated = configured && result?.authenticated === true;
    updateState({
        available: true,
        configured,
        authenticated,
        player: authenticated ? (result.player || null) : null,
        status: !configured ? 'unconfigured' : authenticated ? 'checking_cloud' : 'signed_out',
        lastSyncedAt: meta.lastSyncedAt,
        pending: dirty,
        error: null,
    });
    return authenticated;
}

export const getState = () => clone(cloudState);

export const subscribe = (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = event => listener(event.detail);
    window.addEventListener(STATE_EVENT, handler);
    listener(getState());
    return () => window.removeEventListener(STATE_EVENT, handler);
};

export const initialize = () => {
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
        // No transport means nothing to sync to, so skip the listeners as well:
        // their only job is to mark progress dirty for an upload that can never
        // be scheduled. state.js keeps saving to localStorage exactly as before.
        if (!caps.cloudSave) {
            updateState({ available: false, configured: false, status: 'unavailable' });
            return getState();
        }
        lastObservedFingerprint = fingerprintConfig(state.config);
        dirty = dirty || (meta.lastCloudFingerprint
            ? lastObservedFingerprint !== meta.lastCloudFingerprint
            : !isDefaultConfig(state.config));
        if (!initialized) {
            initialized = true;
            installListeners();
        }
        const native = plugin();
        if (!native) {
            updateState({ available: false, configured: false, status: 'unavailable', lastSyncedAt: meta.lastSyncedAt });
            return getState();
        }
        if (!isOnline()) {
            updateState({ available: true, status: 'offline', pending: dirty, error: null, lastSyncedAt: meta.lastSyncedAt });
            return getState();
        }
        updateState({ available: true, status: 'checking_auth', error: null });
        const authenticated = applyAuthStatus(await native.getStatus());
        if (authenticated) await runExclusive(reconcileInternal);
        return getState();
    })().catch(error => {
        handleFailure(error);
        return getState();
    });
    return initializePromise;
};

export const signIn = async () => {
    await initialize();
    const native = plugin();
    if (!native || !cloudState.configured) return getState();
    updateState({ status: 'signing_in', error: null });
    if (!isOnline()) {
        setOffline();
        return getState();
    }
    try {
        const authenticated = applyAuthStatus(await native.signIn());
        if (authenticated) await runExclusive(reconcileInternal);
    } catch (error) {
        if (!isConnectionFailure(error)) {
            updateState({ status: 'signed_out', authenticated: false, player: null, error: errorMessage(error) });
        } else {
            setOffline();
        }
    }
    return getState();
};

export const refresh = async () => {
    const native = plugin();
    if (!native) return getState();
    if (!isOnline()) {
        setOffline();
        return getState();
    }
    try {
        const authenticated = applyAuthStatus(await native.getStatus());
        if (authenticated) await runExclusive(reconcileInternal);
    } catch (error) { handleFailure(error); }
    return getState();
};

export const syncNow = () => {
    if (!isOnline()) {
        setOffline();
        return Promise.resolve(false);
    }
    return runExclusive(reconcileInternal);
};

export const flush = () => {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (!isOnline()) {
        setOffline();
        return Promise.resolve(false);
    }
    if (!dirty || !cloudState.authenticated || internalConflict) return Promise.resolve(false);
    return syncNow();
};

export const resolveConflict = choice => runExclusive(async () => {
    const conflict = internalConflict;
    const native = plugin();
    if (!conflict || !native) return false;

    if (conflict.kind === 'reconcile') {
        if (choice === 'cloud') return applyRemote(conflict.remote);
        if (choice !== 'device') return false;
        internalConflict = null;
        updateState({ conflict: null, status: 'syncing' });
        dirty = true;
        meta.revision += 1;
        persistMeta();
        return uploadInternal();
    }

    if (conflict.kind === 'invalid_cloud') {
        if (choice !== 'device') return false;
        internalConflict = null;
        updateState({ conflict: null, status: 'syncing' });
        dirty = true;
        meta.revision += 1;
        persistMeta();
        return uploadInternal();
    }

    if (!['device', 'current', 'conflicting'].includes(choice)) return false;
    let replacement = null;
    if (choice === 'device') {
        meta.revision += 1;
        const envelope = createEnvelope({
            config: state.config,
            installId: meta.installId,
            revision: meta.revision,
            appVersion: APP_VERSION,
        });
        replacement = encodeEnvelope(envelope);
    }

    const nativeChoice = choice === 'conflicting' ? 'conflicting' : 'current';
    const result = await native.resolveSnapshotConflict({
        conflictId: conflict.conflictId,
        choice: nativeChoice,
        ...(replacement ? { data: replacement } : {}),
    });
    internalConflict = null;
    updateState({ conflict: null, status: 'syncing' });
    if (result?.status === 'conflict') {
        handleNativeConflict(result);
        return false;
    }
    if (choice === 'device') {
        dirty = true;
        persistMeta();
        return uploadInternal();
    }

    const selected = parseRemote(result?.data || '');
    if (!selected.ok) {
        setConflict({ kind: 'invalid_cloud', reason: selected.error });
        return false;
    }
    return applyRemote(selected.envelope);
});

const CloudSave = {
    initialize,
    signIn,
    refresh,
    syncNow,
    flush,
    resolveConflict,
    getState,
    subscribe,
};

state.modules.cloudSave = CloudSave;

export default CloudSave;
