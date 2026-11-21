# SUR STUDIO PRO — Digital Harmonium & Precision Metronome

**SUR STUDIO PRO** is a professional, high-fidelity browser-based digital harmonium designed for classical Indian music practice, vocal accompaniment, and keyboard exploration. Powered by the Web Audio API, it delivers authentic free-reed acoustic resonance, responsive polyphony, tone equalization, precision rhythm generation, and hardware MIDI support with zero latency or timer drift.

---

## Key Features

- **Realistic Harmonium Keyboard:** 23-key responsive interface (C3 to A#4) with realistic ivory and ebony keys, touch glissando, and visual key-press illumination.
- **Dual Sound Engine:** Authentic multi-reed acoustic sample playback paired with an automatic procedural additive synthesis fallback for offline or restricted environments.
- **Concert Pitch & Transposition:** Semitone pitch transposition (-11 to +11) with live root note tracking (C through B) and multi-octave register shifting.
- **Reed Layering & Chorusing:** Dynamic additional reed layers (0 to 4) with micro-detuning for rich, traditional acoustic harmonium beating.
- **Full Tone Shaping:** Attack envelope (0–200 ms), release envelope (0–1000 ms), 3-band equalizer (Bass, Mid, Treble), and acoustic convolution reverb.
- **Studio Limiter:** Integrated dynamics compressor preventing digital clipping at maximum volume.
- **Precision Metronome:** Lookahead Web Audio scheduler running on `audioContext.currentTime` with 30–240 BPM tempo, Tap Tempo detection, 4/4, 3/4, and 6/8 time signatures, and downbeat-accented visual pulse.
- **Hardware Web MIDI:** Plug-and-play support for external MIDI controllers, channel omni-monitoring, and CC7 volume mapping.
- **Custom Audio Sampler:** Assign custom external audio URLs or local sound files to musical pitches with loop point configurations.
- **Flexible Key Notation:** Instant toggling between Bhatkhande Sargam notation (Mandra to Taar Saptak), Western note names, or unlabeled keys.

---

## Computer Keyboard Controls

Play notes directly from your computer keyboard without external hardware:

### Natural Notes (White Keys)
| Key | Note | Sargam (Root C) | Register |
| :---: | :---: | :---: | :---: |
| `` ` `` | G#2 / Ab2 | **P̣** | Mandra Saptak |
| `q` | A2 | **Ḍ** | Mandra Saptak |
| `w` | B2 | **Ṇ** | Mandra Saptak |
| `e` | C3 | **S** | Madhya Saptak (Sa) |
| `r` | D3 | **R** | Madhya Saptak (Re) |
| `t` | E3 | **G** | Madhya Saptak (Ga) |
| `y` | F3 | **M** | Madhya Saptak (Ma) |
| `u` | G3 | **P** | Madhya Saptak (Pa) |
| `i` | A3 | **D** | Madhya Saptak (Dha) |
| `o` | B3 | **N** | Madhya Saptak (Ni) |
| `p` | C4 | **Ṡ** | Taar Saptak (Sa) |
| `[` | D4 | **Ṙ** | Taar Saptak (Re) |
| `]` | E4 | **Ġ** | Taar Saptak (Ga) |
| `\` | F4 | **Ṁ** | Taar Saptak (Ma) |

### Flat / Sharp Notes (Black Keys)
| Key | Note | Sargam (Root C) | Note Quality |
| :---: | :---: | :---: | :---: |
| `1` | A#2 / Bb2 | **ḍ** | Komal Dha (Mandra) |
| `2` | B#2 / C3 | **ṇ** | Komal Ni (Mandra) |
| `4` | C#3 / Db3 | **r** | Komal Re |
| `5` | D#3 / Eb3 | **g** | Komal Ga |
| `7` | F#3 / Gb3 | **Ḿ** | Tivra Ma |
| `8` | G#3 / Ab3 | **d** | Komal Dha |
| `9` | A#3 / Bb3 | **n** | Komal Ni |
| `-` | C#4 / Db4 | **ṙ** | Komal Re (Taar) |
| `=` | D#4 / Eb4 | **ġ** | Komal Ga (Taar) |

---

## Browser Compatibility

SUR STUDIO PRO is built with pure standards-based Web Audio and Web MIDI APIs:
- **Google Chrome / Chromium:** Full audio and Web MIDI support.
- **Microsoft Edge:** Full audio and Web MIDI support.
- **Mozilla Firefox:** Full audio support (Web MIDI requires browser flag enabled).
- **Apple Safari (macOS & iOS):** Full audio support with low-latency touch glissando.
- **Mobile & Tablet:** Fully responsive touch interface for Android and iOS.

---

## Deployment to GitHub Pages

1. Fork or push this repository to GitHub.
2. Navigate to **Settings > Pages** in your repository.
3. Under **Build and deployment > Source**, select **GitHub Actions**.
4. The included automated workflow (`.github/workflows/deploy.yml`) will build and publish the site with least-privilege permissions and pinned immutable actions.

---

## Security & Architecture

- **Content Security Policy (CSP):** Strict `script-src 'self'`, `object-src 'none'`, and restricted HTTPS connect boundaries.
- **Subresource Integrity (SRI):** External styles and fonts verified via cryptographic SHA-512 hashes.
- **No External Runtime Dependencies:** Zero npm vulnerabilities; runs completely self-contained in modern web browsers.
- **Safe DOM:** 100% free of `innerHTML` or `eval()` sinks.

---

## License

MIT License. Designed and built for musicians, students, and educators worldwide.
