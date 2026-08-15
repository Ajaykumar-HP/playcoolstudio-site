export const CLOUD_SCHEMA_VERSION = 1;
export const SNAPSHOT_NAME = 'snapblocks-progress-v1';
export const MAX_ENVELOPE_CHARS = 512 * 1024;

export const DURABLE_KEYS = Object.freeze([
    'unlocked',
    'coins',
    'tutorialCompleted',
    'streak',
    'lastDailyTs',
    'dailyLastCompletedDate',
    'dailyStreak',
    'dailyCompletedDates',
    'dailyBest',
    'levelStars',
    'levelBestSec',
    'trophies',
    'ownedThemes',
    'adsRemoved',
    'lifetimeMixes',
    'missions',
    'streakMilestoneClaimed',
    'prismRewardsClaimed',
    'pulseRewardsClaimed',
    'mixCoachSeen',
    'frostCoachSeen',
    'pulseCoachSeen',
    'objectiveCoachSeen',
]);

const DEFAULT_DURABLE_CONFIG = Object.freeze({
    unlocked: 0,
    coins: 40,
    tutorialCompleted: false,
    streak: 0,
    lastDailyTs: 0,
    dailyLastCompletedDate: '',
    dailyStreak: 0,
    dailyCompletedDates: [],
    dailyBest: {},
    levelStars: {},
    levelBestSec: {},
    trophies: [],
    ownedThemes: ['cream'],
    adsRemoved: false,
    lifetimeMixes: 0,
    missions: null,
    streakMilestoneClaimed: 0,
    prismRewardsClaimed: {},
    pulseRewardsClaimed: {},
    mixCoachSeen: false,
    frostCoachSeen: false,
    pulseCoachSeen: false,
    objectiveCoachSeen: {},
});

const jsonClone = value => JSON.parse(JSON.stringify(value));

const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    Object.keys(value).sort().forEach(key => { output[key] = canonicalize(value[key]); });
    return output;
};

export const extractDurableConfig = (config = {}) => {
    const durable = {};
    DURABLE_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(config, key) && config[key] !== undefined) {
            durable[key] = jsonClone(config[key]);
        }
    });
    return durable;
};

export const fingerprintConfig = config => JSON.stringify(canonicalize(extractDurableConfig(config)));

export const isDefaultConfig = config =>
    fingerprintConfig(config) === fingerprintConfig(DEFAULT_DURABLE_CONFIG);

export const createEnvelope = ({ config, installId, revision = 0, appVersion = '' }) => ({
    schemaVersion: CLOUD_SCHEMA_VERSION,
    writtenAt: Date.now(),
    appVersion: String(appVersion || ''),
    installId: String(installId || ''),
    revision: Math.max(0, Math.floor(Number(revision) || 0)),
    config: extractDurableConfig(config),
});

export const encodeEnvelope = envelope => JSON.stringify(envelope);

export const decodeEnvelope = (raw) => {
    if (typeof raw !== 'string' || raw.length === 0) return { ok: false, empty: true, error: 'empty' };
    if (raw.length > MAX_ENVELOPE_CHARS) return { ok: false, error: 'too_large' };
    try {
        const envelope = JSON.parse(raw);
        if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return { ok: false, error: 'invalid' };
        if (envelope.schemaVersion !== CLOUD_SCHEMA_VERSION) return { ok: false, error: 'unsupported_schema' };
        if (!envelope.config || typeof envelope.config !== 'object' || Array.isArray(envelope.config)) {
            return { ok: false, error: 'invalid_config' };
        }
        return {
            ok: true,
            envelope: {
                schemaVersion: CLOUD_SCHEMA_VERSION,
                writtenAt: Math.max(0, Number(envelope.writtenAt) || 0),
                appVersion: typeof envelope.appVersion === 'string' ? envelope.appVersion.slice(0, 32) : '',
                installId: typeof envelope.installId === 'string' ? envelope.installId.slice(0, 80) : '',
                revision: Math.max(0, Math.floor(Number(envelope.revision) || 0)),
                config: extractDurableConfig(envelope.config),
            },
        };
    } catch (error) {
        return { ok: false, error: 'invalid_json' };
    }
};

export const summarizeConfig = (config = {}, writtenAt = 0) => ({
    level: Math.max(1, (Number(config.unlocked) || 0) + 1),
    stars: Object.values(config.levelStars || {}).reduce((sum, value) => sum + (Number(value) || 0), 0),
    coins: Math.max(0, Number(config.coins) || 0),
    writtenAt: Math.max(0, Number(writtenAt) || 0),
});

/** Decide without destroying either side; `conflict` requires an explicit player choice. */
export const chooseInitialAction = ({ localConfig, remoteConfig, lastCloudFingerprint = '' }) => {
    const localFingerprint = fingerprintConfig(localConfig);
    const remoteFingerprint = fingerprintConfig(remoteConfig);
    if (localFingerprint === remoteFingerprint) return 'synced';
    if (isDefaultConfig(localConfig) && !isDefaultConfig(remoteConfig)) return 'cloud';
    if (!isDefaultConfig(localConfig) && isDefaultConfig(remoteConfig)) return 'device';
    if (lastCloudFingerprint) {
        if (remoteFingerprint === lastCloudFingerprint && localFingerprint !== lastCloudFingerprint) return 'device';
        if (localFingerprint === lastCloudFingerprint && remoteFingerprint !== lastCloudFingerprint) return 'cloud';
    }
    return 'conflict';
};
