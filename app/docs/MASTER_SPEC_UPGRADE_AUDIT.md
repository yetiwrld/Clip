# Clipwright Studio master spec upgrade audit

Audit date: 2026-09-28; follow-up updated 2026-10-01  
Requested references: `clipwright_studio_unified_master_spec.md` and `ui-ux-design-guide-for-ai.md`. Neither file is present in the current checkout or the supplied source archive as of 2026-10-01.  
Scope: architecture and feature comparison based on the available code, repository documentation, and the user's stated requirements. This is not a line-by-line verification against the missing reference documents.

## Preservation constraints

- The current editor is an established product with persisted project databases and user media. Upgrades must be additive, preserve existing rows and files, and keep old projects readable.
- The repository directory has no `.git` metadata. This audit therefore cannot identify uncommitted user edits or make a reliable before/after Git diff. No project database, imported media, or settings were modified for this audit.
- The master spec requires phased acceptance, preview/render parity, and testing of workflows; a passing build alone does not establish feature completion.

## Current architecture map

| Area | Current implementation | Master-spec status |
|---|---|---|
| Desktop shell and API | Electron main/preload, React renderer, schema-validated IPC; browser preview server reuses the backend services | Implemented foundation |
| Project persistence | SQL.js database, forward-only migrations, project/source files under workspace, repository/service boundaries | Implemented; project state is split among project, transcript, candidate, clip, task, asset and render records |
| Edit model | `Project`, `Clip`, `ClipTimeline`, caption/text layers and camera data are typed; `ProjectDocumentV1` now provides a versioned aggregate for editor hydration while normalized SQL records remain persistence source | Partial: aggregate is read-only; mutations still use existing services and records |
| Time and mapping | Most edit times are floating-point seconds; source-range clips and cut ranges are used; shared kept-segment functions are consumed by preview and renderer | Partial: source/project time are not represented as distinct canonical types; no general speed/time-remapping engine |
| Timeline | Active editor uses `MultiTrackTimeline`; it supports video/audio/image assets, trim/move/split, captions, text, camera/tracking markers, silence ranges, selection, snapping and undo/redo for timeline data | Partial: a separate per-clip edit model remains; `Timeline.tsx` is an unreferenced legacy implementation; advanced roll/slide/slip/ripple, markers and track groups are not represented as complete workflows |
| Preview and composition | Editor preview applies crop/aspect, fit/fill, camera keyframes, captions/text and timeline media; FFmpeg plan applies corresponding supported features | Partial: there is no universal composition graph for arbitrary effects, masks, blend modes, transitions or nested sequences |
| Audio | Multiple audio/video asset layers, volume, fades, speed, mute, waveform and FFmpeg mixing exist | Partial: panning, ducking, loudness meters and a project-wide mixer model are absent or not complete |
| Captions | Transcript segments/word timings, style presets and overrides, timed text layers, cue edits, captions in preview and burned-in render | Implemented foundation; animation/emphasis/position/style separation is partial, and exhaustive caption remap workflows need end-to-end validation |
| AI | Local/cloud transcription, moment analysis, editable candidates, silence detection and subject tracking are integrated into project workflows | Implemented foundation; visual scene analysis and unified editable AI proposal/undo model are partial |
| Persistence and history | Autosave-by-operation and a timeline undo/redo stack exist; render fingerprints mark stale outputs | Partial: undo/redo is not a single command log spanning all edit types; version snapshots/recovery are not a full project history system |
| Render/export | FFmpeg render plan consumes clip settings, captions, silence cuts and media timeline layers; temp output is finalized atomically; queue and cancellation exist; export checks a render fingerprint | Implemented for current feature set; it cannot render spec features that do not exist in the data model |
| Design system | Graphite/orange tokens, Inter, spacing tokens, reusable controls, focus-visible styling, keyboard support and responsive breakpoints exist | Strong foundation; some dense controls are smaller than accessible touch targets; at narrow editor widths the inspector is hidden rather than reachable through an alternate panel |
| Tests | Unit and integration suites cover schemas, time/crop/captions, database, asset timeline and FFmpeg rendering | Good foundation; spec-level end-to-end combinations and reopen/edit regression coverage remain incomplete |

## Existing design-system principles and product requirements

The requested UI/UX source document was not available for direct inspection. The following observations come from the current application and user-stated goals; they should not be treated as proof of compliance with the missing document.

- Retain Clipwright's restrained graphite-and-orange visual identity and existing spacing tokens unless the user-provided guide specifies otherwise.
- Preserve the pro-editor hierarchy: tool/media navigation at left, preview in the center, contextual inspector at right, timeline below.
- Prioritize accessibility and responsive reachability; editor inspector access at narrow widths and small dense controls need targeted review.
- Continue using existing components and patterns. Avoid ornamental motion, extra accent colors, or controls without real behavior.

## Highest-priority gaps against the master spec

1. **Canonical state and command boundary:** editor changes currently span clip updates and a separately persisted clip timeline. There is no project-wide command/history boundary that all preview, persistence, AI actions and rendering consume.
2. **Time system:** timestamps are generally unbranded seconds. Silence-removal mapping is shared, but speed changes, caption mapping, keyframes and general source-to-project mapping do not yet share a complete canonical time map.
3. **Feature claims versus render support:** current UI should expose only controls backed by both project state and renderer behavior. Generic effect stacks, masks, blend modes, transitions, nesting, stabilization and AI super-resolution are not present as complete end-to-end features.
4. **Professional editor reachability:** improve narrow-window inspector access and keyboard/accessibility semantics without reducing the main timeline or displacing current panel ownership.
5. **System-level acceptance:** add repeatable workflows for edit → preview → render comparison and save → close → reopen, including timeline assets, keyframes, captions and audio.

## Upgrade order and safety gates

1. Keep this audit as the baseline; verify workspace/project-data backups before schema changes.
2. Add pure, tested project-time/source-time mapping helpers and adapt existing preview/render code to them before introducing new data fields.
3. Introduce an additive versioned project/sequence representation and migration readers while retaining the current schema as a compatibility path. Do not delete old fields until real projects round-trip successfully.
4. Route existing edits through shared edit commands and then extend history to cover clip, timeline, caption, camera and audio changes.
5. Fill missing renderer behavior only after the corresponding data and preview behavior exist; keep unsupported tools out of the visible UI.
6. Complete the UI pass after state behavior is stable; verify panel reachability, keyboard use, contrast and click targets.
7. Gate each step on typecheck, unit/integration tests, actual FFmpeg output inspection and a project reopen test. Report unverified hardware/cloud cases separately.

## Verification performed for this audit

- Searched the current checkout and supplied source archive for both requested document names; neither document was present, so no claim of direct document application is made.
- Inspected project structure, shared types, database migrations/repositories, active editor timeline, preview, rendering/export, global design tokens, test layout and existing architecture/QA documentation.
- Confirmed `MultiTrackTimeline` is the active timeline component and the older `Timeline.tsx` has no renderer import/use sites.
- Did not modify the database, media library, project records, or user settings. The compatibility step below changes application code only and is additive.
- `npm test`: passed, **235 tests across 16 files** (full suite; includes real FFmpeg integration tests; 272.28 seconds).

## Phase 1 progress: canonical project model (compatibility step)

Implemented an additive read boundary, without changing the database schema:

- Added `ProjectDocumentV1`, containing the project, media assets, transcript, AI candidates, each clip with its saved timeline, and render history.
- Added `projects.document` to the shared typed IPC contract and the backend.
- Changed editor startup to hydrate its selected clip, transcript, and timeline from the same document response rather than three separate reads.
- Existing project databases require **no migration**. Relational records remain the write/persistence source; task state and transient UI state remain outside the document.
- Added a persistence restart assertion proving the document restores crop values, transcript, and timeline settings after closing and reopening the database context.

This is a migration bridge, not completion of Phase 1: editors still write through the existing clip and timeline operations, and the aggregate is not yet the shared command/write model. Do not add schema fields or move persisted values into a document blob until all existing projects have a tested, lossless adapter.

Verification for this step:

- `npm run typecheck`: passed.
- `npx vitest run --project unit`: passed, 149 tests.
- `npx vitest run --project integration tests/integration/database.test.ts`: passed, 19 tests, including the restart round-trip.
- `npm run build`: passed (main, preload and renderer bundles).

## Phase 2 progress: source/project time mapping

Added `src/shared/video/time-map.ts` as a shared, pure mapping layer for constant-speed timeline items. It owns effective speed bounds, timeline duration/end, timeline-to-asset-source and inverse timestamp mapping, source deltas for timeline edits, and clipped interval mapping. The editor now uses it for synchronized media playback, displayed timeline duration, snapping, and trim/split/duplicate calculations. The FFmpeg planner uses the same interval mapping for media input seek/duration and speed-aware processing.

This remains a partial Phase 2: root clip times are still stored as seconds without source/project branded types; frame rates are still numeric; speed curves and a general source/project map for captions, camera keyframes and silence decisions have not been migrated. Existing saved records remain unchanged.

Verification so far:

- Added tests for 1.5× duration, forward/inverse mapping, range clipping, loop mapping, and out-of-range values.
- `npm run typecheck`: passed.
- `npm run test:unit`: passed, 153 tests.
- `npx vitest run --project integration tests/integration/media-assets.test.ts`: passed, 3 tests, including layered render output.
- `npm run build`: passed (main, preload and renderer bundles).
- `npm test`: passed, **239 tests across 17 files** (full suite with real FFmpeg rendering; 168.51 seconds).

### Phase 2 continuation: frame-rate adapter and frame-relative editing

Added `src/shared/video/frame-rate.ts` as an adapter around the current numeric FPS and seconds-based persistence model. It recognizes common NTSC rates (23.976, 29.97, 59.94 and 119.88) as rational rates, derives frame durations and frame timestamps, and supplies a frame-relative keyframe selection tolerance. Invalid or missing legacy rates default to 25 FPS for editor stepping, matching the existing timeline fallback.

The active editor now uses shared frame duration for keyboard frame stepping and clip in/out minimum spacing. The multi-track timeline uses the same duration for source trim minimums, and editor/timeline camera-keyframe matching now scales with project FPS instead of a fixed 25 ms window. Existing project fields and saved timestamps are unchanged. Silence cut segmentation and caption remapping were already shared by preview/render code; camera keyframes are both stored and rendered against source seconds, with no silence-remapped keyframe cache.

Phase 2 remains open: the database/API still represent times as unbranded numbers; speed curves, sequence nesting and a generalized source/project map for all future edit types do not exist. This continuation does not snap all edits to frames, since doing so would alter existing sub-frame audio and caption timing.

Verification for this continuation:

- Focused timing/render unit tests: passed, 43 tests across 3 files.
- `npm run typecheck`: passed.
- `npm run build`: passed (main, preload and renderer bundles).
- `npm test`: passed, **242 tests across 18 files** (includes real FFmpeg integration cases; 219.30 seconds).

## Phase 3 progress: timeline edit command boundary

Added a pure `src/shared/editor/timeline-commands.ts` boundary for the active timeline and clip fields. Timeline replacements now execute through a typed command, are coalesced into one bounded (50-entry) undo step during rapid edits, and carry redo/undo branches in a tested history model. Keyboard undo ordering uses the timeline history's latest action time so it remains coordinated with the existing clip-field history. Media drops also enter the command history. Clip patches and clip snapshot restores now pass through a pure command executor; the existing clip undo snapshots and debounced persistence are retained. The clip ref is updated synchronously at command dispatch so back-to-back edits don't build from a stale React render.

The renderer still persists through the existing `timeline.save` and `clips.update` IPC operations and normalized tables; no database migration or saved-project rewrite was introduced. This remains a command execution bridge, not a single unified cross-domain command log: captions, camera controls, timeline text layers and clip fields still maintain separate history stacks or command groups, and startup's default-track initialization is still a compatibility write.

Verification for this step:

- Added command tests for clip patch/restore, timeline execution, coalescing, branching, undo/redo and history bounds.
- Focused unit tests: passed, 10 tests across 3 files.
- `npm run typecheck`: passed.
- `npm run build`: passed (main, preload and renderer bundles).
- `npm test`: passed, **246 tests across 19 files** (includes FFmpeg integration cases; 232.25 seconds).

## Responsive inspector and control-target implementation (2026-10-01)

This implementation follows the user's stated reachability/accessibility goals and the application's existing graphite-and-orange design tokens; exact compliance with the unavailable guide remains unverified. At widths up to 680px, the right-side properties inspector opens from a labelled top-bar control and automatically opens when a clip, text layer, caption or AI moment is selected. The drawer has a close control, backdrop dismissal, Escape dismissal and focus restoration. The inspector is no longer unreachable on compact windows.

Compact icon buttons now have a 32px minimum target, timeline keyframe/tracking markers have larger hit areas, and coarse-pointer devices receive 40px icon controls and widened trim handles. The mobile top bar hides nonessential shortcut/status text to preserve access to clip title, undo/redo, export and inspector actions. The palette, editor panel ownership and spacing tokens remain intact.

Verification: `npm run typecheck` and `npm run build` passed. No automated browser/device visual test is configured, so the compact-window layout should still be visually checked in the running app at desktop and narrow widths.

## Follow-up verification (2026-10-01)

This addendum supersedes the audit's earlier suite totals and records fixes made
after the 2026-09-28 baseline; it does not claim the master-spec gaps above
are all closed.

- Latest automated status: **265 tests across 26 files** (176 unit + 89
  integration), with typecheck and production build passing on 2026-10-01.
- The missing 12 static caption TTF faces and OFL licenses are now present;
  the resource paths are served narrowly by the browser and Electron media
  protocols. The faster-whisper Python helper and incompatible AVI fixture are
  also present and contract-tested.
- The renderer client now binds every IPC payload-schema method, including
  `media.checkUrl`; media import contracts return task handles; diagnostics
  report resolved tool paths/sources and total disk capacity.
- `src/shared/video/time-map.ts` supplies constant-speed timeline mapping plus
  shared normalized overlay geometry. Editor preview and FFmpeg use the same
  center anchor, scale/opacity clamps and half-open visibility window. Still
  image PTS is shifted to the mapped output interval, and per-channel delay
  syntax works on the bundled FFmpeg. Integration pixels and plan-level
  assertions cover a real image overlay; exhaustive audio/timing combinations
  remain an acceptance gap.
- Export now captures refs, merges pending clip patches, flushes clip and
  timeline debounce queues, persists the click-time snapshot, and only then
  queues the render. Both save paths are flushed on editor exit.
- The conditional-hook ordering and stale-load state that could blank the
  editor are fixed, with an AST regression guard. Interactive browser
  verification remains pending because this sandbox has no browser runtime.
- Exact asset-reference checking, timeout error classification, nested
  settings recovery, diagnostics/upload checks and the live preview font-path
  smoke check are covered. The dead legacy timeline component is removed; the
  active timeline remains `MultiTrackTimeline`.
- The editor keeps preview as the central workspace; the timeline defaults to
  38% of viewport height (clamped to 220–300 px) and saved/dragged heights are
  capped at 68% of the current viewport. Pure tests cover the responsive and
  persisted-size cases.
- A targeted UI-action pass fixed known duplicate and stale actions; the
  static scan found 186 native JSX buttons with event/form behavior and the
  renderer API map now has a regression check against all 64 IPC schemas.
  This is not a live interaction audit; manual visual/button acceptance remains
  open.

## Follow-up verification (2026-10-02)

- Current automated status is **273 tests across 28 files** (180 unit + 93
  integration); typecheck and production renderer/main build pass.
- Settings now provides reviewable storage cleanup for generated proxies,
  filmstrips, waveform caches, extracted transcription audio, stale temporary
  files, and old `.log` files. It returns only workspace-relative sample paths;
  originals, imported assets, transcripts, edits, completed renders, exports
  and diagnostic JSON are outside the deletion allowlist. Tests cover active
  project jobs, symlink refusal and preservation of user media/output.
- The IPC contract and renderer method map now cover 66 methods, including the
  cleanup scan and run operations; the static native JSX button scan now covers
  190 buttons. Visual UI acceptance remains a Windows/manual check.
- The NSIS x64 installer configuration now uses a branded icon, packages the
  configured runtime resources, and installs Electron before the build. Windows
  Actions run [36946733015](https://github.com/yetiwrld/Clip/actions/runs/36946733015)
  built and uploaded the unsigned setup executable from the source ZIP. The
  local sandbox could not fetch Electron; clean-Windows installation/launch
  and the cleanup UI still need manual verification.
