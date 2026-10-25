# Chapter 8: The Timeline Engine

**Draft v1, 25 October 2026.** This chapter is **[GENERAL]** and **[PROPOSED]** engineering. It is not a description of CapCut's internals, which are **[UNKNOWN]**. CapCut-specific behavior (what the timeline shows and allows) belongs to Chapters 2-4 and is still outstanding.

---

## 8.1 Time domains

Four different "times" must never be mixed.

| Domain | Meaning | Example |
|---|---|---|
| Source time | Position inside the original media file | 00:03:12.000 in interview.mp4 |
| Clip-relative time | Offset from the start of the clip | 5.0 s into the clip |
| Timeline (project) time | Position on the timeline | 00:01:30:00 |
| Display timecode | Formatted label for timeline time | "00:01:30:00" |

**Representation [PROPOSED]:** store time as integer *ticks* with a fixed timebase, for example 1/240000 s (divisible by 24, 25, 30, 50, 60 and by the 1001-based rates well enough to round predictably). Alternative: rational (numerator, denominator). Floats are not acceptable for stored times. Frame boundaries are derived: `frame_index = floor(t * fps_num / (fps_den * ticks_per_second))`.

## 8.2 Core entities

```text
Timeline { frame_rate, tracks[] , duration (derived) }
Track    { id, kind: video|audio|text, order, locked, hidden, muted, clips[] }
Clip     { id, asset_id, timeline_start, source_in, source_out, speed, link_group?, ... }
```

Derived values:

- `duration_on_timeline = (source_out - source_in) / speed`
- `timeline_end = timeline_start + duration_on_timeline`

Invariants to enforce:

1. `source_in < source_out`, both within the asset's duration.
2. `speed > 0` (reverse is a separate flag, not negative speed).
3. On a single non-overlay track, clips do not overlap (unless the design defines transitions as overlaps).
4. `timeline_start >= 0`.
5. All times are multiples of one frame at the project rate for frame-accurate edits.

## 8.3 Time conversion

```text
function timeline_to_source(clip, t):
    # t is timeline time, clip.timeline_start <= t < clip.timeline_end
    offset = t - clip.timeline_start
    if clip.reverse:
        return clip.source_out - offset * clip.speed
    return clip.source_in + offset * clip.speed
```

**Variable speed (speed curves):** replace `offset * speed` with the integral of the speed function. Precompute a monotonic lookup table from timeline offset to source offset. Evaluate by binary search plus interpolation.

**Edge cases:** at `t == timeline_end` the result is out of range; the active-clip query must use a half-open interval `[start, end)`.

## 8.4 Worked examples

**Setup:** asset 0-60 s. Clip A: `source_in=10`, `source_out=20`, `speed=1`, `timeline_start=5`.
So timeline_end = 5 + 10 = 15.

| Operation | Result |
|---|---|
| Split at timeline 9 | A1: in=10, out=14, start=5, end=9. A2: in=14, out=20, start=9, end=15. Source continuity preserved; no media copied |
| Trim right edge to timeline 12 (from A) | out = 10 + (12-5)*1 = 17, end=12 |
| Trim left edge to timeline 8 | in = 10 + (8-5)*1 = 13; start=8 |
| Speed to 2x | duration_on_timeline = 10/2 = 5, end=10 |
| Move to start=20 | Only timeline_start changes; source range unchanged |

Splitting never alters the asset. Trimming only changes source_in/out and timeline start/end. This is what makes editing non-destructive.

## 8.5 Split algorithm

```text
function split(clip, t):
    require clip.timeline_start < t < clip.timeline_end
    require t is on a frame boundary
    src_t = timeline_to_source(clip, t)
    left  = copy(clip); left.source_out = src_t
    right = copy(clip, new id); right.source_in = src_t; right.timeline_start = t
    copy keyframes: partition by time; add boundary keyframes at t so animation continues smoothly
    replace clip with [left, right] on the same track
    if linked: split all members of the link group at the same t
```

Edge cases: split at a boundary does nothing; effects with a single instance spanning the clip need a policy (duplicate to both halves, or keep on one); transitions attached to the clip's ends stay with the correct half.

## 8.6 Trim and move

```text
function trim_right(clip, new_end):
    new_end = snap_to_frame(new_end)
    max_end = clip.timeline_start + (asset.duration - clip.source_in)/clip.speed
    clamp new_end to (clip.timeline_start + 1 frame, max_end)
    clip.source_out = clip.source_in + (new_end - clip.timeline_start) * clip.speed

function move(clip, new_start, mode):
    new_start = snap_to_frame(new_start); clamp >= 0
    if mode == OVERWRITE:   remove or trim overlapped clips on target track
    if mode == INSERT:      shift clips at/after new_start right by clip duration
    if mode == REJECT:      refuse if overlap
    apply to link group; if undoable, record all affected clips
```

## 8.7 Edit modes

| Mode | Behavior |
|---|---|
| Overwrite | New material replaces whatever is underneath |
| Insert | Material is placed and later material shifts right |
| Ripple delete | Removing a clip also closes the gap (shifts later clips left) |
| Roll | Moves the cut between two adjacent clips; one grows, the other shrinks; total length unchanged |
| Slip | Changes which part of the source a clip shows without moving it or changing its length |
| Slide | Moves a clip and adjusts neighbors' lengths |

Which of these CapCut Desktop offers is **[UNKNOWN]** here; treat them as general NLE vocabulary.

## 8.8 Tracks, layers, compositing order

- Video tracks stack: higher order draws over lower.
- Audio tracks mix additively.
- Text/overlay items are typically video-like layers.
- Hidden track: excluded from output (a "preview only" hide is a design choice; define it).
- Muted: excluded from audio only. Locked: rejects edits but still plays.

## 8.9 Linked clips and sync

A link group ties clips (typically video plus its audio) so move, split, and delete apply together. Allow temporary unlink. Track a **sync offset** visually if linked clips are moved apart.

## 8.10 Snapping

Snap targets: playhead, clip edges, markers, timeline start/end. Algorithm: during drag, compute candidate positions of the dragged clip's edges; find the nearest target within a pixel threshold (converted to time using the current zoom); snap if found. The threshold is in pixels, so snapping strength changes with zoom.

## 8.11 Transitions and overlaps

Two modeling options:

1. **Overlap model:** adjacent clips overlap by the transition duration; the transition is a property of the overlap region.
2. **Handle model:** the transition is an object between clips that needs "handles" (extra source media beyond each cut).

Handle availability limits maximum transition duration. If a clip has no spare source at its end, the transition must be shortened or the last frame frozen.

## 8.12 Nested sequences / compound clips

A compound clip is a timeline embedded as a clip. Requires recursion in evaluation, cycle prevention (a sequence cannot contain itself), and a rule for frame-rate mismatches. High complexity; defer.

## 8.13 Active-clip query

```text
function active_clips(timeline, t):
    result = []
    for track in tracks sorted by order:
        if track.hidden: continue
        clip = track.index.find(t)     # interval lookup
        if clip: result.append((track, clip, timeline_to_source(clip, t)))
    return result
```

**Data structure:** per track, keep clips sorted by start; use binary search. For overlays that may overlap on one track, use an interval tree. Rebuild or update the index on every edit command.

## 8.14 Frame-accurate placement

All edit operations round to frame boundaries of the *project* rate. A source with a different rate maps each project frame to the nearest source frame (or blends). State the rounding rule once and use it everywhere, including in export.

## 8.15 Zoom and scrolling

Store `pixels_per_second` and `scroll_offset_ticks`. Convert: `x = (t - scroll) * pps`. Draw only visible clips. Level-of-detail: at low zoom, draw coarse thumbnails and downsampled waveforms; at high zoom, per-frame ticks.

## 8.16 Large projects

- Virtualize UI drawing (only visible clips).
- Index clips per track.
- Keep expensive derived data (thumbnails, waveforms) in caches keyed by asset and time range, computed in background workers.
- Make edit commands O(log n) per clip where possible.
- Avoid whole-project copies for undo; store deltas (Chapter 16).

## 8.17 Edge cases and tests

| Case | Expectation |
|---|---|
| Clip of 1 frame | Cannot be split; can be moved |
| Split on the playhead exactly at a clip boundary | No-op, with feedback |
| Trim beyond media end | Clamp |
| Speed change near end of media | Clip clamps or user is warned |
| Overlapping on a locked track | Rejected |
| Link group where one member is locked | Define: reject whole operation |
| Move to negative time | Clamp to 0 |
| Fractional frame rate project | Frame math exact (rational) |

## What a Future Coding Agent Must Understand

- Keep four time domains separate; use exact integer/rational time.
- Editing changes *references and ranges*, never source files.
- Define half-open intervals, frame rounding, and invariants once, then enforce in a single command layer.
- Index tracks for fast "what is visible at t" queries; both preview and export use the same query.
- Decide the transition model (overlap vs handle) early.
- **Verified:** none of the CapCut-specific behavior; this is a general model.
- **Read next:** Chapters 7, 9, 10, 16, 23, 24.
