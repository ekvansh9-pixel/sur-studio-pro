/**
 * Web Harmonium Audio Engine
 * Modular Web Audio API architecture for polyphonic harmonium sound generation,
 * multi-sample interpolation, procedural synthesis fallback, reverb convolution,
 * 3-band equalizer, tone envelope control, and multi-reed layering.
 */
class HarmoniumAudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.reverbSend = null;
        this.convolver = null;
        this.eqNodes = [];
        this.proceduralHarmonium = null;

        // Configuration constants
        this.DEFAULT_SAMPLE_PATH = 'assets/harmonium-kannan-orig.wav';
        this.DEFAULT_REVERB_PATH = 'assets/reverb.wav';

        this.DEFAULT_ROOT_KEY = 62;        // MIDI Note 62 = D4
        this.DEFAULT_LOOP_START = 0.5;     // Seconds
        this.DEFAULT_ATTACK_MS = 2;
        this.DEFAULT_RELEASE_MS = 40;
        this.OCTAVE_OFFSETS = [-36, -24, -12, 0, 12, 24, 36];
        this.MAX_OCTAVE = this.OCTAVE_OFFSETS.length - 1;
        this.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        this.EQ_BANDS = [
            { id: 'eqLow', type: 'lowshelf', freq: 200 },
            { id: 'eqMid', type: 'peaking', freq: 1000, q: 0.8 },
            { id: 'eqHigh', type: 'highshelf', freq: 3500 }
        ];

        this.MAX_SAMPLES = 40;
        this.MAX_SAMPLE_BYTES = 300 * 1024 * 1024;

        // Current parameters
        this.settings = {
            volume: 30, // 1 to 100
            reverb: false,
            octave: 3,  // index 3 is 0 offset
            transpose: 0, // -11 to +11
            stack: 0,   // additional reeds (octave layers)
            attack: this.DEFAULT_ATTACK_MS,
            release: this.DEFAULT_RELEASE_MS,
            eqLow: 0,
            eqMid: 0,
            eqHigh: 0,
            soundMode: 'sample', // 'sample' or 'synth'
            samplesText: ''
        };

        // State
        this.samples = [];
        this.defaultSample = null;
        this.isLoaded = false;
        this.activeNotes = new Map(); // MIDI note -> array of voice objects

        // Callbacks
        this.onStatusChange = null;
        this.onActiveNotesChange = null;
    }

    /**
     * Initialize AudioContext and setup audio node routing
     */
    async init() {
        if (this.isLoaded && this.ctx) {
            if (this.ctx.state === 'suspended') {
                await this.ctx.resume();
            }
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            throw new Error('Web Audio API is not supported in this browser.');
        }

        if (this.ctx) {
            try { await this.ctx.close(); } catch (e) {}
        }

        this.ctx = new AudioContextClass();
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        this.proceduralHarmonium = new ProceduralHarmonium(this.ctx);

        // 1. Studio Limiter / Dynamics Compressor (prevents digital clipping at high volume)
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.setValueAtTime(-3.0, this.ctx.currentTime);
        this.limiter.knee.setValueAtTime(8.0, this.ctx.currentTime);
        this.limiter.ratio.setValueAtTime(8.0, this.ctx.currentTime);
        this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.limiter.release.setValueAtTime(0.12, this.ctx.currentTime);
        this.limiter.connect(this.ctx.destination);

        // 2. Master Gain (High Headroom: 100% volume maps to 2.2x gain for loud, punchy playback)
        this.masterGain = this.ctx.createGain();
        const initialGain = (this.settings.volume / 100) * 2.2;
        this.masterGain.gain.setValueAtTime(initialGain, this.ctx.currentTime);
        this.masterGain.connect(this.limiter);

        // 3. Reverb Routing
        this.convolver = this.ctx.createConvolver();
        this.reverbSend = this.ctx.createGain();
        this.reverbSend.gain.setValueAtTime(this.settings.reverb ? 1.0 : 0.0, this.ctx.currentTime);

        this.reverbSend.connect(this.convolver);
        this.convolver.connect(this.ctx.destination);

        // 3. 3-Band Equalizer Chain: eqNodes[0] -> eqNodes[1] -> eqNodes[2] -> masterGain & reverbSend
        this.eqNodes = this.EQ_BANDS.map(band => {
            const filter = this.ctx.createBiquadFilter();
            filter.type = band.type;
            filter.frequency.value = band.freq;
            if (band.q) filter.Q.value = band.q;
            filter.gain.value = this.settings[band.id];
            return filter;
        });

        for (let i = 0; i < this.eqNodes.length - 1; i++) {
            this.eqNodes[i].connect(this.eqNodes[i + 1]);
        }

        const lastEqNode = this.eqNodes[this.eqNodes.length - 1];
        lastEqNode.connect(this.masterGain);
        lastEqNode.connect(this.reverbSend);

        // 4. Load Reverb Impulse
        await this._loadReverbBuffer();

        // 5. Load Harmonium Sample (with automatic fallbacks)
        await this._loadDefaultHarmoniumSample();

        this.isLoaded = true;
    }

    async _fetchAudioBuffer(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} (${response.statusText || 'Fetch failed'})`);
            }
            const arrayBuffer = await response.arrayBuffer();
            return await this.ctx.decodeAudioData(arrayBuffer);
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Audio request timed out after 15 seconds.');
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async _loadReverbBuffer() {
        let reverbBuffer = null;
        try {
            // Load local acoustic impulse asset
            reverbBuffer = await this._fetchAudioBuffer(this.DEFAULT_REVERB_PATH);
        } catch (e1) {
            // High-fidelity procedural algorithmic reverb impulse fallback
            reverbBuffer = this.proceduralHarmonium.reverbImpulseBuffer;
        }
        if (reverbBuffer && this.convolver) {
            this.convolver.buffer = reverbBuffer;
        }
    }

    async _loadDefaultHarmoniumSample() {
        let buffer = null;

        try {
            buffer = await this._fetchAudioBuffer(this.DEFAULT_SAMPLE_PATH);
        } catch (e1) {
            // Activate procedural free-reed synthesis fallback
            this.settings.soundMode = 'synth';
            this.samples = [];
            return;
        }

        this.defaultSample = {
            buffer: buffer,
            root: this.DEFAULT_ROOT_KEY,
            loopStart: this.DEFAULT_LOOP_START,
            loopEnd: 0 // to duration
        };

        this.samples = [this.defaultSample];
        this.settings.soundMode = 'sample';
    }

    /**
     * Choose the nearest sample based on MIDI pitch
     */
    pickSample(targetPitch) {
        if (!this.samples || this.samples.length === 0) return null;
        let best = this.samples[0];
        let minDiff = Math.abs(best.root - targetPitch);
        for (let i = 1; i < this.samples.length; i++) {
            const diff = Math.abs(this.samples[i].root - targetPitch);
            if (diff < minDiff) {
                minDiff = diff;
                best = this.samples[i];
            }
        }
        return best;
    }

    /**
     * Parse root note string into MIDI note number (0-127)
     * e.g. "D4", "C#3", "Bb2", "62"
     */
    parseRootNote(text) {
        const t = (text || '').trim();
        if (/^\d+$/.test(t)) {
            const n = parseInt(t, 10);
            return (n >= 0 && n <= 127) ? n : null;
        }
        const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(t);
        if (!m) return null;

        const noteMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        let pc = noteMap[m[1].toUpperCase()];
        if (m[2] === '#') pc++;
        else if (m[2] === 'b') pc--;

        const octave = parseInt(m[3], 10);
        const midiNum = (octave + 1) * 12 + pc;
        return (midiNum >= 0 && midiNum <= 127) ? midiNum : null;
    }

    /**
     * Trigger a note-on event
     */
    noteOn(midiNote) {
        if (!this.ctx || this.activeNotes.has(midiNote)) return;
        if (this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
        }

        const voices = [];
        const maxReeds = this.settings.stack;

        for (let reed = 0; reed <= maxReeds; reed++) {
            const octaveIndex = this.settings.octave + reed;
            if (octaveIndex > this.MAX_OCTAVE) break;

            const targetIndex = midiNote + this.OCTAVE_OFFSETS[octaveIndex] + this.settings.transpose;
            if (targetIndex < 0 || targetIndex > 127) continue;

            const voice = this._startVoice(targetIndex, reed);
            if (voice) {
                voices.push(voice);
            }
        }

        if (voices.length > 0) {
            this.activeNotes.set(midiNote, voices);
            if (this.onActiveNotesChange) {
                this.onActiveNotesChange(midiNote, true);
            }
        }
    }

    /**
     * Trigger a note-off event
     */
    noteOff(midiNote) {
        const voices = this.activeNotes.get(midiNote);
        if (!voices) return;

        this.activeNotes.delete(midiNote);
        voices.forEach(v => this._stopVoice(v));

        if (this.onActiveNotesChange) {
            this.onActiveNotesChange(midiNote, false);
        }
    }

    /**
     * Stop all currently sounding notes
     */
    allNotesOff() {
        const notes = Array.from(this.activeNotes.keys());
        notes.forEach(note => this.noteOff(note));
        this.activeNotes.clear();
    }

    _startVoice(targetPitch, reedIndex = 0) {
        const t = this.ctx.currentTime;
        const inputDestination = this.eqNodes[0];

        // 1. Procedural Synth Mode (or fallback if no samples)
        if (this.settings.soundMode === 'synth' || !this.samples || this.samples.length === 0) {
            return {
                type: 'synth',
                handle: this.proceduralHarmonium.startVoice(targetPitch, inputDestination, {
                    attack: this.settings.attack
                })
            };
        }

        // 2. Sample-based Voice
        const s = this.pickSample(targetPitch);
        if (!s || !s.buffer) {
            // Fallback to synth if sample buffer missing
            return {
                type: 'synth',
                handle: this.proceduralHarmonium.startVoice(targetPitch, inputDestination, {
                    attack: this.settings.attack
                })
            };
        }

        const src = this.ctx.createBufferSource();
        src.buffer = s.buffer;
        src.loop = true;
        src.loopStart = s.loopStart;
        if (s.loopEnd > s.loopStart) {
            src.loopEnd = s.loopEnd;
        }

        // Detune in cents relative to sample root
        let detuneCents = (targetPitch - s.root) * 100;
        // If stacking additional reeds, add micro-detuning for richer organic chorus beating
        if (reedIndex > 0) {
            detuneCents += (reedIndex % 2 === 1 ? 3.5 : -3.5);
        }
        src.detune.value = detuneCents;

        const env = this.ctx.createGain();
        const attackSec = this.settings.attack / 1000;

        if (attackSec > 0) {
            env.gain.setValueAtTime(0, t);
            env.gain.linearRampToValueAtTime(1.0, t + attackSec);
        } else {
            env.gain.setValueAtTime(1.0, t);
        }

        src.connect(env);
        env.connect(inputDestination);
        src.start(t);

        return {
            type: 'sample',
            src: src,
            env: env
        };
    }

    _stopVoice(voice) {
        const t = this.ctx.currentTime;
        const releaseSec = this.settings.release / 1000;

        if (voice.type === 'synth') {
            voice.handle.stop(releaseSec);
            return;
        }

        if (voice.type === 'sample') {
            const g = voice.env.gain;
            g.cancelScheduledValues(t);
            g.setValueAtTime(g.value, t);
            if (releaseSec > 0) {
                g.setTargetAtTime(0, t, releaseSec / 4);
            } else {
                g.setValueAtTime(0, t);
            }

            voice.src.onended = () => {
                try {
                    voice.src.disconnect();
                    voice.env.disconnect();
                } catch (e) {}
            };

            try {
                voice.src.stop(t + releaseSec + 0.06);
            } catch (e) {}
        }
    }

    // ── Parameter Setters ──────────────────────────────────────────

    setVolume(value) {
        const clamped = Math.min(100, Math.max(1, value));
        this.settings.volume = clamped;
        if (this.masterGain && this.ctx) {
            // Enhanced volume ceiling: 100% maps to 2.2x gain, cleanly limited by studio compressor
            const targetGain = (clamped / 100) * 2.2;
            this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.01);
        }
        return clamped;
    }

    setReverb(enabled) {
        this.settings.reverb = Boolean(enabled);
        if (this.reverbSend && this.ctx) {
            this.reverbSend.gain.setTargetAtTime(this.settings.reverb ? 1.0 : 0.0, this.ctx.currentTime, 0.02);
        }
        return this.settings.reverb;
    }

    setOctave(octave) {
        this.settings.octave = Math.min(this.MAX_OCTAVE, Math.max(0, octave));
        // Clamp stack if it exceeds maximum available octave
        if (this.settings.stack > this.MAX_OCTAVE - this.settings.octave) {
            this.settings.stack = this.MAX_OCTAVE - this.settings.octave;
        }
        return this.settings.octave;
    }

    setStack(stack) {
        const maxStack = this.MAX_OCTAVE - this.settings.octave;
        this.settings.stack = Math.min(maxStack, Math.max(0, stack));
        return this.settings.stack;
    }

    setTranspose(semitones) {
        this.settings.transpose = Math.min(11, Math.max(-11, semitones));
        return this.settings.transpose;
    }

    setTone(key, value) {
        if (key in this.settings) {
            this.settings[key] = Number(value);
            const bandIndex = this.EQ_BANDS.findIndex(b => b.id === key);
            if (bandIndex >= 0 && this.eqNodes[bandIndex] && this.ctx) {
                this.eqNodes[bandIndex].gain.setTargetAtTime(this.settings[key], this.ctx.currentTime, 0.01);
            }
        }
    }

    resetTone() {
        this.settings.attack = this.DEFAULT_ATTACK_MS;
        this.settings.release = this.DEFAULT_RELEASE_MS;
        this.settings.eqLow = 0;
        this.settings.eqMid = 0;
        this.settings.eqHigh = 0;

        this.EQ_BANDS.forEach(b => {
            this.setTone(b.id, 0);
        });
    }

    setSoundMode(mode) {
        if (mode === 'synth' || mode === 'sample') {
            this.allNotesOff();
            this.settings.soundMode = mode;
        }
        return this.settings.soundMode;
    }

    // ── Sampler Support ──────────────────────────────────────────

    _finishSample(buffer, root, loopStart, loopEnd) {
        if (loopStart === null || loopStart === undefined) {
            loopStart = buffer.duration > 1 ? this.DEFAULT_LOOP_START : 0;
        }
        loopStart = Math.min(loopStart, Math.max(0, buffer.duration - 0.05));
        const validLoopEnd = (loopEnd > loopStart && loopEnd <= buffer.duration) ? loopEnd : 0;
        return {
            buffer,
            root,
            loopStart,
            loopEnd: validLoopEnd
        };
    }

    _calculateSampleBytes(list) {
        return list.reduce((total, s) => {
            return total + (s.buffer.length * s.buffer.numberOfChannels * 4);
        }, 0);
    }

    async loadSamplesFromText(text) {
        const lines = (text || '').split(/\r?\n/);
        const entries = [];

        lines.forEach((raw, i) => {
            const line = raw.trim();
            if (!line || line.startsWith('#')) return;

            const parts = line.split(/[\s,]+/);
            if (parts.length < 2) {
                throw new Error(`Line ${i + 1}: add note after URL (e.g. https://.../note.wav D4)`);
            }

            let url;
            try {
                url = new URL(parts[0], window.location.href);
            } catch (e) {
                throw new Error(`Line ${i + 1}: invalid URL format.`);
            }

            // Security: Enforce HTTP/HTTPS protocols only (prevent javascript:, file:, data:, blob:, etc.)
            if (url.protocol !== 'https:' && url.protocol !== 'http:') {
                throw new Error(`Line ${i + 1}: only secure HTTP and HTTPS audio URLs are permitted.`);
            }

            // Prevent Mixed Content blocking when hosted on HTTPS (e.g. GitHub Pages)
            if (window.location.protocol === 'https:' && url.protocol === 'http:') {
                throw new Error(`Line ${i + 1}: HTTPS is required when running on a secure domain.`);
            }

            const root = this.parseRootNote(parts[1]);
            if (root === null) {
                throw new Error(`Line ${i + 1}: "${parts[1]}" is not a valid note.`);
            }

            const loopStart = parts.length > 2 ? parseFloat(parts[2]) : null;
            const loopEnd = parts.length > 3 ? parseFloat(parts[3]) : 0;

            entries.push({ url: url.href, root, loopStart, loopEnd });
        });

        if (entries.length === 0) {
            throw new Error('No valid sample entries found.');
        }

        if (entries.length > this.MAX_SAMPLES) {
            throw new Error(`Maximum of ${this.MAX_SAMPLES} samples allowed.`);
        }

        const loadedSamples = await Promise.all(entries.map(async entry => {
            let buffer;
            try {
                buffer = await this._fetchAudioBuffer(entry.url);
            } catch (err) {
                throw new Error(`Failed to load ${entry.url}: ${err.message}`);
            }
            return this._finishSample(buffer, entry.root, entry.loopStart, entry.loopEnd);
        }));

        if (this._calculateSampleBytes(loadedSamples) > this.MAX_SAMPLE_BYTES) {
            throw new Error('Samples exceed maximum 300MB memory limit.');
        }

        this.allNotesOff();
        this.samples = loadedSamples;
        this.settings.soundMode = 'sample';
        this.settings.samplesText = text;

        return {
            count: this.samples.length,
            memoryMB: Math.max(1, Math.round(this._calculateSampleBytes(this.samples) / 1048576))
        };
    }

    async loadSamplesFromFiles(fileList) {
        const files = Array.from(fileList || []);
        if (files.length === 0) return null;
        if (files.length > this.MAX_SAMPLES) {
            throw new Error(`Please select at most ${this.MAX_SAMPLES} files.`);
        }

        const loaded = [];
        for (const file of files) {
            // Defense-in-depth: limit per-file input size to 50MB to protect memory
            if (file.size > 50 * 1024 * 1024) {
                throw new Error(`File "${file.name}" exceeds the maximum allowed file size of 50MB.`);
            }

            const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
            const match = /(?:^|[^A-Za-z])([A-Ga-g][#b]?-?\d)(?!\d)/.exec(nameWithoutExt);
            const root = match ? this.parseRootNote(match[1]) : null;

            if (root === null) {
                throw new Error(`File "${file.name}" has no note pitch in its name (e.g. harmonium_D4.wav).`);
            }

            let buffer;
            try {
                const arrayBuffer = await file.arrayBuffer();
                buffer = await this.ctx.decodeAudioData(arrayBuffer);
            } catch (err) {
                throw new Error(`Could not decode audio from "${file.name}".`);
            }

            loaded.push(this._finishSample(buffer, root, null, 0));
        }

        if (this._calculateSampleBytes(loaded) > this.MAX_SAMPLE_BYTES) {
            throw new Error('Files exceed memory limit of 300MB.');
        }

        this.allNotesOff();
        this.samples = loaded;
        this.settings.soundMode = 'sample';

        return {
            count: this.samples.length,
            memoryMB: Math.max(1, Math.round(this._calculateSampleBytes(this.samples) / 1048576))
        };
    }

    resetToDefaultSample() {
        this.allNotesOff();
        if (this.defaultSample) {
            this.samples = [this.defaultSample];
            this.settings.soundMode = 'sample';
        } else {
            this.samples = [];
            this.settings.soundMode = 'synth';
        }
        this.settings.samplesText = '';
    }
}

if (typeof window !== 'undefined') {
    window.HarmoniumAudioEngine = HarmoniumAudioEngine;
}
