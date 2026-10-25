# Chapter 12: Text, Titles, Captions, and Subtitles

**Draft v1, 25 October 2026.** Layers B and C are **[GENERAL]** and **[PROPOSED]**. Layer A is thin: secondary sources mention auto captions, including accuracy for Indonesian [SECONDARY: itera.ac.id blog], and a course lists subtitles among its topics [SECONDARY: Udemy description]. Text controls, caption workflow, language list, word-level timing, and whether recognition runs locally are all **[UNKNOWN]** pending CapCut help pages (Chapters 3, 18).

---

## 12.1 Three separate concepts

| Concept | What it is | Example data |
|---|---|---|
| Content | The words | "Hello world" |
| Timing | When they appear | 00:00:02.000 to 00:00:04.500 |
| Style and animation | How they look and move | Font, size, color, stroke, entrance animation |

Keep them in separate fields. A subtitle file (SRT) stores content and timing only. Style belongs to the editor project or to richer formats.

## 12.2 Static text and titles

A text item on the timeline is a clip-like object: it has a start, duration, track, transform, opacity, effects, and keyframes, but its "source" is generated, not decoded from a file.

```text
TextItem { id, track_id, start, duration, content (rich runs),
           style, transform, animation_in, animation_out, effects[] }
```

Rich text: content is a list of runs, each with its own style (bold, color), so partial styling works.

## 12.3 Typography controls

Font family, size, weight/style, color, opacity, alignment, line spacing, letter spacing, stroke (outline), shadow, background box (padding, radius, color), and sometimes curved/warped text. Each is a style property; size and spacing should be resolution independent (relative to canvas height) so exports at other resolutions look the same.

## 12.4 Text layout

Layout steps: shape text (apply font, kerning, ligatures, complex scripts), break lines (wrap at box width), align, measure, then rasterize or tessellate.

Issues:

- **Complex scripts** (Arabic, Indic, Thai) and **bidirectional text** need a shaping engine; naive per-character layout is wrong.
- **Font fallback:** if a font lacks a glyph (emoji, CJK), a fallback font must supply it. Define the fallback order.
- **Line wrapping** differs by language (no spaces in some scripts).
- **Missing fonts:** a project opened on another machine may lack its fonts. Store the font name (and ideally family metadata), warn on substitution, and either substitute consistently or offer to embed where licensing allows. Font licensing may forbid embedding.
- **Rendering:** text should be rendered at the output resolution (vector to pixels at export), not scaled from a low-res raster, to stay sharp.

## 12.5 Text animation

Animation presets (fade, slide, typewriter, per-word or per-character reveal) are parameter animations (Chapter 10) applied per text unit. Per-character animation needs the layout engine to expose glyph or word boxes with timing offsets.

## 12.6 Subtitle and caption data

```text
SubtitleSegment { id, start, end, text, speaker?, language, words?[ {text,start,end} ],
                  style_ref? }
SubtitleTrack   { language, segments[], default_style }
```

Rules: `start < end`; segments on one track normally do not overlap; maximum characters per line and lines per cue; minimum and maximum duration; reading-speed limits (characters per second). Editors typically warn rather than block.

Operations: split a cue at the playhead, merge cues, nudge timing, retime in bulk, find/replace, reflow lines.

**Formats**

| Format | Content | Timing | Style | Notes |
|---|---|---|---|---|
| SRT | Plain text (limited tags) | `HH:MM:SS,mmm --> HH:MM:SS,mmm` | None | Most common, simplest |
| WebVTT | Text | `HH:MM:SS.mmm` | Some CSS-like | Web use |
| ASS/SSA | Text | Centisecond | Rich styling | Anime/fansub scene, complex |

Specifications should be cited from their official sources before implementing (not yet fetched).

SRT timing is millisecond-based, project time is frame-based (Chapter 8): converting needs a rounding rule, and cue edges snap to frames for burned-in subtitles.

**Burned-in vs soft subtitles:** burned-in text is rendered into the video; soft subtitles are a separate stream in the container that players can toggle. Support depends on container (MP4 `mov_text`, MKV text streams).

## 12.7 Automatic captions: general architecture

```mermaid
flowchart LR
    A[Timeline audio range] --> B[Extract and mix to mono 16 kHz]
    B --> C[Voice activity detection]
    C --> D[Speech recognition model]
    D --> E[Word timestamps / forced alignment]
    E --> F[Punctuation, casing, segmentation into cues]
    F --> G[Cues on subtitle track]
    G --> H[User correction]
```

Notes:

- **Input choice:** use the clip's audio after muting/gain? Usually the original clip audio, mapped back to timeline time through clip trims and speed (Chapter 8).
- **Language:** user selects or auto-detects; multilingual audio is harder.
- **Speaker identification (diarization):** separate model; labels speakers; error-prone with overlap.
- **Segmentation:** break on pauses and length limits, avoid splitting inside names/phrases when possible.
- **Correction workflow:** editing text should preserve timing; editing timing should preserve text; word-level timing makes retiming after text edits easier.
- **Re-run behavior:** regenerating captions must not silently destroy manual corrections; ask or keep versions.

**Where it runs:** a cloud service (needs network, account, privacy and cost implications) or a local model (CPU/GPU cost, model download size, offline use). CapCut's choice is **[UNKNOWN]** here. For the target machine (Ryzen 5 4600U, 16 GB RAM, integrated graphics), a local recognition model is feasible at some size and speed trade-off; actual throughput must be measured, not assumed (Chapter 20).

## 12.8 Import/export of subtitles

Import: parse tolerant of encoding (UTF-8 with/without BOM, legacy encodings), line endings, malformed timestamps; report errors per cue. Export: UTF-8, correct format-specific timing, escape or strip unsupported tags.

## 12.9 Test scenarios

| Scenario | Expected |
|---|---|
| Text with emoji and CJK mixed | Fallback fonts used, no missing-glyph boxes |
| Arabic/Hebrew line | Correct direction and shaping |
| Missing font on reopen | Warning and consistent substitution |
| Cue timing at 29.97 fps | Frame snap with documented rounding |
| Edit caption text after generation | Timing retained |
| Retrim clip after captioning | Captions follow policy (move with clip or stay; defined) |
| Import malformed SRT | Partial import with report |

## What a Future Coding Agent Must Understand

- Separate content, timing, and style; formats differ in what they preserve.
- Text is a generated clip type; layout (shaping, fallback, bidi, wrapping) is a real subsystem, not a drawing call.
- Caption generation is a pipeline; correction and re-run policy are product decisions.
- Local vs cloud recognition is an explicit architectural and privacy decision.
- **Verified:** only secondary mentions that CapCut has auto captions. All else general.
- **Related:** Chapters 8, 10, 13, 18, 20, 23.
