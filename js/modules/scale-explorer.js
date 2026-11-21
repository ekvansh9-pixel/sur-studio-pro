/**
 * SUR STUDIO - Scale Explorer Module
 * Provides Western scales, Indian Classical Thaats (Bhatkhande 10 Thaats),
 * Tonic (Sa) mapping, and visual key-highlighting metadata without altering audio pitch.
 */
class ScaleExplorer {
    constructor() {
        this.enabled = false;
        this.tonic = 0; // 0 = C, 1 = C#, 2 = D, etc. (Pitch class)
        this.currentScaleId = 'bilawal';

        this.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Scale definitions (semitone offsets from tonic)
        this.SCALES = {
            // Indian Classical 10 Thaats
            'bilawal': {
                name: 'Bilawal Thaat (Major)',
                category: 'Indian Thaat',
                swaras: ['S', 'R', 'G', 'M', 'P', 'D', 'N'],
                intervals: [0, 2, 4, 5, 7, 9, 11],
                desc: 'All natural notes (Shuddha Swaras). Pure and bright.'
            },
            'kalyan': {
                name: 'Kalyan Thaat (Lydian)',
                category: 'Indian Thaat',
                swaras: ['S', 'R', 'G', 'Ḿ', 'P', 'D', 'N'],
                intervals: [0, 2, 4, 6, 7, 9, 11],
                desc: 'Features Teevra (sharp) Ma. Grand and serene evening mood.'
            },
            'khamaj': {
                name: 'Khamaj Thaat (Mixolydian)',
                category: 'Indian Thaat',
                swaras: ['S', 'R', 'G', 'M', 'P', 'D', 'n'],
                intervals: [0, 2, 4, 5, 7, 9, 10],
                desc: 'Features Komal (flat) Ni. Light, romantic, and expressive.'
            },
            'kafi': {
                name: 'Kafi Thaat (Dorian)',
                category: 'Indian Thaat',
                swaras: ['S', 'R', 'g', 'M', 'P', 'D', 'n'],
                intervals: [0, 2, 3, 5, 7, 9, 10],
                desc: 'Komal Ga and Komal Ni. Pastoral, folk, and Holi ragas.'
            },
            'asavari': {
                name: 'Asavari Thaat (Natural Minor)',
                category: 'Indian Thaat',
                swaras: ['S', 'R', 'g', 'M', 'P', 'd', 'n'],
                intervals: [0, 2, 3, 5, 7, 8, 10],
                desc: 'Komal Ga, Dha, and Ni. Contemplative and tender.'
            },
            'bhairav': {
                name: 'Bhairav Thaat (Double Harmonic)',
                category: 'Indian Thaat',
                swaras: ['S', 'r', 'G', 'M', 'P', 'd', 'N'],
                intervals: [0, 1, 4, 5, 7, 8, 11],
                desc: 'Komal Re and Dha. Majestic early-morning meditative atmosphere.'
            },
            'bhairavi': {
                name: 'Bhairavi Thaat (Phrygian)',
                category: 'Indian Thaat',
                swaras: ['S', 'r', 'g', 'M', 'P', 'd', 'n'],
                intervals: [0, 1, 3, 5, 7, 8, 10],
                desc: 'All Komal notes (Re, Ga, Dha, Ni). Devotional and concluding.'
            },
            'todi': {
                name: 'Todi Thaat',
                category: 'Indian Thaat',
                swaras: ['S', 'r', 'g', 'Ḿ', 'P', 'd', 'N'],
                intervals: [0, 1, 3, 6, 7, 8, 11],
                desc: 'Komal Re, Ga, Dha + Teevra Ma. Deep pathos and devotion.'
            },
            'poorvi': {
                name: 'Poorvi Thaat',
                category: 'Indian Thaat',
                swaras: ['S', 'r', 'G', 'Ḿ', 'P', 'd', 'N'],
                intervals: [0, 1, 4, 6, 7, 8, 11],
                desc: 'Komal Re, Dha + Teevra Ma. Twilight sandhiprakash contemplation.'
            },
            'marwa': {
                name: 'Marwa Thaat',
                category: 'Indian Thaat',
                swaras: ['S', 'r', 'G', 'Ḿ', 'D', 'N'],
                intervals: [0, 1, 4, 6, 9, 11], // Hexatonic without Pa
                desc: 'Komal Re and Teevra Ma, omitting Pa. Anxious yearning and mysticism.'
            },

            // Western Scales
            'major': {
                name: 'Major Scale (Ionian)',
                category: 'Western',
                swaras: ['1', '2', '3', '4', '5', '6', '7'],
                intervals: [0, 2, 4, 5, 7, 9, 11],
                desc: 'Standard diatonic major scale.'
            },
            'natural_minor': {
                name: 'Natural Minor (Aeolian)',
                category: 'Western',
                swaras: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
                intervals: [0, 2, 3, 5, 7, 8, 10],
                desc: 'Standard natural minor scale.'
            },
            'harmonic_minor': {
                name: 'Harmonic Minor',
                category: 'Western',
                swaras: ['1', '2', '♭3', '4', '5', '♭6', '7'],
                intervals: [0, 2, 3, 5, 7, 8, 11],
                desc: 'Minor scale with raised 7th degree (augmented 2nd).'
            },
            'melodic_minor': {
                name: 'Melodic Minor',
                category: 'Western',
                swaras: ['1', '2', '♭3', '4', '5', '6', '7'],
                intervals: [0, 2, 3, 5, 7, 9, 11],
                desc: 'Jazz/classical ascending melodic minor with raised 6th and 7th.'
            },
            'pentatonic_major': {
                name: 'Pentatonic Major (Bhupali)',
                category: 'Pentatonic',
                swaras: ['S', 'R', 'G', 'P', 'D'],
                intervals: [0, 2, 4, 7, 9],
                desc: '5-note scale: Sa, Re, Ga, Pa, Dha. Universal melody.'
            },
            'pentatonic_minor': {
                name: 'Pentatonic Minor (Megh/Dhani)',
                category: 'Pentatonic',
                swaras: ['S', 'g', 'M', 'P', 'n'],
                intervals: [0, 3, 5, 7, 10],
                desc: '5-note blues and folk foundation.'
            },
            'chromatic': {
                name: 'Chromatic Scale (All 12 Notes)',
                category: 'Chromatic',
                swaras: ['1', '♯1', '2', '♯2', '3', '4', '♯4', '5', '♯5', '6', '♯6', '7'],
                intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
                desc: 'Complete 12-semitone chromatic scale.'
            }
        };

        this.onChangeCallbacks = [];
    }

    subscribe(callback) {
        this.onChangeCallbacks.push(callback);
    }

    notify() {
        this.onChangeCallbacks.forEach(cb => cb(this));
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        this.notify();
    }

    setTonic(pitchClass) {
        this.tonic = ((Number(pitchClass) % 12) + 12) % 12;
        this.notify();
    }

    setScale(scaleId) {
        if (this.SCALES[scaleId]) {
            this.currentScaleId = scaleId;
            this.notify();
        }
    }

    getCurrentScale() {
        return this.SCALES[this.currentScaleId] || this.SCALES['bilawal'];
    }

    getTonicName() {
        return this.NOTE_NAMES[this.tonic];
    }

    isTonic(midiNote) {
        return (midiNote % 12) === this.tonic;
    }

    isNoteInScale(midiNote) {
        const interval = ((midiNote % 12) - this.tonic + 12) % 12;
        const scale = this.getCurrentScale();
        return scale.intervals.includes(interval);
    }

    /**
     * Get swaram label for a given MIDI note based on current tonic and scale
     */
    getSwaramName(midiNote) {
        const interval = ((midiNote % 12) - this.tonic + 12) % 12;
        const swaraMap = {
            0: 'S',  1: 'r',  2: 'R',  3: 'g',
            4: 'G',  5: 'M',  6: 'Ḿ', 7: 'P',
            8: 'd',  9: 'D',  10: 'n', 11: 'N'
        };
        const base = swaraMap[interval] || 'S';

        // Octave dots (relative to Middle C4 = 60 + tonic)
        const tonicCenter = 60 + this.tonic;
        if (midiNote < tonicCenter) {
            return base + '̣'; // Lower octave dot (Mandra)
        } else if (midiNote >= tonicCenter + 12) {
            return base + '̇'; // Higher octave dot (Taar)
        }
        return base;
    }
}

if (typeof window !== 'undefined') {
    window.ScaleExplorer = ScaleExplorer;
}
