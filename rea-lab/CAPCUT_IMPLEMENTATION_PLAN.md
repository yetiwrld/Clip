# CapCut-style editing in Clipwright Studio — implementation plan

> **Framing note (later):** the workstream mechanics below are still valid, but the *ordering*
> is superseded by [`CAPCUT_PRODUCT_ANALYSIS.md`](CAPCUT_PRODUCT_ANALYSIS.md) §6, which ranks by
> "does the automatic output look finished" rather than by what appeared in two sample exports.


**Status:** plan for approval. No production code written yet.
**Prereq reading:** [`CAPCUT_STYLE_ANALYSIS.md`](CAPCUT_STYLE_ANALYSIS.md) (what CapCut's style is, and what your
app has/doesn't).
**Scope agreed:** all three meanings (output look → editor UX → templates), and render-engine change
is in scope including transitions.
**Plan version:** 2 · 2026-10-25

> **Revised after real projects arrived.** Two actual CapCut projects (`1022`, `1013`) were
> supplied and analysed — see [`CAPCUT_REFERENCE_1022_1013.md`](CAPCUT_REFERENCE_1022_1013.md).
> They contain **zero** keyframes, **zero** colour grading, **zero** masks/effects and no speed
> curves, so the ranking below was made from documentation and is now out of date. The revised
> order is in §6 of the reference document: text outline → volume range → crossfades → still
> flicker → pacing grid. Read that first; this document is still correct on *how* to build each
> piece, just no longer correct on *what to build first*.

---

## 0. Answering your question: how to get me the CapCut reference material

Short answer: **don't upload the app. Upload its project files.** They're ~1,000× smaller and
~1,000× more informative.

### Best method — CapCut draft project folders (do this)

CapCut saves each project as a folder containing JSON that describes the timeline *exactly*:
keyframe times, interpolation/easing, effect IDs and parameter values, speed-curve points, text
styles, transition durations. That is precisely the data I'd otherwise be guessing at from
documentation.

```
CapCut Drafts/
└── my-short-01/                 # pick 2–3 you consider "the look"
    ├── draft_content.json       # ← the important one (timeline, effects, keyframes)
    ├── draft_meta_info.json     # ← media mapping, canvas/fps
    └── draft_agency_config.json # ← optional
```

How to find them:

- **Windows:** `C:\Users\<you>\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft\`
- **macOS:** `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/`
- **Mobile:** use CapCut's project *backup/export* to get a draft archive to your PC.

**Zip the project folders** (not the caches) and attach them in chat. Typical size: tens of KB to
a few MB. **Also attach the exported MP4 of each project** — that's my ground truth for "does our
render actually match". With both, I can measure the real thing: how long a ramp lasts, how far a
punch-in travels, which easing curve a pop uses.

**Do not include:** `Cache/`, `matting/`, any `*.mp4` media copies, or the model files — those are
the entire size of the folder and add nothing.

### Second best — a screen recording

A 2–3 minute recording of you building one of those shorts in CapCut. This is the only good way
to capture the *interaction* model: which panel you reach for, when you add a keyframe, how you
shape a speed curve. Cheap to make, high signal for the UX half.

### If you really want to send the app itself — read this first

| Issue | Detail |
|---|---|
| **Size** | Desktop installer ~500 MB–1 GB, APK ~200–400 MB. This repo's artifact cap is ~128 MB total, and a binary that size would wreck the repo. |
| **Analytical value** | Low. CapCut desktop is a native, stripped binary; APK analysis needs a JADX provider REA doesn't ship and I can't download here. Even with Ghidra installed, you'd get obfuscated internals, not an editing vocabulary. |
| **Better alternative** | If you want app-level detail, **the web editor** is the useful target: in your browser, open `capcut.com` → the editor, save the page complete (or export a HAR), and send that. Far smaller, and it contains the effect catalogue, easing definitions and preset names in readable JS. |
| **Boundary** | I'll read project files and reference video to learn *parameters and behaviour*, then reimplement independently. I won't extract and ship CapCut's effect assets, LUTs, music or template packs — those are their licensed content, and copying them into your commercial product is the one part of this that could actually hurt you. |

So: **draft project folders + exported MP4s + optionally a screen recording.** That's the whole
ask. Everything below proceeds regardless; the reference material makes the numbers exact instead
of approximate.

---

## 1. Repo layout & Step 0

The app source currently only exists as `AIClipping-code-for-AI.zip` in the repo root. Implementation
work needs it in the tree:

```
/
├── app/                 # ← extracted Clipwright Studio source (from AIClipping-code-for-AI.zip)
│   ├── src/main/services/rendering/plan.ts
│   └── ...
├── rea-lab/             # analysis + this plan (already committed)
└── docs/                # extracted app docs, if you want them kept
```

`Step 0` is **done** — see [`APP_ARCHITECTURE.md`](APP_ARCHITECTURE.md). `app/` is in the repo
(commit `8b56157`), and the whole loop works here: typecheck clean, **291/291 tests pass**, the
production build succeeds, and `server/preview.ts` serves the real backend over HTTP. Fixtures are
generated with `npm run fixtures`.

Note the one thing Step 0 changed: because the app runs here, every change below can be verified
by typecheck + tests + build + a live browser session before you ever run it on Windows.

---

## 2. Design invariants

Everything below obeys these six rules. They're non-negotiable because they're what keeps the
renderer trustworthy.

1. **Planning stays pure.** `buildRenderPlan` must remain a pure function of
   `(clip, project, settings, timeline, assets, transcript)` — no I/O beyond writing ASS/mask files
   it already writes.
2. **Preview/render parity.** Every geometry value used by the CSS preview must be produced by the
   same shared function the FFmpeg planner uses. Today's `timelineOverlayGeometry` is the model;
   extend it, never bypass it.
3. **Fingerprints must move.** `renderFingerprint` includes every input that affects output. A new
   field that changes pixels but not the fingerprint = stale renders served from cache. There will
   be a test for this.
4. **Unknown fields degrade, never break.** Old project documents must render. New optional
   fields default to today's behaviour.
5. **Feature-detect FFmpeg.** The bundled `@ffmpeg-installer/ffmpeg` build is not guaranteed to
   have `xfade`, `lut3d`, `geq`, `blend`, `chromakey`. Probe at startup, cache the result, and
   fail *soft* (warn + render without the effect) rather than failing the render.
6. **Additive first, structural second.** Ship the features that don't touch the render graph's
   shape before the one that rewrites it, so the app is always shippable.

---

## 3. The one abstraction that unlocks everything

Today you have keyframes twice, implemented twice: `CameraKeyframe` (with easing, in
`crop.ts`) and `TextLayerKeyframe` (linear, in `textLayers.ts`). Everything else — x, y, scale,
rotation, opacity, volume, grade strength — is a static scalar.

Unify to one primitive, then apply it everywhere:

```ts
// src/shared/editor/animation.ts  (new)
export type Easing = 'cut' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold'

export interface Keyframe<V = number> {
  time: number          // source time (seconds), same convention as CameraKeyframe
  value: V
  easing: Easing        // easing INTO this keyframe
}

/** A property is either constant (a number) or animated (ordered keyframes). */
export type Animated<V = number> = V | Keyframe<V>[]

/** Single source of truth for interpolation. Preview, ASS generation and FFmpeg
 *  expression generation all call this. */
export function animatedAt<V>(prop: Animated<V>, fallback: V, time: number): V
```

**Why a union and not `{ static, keys }`:** it keeps existing documents valid with *zero
migration*. A flat `x: 0.1` still means constant; `x: [{...}]` means animated. That matters more
than elegance here — you have users with saved projects.

### Data model change (additive, backward-compatible)

```ts
export interface TimelineItem {
  // ...existing fields unchanged...
  /** Optional animated overrides. Absent → the flat field above is used. */
  animated?: Partial<Record<AnimatableProp, Keyframe[]>>
  /** Optional colour/effect layer (see §6). */
  adjust?: Adjust
}
export type AnimatableProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume'
```

`timelineOverlayGeometry(item)` becomes `timelineOverlayGeometry(item, time)` — same clamping and
math, `animatedAt` substituted for the raw field. Because that function is already shared, the CSS
preview animates for free the moment the renderer does.

### Getting it into FFmpeg

This is where plans usually lie, so here are the honest mechanics per property:

| Property | FFmpeg approach | Cost | Notes |
|---|---|---|---|
| `x`, `y` | `overlay=x='<expr in t>'` | free | Overlay expressions already support `t`; you're already emitting them statically. |
| `opacity` | `geq` on the alpha channel, or `fade=alpha=1` for monotonic in/out tracks | **not free** at 1080p+ (`geq` is per-pixel) | Detect the common case (single fade-in and/or fade-out) and emit `fade=alpha`; fall back to `geq` only for genuine multi-key opacity, and emit a plan-level `limitations[]` note when the fallback is used. |
| `scale` | `scale=w='iw*(expr)':h='ih*(expr)':eval=frame` | medium | Re-scales every frame. Acceptable for overlays; do not use on the base track. |
| `rotation` | `rotate=...:(t)` | medium | Already used statically; make the angle an expression. |
| `volume` | `volume='expr(t)':eval=frame` | free | |
| camera / crop | existing `zoompan` path | free | Already expression-driven; just feed it `animatedAt`. |

**Easing in expressions:** evaluate easing into a cubic polynomial per segment and emit
`if(between(t,a,b), ...)` chains — FFmpeg's expression language supports `pow`, `lerp`, `if`,
`between`, `st`. Keep chains short (cap ~40 keyframes per property; zod-enforce it) because giant
expressions slow filter init.

**Acceptance for §3:** a 2-keyframe animation of each of the six properties renders identically to
the editor preview within 1 frame, verified by the parity test.

---

## 4. Workstreams

Ordered by dependency and by value-per-day. Each is independently shippable and independently
flaggable.

### WS1 — Keyframe everything + inspector diamonds  · **3–4 days** · risk low

*The single biggest feel change, and it reuses code you already wrote.*

- **New:** `src/shared/editor/animation.ts` (above). Extract the easing math currently buried in
  `buildCameraCropFilter` so camera and timeline share it.
- **Changed:** `src/shared/video/time-map.ts` (`timelineOverlayGeometry` takes `time`),
  `src/main/services/rendering/plan.ts` (expression emission per the table),
  `src/shared/schemas/index.ts` (`animated` on item patches, caps enforced),
  `src/renderer/features/editor/MultiTrackTimeline.tsx` + `EditorPage.tsx` (diamond buttons next
  to each numeric control, "add/remove keyframe at playhead", tiny easing picker).
- **Fingerprint:** include `animated` in `renderFingerprint`.
- **Tests:** interpolation unit tests (incl. `hold`/`cut` semantics), parity test for each property,
  golden filter-graph snapshots, fingerprint-moves test.
- **Ships when:** you can animate position/scale/rotation/opacity/volume on any clip and the export
  matches the preview.

### WS2 — Adjust / colour panel  · **2 days** · risk low

- `Adjust { brightness, contrast, saturation, temperature, tint, sharpen, vignette, grain }`,
  clamped to sane ranges, on `Clip` first (per-item later).
- Filter chain in `perSegmentVf`, inserted **after** crop/scale and **before** overlays/ASS:
  `eq` → `colorbalance` (temperature/tint) → `unsharp` (sharpen) → `vignette` → `noise` (grain).
- **No LUT asset shipping.** Procedural "looks" (e.g. warm, teal-orange, faded film) expressed as
  `colorbalance`+`eq` parameter sets. Optional user `.cube` support via `lut3d` **only** after a
  runtime probe; degrade with a visible warning if absent.
- UI: right-hand Adjust panel with a **before/after hold-to-compare** button (cheap, high payoff).
- Tests: chain-order golden test; feature-detection test; render smoke on a 3s clip.

### WS3 — Caption system productisation  · **2 days** · risk low

You have 50 presets and 5 word animations — more breadth than CapCut. You're missing the *product*
around them:

1. **Apply to all clips** — one IPC operation, one transaction, one fingerprint bump.
2. **Saved presets persist** — today `custom-${Date.now()}` lives in memory; move to a DB table
   `caption_presets` (id, name, base style, overrides, created_at) with CRUD.
3. **Animated previews in the picker** — reuse `CaptionPreview.tsx` and loop each style's
   in/out/word animation at 1×. No new render engine; pure CSS.
4. **Two new word animations** — `wobble`, `zoom-pulse`, emitted as ASS `\t` transforms; plus
   per-word "active vs upcoming" colour split (CapCut's karaoke model).
5. Category/Favourites filtering in the picker.

### WS4 — Speed curves  · **4–5 days** · risk medium

- **Model:** `SpeedCurve = Array<{ t: number; rate: number }>` — piecewise-linear rate over
  **source progress**, knots sorted, `rate ∈ [0.1, 10]`. Absent → constant `speed` (today).
- **The real work is `time-map.ts`.** Four functions assume constant speed:
  `timelineItemDuration`, `sourceTimeAtTimelineTime`, `mapTimelineRangeToSource`,
  `sourceDeltaForTimelineDelta`. With a curve, duration becomes `∫ 1/rate(s) ds` and the mapping
  becomes a piecewise-linear inversion. Implement once, in shared code, used by drag UX, preview,
  captions and render — **this is exactly where a naive implementation causes drift.**
- **Render:** split each item at curve knots → per-piece `-ss/-t` + `setpts` + `atempoChain` →
  `concat` the pieces → then overlay as today. Reuses the existing per-piece loop shape.
- **Six presets, our own curves and names** (editorial intent, not someone else's numbers):
  *Hero Hold*, *Bullet Time*, *Jump Accel*, *Montage*, *Flash In*, *Flash Out*.
- **Downstream time effects:** camera keyframes, text layers and caption cues are source-time; a
  changed curve must remap them the same way silence cuts do (`remapCuesToKept` is the precedent).
  Decide deliberately: **curve changes never silently move captions** — remap through the same
  mapping function so they stay glued to the words.
- Tests: property-based round-trip `source→timeline→source` within 1ms at 200 random points;
  duration monotonicity; parity test; audio pitch/pacing smoke test.

### WS5 — Transitions  · **5–7 days** · **risk high** — the architectural one

Current composition: one base video stream + per-item overlays gated by `enable='gte(t,a)*lt(t,b)'`.
There is no concept of a *track stream*, so nothing can blend between neighbours.

**Target model: canvas per track.**

```
for each video track (bottom→top):
    item streams ──► xfade chain ──► full-length RGBA canvas ──► (blend/mask later)
composite canvases bottom→top with overlay
```

- `TimelineTransition { id, trackId, between: [itemA, itemB], kind, duration }` on `ClipTimeline`.
- **Start with four parametric transitions**, not a library: `cross-dissolve`, `dip-to-white`,
  `whip-pan` (translate), `zoom-blur`. Everything else is variations of transforms you'll already
  have from WS1.
- `xfade` requirements to respect: both inputs same size, `fps`, `pix_fmt`, `settb=AVTB`;
  `offset` in seconds; needs FFmpeg ≥ 4.3 → **probe it**.
- **Duration policy — pick one and document it:** transitions consume *handle* from the outgoing
  clip (timeline length unchanged); if no handle exists, shorten by `d` and surface a warning in
  the render plan's `limitations[]`. I recommend this. The alternative (always shortening) makes
  every caption timestamp shift, which is worse.
- **Perf mitigation — keep the fast path.** If a track has no transition and no blend, keep
  today's `overlay`+`enable` path. Only transition-bearing tracks get a canvas. Flag:
  `settings.video.transitionEngine` (off by default for the first release).
- **Also needs:** `acrossfade` on the audio side, using the same overlap windows.
- Tests: golden graph snapshots; a 3-clip transition render with ffprobe duration assertion
  (unchanged length in handle mode); a no-transition render diffed byte-for-byte against the
  baseline fixture (proves the fast path is untouched).

### WS6 — Auto reframe from tracking  · **3 days** · risk low-medium

You already have `trackingKeyframes[]`, editable in the UI, and `buildTrackedCropFilter`. What's
missing is *wiring*: derive `cameraKeyframes` from tracking so 16:9 → 9:16 follows the subject.

- Smoothing: dead-band (±5% of frame), then eased interpolation between accepted points; drop
  points with `score < 0.5`; enforce a minimum time between keyframes (≥0.6s) to avoid jitter.
- Degrade to centre-crop when tracking coverage is poor — and say so in `limitations[]`.
- UI: "Auto reframe" toggle on the Clip, with the resulting camera path shown on the timeline as
  editable keyframes (**never hidden**) — that's both honest and a feature.

### WS7 — Masks, blend modes, chroma key  · **3–4 days** (chroma/blend) / **+5 days** (masks) · risk medium

- **Chroma key** (`chromakey`/`colorkey`) — cheapest, most requested, ship first.
- **Blend modes** — `blend=all_mode=<mode>:all_opacity=`. Natural once WS5 gives you track canvases.
- **Masks** — model only the animatable subset established in the analysis (position, scale,
  rotation on linear, feather on all; shape and invert static). Static masks via a generated mask
  PNG + `alphamerge`; feather = blurred mask. Animated masks are where cost explodes — cap them
  behind the same feature flag and measure before promising them.

### WS8 — Beat sync + templates  · **3 days** + **3 days** · risk medium/low

- **Beat sync:** 20 ms RMS envelope via FFmpeg `-f f32le`, onset flux in TS, BPM by
  autocorrelation, then **suggest** boundary snaps within ±80 ms of a beat with a
  "keep musical phrasing" constraint (min clip length = 1 beat). Suggestions only — never silently
  rewrite a user's edit.
- **Templates:** once WS1/WS4/WS5 exist, a template is a serialised document with media slots.
  Serialise → validate → apply with mapping. Cheap *because* of the earlier work, expensive if
  attempted first.

---

## 4.5 Three gaps found by the research package (`Video Editor/` on main)

See [`CAPCUT_RESEARCH_PACKAGE_REVIEW.md`](CAPCUT_RESEARCH_PACKAGE_REVIEW.md). None of these change
the Tier-1 order; the first two are cheap and worth folding into M1.

- **Fractional frame rates missing.** `OutputFps = 'source' | 24 | 25 | 30 | 50 | 60` — CapCut's
  observed list includes 29.97 and 59.94. Anyone picking a number forces 30fps.
- **No keyboard shortcut system.** We handle four keys; CapCut is shortcut-driven
  (`Ctrl+B`, `J/K/L`, `A`/`B`, `Alt+K` keyframe panel, ease-in/out commands).
- **Keyframes vs split/trim.** Before WS1 adds *timeline-time* property keyframes, split and trim
  must partition keyframes and insert boundary keys, or animation silently breaks. Source-time
  keyframes (camera/text) are safe today only by accident.

Also noted as **debt, not now**: our stored times are float seconds. The research package calls
that unacceptable and recommends integer ticks. Rewriting the time model is not worth it yet, but
exact conversion at the FFmpeg boundary is.

## 5. Document versioning & persistence

- `ProjectDocumentV1` stays valid. New fields are optional → **readers accept old documents
  untouched**.
- On save, write `schemaVersion: 2`. Reader accepts 1 and 2. A `migrateDocument()` handles
  v1→v2 as a no-op today, so the seam exists for the first genuinely breaking change
  (transitions changing duration is the likely candidate).
- DB: `repositories.ts` maps columns explicitly (`clip_style_id`, `camera_keyframes`, …). New
  fields go in JSON columns (`animated`, `adjust`, `speed_curve`), not new columns, to avoid a
  migration per feature. Requires one DB migration for the JSON columns + `caption_presets` table.
- **Caps matter:** zod limits on keyframes per property (40), keyframed properties per item (8),
  transitions per track (200), `.cube` file size (8 MB). Unbounded keyframes = unusable render
  times, not just big documents.

---

## 6. Testing & verification strategy

| Layer | What | Why |
|---|---|---|
| Unit | `animatedAt` semantics for all 6 easings incl. `cut`/`hold`; time-map curve round-trip (property-based) | The two places correctness actually lives |
| Golden | Filter-graph string snapshots per feature | Catches silent regressions in emitted FFmpeg |
| Parity | Extend `timeline-render-parity.test.ts`: preview geometry === overlay expression at N sample times for animated props | Your existing defence against preview/export drift |
| Integration | 3 s synthetic clip per feature, real FFmpeg, `ffprobe` asserts duration/frames/alpha | Proves it renders, not just that it plans |
| Cache | Fingerprint changes for every new pixel-affecting field | Prevents stale renders |
| Compat | Render all saved v1 fixtures after every change | No broken projects |
| Perf | Render-time delta vs baseline on 60 s 1080p30 | Budgets: ≤15% colour, ≤35% transitions, ≤25% speed curves |

Baseline fixtures from Step 0 are what make the last two rows possible. Do them first.

---

## 7. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Transition rewrite destabilises all rendering | **High** | Canvas-per-track only for tracks with transitions; fast path preserved + byte-diffed against baseline; feature flag; ship last |
| Preview/render drift on animated properties | High | One shared interpolator + parity tests with sampled assertions |
| Stale renders from incomplete fingerprints | High | Explicit test per new field |
| FFmpeg build variance (`xfade`/`lut3d`/`geq` missing) | Medium | Startup probe → capability object → soft degradation + visible warning |
| Speed-curve time mapping bugs corrupt captions | Medium | Single shared implementation; property-based tests; captions remapped through it, never independently |
| Perf collapse at 4K60 with many animated overlays | Medium | Per-property cost table (§3), caps, perf tests; `geq` fallback flagged |
| Scope creep into CapCut's effect-library treadmill | Medium | Non-goals below; every feature must serve the auto-clipping output |
| Licensing exposure from CapCut assets | **High if ignored** | Never ship their LUTs, effects, templates, music. Reimplement mechanics; generate our own looks |

---

## 8. Milestones & effort

Single developer, part-time estimates. Ordering is the substance; totals are indicative.

| # | Milestone | Days | Ships |
|---|---|---|---|
| M0 | Extract `app/`, baseline fixtures, FFmpeg capability probe | 0.5 | Safe ground to stand on |
| M1 | **WS1 keyframes + diamonds** | 3–4 | *The* feel change |
| M2 | WS2 adjust/colour | 2 | Punchy look |
| M3 | WS3 captions productisation | 2 | Parity with CapCut's caption UX |
| M4 | **WS6 auto reframe** | 3 | Reuses existing tracking |
| M5 | WS4 speed curves | 4–5 | The CapCut signature |
| M6 | **WS5 transitions** | 5–7 | Most visible, most risk |
| M7 | WS7 chroma + blend | 3 | Layer compositing |
| M8 | WS8 beat sync + templates | 6 | Rhythm + one-click |
| — | WS7 masks | +5 | Optional |

M1–M3 is roughly **one week** and gets you most of the perceived gap. That's the slice I'd want
approved first.

---

## 9. Non-goals (explicit)

1. **No CapCut assets.** No LUTs, effect packs, music, SFX, template files.
2. **No effect-library treadmill.** No weekly content drops; procedural, parametric looks only.
3. **No cloud/marketplace.** Templates are local documents.
4. **No mobile/desktop parity project.** This is your Electron app.
5. **No cloning of CapCut's UI pixel-for-pixel.** Adopt the *vocabulary* (inspector, diamonds,
   Apply-to-All); keep your own visual language — your design guide already defines it.
6. **No change to the AI-clipping spine.** Candidate scoring, silence detection, transcription and
   metadata generation stay exactly as they are. Editing features serve them.

---

## 10. What I need to start

1. **Approval of the slice:** M1–M3 first (my recommendation), or tell me to start at M6.
2. **Reference material** (§0): 2–3 CapCut draft project folders + their exported MP4s, ideally
   one screen recording. Without it I'll implement from documented behaviour and the numbers will
   be approximations until you can compare renders.
3. **A decision on the transition duration policy** (§WS5) — handle-consumption vs.
   shorten-and-warn. I recommend handle-consumption.
4. **Confirmation that `app/` may be extracted into this repo** (Step 0), since implementation
   edits need the source in the tree.

Once (1) and (4) are settled I can start on M0 + M1 immediately; reference material can arrive in
parallel and sharpen M2 onward.
