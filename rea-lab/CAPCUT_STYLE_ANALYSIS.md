# CapCut editing style → Clipwright Studio: analysis

> **Framing note (later):** this document measures CapCut's style against this app, which is
> useful, but its *ranking* of what to build was derived from two sample videos. Read
> [`CAPCUT_PRODUCT_ANALYSIS.md`](CAPCUT_PRODUCT_ANALYSIS.md) for the correct product framing —
> CapCut's vocabulary delivered through Clipwright's automation — and a priority order justified
> by that, not by the samples.


**Date:** 2026-10-25 · **Branch:** `arena/e01784c4-clip`
**Status:** analysis only. No code changed yet — this is the "analyse first" pass you asked for.

---

## 0. Read this first — what "analyse CapCut" could and could not mean here

You asked me to analyse CapCut *with REA*. I have to be straight with you about what I could
actually do, because it changes how much weight to put on section 2.

| Approach | Possible here? | Why |
|---|---|---|
| Run REA on a CapCut **binary** (desktop `.exe`/`.dmg`) | **No** | `www.capcut.com`, `play.google.com`, `apps.apple.com` all return `000` (blocked by this sandbox's egress allowlist). There is no CapCut artifact anywhere on this machine — `find / -iname "*capcut*"` returns nothing. REA can only analyse bytes it is given. |
| Run REA on a CapCut **APK** | **No** | Same block: no route to obtain it. REA also deliberately does not ship a JADX provider; it needs a caller-supplied JAR. |
| Run REA on **capcut.com** (the web editor) via Chromium | **No** | No Chrome-family browser installable here (Playwright's CDN is blocked), and the `--with-browser` path is unavailable. |
| Read CapCut's **published documentation** | **Yes** | Web search works (I have no direct HTTP to their site, but search returns their help pages and third-party guides). Everything in section 2 is from that, with citations. |

There is also a boundary point I'd rather say now than halfway through a build: pointing REA at
CapCut's compiled app to extract its effects, LUTs, templates and animation curves for
reproduction in your product is exactly the "clone someone else's product" case I flagged in
`rea-lab/HANDOFF.md`. What *is* legitimate — and what I'd argue is the real ask — is
**reproducing the editing vocabulary and the feel**, implemented independently against your own
engine. That is what section 3 plans. If you disagree with that line, tell me and we'll talk
about it, but I didn't want to quietly build on one side of it.

**So:** section 2 is a *behavioural* analysis of CapCut's editing style from public sources.
Section 3 is a **REA-verified** analysis of your app — actual static analysis of your source,
not my assumptions. Section 4 is the gap between them.

---

## 1. Why this is the right order

You can't "apply CapCut's style" as a blob. It decomposes into ~8 independent editing
capabilities, and your app already owns 2 of them, half-owns 3, and lacks 3 entirely. Mapping
that first is what stops us spending a month on a transitions library when the thing that
actually makes CapCut feel like CapCut is per-property keyframes + speed ramps.

---

## 2. What "CapCut's style" actually is

Eight pillars. The citation markers are source ids from the search that I can expand into a
bibliography if you want it in the repo.

### 2.1 Per-property keyframes with easing — the core mental model

Everything in CapCut is animatable the same way: select an element → pick a property → click
the **diamond** to key it at the playhead → move the playhead → change the value → it
interpolates. Position, scale, rotation, opacity, *and* "all settings" — masks, filters,
effects, text, audio volume [1](https://www.capcut.com/tools/keyframe-animation),
[11](https://play.google.com/store/apps/details?id=com.lemon.lvoverseas&hl=en_US).

The detail that matters most for feel: **keyframes interpolate linearly by default, and you add
an easing curve when you want it not to look stiff** [3](https://www.createthat.ai/blog/how-to-add-keyframes-in-capcut).
There is a graph editor for the property's motion, distinct from the speed curve.

### 2.2 Speed curves, not just speed values

Two separate tools that beginners conflate [15](https://capcutguide.com/how-to-use-keyframes-in-capcut/):

- **Constant speed** — one multiplier, 0.1×–100×.
- **Speed curve / velocity** — playback rate varies *within* a clip, either from named presets
  (**Bullet, Hero, Jump Cut, Montage, Flash In, Flash Out**) or a hand-drawn curve
  [2](https://www.capcut.com/resource/how-to-use-capcut),
  [10](https://www.hollyland.com/blog/topics/capcut-video-editing).

The named presets are the giveaway: they're an *editorial* vocabulary, not a numeric one.
"Hero" and "Bullet" are recognisable shot rhythms. This is the single most "CapCut" thing on the
list, and it's what produces the slow-mo ramp with a punch at the end.

### 2.3 Transitions and effects between/on clips

Library-driven, short, rhythmic: dissolve, glitch, zoom, whip, light leaks, VHS, 3D [16](https://apps.microsoft.com/detail/xp9kn75rrb9nhs?hl=en-US&gl=US).
Applied as timeline objects that overlap neighbours, plus the same treatment for *effects*
(Glicht/Blur/3D) and *filters* (colour looks, refreshed weekly) [16](https://apps.microsoft.com/detail/xp9kn75rrb9nhs?hl=en-US&gl=US).

### 2.4 Adjust + filters (colour)

A separate **Adjust** tab: brightness, contrast, saturation, temperature, tint, sharpness,
vignette, grain — plus film-style **filters/LUTs** with a before/after toggle
[2](https://www.capcut.com/resource/how-to-use-capcut),
[16](https://apps.microsoft.com/detail/xp9kn75rrb9nhs?hl=en-US&gl=US). Colour is keyframable
[3](https://www.createthat.ai/blog/how-to-add-keyframes-in-capcut).

### 2.5 Layer compositing: masks, blend modes, chroma key

- **Masks**: linear, circle, rectangle, star/heart, and a pen tool for freehand [4](https://videowizardtools.com/best-features-of-capcut/).
- Mask properties animate independently of the clip: position and scale on all shapes, rotation
  on linear, **feather** on all; shape itself and invert are static
  [6](https://videowizardtools.com/capcut-mask-keyframes-guide/). That "what animates vs what
  doesn't" table is a good spec for our data model.
- **Blend modes** between layers [2](https://www.capcut.com/resource/how-to-use-capcut).
- **Chroma key** and AI **background removal** [16](https://apps.microsoft.com/detail/xp9kn75rrb9nhs?hl=en-US&gl=US).

### 2.6 Text & caption templates: one click, applied to all

Captions are styled *by template*, not by hand: `Captions → Templates` gives karaoke highlight,
pop-by-word, bounce, typewriter, TikTok classic, then **Apply to All** pushes the style across
every caption clip [2](https://pixflow.net/blog/ai-automatic-captions-subtitles/),
[7](https://caption-x.com/blog/how-to-add-captions-capcut). Separate **in / emphasis / out**
animation slots [3](https://sheetly.org/cheatsheets/capcut). Word-level state is a first-class
concept: active word styled differently from upcoming words
[18](https://www.descript.com/blog/article/capcut-captions-arent-free-anymore-heres-a-better-option).

### 2.7 The "auto" layer

Auto captions, **auto reframe** (subject-aware crop to 9:16/1:1/16:9), **auto cut** (cuts on
music beats, speech pauses, or a text prompt), stabilisation, optical-flow slow motion,
motion tracking, freeze frame, background removal
[9](https://www.capcut.com/resource/capcut-autocut),
[15](https://www.capcut.com/resource/auto-reframe-premiere-pro),
[16](https://apps.microsoft.com/detail/xp9kn75rrb9nhs?hl=en-US&gl=US).

### 2.8 Templates as a product surface

Projects themselves are templated and re-skinned with the user's footage; effects and filters
are refreshed weekly so the app always feels current
[16](https://apps.microsoft.com/detail/xp9kn75rrb9nhs?hl=en-US&gl=US). This is as much a
*retention* mechanism as an editing feature.

### 2.9 The UX shape (this is half the "style")

| CapCut convention | Why it works |
|---|---|
| Right-hand **inspector** with tabs: Basic / Transform / Animation / Speed / Mask / Adjust / Effects | One panel, discoverable, no modal overload |
| **Diamond icon beside every animatable property** | Teaches keyframing by existing, not by tutorial |
| **Graph editor** per property + separate speed curve graph | Motion and time are visually distinct concepts |
| **Apply to All** for caption style | Kills the per-caption busywork |
| Presets named after *editorial intent* (Hero, Bullet, Jump Cut) | Users pick a feeling, not a number |
| Before/after toggle on Adjust | Instantly legible payoff |

---

## 3. Your app, measured — REA-verified

Command actually run (REA 6.8.0, focused on the editing surface so the evidence is readable):

```bash
rea analyze . --source-paths-json /tmp/ed-sources.json --format json   # 20 files, 29 s
```

Result: 20 JS/TS files parsed, **0 parse failures**, 71,146 AST nodes, 892 findings, 33,271
semantic nodes, 36,526 relations. Evidence: `rea-lab/artifacts/editor-analysis-summary.json`.
The capability claims below were then confirmed by reading the files REA pointed at, and by
grepping for the ffmpeg filters the renderer actually emits — because "the model has a field"
and "the renderer honours it" are different claims.

### 3.1 The three layers you already have

**A. Auto-clipping spine (your differentiator, CapCut has no equivalent)**

- `ClipCandidate` scoring → approved clips, per-candidate scores and reasons
- Silence/pause detection with **editable** cut boundaries that stay restorable
  (`silenceCuts[].detectedStart/detectedEnd/status`)
- Whisper transcription with word timings, speaker identification
- Transcript-driven caption editing: per-cue **split / merge / timing offset / hide / duplicate**
- Generated metadata: title, description, hashtags, CTA

**B. Timeline (multi-track)**

`TimelineTrack { type: video|audio|image, muted, hidden, locked }`,
`TimelineItem { startTime, sourceIn/Out, volume, muted, fadeIn/Out, speed, loop, x, y, scale, rotation, opacity }`.
Snapping, immutable command boundary, undo/redo with coalescing
(`src/shared/editor/timeline-commands.ts`).

**C. Renderer (FFmpeg filter graph, `src/main/services/rendering/plan.ts`, 495 lines)**

Filters actually emitted: `zoompan`, `crop`, `scale`, `overlay`, `subtitles` (ASS), `atempo`,
`afade`, `volume`, `afftdn`, `highpass`, `loudnorm`, `colorchannelmixer`, `fps`, `reverse`, `noise`.

### 3.2 What's genuinely strong

| Capability | Detail |
|---|---|
| **Virtual camera** | `CameraKeyframe { x, y, scale, rotation, easing }` with `cut/linear/ease-in/ease-out/ease-in-out/hold` — this is real keyframed motion, rendered through `zoompan` |
| **Object tracking → camera** | `trackingKeyframes[]` from tracking, editable, source-time |
| **Text layers** | Full transform + 5 in / 2 out animations + keyframe tracks, resolved by a clean pure interpolator (`textLayerStateAt` / `textLayerAppearanceAt`) |
| **Caption presets** | **50** data-driven styles across 10 categories, word animations `none/pop/bounce/typewriter/highlight`, emphasis, safe areas, per-cue overrides |
| **Audio restoration** | Non-destructive `off/light/standard/strong` presets → `afftdn` + `highpass` at render |
| **Determinism** | Every edit is a value; render plan is a pure function of the clip document |

That caption system is already **at or above** CapCut's template breadth in *count*. The gap is
in how it's applied (see 4.6), not in how many presets exist.

### 3.3 What is absent — verified by absence of the filter, not by absence of the word

`grep` over `src/main`, `src/shared`, `src/renderer`:

| Capability | Evidence of absence |
|---|---|
| Transitions between clips | `xfade` **0 files**, `acrossfade` **0 files**. Renderer composites with `overlay` across inputs but never blends neighbours in time. |
| Blend modes | `blend` 0 files — no `blend`/`maskedmerge` filter |
| Masks | `mask` appears in 2 files, both unrelated UI/CSS usage; no mask geometry model |
| Colour grading | `lut3d` 0, `curves` 0, `eq=` 0, `vibrance` 0, `vignette` 0, `unsharp` 0 |
| Chroma key / background removal | `chromakey` 0, `colorkey` 0 |
| Speed curves | `curve` 0 files; speed is a single numeric multiplier → `atempoChain()` |
| Optical flow / frame interpolation | `minterpolate` 0, `opticalflow` 0 |
| Beat detection | `beat` 0 files |
| Stabilisation, freeze frame, stickers, TTS | `stabiliz` 0, `freeze` 0, `sticker` 0, `text-to-speech` 0 |
| Property keyframes on timeline items | `TimelineItem` has flat `x/y/scale/rotation/opacity` and **no keyframe array**; only `CameraKeyframe` and `TextLayerKeyframe` are animated |

**The most important line in this table** is the last one. You have a *beautiful* interpolator
(`textLayerStateAt`) and a real easing enum — but they only serve the virtual camera and text
layers. Everything else on the timeline is static. That single fact is the largest part of the
"feels like a utility, not like CapCut" gap.

---

## 4. Gap matrix — CapCut pillar → your app → what to build

Feasibility is judged against your existing FFmpeg plan builder, not hand-waved.

| # | CapCut pillar | Your status | Gap | Effort | Risk |
|---|---|---|---|---|---|
| **4.1** | **Keyframe anything, with easing graphs** | **Partial** — camera + text only | Generalise to `propertyTracks` on `TimelineItem` (x, y, scale, rotation, opacity, volume) and clip-level (crop/zoom, colour strength). Reuse the existing easing enum + interpolator. | **M** | Low — pure data + expression generation. Highest value-per-line in the whole list. |
| **4.2** | **Speed curves** | **Absent** — uniform `atempo` | Model a curve as ordered segments `{t0,t1,rate}`; render by splitting the item into segment pieces (`atempo` per piece, `setpts` for output) + `atempoChain` for rates <0.5. Ship 6 editorial presets mirroring the intent (Hero/Bullet/Jump/Montage/Flash in/out) with your own names and curves. | **L** | Medium — duration mapping vs. existing `time-map.ts`; audio pitch handling. Needs care with captions/camera whose times are source-time. |
| **4.3** | **Transitions** | **Absent** | Two-step: (a) per-track neighbour overlap model in `ClipTimeline`; (b) render with `xfade`/`acrossfade` chained by offset instead of the current independent-input overlay. Start with 4 parametric transitions (cross-dissolve, dip-to-white, whip-pan, zoom-blur), not a library. | **L** | **High** — this is the one real architectural change. It rewrites how the render plan composes tracks, and every existing render path must keep working. |
| **4.4** | **Adjust + filters (colour)** | **Absent** | Add an `adjust` object (brightness/contrast/saturation/temperature/tint/sharpness/vignette/grain) → chain `eq`+`colorbalance`+`unsharp`+`vignette`+`noise`. LUT support via `lut3d` **only if** your ffmpeg build has it — must be feature-detected at runtime, since `@ffmpeg-installer/ffmpeg` builds vary. | **M** | Low-medium. Feature detection is mandatory; fail soft, never break a render. |
| **4.5** | **Masks / blend / chroma key** | **Absent** | `chromakey` + `colorkey` is cheap and immediately useful (green-screen reaction clips). Blend modes via `blend`. Masks need a geometry model + `geq`/mask file generation — and per §2.5 the *animatable subset* is position/scale/rotation(linear)/feather only, which is a much smaller job than it sounds. | **M** (chroma) / **XL** (masks) | Chroma: low. Masks: do last, or not at all in v1. |
| **4.6** | **Caption templates + Apply-to-All** | **Strong but not productised** — 50 presets, 5 word animations, per-clip `captionStyleId` | Three cheap wins: (a) **Apply to all clips** in the project; (b) **saved/liked presets** as a first-class collection (you have a custom-preset path already, in-memory); (c) preview thumbnails that animate, so choosing a style is visual. Add 2–3 word animations (`wobble`, `zoom-pulse`) to close the animation vocabulary. | **S–M** | **Low — best value in the whole plan.** You are a UI decision away from parity here, not an engine decision. |
| **4.7** | **Auto reframe (subject-aware)** | **Half-built, unused** — `trackingKeyframes` exist and are editable but aren't driving an automatic crop | Drive crop keyframes from the tracking points with a smoothing pass (dead-band + easing) so 16:9 → 9:16 follows the subject. You already have `buildTrackedCropFilter`. This is *wiring*, not new capability. | **M** | Low-medium. Quality depends on tracking reliability; must degrade to centre-crop when tracking score is low. |
| **4.8** | **Beat-synced auto cut** | **Absent** (you have pause-based cutting, not beat-based) | Onset detection over the music track (FFmpeg `astats`/energy envelope, or a small onset pass) → snap existing clip boundaries to beats with a tolerance + "keep musical phrasing" constraint. | **L** | Medium — detection quality; make it *suggest* cuts, never silently rewrite a user's edit. |
| **4.9** | **Templates / one-click project** | **Absent** | After 4.1–4.6 exist, a template is just a serialised document whose media slots get filled. Genuinely cheap *once* keyframes and transitions are value data. | **M** | Low, but strictly **after** the others. |
| **4.10** | **Inspector UX (diamond keyframes, graph editor, before/after)** | **Absent** | Right-hand inspector with per-property diamonds; a compact easing picker first, full graph editor later. | **M** | Low technical risk, high perceived-quality payoff. |

### Where you should *not* copy CapCut

1. **Don't buy into their effects treadmill.** Weekly-refreshed effect libraries are a retention
   product, not an editing one. Your audience (auto-clipping long video into shorts) needs
   *consistency and speed*, not novelty.
2. **Don't ship their asset classes.** Music/SFX/effect libraries and template packs are
   licensed content. Recreate the mechanics; never the assets.
3. **Don't lead with transitions.** They're the most visible CapCut feature and the *worst*
   first investment for your architecture (§4.3 risk).
4. **Your spine is the moat.** CapCut cannot find your best 8 moments in a 2-hour podcast, cut
   the pauses, and write the metadata. Any editing feature that doesn't make that pipeline's
   output better is a distraction.

---

## 5. Recommended sequence (my opinion, for you to accept or reject)

**Tier 1 — "it suddenly feels like a real editor" (do these first)**

1. **4.1 Property keyframes everywhere** — generalise the interpolator you already wrote.
2. **4.6 Caption template productisation** — Apply-to-All, saved presets, animated previews, 2 more word animations.
3. **4.4 Adjust/colour panel** with before/after.

Rationale: all three are additive, all three reuse code you already have, none of them touch the
render graph's structure. Together they close most of the *perceived* gap.

**Tier 2 — the CapCut signature**

4. **4.2 Speed curves** with 6 editorial presets.
5. **4.7 Auto reframe** wired from existing tracking data.
6. **4.5 Chroma key** + blend modes.

**Tier 3 — the risky/expensive ones**

7. **4.3 Transitions** (architectural change to the render plan).
8. **4.8 Beat-synced cutting**.
9. **4.9 Templates**, **4.10 graph editor**, masks.

---

## 6. What I need from you before writing code

Answered as **Q1–Q3** in chat. Short version:

- **Which meaning of "CapCut's style"?** The *look* of the output (speed ramps, punches,
  kinetic captions), the *editor experience* (inspector, diamonds, graphs), or *one-click
  templates*? These lead to very different Tier 1s.
- **How do I get ground truth?** Ideally: a handful of CapCut projects/exports you consider
  "the look" — even screen recordings. That beats documentation, and it lets me measure timing
  (how long the ramp lasts, how many px the punch-in moves) instead of approximating.
- **Do I touch the render plan?** 4.1/4.4/4.6 need none of it. 4.3/4.2 rewrite parts of it.
  Tell me your appetite for destabilising rendering before you've shipped.

---

## 7. Evidence & reproducibility

| Artifact | What it is |
|---|---|
| `rea-lab/artifacts/editor-analysis-summary.json` | REA Evidence for the 20-file editor surface: 71,146 AST nodes, 892 findings, 33,271 semantic nodes, 0 parse failures |
| `rea-lab/artifacts/clipwright-app-analysis-summary.json` | REA Evidence for the whole app (130 files) from the install pass |
| Commands | In `rea-lab/REA_INSTALL.md` §"Cheat sheet" |

Reproduce the focused run:

```bash
source rea-lab/env.sh
cd /path/to/extracted/AIClipping
rea analyze . --source-paths-json /tmp/ed-sources.json --format json
```

Note on method: sections 3.3 and 4's "absent" verdicts are based on the ffmpeg filters the
renderer *emits* and the fields the data model *has*, cross-checked against REA's AST findings —
not on the absence of a word in a comment. If you believe something on that list already exists,
point me at the file and I'll correct the doc.
