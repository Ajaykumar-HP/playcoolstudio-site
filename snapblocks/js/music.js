/**
 * MusicEngine - Ambient background music using Web Audio API
 * Generates a calm, looping ambient soundtrack procedurally
 */

let ctx = null;
let enabled = true;
let playing = false;
let nodes = [];
let loopTimer = null;

const getCtx = () => {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
};

// Chord progressions for ambient feel (frequencies in Hz)
const CHORDS = [
    [261.6, 329.6, 392.0],  // C major
    [220.0, 277.2, 329.6],  // A minor
    [293.7, 370.0, 440.0],  // D minor
    [246.9, 311.1, 370.0],  // B dim -> Bb major feel
    [261.6, 329.6, 392.0],  // C major
    [220.0, 261.6, 329.6],  // A minor
    [174.6, 220.0, 261.6],  // F major
    [196.0, 246.9, 293.7],  // G major
];

let chordIndex = 0;

const playChord = () => {
    if (!enabled || !playing) return;
    try {
        const c = getCtx();
        const chord = CHORDS[chordIndex % CHORDS.length];
        chordIndex++;

        chord.forEach((freq, i) => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            const filter = c.createBiquadFilter();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * 0.5, c.currentTime); // One octave lower for depth

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(800, c.currentTime);

            // Gentle swell in and out
            gain.gain.setValueAtTime(0, c.currentTime);
            gain.gain.linearRampToValueAtTime(0.035, c.currentTime + 1.0);
            gain.gain.linearRampToValueAtTime(0.03, c.currentTime + 2.5);
            gain.gain.linearRampToValueAtTime(0, c.currentTime + 4.0);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(c.destination);
            osc.start(c.currentTime + i * 0.15);
            osc.stop(c.currentTime + 4.2);

            nodes.push(osc);
            osc.onended = () => {
                const idx = nodes.indexOf(osc);
                if (idx > -1) nodes.splice(idx, 1);
            };
        });

        // Add a subtle high shimmer note
        const shimmer = c.createOscillator();
        const sGain = c.createGain();
        shimmer.type = 'sine';
        shimmer.frequency.setValueAtTime(chord[2] * 2, c.currentTime);
        sGain.gain.setValueAtTime(0, c.currentTime);
        sGain.gain.linearRampToValueAtTime(0.012, c.currentTime + 0.8);
        sGain.gain.linearRampToValueAtTime(0, c.currentTime + 3.5);
        shimmer.connect(sGain);
        sGain.connect(c.destination);
        shimmer.start(c.currentTime + 0.5);
        shimmer.stop(c.currentTime + 3.8);
        nodes.push(shimmer);

    } catch (e) { /* audio context may not be available */ }
};

const startLoop = () => {
    if (loopTimer) return;
    playChord();
    loopTimer = setInterval(() => {
        if (enabled && playing) playChord();
    }, 3800);
};

const stopLoop = () => {
    if (loopTimer) {
        clearInterval(loopTimer);
        loopTimer = null;
    }
    nodes.forEach(n => { try { n.stop(); } catch (e) { /* ignore */ } });
    nodes = [];
    chordIndex = 0;
};

const MusicEngine = {
    start() {
        if (!enabled) return;
        playing = true;
        try { getCtx().resume(); } catch (e) { /* ignore */ }
        startLoop();
    },

    stop() {
        playing = false;
        stopLoop();
    },

    toggle() {
        enabled = !enabled;
        if (!enabled) {
            this.stop();
        } else {
            this.start();
        }
        return enabled;
    },

    isEnabled() { return enabled; },
    isPlaying() { return playing; },

    setEnabled(val) {
        enabled = val;
        if (!enabled && playing) this.stop();
    },
};

export default MusicEngine;
