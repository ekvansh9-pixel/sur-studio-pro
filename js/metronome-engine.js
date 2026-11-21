/**
 * SUR STUDIO PRO — Precision Web Audio Metronome
 * High-precision lookahead scheduler using audioContext.currentTime.
 * Supports Western time signatures (4/4, 3/4, 6/8) and Indian Classical Taals
 * (Teentaal 16, Keherwa 8, Dadra 6, Rupak 7) without JS timer drift.
 */
class MetronomeEngine {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.ctx = null;
        this.outputGain = null;

        this.isPlaying = false;
        this.bpm = 90; // Beats per minute
        this.volume = 0.5; // 0 to 1
        this.timeSignature = '4/4'; // 4/4, 3/4, 6/8, 16 (Teentaal), 8 (Keherwa), 6 (Dadra), 7 (Rupak)
        this.subdivision = 1; // 1 = quarter, 2 = eighth, 3 = triplet

        // Scheduling internals
        this.lookaheadMs = 25.0; // How frequently to call scheduling function (ms)
        this.scheduleAheadSec = 0.1; // How far ahead to schedule audio (sec)
        this.nextNoteTime = 0.0;
        this.currentBeat = 0; // 0-indexed
        this.timerId = null;

        // Visual callback for UI pulse
        this.onBeat = null; // (beatIndex, totalBeats, isDownbeat) => {}

        this.TIME_SIGNATURES = {
            '4/4': { name: '4/4 Common Time', beats: 4, label: '4/4' },
            '3/4': { name: '3/4 Waltz Time', beats: 3, label: '3/4' },
            '6/8': { name: '6/8 Compound Time', beats: 6, label: '6/8' },
            '16/teentaal': { name: 'Teentaal (16 Matras)', beats: 16, label: '16 Teentaal' },
            '8/keherwa': { name: 'Keherwa (8 Matras)', beats: 8, label: '8 Keherwa' },
            '6/dadra': { name: 'Dadra (6 Matras)', beats: 6, label: '6 Dadra' },
            '7/rupak': { name: 'Rupak (7 Matras)', beats: 7, label: '7 Rupak' }
        };
    }

    _ensureAudioContext() {
        if (!this.ctx && this.audioEngine && this.audioEngine.ctx) {
            this.ctx = this.audioEngine.ctx;
            this.outputGain = this.ctx.createGain();
            // High click volume ceiling (2.0x boost)
            this.outputGain.gain.setValueAtTime(this.volume * 2.0, this.ctx.currentTime);
            // Connect to limiter if available, otherwise destination
            const targetDest = this.audioEngine.limiter || this.ctx.destination;
            this.outputGain.connect(targetDest);
        }
        return Boolean(this.ctx);
    }

    setBpm(newBpm) {
        this.bpm = Math.max(30, Math.min(260, Number(newBpm)));
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, Number(vol)));
        if (this.outputGain && this.ctx) {
            this.outputGain.gain.setValueAtTime(this.volume * 2.0, this.ctx.currentTime);
        }
    }

    setTimeSignature(sigKey) {
        if (this.TIME_SIGNATURES[sigKey]) {
            this.timeSignature = sigKey;
            this.currentBeat = 0;
        }
    }

    setSubdivision(sub) {
        this.subdivision = Math.max(1, Math.min(4, Number(sub)));
    }

    getTotalBeats() {
        return (this.TIME_SIGNATURES[this.timeSignature] || this.TIME_SIGNATURES['4/4']).beats;
    }

    start() {
        if (this.isPlaying) return;
        if (!this._ensureAudioContext()) return;

        if (this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
        }

        this.isPlaying = true;
        this.currentBeat = 0;
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
            this._scheduleClick(this.currentBeat, this.nextNoteTime);
            this._advanceBeat();
        }

        this.timerId = setTimeout(() => this._scheduler(), this.lookaheadMs);
    }

    _advanceBeat() {
        const secondsPerBeat = 60.0 / this.bpm;
        const totalBeats = this.getTotalBeats();

        this.nextNoteTime += secondsPerBeat;
        this.currentBeat = (this.currentBeat + 1) % totalBeats;
    }

    _scheduleClick(beatIndex, time) {
        const isDownbeat = (beatIndex === 0);
        const osc = this.ctx.createOscillator();
        const envelope = this.ctx.createGain();

        // Downbeat (Sam): Higher pitched sharp wooden block (1450 Hz)
        // Secondary beats: Mellow wooden click (950 Hz)
        osc.frequency.setValueAtTime(isDownbeat ? 1450 : 950, time);

        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(isDownbeat ? 1.5 : 1.1, time + 0.002);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + (isDownbeat ? 0.055 : 0.038));

        osc.connect(envelope);
        envelope.connect(this.outputGain);

        osc.start(time);
        osc.stop(time + 0.06);

        // Schedule visual indicator trigger aligned with sound
        const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
        setTimeout(() => {
            if (this.isPlaying && this.onBeat) {
                this.onBeat(beatIndex, this.getTotalBeats(), isDownbeat);
            }
        }, delayMs);
    }
}

if (typeof window !== 'undefined') {
    window.MetronomeEngine = MetronomeEngine;
}
