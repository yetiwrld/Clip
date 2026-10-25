# Chapter 7: Media Import, Assets, and File Management

**Draft v1, 25 October 2026.** **[GENERAL]** and **[PROPOSED]** engineering. CapCut's own asset handling and project format are **[UNKNOWN]**. FFmpeg library roles are from the FFmpeg documentation index (https://ffmpeg.org/doxygen/0.10/index.html, accessed 25 Oct 2026): libavformat for I/O and demuxing, libavcodec for decoding, libswscale for scaling/conversion, libswresample for audio resampling.

---

## 7.1 Guiding principle: reference, never replace

A project stores **references** to source files plus metadata. It must not overwrite or alter originals.

Reasons: non-destructive editing; one source can be used by many clips; disk space; the user's files remain theirs. Deleting a clip, an asset entry, or a whole project removes *references*, never the user's source file, unless the user explicitly asks and the UI says so in plain words.

## 7.2 Import paths

| Method | Notes |
|---|---|
| File picker (multi-select) | Standard Windows dialog |
| Folder import | Recursive scan; filter by extension *and* by probe result (extension alone lies) |
| Drag and drop | From Explorer onto library or timeline; dropping onto the timeline = import + place |
| Paste / recent files | Optional |

Import should be fast: register the asset immediately, then probe and generate derivatives in the background (7.4).

## 7.3 Probing and metadata

```text
function probe(path):
    open container (demux)               # failure -> ContainerError
    for each stream:
        record kind, codec, profile, pix_fmt, w, h, rotation, PAR,
               avg_fps, real_fps (or "vfr" flag), color_range/matrix/transfer,
               audio: rate, channels, layout, sample_fmt, duration, bitrate
    record container duration, creation time, file size, mtime
    compute quick fingerprint (size + mtime + hash of first/last N KB)
    test-decode first video frame and first audio packet  # catches codec failure early
    return AssetInfo or typed error
```

Error types should be distinct: not-a-media-file, container-unreadable, codec-unsupported, stream-corrupt, permission-denied, file-locked, path-too-long.

## 7.4 Derived data and background jobs

| Derived data | Purpose | Notes |
|---|---|---|
| Thumbnails | Library grid, timeline strip | Generate small set first (poster frame), then more on demand by zoom level |
| Waveform peaks | Audio display | Store min/max per fixed window (e.g., per 512 samples) in a small cache file; render by downsampling peaks, never from raw samples |
| Proxy media | Smooth preview of heavy sources | Lower resolution, intra-frame or short-GOP codec; see 7.6 |
| Optimized media | Better seeking for long-GOP | Same resolution, edit-friendly codec; large on disk |
| Frame cache | Fast scrubbing | Memory/disk, keyed by asset, time, scale |

All are **derived and disposable**: rebuildable from the source, safe to delete.

**Job system [PROPOSED]:**

```text
Job { id, kind, asset_id, priority, state: queued|running|done|failed|cancelled,
      progress 0..1, error?, cancel_token }
```

Priorities: visible-on-screen items first, then selected asset, then the rest. Cancel when the asset is removed or the app closes. Limit concurrency (target PC: 6 cores / 12 threads class; leave headroom for the UI and playback, see Chapter 20). Show progress without blocking editing.

## 7.5 Identifiers and paths

- **Asset ID:** a stable UUID created at import. Clips refer to asset IDs, never to paths.
- **Path storage:** keep the absolute path *and* a path relative to the project file location when it lies beneath it. Also store the fingerprint (7.3).
- **Portability:** absolute paths break when a project moves machines or drive letters change. Relative paths survive moving a project folder that contains its media.
- **Windows specifics:** drive letters can change for removable drives; consider storing the volume serial number or label as a hint. Paths may exceed 260 characters; long-path support must be considered.

## 7.6 Proxy vs optimized vs original

- **Proxy:** preview uses the proxy; **export always uses the original** (unless the user chooses otherwise). The mapping asset to proxy is by asset ID so clips are unaffected.
- The user needs a visible indicator and a toggle ("use proxies").
- Disk cost: proxies are small; optimized media can be larger than the source.

## 7.7 Missing, moved, duplicate, unsupported

**Missing file at open:** mark asset offline, keep clip metadata, show a placeholder (clear "media offline" frame), allow relinking.

**Relink algorithm:**

```text
function relink(asset, search_root):
    candidates = files under search_root matching name OR size
    for c in candidates:
        if fingerprint(c) matches asset.fingerprint: return c   # strong match
    ask user to choose; if chosen file's duration/streams differ, warn
    offer: relink other offline assets in the same folder automatically
```

**Duplicates:** detect by fingerprint at import; ask whether to reuse the existing asset or add a separate entry. Never silently merge.

**Unsupported files:** list them in an import report with the reason; do not abort the batch.

**Locked or permission errors:** retry later; message must name the file and the cause.

**Removable/network drives:** treat as possibly absent; avoid blocking the UI on slow I/O; time out probing.

## 7.8 Large libraries

Virtualized list; lazy thumbnails; paged database queries; search/filter/sort on indexed metadata (name, type, duration, date). Avoid loading all thumbnails into memory.

## 7.9 Cache management

- Location: per-user app data (for example under `%LOCALAPPDATA%`), not beside user media by default.
- Key cache entries by asset ID plus a content hash so edits to the source invalidate them.
- Size cap with least-recently-used eviction; a "clear cache" command that never touches sources or projects.
- Record cache entries in an index; verify on startup; tolerate a half-written file by writing to a temp name and renaming.

## 7.10 Proposed illustrative data model

```json
{
  "asset": {
    "id": "uuid", "kind": "video|audio|image",
    "path_abs": "D:\\clips\\a.mp4", "path_rel": "media/a.mp4",
    "fingerprint": {"size": 123, "mtime": "...", "hash": "..."},
    "streams": [{"type": "video", "codec": "h264", "w": 1920, "h": 1080,
                 "fps": [30000, 1001], "vfr": false, "rotation": 0}],
    "duration_ticks": 0,
    "status": "ok|offline|unsupported|corrupt"
  }
}
```

Label: **[PROPOSED]**, not CapCut's format.

## What a Future Coding Agent Must Understand

- Clips reference asset IDs; assets reference files; originals are never modified.
- Probe thoroughly, and fail with specific, typed errors.
- Derived data is disposable and rebuildable; the job system must be cancellable and prioritized.
- Relinking and offline media are normal states, not exceptions.
- **Verified:** only the FFmpeg library roles. Everything else is general design.
- **Related:** Chapters 8, 9, 16, 20, 21, 23, 24.
