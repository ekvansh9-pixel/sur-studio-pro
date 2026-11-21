/**
 * SUR STUDIO - Dedicated Drone Engine (Feature B)
 * Provides authentic, continuous tanpura/harmonium background drone (Sur)
 * with dedicated gain routing, independent of keyboard polyphony.
 */
class DroneEngine {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.ctx = null;
        this.droneMasterGain = null;
        this.droneFilter = null;

        this.isActive = false;
        this.volume = 0.4; // 0 to 1
        this.combination = 'sa_pa'; // 'sa', 'sa_pa', 'sa_ma', 'sa_pa_sa'
        this.octave = 'mandra'; // 'mandra' (low) or 'madhya' (middle)
        this.tonic = 0; // 0 = C, 1 = C#, 2 = D...

        this.activeVoices = [];
        this.lfo = null;
        this.lfoGain = null;
    }

    _ensureAudioContext() {
        if (!this.ctx && this.audioEngine && this.audioEngine.ctx) {
            this.ctx = this.audioEngine.ctx;

            // Dedicated Drone bus connecting directly to master
            this.droneMasterGain = this.ctx.createGain();
            this.droneMasterGain.gain.setValueAtTime(0, this.ctx.currentTime);

            // Warm acoustic body filter for drone
            this.droneFilter = this.ctx.createBiquadFilter();
            this.droneFilter.type = 'lowpass';
            this.droneFilter.frequency.value = 1600;

            this.droneFilter.connect(this.droneMasterGain);
            this.droneMasterGain.connect(this.audioEngine.masterGain);
        }
        return Boolean(this.ctx);
    }

    setTonic(tonicPitchClass) {
        this.tonic = ((Number(tonicPitchClass) % 12) + 12) % 12;
        if (this.isActive) {
            this._restartVoices();
        }
    }

    setCombination(comb) {
        this.combination = comb;
        if (this.isActive) {
            this._restartVoices();
        }
    }

    setOctave(oct) {
        this.octave = oct;
        if (this.isActive) {
            this._restartVoices();
        }
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.isActive && this.droneMasterGain && this.ctx) {
            this.droneMasterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
        }
    }

    start() {
        if (this.isActive) return;
        if (!this._ensureAudioContext()) {
            console.warn('AudioContext not ready for Drone.');
            return;
        }

        if (this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
        }

        this.isActive = true;
        this._spawnVoices();

        // Smooth fade-in
        const t = this.ctx.currentTime;
        this.droneMasterGain.gain.cancelScheduledValues(t);
        this.droneMasterGain.gain.setValueAtTime(0, t);
        this.droneMasterGain.gain.linearRampToValueAtTime(this.volume, t + 0.8);
    }

    stop() {
        if (!this.isActive) return;
        this.isActive = false;

        if (this.droneMasterGain && this.ctx) {
            const t = this.ctx.currentTime;
            this.droneMasterGain.gain.cancelScheduledValues(t);
            this.droneMasterGain.gain.setValueAtTime(this.droneMasterGain.gain.value, t);
            this.droneMasterGain.gain.linearRampToValueAtTime(0, t + 0.6);

            const voicesToStop = [...this.activeVoices];
            this.activeVoices = [];

            setTimeout(() => {
                voicesToStop.forEach(v => {
                    try {
                        v.osc1.stop();
                        v.osc2.stop();
                        v.osc1.disconnect();
                        v.osc2.disconnect();
                        v.gain.disconnect();
                    } catch (e) {}
                });
            }, 700);
        }
    }

    toggle() {
        if (this.isActive) {
            this.stop();
        } else {
            this.start();
        }
        return this.isActive;
    }

    _restartVoices() {
        const voicesToStop = [...this.activeVoices];
        this.activeVoices = [];

        voicesToStop.forEach(v => {
            try {
                v.osc1.stop();
                v.osc2.stop();
                v.osc1.disconnect();
                v.osc2.disconnect();
                v.gain.disconnect();
            } catch (e) {}
        });

        if (this.isActive) {
            this._spawnVoices();
        }
    }

    _spawnVoices() {
        // Base MIDI note for Sa
        const baseSa = this.octave === 'mandra' ? (48 + this.tonic) : (60 + this.tonic);

        const pitches = [];
        switch (this.combination) {
            case 'sa':
                pitches.push(baseSa);
                break;
            case 'sa_pa':
                pitches.push(baseSa);
                pitches.push(baseSa + 7); // Pa = 5th
                break;
            case 'sa_ma':
                pitches.push(baseSa);
                pitches.push(baseSa + 5); // Ma = 4th
                break;
            case 'sa_pa_sa':
                pitches.push(baseSa);
                pitches.push(baseSa + 7);
                pitches.push(baseSa + 12); // High Sa
                break;
            default:
                pitches.push(baseSa, baseSa + 7);
        }

        pitches.forEach((midiPitch, idx) => {
            const voice = this._createDroneVoice(midiPitch, idx);
            if (voice) this.activeVoices.push(voice);
        });
    }

    _createDroneVoice(midiPitch, index) {
        const t = this.ctx.currentTime;
        const freq = 440 * Math.pow(2, (midiPitch - 69) / 12);

        const voiceGain = this.ctx.createGain();
        // Slightly softer levels for high notes
        voiceGain.gain.value = 0.35 / (index + 1);

        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();

        // Use harmonium wave if available, or rich sawtooth with filter
        if (this.audioEngine.proceduralHarmonium) {
            const wave = this.audioEngine.proceduralHarmonium.createHarmoniumWave('bass');
            osc1.setPeriodicWave(wave);
            osc2.setPeriodicWave(wave);
        } else {
            osc1.type = 'sawtooth';
            osc2.type = 'sawtooth';
        }

        osc1.frequency.setValueAtTime(freq, t);
        // Subtle acoustic beating (1.8 cents)
        osc2.frequency.setValueAtTime(freq * Math.pow(2, 1.8 / 1200), t);

        osc1.connect(voiceGain);
        osc2.connect(voiceGain);
        voiceGain.connect(this.droneFilter);

        osc1.start(t);
        osc2.start(t);

        return { osc1, osc2, gain: voiceGain };
    }
}

if (typeof window !== 'undefined') {
    window.DroneEngine = DroneEngine;
}
