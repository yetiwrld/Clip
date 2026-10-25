# Development Plan

Phased delivery with acceptance tests per phase. Status legend:
`[x] done · [~] in progress · [ ] not started`.

## Phase 0 — Environment audit & architecture  `[x]`

- [x] Inspect OS, Node, npm, Git, Python, FFmpeg, GPU, disk, env (see `ENVIRONMENT_AUDIT.md`)
- [x] Existing project analysis (repo was empty — clean build)
- [x] Architecture, data model, AI pipeline, render pipeline, security documents
- [x] Decision records (`DECISIONS.md`)
- [x] Task/bug/test journals scaffolded

**Acceptance**: architecture documented; dependencies identified; missing
dependencies known (FFmpeg → bundled fallback, Whisper models → unavailable in
dev sandbox, no GPU); security boundaries documented; media pipeline
understood; phases defined. → **PASS** (see `TEST_RESULTS.md`).

## Phase 1 — Application shell  `[x]`

Electron + electron-vite + React 19 + TypeScript. Dark themed shell with
navigation (Dashboard / Projects / Queue / Settings), project creation with
persistence (SQLite + `project.json`), settings skeleton, logging, first-run
welcome & dependency check, event bus, typed API client.

**Acceptance**: launch → create project → close → reopen → project listed. →
verified by `tests/integration/database.test.ts` + manual run book.

## Phase 2 — Media ingestion  `[x]`

Local file import (copy into workspace `source/`), ffprobe inspection
(duration/fps/resolution/codecs/audio/orientation), thumbnail generation,
video player (custom protocol streaming w/ Range), URL ingestion via
`VideoSourceProvider` adapters (direct HTTP download; yt-dlp if installed on
user machine), explicit no-audio and bad-codec error reporting.

**Acceptance**: import ordinary MP4 → see duration, resolution, audio status,
thumbnail, playback. → `tests/integration/pipeline.test.ts` and
`tests/integration/videoengine.test.ts` exercise the real media pipeline.

## Phase 3 — Transcription  `[x]`

`TranscriptionProvider` abstraction; faster-whisper local (Python subprocess,
word timestamps); OpenAI-compatible cloud; SRT/VTT/JSON/TXT import.
Transcript viewer: timestamps, click-to-seek, follow-playback highlight,
search, range select, copy. Missing providers degrade with honest errors.

**Acceptance**: test video produces timestamped transcript; clicking a segment
seeks the player. → `tests/unit/parsers.test.ts`,
`tests/integration/pipeline.test.ts`, and `tests/integration/ai-provider.test.ts`
cover import parsing, persistence, and the cloud adapter contract.

## Phase 4 — AI clip discovery  `[x]`

`AIProvider` abstraction (OpenAI-compatible + Anthropic + offline heuristic),
prompt template layer, segment-ID-constrained JSON output, zod validation,
timestamp derivation from real transcript segments (impossible-timestamp
rejection), overlap deduplication into "moments" with variations, candidate UI
cards with reason/hook/excerpt.

**Acceptance**: long transcript yields multiple meaningful candidates with
timestamps/transcript/title/hook/reason; no invented timestamps. →
`tests/integration/ai-provider.test.ts` (mock AI server) +
`tests/unit/candidates.test.ts` (validation/dedup).

## Phase 5 — Performance audit  `[x]`

Scoring pass (separate from discovery): hook / context completeness / clarity
/ retention / emotional impact / standalone value / shareability / visual
suitability + overall estimate + "why this score" explanation. UI shows
dimension breakdown, explicit "AI estimate, not a guarantee" labeling, and
which provider produced the estimate (AI vs local heuristic).

**Acceptance**: each candidate shows transparent dimensions + explanation. →
schema + aggregation tests; UI verified via preview.

## Phase 6 — Vertical composition  `[x]`

Crop modes (center/top/bottom/manual focus-X + zoom), 1080×1920 composition,
caption engine (segmentation, word timing, 50 built-in presets across 10
categories, emphasis), ASS + SRT generation, clip thumbnails.

**Acceptance**: landscape source converts to readable vertical clip. →
`tests/unit/captions.test.ts` and `tests/integration/videoengine.test.ts`
(real FFmpeg renders with output probing).

## Phase 7 — Clip editor  `[x]`

Video preview with live caption overlay + crop guide, timeline (playhead,
draggable in/out handles), keyboard shortcuts (space, I/O, arrows), caption
text editing, crop controls, caption style controls, metadata editing,
save (no re-transcription on trim — only changed fields persist).

**Acceptance**: user shortens/extends clip and renders new range without
re-running transcription. → verified in preview +
`tests/integration/pipeline.test.ts`.

## Phase 8 — Render engine  `[x]`

FFmpeg pipeline (trim → timeline layers → reframe → captions → mixed audio →
encode), temp-file + atomic rename, `-progress` streaming progress, cancellation,
retry, render queue with configurable concurrency, failure reports with
stage + likely causes + technical details, open-output-folder.

**Acceptance**: modified clip produces playable MP4; failed render leaves no
corrupt "finished" file. → `tests/integration/pipeline.test.ts` and
`tests/integration/videoengine.test.ts`, including a forced-failure case.

## Phase 9 — Content packaging  `[x]`

Title/description/hashtags/CTA generation (AI, editable), platform presets
(TikTok / Reels / Shorts / Generic), copy-to-clipboard, export bundles
(`NN_slug.mp4` + `.txt` + `.json`), filename sanitization.

**Acceptance**: user copies polished metadata without manual reconstruction. →
`tests/integration/pipeline.test.ts` and `tests/unit/filenames.test.ts`.

## Phase 10 — Polish & hardening  `[x]`

Error surfaces (what/why/what-now), interrupted-job recovery on startup,
storage panel (project/cache/render sizes, free space, cleanup with
confirmation), diagnostics export (no secrets), accessibility pass
(focus states, labels, keyboard nav), app/version + schema version reporting,
edge cases (missing audio, unsupported codec, malformed AI JSON, cancelled
renders, long names/transcripts).

## Phase 11 — Local speaker diarization and audio restoration  `[x]`

Optional on-device speaker grouping for existing transcript turns, user
correction/renaming, and explicit non-identity labeling; no cloud audio path.
Non-destructive per-clip audio-restoration presets with before/after samples,
shared FFmpeg filter composition, and persisted settings. The optional voice
model may need an initial download; processing then runs locally.

**Acceptance**: speaker assignments persist and can be corrected; restoration
samples compare original vs filtered audio; render filters only apply when a
preset is selected. Covered by schema/database and restoration-preview/render
integration tests, unit tests, and local-helper syntax validation.

## Deferred (explicitly out of MVP)

Semantic search, face-aware/speaker-tracking crop, B-roll suggestions, batch
"make 20 clips", learning loop, cloud sync, auto-publishing. Data model leaves
room for these — see `DECISIONS.md`.

## Manual test run book (Windows 11, target machine)

1. `npm install && npm run dev` (or install the built NSIS package).
2. First-run: verify dependency board shows FFmpeg ✓, database ✓, providers.
3. Create project → import an MP4 podcast/interview (≥ 5 min, with audio).
4. Transcribe with configured provider (or import an existing SRT).
5. Analyze → review candidates, audit scores, reasons.
6. Create clip from a candidate → editor: trim, pick caption style, adjust crop.
7. Render → preview result → export bundle → copy description.
8. Close app mid-render → relaunch → recovery prompt appears → resume/restart.
