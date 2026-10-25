# Render Pipeline

Rendering is FFmpeg-driven, fully local, and happens in a spawned subprocess —
the UI never blocks and never runs FFmpeg synchronously. The same immutable
render plan is used for the export job, and the final file is probed before it
is marked complete.

## Binary resolution

`Settings → Advanced` override → system `PATH` → bundled FFmpeg/FFprobe. The
active binary paths and versions are shown in Settings and diagnostics. If no
usable binary is found, rendering is disabled with an actionable error (not a
crash).

## Render plan

The plan is constructed in `src/main/services/rendering/plan.ts` from the
clip, project, settings, transcript, timeline, and project media assets.

1. **Choose output geometry and encoding.** Aspect ratio and the selected
   resolution tier determine even output dimensions; quality and FPS determine
   the codec arguments and normalization filters. A quick preview render uses
   the 720p draft profile.
2. **Resolve kept source ranges.** With no silence cuts, a single source range
   is sought and trimmed. When cuts are enabled, each kept interval is sought
   separately, processed with the same framing, then joined with a video/audio
   concat. The plan records the post-cut output duration.
3. **Reframe the base video.** The crop, fit, tracked-crop, or camera-keyframe
   path produces the selected aspect ratio and resolution. A fixed FPS filter
   normalizes variable-frame-rate sources.
4. **Composite timeline media.** Image and video layers are overlaid in track
   order at their timeline positions. Timeline audio and audio carried by video
   assets are mixed with the source audio when enabled.
5. **Burn text and captions.** Text layers and word-timed captions are emitted
   as ASS files; source-time cues are remapped over silence cuts before being
   burned into the composed video.
6. **Encode and validate.** Output is written to a temporary file, then probed
   for a video stream, target dimensions, duration, and frame rate. Only a
   validated file is atomically renamed to its final path.

## Audio restoration

Each clip has an `off`, `light`, `standard`, or `strong` non-destructive voice
cleanup preset. The renderer applies a high-pass filter and FFmpeg's adaptive
`afftdn` denoiser to the original source track; the existing EBU R128 loudness
normalizer, when enabled, follows those filters. The imported source file is
never rewritten, and added timeline music/effects are not denoised. The editor
can generate matching 12-second before/after WAV samples from the clip in-point
for A/B listening. These regenerable `.tmp.wav` samples live in the project's
cache and are eligible for stale-temporary cleanup after 24 hours.

## Timeline layers and preview/export parity

Timeline edit timing uses shared helpers in `src/shared/video/time-map.ts`
and `segments.ts`; the editor and render planner both use this mapping for
speed changes and silence-cut remapping.

- **Video and image overlays** use each item’s start/end, position, scale,
  rotation, opacity, speed, and track stacking order. Still-image PTS is
  shifted to the overlay’s output-timeline start before the `overlay` filter
  applies its time window. Without that PTS shift, FFmpeg would see the image
  stream end before its window opened and omit the picture that remained
  visible in the editor.
- **Audio items and video-asset audio** honor the item and track mute flags,
  speed (`atempo`), volume, and fades. Fade durations are interpreted in
  timeline time, matching the editor model. `adelay` is emitted once per
  channel for compatibility with the bundled FFmpeg version.
- **Mixing** combines unmuted timeline audio with the source track when one is
  present, then trims to the post-cut output duration. Source audio
  normalization follows the project’s video settings.
- **Silence cuts** remap overlay timing and caption/text cues onto the kept
  output timeline; media assets stay aligned with their original source-time
  positions around removed ranges.

The planner has an FFmpeg integration test for layered media across silence
cuts, and the image-overlay correction was additionally checked against an
actual before/after render. This is targeted evidence, not a claim that every
possible timing, speed, mute, and fade combination has exhaustive pixel/audio
comparison coverage; see `QA_REPORT.md` for the current verification limits.

GPU acceleration: encoder probing looks for `h264_nvenc`, `h264_qsv`,
`h264_amf`, and `h264_videotoolbox`. Auto mode falls back to CPU when hardware
encoding is unavailable; hardware-only mode reports a specific error. CPU
encoding remains available.

## Safety properties

- **Atomic completion**: output is written to `<id>.tmp.mp4`; only a zero-exit
  FFmpeg run that passes FFprobe validation is renamed to `<id>.mp4` and
  recorded as `completed`. A failed or cancelled render leaves no corrupt
  finished file; temporary output is cleaned up.
- **Non-destructive**: source media is only read.
- **Cancellation and timeouts**: cancellation sends `SIGTERM`, then escalates
  to `SIGKILL` after 1.5 seconds if needed. A subprocess timeout is reported
  separately from user cancellation.
- **Disk-space check**: free capacity is checked before work is queued, with a
  safety margin based on the estimated output size.
- **Progress**: `-progress pipe:1 -nostats` is parsed into normalized progress
  and stage updates, streamed over the event bus and persisted (throttled).
- **Failure attribution**: render stages and the FFmpeg stderr tail are
  retained for actionable failure reports.
- **Retry**: a retry reuses the render’s settings snapshot.

## Render queue

- Concurrency is configurable (default **1**) to avoid saturating CPU and disk.
- States include queued, preparing, rendering, completed, failed, and
  cancelled; startup recovery marks interrupted jobs for explicit user action.
- Render and task state is persisted in SQLite.

## Caption and text rendering

- Caption ASS is generated by `src/shared/captions/ass.ts`; timeline text
  layers use `src/shared/captions/text-ass.ts`. Both write to the render’s
  temporary project render directory and are cleaned with the job.
- The caption catalog contains **50 presets across 10 categories**. Style
  controls include font, size, position, emphasis, casing, colors, box
  opacity, outline, shadow, cue timing, and text edits.
- Word-level emphasis is timed from transcript word timestamps, with
  proportional timing as a fallback when word timings are absent.
- Inter, IBM Plex Sans Condensed, and Source Serif 4 OFL font files are passed
  through FFmpeg’s `fontsdir` option. See `FONT_LICENSES.md`.
- The editor preview and renderer share caption segmentation and style data;
  visual rasterization can still differ slightly due to browser/Libass
  anti-aliasing.
- SRT sidecar export is available for platforms that prefer separate captions.
