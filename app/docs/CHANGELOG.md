# Changelog

All notable changes to Clipwright Studio. Format loosely follows
Keep a Changelog; versioning follows the app package version.

## 0.0.4 — Low-data URL clipping (2026-10-02)

### Added
- Added two local-first URL workflows: download a requested time range, or
  download an audio-only stream for local transcription and timestamped moment
  discovery before fetching any video. The existing explicit full-video path
  remains available; low-data modes do not silently fall back to it.
- Added selected-moment video fetching into a child project with remapped local
  transcript/candidate times, so preview, editing, and rendering use the
  downloaded section as a normal local source.
- Added progress, cancellation, audio-only playback/probing, and clear UI
  caveats: audio still transfers, source support varies, and keyframe padding
  or source limitations may affect/fail section downloads.

### Verified
- `npm run typecheck`, `npm test` (**291 tests across 34 files**), and
  `npm run build` pass. Integration coverage uses local generated media; a live
  yt-dlp/source-site download and Windows end-to-end install/update remain
  manual checks.

## 0.0.3 — Local speaker diarization and audio restoration (2026-10-02)

### Added
- Added optional local speaker diarization for transcript voice turns. Speaker
  labels can be reassigned and renamed by the user; they describe turns in the
  recording and do not identify real-world people. Processing stays on-device;
  the optional speaker model is downloaded only when first needed.
- Added non-destructive audio-restoration presets with before/after audio
  samples. Selected filters are applied only when generating a render; original
  media remains untouched. Cloud processing is not used.

### Changed
- Bumped the app version to 0.0.3. Windows updates remain opt-in: the app asks
  before downloading a newer GitHub Release.

### Verified
- `npm run typecheck`, `npm test` (**286 tests across 32 files**), and
  `npm run build` pass. Python syntax compilation of the local diarization
  helper passes. The v0.0.3 GitHub Release published the unsigned Windows
  installer, `latest.yml`, and blockmap; actual install/update verification
  and the local model-download run remain manual checks. No thumbnail feature
  was added.

## 0.0.2 — Opt-in Windows automatic updates (2026-10-02)

### Added
- Packaged Windows builds check the GitHub Releases update feed at startup and
  notify the user when a newer version is available. Downloads start only after
  the user approves; download progress is shown, then the user can restart and
  install now or continue working.
- Configured electron-builder's GitHub provider and a tag-driven Windows
  release workflow that publishes the NSIS installer, `latest.yml`, and
  blockmap assets required by electron-updater.
- Added typed, allowlisted preload IPC for update checks, downloads, progress,
  and install/restart. The browser preview, development builds, and non-Windows
  platforms do not run update checks.

### Changed
- Bumped the app version to 0.0.2, the first release line with an updater. The
  previously distributed v0.0.1 app has no updater code and must be manually
  replaced once before subsequent releases can update automatically.

### Verified
- `npm run typecheck`, `npm test`, and production build pass. Windows Actions
  run [36994448614](https://github.com/yetiwrld/Clip/actions/runs/36994448614)
  built and uploaded the unsigned v0.0.2 installer. Actual Release publication
  and clean-machine Windows update installation remain to be verified.

## 0.0.1 — Clipwright branding and first-run welcome (2026-10-02)

### Added
- Standardized the app shell, welcome guide, preview favicon, app window, and
  Windows executable/installer on the repository-provided `Clipwright Studio
  Logo.png`; removed the separate in-app logo asset.
- Added a compact three-step first-run guide for importing a video, finding
  highlights, and editing/exporting clips, with an optional environment check.
- Added the exact footer credit “Developed by yetiwrld” below the existing
  version and workspace information.

### Changed
- Set the application and Windows installer version to v0.0.1; the Windows
  NSIS artifact continues to use the existing product/app identifier.

### Verified
- `npm ci`, typecheck, production build, and **276/276 tests** pass.
- The Windows installer workflow builds and uploads the unsigned v0.0.1 x64
  NSIS package from the refreshed source archive. Clean-machine installation
  and launch have not been performed.

## Earlier development follow-up — Windows installer and storage cleanup (2026-10-02)

### Added
- Settings → Storage & privacy now scans playback proxies, timeline filmstrips,
  waveform caches, extracted transcription audio, stale partial render/proxy/
  thumbnail files, and logs older than 30 days. Users select categories, review
  sizes and workspace-relative sample paths, then confirm before cleanup.
- Cleanup is allowlisted server-side, skips projects with active jobs, refuses
  symlinked/changed files, and preserves source/imported media, transcripts,
  project edits, completed renders, exports and diagnostic JSON.
- The Windows x64 NSIS package now uses a Clipwright icon and explicitly
  acquires Electron's platform runtime before the production build. A Windows
  GitHub Actions workflow builds and uploads the unsigned installer artifact.

### Verified
- `npm run typecheck`, `npm run build`, and **273/273 tests** pass (180 unit +
  93 integration across 28 files); cleanup preservation and symlink/active-job
  guards have integration coverage.
- Windows Actions run [36946733015](https://github.com/yetiwrld/Clip/actions/runs/36946733015)
  built and uploaded the unsigned x64 installer. The sandbox itself could not
  download Electron, and a clean-machine installation/launch remains to be verified.

## Earlier development follow-up — timeline/export parity and editor reliability (2026-10-01)

### Fixed
- Image overlays now receive output-timeline PTS before FFmpeg's timed
  overlay filter, so a still image remains present during its configured
  window instead of disappearing from export. The editor and export share
  center anchoring, scale/opacity clamps, and half-open visibility windows.
- Timeline audio export now aligns with editor timing for item speed, per-item
  and per-track mute, volume, channel delay, and timeline-time fades; source
  and timeline audio are mixed and trimmed to the output duration.
- The editor calls hooks consistently before conditional returns and clears
  stale clip/timeline/error state while a different clip loads. Stale async
  document loads can no longer replace the newly selected clip. Pending clip
  patches are merged; export snapshots editor refs and flushes both autosaves.
- Restored all 12 full TTF caption faces and OFL licenses. Preview and Electron
  media protocols serve only font files from the bundled font directory.
- Additional fixes cover exact structural asset-use matching, subprocess
  timeout reporting, nested settings recovery, shared transcription auth,
  diagnostics path/capacity reporting, and upload-origin/name/size safeguards.
- The editor preview remains the center workspace while the timeline has a
  responsive 220–300px default, persisted-height viewport clamps, fit/zoom,
  track-management and accessible trim controls. Numeric inspector edits are
  validated and bounded; overlapping transcript imports are blocked safely.
- `npm run dev` and `npm start` now explicitly acquire Electron's platform
  binary before launching, avoiding `Electron uninstall` on fresh installs.
- Removed duplicate project-open menu actions and fixed known UI-action issues
  around event dispatch, import cancellation, stale URL preflight, clipboard
  paste, rename submission and provider-specific retry selection. A live
  button-by-button browser acceptance pass remains pending.


### Verified
- `npm test`: **265 tests across 26 files** (176 unit + 89 integration); typecheck and production build pass.
- Regression scans cover 186 native JSX buttons for event/form wiring and every renderer API mapping against the 64-method IPC contract.
- A render integration regression samples the still image at output t=0.75 s;
  a full-output before/after scan found about 18,900 matched magenta pixels
  per 4×4 sample during the configured window.
- The rebuilt preview streams a bundled TTF with HTTP 200 and continues to
  deny arbitrary paths (for example, `/etc/passwd` → 404).
- Preview API and upload-origin smoke checks pass. Visual browser verification
  of the editor and exhaustive audio/timeline combinations remain pending in
  a browser-capable environment.

## Unreleased — video-engine overhaul

### Added (playback, §4-8)
- Explicit `<video>` error states in the editor: codec problems surface a
  readable overlay instead of a black rectangle, with the exact reason
  (e.g. "Chromium can't decode video codec mpeg4").
- `media.checkPlayback` verdicts (native / proxy / audio-only) computed from
  the inspected codecs; drives the editor's playback strategy.
- `media.renderProxy`: real FFmpeg transcode to a 720p H.264/AAC faststart
  proxy (task with progress), stored next to the source; preview playback
  switches to it via `?proxy=1` on the media protocol (Electron + preview
  server). Renders always use the ORIGINAL file.
- Media protocol MIME map extended (.avi/.wmv/.flv/.ts/.mpg/.mpeg + all
  audio types) in both the Electron protocol and the preview server.

### Added (timeline & editor, §9-21)
- Professional timeline: zoom (buttons + ctrl+scroll), pan (scroll/shift),
  FFmpeg-generated filmstrip thumbnails, FFmpeg-generated audio waveform
  (canvas, peaks cached on disk), magnetic snapping to cue/cut/second edges
  (Alt disables), large trim handles with live time tooltips and frame-step
  keyboard trimming, silence-cut bands drawn in red.
- JKL transport: J rewinds, K pauses, L plays with repeated presses speeding
  up (1× → 1.5× → 2×); `,`/`.` step one frame from the real source fps;
  Home/End jump to clip edges; I/O set trim points frame-accurately.
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z) in the editor with coalesced history;
  per-panel reset buttons.

### Added (captions, §22-30)
- Caption template browser: 50 built-in presets across 10 categories (clean,
  bold, creator, high-energy, minimal, social, professional, podcast,
  cinematic, meme) with live mini previews rendered from the preset style.
- Full style controls shared by preview AND render: text/highlight colors,
  box opacity, outline width, shadow (ASS + DOM both honor them).
- Cue editing: split a cue in half, merge with the next, ±0.1s timing nudges
  (clamped against neighbours), per-cue and bulk reset.
- Platform safe-area guide (editor-only overlay, never rendered).

### Added (semantic clipping, §31-45)
- Sentence-boundary analysis (`src/shared/analysis/boundaries.ts`): every
  candidate from ANY provider is snapped to sentence starts/ends inside the
  shared validation pipeline, with duration-gate fallback.
- "Optimize boundaries" action on existing clips: snapping + lead-in context
  expansion (questions, continuations, short openers) with human-readable
  explanations and a before/after quality score.
- Heuristic ranking now includes boundary quality (±10%) and dead-air
  penalty (up to −10 points).

### Added (silence removal, §35-41, 60-63)
- Real FFmpeg `silencedetect` analysis (`analysis.detectSilence`) over the
  clip window with standard/aggressive thresholds, padding, and per-cut caps.
- `clip.silenceCuts` persisted per clip; the editor shows cut bands, a
  keep/remove list, restore-all, and total saved time.
- Preview playback SKIPS removed ranges live; the render uses a real
  multi-segment FFmpeg concat (`filter_complex`) with caption cues remapped
  onto the kept timeline by the same shared math the preview uses.

### Added (output quality, §46-58)
- Resolution tiers 720p/1080p/1440p/2160p per clip (short-side based,
  orientation-aware, always even dimensions) with upscale warning.
- Quality presets draft/standard/high/maximum (CRF 27/21/18/15 + x264
  preset + hardware bitrate factors); per-clip output fps (source/24/25/30/
  50/60) with constant-frame-rate normalization for VFR sources.
- Output panel with live size estimate, output duration (after cuts), and a
  Quick preview render (720p draft) action; preview renders are flagged in
  the queue.

### Added (render reliability, §59, 73-78)
- Disk-space pre-check (statfs) with a 2.5× safety factor before queueing.
- Output validation via FFprobe after every render: video stream present,
  exact target dimensions (±2px), duration within ±1.5s, fps near plan —
  failures delete the bad file and report `RENDER_VALIDATION_FAILED`.
- Encoder policy: Auto (hardware with CPU fallback), CPU, Hardware-only
  (fails with `HW_ENCODER_UNAVAILABLE` when absent). Hardware bitrate scales
  with output area × quality.
- Settings → Video rebuilt around the new defaults (resolution, quality,
  encoder mode, silence detection thresholds).

### Migration
- Schema v2: clips gain `caption_cue_splits`, `caption_cue_merges`,
  `caption_timing_offsets`, `silence_cuts`, `output_resolution`,
  `output_quality`, `output_fps`; renders gain `preview`. Existing data is
  preserved; new columns default sensibly.

## Unreleased — whisper detection & URL import fixes (historical, 2026-09-28)

### Fixed
- B-011: local-Whisper detection now probes every Python interpreter
  (python / py / python3) instead of stopping at the first one found; the
  status message names the exact interpreter path and the exact pip command;
  Settings → Transcription gained a Re-check button (no app restart needed
  after installing the package).
- B-012: background task failures now raise an error toast with their
  structured reason (URL imports that need yt-dlp were previously silent).

### Added
- `media.checkUrl` pre-flight IPC + live URL field hint: the dashboard says
  whether a pasted link is importable before anything is created.
- `media.importUrl` fails fast when no provider can handle the URL; the
  placeholder project is cleaned up automatically.
- URL imports name the project after the downloaded file instead of
  "URL import".

### Verified
- 166/166 tests (6 new whisper-detection tests; IPC contract test extended);
  live: direct mp4 URL import end-to-end, YouTube URL rejection with reason,
  exact-interpreter dependency message.

## Unreleased — final QA & provider hardening (historical baseline, 2026-09-27)

### Fixed
- B-010 (critical): provider settings could not be saved from the UI —
  `settings.update` now merges two levels deep, so partial provider patches
  preserve sibling fields; field-level validation messages.

### Added
- Provider connection test is now a real live request ("Reply with exactly:
  pong") that verifies the model answered, measures latency and echoes the
  endpoint/model — no more success-on-200-garbage.
- Per-provider API key header style (Bearer / x-api-key / both; Bearer
  default) for gateways such as GonkaRouter that document `x-api-key`.
- Strict OpenAI-compatible response validation (`AI_PROVIDER_INVALID_RESPONSE`
  with diagnostics; embedded error objects; legacy `choices[0].text`;
  max-token cutoff hint).
- JSON-mode auto-fallback extended to HTTP 422; cancel signal preserved.
- Duplicate-submission guards for Analyze and Export.
- `scripts/mock-gonka.ts` — offline OpenAI-compatible mock gateway for
  provider plumbing verification without any key.
- Docs: `RUNNING_WINDOWS.md`, `API_SETUP.md`, `QA_REPORT.md`,
  `RELEASE_CHECKLIST.md`.

### Verified
- 160/160 tests (26 new provider tests); typecheck + build clean; live E2E:
  provider test matrix, full AI workflow via mock gateway (analysis + audit
  scores + metadata), editor round-trip incl. 4:5 render = 1080×1350,
  persistence across restart, key-leak audit (logs + diagnostics clean),
  76/76 buttons wired, 46/46 IPC methods consistent.

## Unreleased — professional UI redesign

### Changed
- Complete visual redesign per the professional-UI brief: neutral graphite
  design system with a single muted-orange accent, 4/6/8 px radii, flat
  panels and dividers instead of card stacks, no gradients/glow/blur/sparkle
  iconography, Lucide icons at standardized 1.75 stroke.
- Dashboard: dense project rows (thumbnail, duration, clip/moment counts,
  edited-when, status dot) with a context menu (open / rename / delete with
  confirmation) and inline active-task lines; no hero, no KPI cards.
- Moments: analytical list — CLIP NN index, mono timecodes, compact
  `NN / 100` performance-audit value, per-dimension bar rows, why-selected
  explanation, heuristic-vs-AI provider labeling; variations as a segmented
  control.
- Clips: media-asset rows with thumbnail, timecodes, caption style, status,
  live render progress, per-row Edit/Render/Export/Reveal/Copy/Delete.
- Editor: real workspace — top bar (inline title, save state, Render), stage
  with aspect-correct preview that mirrors the render plan, collapsible
  inspector sections (Trim / Captions / Crop / Metadata), professional
  timeline (labeled ruler, trim handles, playhead, caption-timing strip) and
  a compact transport with timecode.
- Render queue: grouped Rendering / Queued / Completed / Failed task monitor
  with live progress, retry, cancel, reveal; recent-operations table.
- Settings: left nav + rule-divided sections, aligned controls, status dots
  instead of text glyphs.
- Sidebar: identity block, workspace nav with live render count, settings at
  the bottom, 2 px accent indicator on the active item.

### Fixed
- B-008: deleting a project while its import task was running crashed the
  backend; background task failures can no longer kill the process, and the
  import fails with a structured `PROJECT_DELETED` error instead.
- Test fixtures: `transcript.json` segment text was regenerated (an older
  generation pass had written "undefined …" text fields).

## 0.1.0 — MVP (2026-09-27)

### Added
- Phase 0: environment audit + full architecture documentation set
  (`ENVIRONMENT_AUDIT`, `ARCHITECTURE`, `DEVELOPMENT_PLAN`, `DATA_MODEL`,
  `AI_PIPELINE`, `RENDER_PIPELINE`, `SECURITY`, `DECISIONS`).
- Application shell: Electron + React 19 + TypeScript (strict), dark themed
  desktop UI, navigation, dashboard, settings, toasts, first-run dependency
  check.
- Local-first storage: SQLite (sql.js) with forward-only migrations,
  per-project directory structure, atomic persistence, `project.json` mirror.
- Media ingestion: local file import, ffprobe inspection, thumbnails,
  Range-streamed playback (custom protocol), URL import via provider
  adapters (direct HTTP; yt-dlp when installed), honest no-audio/unsupported
  errors.
- Transcription: provider abstraction — faster-whisper (local Python),
  OpenAI-compatible cloud, SRT/VTT/JSON/text import; synced transcript
  viewer (click-to-seek, follow playback, search, copy).
- AI analysis: OpenAI-compatible + Anthropic providers, prompt template
  layer, segment-ID-constrained JSON, zod validation with repair/retry,
  moment deduplication, offline heuristic analyzer fallback.
- Performance Audit: 8 scoring dimensions + overall estimate + explanations,
  always labeled as an estimate and attributed to its provider.
- Caption engine: shared segmentation + word timing, 50 built-in presets
  across 10 categories, emphasis, ASS burn-in with bundled OFL fonts, SRT export.
- Clip editor: timeline with draggable in/out, live caption/crop preview,
  caption text editing, style + crop controls, metadata editing,
  keyboard shortcuts.
- Render engine: staged FFmpeg pipeline, streaming progress, atomic output,
  queue with configurable concurrency, cancel/retry, failure attribution,
  interrupted-job recovery on launch.
- Content packaging: AI metadata (title/description/hashtags/CTA) — editable,
  platform presets, export bundles, clipboard copy.
- Browser preview server (dev tool) running the same backend services over
  HTTP+SSE.
- Test suite: unit + integration (real FFmpeg renders, mock AI server,
  fixture generator).
- Diagnostics export, storage management panel, structured logging with
  secret redaction.

### Notes
- Whisper model weights cannot be downloaded inside the development sandbox
  (filtered egress); the local provider reports availability honestly and
  works on user machines with normal internet access.
- No telemetry of any kind. External AI calls happen only when a provider is
  configured and selected, and send transcript text only — never media.

## 0.1.0 — MVP code complete (Phase 1–10)

- Full renderer: dashboard, first-run experience, project pipeline tabs
  (source/transcript/moments/clips/renders), clip editor (timeline, caption
  preview, crop guide, metadata), global render queue with interrupted-task
  recovery UI, settings (AI providers with key storage + connection test,
  transcription, video, captions, export, storage/privacy, advanced with
  dependency status).
- Browser preview server (`npm run preview:web`) serving the real backend
  over HTTP + SSE (ADR-007), with upload + media-range streaming.
- Test suite: 134 tests (96 unit / 38 integration) — includes real FFmpeg
  end-to-end render (1080×1920 + burned captions), mock-server AI adapter
  verification, DB state machines, recovery paths, export bundles.
- Fixes surfaced by testing: render-cancel attribution (B-004),
  missing-source attribution (B-005), malformed word timings (B-006),
  formatClock/sanitizeFilename defects (B-007).
- IPC contract tightened: every `ClipwrightApi` method returns a Promise;
  `tasks.cancel` payload schema added; renderer global `window.clipwright`
  typed via `declare global` in `@shared/ipc`.
