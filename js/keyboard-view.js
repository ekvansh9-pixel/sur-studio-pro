/**
 * SUR STUDIO - Clean & Professional Harmonium Keyboard View (SVG)
 * High-definition 23-key ivory & ebony keyboard with realistic tactile depth,
 * octave boundary separators, toggleable label modes (Sargam / Western / Off),
 * and smooth touch/mouse glissando.
 */
class HarmoniumKeyboardView {
    constructor(svgElement, callbacks = {}) {
        this.svg = svgElement;
        this.onNoteDown = callbacks.onNoteDown || (() => {});
        this.onNoteUp = callbacks.onNoteUp || (() => {});

        this.WHITE_NOTES = [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77];
        this.BLACK_KEYS = [
            [56, 14], [58, 35], [61, 77], [63, 98],
            [66, 140], [68, 161], [70, 182], [73, 224], [75, 245]
        ];

        this.KEY_TO_NOTE = {
            's': 53, 'a': 54, '`': 55, '1': 56, 'q': 57, '2': 58, 'w': 59, 'e': 60,
            '4': 61, 'r': 62, '5': 63, 't': 64, 'y': 65, '7': 66, 'u': 67, '8': 68,
            'i': 69, '9': 70, 'o': 71, 'p': 72, '-': 73, '[': 74, '=': 75, ']': 76,
            '\\': 77, "'": 78, ';': 79
        };

        this.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Classical Indian Swaram mapping (relative to C4=60)
        this.DEFAULT_SWARAM = {
            55: 'P̣', 56: 'ḍ', 57: 'Ḍ', 58: 'ṇ', 59: 'Ṇ',
            60: 'S',  61: 'r', 62: 'R',  63: 'g', 64: 'G',
            65: 'M',  66: 'Ḿ', 67: 'P',  68: 'd', 69: 'D',
            70: 'n',  71: 'N', 72: 'Ṡ',  73: 'ṙ', 74: 'Ṙ',
            75: 'ġ', 76: 'Ġ', 77: 'Ṁ'
        };

        this.labelMode = 'sargam'; // 'sargam', 'western', 'none'
        this.keyElements = new Map(); // note -> <rect>
        this.labelElements = new Map(); // note -> { keyText, noteText }
        this.pointerNotes = new Map(); // pointerId -> note

        this.init();
    }

    init() {
        this.buildKeyboard();
        this.setupPointerEvents();
    }

    setLabelMode(mode) {
        this.labelMode = mode;
        this.updateLabels();
    }

    buildKeyboard() {
        const NS = 'http://www.w3.org/2000/svg';
        while (this.svg.firstChild) {
            this.svg.removeChild(this.svg.firstChild);
        }
        this.svg.setAttribute('viewBox', '-2 -2 298 104');

        const make = (tag, attrs, text) => {
            const el = document.createElementNS(NS, tag);
            for (const k in attrs) el.setAttribute(k, attrs[k]);
            if (text !== undefined) el.textContent = text;
            return el;
        };

        const W = 21;
        const BW = 14;

        // Invert key mapping to find shortcut for note
        const noteToKey = {};
        for (const k in this.KEY_TO_NOTE) {
            noteToKey[this.KEY_TO_NOTE[k]] = k;
        }

        const defs = make('defs', {});

        // Polished Ivory White Key Gradient
        const whiteGrad = make('linearGradient', { id: 'whiteKeyGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
        whiteGrad.appendChild(make('stop', { offset: '0%', 'stop-color': '#ffffff' }));
        whiteGrad.appendChild(make('stop', { offset: '85%', 'stop-color': '#fcfbf8' }));
        whiteGrad.appendChild(make('stop', { offset: '100%', 'stop-color': '#eee7dc' }));
        defs.appendChild(whiteGrad);

        // Polished Ebony Black Key Gradient
        const blackGrad = make('linearGradient', { id: 'blackKeyGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
        blackGrad.appendChild(make('stop', { offset: '0%', 'stop-color': '#30343c' }));
        blackGrad.appendChild(make('stop', { offset: '12%', 'stop-color': '#21242b' }));
        blackGrad.appendChild(make('stop', { offset: '90%', 'stop-color': '#131518' }));
        blackGrad.appendChild(make('stop', { offset: '100%', 'stop-color': '#090a0c' }));
        defs.appendChild(blackGrad);

        this.svg.appendChild(defs);

        const whiteLayer = make('g', { id: 'white-layer' });
        const blackLayer = make('g', { id: 'black-layer' });
        const labelsLayer = make('g', { id: 'labels-layer' });

        // 1. Build White Keys
        this.WHITE_NOTES.forEach((note, i) => {
            const x = i * W;
            const keyGroup = make('g', { 'class': 'key-group' });

            const rect = make('rect', {
                x: x,
                y: 0,
                width: W,
                height: 100,
                'class': 'key white',
                'data-note': note,
                rx: 2,
                ry: 2
            });
            keyGroup.appendChild(rect);

            // Subtle octave separator between B and C (notes 59 and 71)
            if (note % 12 === 11) {
                const sep = make('line', {
                    x1: x + W, y1: 0, x2: x + W, y2: 100,
                    stroke: '#94a3b8', 'stroke-width': 1.2, opacity: 0.65
                });
                keyGroup.appendChild(sep);
            }

            whiteLayer.appendChild(keyGroup);
            this.keyElements.set(note, rect);

            const cx = x + W / 2;

            // Computer keyboard key shortcut
            const keyText = make('text', {
                x: cx,
                y: 64,
                'text-anchor': 'middle',
                'class': 'key-shortcut-text',
                'font-family': 'Courier New, monospace',
                'font-size': 11,
                fill: '#64748b'
            }, noteToKey[note] || '');

            // Note pitch or Swaram
            const isMiddleOctave = note >= 60 && note <= 71;
            const noteText = make('text', {
                x: cx,
                y: 88,
                'text-anchor': 'middle',
                'class': 'key-note-text',
                'font-family': 'sans-serif',
                'font-size': 12,
                'font-weight': isMiddleOctave ? 'bold' : '600',
                fill: isMiddleOctave ? '#b45309' : '#334155'
            }, this.DEFAULT_SWARAM[note] || this.NOTE_NAMES[note % 12]);

            labelsLayer.appendChild(keyText);
            labelsLayer.appendChild(noteText);

            this.labelElements.set(note, { keyText, noteText });
        });

        // 2. Build Black Keys
        this.BLACK_KEYS.forEach(([note, x]) => {
            const keyGroup = make('g', { 'class': 'key-group' });

            const rect = make('rect', {
                x: x,
                y: 0,
                width: BW,
                height: 52,
                'class': 'key black',
                'data-note': note,
                rx: 1.5,
                ry: 1.5
            });
            keyGroup.appendChild(rect);

            blackLayer.appendChild(keyGroup);
            this.keyElements.set(note, rect);

            const cx = x + BW / 2;

            // Shortcut label
            const keyText = make('text', {
                x: cx,
                y: 22,
                'text-anchor': 'middle',
                'class': 'key-shortcut-text black-key-shortcut',
                'font-family': 'Courier New, monospace',
                'font-size': 11,
                fill: '#94a3b8'
            }, noteToKey[note] || '');

            // Note label
            const noteText = make('text', {
                x: cx,
                y: 40,
                'text-anchor': 'middle',
                'class': 'key-note-text black-note-text',
                'font-family': 'sans-serif',
                'font-size': 10,
                'font-weight': '600',
                fill: '#f8fafc'
            }, this.DEFAULT_SWARAM[note] || this.NOTE_NAMES[note % 12]);

            labelsLayer.appendChild(keyText);
            labelsLayer.appendChild(noteText);

            this.labelElements.set(note, { keyText, noteText });
        });

        this.svg.appendChild(whiteLayer);
        this.svg.appendChild(blackLayer);
        this.svg.appendChild(labelsLayer);

        this.updateLabels();
    }

    updateLabels() {
        const isHidden = (this.labelMode === 'none');

        this.labelElements.forEach((labels, note) => {
            if (isHidden) {
                if (labels.noteText) labels.noteText.style.display = 'none';
                if (labels.keyText) labels.keyText.style.display = 'none';
                return;
            }

            if (labels.keyText) labels.keyText.style.display = 'block';
            if (labels.noteText) {
                labels.noteText.style.display = 'block';
                if (this.labelMode === 'sargam') {
                    labels.noteText.textContent = this.DEFAULT_SWARAM[note] || this.NOTE_NAMES[note % 12];
                } else {
                    labels.noteText.textContent = this.NOTE_NAMES[note % 12];
                }
            }
        });
    }

    setKeyActive(note, isActive) {
        const el = this.keyElements.get(note);
        if (el) {
            el.classList.toggle('active', isActive);
        }
    }

    getNoteFromPoint(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        if (el && el.dataset && el.dataset.note !== undefined) {
            return Number(el.dataset.note);
        }
        return null;
    }

    setupPointerEvents() {
        this.svg.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();

            try {
                this.svg.setPointerCapture(e.pointerId);
            } catch (err) {}

            const note = this.getNoteFromPoint(e.clientX, e.clientY);
            this.pointerNotes.set(e.pointerId, note);
            if (note !== null) {
                this.onNoteDown(note);
            }
        });

        this.svg.addEventListener('pointermove', (e) => {
            if (!this.pointerNotes.has(e.pointerId)) return;
            const prevNote = this.pointerNotes.get(e.pointerId);
            const currentNote = this.getNoteFromPoint(e.clientX, e.clientY);

            if (currentNote === prevNote) return;

            if (prevNote !== null) {
                this.onNoteUp(prevNote);
            }
            if (currentNote !== null) {
                this.onNoteDown(currentNote);
            }
            this.pointerNotes.set(e.pointerId, currentNote);
        });

        const handleRelease = (e) => {
            if (!this.pointerNotes.has(e.pointerId)) return;
            const note = this.pointerNotes.get(e.pointerId);
            this.pointerNotes.delete(e.pointerId);
            if (note !== null) {
                this.onNoteUp(note);
            }
        };

        this.svg.addEventListener('pointerup', handleRelease);
        this.svg.addEventListener('pointercancel', handleRelease);
        this.svg.addEventListener('lostpointercapture', handleRelease);
    }
}

if (typeof window !== 'undefined') {
    window.HarmoniumKeyboardView = HarmoniumKeyboardView;
}
