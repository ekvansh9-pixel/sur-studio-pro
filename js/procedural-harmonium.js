/**
 * Procedural Harmonium Audio Synthesis & Algorithmic Reverb
 * Provides a high-fidelity physical approximation of an Indian Harmonium
 * when samples are unavailable or as an alternative synthesis engine.
 */
class ProceduralHarmonium {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.bellowsNoiseBuffer = this._generateBellowsNoise();
        this.reverbImpulseBuffer = this._generateReverbImpulse(2.5, 2.0);
    }

    /**
     * Generate subtle air / bellows turbulence noise buffer
     */
    _generateBellowsNoise() {
        const length = this.ctx.sampleRate * 2; // 2 seconds loop
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        // Pink-ish noise filter
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut * 0.95) + (white * 0.05);
            data[i] = lastOut;
        }
        return buffer;
    }

    /**
     * Procedurally generate an acoustic hall impulse response
     * Used when external reverb.wav is unavailable or offline
     */
    _generateReverbImpulse(duration = 2.5, decay = 2.0) {
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * duration);
        const impulse = this.ctx.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = i / length;
            // Exponential decay envelope
            const envelope = Math.exp(-n * decay * 4);
            // Diffusion with stereo decorrelation
            left[i] = (Math.random() * 2 - 1) * envelope;
            right[i] = (Math.random() * 2 - 1) * envelope;
        }
        return impulse;
    }

    /**
     * Create a realistic periodic wave for a harmonium free reed
     * Free reeds have asymmetric vibration with strong 2nd, 3rd, 4th, 5th harmonics
     */
    createHarmoniumWave(reedType = 'male') {
        const nCoeffs = 32;
        const real = new Float32Array(nCoeffs);
        const imag = new Float32Array(nCoeffs);

        // Harmonium reed harmonic profile
        const harmonicWeights = [
            0,    // DC
            1.00, // 1st (fundamental)
            0.75, // 2nd
            0.60, // 3rd (prominent reed buzz)
            0.45, // 4th
            0.35, // 5th
            0.28, // 6th
            0.22, // 7th
            0.18, // 8th
            0.14, // 9th
            0.11, // 10th
            0.08, // 11th
            0.06, // 12th
            0.05, // 13th
            0.04, // 14th
            0.03  // 15th
        ];

        for (let i = 1; i < Math.min(nCoeffs, harmonicWeights.length); i++) {
            // Slight odd/even harmonic emphasis based on reed type
            let weight = harmonicWeights[i];
            if (reedType === 'bass' && i <= 3) weight *= 1.3;
            if (reedType === 'female' && i >= 4) weight *= 1.2;
            imag[i] = weight;
        }

        return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    }

    /**
     * Start a synthesized harmonium voice
     */
    startVoice(midiPitch, destination, options = {}) {
        const t = this.ctx.currentTime;
        const attack = (options.attack || 2) / 1000;
        const freq = 440 * Math.pow(2, (midiPitch - 69) / 12);

        // Main master gain for this voice
        const voiceGain = this.ctx.createGain();
        voiceGain.gain.setValueAtTime(0, t);
        if (attack > 0) {
            voiceGain.gain.linearRampToValueAtTime(0.4, t + attack);
        } else {
            voiceGain.gain.setValueAtTime(0.4, t);
        }

        // Resonant acoustic chamber filter (harmonium wooden body formants)
        const bodyFilter = this.ctx.createBiquadFilter();
        bodyFilter.type = 'peaking';
        bodyFilter.frequency.value = 1150; // Harmonium body resonance
        bodyFilter.Q.value = 1.4;
        bodyFilter.gain.value = 4.0;

        const lowCut = this.ctx.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 65;

        // Two detuned reed oscillators (creates natural acoustic beating / chorusing)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();

        const reedWave = this.createHarmoniumWave(midiPitch < 55 ? 'bass' : 'male');
        osc1.setPeriodicWave(reedWave);
        osc2.setPeriodicWave(reedWave);

        osc1.frequency.setValueAtTime(freq, t);
        // Subtle detuning: 3.5 cents difference gives authentic slow harmonium wave beating
        osc2.frequency.setValueAtTime(freq * Math.pow(2, 3.5 / 1200), t);

        // Mix oscillators
        const oscMix = this.ctx.createGain();
        oscMix.gain.value = 0.5;

        osc1.connect(oscMix);
        osc2.connect(oscMix);

        // Subtle bellows air hiss
        let airSource = null;
        let airGain = null;
        if (this.bellowsNoiseBuffer) {
            airSource = this.ctx.createBufferSource();
            airSource.buffer = this.bellowsNoiseBuffer;
            airSource.loop = true;

            const airFilter = this.ctx.createBiquadFilter();
            airFilter.type = 'bandpass';
            airFilter.frequency.value = Math.min(3200, freq * 2.5);
            airFilter.Q.value = 2.0;

            airGain = this.ctx.createGain();
            airGain.gain.value = 0.012; // Very gentle breath

            airSource.connect(airFilter);
            airFilter.connect(airGain);
            airGain.connect(bodyFilter);
            airSource.start(t);
        }

        // Connect chain: oscMix -> bodyFilter -> lowCut -> voiceGain -> destination
        oscMix.connect(bodyFilter);
        bodyFilter.connect(lowCut);
        lowCut.connect(voiceGain);
        voiceGain.connect(destination);

        osc1.start(t);
        osc2.start(t);

        return {
            oscillators: [osc1, osc2],
            noiseSource: airSource,
            gainNode: voiceGain,
            stop: (releaseTime) => {
                const stopT = this.ctx.currentTime;
                const g = voiceGain.gain;
                g.cancelScheduledValues(stopT);
                g.setValueAtTime(g.value, stopT);
                if (releaseTime > 0) {
                    g.setTargetAtTime(0, stopT, releaseTime / 4);
                } else {
                    g.setValueAtTime(0, stopT);
                }

                const killTime = stopT + releaseTime + 0.06;
                osc1.stop(killTime);
                osc2.stop(killTime);
                if (airSource) {
                    try { airSource.stop(killTime); } catch (e) {}
                }

                setTimeout(() => {
                    try {
                        osc1.disconnect();
                        osc2.disconnect();
                        if (airSource) airSource.disconnect();
                        voiceGain.disconnect();
                    } catch (e) {}
                }, (releaseTime + 0.1) * 1000);
            }
        };
    }
}

if (typeof window !== 'undefined') {
    window.ProceduralHarmonium = ProceduralHarmonium;
}
