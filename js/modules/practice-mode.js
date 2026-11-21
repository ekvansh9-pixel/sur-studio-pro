/**
 * SUR STUDIO - Practice Mode (Feature D)
 * Provides interactive Indian Classical Alankar & scale practice patterns,
 * real-time pitch feedback, target note sequencing, and accuracy tracking.
 */
class PracticeMode {
    constructor(scaleExplorer) {
        this.scaleExplorer = scaleExplorer;
        this.isActive = false;
        this.currentPatternId = 'arohana';
        this.currentIndex = 0;
        this.sequence = [];

        this.lastPlayedNote = null;
        this.stats = { correct: 0, total: 0, streak: 0 };

        this.PATTERNS = {
            'arohana': {
                name: 'Arohana & Avarohana (Scale Ascend/Descend)',
                desc: 'Full octave scale up to Taar Sa and return down to Mandra Sa.',
                generate: (scale, tonicMidi) => {
                    const up = scale.intervals.map(i => tonicMidi + i);
                    up.push(tonicMidi + 12); // High Sa
                    const down = [...up].reverse().slice(1); // Down back to root
                    return [...up, ...down];
                }
            },
            'four_note': {
                name: '4-Note Step (Sa Re Ga Ma)',
                desc: 'Classic 4-note progressive alankar: S-R-G-M, R-G-M-P, G-M-P-D...',
                generate: (scale, tonicMidi) => {
                    const oct = [...scale.intervals.map(i => tonicMidi + i), tonicMidi + 12, tonicMidi + 14, tonicMidi + 16];
                    const seq = [];
                    for (let i = 0; i < scale.intervals.length; i++) {
                        seq.push(oct[i], oct[i+1], oct[i+2], oct[i+3]);
                    }
                    return seq;
                }
            },
            'skip_return': {
                name: 'Skip & Return (Sa Ga Re Sa)',
                desc: 'Skip a note and resolve: S-G-R-S, R-M-G-R, G-P-M-G...',
                generate: (scale, tonicMidi) => {
                    const oct = [...scale.intervals.map(i => tonicMidi + i), tonicMidi + 12, tonicMidi + 14];
                    const seq = [];
                    for (let i = 0; i < scale.intervals.length; i++) {
                        seq.push(oct[i], oct[i+2], oct[i+1], oct[i]);
                    }
                    return seq;
                }
            },
            'zigzag': {
                name: 'Zigzag (Sa Re Ga Re)',
                desc: 'Three steps forward, one step back: S-R-G-R, R-G-M-G, G-M-P-M...',
                generate: (scale, tonicMidi) => {
                    const oct = [...scale.intervals.map(i => tonicMidi + i), tonicMidi + 12, tonicMidi + 14];
                    const seq = [];
                    for (let i = 0; i < scale.intervals.length; i++) {
                        seq.push(oct[i], oct[i+1], oct[i+2], oct[i+1]);
                    }
                    return seq;
                }
            }
        };

        this.onStateChange = null;

        // Auto-rebuild sequence when scale or tonic updates
        if (this.scaleExplorer) {
            this.scaleExplorer.subscribe(() => {
                if (this.isActive) {
                    this.rebuildSequence();
                }
            });
        }
    }

    setEnabled(enabled) {
        this.isActive = Boolean(enabled);
        if (this.isActive) {
            this.rebuildSequence();
        } else {
            this.lastPlayedNote = null;
        }
        this._notify();
    }

    setPattern(patternId) {
        if (this.PATTERNS[patternId]) {
            this.currentPatternId = patternId;
            this.currentIndex = 0;
            this.rebuildSequence();
        }
    }

    rebuildSequence() {
        const scale = this.scaleExplorer.getCurrentScale();
        // Tonic base in Middle register (Middle C4 = 60 + tonic)
        const tonicMidi = 60 + this.scaleExplorer.tonic;
        const patternDef = this.PATTERNS[this.currentPatternId] || this.PATTERNS['arohana'];

        const rawMidiNotes = patternDef.generate(scale, tonicMidi);
        this.sequence = rawMidiNotes.map(midi => {
            return {
                midi: midi,
                western: this.scaleExplorer.NOTE_NAMES[midi % 12],
                swara: this.scaleExplorer.getSwaramName(midi)
            };
        });

        if (this.currentIndex >= this.sequence.length) {
            this.currentIndex = 0;
        }
        this._notify();
    }

    getTargetNote() {
        if (!this.isActive || this.sequence.length === 0) return null;
        return this.sequence[this.currentIndex];
    }

    onNotePlayed(midiNote) {
        if (!this.isActive || this.sequence.length === 0) return;

        const target = this.sequence[this.currentIndex];
        // Match pitch class (or exact octave)
        const isExactMatch = (midiNote === target.midi);
        const isPitchClassMatch = ((midiNote % 12) === (target.midi % 12));
        const isCorrect = isExactMatch || isPitchClassMatch;

        this.stats.total++;
        if (isCorrect) {
            this.stats.correct++;
            this.stats.streak++;
            this.currentIndex = (this.currentIndex + 1) % this.sequence.length;
        } else {
            this.stats.streak = 0;
        }

        this.lastPlayedNote = {
            midi: midiNote,
            western: this.scaleExplorer.NOTE_NAMES[midiNote % 12],
            swara: this.scaleExplorer.getSwaramName(midiNote),
            isCorrect: isCorrect,
            inScale: this.scaleExplorer.isNoteInScale(midiNote)
        };

        this._notify();
    }

    reset() {
        this.currentIndex = 0;
        this.stats = { correct: 0, total: 0, streak: 0 };
        this.lastPlayedNote = null;
        this._notify();
    }

    _notify() {
        if (this.onStateChange) {
            this.onStateChange(this);
        }
    }
}

if (typeof window !== 'undefined') {
    window.PracticeMode = PracticeMode;
}
