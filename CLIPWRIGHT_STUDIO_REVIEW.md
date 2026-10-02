# Clipwright Studio — full code & architecture review

## Feature follow-up — 2026-10-02

The current package/source archive is v0.0.3. The selected features are
implemented: optional on-device speaker diarization with user-correctable
speaker labels, and non-destructive audio-restoration presets with before/after
sample playback. Speaker labels describe voice turns, not real-world identities;
cloud processing is not used. Thumbnail creation remains out of scope.

- Latest verification: `npm run typecheck`, `npm run build`, and **286 tests
  across 32 files** pass. The optional local diarization helper passes Python
  syntax compilation; the resemblyzer model itself and desktop/Windows update
  flow were not run in this environment.
- The updater remains opt-in (ask before download). To observe a real update,
  install an updater-enabled v0.0.2 build and publish/install the higher-version
  v0.0.3 GitHub Release. The update/install cycle is still unverified.
- Refreshed source archive: `AIClipping-code-for-AI.zip` (171 files, 3.75 MB).
  Original `build/icon.png` and `build/icon.ico` were restored and retained.
- Windows Actions run [37000108649](https://github.com/yetiwrld/Clip/actions/runs/37000108649)
  successfully built the unsigned v0.0.3 installer (artifact 11223801205,
  159,315,104 bytes). The v0.0.3 GitHub Release/update feed and a real Windows
  install/update cycle have not yet been verified.

The sections below preserve the 2026-10-01 audit as historical context.

---

## Prior fix-pass update — 2026-10-01

The audit below describes the original `AIClipping-code-for-AI.zip` snapshot.
The working copy at `extracted/` contains the fixes and resources, and the
source archive is refreshed from that working tree as the current deliverable.
Current status:

> **Historical note:** the inventory, defect counts, and recommendations below
> describe the original archive before these fixes; they are not a current
> defect list. The current deliverable is the refreshed archive and `extracted/`
> working tree. The requested `ui-ux-design-guide-for-ai.md` and
> `clipwright_studio_unified_master_spec.md` were not found in this checkout or
> source archive, so exact compliance with their text is not claimed.

- Fixed the missing still-image render (output PTS shift), aligned timeline
  geometry/window boundaries between preview and FFmpeg, merged pending clip
  edits, and flushes editor saves before export/exit.
- Fixed the editor's conditional-hook ordering; added an AST regression guard.
  A real browser interaction could not be automated in this headless sandbox,
  so visually opening/editing the clip remains a manual check.
- Restored the 12 full caption TTF faces + OFL licenses and the faster-whisper
  script; generated the incompatible AVI fixture; closed the `media.checkUrl`
  client binding; corrected portable audio delay, diagnostics and contracts.
- Latest verification: `npm run typecheck`, production build and the full suite
  pass: **265 tests across 26 files** (176 unit + 89 integration). The render
  integration samples the still overlay at the expected output time; live
  preview TTF serving is HTTP 200 and arbitrary path access remains HTTP 404.
- The targeted UI-action pass statically checked 186 native JSX buttons and
  added button-wiring plus IPC renderer-map regression tests. Full interactive
  button/visual acceptance remains pending because no browser runtime is installed.

The original archive's inventory/findings remain useful as a record of what
was missing at review time; see `extracted/docs/QA_REPORT.md` and
`extracted/docs/BUGS.md` for current verification and remaining manual limits.

**Original input reviewed:** `AIClipping-code-for-AI.zip` (1.57 MB, 133 files, no `.git` metadata, no binary assets)
**Updated source deliverable:** `AIClipping-code-for-AI.zip` (1.84 MB, 157 files)
**Extracted to:** `extracted/`
**Review date:** 2026-10-01 · Reviewer: Arena agent
**Method:** read every source file, then *executed* the project — `npm install`, `npm run typecheck`, `npm run fixtures`, full `npm test`, `npm run build`, launched the real backend (`server/preview.ts`) and drove a full import → transcript → analysis → clip → render → export workflow over the live API.

---

## 1. What this is, in one paragraph

**Clipwright Studio** (package name `clipwright-studio`, v0.1.0, MIT, private) is a **local-first Electron desktop app that turns long-form video into short-form vertical clips**. The workflow is: import a podcast/interview/lecture video → transcribe it (local faster-whisper, a cloud OpenAI-compatible endpoint, or an imported SRT/VTT/JSON) → have an AI or a built-in offline heuristic find the best moments → audit-score them → create a clip → reframe to 9:16 with burned-in animated captions → edit on a multi-track timeline → render locally with FFmpeg → export an MP4 bundle with title/description/hashtags/CTA.

It is a *real, substantial* application, not a prototype: ~1.4 MB of TypeScript across a main process, a React 19 renderer, ~110 pure shared modules, 19 test files (246 tests) that run real FFmpeg, and 17 process/architecture documents. The interesting engineering claim is that **no source file below the Electron boundary imports Electron**, which is what lets the identical backend run under Electron, under a browser preview server, and under Vitest.

**Bottom line up front:** the code is genuinely good and mostly does what the docs say — but the zip is **not a complete, shippable tree**. Three whole resource directories referenced everywhere (`resources/fonts/`, `resources/bin/`, `scripts/python/`) are absent, one renderer API method is missing from the client, and one FFmpeg filter option is incompatible with the bundled FFmpeg build. As shipped, the test suite is **244/246** and two user-visible features are broken.

---

## 2. Inventory — what's actually in the archive

| Path | Files | What it is |
|---|---|---|
| `src/main/` | 33 | Electron main process: bootstrap, IPC dispatcher, and all service modules |
| `src/renderer/` | 24 | React 19 UI (zustand stores, 5 pages, ~4,300 LoC editor) |
| `src/shared/` | 24 | Domain types, zod schemas, IPC contract, pure logic used by both sides |
| `src/preload/` | 1 | The entire renderer↔backend surface (`contextBridge`) |
| `src/prompts/` | 1 | All AI prompt text (discovery / scoring / metadata) |
| `tests/` | 20 | 14 unit files + 5 integration files + a generated transcript fixture |
| `server/` | 1 | Express browser-preview server (same services over HTTP+SSE) |
| `scripts/` | 2 | Fixture generator, mock OpenAI-compatible gateway |
| `docs/` | 17 | Architecture, pipelines, data model, decisions, bugs, QA, release docs |
| root | 8 | `package.json`, lockfile, electron-vite/vitest/tsconfig, electron-builder, README, .gitignore |
| **missing** | — | `resources/fonts/`, `resources/bin/`, `scripts/python/`, `build/` icon resources |

Code size: ~1.4 MB including a 179 KB `EditorPage.tsx`, a 72 KB `global.css`, and a 269 KB lockfile. `tests/fixtures/media/*.mp4` is gitignored and regenerated by `npm run fixtures` — correct.

---

## 3. How it works — subsystem by subsystem

### 3.1 Process topology and the security boundary

```
Electron main (Node)                          Renderer (React 19, untrusted)
  IPC layer  ← zod-validated every payload     contextIsolation: true
  Services (plain Node, no electron imports)   nodeIntegration: false
  EventBus → webContents.send / SSE            sandbox: true
  spawns: ffmpeg · ffprobe · python · fetch     window.clipwright.{invoke,onEvent,getPathForFile}
```

- `src/main/index.ts` is *the only file that imports Electron*. It registers a **privileged custom scheme** `clipwright-media://` that streams workspace files with HTTP Range support, resolves `?proxy=1` to a transcoded preview copy, maps ~22 MIME types, and refuses any path outside the workspace via a `realpath` containment check. `will-navigate` is blocked and external links go to `shell.openExternal`. This is the correct way to serve local `<video>` without disabling `webSecurity`.
- The preload (`src/preload/index.ts`, 40 lines) exposes exactly three things — `invoke`, `onEvent`, `getPathForFile` — no `ipcRenderer`, no Node.
- Boot names the workspace `ClipwrightStudio` under `userData` (overridable with `CLIPWRIGHT_WORKSPACE`), wires `safeStorage` (Windows DPAPI) into the secret store as an encryption codec, and shuts the DB down cleanly on `before-quit`.
- `server/preview.ts` re-implements the same media streaming + adds SSE and a raw-body upload endpoint, so the browser preview runs the **real** services (real SQLite, real FFmpeg), not a mock.

### 3.2 Storage layout and database (schema v8)

Workspace: `database/app.db`, `secrets.json` (0600), `models/`, `exports/`, `logs/`, and `projects/<uuid>/{source,transcription,analysis,clips,renders,thumbnails,cache,logs}`. Originals are copied in and never modified.

`sql.js` (WASM SQLite) behind a small `AppDatabase` adapter with **whole-file atomic persistence** (`db.export()` → `.tmp` → rename), a 250 ms debounced flush, and an explicit flush on shutdown. 8 forward-only migrations, all additive: projects, transcript_segments, clip_candidates, clips (many columns added over v2–v8), renders, tasks, speakers, app_settings, project_assets, clip_timelines.

**Invariants that are actually enforced in code, not just documented:**
- Candidate times are derived from *segment ids* the model returned — a model literally cannot invent a timestamp (ADR-005).
- `validateCandidate()` drops out-of-range/too-short/too-long/empty candidates with a recorded reason.
- Render output is only marked complete after a zero-exit FFmpeg run, an atomic rename, **and** an ffprobe validation pass (resolution ±2 px, duration ±1.5 s, fps).
- Preferences round-trip through zod; `settingsRepo.load()` falls back to *all* defaults if the stored blob fails validation.

### 3.3 IPC contract — 64 methods, honestly audited

`src/shared/ipc.ts` (types) ▸ `src/shared/schemas/index.ts` (`ipcPayloads`, `.strict()`) ▸ `src/main/ipc/backend.ts` (handlers) ▸ `src/renderer/api/client.ts` (wire map). I cross-checked all four programmatically:

```
contract 64 | payload schemas 64 | handlers 64 | renderer client 63
in contract but no handler: []        handler but not in contract: []
in client but not in contract: []     contract but not in client: ['media.checkUrl']  ← BUG
```

The dispatcher rejects unknown methods and zod-fails malformed payloads with a `VALIDATION_FAILED` structured error — good. Background work is dispatched through a `runTask()` helper that swallows the rethrow (the B-008 crash fix), while user-initiated retries keep their errors.

### 3.4 Media ingestion

- File import: existence/extension/size checks → ffprobe → stream-copy into `source/source.<ext>` → re-probe the stored copy (authoritative) → poster thumbnail → status `ready`. Missing audio is recorded honestly (`hasAudio=false` + an explanation) rather than failing.
- URL import: two providers. `DirectHttpProvider` checks content-type before writing, streams to `.part`, reports progress, cancels. `YtDlpProvider` uses a *user-installed* yt-dlp (PATH or bundled `resources/bin`), with `taskkill /t /f` cancellation on Windows and `--progress-template` parsing. `checkUrlProviders()` is a side-effect-free pre-flight used by `media.checkUrl` and by `importUrl` to fail fast.
- `inspectMedia()` handles rotation side-data by swapping display dimensions, treats 0-byte and audio-only files explicitly.
- Playback strategy: `playbackVerdict()` maps codecs to `native | proxy | audio-only` from a conservative allow-list (h264/vp8/vp9/av1 + aac/mp3/opus/vorbis/flac/pcm); anything else can be transcoded to a 720p H.264 proxy (`media.renderProxy`) that the preview player swaps in via `?proxy=1`. Renders always read the original.
- Timeline visuals: `buildFilmstrip` (FFmpeg `fps` filter, 24 JPGs, disk-cached on mtime+size key) and `buildWaveform`/`buildAssetWaveform` (s16le decode → 1200 peaks). Real data, no placeholders.

### 3.5 Transcription

Three providers behind one interface: `faster-whisper-local` (spawns Python), `openai-compatible` (extracts a 16 kHz mono audio track first — only the audio ever leaves the machine), and `import-file` (SRT/VTT/JSON/timestamped text parsing in `src/shared/transcript/parsers.ts`). Results are zod-validated (`transcriptResultSchema`), persisted to `transcript_segments` (with optional per-word timings) plus a human-readable `transcription/transcript.json`. `detectLocalWhisper()` is the B-011 fix: it probes *every* interpreter (`python`, `py`, `python3`), dedupes by resolved path, and reports the exact interpreter path and pip command. The local path also has honest failure codes (`WHISPER_UNAVAILABLE`, `MODEL_LOAD_FAILED`, `SCRIPT_MISSING`).

### 3.6 AI analysis (the "clip discovery" pipeline)

```
transcript → buildDiscoveryUserPrompt (numbered segments, duration window)
  → chatComplete (OpenAI-compatible or Anthropic, zod-validated, JSON-repair, retry)
  → rawCandidatesResponseSchema
  → validateCandidate: segment-ids → times, sentence-boundary snapping, duration gates
  → dedupeCandidates (>55% IoU → "moments", ranked variations)
  → buildScoringUserPrompt → 8 dimensions clamped 0–100 → weighted overall
  → persist candidates (+ raw provider output archived in analysis/)
```

- The heuristic provider is a first-class, deterministic, offline analyzer that computes the *same* 8 dimensions from transparent signals (hook cues, questions, numbers, sentence completion, dead-air ratio, boundary quality) and is labelled "not an AI model" everywhere.
- Anti-hallucination design (ADR-005) is real: prompts demand segment ids; the app converts them to times; impossible ranges are dropped with a logged reason; only one stricter retry is attempted before failing with `AI_RETURNED_INVALID_JSON`.
- Provider layer handling is genuinely hardened: `authHeaders()` for bearer / x-api-key / both; `/chat/completions` never double-appended; `response_format` retried once without it on 400 **and** 422 with the abort signal preserved; strict response validation (`AI_PROVIDER_INVALID_RESPONSE` instead of returning a raw envelope); legacy `choices[0].text` and content arrays accepted; 401/403/404/429/5xx mapped to specific messages; `testAiProvider()` makes a real "Reply with exactly: pong" call and measures latency.

### 3.7 Clip lifecycle, boundaries, silence, camera

- `createClipFromCandidate` copies provenance and settings defaults; `updateClip` validates trim ranges against the source duration; `deleteClip` returns the candidate to `discovered`.
- `optimizeClipBoundaries` snaps a clip to sentence starts/ends, expands with lead-in context (max 3.5 s), and returns a before/after quality score plus human-readable reasons.
- Silence removal is real: `analysis.detectSilence` runs FFmpeg `silencedetect` over the clip window with mode thresholds (auto 700 ms / aggressive 450 ms), padding, per-cut caps, normalizes cuts, stores them on the clip, and the **render uses a multi-segment `concat` with captions remapped onto the kept timeline by the same shared math the preview uses**.
- Subject tracking uses FFmpeg `find_rect` on a base64 PGM template captured from the preview, with size/type validation and cached metadata; virtual-camera keyframes support 6 easing modes and are compiled into a `zoompan` expression chain for FFmpeg.

### 3.8 Captions

One shared module (`src/shared/captions/segmentation.ts`) produces cues for **both** the DOM preview and the ASS renderer (ADR-009), including word-level timing synthesis when a provider gave none, user text edits, cue splits/merges, ±timing nudges, hidden cues and duplicated cues. `ass.ts` writes a proper `[V4+ Styles]` document with PlayRes matching the render canvas, %-of-height font sizes, karaoke/`\c` word emphasis, box/outline/shadow controls and animations; `text-ass.ts` does the same for free text layers; `srt.ts` exports a sidecar. 16 style presets exist (see B-4).

### 3.9 Render pipeline

`buildRenderPlan()` (22 KB, the most intricate file) turns a clip into one exact FFmpeg argv:

- input seek `-ss/-to` and re-encode for frame accuracy;
- reframe to the resolution tier (`resolutionFor` short-side based, orientation-aware, even dimensions) with `scale/crop` or a `zoompan` camera path or a `fit` mode;
- optional multi-segment concat for silence cuts;
- optional timeline layers (images with rotation/opacity, videos with speed via `setpts`/`atempo`, audio with fades/volume/delay) overlaid via `overlay` with `enable=between`;
- caption/text ASS burn-in with `fontsdir`;
- audio aac 192k + optional `loudnorm`, or `-an`;
- `libx264 crf/preset` or a probed hardware encoder (`h264_nvenc/qsv/amf/videotoolbox`) with automatic CPU fallback;
- `-progress pipe:1` for streaming progress, `yuv420p`, `+faststart`, output to `<id>.tmp.mp4`.

`RenderQueue` persists jobs, enforces configurable concurrency (1–4, default 1), does a **disk-space pre-check with a 2.5× safety factor**, streams progress to the event bus and DB (throttled), cancels via `AbortController` → SIGTERM → SIGKILL, cleans temp files, attributes failures to a stage and maps them to structured errors (`SOURCE_MISSING`, `DISK_FULL`, `FFMPEG_NO_SUBTITLES`, `PERMISSION_DENIED`, `SOURCE_CORRUPT`, `FONT_ERROR`), validates the output with ffprobe and **deletes a bad file rather than reporting success**, then generates a clip thumbnail. Startup marks in-flight jobs `interrupted` and never auto-restarts them.

Render fingerprints hash every input that can change pixels (clip config, source stamps, timeline, assets, transcript) so the UI can honestly say a render is stale; export refuses to ship a stale render.

### 3.10 Export, settings, diagnostics

- `runExport` copies only *current* completed renders into `exports/<project>/NN_slug.mp4` + `.txt` + `.json`, with Windows-safe filenames, collision-safe numbering and platform presets (TikTok/Reels/Shorts/Generic).
- Settings are one zod-validated JSON document in `app_settings` with a **two-level merge** so partial provider patches preserve siblings (the B-010 fix), field-level error messages, and live log-level application.
- `checkDependencies()` probes FFmpeg, FFprobe, Python+faster-whisper, AI providers and disk; `buildDiagnostics()` deliberately excludes API keys; `exportDiagnostics()` writes a JSON report to `logs/`.

### 3.11 Tests and fixtures

`npm run fixtures` generates `sample.mp4` (60 s, 1280×720 testsrc2 + tone), `silence.mp4` (tone → 2.5 s silence → tone) and a 149-word/19-segment word-timed transcript. Tests use throwaway workspaces under `os.tmpdir()` (Windows-hardened with `maxRetries`), real FFmpeg from the npm installer, and a localhost mock server for AI providers (ADR-013). The suite genuinely renders video: the integration pipeline and video-engine suites together take ~3 minutes.

---

## 4. The documentation set (17 files) — what each claims

| Doc | Content |
|---|---|
| `README.md` | Product summary, dev commands, status pointer |
| `ARCHITECTURE.md` | Process topology, workspace layout, module map, the four key rules |
| `DEVELOPMENT_PLAN.md` | Phases 0–10 + manual Windows run book, all marked done |
| `DATA_MODEL.md` | ER overview and every table/column, status machines, invariants |
| `AI_PIPELINE.md` | Provider tables, anti-hallucination constraints, malformed-output strategy, scoring dimensions, privacy rules, caching |
| `RENDER_PIPELINE.md` | Binary resolution, the exact filter graph, safety properties, queue semantics, caption rendering |
| `SECURITY.md` | Trust model, Electron hardening, secrets policy, the exact "data leaving the machine" table, validation, logging |
| `DECISIONS.md` | 15 ADRs (ffmpeg strategy, sql.js over better-sqlite3, subprocesses, segment-id timestamps, heuristic provider, dual transport, bundled font, protocol handler, atomic writes, test strategy, UI redesign, provider auth) |
| `BUGS.md` | B-001…B-012 with symptom→cause→fix→regression test; B-009 still open (test-teardown race) |
| `TASKS.md` | Phases 0–14 checklists, backlog (semantic search, diarization, face crop, batch clips, learning loop) |
| `CHANGELOG.md` | MVP → UI redesign → provider hardening → whisper/URL fixes → video-engine overhaul (timeline, captions, silence, output quality, reliability) |
| `TEST_RESULTS.md` | Per-phase run records, session 5 video-engine verification, Windows harness fixes |
| `QA_REPORT.md` | Final QA table: typecheck/tests/build/package status, 76/76 buttons, 46 IPC methods, live E2E, key-leak audit, "not yet verified" list |
| `MASTER_SPEC_UPGRADE_AUDIT.md` | A larger "unified master spec" gap analysis + phases 1–3 progress (ProjectDocumentV1, time-map, frame-rate, timeline commands, aria/inspector work) |
| `ENVIRONMENT_AUDIT.md` | Sandbox constraints (no GPU, blocked model downloads, headless) |
| `API_SETUP.md` | OpenAI-compatible/GonkaRouter setup, base-URL rules, error table |
| `RUNNING_WINDOWS.md` | Exact commands, Windows run book, where data lives |
| `RELEASE_CHECKLIST.md` | Automated gates, packaging, smoke test, provider acceptance, hygiene |
| `FONT_LICENSES.md` | OFL font attribution table (Inter, IBM Plex Sans Condensed, Source Serif 4) |

The docs are unusually honest — `QA_REPORT.md` explicitly lists what was *not* verified (GonkaRouter live call, `dist:win` to completion, desktop launch, local Whisper, cloud transcription, pixel review). They are, however, **stale in places** (see §7).

---

## 5. What I ran, and what happened

| Command | Result |
|---|---|
| `npm install` (Node 22.22, npm 10.9) | ✅ clean |
| `npm run typecheck` (node + web, strict) | ✅ **0 errors** |
| `npm run fixtures` | ✅ sample.mp4 (60 s), silence.mp4 (8.5 s), transcript.json (149 words/19 segments) |
| `npm test` | ⚠️ **244/246 passed in 19 files (193 s)** — 2 failures (below) |
| `npm run build` (electron-vite) | ✅ main 332 kB, preload 0.65 kB, renderer 1.16 MB + 72 kB CSS |
| `npx electron-builder --dir --linux` | ❌ at the Electron binary download (TLS interception) — environmental, matches the repo's own note |
| Live preview server + full E2E over HTTP | ✅ create → import (1280×720, h264/aac, 60 s) → import SRT (19 segments) → heuristic analyze (2 moments w/ scores) → clip → trim → **render completed 1080×1920, 30.000 s, 9.6 MB** → export (mp4+txt+json) |
| `system.fontUrl('Inter_400Regular.ttf')` (live) | ❌ `FONT_NOT_FOUND` |
| Caption burn-in with the app's ASS + missing `fontsdir` | ⚠️ silently substitutes DejaVu (`fontselect: (Inter SemiBold, 700, 0) -> DejaVuSans-Bold.ttf`), i.e. output ≠ design |
| IPC surface audit | ✅ 64/64/64/63 — one renderer binding missing |
| Button/label audit (my own parser) | ✅ 190 buttons, **0 icon-only buttons without a label** |
| CSS class audit | ⚠️ 4 classes referenced but undefined: `editor-moment-thumb`, `xs`, `end`, `tl-text-lane` (last two in dead code) |
| Decoration audit | ⚠️ 3 `Sparkles` usages remain in the editor; otherwise no gradients/blur/emoji |

### The 2 failing tests

```
FAIL unit tests/unit/captions.test.ts:235
  AssertionError: Inter_400Regular.ttf: expected false to be true
  → expect(fs.existsSync(`resources/fonts/${face.file}`)).toBe(true)

FAIL integration tests/integration/media-assets.test.ts:104
  Error: Layer render failed: {"code":"FONT_ERROR", ...}
  → FFmpeg: [Parsed_adelay_13] Option 'all' not found
            Error initializing filter 'adelay' with args '500:all=1'
```

---

## 6. Defects — everything I found, with evidence

### B-1 · **CRITICAL** — `resources/fonts/` is missing from the archive
**Where:** `src/main/services/app-context.ts:67-93`, `src/main/index.ts:75`, `App.tsx:30-45`, `electron-builder.yml:22-28`, `docs/FONT_LICENSES.md`, ADR-008.
**Evidence:** `resources/` does not exist at all. `findResourcesDir()` walks up looking for `resources/fonts`, fails, and returns `<cwd>/resources`; `ctx.paths.fontsDir` therefore points at a non-existent directory. `system.fontUrl` returns `FONT_NOT_FOUND` live. Every render passes `fontsdir='…/resources/fonts'` (non-existent). `tests/unit/captions.test.ts:235` fails on the very first font.
**Impact:**
1. The editor's custom-font preview silently falls back to system fonts (the `try/catch` in `App.tsx` hides it).
2. Renders burn captions in **whatever font libass substitutes** — verified: it requested `Inter SemiBold` at weight 700 and got DejaVu Sans Bold. On a machine without that font the result differs again. ADR-008's "identical render output everywhere" promise is broken, and preview ≠ output, contradicting ADR-009.
3. `electron-builder` only *warns* (`fileMatcher.js:273 file source doesn't exist`) and packages the app **without** fonts.
**Fix:** restore the 12 TTFs listed in `FONT_LICENSES.md` (Inter 400/600/700/800/900, IBM Plex Sans Condensed 400/500/600/700, Source Serif 4) plus their OFL texts, or, if licensing/size is a problem, delete the bundled-font feature honestly: drop the fontsdir argument, restrict `CAPTION_FONTS` to real files, and use a documented system-font stack.

### B-2 · **CRITICAL** — `scripts/python/transcribe_faster_whisper.py` is missing
**Where:** referenced by `src/main/services/transcription/index.ts:219-232` (both dev and packaged layouts) and `electron-builder.yml:25-26`.
**Impact:** local Whisper transcription can **never** work, even on a machine where faster-whisper is installed and detected: it fails with `SCRIPT_MISSING — "The transcription script is missing from the application resources. Checked: …/resources/python/…, …/scripts/python/…"`. `docs/BUGS.md` B-011 and `RUNNING_WINDOWS.md` document the exact opposite ("the helper script is bundled").
**Fix:** ship the script (it must read `--input/--model/--model-dir/--device/--compute/--beam-size/--language`, stream `{progress, message}` JSON on stderr, and return a `{language, segments:[{start,end,text,words[]}]}` document on stdout — that is the exact contract `transcribeLocal()` expects).

### B-3 · **HIGH** — timeline audio layers fail to render on the bundled FFmpeg
**Where:** `src/main/services/rendering/plan.ts:124` — `adelay=${ms}:all=1`.
**Evidence:** the bundled `@ffmpeg-installer` binary is *ffmpeg N-47683 (2018, effectively 4.1)*; `adelay` there exposes only the `delays` option, no `all`. Reproduced: `[Parsed_adelay_13] Option 'all' not found … Error initializing complex filters`. Since binary resolution is *setting → PATH → bundled*, a packaged install with no system FFmpeg takes this path by default. Integration test `media-assets.test.ts` fails on it.
**Secondary bug exposed by the same log:** the failure was reported to the user as `FONT_ERROR` ("Caption rendering hit a font problem") because `mapFfmpegFailure()` (`queue.ts:364-395`) tests `/fontselect|fontconfig|glyph/` against stderr that always contains fontconfig noise, and `Option 'all' not found` matches none of the earlier patterns. The real cause is misattributed — exactly the class of bug B-005 claimed to fix.
**Fix:** use a portable form — `adelay=delays=${ms}:d=${ms}` or `adelay=${ms}|${ms}` — or drop `all=1` and apply one delay per channel; and add an explicit "unknown filter option" pattern before the font heuristics (`/Option '.*' not found|Error initializing (complex )?filters/` → `FFMPEG_FILTER_UNSUPPORTED` with a "your FFmpeg build is too old / use a modern build" hint). Ideally also gate the filtergraph on the probed FFmpeg version.

### B-4 · **HIGH** — the renderer's API client is missing `media.checkUrl` (broken B-012 feature)
**Where:** `src/renderer/features/dashboard/DashboardPage.tsx:122` calls `api['media.checkUrl']({url})`; `src/renderer/api/client.ts`'s `wire()` map has 63 of the contract's 64 methods and omits it.
**Impact:** `api['media.checkUrl']` is `undefined`, so the debounced pre-flight inside `setTimeout` throws `TypeError: api.media.checkUrl is not a function`; the `.catch()` never runs because the call throws synchronously. The documented "live URL hint" never appears, and every keystroke in the URL field emits an uncaught renderer error. My static audit of all `api['…']` call sites found this is the **only** missing binding.
**Fix:** add `'media.checkUrl': f('media.checkUrl')` to `wire()`, and add a contract test that asserts *every* key of `ipcPayloads`/`ClipwrightApi` exists in the client map (the existing `schemas.test.ts` checks contract↔schema, not client↔contract — that's the gap that let this through).

### B-5 · **MEDIUM** — `media.importFile` / `media.importUrl` return type contradicts the contract
`src/shared/ipc.ts:37-38` declares `Promise<Project>`; `src/main/ipc/backend.ts:121,135` return `{taskId}`. Current callers ignore the value, so nothing breaks today, but the type is a lie and any new caller will read `.status` off `undefined`. Fix: change the contract to `Promise<{ taskId: string }>` (which is what the async hand-off really is).

### B-6 · **MEDIUM** — diagnostics report the wrong values
`src/main/services/diagnostics/index.ts:112-117` deliberately blanks the FFmpeg/FFprobe **path and source** (`path: ''`, `source: ''`) while `RENDER_PIPELINE.md` promises "the active binary and its version are shown in Settings and in the diagnostic export" — and the path is exactly what a support ticket needs. Line 117 is worse: `disk: { freeBytes: storage.free, totalBytes: storage.free }` reports free space as *total* space. Fix: include the real path/source (it is not secret) and read `bsize × blocks` for total.

### B-7 · **MEDIUM** — `tests/fixtures/media/incompatible.avi` is documented but never generated
`docs/TEST_RESULTS.md:238` claims it was committed ("mpeg4 + mp3 … codec Chromium cannot decode") and the video-engine notes say the proxy verdict was verified with it. `scripts/make-fixtures.ts` generates only `sample.mp4` and `silence.mp4`, and `tests/fixtures/media/` is gitignored — so the artifact cannot be reproduced from this tree. (The current tests work around it by calling `playbackVerdict()` with synthetic codec names, so the *real-transcode* proxy check is weaker than documented.) Fix: add AVI generation to `make-fixtures.ts` (or a H.264/HEVC fixture) and use it in the integration test.

### B-8 · **LOW/MEDIUM** — dead code and undefined CSS classes ship to users
- `src/renderer/features/editor/Timeline.tsx` (28 KB) has **zero importers** — the active timeline is `MultiTrackTimeline.tsx`. The docs acknowledge it as legacy, but it still doubles the maintenance surface (`tl-text-lane`, `end` classes come from it).
- `editor-moment-thumb` (used in the editor's Moments panel) and the `stack xs` variant are **not defined in `global.css`**, so those elements render unstyled (an unstyled `<img>` in a dense list is exactly the kind of visual defect the redesign was supposed to remove).
- `Sparkles` is still imported and rendered 3× in `EditorPage.tsx` (as the Moments tool icon / empty state) although `TEST_RESULTS.md` claims "zero `Sparkles`". Cosmetic, but the claim is false.

### B-9 · **LOW** — smaller correctness/robustness issues
- `removeProjectAsset()` (`media/assets.ts`) checks usage with `clip_timelines.document LIKE '%<assetId>%'`, a substring match that could false-positive on an unrelated id and does not distinguish a track reference from stray text. Parse the JSON instead.
- `relinkProjectAsset()` deletes the old copied file *before* checking that `updateMedia()` returned a row (it throws afterwards) — a narrow window where the asset row points at a deleted file.
- `runProcess()` sets the same `killed` flag for timeouts and aborts, so a **timeout is reported as `PROCESS_CANCELLED`** ("The operation was cancelled") rather than a timeout error. Users can't tell "too slow" from "I cancelled it".
- `transcribeCloud()` ignores the provider's `authStyle` and always sends `Authorization: Bearer` — inconsistent with the chat path, and it will fail on gateways configured as `x-api-key`/`both`.
- `mapFfmpegFailure()` ignores its `plan` argument (unused parameter) and never distinguishes "unsupported filter option" (see B-3).
- `settingsRepo.load()` replaces a whole section from stored JSON and then validates the merged blob; a single missing/newly-added field makes `safeParse` fail and silently reverts **every** setting to defaults (including the user's API-provider configuration) instead of merging field-wise and reporting what was wrong.
- The preview server's `/api/upload` has no size limit and the whole preview server is unauthenticated on `0.0.0.0`; it is a documented dev tool, but it grants full workspace/render control to anyone who can reach the port. Add a size cap and bind/authenticate if it is ever exposed beyond localhost.
- `.gitignore` duplicates `tests/fixtures/media/` and `.workspace/`; `RUNNING_WINDOWS.md` says Node 22+ while `README.md`/`package.json` say >= 20.

### B-10 · Documentation drift (stale numbers)
| Claim | Reality |
|---|---|
| `QA_REPORT.md`: "46 IPC methods: contract = handlers = schemas" | **64** methods — and one is missing from the renderer client |
| `QA_REPORT.md`: 160 tests; `TEST_RESULTS.md`: 203, 235, 242, 246 green | **246** tests now; **2 fail** |
| `CHANGELOG.md`: "12 templates across 10 categories" | **16** styles across **20** category ids |
| `DEVELOPMENT_PLAN.md`: test files `projects.service.test.ts`, `media.service.test.ts`, `render.pipeline.test.ts`, … | Those filenames don't exist (actual: `pipeline.test.ts`, `database.test.ts`, `media-assets.test.ts`, …) |
| `AI_PIPELINE.md`: "Prompts live in `clip-discovery.ts`, `scoring.ts`, `metadata.ts`" | One file, `src/prompts/index.ts` |
| `AI_PIPELINE.md`/`RENDER_PIPELINE.md`: `services/events.ts`, `rendering/ass.ts` | The bus lives in `app-context.ts`; ASS is in `src/shared/captions/ass.ts` |
| `RUNNING_WINDOWS.md`: "the helper script is bundled" | It is not (B-2) |
| `TEST_RESULTS.md`: videoengine "50 caption presets" | 16 presets × 4 aspects × 4 resolutions |
| `ARCHITECTURE.md` module list | Omits `media/frames.ts`, `video/*`, `analysis/*`, `editor/timeline-commands.ts` (all real) |

None of this is dangerous by itself, but a repo whose selling point is honesty should not have a QA report describing a differently-shaped codebase.

---

## 7. What to fix, in order

**Must-fix before anyone runs this (blocking correctness)**
1. **B-4** — one line: `'media.checkUrl': f('media.checkUrl')` in `wire()`, plus a test that diffs the client map against `ipcPayloads`. *(5 minutes)*
2. **B-3** — replace `adelay=…:all=1` with a portable form and add the "unsupported filter option" branch to `mapFfmpegFailure()` *before* the font patterns; keep the integration test that caught it. *(30 minutes)*
3. **B-1/B-2** — decide, honestly, whether the app ships bundled fonts and the Python transcription script. Restore the assets (12 TTFs + OFL files + `transcribe_faster_whisper.py`) **or** remove the features and all documentation that claims they exist. Do not leave the silent-fallback behaviour. *(hours, mostly asset sourcing)*
4. **B-7** — make the fixture generator produce every fixture the docs and tests reference.

**Should-fix (real bugs, smaller blast radius)**
5. **B-5** contract honesty for `media.importFile`/`media.importUrl`.
6. **B-6** diagnostics path/source and the `totalBytes` mix-up.
7. **B-9** the settings-load merge (a single bad field should not wipe user configuration), the `LIKE`-based asset-in-use check, the timeout-as-cancel wording, and cloud transcription's `authStyle`.
8. **B-8** delete `Timeline.tsx` or wire it; define `editor-moment-thumb` and `.stack.xs`; make the "no Sparkles" claim true (or delete the claim).

**Then (quality/hygiene)**
9. Refresh the docs against reality — regenerate the QA/TEST_RESULTS numbers from an actual run, fix filenames, update the IPC count, and make `FONT_LICENSES.md` match what is actually shipped.
10. Add the missing automated gate that would have caught B-4 (client ↔ contract ↔ payload-schema parity) and a "resources referenced by electron-builder exist" test — both are pure static checks and would have turned three of these defects into red builds.
11. Close out B-009 (the `persistNow` teardown race) by having `close()` await the in-flight flush queue before the workspace is deleted — or ignore it, since it is infra-only.

---

## 8. How to run it (verified commands)

```bash
cd extracted
npm install                 # Node 20+ (22 recommended); installs bundled FFmpeg/FFprobe
npm run fixtures            # generates tests/fixtures/media/*.mp4 + transcript.json
npm run typecheck           # clean
npm test                    # 244/246 today — see §6
npm run build               # electron-vite build (out/main, out/preload, out/renderer)
npm run preview:web         # → http://localhost:8787 — full app in a browser, real backend
npm run dev                 # Electron desktop app (needs a display + Electron binary download)
npm run dist:win            # Windows installer (must run on a normal-network Windows machine)
npx tsx scripts/mock-gonka.ts 8901   # offline OpenAI-compatible gateway for AI-workflow testing
```

The live browser preview I started for this review is running at port **8787** and already contains a workspace with one imported project, a transcript, two analysed moments, one rendered 1080×1920 clip and an export bundle — handy for inspecting the UI yourself.

---

## 9. Overall assessment

**Strengths.** The separation of concerns is exemplary for an app of this size: Electron is confined to one file, services are testable plain Node, the IPC surface is zod-validated end-to-end, and the same code path serves the desktop app, the browser preview and the tests. The render pipeline is real (frame-accurate trims, multi-segment concat for silence removal, camera expressions compiled into FFmpeg, output validation that deletes bad files), the AI layer is defensive in ways most products are not (segment-id-anchored timestamps, one strict retry, per-field clamping, provider provenance on every artifact), and the "honest failure" culture — structured `{code, message, hint, details}` errors, dependency probes, `[Fix]` hints, no telemetry, explicit privacy table — is coherent throughout. The documentation set is better than most commercial codebases.

**Weaknesses.** The archive is a *source snapshot*, not a reproducible build: missing resources silently disable two headline features (bundled fonts → caption fidelity; Python script → local Whisper), the test suite is red, the QA/status docs describe a slightly different program than the one in the zip, and there is a genuine one-line renderer regression (`media.checkUrl`) that only exists because no test compares the client map to the contract it implements. The editor is also carrying ~28 KB of dead timeline code and two undefined CSS classes from the last redesign.

**Verdict.** With the four must-fix items above (roughly a day's work, mostly restoring assets), this is a credible, unusually well-architected local-first video tool. As shipped in the zip, it builds and installs but ships with two broken features, one broken renderer call, and a red test suite — and its own documentation would not tell you that.
