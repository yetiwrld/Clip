# Chapter 13: Audio Editing and Processing

**Draft v1, 25 October 2026.** Layers B and C are **[GENERAL]** and **[PROPOSED]**. CapCut-specific audio features (noise reduction, voice effects, text-to-speech, beat sync) are mentioned only by secondary sources ([SECONDARY: itera.ac.id blog] names AI voice generation; [SECONDARY: Udemy course description] names voice changing) and are otherwise **[UNKNOWN]**. FFmpeg's libswresample is documented as handling audio resampling, format conversion and mixing (https://ffmpeg.org/doxygen/0.10/index.html, accessed 25 Oct 2026).

---

## 13.1 Three layers of "audio"

| Layer | What it is |
|---|---|
| Samples | The actual PCM numbers: the signal |
| Waveform display | A summary (min/max peaks per window) for the UI only |
| Control parameters | Gain, fades, pan, mute, effects settings: instructions applied at playback/export |

Editing changes parameters and ranges, not source samples. The waveform is a cache derived from samples (Chapter 7); changing gain redraws it by scaling, not by recomputing from the source.

## 13.2 Tracks, clips, linking

Audio clips mirror video clips: `source_in/out`, `timeline_start`, `speed`, `gain`, `fade_in/out`, `pan`. Video clips with audio are normally linked to an audio clip (Chapter 8). Splitting and trimming follow the same time-conversion rules, in sample-accurate or frame-accurate terms (decide: frame-snapped edits are simple; sample-accurate edits help tight dialogue cuts).

## 13.3 Gain, volume, decibels

- Linear gain `g`; decibels `dB = 20 * log10(g)`. 0 dB = unity; -6 dB is about half amplitude; +6 dB about double.
- Volume sliders should map to dB (or a perceptual curve), not linear gain, or most of the slider's range sounds equally loud.
- Total gain = clip gain x track gain x master gain x fade envelope.

## 13.4 Fades and crossfades

```text
fade_in(t) for t in [0, D]:   g = curve(t / D)
```

Curves: linear (can sound like a level dip at crossfades), equal-power (`sin`/`cos`, constant perceived loudness for unrelated sources), logarithmic. Crossfade between adjacent clips needs overlap and "handles" just as video transitions do (Chapter 11). To avoid clicks at cuts, apply a very short fade (a few ms) when a clip starts or ends mid-waveform.

## 13.5 Mixing

Per output buffer: for each active audio clip, read source samples (after time-mapping and resampling), apply gain/fade/pan, sum into a 32-bit float buffer, apply track and master gain, then limit or clip when converting to the output format.

```text
mix[n] = sum over clips( clip_samples[n] * gain_total(n) * pan_gain(channel) )
```

- **Headroom/clipping:** float mixing does not clip internally; conversion to integer does. Summing several loud sources can exceed 0 dBFS; provide a limiter or warning.
- **Mute and solo:** mute removes a track from the sum; solo mutes all others. Solo state is temporary interface state (Chapter 5).
- **Channels:** mono, stereo, 5.1. Define upmix/downmix rules (mono to stereo duplicate, stereo to mono average with -3 dB compensation).

## 13.6 Sample rate and resampling

Project audio rate: typically 48 kHz. Sources at 44.1 kHz (music) must be resampled; resampling needs a good filter (sinc-based) to avoid aliasing. Speed changes either resample (pitch changes) or time-stretch (pitch preserved, more complex and prone to artifacts). Clock drift between audio device and project time must be handled by the playback clock (Chapter 9).

## 13.7 Level and loudness measurement

| Measure | Meaning | Use |
|---|---|---|
| Sample peak | Largest absolute sample | Clipping detection |
| True peak | Peak after oversampling | Inter-sample clipping |
| RMS | Average power over a window | Rough level |
| Integrated loudness (LUFS) | Perceptual, gated, program-long loudness (ITU-R BS.1770 family) | Delivery targets |

Platform loudness targets vary; verify current platform documentation before fixing numbers. Loudness normalization = measure integrated loudness, apply a constant gain to reach the target, check true peak.

## 13.8 Audio effects

| Effect | Idea | Notes |
|---|---|---|
| EQ | Boost/cut frequency bands (biquad filters) | Cheap |
| Compressor | Reduces dynamic range above a threshold | Attack/release, ratio, makeup gain |
| Limiter | Hard ceiling | Last in chain |
| Noise reduction | Estimate noise spectrum, subtract or use a trained model | Artifacts if aggressive |
| Voice enhancement | EQ + compression + denoise + de-ess preset | Marketing term; define chain |
| Reverb/echo | Delay lines, convolution | Moderate cost |
| Pitch/voice change | Pitch shifting / formant shifting | Artifacts |

Effects are ordered chains with animatable parameters, like video effects (Chapter 11); real-time playback requires block processing with state carried between buffers.

## 13.9 Ducking and beat detection

**Automatic ducking:** detect speech in a "voice" track (energy or voice-activity detection), lower the music track by a set amount with attack/release smoothing, restore when speech ends. Implement as a sidechain: the control signal comes from one track and acts on another.

**Beat detection:** compute an onset-strength envelope (spectral flux), estimate tempo by autocorrelation, pick beat positions; used to snap cuts to beats or generate markers. Accuracy varies by genre; keep results editable.

## 13.10 AI audio features

Noise suppression, voice cleanup, text-to-speech, voice conversion, and stem separation typically use trained models. Whether CapCut runs them locally or remotely is **[UNKNOWN]**. For an original editor: local models trade download size and CPU use for privacy and offline use; remote services trade cost, latency, and privacy for easier quality. Text-to-speech output is audio that enters the timeline as a normal clip; keep its generation parameters in the project so it can be regenerated.

## 13.11 Waveform display

Compute peaks per fixed block of samples once, store them, and draw by selecting the peak resolution matching the current zoom (a mip-map of peaks). Apply clip gain visually. Show clipping regions in a warning color.

## 13.12 Audio device handling

Enumerate output devices, follow the system default, handle device removal/sample-rate change by reopening and keeping the logical position. Latency: small buffers react quickly but risk underruns on a busy CPU; adaptive sizing helps.

## 13.13 Test scenarios

| Scenario | Expected |
|---|---|
| Two loud clips overlap | No digital clipping artifacts after limiter; warning shown |
| 44.1 kHz clip in 48 kHz project | Correct pitch and duration |
| Cut mid-waveform | No audible click |
| Speed 1.5x with pitch preserve | Duration correct, pitch unchanged |
| Unplug headphones during play | Playback continues on new device, sync intact |
| Mute + solo combinations | Defined, consistent result |
| Export vs preview level | Same loudness |

## What a Future Coding Agent Must Understand

- Samples, waveform display, and control parameters are three different things.
- Mix in 32-bit float; convert and limit at the end; use dB for user-facing gain.
- Fades and crossfades need curves and handles; short fades prevent clicks.
- Audio is the playback master clock (Chapter 9); resampling and device changes need care.
- AI audio features are model-based; local vs remote is a deliberate decision.
- **Verified:** only FFmpeg's resampling/mixing library role. CapCut audio features unverified.
- **Related:** Chapters 6, 8, 9, 11, 15, 18, 20.
