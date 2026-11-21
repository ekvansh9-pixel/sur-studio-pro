/**
 * SUR STUDIO - Clean & Simple Digital Harmonium + Metronome
 * Preserves all core harmonium audio features, MIDI, QWERTY input, and custom sampler.
 * Features a streamlined single-page layout with a built-in precision metronome.
 */
(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    // Persistent storage helper
    const store = {
        get(key, fallback) {
            try {
                const v = localStorage.getItem('webharmonium.' + key);
                return v === null ? fallback : v;
            } catch (e) {
                return fallback;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem('webharmonium.' + key, String(value));
            } catch (e) {}
        }
    };

    const intSetting = (key, min, max, defaultVal) => {
        const n = parseInt(store.get(key, defaultVal), 10);
        return Number.isFinite(n) ? clamp(n, min, max) : defaultVal;
    };

    // Computer keyboard mapping (100% preserved)
    const KEY_TO_NOTE = {
        's': 53, 'a': 54, '`': 55, '1': 56, 'q': 57, '2': 58, 'w': 59, 'e': 60,
        '4': 61, 'r': 62, '5': 63, 't': 64, 'y': 65, '7': 66, 'u': 67, '8': 68,
        'i': 69, '9': 70, 'o': 71, 'p': 72, '-': 73, '[': 74, '=': 75, ']': 76,
        '\\': 77, "'": 78, ';': 79
    };

    const KEY_TO_SWARAM = {
        's': 'Ṃ', 'a': 'Ṃ', '`': 'P\u0323', '1': 'Ḍ', 'q': 'Ḍ', '2': 'Ṇ', 'w': 'Ṇ',
        'e': 'S', '4': 'R', 'r': 'R', '5': 'G', 't': 'G', 'y': 'M', '7': 'M',
        'u': 'P', '8': 'D', 'i': 'D', '9': 'N', 'o': 'N', 'p': 'Ṡ', '-': 'Ṙ',
        '[': 'Ṙ', '=': 'Ġ', ']': 'Ġ', '\\': 'Ṁ', "'": 'Ṁ', ';': 'Ṗ'
    };

    // ── Instantiations ────────────────────────────────────────────────────────
    const audioEngine = new HarmoniumAudioEngine();
    const metronomeEngine = new MetronomeEngine(audioEngine);

    let keyboardView = null;
    let midiManager = null;

    // Load stored settings into audio engine
    audioEngine.settings.volume = intSetting('volume', 1, 100, 30);
    audioEngine.settings.reverb = store.get('useReverb', 'false') === 'true';
    audioEngine.settings.octave = intSetting('octave', 0, audioEngine.MAX_OCTAVE, 3);
    audioEngine.settings.transpose = intSetting('transpose', -11, 11, 0);
    audioEngine.settings.stack = intSetting('stack', 0, audioEngine.MAX_OCTAVE - audioEngine.settings.octave, 0);
    audioEngine.settings.attack = intSetting('attack', 0, 200, audioEngine.DEFAULT_ATTACK_MS);
    audioEngine.settings.release = intSetting('release', 0, 1000, audioEngine.DEFAULT_RELEASE_MS);
    audioEngine.settings.eqLow = intSetting('eqLow', -12, 12, 0);
    audioEngine.settings.eqMid = intSetting('eqMid', -12, 12, 0);
    audioEngine.settings.eqHigh = intSetting('eqHigh', -12, 12, 0);
    audioEngine.settings.samplesText = store.get('samples', '');

    const heldKeys = new Map();
    let tapTimes = [];

    // ── Render & UI Sync ──────────────────────────────────────────────────────
    function renderUI() {
        $('volumeLevel').textContent = audioEngine.settings.volume + '%';
        $('myRange').value = audioEngine.settings.volume;
        $('useReverb').checked = audioEngine.settings.reverb;
        $('transpose').textContent = audioEngine.settings.transpose;
        $('rootNote').textContent = audioEngine.NOTE_NAMES[(audioEngine.settings.transpose + 12) % 12];
        $('octave').textContent = audioEngine.settings.octave;
        $('stack').textContent = audioEngine.settings.stack;

        // Tone & EQ
        document.querySelectorAll('[data-setting]').forEach(input => {
            const key = input.dataset.setting;
            const val = audioEngine.settings[key];
            input.value = val;
            const labelEl = $('val-' + key);
            if (labelEl) {
                labelEl.textContent = key.startsWith('eq') ? (val > 0 ? '+' : '') + val + ' dB' : val + ' ms';
            }
        });
    }

    // ── Metronome Integration ─────────────────────────────────────────────────
    function setupMetronome() {
        const toggleBtn = $('metroToggleBtn');
        const bpmSlider = $('bpmSlider');
        const bpmText = $('bpmText');
        const bpmDown = $('bpmDown');
        const bpmUp = $('bpmUp');
        const tapBtn = $('tapTempoBtn');
        const timeSigSelect = $('timeSigSelect');
        const volSlider = $('metroVolSlider');
        const volText = $('metroVolText');
        const metroLed = $('metroLed');

        function updateMetroButton(isPlaying) {
            toggleBtn.textContent = '';
            const icon = document.createElement('i');
            icon.className = isPlaying ? 'fa fa-stop' : 'fa fa-play';
            toggleBtn.appendChild(icon);
            toggleBtn.appendChild(document.createTextNode(isPlaying ? ' Stop' : ' Start'));
            toggleBtn.classList.toggle('active', isPlaying);
        }

        toggleBtn.addEventListener('click', () => {
            const isPlaying = metronomeEngine.toggle();
            updateMetroButton(isPlaying);
        });

        bpmSlider.addEventListener('input', () => {
            const bpm = Number(bpmSlider.value);
            metronomeEngine.setBpm(bpm);
            bpmText.textContent = bpm;
        });

        bpmDown.addEventListener('click', () => {
            const bpm = Math.max(30, metronomeEngine.bpm - 2);
            metronomeEngine.setBpm(bpm);
            bpmSlider.value = bpm;
            bpmText.textContent = bpm;
        });

        bpmUp.addEventListener('click', () => {
            const bpm = Math.min(240, metronomeEngine.bpm + 2);
            metronomeEngine.setBpm(bpm);
            bpmSlider.value = bpm;
            bpmText.textContent = bpm;
        });

        // Tap tempo
        tapBtn.addEventListener('click', () => {
            const now = performance.now();
            tapTimes.push(now);
            if (tapTimes.length > 4) tapTimes.shift();

            if (tapTimes.length >= 2) {
                let intervals = [];
                for (let i = 1; i < tapTimes.length; i++) {
                    intervals.push(tapTimes[i] - tapTimes[i - 1]);
                }
                const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const computed = Math.round(60000 / avg);
                if (computed >= 30 && computed <= 240) {
                    metronomeEngine.setBpm(computed);
                    bpmSlider.value = computed;
                    bpmText.textContent = computed;
                }
            }
        });

        timeSigSelect.addEventListener('change', () => {
            metronomeEngine.setTimeSignature(timeSigSelect.value);
        });

        volSlider.addEventListener('input', () => {
            const val = Number(volSlider.value) / 100;
            metronomeEngine.setVolume(val);
            volText.textContent = volSlider.value + '%';
        });

        // Synchronized Beat LED pulse
        metronomeEngine.onBeat = (beatIdx, totalBeats, isDownbeat) => {
            metroLed.classList.remove('tick', 'downbeat');
            void metroLed.offsetWidth; // Force repaint
            metroLed.classList.add(isDownbeat ? 'downbeat' : 'tick');
            setTimeout(() => {
                metroLed.classList.remove('tick', 'downbeat');
            }, 90);
        };
    }

    // ── Instrument Controls ───────────────────────────────────────────────────
    function wireControls() {
        // Master Volume
        $('myRange').addEventListener('input', e => {
            const val = audioEngine.setVolume(Number(e.target.value));
            store.set('volume', val);
            renderUI();
        });

        // Reverb Switch
        $('useReverb').addEventListener('change', e => {
            const enabled = audioEngine.setReverb(e.target.checked);
            store.set('useReverb', enabled);
            renderUI();
        });

        // Stepper buttons (Transpose, Octave, Additional Reeds)
        document.querySelectorAll('[data-step]').forEach(btn => {
            btn.addEventListener('click', () => {
                const stepType = btn.dataset.step;
                const delta = Number(btn.dataset.delta);

                if (stepType === 'transpose') {
                    const newTranspose = audioEngine.setTranspose(audioEngine.settings.transpose + delta);
                    store.set('transpose', newTranspose);
                } else if (stepType === 'octave') {
                    const newOctave = audioEngine.setOctave(audioEngine.settings.octave + delta);
                    store.set('octave', newOctave);
                    store.set('stack', audioEngine.settings.stack);
                } else if (stepType === 'stack') {
                    const newStack = audioEngine.setStack(audioEngine.settings.stack + delta);
                    store.set('stack', newStack);
                }
                renderUI();
            });
        });

        // Tone & Equalizer sliders
        document.querySelectorAll('[data-setting]').forEach(input => {
            input.addEventListener('input', () => {
                const key = input.dataset.setting;
                const value = Number(input.value);
                audioEngine.setTone(key, value);
                store.set(key, value);
                renderUI();
            });
        });

        // Reset Tone button
        $('toneReset').addEventListener('click', () => {
            audioEngine.resetTone();
            ['attack', 'release', 'eqLow', 'eqMid', 'eqHigh'].forEach(k => {
                store.set(k, audioEngine.settings[k]);
            });
            renderUI();
        });

        // Note Labels Mode
        const labelModeSwitch = $('labelModeSwitch');
        if (labelModeSwitch) {
            labelModeSwitch.querySelectorAll('.pill-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    labelModeSwitch.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    keyboardView.setLabelMode(btn.dataset.mode);
                });
            });
        }

        // Custom Sampler
        $('samplerUrls').value = audioEngine.settings.samplesText;

        $('samplerApply').addEventListener('click', async () => {
            const text = $('samplerUrls').value.trim();
            const btn = $('samplerApply');
            btn.disabled = true;
            $('samplerStatus').textContent = 'Loading samples…';

            try {
                if (!text) {
                    audioEngine.resetToDefaultSample();
                    $('samplerStatus').textContent = 'Using the built-in harmonium sample.';
                } else {
                    const res = await audioEngine.loadSamplesFromText(text);
                    store.set('samples', text);
                    $('samplerStatus').textContent = `Loaded ${res.count} sample(s), ${res.memoryMB} MB in memory.`;
                }
            } catch (err) {
                console.warn('Sampler Error:', err);
                $('samplerStatus').textContent = 'Could not load: ' + err.message;
            } finally {
                btn.disabled = false;
                renderUI();
            }
        });

        $('samplerReset').addEventListener('click', () => {
            $('samplerUrls').value = '';
            store.set('samples', '');
            audioEngine.resetToDefaultSample();
            $('samplerStatus').textContent = 'Using the built-in harmonium sample.';
            renderUI();
        });

        $('samplerFiles').addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files.length === 0) return;

            $('samplerStatus').textContent = 'Decoding audio files…';
            try {
                const res = await audioEngine.loadSamplesFromFiles(files);
                $('samplerStatus').textContent = `Loaded ${res.count} sample(s), ${res.memoryMB} MB (session only).`;
            } catch (err) {
                console.warn('File Load Error:', err);
                $('samplerStatus').textContent = 'Could not load files: ' + err.message;
            }
            renderUI();
        });

        // Fullscreen
        $('fullscreenBtn').addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                document.exitFullscreen().catch(() => {});
            }
        });

        // MIDI Refresh
        $('midiRefresh').addEventListener('click', () => {
            const icon = $('midiRefresh').querySelector('i');
            if (icon) icon.classList.add('fa-spin');
            if (midiManager) {
                midiManager.refreshDevices().finally(() => {
                    setTimeout(() => {
                        if (icon) icon.classList.remove('fa-spin');
                    }, 500);
                });
            }
        });

        $('midiInputDevices').addEventListener('change', e => {
            if (midiManager) {
                midiManager.setSelectedDevice(e.target.value);
            }
            e.target.blur();
        });
    }

    // ── Computer Keyboard Handler (100% Preserved) ───────────────────────────
    const isTextField = el => !!el && (el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' && !/^(range|checkbox|button|file)$/.test(el.type)));

    const normKey = key => (key.length === 1 ? key.toLowerCase() : key);

    function setupComputerKeyboard() {
        window.addEventListener('keydown', e => {
            if (!audioEngine.isLoaded || isTextField(e.target) || e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }

            const note = KEY_TO_NOTE[normKey(e.key)];
            if (note === undefined) return;

            e.preventDefault();
            if (e.repeat || heldKeys.has(e.code)) return;

            heldKeys.set(e.code, note);
            audioEngine.noteOn(note);
        });

        window.addEventListener('keyup', e => {
            if (heldKeys.has(e.code)) {
                const note = heldKeys.get(e.code);
                heldKeys.delete(e.code);
                audioEngine.noteOff(note);
            }
        });

        window.addEventListener('blur', () => {
            audioEngine.allNotesOff();
            heldKeys.clear();
            renderUI();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                audioEngine.allNotesOff();
                heldKeys.clear();
                renderUI();
            }
        });
    }

    // ── Start-Up ──────────────────────────────────────────────────────────────
    async function startApplication() {
        // 1. Initialize SVG Keyboard View
        const svgEl = $('keyboard');
        keyboardView = new HarmoniumKeyboardView(svgEl, {
            onNoteDown: (note) => {
                audioEngine.noteOn(note);
                renderUI();
            },
            onNoteUp: (note) => {
                audioEngine.noteOff(note);
                renderUI();
            }
        });

        audioEngine.onActiveNotesChange = (note, isActive) => {
            keyboardView.setKeyActive(note, isActive);
            renderUI();
        };

        // 2. Initialize MIDI Manager
        midiManager = new MidiManager({
            onNoteOn: (note, vel) => {
                audioEngine.noteOn(note);
                renderUI();
            },
            onNoteOff: (note) => {
                audioEngine.noteOff(note);
                renderUI();
            },
            onVolumeChange: (vol) => {
                audioEngine.setVolume(vol);
                store.set('volume', vol);
                renderUI();
            },
            onAllNotesOff: () => {
                audioEngine.allNotesOff();
                renderUI();
            },
            onStatusUpdate: (msg, statusType) => {
                const el = $('midiStatus');
                if (el) {
                    if (statusType === 'success') {
                        el.textContent = 'Active';
                        el.style.color = '#10b981';
                    } else if (statusType === 'error') {
                        el.textContent = 'Refused';
                        el.style.color = '#ef4444';
                    } else if (statusType === 'warning') {
                        el.textContent = 'Unsupported';
                        el.style.color = '#f59e0b';
                    } else {
                        el.textContent = 'Ready';
                        el.style.color = '';
                    }
                    el.title = msg;
                }
                const badge = $('midiBadge');
                if (badge) {
                    badge.classList.toggle('active', statusType === 'success');
                    badge.title = msg;
                }
            },
            onActivityUpdate: (activity) => {
                const el = $('midiActivity');
                if (el) el.textContent = activity;
            },
            onDeviceListUpdate: (devices, selectedId) => {
                const select = $('midiInputDevices');
                if (!select) return;
                const prev = select.value;
                select.length = 0;
                devices.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = d.name;
                    select.appendChild(opt);
                });
                select.value = devices.some(d => d.id === prev) ? prev : (selectedId || 'all');
            }
        });

        // 3. Setup Start Button
        const loadBtn = $('loadBtn');
        const loadMsg = $('loadMsg');

        loadBtn.addEventListener('click', async () => {
            loadBtn.disabled = true;
            loadMsg.textContent = 'Initializing harmonium audio…';

            try {
                await audioEngine.init();
            } catch (err) {
                console.error('Audio init error:', err);
                loadMsg.textContent = 'Could not start audio (' + err.message + '). Please try again.';
                loadBtn.disabled = false;
                return;
            }

            $('loadScreen').hidden = true;
            $('mainScreen').hidden = false;

            midiManager.init();

            if (audioEngine.settings.samplesText.trim()) {
                audioEngine.loadSamplesFromText(audioEngine.settings.samplesText).then(res => {
                    $('samplerStatus').textContent = `Loaded ${res.count} sample(s), ${res.memoryMB} MB in memory.`;
                }).catch(e => {
                    console.warn('Sample load warning:', e);
                    $('samplerStatus').textContent = 'Saved samples could not be loaded (' + e.message + '). Using built-in sample.';
                    audioEngine.resetToDefaultSample();
                });
            }

            renderUI();
        });

        // 4. Wire controls & Metronome
        setupMetronome();
        wireControls();
        setupComputerKeyboard();
        renderUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApplication);
    } else {
        startApplication();
    }
})();
