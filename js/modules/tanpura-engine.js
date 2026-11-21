/**
 * SUR STUDIO - Authentic 4-String Tanpura Engine
 * High-fidelity physical modeling of a classical Indian Tanpura drone.
 * Models the curved Javari bridge buzz, hollow gourd resonance,
 * and cyclic 4-string plucking pattern (Pa-Sa-Sa-Sa, Ma-Sa-Sa-Sa, or Ni-Sa-Sa-Sa).
 */
class TanpuraEngine {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.ctx = null;
        this.outputGain = null;
        this.gourdFilter1 = null;
        this.gourdFilter2 = null;

        this.isPlaying = false;
        this.tonic = 2; // 0=C, 1=C#, 2=D (Safed 2, standard harmonium/tanpura pitch)
        this.tuning = 'pa'; // 'pa' (5th), 'ma' (4th), 'ni' (7th), 'sa' (root)
        this.octave = 'medium'; // 'low' (C3), 'medium' (C4)
        this.speed = 'medium'; // 'slow', 'medium', 'fast'
        this.volume = 0.45; // 0 to 1

        this.currentString = 0;
        this.timerId = null;
        this.onPluck = null; // (stringIndex, noteName) => {}

        this.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    }

    _ensureAudioContext() {
        if (!this.ctx && this.audioEngine && this.audioEngine.ctx) {
            this.ctx = this.audioEngine.ctx;

            this.outputGain = this.ctx.createGain();
            this.outputGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

            // Gourd acoustic cavity resonance formants
            this.gourdFilter1 = this.ctx.createBiquadFilter();
            this.gourdFilter1.type = 'peaking';
            this.gourdFilter1.frequency.value = 240; // Gourd body air resonance
            this.gourdFilter1.Q.value = 2.5;
            this.gourdFilter1.gain.value = 6.0;

            this.gourdFilter2 = this.ctx.createBiquadFilter();
            this.gourdFilter2.type = 'peaking';
            this.gourdFilter2.frequency.value = 850; // Neck & bridge presence
            this.gourdFilter2.Q.value = 2.0;
            this.gourdFilter2.gain.value = 4.0;

            this.gourdFilter1.connect(this.gourdFilter2);
            this.gourdFilter2.connect(this.outputGain);
            this.outputGain.connect(this.audioEngine.masterGain || this.ctx.destination);
        }
        return Boolean(this.ctx);
    }

    setTonic(pitchClass) {
        this.tonic = ((Number(pitchClass) % 12) + 12) % 12;
    }

    setTuning(tuningType) {
        if (['pa', 'ma', 'ni', 'sa'].includes(tuningType)) {
            this.tuning = tuningType;
        }
    }

    setOctave(oct) {
        this.octave = oct;
    }

    setSpeed(speedVal) {
        this.speed = speedVal;
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, Number(vol)));
        if (this.outputGain && this.ctx) {
            this.outputGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
        }
    }

    start() {
        if (this.isPlaying) return;
        if (!this._ensureAudioContext()) return;

        if (this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
        }

        this.isPlaying = true;
        this.currentString = 0;
        this._pluckCycle();
    }

    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }

    toggle() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.start();
        }
        return this.isPlaying;
    }

    _getDelays() {
        switch (this.speed) {
            case 'slow': return [1600, 1600, 1600, 2200];
            case 'fast': return [750, 750, 750, 1100];
            default: return [1100, 1100, 1100, 1600]; // medium
        }
    }

    _pluckCycle() {
        if (!this.isPlaying) return;

        this._pluckString(this.currentString);

        const delays = this._getDelays();
        const currentDelay = delays[this.currentString];
        this.currentString = (this.currentString + 1) % 4;

        this.timerId = setTimeout(() => this._pluckCycle(), currentDelay);
    }

    _pluckString(stringIndex) {
        const t = this.ctx.currentTime;
        const baseSa = this.octave === 'low' ? (48 + this.tonic) : (60 + this.tonic);

        let midiPitch = baseSa;
        let stringName = 'Sa';

        // 4 Classical Strings:
        // String 0: First string (Pancham Pa, Madhyam Ma, Nishad Ni, or Mandra Sa)
        // String 1: Jodi 1 (Middle Sa)
        // String 2: Jodi 2 (Middle Sa)
        // String 3: Kharaj (Deep Bass Sa - 1 octave down)
        switch (stringIndex) {
            case 0:
                if (this.tuning === 'pa') {
                    midiPitch = baseSa + 7; // Pa
                    stringName = 'Pa';
                } else if (this.tuning === 'ma') {
                    midiPitch = baseSa + 5; // Ma
                    stringName = 'Ma';
                } else if (this.tuning === 'ni') {
                    midiPitch = baseSa + 11; // Shuddha Ni
                    stringName = 'Ni';
                } else {
                    midiPitch = baseSa; // Sa
                    stringName = 'Sa';
                }
                break;
            case 1:
                midiPitch = baseSa;
                stringName = 'Sa (Jodi 1)';
                break;
            case 2:
                midiPitch = baseSa;
                stringName = 'Sa (Jodi 2)';
                break;
            case 3:
                midiPitch = baseSa - 12; // Kharaj (Deep Bass)
                stringName = 'Sa (Kharaj)';
                break;
        }

        const freq = 440 * Math.pow(2, (midiPitch - 69) / 12);

        // String Synthesis with Javari buzz harmonics
        const stringGain = this.ctx.createGain();
        stringGain.gain.setValueAtTime(0, t);
        stringGain.gain.linearRampToValueAtTime(0.55, t + 0.04);
        stringGain.gain.exponentialRampToValueAtTime(0.001, t + 3.8);

        // Dual detuned oscillators for string buzz
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();

        // Javari overtone spectrum (prominent high buzzing harmonics)
        const nCoeffs = 24;
        const real = new Float32Array(nCoeffs);
        const imag = new Float32Array(nCoeffs);
        const weights = [0, 1.0, 0.85, 0.72, 0.65, 0.55, 0.45, 0.38, 0.30, 0.22, 0.16, 0.10, 0.08];
        for (let i = 1; i < Math.min(nCoeffs, weights.length); i++) {
            imag[i] = weights[i];
        }
        const javariWave = this.ctx.createPeriodicWave(real, imag);

        osc1.setPeriodicWave(javariWave);
        osc2.setPeriodicWave(javariWave);

        osc1.frequency.setValueAtTime(freq, t);
        // Slight micro-detune between the two string paths for acoustic shimmer
        osc2.frequency.setValueAtTime(freq * Math.pow(2, 1.4 / 1200), t);

        osc1.connect(stringGain);
        osc2.connect(stringGain);
        stringGain.connect(this.gourdFilter1);

        osc1.start(t);
        osc2.start(t);

        const killTime = t + 4.0;
        osc1.stop(killTime);
        osc2.stop(killTime);

        setTimeout(() => {
            try {
                osc1.disconnect();
                osc2.disconnect();
                stringGain.disconnect();
            } catch (e) {}
        }, 4100);

        if (this.onPluck) {
            this.onPluck(stringIndex, stringName, this.NOTE_NAMES[midiPitch % 12]);
        }
    }
}

if (typeof window !== 'undefined') {
    window.TanpuraEngine = TanpuraEngine;
}
