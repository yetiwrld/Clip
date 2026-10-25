# QA Report — Latest follow-up (2026-10-02)

This follow-up records the low-data URL clipping, local speaker-diarization and audio-restoration
features, timeline/export and editor fixes, safe storage cleanup center,
self-contained Windows installer, Clipwright branding and first-run welcome,
and the v0.0.2 opt-in Windows updater. Historical results
from 2026-09-27 remain below their dated heading; their counts are not current.

## Current result

| Area | Result | Evidence / limitation |
| --- | --- | --- |
| `npm run typecheck` | **PASS** | Node and web TypeScript checks clean |
| Unit tests | **PASS** | 194 tests across 26 files |
| Integration tests | **PASS** | 97 tests across 8 files |
| `npm test` | **PASS** | **291/291** across 34 files |
| `npm run build` | **PASS** | Main 395.55 kB; preload 1.15 kB; renderer 1,235.28 kB JS + 84.18 kB CSS |
| v0.0.4 low-data URL clipping + v0.0.3 speaker diarization/audio restoration | **CODE/BUILD PASS; MANUAL MODEL/UI PENDING** | Speaker editing, local-processing boundaries, restoration presets/filter composition and before/after sample generation have automated coverage; the optional resemblyzer model and visible desktop interaction were not run here |
| v0.0.2 branding, welcome + updater | **CODE/BUILD PASS; DESKTOP VISUAL PENDING** | Logo, welcome guide, update prompt/progress/restart states and update IPC are covered by static/unit checks; v0.0.4 release assets now exist, but a real Windows update cycle still needs a Windows machine |
| IPC map | **PASS** | 66 contract methods, payload schemas, backend handlers and renderer-client methods; includes storage cleanup scan/run |
| Overlay export | **TARGETED PASS** | Regression render samples a red still-image pixel at output t=0.75s; before/after FFmpeg scan also shows ~18,900 magenta pixels per 4×4 sample during its intended window. Not a full edit matrix |
| Timeline edit helpers | **PASS** | Unit coverage verifies speed-aware split, locked-track guards, duplicate/delete, log zoom/fit, and responsive timeline-height defaults plus viewport clamping |
| Timeline interaction/UI | **CODE + BUILD PASS; VISUAL PENDING** | Responsive zoom, fit, filmstrip, track tools, trim handles and keyboard edits compile; manual desktop/narrow-window clickthrough remains outstanding |
| Interface action audit | **TARGETED STATIC + CODE REVIEW** | Fixed observed duplicate event dispatch, empty-clipboard paste, duplicate menu actions, import cancellation/preflight race, rename double-submit and provider-specific retry; a regression scan covers all 199 JSX-native buttons for event/form wiring and checks every generic renderer API mapping against all 66 IPC schemas; full live button-by-button acceptance remains pending |
| Timeline audio | **PARTIAL** | Layered-media/silence-cut render passes; exhaustive speed, mute, fade, and mixed-source waveform parity remains unverified |
| Editor hook ordering | **PASS (static guard)** | AST regression test verifies component hooks precede conditional early returns; stale clip-load state is reset/guarded |
| Editor visual opening | **NOT VERIFIED** | No Playwright/Puppeteer package or browser executable in the sandbox; requires a browser/Windows manual pass |
| Preview server | **PASS (API smoke)** | Current bundle, diagnostics, `system.fontUrl`, and `media.checkUrl` exercised; bundled Inter TTF streams with HTTP 200 while `/etc/passwd` remains 404; upload-origin checks: cross-origin → 403, same-origin → 200 |
| Storage cleanup | **PASS (service tests + type/build)** | Scans allowlisted generated caches/logs; test removes selected proxies, filmstrips, waveforms, extracted audio, stale partials and old logs while preserving originals, imported assets, transcripts, final renders, exports and diagnostic JSON; active projects and symlinked cache paths are protected |
| Windows installer / update feed | **v0.0.4 RELEASE ASSETS PASS; WINDOWS UPDATE CYCLE PENDING** | The [v0.0.4 Release](https://github.com/yetiwrld/Clip/releases/tag/v0.0.4) is published with installer, `latest.yml`, and blockmap. The unsigned installer is attached; no Windows install/update cycle was run in this Linux sandbox. |
| Windows installer run, local Whisper, real cloud endpoint | **NOT VERIFIED** | A clean Windows install/launch smoke test remains; local Whisper needs a Windows Python/model setup; cloud acceptance needs a real endpoint/key |

The code fixes and automated gates are green. Exact preview/export parity,
the visible cleanup flow, and a clean Windows installer install still need the
manual checks listed in `TEST_RESULTS.md` and `RELEASE_CHECKLIST.md`.

---

## Historical QA baseline — Final pass (2026-09-27)

Scope: engineering/usability/integration QA after the professional UI
redesign: code review, button audit, API surface audit, provider hardening,
live end-to-end verification, persistence tests, build/test verification,
Windows run and packaging attempt, and documentation.

Method: claims in this dated baseline were **executed**, not inferred. Live
checks ran through the real backend (`npm run preview:web`, real SQLite +
FFmpeg) via the renderer IPC surface. The only mocks were a localhost
OpenAI-compatible gateway (`scripts/mock-gonka.ts`) standing in for
GonkaRouter, and the localhost provider mock in the test suite.

## Result table

| Area | Result | Evidence |
| --- | --- | --- |
| TypeScript (`npm run typecheck`) | **PASS** | Clean for node + web projects, strict mode |
| Unit tests (`npm run test:unit`) | **PASS** | 96/96 |
| Integration tests (`npm run test:integration`) | **PASS** | 64/64 |
| Combined (`npm test`) | **PASS** | **160/160** (11 files; was 134 before this pass — 26 provider tests added) |
| Build (`npm run build`) | **PASS** | main 194.5 kB, preload 0.5 kB, renderer 877.2 kB JS + 36.9 kB CSS, zero errors |
| Windows package (`npm run dist:win`) | **NOT TESTED to completion** | electron-builder validated config, completed the win32/x64 native rebuild and began packaging, then failed downloading the Windows Electron binary: the QA sandbox blocks the release CDN (`unable to verify the first certificate`). Environmental, not a project defect — must be run once on a normal-network machine. |
| Windows dev run (`npm run dev`) | **NOT TESTED here** | Headless sandbox: no display and the Electron binary CDN is blocked. The identical build pipeline + full backend + renderer are verified via `preview:web` and 160 tests. |
| Project creation | **PASS** | Live API; used by every E2E below; rename/delete/confirmation verified |
| Media import | **PASS** | Live: file import → ffprobe inspection (1280×720/60s), thumbnail, storage accounting; URL import path code-reviewed |
| Transcription (import file) | **PASS** | Live: SRT/VTT/JSON import, 19 segments persisted |
| Transcription (local Whisper) | **NOT AVAILABLE in sandbox** | Provider honestly reports unavailability (Whisper models unreachable — documented environment limit B-002); no silent fake |
| Transcription (cloud/OpenAI-compatible) | **NOT TESTED live** | Requires a real audio-transcription endpoint; chat-completions path is fully tested. Audio upload path code-reviewed only. |
| AI analysis | **PASS** | Live via OpenAI-compatible gateway: 2 candidates, 8 audit dimensions, overall scores; heuristic path live-verified in earlier session + unit tests |
| Moments | **PASS** | Grouping into moments, variations, reject flow, stale-candidate error (`CANDIDATE_NOT_FOUND`), duplicate-submit guard added |
| Clip creation | **PASS** | Live, idempotent (existing clip returned), correct candidate→clip mapping |
| Editor | **PASS** | Live round-trip: trim (+ invalid range rejected `CLIP_RANGE_INVALID`), caption style + 5 overrides, crop mode/focus/zoom + aspect ratio, metadata edits — all persisted; render with edited config produced exactly **1080×1350 (4:5)** |
| Rendering | **PASS** | Multiple live renders completed (9:16 and 4:5); queue states queued→preparing/rendering→completed and →failed covered by integration tests; cancel/retry covered; startup recovery verified (interrupted tasks surface after crash/restart) |
| Export | **PASS** | Live: `exports/<project>/01_slug.mp4 + .txt + .json` produced and listed |
| OpenAI-compatible API | **PASS** | 37 automated tests (wire format, base-URL variants incl. `/v1` + trailing slash + full-endpoint, Bearer/x-api-key/both headers, model-ID passthrough `zai-org/GLM-5.3-Flash`, 401/403/404/429/5xx mapping, 200-with-error, empty content, legacy `choices[0].text`, content arrays, non-JSON bodies, response_format fallback on 400 **and** 422, JSON repair) + live workflow test + live provider-test matrix (no key / wrong key 401 / unreachable / malformed URL / valid) |
| GonkaRouter compatibility | **Compatible + mock-verified; LIVE NOT TESTED — key not configured** | Documented endpoint `https://api.gonkarouter.io/v1`; Bearer default + optional `x-api-key`/both header styles (GonkaRouter accepts both); `/v1` + `/chat/completions` construction verified by tests; full workflow verified against the standards-faithful mock gateway. No real GonkaRouter key exists in this environment, so a live request has not been made — **enter your key in Settings → AI → Test connection to complete this row.** |
| Button audit | **PASS** | Systematic extraction: **76 buttons / 76 wired** (zero dead: no missing onClick, no placeholder handlers, no nonexistent API methods — cross-checked all 46 IPC methods: every renderer call ↔ contract ↔ payload schema ↔ backend handler). Action order reviewed per screen: destructive actions last and separated; primary actions right; loading states on all expensive ops |
| Forms | **PASS** | Settings persistence verified live incl. **partial provider patches** (bug found & fixed — see B-010); invalid input rejected with field-level messages (base URL protocol, token range, temperature range, trim ranges); password field for keys; masked hints |
| Persistence | **PASS** | Full app restart test: settings, API key, project, transcript, candidates + scores, clip + metadata, render job all survived; provider test still passing after restart |
| Error handling | **PASS** | Live matrix: 401/403/404/429/5xx, 200-with-garbage, empty responses, unreachable endpoint, malformed URL, invalid trim, delete-during-import (B-008 regression kept green); structured errors with code + hint + expandable technical details; no raw TypeErrors surfaced |
| API key security | **PASS** | Key never in renderer state (masked hints only), never in logs (grepped), never in exported diagnostics (grepped, 0 occurrences), never in error strings; `secrets.json` mode 0600; OS keychain encryption where available |
| Accessibility | **PASS** | 0 icon-only buttons without labels (audit script); global `:focus-visible` styles; ARIA roles on switch/slider/progressbar/dialog; keyboard: full nav, timeline handles arrow-key nudge (+Shift coarse), space/I/O editor shortcuts, Esc closes dialogs |

## Bugs found and fixed in this pass

1. **B-010 (critical, forms)** — `settings.update` merged patches only one
   level deep, so the AI provider form's partial patches (e.g. changing only
   the base URL) replaced the whole `ai.openai` object and failed schema
   validation: **no provider setting could be saved from the UI**. Fixed with
   a two-level merge + regression test (partial patch preserves siblings).
2. **Provider test was superficial** — reported success on any HTTP 200.
   Replaced with a real service (`src/main/services/ai/test.ts`): sends
   `Reply with exactly: pong`, verifies the model actually answered, measures
   latency, echoes endpoint/model, maps 401/403/404/429/5xx to specific
   messages. 8 dedicated tests + live matrix.
3. **Weak response validation** — a 200 response without message content was
   silently returned as raw JSON. Now: `AI_PROVIDER_INVALID_RESPONSE` with
   diagnostics (finish_reason hint for max-token cutoffs, embedded
   `error` objects surfaced, legacy `choices[0].text` accepted, non-JSON
   bodies rejected with a clear message).
4. **Single auth header** — OpenAI-compatible requests were Bearer-only.
   Added a per-provider **API key header** setting (Bearer / x-api-key /
   both), default Bearer — no behavior change for existing providers,
   flexible for gateways that require `x-api-key` (GonkaRouter documents both).
5. **JSON-mode fallback gaps** — retried without `response_format` only on
   400 and lost the cancel signal on retry. Now also 422, signal preserved.
6. **Base URL schema hole** — `z.string().url().or(z.string().max(200))`
   accepted any string. Now: empty or a complete http(s) URL, with the field
   name in the error message.
7. **Double-submit windows** — Analyze and Export could be double-triggered;
   both now guard against in-flight operations.

## Not yet verified (honest list)

| Item | Reason |
| --- | --- |
| GonkaRouter **live** request | No GonkaRouter API key in this environment. Everything up to the live call is tested (mock gateway + tests). User action: Settings → AI → paste key → Test connection. |
| `npm run dist:win` to completion | Sandbox blocks the Electron win32 binary CDN (TLS interception). Packaging pipeline itself validated up to the download. Run on a Windows machine. |
| `npm run dev` desktop launch | Headless sandbox (no display, no Electron binary). |
| Local Whisper transcription | Whisper model downloads blocked in sandbox; provider reports unavailability honestly. |
| Local speaker diarization | Optional `resemblyzer` model was not installed/downloaded in this environment; helper syntax and service contracts pass. |
| v0.0.4 Windows update cycle | Release assets are published; install v0.0.3 on Windows, approve the v0.0.4 download, and verify restart/install and workspace preservation. |
| Cloud (audio) transcription | Needs a real audio-transcription endpoint; not exercised live. |
| Pixel-level visual review | No browser/screenshot automation in sandbox; UI verified via build + code review + preview interaction at the API level. Final visual pass belongs to the desktop run. |

## How to re-run the verification

```text
npm install
npm run fixtures
npm run typecheck
npm test                      # 291/291 (v0.0.4, 2026-10-02)
npm run build
npm run preview:web           # http://localhost:8787 — browser preview (manual UI verification required)
npx tsx scripts/mock-gonka.ts # optional: offline AI provider for trying the AI workflow
```
