# Clipwright Studio — architecture, as built

**Source:** `app/` (extracted unchanged from `AIClipping-code-for-AI.zip`, commit `8b56157`).
**Written:** 2026-10-25, before changing any code.
**Method:** read the source, then *verified* by running it — typecheck, the full test suite, a
production build, and the real backend serving HTTP. Numbers at the end.

This document exists so that the CapCut work (text outline, volume fix, keyframes, transitions)
lands in the right place instead of on top of the nearest convenient file.

---

## 1. The one rule everything else follows

`src/main/index.ts` says it at the top:

> *"This is the ONLY file that imports Electron — everything below the backend boundary is plain
> Node and shared with the browser preview server and the test suite (ADR-007)."*

I checked: it's true. `grep` for `from 'electron'` across `src/main` finds only `index.ts`
(and the preload, which is the bridge). Every service is plain Node taking an `AppContext`.

That single decision is why this project is unusually testable and why there are **two transports
for one backend**:

| Transport | Entry point | Used by |
|---|---|---|
| Electron IPC | `src/main/index.ts` → `ipcMain.handle('api:invoke')` → `backend.invoke()` | the desktop app |
| HTTP + SSE | `server/preview.ts` → `POST /api/invoke`, `GET /api/events` | browser preview, and now us |
| Direct | `createBackend(ctx, null)` | Vitest integration tests |

The renderer never knows which one is live. `src/renderer/api/client.ts` picks:

```ts
export const isElectron = typeof window !== 'undefined' && Boolean(window.clipwright)
export const isPreview = !isElectron
```

**Consequence for our work:** any backend change can be verified by tests and seen in a browser,
without a Windows machine or an Electron binary.

---

## 2. Processes and build

`electron.vite.config.ts` builds three bundles:

| Bundle | Entry | Notes |
|---|---|---|
| `main` | `src/main/index.ts` | Node, deps externalised |
| `preload` | `src/preload/index.ts` | the only bridge; 41 lines |
| `renderer` | `src/renderer/index.html` | React 19 + Vite, `base: './'` for `file://` |

Path aliases (`@main`, `@shared`, `@prompts`, `@`, `@shared`) are configured per bundle. **`@shared`
is deliberately shared by main and renderer** — that is the mechanism behind preview/export parity.

Security posture is correct and worth preserving:

- `contextIsolation: true`, `nodeIntegration: false` (verified in the draft screenshot discussion
  too — our app matches CapCut's modern defaults).
- No `fs`/`path` in the renderer. OS paths for dropped files come from `webUtils.getPathForFile`
  through preload.
- A privileged custom scheme, `clipwright-media:`, registered before `app.whenReady()`, used to
  stream workspace media into the renderer.

---

## 3. The API contract

**One generic method, 65 operations, validated once.**

```
renderer → api['clips.update']({ id, patch })
         → transport (IPC or HTTP)
         → backend.invoke(method, payload)
             ├─ handlers[method]        ← string-keyed map, 65 entries
             └─ ipcPayloads[method]     ← zod schema, .strict()
```

- Type surface: `ClipwrightApi` in `src/shared/ipc.ts` — 65 methods, matches the handler count
  exactly (I counted both).
- Validation: `ipcPayloads` in `src/shared/schemas/index.ts`. **Every schema is `.strict()`**, so
  an unknown key is a hard failure, not ignored.
- Errors: everything is converted to a `StructuredError` (`code`, `message`, `hint`, `details`),
  and the renderer rethrows it as `ApiCallError` with `.code`/`.hint` accessors.

Namespaces: `media` 11 · `projects` 8 · `clips` 8 · `transcript` 7 · `settings` 6 · `system` 5 ·
`analysis` 5 · `tasks` 4 · `renders` 4 · `app` 3 · `timeline` 2 · `exports` 1 · `audio` 1.

**Consequence:** adding a field that travels from UI to backend means touching three places in
lockstep — the TS type, the zod schema, and the handler. Miss the `.strict()` schema and the whole
request fails with `VALIDATION_FAILED`, which is a confusing failure mode if you forget.

---

## 4. Data layer

SQLite through **sql.js (WASM)**, not a native driver. Whole-file persistence: `db.export()` →
temp file → rename, debounced, with explicit flush points (`src/main/services/database/db.ts`).

- **Migrations:** numbered, currently **v10** (`migrations.ts`). Additive and idempotent-looking;
  the live server logged `schema=v10` on boot.
- **Repositories:** `repositories.ts` (853 lines) maps every column explicitly. Two kinds:

| Kind | Example | Adding a field means |
|---|---|---|
| Column | `captionStyleId → caption_style_id` | new migration + column map entry |
| **JSON blob** | `textLayers → text_layers`, `captionOverrides`, `cameraKeyframes`, `silenceCuts`, `trackingKeyframes` | **nothing** — just extend the type |

**This is the single most useful fact for our first task.** `TextLayer` is stored inside the
`text_layers` JSON column. Adding `outlineColor` / `outlineWidth` to a text layer needs **no
migration at all** — type, zod schema, ASS writer, UI. That is why the text-outline fix is small.

New `Clip`-level objects (e.g. a future `adjust` block) would need either a new JSON column via
migration v11, or to be added inside an existing JSON field.

---

## 5. Services (13 areas, 35 files, ~8,750 lines)

| Area | Files | Owns |
|---|---|---|
| `projects` | `index.ts`, `document.ts` | import media (file/URL/section), project CRUD, project document |
| `media` | 7 files | ffmpeg/ffprobe invocation, probing, thumbnails, filmstrip, waveform, proxy render, URL providers (yt-dlp-class) |
| `clips` | `boundaries.ts`, `index.ts`, `tracking.ts` | clip creation from candidates, silence boundaries, subject tracking |
| `transcription` | `index.ts` | faster-whisper (local) and OpenAI-compatible providers, progress, cancellation |
| `speakers` | `index.ts` | speaker identification |
| `ai` | `analysis.ts`, `chat.ts`, `heuristic.ts`, `test.ts` | candidate scoring (heuristic + LLM), metadata generation |
| `rendering` | `plan.ts`, `queue.ts`, `fingerprint.ts` | **the render engine** — see §6 |
| `exports` | `index.ts` | export artefacts/sidecars |
| `audio` | `restoration.ts` | noise cleanup filter chain |
| `tasks` | `index.ts` | background task manager: runners, progress, cancellation, persistence |
| `database` | `db.ts`, `migrations.ts`, `repositories.ts` | persistence |
| `settings` | `index.ts`, `secrets.ts` | settings, API keys via `safeStorage` |
| `storage` | `cleanup.ts` | disk usage + cleanup |

Every service takes `AppContext` (dependency root: `db`, `events`, `logger`, `secrets`, `paths`,
`projectDir()`). No service imports Electron. `EventBus` publishes `AppEvent`s which the transport
forwards (IPC event / SSE) so the UI can react to background task progress.

---

## 6. The render pipeline — the part we will touch most

```
clips.render (IPC) / renders.start
   → RenderQueue.queueRender(clipId, preview)          queue.ts
       · dedupe + queue, concurrency 1 per project
       · pickEncoder(settings, probeEncoders(ffmpeg -encoders))
   → buildRenderPlan(ctx, { clip, project, settings, encoder })   plan.ts  (495 lines, PURE)
       ├─ keptSegments(clip.startTime, clip.endTime, clip.silenceCuts)   shared/video/segments
       ├─ buildClipCues(...)                     shared/captions/segmentation
       ├─ buildTextLayersAssDocument(textLayers) shared/captions/text-ass     → *.ass on disk
       ├─ buildAssDocument(cues, style)          shared/captions/ass          → *.ass on disk
       ├─ perSegmentVf(segmentStart)             shared/video/crop → zoompan/crop/scale
       ├─ buildTimelineLayerPlan(...)            overlays: [input]scale,pad,alpha,setpts
       │                                          → overlay=x:y:enable='gte(t,a)*lt(t,b)'
       └─ filter_complex graph + encoder args    → RenderPlan { args, expectedDuration, ... }
   → ffmpeg (spawn, -progress pipe:1)  → parse progress → update RenderJob
   → validateRenderOutput(ffprobe, plan)   ← duration/frames checked after the fact
```

Two structural facts that constrain everything:

1. **`buildRenderPlan` is pure.** It plans; `queue.ts` executes. Its only side effects are writing
   `.ass` files into the renders dir. Any new feature must keep this split, or the parity tests
   lose their footing.
2. **There is one base video stream plus enable-windowed overlays.** `buildTimelineLayerPlan`
   chains `overlay` with `enable='gte(t,a)*lt(t,b)'`. There is no per-track stream, no `xfade`,
   no blending. Confirmed by search: 0 occurrences of `xfade`, `acrossfade`, `blend`.
   **This is precisely why transitions are the expensive one** — they need a canvas per track.

### Caching / invalidation

`renderFingerprint(clip, project, settings, timeline, assets, transcript)` hashes:

- the **whole clip object** minus a small ignore list (`id`, `status`, timestamps, metadata text)
- the **whole timeline object** (tracks + items)
- project source path + file stamp (size/mtime), geometry, fps, hasAudio
- asset paths + file stamps for assets actually used
- the transcript

**Because `clip` and `timeline` are hashed wholesale, any new persisted field automatically
changes the fingerprint.** My earlier worry ("new fields must move the fingerprint") is already
handled structurally — as long as the field lives on `Clip`, `ClipTimeline` or `TimelineItem`.
New settings would need adding to the `settings` slice of the hash.

---

## 7. Renderer

- **Two zustand stores, neither holds editor state:** `app.ts` (view routing, toasts, settings,
  providers, bootstrapped flag) and `data.ts` (cached lists).
- **Editor state is local React state inside one giant component.** `EditorPage.tsx` is
  **3,355 lines** with roughly 40 `useState` calls, plus 10 sibling panel components in the same
  file (`TextLayerInspector` @2018, `CameraPanel` @2066, `AudioRestorationPanel` @2146,
  `TrimPanel` @2215, `SilencePanel` @2318, `CaptionsPanel` @2444, `TemplatePreview` @2975,
  `OutputPanel` @3025, `CropPanel` @3137, `MetadataPanel` @3280).
- **The edit → persist path** (this is the seam to reuse):

```
control onChange
  → updateClip(patch, immediate?, history?)        @EditorPage:419
      ├─ pushHistory()                             (undo)
      ├─ dispatchClipCommand({type:'clip.patch'})  shared/editor/timeline-commands
      ├─ merge into pendingClipPatches (per clip)
      └─ debounce 700 ms → flushClipPatch()
            → api['clips.update']({ id, patch })   → backend → repo → db
```

Timeline edits have a parallel path (`flushTimelineSave` → `api['timeline.save']`) with its own
debounce and its own undoing via `pushHistory`.

- **Undo/redo is snapshot-based**, held in the component (`pushHistory`), not in the data model.

---

## 8. The shared layer — where correctness actually lives

`src/shared` (24 files, ~4,340 lines) is imported by **both** main and renderer. This is the
preview/export parity mechanism:

| Module | Role |
|---|---|
| `types/index.ts` | the domain model (629 lines) |
| `schemas/index.ts` | zod for IPC payloads (466 lines) |
| `constants/index.ts` | 50 caption presets, fonts, quality presets, resolutions (608 lines) |
| `video/crop.ts` | camera keyframes + tracked crop → FFmpeg expressions |
| `video/time-map.ts` | timeline↔source mapping, overlay geometry |
| `video/textLayers.ts` | text layer interpolation + entrance/exit animation |
| `video/segments.ts` | silence-cut kept segments, cue remapping |
| `captions/*` | cue building, ASS generation (captions **and** text layers) |
| `editor/*` | immutable command boundary, undo coalescing |
| `audio/restoration.ts` | audio filter chain shared with renderer |

**The parity contract is tested, not assumed:** `tests/unit/timeline-render-parity.test.ts` calls
`buildTimelineLayerPlan` directly and asserts the emitted filter string (image PTS shift, shared
centre geometry, alpha). That is exactly the seam to extend for keyframes and transitions.

### The known inconsistency to be aware of

Captions and text layers both produce ASS, from two different modules:

| | `captions/ass.ts` (captions) | `captions/text-ass.ts` (text layers) |
|---|---|---|
| Outline colour | `style.outlineColor` ✅ | **the text colour** ❌ |
| Outline width | `style.outlineWidth` ✅ | `0` unless a background box exists ❌ |
| Animated per-frame | word-level tags | `\move`, `\t` transforms ✅ |

So the caption path is *ahead* of the text-layer path. The CapCut label we measured is a **text
layer** (independent overlay, no transcript needed), which is why it currently can't be reproduced.
The fix is to bring `text-ass.ts` up to what `ass.ts` already does — and the data model already
proves the concept, since `CaptionOverrides` already has `outlineColor` and `outlineWidth`
handled properly.

---

## 9. Where each planned change lands (no code written yet)

| Change | Files | Migration? | Notes |
|---|---|---|---|
| **Volume clamp (0–1 → 0–4)** | `plan.ts:125` | none | Schema already allows `max(4)`; renderer discards it |
| **Text outline** | `types/index.ts` (`TextLayer`), `schemas/index.ts` (`clipPatchSchema.textLayers`), `captions/text-ass.ts`, `TextLayerInspector` @2018 | **none** (`text_layers` is a JSON column) | Mirror what `ass.ts` already does |
| **"Bold Top Label" preset** | `constants/index.ts` (a panel separator + preset), `TextLayerInspector` | none | Numbers from the measured 1022 export: centre 0.499 × 0.151, cap height 3.4%, outline ~13% of cap height |
| **29.97 / 59.94 fps** | `types/index.ts:267` `OutputFps`, `schemas/index.ts` (`clipPatchSchema.outputFps`), `constants` resolution/quality maps, `OutputPanel` | maybe none (enum stored as text) | Check `effectiveFps()` in `plan.ts` handles non-integers |
| **Pacing snap (4.00 s grid)** | `shared/editor/*` (pure), `EditorPage` / `MultiTrackTimeline` | none | Operates on `TimelineItem.startTime/sourceOut`; must call the existing save path |
| **Property keyframes** | `shared/editor/animation.ts` (new), `time-map.ts`, `plan.ts`, `schemas` (`.strict()`!), `MultiTrackTimeline`, `EditorPage` | none for timeline JSON? | **`timeline.save` schema is `.strict()` — a new `animated` field will be rejected until the schema is updated** |
| **Transitions** | `plan.ts` (canvas per track), `types` (`ClipTimeline.transitions`), `schemas`, `MultiTrackTimeline`, `queue.ts` validation | possible | The only change that restructures the render graph |
| **Keyboard shortcuts** | new `renderer/shortcuts.ts`, `EditorPage`, `MultiTrackTimeline` | none | Currently only `ArrowLeft`, `Backspace`, `Delete`, `Enter` |

---

## 10. Gotchas I found while reading (worth remembering)

1. **`.strict()` zod schemas.** Adding a field to a payload without updating `ipcPayloads` fails
   the whole call. `timeline.save` is strict, so a new `TimelineItem.animated` key is rejected
   before it reaches the plan builder.
2. **Times are float seconds** (`TimelineItem.startTime`, `sourceIn/Out`), and arithmetic happens
   in floats (`time-map.ts`). Fine today; the risk is drift across many trims/splits. The
   research package's integer-ticks advice is right in principle, but rewriting the time model is
   not worth it now. Mitigation: exact rounding at the FFmpeg boundary (already `toFixed(3)`).
3. **Two ASS writers, uneven feature support** (§8). Any text-styling work must pick the right one.
4. **`EditorPage.tsx` is the bottleneck.** 3,355 lines, ~40 `useState`. New UI should go into its
   own component file, not into that file — otherwise review and testing get worse, not better.
5. **Undo is snapshot-based in the component**, so anything that mutates clip state outside
   `updateClip`/`pushHistory` will be un-undoable.
6. **The render queue is single-concurrency per project** with hardware-encoder probing cached
   per queue instance — relevant if transitions make renders slower.
7. **`validateRenderOutput` re-probes the output** after encoding (duration/frames). Good: it means
   a silently-wrong filter graph gets caught rather than shipped.

---

## 11. What I verified, running it here

| Check | Result |
|---|---|
| `npm install --ignore-scripts` | 453 packages, 8 s (Electron binary skipped — its download host is blocked) |
| `tsc --noEmit -p tsconfig.node.json` | **clean** |
| `tsc --noEmit -p tsconfig.web.json` | **clean** |
| `npm run fixtures` | generates `sample.mp4` (60 s), `silence.mp4`, `incompatible.avi`, `transcript.json` using the bundled ffmpeg |
| `npx vitest run` | **291 passed / 291** (34 files, ~205 s), including real FFmpeg integration renders |
| `npx electron-vite build` | builds main + preload + renderer (2.6 MB) |
| `server/preview.ts` | **runs**: `context.ready schema=v10`, serves the UI and answers `POST /api/invoke` |

Full verification loop available: **typecheck → 291 tests → build → live UI in a browser.**
That is how every subsequent change will be checked.

Notes for anyone repeating this:

- `npm install --ignore-scripts` is required because Electron's postinstall downloads its binary
  from a host this sandbox cannot reach. Skipping scripts is safe: nothing we test needs the
  Electron binary, and `@ffmpeg-installer/linux-x64` ships its binary **inside** the package.
- The first `vitest` run fails 4 tests purely because `tests/fixtures/media/` is gitignored and
  therefore absent. `npm run fixtures` fixes it.
- Generated/dirty paths are already gitignored by `app/.gitignore`: `node_modules/`, `out/`,
  `dist/`, `.workspace/`, `tests/fixtures/media/`.

---

## 12. Honest assessment

**Strong:** the Electron boundary discipline, one validated API surface with two transports, pure
render planning, shared geometry for parity, structured errors, background tasks with cancellation,
and a test suite that actually renders video. For a 22k-line app this is a well-shaped codebase.

**Weak, in order of how much it will hurt us:**

1. `EditorPage.tsx` at 3,355 lines — every editor feature touch is a merge risk.
2. No keyboard shortcut layer at all; the editor is mouse-only.
3. The two-ASS-writer divergence (§8) — it's why the CapCut label is currently impossible.
4. Float time arithmetic.
5. Frame-rate enum missing the fractional rates.

**What this changes about my plan:** the seams are where I assumed, so the plan's ordering holds.
The one correction is architectural rather than technical — **new editor UI must be new files**,
because the existing editor component cannot absorb keyframe UI and remain reviewable.
