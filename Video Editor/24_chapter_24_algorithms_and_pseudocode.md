# Chapter 24: Algorithms and Pseudocode

**Draft v1, 25 October 2026.** Language-independent pseudocode for **educational reference only**. **[PROPOSED]**; not CapCut's implementation and not a codebase. Each entry lists inputs, outputs, assumptions, edge cases, and user-experience impact. Time values are integer ticks (Chapter 8). Entities as in Chapter 23.

---

## 24.1 Import and probe a media file
**Inputs:** path. **Outputs:** Asset or typed error.
```text
function import_file(path):
    if not readable(path): return Error(PermissionOrMissing, path)
    info = probe(path)                       # demux, list streams
    if info.error: return Error(info.kind, path)
    asset = Asset(id=new_id(), source=make_paths(path), streams=info.streams,
                  duration=info.duration, fingerprint=fingerprint(path), status=ok)
    if duplicate_exists(asset.fingerprint): ask_user_policy()
    registry.add(asset)
    jobs.enqueue(Thumbnails(asset), Waveform(asset), priority=visible)
    return asset
```
Assumptions: probing is fast. Edge: no video and no audio stream, zero duration, rotation tags. UX: asset appears immediately; thumbnails fill in.

## 24.2 Create a clip from an asset
```text
function make_clip(asset, timeline_start, source_in=0, source_out=asset.duration):
    require 0 <= source_in < source_out <= asset.duration
    clip = Clip(id=new_id(), asset_id=asset.id, timeline_start, source_in, source_out, speed=1)
    if asset.has_audio and asset.has_video: create linked audio clip with same fields; set link_group
    return clip(s)
```
Edge: still images need a default duration; audio-only assets go on audio tracks.

## 24.3 Time conversion
```text
function timeline_to_source(clip, t):           # clip.start <= t < clip.end
    off = t - clip.timeline_start
    return clip.reverse ? clip.source_out - off*clip.speed : clip.source_in + off*clip.speed
function clip_end(clip): return clip.timeline_start + (clip.source_out - clip.source_in)/clip.speed
```
Variable speed: use a precomputed monotone map. Edge: half-open interval; rounding to the frame grid.

## 24.4 Split at the playhead
```text
function split(clip, t):
    require clip.start < t < clip_end(clip) and on_frame_grid(t)
    s = timeline_to_source(clip, t)
    L = copy(clip, source_out = s)
    R = copy(clip, new_id, source_in = s, timeline_start = t)
    partition keyframes at (t - clip.start); add boundary keys
    for each linked member m: split(m, t)
    return command([replace clip with L, R])
```
UX: both halves keep appearance; selection policy defined (e.g., select right).

## 24.5 Trim
```text
function trim_start(clip, new_start):
    new_start = snap_frame(new_start)
    clamp new_start to [max_left_extent, clip_end(clip) - 1 frame]
    delta = new_start - clip.start
    clip.source_in += delta * clip.speed ; clip.timeline_start = new_start
    shift keyframes by -delta
```
(`trim_end` symmetric.) Edge: cannot extend beyond media; neighbor collision handled by mode (overwrite, reject, ripple).

## 24.6 Move
```text
function move(clips, delta, target_track, mode):
    candidate = shifted copies, clamped >= 0, snapped
    conflicts = overlaps with other clips on target
    if conflicts:
        switch mode: REJECT -> return Error ; OVERWRITE -> trim/remove conflicts
                     INSERT -> shift later clips right by span
    return command(all changes)                # one undo step
```

## 24.7 Apply a clip transformation
```text
function transform_matrix(c, t):
    pos = eval(c.position, t); sc = eval(c.scale, t); rot = eval(c.rotation, t); a = c.anchor
    return Translate(pos) * Rotate(rot) * Scale(sc) * Translate(-a)
```
Crop before this; flips as negative scale. Preview and export call the same function.

## 24.8 Evaluate keyframes
```text
function eval(prop, t):                         # t clip-relative
    ks = prop.keys
    if empty: return prop.default
    if t <= ks[0].time: return ks[0].value
    if t >= ks[-1].time: return ks[-1].value
    i = binary_search(ks, t)                    # ks[i].time <= t < ks[i+1].time
    u = (t - ks[i].time) / (ks[i+1].time - ks[i].time)
    return interpolate(ks[i], ks[i+1], ease(ks[i].interp, u))
```
Edge: duplicate times (reject at edit time), rotation wrap, hold interpolation.

## 24.9 Clip timeline position and active clips
```text
function active_clips(timeline, t):
    out = []
    for track in tracks sorted by order:
        if track.hidden: continue
        for clip in track.index.query(t):       # interval query, [start, end)
            out.append((track, clip, timeline_to_source(clip, t)))
    return out
```
Edge: overlap on overlay tracks; compound clips recurse.

## 24.10 Layered compositing
```text
function render_frame(timeline, t, quality):
    canvas = background
    for (track, clip, src_t) in active_clips(timeline, t) bottom-to-top:
        frame = decode(clip.asset, src_t, quality.scale)       # cached
        frame = run_effects(clip.effects, frame, t - clip.start)
        frame = transform(frame, transform_matrix(clip, t - clip.start))
        canvas = blend(canvas, frame, clip.blend_mode, eval(clip.opacity, t - clip.start))
    for text in visible_text_items(t): canvas = blend(canvas, render_text(text, t), NORMAL, 1)
    return canvas
```
Transitions: when two clips of one track overlap, replace the pair's blend with `transition.render(A, B, u)`.

## 24.11 Undoable edit operation
```text
class Command { apply(model); revert(model); label; selection_before; selection_after }
function execute(cmd):
    cmd.apply(model); history.truncate_redo(); history.push(cmd)
    dirty = (history.index != saved_index); emit(changed)
function undo(): cmd = history.pop_current(); cmd.revert(model); restore cmd.selection_before
begin_transaction(); ...many updates...; commit_transaction()  # coalesced into one Command
```

## 24.12 Safe save
```text
function save(project, path):
    snap = snapshot(project); data = serialize(snap)
    tmp = unique_temp_name(path); write(tmp, data); flush(tmp)
    if not valid(read(tmp)): delete(tmp); return Error
    backup(path); replace_atomically(path, tmp)
    saved_index = snap.history_index
```
Edge: disk full, locked destination, removable media; user keeps editing during save (snapshot).

## 24.13 Reopen and resolve assets
```text
function open(path):
    data = read(path)
    if corrupt: try backup, then autosave
    if data.version > supported: open_read_only_or_refuse()
    data = migrate(data)
    project = build_model(data); validate(project)
    for asset in project.assets: asset.status = locate(asset)   # abs, rel, fingerprint
    jobs.enqueue(rebuild_derived_data_for_visible())
    show_offline_summary(project)
```

## 24.14 Thumbnail scheduling
```text
function schedule_thumbs(visible_ranges):
    for each (asset, range) sorted by distance from viewport center:
        key = (asset, quantized_time, size)
        if cache.has(key) or jobs.has(key): continue
        jobs.enqueue(Thumb(key), priority=high_if_visible)
on scroll: cancel queued jobs no longer visible
```

## 24.15 Export job management
```text
function export(project, settings):
    job = Job(snapshot(project), settings)
    validate(settings, encoder_caps); check_disk_space(estimate)
    job.state = rendering
    for n in 0 .. frames_total-1:
        if job.cancel_requested: cleanup(); job.state = cancelled; return
        frame = render_frame(job.snapshot, frame_time(n), FULL)
        encoder.push(convert(frame)); audio.push(mix_audio_block(n))
        job.frames_done = n+1; report_progress(throttled)
    encoder.flush(); muxer.finalize(); verify(output)
    job.state = succeeded
on any error: job.state = failed(stage, cause); cleanup temp
```

## 24.16 Cancellation and progress/failure states
```text
token = CancelToken()
worker: loop { if token.cancelled: break_clean(); do_slice(); report(progress) }
state machine: idle -> running(p) -> succeeded | failed(e) | cancelled
```
Rules: check the token at least every frame or ~100 ms; cleanup is idempotent; UI shows state from the job, not from local flags.

## What a Future Coding Agent Must Understand

- All edit algorithms are small and exact when time is integral and invariants are explicit.
- Every operation is one command; transactions coalesce drags.
- Preview and export share `render_frame`; they differ only in `quality`.
- Long operations need tokens, progress, cleanup, and snapshots.
- **Verified:** none; general design. **Related:** Chapters 5, 8, 9, 10, 15, 16, 21, 23.
