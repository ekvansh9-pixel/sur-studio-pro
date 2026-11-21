/**
 * SUR STUDIO - Authentic Indian Tabla & Precision Metronome Engine
 * High-precision lookahead scheduler combining Indian Classical Tabla Thekas
 * (Teentaal, Keherwa, Dadra, Rupak) with a standard Western Metronome.
 * Synthesizes organic Bayan bass pitch-bends and resonant Dayan treble strokes.
 */
class TablaEngine {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.ctx = null;
        this.outputGain = null;

        this.isPlaying = false;
        this.mode = 'tabla'; // 'tabla' or 'metronome'
        this.currentTaal = 'teentaal';
        this.bpm = 90; // Beats / Matras per minute
        this.volume = 0.55;
        this.tonic = 2; // 0=C, 1=C#, 2=D

        // Lookahead clock variables
        this.lookaheadMs = 25.0;
        this.scheduleAheadSec = 0.1;
        this.nextNoteTime = 0.0;
        this.currentMatra = 0;
        this.timerId = null;

        this.onBeat = null; // (matra, totalMatras, bolName, isSam) => {}

        // Indian Taals & Western Signatures Definitions
        this.TAALS = {
            'teentaal': {
                name: 'Teentaal (16 Beats)',
                category: 'Indian Taal',
                beats: 16,
                bols: ['Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Tin', 'Tin', 'Ta', 'Ta', 'Dhin', 'Dhin', 'Dha'],
                vibhaag: [4, 4, 4, 4],
                taali: [1, 5, 13],
                khaali: [9]
            },
            'keherwa': {
                name: 'Keherwa (8 Beats)',
                category: 'Indian Taal',
                beats: 8,
                bols: ['Dha', 'Ge', 'Na', 'Tin', 'Na', 'Ke', 'Dhin', 'Na'],
                vibhaag: [4, 4],
                taali: [1],
                khaali: [5]
            },
            'dadra': {
                name: 'Dadra (6 Beats)',
                category: 'Indian Taal',
                beats: 6,
                bols: ['Dha', 'Dhi', 'Na', 'Dha', 'Ti', 'Na'],
                vibhaag: [3, 3],
                taali: [1],
                khaali: [4]
            },
            'rupak': {
                name: 'Rupak (7 Beats)',
                category: 'Indian Taal',
                beats: 7,
                bols: ['Tin', 'Tin', 'Na', 'Dhi', 'Na', 'Dhi', 'Na'],
                vibhaag: [3, 2, 2],
                taali: [4, 6],
                khaali: [1] // Rupak begins on Khali!
            },
            '4/4': {
                name: '4/4 Metronome',
                category: 'Western',
                beats: 4,
                bols: ['1', '2', '3', '4']
            },
            '3/4': {
                name: '3/4 Metronome',
                category: 'Western',
                beats: 3,
                bols: ['1', '2', '3']
            },
            '6/8': {
                name: '6/8 Metronome',
                category: 'Western',
                beats: 6,
                bols: ['1', '2', '3', '4', '5', '6']
            }
        };
    }

    _ensureAudioContext() {
        if (!this.ctx && this.audioEngine && this.audioEngine.ctx) {
            this.ctx = this.audioEngine.ctx;
            this.outputGain = this.ctx.createGain();
            this.outputGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
            this.outputGain.connect(this.audioEngine.masterGain || this.ctx.destination);
        }
        return Boolean(this.ctx);
    }

    setBpm(newBpm) {
        this.bpm = Math.max(30, Math.min(240, Number(newBpm)));
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, Number(vol)));
        if (this.outputGain && this.ctx) {
            this.outputGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
        }
    }

    setTaal(taalKey) {
        if (this.TAALS[taalKey]) {
            this.currentTaal = taalKey;
            this.currentMatra = 0;
            this.mode = this.TAALS[taalKey].category === 'Western' ? 'metronome' : 'tabla';
        }
    }

    setTonic(tonicPitchClass) {
        this.tonic = ((Number(tonicPitchClass) % 12) + 12) % 12;
    }

    getCurrentTaalDef() {
        return this.TAALS[this.currentTaal] || this.TAALS['teentaal'];
    }

    start() {
        if (this.isPlaying) return;
        if (!this._ensureAudioContext()) return;

        if (this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
        }

        this.isPlaying = true;
        this.currentMatra = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.05;
        this._scheduler();
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

    _scheduler() {
        if (!this.isPlaying) return;

        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadSec) {
            this._scheduleStroke(this.currentMatra, this.nextNoteTime);
            this._advanceMatra();
        }

        this.timerId = setTimeout(() => this._scheduler(), this.lookaheadMs);
    }

    _advanceMatra() {
        const secondsPerBeat = 60.0 / this.bpm;
        const total = this.getCurrentTaalDef().beats;

        this.nextNoteTime += secondsPerBeat;
        this.currentMatra = (this.currentMatra + 1) % total;
    }

    _scheduleStroke(matraIndex, time) {
        const taalDef = this.getCurrentTaalDef();
        const bol = taalDef.bols[matraIndex] || '1';
        const isSam = (matraIndex === 0);

        if (this.mode === 'metronome') {
            this._playMetronomeClick(time, isSam);
        } else {
            this._playTablaBol(bol, time, isSam);
        }

        // Trigger visual UI sync at the exact scheduled audio time
        const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
        setTimeout(() => {
            if (this.isPlaying && this.onBeat) {
                this.onBeat(matraIndex + 1, taalDef.beats, bol, isSam);
            }
        }, delayMs);
    }

    _playMetronomeClick(time, isDownbeat) {
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();

        osc.frequency.setValueAtTime(isDownbeat ? 1400 : 900, time);
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(isDownbeat ? 1.0 : 0.65, time + 0.002);
        env.gain.exponentialRampToValueAtTime(0.001, time + (isDownbeat ? 0.045 : 0.030));

        osc.connect(env);
        env.connect(this.outputGain);

        osc.start(time);
        osc.stop(time + 0.06);
    }

    _playTablaBol(bol, time, isSam) {
        // Base tuned frequency of Dayan (matches tonic pitch, e.g. D4 = 293.66 Hz)
        const rootFreq = 440 * Math.pow(2, ((60 + this.tonic) - 69) / 12);

        switch (bol) {
            case 'Dha': // Bayan (bass) + Dayan (Na/Tin)
                this._synthesizeBayan(time, 105, 65, 0.32, 0.95);
                this._synthesizeDayan(time, rootFreq, 0.16, 0.85);
                break;
            case 'Dhin':
            case 'Dhi': // Bayan (bass) + Dayan (Tin)
                this._synthesizeBayan(time, 95, 60, 0.30, 0.80);
                this._synthesizeDayan(time, rootFreq, 0.18, 0.75);
                break;
            case 'Ge': // Open Bayan bass stroke
                this._synthesizeBayan(time, 110, 68, 0.35, 0.90);
                break;
            case 'Na':
            case 'Tin':
            case 'Ti': // Open ringing Dayan stroke
                this._synthesizeDayan(time, rootFreq, 0.16, 0.80);
                break;
            case 'Ta':
            case 'Ke':
            case 'Kat': // Damped slap stroke
                this._synthesizeSlap(time);
                break;
            default:
                this._synthesizeDayan(time, rootFreq, 0.14, 0.6);
        }
    }

    /**
     * Bayan: Left-hand bass drum with deep pitch glide (Meend)
     */
    _synthesizeBayan(time, startFreq, endFreq, duration, gainLevel) {
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();

        osc.type = 'sine';
        // Organic pitch-bend downward
        osc.frequency.setValueAtTime(startFreq, time);
        osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration * 0.7);

        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(gainLevel, time + 0.005);
        env.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(env);
        env.connect(this.outputGain);

        osc.start(time);
        osc.stop(time + duration + 0.05);
    }

    /**
     * Dayan: Right-hand tuned wooden drum with metallic bell resonance
     */
    _synthesizeDayan(time, freq, duration, gainLevel) {
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();

        osc.type = 'triangle'; // Resonant bell-like harmonic profile
        osc.frequency.setValueAtTime(freq, time);

        // Skin bandpass resonator
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = 6.0;

        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(gainLevel, time + 0.003);
        env.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        filter.connect(env);
        env.connect(this.outputGain);

        osc.start(time);
        osc.stop(time + duration + 0.05);
    }

    /**
     * Slap / Mute (Ta, Ke, Kat)
     */
    _synthesizeSlap(time) {
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(380, time);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1200;

        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(0.4, time + 0.002);
        env.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

        osc.connect(filter);
        filter.connect(env);
        env.connect(this.outputGain);

        osc.start(time);
        osc.stop(time + 0.08);
    }
}

if (typeof window !== 'undefined') {
    window.TablaEngine = TablaEngine;
}
