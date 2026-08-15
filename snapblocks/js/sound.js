/**
 * SoundEngine - Web Audio API synthesized sound effects
 */

let ctx = null;
let enabled = true;

const getCtx = () => {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
};

const playTone = (freq, duration, type = 'sine', vol = 0.15) => {
    if (!enabled) return;
    try {
        const c = getCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, c.currentTime);
        gain.gain.setValueAtTime(vol, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(c.currentTime);
        osc.stop(c.currentTime + duration);
    } catch (e) { /* audio context may not be available */ }
};

const SoundEngine = {
    resume() { try { getCtx().resume(); } catch (e) { /* ignore */ } },
    toggle() { enabled = !enabled; return enabled; },
    isEnabled() { return enabled; },

    snapPiece() {
        playTone(520, 0.12, 'sine', 0.18);
        setTimeout(() => playTone(780, 0.1, 'sine', 0.12), 50);
    },

    cleanFit(count = 1) {
        const notes = count >= 3 ? [659, 988] : count >= 2 ? [622, 830] : [659];
        notes.forEach((freq, i) => {
            setTimeout(() => playTone(freq, 0.12, 'triangle', 0.07), 80 + i * 46);
        });
    },

    victory() {
        [0, 100, 200, 300, 450].forEach((d, i) => {
            setTimeout(() => playTone([523, 659, 784, 880, 1047][i], 0.3, 'sine', 0.15), d);
        });
    },

    levelStart() {
        playTone(440, 0.15, 'triangle', 0.1);
        setTimeout(() => playTone(554, 0.15, 'triangle', 0.1), 80);
        setTimeout(() => playTone(659, 0.2, 'triangle', 0.12), 160);
    },

    pickup() { playTone(600, 0.08, 'sine', 0.08); },
    drop() { playTone(300, 0.1, 'sine', 0.06); },
    menuOpen() { playTone(400, 0.1, 'triangle', 0.06); },

    hint() {
        playTone(880, 0.1, 'sine', 0.12);
        setTimeout(() => playTone(1100, 0.15, 'sine', 0.1), 80);
    },

    // Frost levels: tap on a still-frozen piece — short, muffled, clearly "not yet".
    frozenDeny() {
        playTone(220, 0.09, 'triangle', 0.1);
        setTimeout(() => playTone(180, 0.12, 'sine', 0.08), 60);
    },

    // Frost levels: the ice cracks and the piece is released — crack then sparkle.
    thaw() {
        playTone(1320, 0.05, 'square', 0.05);
        setTimeout(() => playTone(740, 0.12, 'triangle', 0.1), 40);
        setTimeout(() => playTone(1100, 0.14, 'sine', 0.1), 120);
        setTimeout(() => playTone(1660, 0.2, 'sine', 0.07), 210);
    },

    noHint() { playTone(200, 0.2, 'sine', 0.1); },

    // Place restored — a warm rising swell for the Faded World chapter reveal.
    // Longer and lusher than victory; lands as color floods back into the world.
    restore() {
        const melody = [392, 523, 659, 784, 988, 1175]; // G4→D6 hopeful climb
        melody.forEach((freq, i) => {
            setTimeout(() => playTone(freq, 0.42, 'sine', 0.13), i * 110);
        });
        // sparkle tail
        setTimeout(() => playTone(1568, 0.5, 'triangle', 0.07), 720);
        setTimeout(() => playTone(2093, 0.4, 'sine', 0.05), 860);
    },

    // Prism Mix — short shimmering arpeggio, brighter than victory but quick
    // enough to layer over an in-progress placement sound.
    mix() {
        const notes = [659, 880, 1175]; // E5, A5, D6 — open, hopeful
        notes.forEach((freq, i) => {
            setTimeout(() => playTone(freq, 0.16, 'triangle', 0.12), i * 60);
        });
        setTimeout(() => playTone(1567, 0.22, 'sine', 0.08), 240); // G6 sparkle
    },
};

export default SoundEngine;
