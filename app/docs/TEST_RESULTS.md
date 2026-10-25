# Test Results

Running record per phase. Commands: `npm test` (all),
`npm run test:unit`, `npm run test:integration`.

Fixtures are generated locally (gitignored) by `npm run fixtures`: a 60s
1280×720 deterministic MP4, an incompatible AVI playback fixture, and a
149-word / 19-segment transcript with word-level timings.

## Current status — full suite green (2026-10-02, v0.0.4)

```
npm test
Test Files  34 passed (34)
Tests       291 passed (291)  (194 unit + 97 integration)
```

- `npm run typecheck` → Node and web TypeScript projects clean.
- `npm run build` → production main/preload/renderer bundles compile cleanly (see the current build-size row in `QA_REPORT.md`).
- Regression coverage verifies the v0.0.4 package/lock version, consistent use of the supplied Clipwright Studio logo across app and installer surfaces, exact developer credit, three-step onboarding content, responsive timeline height defaults/saved-size clamping, all 199 JSX-native buttons' event/form actions, and all 66 generic renderer API keys' IPC schema/backend mappings. Separate typed IPC tests cover update checks, user-approved downloads, progress, and restart/install controls.
- Speaker tests cover diarization persistence and corrections without real-person identification; audio-restoration tests cover presets/filter composition and before/after sample generation. The local Python diarization helper passes syntax compilation, but the optional resemblyzer model was not downloaded or run in this environment.
- Storage-cleanup integration tests prove selected generated caches/logs can be removed without touching original/imported media, transcripts, completed renders, exports or diagnostic JSON; active project jobs and symlinked cache paths are protected.
- Low-data URL coverage verifies audio-only probing/playback classification, URL range timecode formatting, import payload validation, and persistence of source modes/task results. The full local suite passed; no live yt-dlp site download was attempted.
- Preview server smoke-tested over HTTP: bundled TTF URL returns 200, a request for `/etc/passwd` remains 404, and `media.checkUrl`, Range serving, diagnostics, and upload-origin safeguards are exercised.
- Regression evidence: a real FFmpeg timeline render samples the configured red image at output t=0.75 s; unit tests pin still-image PTS, output window, per-channel audio delay, and shared preview/export geometry.
- The AST hook-order test guards the blank-editor regression. No browser executable is available here, so visible interactive editor and cleanup-dialog verification remain manual checks.
- The x64 NSIS configuration, runtime resources, unsigned setup metadata and Clipwright Studio app icon pass static packaging tests. The [v0.0.4 GitHub Release](https://github.com/yetiwrld/Clip/releases/tag/v0.0.4) publishes this build with `latest.yml` and blockmap. A real update/install cycle, clean Windows installation/launch, and desktop visual pass have not been performed.

> The module-by-module inventory below is the dated 2026-09-27 baseline (96 unit + 38 integration tests), not the current suite above. The dated detail is retained as history; current status is maintained here and in the follow-up section.

## Phase 0 — acceptance

| Criterion | Status |
|---|---|
| Architecture documented | PASS (`ARCHITECTURE.md`) |
| Dependencies identified | PASS (`ENVIRONMENT_AUDIT.md`, `DECISIONS.md`) |
| Missing dependencies known | PASS — FFmpeg (bundled fallback), Whisper models (unavailable in sandbox, honest status), GPU (none, CPU path) |
| Security boundaries documented | PASS (`SECURITY.md`) |
| Media pipeline understood | PASS (`RENDER_PIPELINE.md`) |
| Development phases defined | PASS (`DEVELOPMENT_PLAN.md`) |
| No hidden major unknown dependency | PASS |

## Historical unit-test inventory (`tests/unit/`) — 96 tests (2026-09-27 baseline)

- `time.test.ts` (11) — timestamp formatting/parsing round-trips, SRT/VTT/ASS
  formats, `isValidRange`, `overlapRatio` (dedupe primitive).
- `filenames.test.ts` (16) — Windows-safe sanitization (illegal chars,
  control chars incl. 0x7f, reserved device names, trailing dots, length),
  slugify, collision suffixes, export filename templates.
- `parsers.test.ts` (9) — SRT/VTT/timestamped-text/JSON transcript parsers:
  malformed blocks skipped, CRLF, micro-cue merging, whisper-style JSON,
  unknown extensions rejected.
- `captions.test.ts` (19) — segmentation (word timing alignment, malformed
  timing fallback, cue clamping to trim windows, user text edits), ASS output
  (PlayRes, karaoke `\kf`, BorderStyle box vs outline, BGR colors, font-size
  scaling, positioning), SRT output, style catalog.
- `candidates.test.ts` (16) — candidate validation (segment anchoring,
  reversed/missing ids, duration gates per preset, source bounds, near-empty
  speech), scoring (weights sum to 1, weighted mean, clamping), dedupe into
  moments (>55% overlap), rank assignment, excerpts.
- `heuristic.test.ts` (8) — local analyzer: deterministic, duration bounds,
  valid segment ids, scores 0–100 matching shared weights, timeline spread,
  empty transcript → no candidates, honest self-labeling.
- `crop.test.ts` (7) — shared crop math: vertical slice, even dimensions,
  in-bounds guarantees across all modes/cropX/zoom, zoom clamping 1–3,
  top/bottom on portrait, no-op when aspects match.
- `schemas.test.ts` (10) — AI output schemas (bad clip types, score ranges),
  exhaustive IPC payload schema list, `projects.delete` confirm semantics,
  app settings validation (complete object, out-of-range rejection).

## Historical integration-test inventory (`tests/integration/`) — 38 tests (2026-09-27 baseline)

### `database.test.ts` (13) — real SQLite (sql.js), throwaway workspaces
- Projects: create/read/list/update, full documented status machine
  (`created→…→analyzed` + `*_failed` with messages), delete cascades to
  segments/clips/renders/candidates/tasks, persistence across context
  restart (atomic save).
- Segments: replace-atomically, word-timing JSON round-trip.
- Candidates: replace keeps `converted`, deletes only `discovered`;
  rank/score ordering.
- Renders/tasks: lifecycle fields, `findInterrupted`,
  `markInterruptedOnLaunch` (completed tasks untouched).
- Settings: defaults when empty, per-section merge, corrupt JSON → safe
  fallback to defaults.

### `ai-provider.test.ts` (11) — localhost mock HTTP server, never the internet
- OpenAI wire format (Bearer auth, model, response_format, messages).
- 400-on-response_format → automatic retry without it.
- Error mapping: 401/403→AI_UNAUTHORIZED, 404→AI_NOT_FOUND,
  429→AI_RATE_LIMITED, 500→AI_HTTP_ERROR.
- Unconfigured provider / missing key → AI_NOT_CONFIGURED / AI_NO_KEY
  (never a fake success).
- Anthropic wire format (x-api-key, anthropic-version, system split).
- `extractJson` repair: plain, fenced, embedded, trailing commas, null on
  garbage.

### `pipeline.test.ts` (14) — **real FFmpeg end-to-end**, no mocks
- Project create → per-project folder.
- Media import: probe (60.0s, 1280×720, audio), stream-copy into project,
  re-inspect, thumbnail.
- Transcript import → 19 segments persisted with word timings, project
  `transcribed`.
- Heuristic analysis → validated candidates, moment grouping, scores,
  project `analyzed`; re-analysis replaces `discovered`, keeps `converted`.
- Clip creation idempotent per candidate; non-destructive updates persist
  (style, overrides, crop, title).
- Render: queued → preparing → rendering (progress events via SSE bus) →
  completed; output probed as **1080×1920 h264 + aac**, duration within
  tolerance, no temp files left, task row `completed`.
- Cancel: running render aborted → `cancelled` state, no leftover temp.
- Forced failure (source deleted): `failed` with `SOURCE_MISSING`,
  stage recorded, no final artifact.
- Export: mp4 + `.txt` + `.json` sidecars inside exports dir, metadata
  content verified; un-rendered clip → `CLIP_NOT_RENDERED`.
- Startup recovery marks in-flight renders failed + cleans temps.
- Project delete: refuses without confirm, removes folder with it.

## Bugs found by the test pass (fixed, see BUGS.md)

- Cancelled renders were recorded as `failed` (PROCESS_CANCELLED vs
  RENDER_CANCELLED code mismatch).
- Missing-source renders misattributed as FONT_ERROR (fontconfig noise).
- `segmentToWords` crashed on malformed word timings instead of falling back.
- `formatClock` did not roll hours; `sanitizeFilename` missed 0x7f.

## Manual run book (Windows 11 primary target — to execute on a real machine)

1. `npm install && npm run fixtures && npm test` — suite must be green.
2. `npm run dev` — the concise three-step welcome guide appears. **Check setup**
   opens the optional FFmpeg/FFprobe environment status; Python/faster-whisper
   availability is reported honestly in its settings.
3. Create project → import a real long video → verify preview + info.
4. Import an SRT → transcript tab lists segments; click seeks the player.
5. Analyze with heuristic → moments with Performance Audit breakdown
   (labeled as an estimate, not a prediction).
6. Create clip → editor: trim/captions/crop/metadata; autosave indicator.
7. Render → queue page shows live progress → completed 1080×1920 MP4.
8. Export → files + sidecars in exports folder; reveal works.
9. Kill the app mid-render → relaunch → interrupted job surfaced with
   Run again / Discard.
10. Settings: set a mock AI endpoint (e.g. local LM Studio) → test
    connection; keys stored; diagnostics export contains no secrets.

## Environment notes

- All integration tests use real FFmpeg (bundled installer binary) — they
  exercise the exact pipeline shipped to users.
- Mock AI server binds an ephemeral localhost port; tests never reach the
  real internet.
- Each test gets a throwaway workspace under `/tmp` (real SQLite file,
  atomic persistence, real project folders) and removes it afterwards.
- Local Whisper cannot be exercised in the sandbox (model downloads
  blocked); its provider availability probe reports this honestly and the
  import-file + cloud paths are covered instead.

## Timeline/export, missing-resource and editor regression follow-up (2026-10-01)

- Still-image PTS is shifted into the mapped output window, and the export uses
  the same half-open visibility window as the preview. `timelineOverlayGeometry`
  now supplies the center anchor, scale clamp and opacity clamp to both CSS
  preview and FFmpeg planning. A real render regression checks the red still
  image at output t=0.75 s; a separate before/after scan found about 18,900
  magenta pixels per 4×4 sample during the intended window.
- Timeline audio export uses per-channel `adelay` syntax supported by the
  bundled FFmpeg, plus item speed, item/track mute, volume and timeline-time
  fades. A layered-media integration render covers two audio tracks, a video
  layer, a still image and silence-cut remapping. Exhaustive waveform
  comparisons across every speed/mute/fade/cut combination remain open.
- Restored and bundled all 12 full TTF caption faces plus their OFL licenses;
  a static regression checks the manifest assets. Browser-preview media
  serving returns bundled TTFs while still denying arbitrary filesystem paths.
  Electron's media protocol now has the same narrow font-directory exception.
- The editor's conditional-return hook-order defect is fixed. The AST
  regression test checks hooks before early returns; loading clears stale
  clip/timeline/error state and stale async document loads are ignored.
  Click-time export snapshots read the clip/timeline refs and flush pending
  debounced writes, with unmount/pagehide flushing both pending saves.
- Other covered audit fixes include renderer-client/IPC contract parity,
  exact structural asset-reference matching, subprocess timeout classification,
  nested settings recovery, diagnostics paths/capacity, and preview upload
  origin/name/size safeguards. `scripts/python/transcribe_faster_whisper.py`
  and the documented incompatible-media fixture are present.
- The current automated gate is **265/265 across 26 files**; typecheck and
  production build pass. Timeline split/duplicate/delete, responsive height
  clamping and logarithmic zoom have focused unit coverage. A static scan found
  186 JSX-native buttons and no handler-less controls; regression coverage
  checks all 64 renderer API mappings against the IPC schemas. **Visual
  interaction with the editor itself remains pending**: this headless sandbox
  has no browser automation package or browser executable, so opening/editing in
  the live preview or Windows desktop app needs a manual pass. The targeted
  action audit fixed duplicate event dispatch, stale URL checks, empty clipboard
  pastes, duplicate menu/context actions, and analysis retry selection; this is
  not a substitute for a live button-by-button acceptance pass.


---

## Earlier storage cleanup and Windows installer follow-up (pre-v0.0.1, 2026-10-02)

- Storage cleanup is available under Settings → Storage & privacy. Its IPC
  scan/run operations use a server-side category allowlist and return workspace-
  relative sample locations only. The confirmation flow reports selected counts
  and bytes before deleting.
- Three real-context integration tests cover the full allowlist, preservation of
  originals/imported assets/transcripts/completed renders/exports/diagnostic
  JSON, old-log and stale-temp age limits, active-job exclusion, and refusal to
  follow a symlinked cache directory. IPC schema and renderer-method parity
  tests cover the new scan/run methods.
- Packaging checks assert NSIS x64, the self-contained resource directories,
  dependencies, app icon, and the explicit Electron-runtime download in
  `dist:win`. Windows Actions run [36946733015](https://github.com/yetiwrld/Clip/actions/runs/36946733015)
  completed on `windows-latest` and uploaded the unsigned installer artifact.
- `npm ci`, `npm run typecheck`, `npm run build`, and `npm test` pass; current
  suite is **273/273** (180 unit + 93 integration across 28 files). The local
  sandbox could not fetch Electron for `npm run dist:win` (`TypeError: fetch
  failed`); the successful CI installer still needs a clean Windows install
  and launch check, along with the UI visual pass.

## Redesign verification (2026-09-27, session 2)

**Scope**: full renderer redesign (design system + all screens) plus two
backend robustness fixes found during live verification. No test-suite
behavioral coverage existed for visuals, so verification = typecheck + build +
134-test suite + live preview-server exercise of every API the new UI calls.

| Check | Result |
| --- | --- |
| `npm run typecheck` (node + web, strict) | clean |
| `npx electron-vite build` | clean (renderer 1921 modules, CSS 36.9 kB) |
| `npx vitest run` | **134/134** (96 unit + 38 integration) |
| CSS class audit | every class referenced in TSX resolves in `global.css` |
| Decoration audit | zero `Sparkles`, gradients, backdrop-filter, glow, emoji, purple remnants in `src/renderer` |
| Live E2E via preview bridge | create → import (1280×720) → transcript (19 seg) → heuristic analyze (3 candidates, real titles) → clip → **render completed** → delete; workspace left clean |
| B-008 repro (delete during import) | process survives; task `failed / PROJECT_DELETED`; recovery-on-restart unaffected |
| Fixture regeneration | `npm run fixtures` — 149 words / 19 segments, segment text now real (was `"undefined …"`) |

**Known**: B-009 (rare unhandled rejection in parallel test teardown, infra
race, non-blocking). **Not automatable here**: pixel-level screenshots (no
browser binaries in sandbox) — final visual sign-off happens in the Windows
run book alongside the existing manual checks.


---

## Final QA + button audit + provider verification (2026-09-27, session 3)

| Gate | Result |
| --- | --- |
| `npm run test:unit` | **96/96** |
| `npm run test:integration` | **64/64** (ai-provider suite grew 11 → 37 tests) |
| `npm test` | **160/160** (11 files) |
| `npm run typecheck` | clean |
| `npm run build` | clean |
| Button audit | 76/76 wired; 0 icon-only buttons without labels; orders reviewed |
| IPC surface | 46 methods: contract = handlers = payload schemas; all renderer calls resolve |
| Live provider matrix | no key / wrong key 401 / unreachable / malformed URL / valid+pong+latency — all correct |
| Live AI workflow | analysis (2 candidates, 8 audit dims, scores) → clip → AI metadata → render → export, via mock gateway |
| Editor round-trip | trim (+invalid rejected), captions+overrides, crop+aspect, metadata; 4:5 render = exactly 1080×1350 |
| Persistence | full restart: settings, key, project, transcript, candidates, clip metadata, render — all intact |
| Key-leak audit | 0 occurrences in logs and diagnostics export |
| `npm run dist:win` | blocked by sandbox network at Electron binary download (config validated; run on Windows) |
| `npm run dev` | not executable in headless sandbox |
| GonkaRouter live | **NOT TESTED — no API key in this environment** (mock-verified end-to-end) |

Bugs fixed this session: B-010 (settings merge — provider saves were broken),
superficial provider test, weak response validation, Bearer-only auth,
400-only JSON fallback, base-URL schema hole, double-submit windows.


---

## Whisper detection & URL import fixes (2026-09-27, session 4)

| Gate | Result |
| --- | --- |
| `npm test` | **166/166** (+6 whisper-detect unit tests, contract list updated for `media.checkUrl`) |
| `npm run typecheck` / `npm run build` | clean |
| Live: direct .mp4 URL import (local HTTP) | project `ready`, 1280×720, source_type=url |
| Live: YouTube URL pre-flight/import | rejected with exact reason + yt-dlp hint, no task, no leftover project |
| Live: dependency message | exact interpreter path(s) + exact pip command |

## Session 5 — video-engine overhaul (2026-09-27)

**Environment:** Linux sandbox, Node 20, bundled FFmpeg/FFprobe installers,
real SQLite workspace. Branch `arena/01a0e298-aiclipping`.

| Check | Result |
| --- | --- |
| `npm run typecheck` (node + web) | **PASS** |
| `npx vitest run` (full suite) | **202/202 PASS** (was 166; +27 unit videoengine, +9 integration videoengine, contracts updated) |
| Schema migration v2 on live workspace | **PASS** (`context.ready: schema=v2`, old data intact) |
| Live preview REST: `media.checkPlayback` | **VERIFIED** native verdict for h264/aac; proxy verdict + reason for mpeg4/avi |
| Live preview REST: `media.renderProxy` | **VERIFIED** real transcode → `source/proxy.mp4` (h264 360p/aac); served with `?proxy=1`, HTTP 200 + 206 range |
| Live preview REST: `media.filmstrip` | **VERIFIED** 12 real JPG frames from FFmpeg (`fps` filter, cached on 2nd call) |
| Live preview REST: `media.waveform` | **VERIFIED** 1200 real peaks from FFmpeg s16le decode (max 0.127) |
| Live preview REST: `analysis.detectSilence` | **VERIFIED** real silencedetect pass; sample.mp4 honestly reports no ≥700 ms gaps; `silence.mp4` fixture (2.5 s gap) detects 3.0→5.5 with 130 ms padding → cut [3.13, 5.37] |
| Live preview REST: `clips.optimizeBoundaries` | **VERIFIED** honest reasons ("already at a sentence start/end") |
| Live preview REST: full render | **VERIFIED** 1080×1920 h264+aac, 41.467 s = 44.948 − 3.5 s silence cuts, 13.1 MB, FFprobe-validated |
| Live preview REST: preview render | **VERIFIED** 720×1280 draft, `preview: true` flag, 41.467 s |
| Multi-segment render (integration) | **VERIFIED** 3 kept segments via `filter_complex` concat; duration exact within validation window |
| Output validation failure path | **VERIFIED** missing-source render → `SOURCE_MISSING`, no `.mp4` artifacts kept |
| Disk-space pre-check | **VERIFIED** statfs probe returns real free bytes |

New fixtures committed: `tests/fixtures/media/silence.mp4` (tone 3 s →
silence 2.5 s → tone 3 s, 123 KB) and `tests/fixtures/media/incompatible.avi`
(mpeg4 + mp3, 427 KB — codec Chromium cannot decode).

**Not testable in this sandbox (needs Windows/GUI):** in-browser rendering of
the new timeline/caption UI (vite build passes; components typecheck),
hardware encoders (none in the sandbox — Auto mode falls back to libx264,
Hardware-only mode is expected to fail here by design).

## Session 5 addendum — Windows test-harness fixes (2026-09-27)

The first Windows run of the overhaul failed 13 database tests with
`mkdtemp '\\tmp\\...'` and skipped all fixture-dependent suites. Root causes
were in the TEST HARNESS, not app code:

- `tests/helpers/context.ts` + one database test hardcoded Unix `/tmp`;
  Windows resolves that to `\tmp` on the current drive (which does not
  exist). **Fixed:** `os.tmpdir()` everywhere.
- `afterAll` hooks assumed `beforeAll` succeeded, turning one clear error
  into three confusing ones (`cleanup is not a function`,
  `server.close` of undefined). **Fixed:** no-op defaults + null guards.
- `npm run fixtures` did not generate `silence.mp4` (new
  silencedetect fixture). **Fixed:** the generator now produces it
  (tone 3s → silence 2.5s → tone 3s, 640×360).

Re-verified in-sandbox from a cold start: `rm -rf tests/fixtures/media
tests/fixtures/transcript.json && npm run fixtures` regenerates everything;
full suite **203/203 PASS** (was 202 — the regenerated transcript yields one
more segment-boundary case).

## Session 5 addendum 2 — Windows EPERM on test teardown (2026-09-27)

Second Windows run: **203/203 tests passed**; the only failure was the
pipeline suite's `afterAll` — `fs.rmSync(tempWorkspace)` hit `EPERM`.
Root cause: Windows Defender/indexing briefly holds handles on the
freshly-written media files inside the temp workspace; Linux allows
unlinking open files, so this never surfaced in-sandbox.

- Test helper now removes temp workspaces with Node's built-in
  `maxRetries: 10, retryDelay: 250` and warns instead of failing the suite
  on a genuinely stuck handle (the OS reclaims %TEMP% regardless).
- Same hardening applied to `deleteProject` in the APP (maxRetries 5 ×
  200 ms): deleting a project right after a render no longer risks a
  silently-undeleted folder on Windows.

Re-verified in-sandbox: full suite 203/203 PASS.
