# Chapter 16: Project Files, Saving, Undo, and Recovery

**Draft v1, 25 October 2026.** **[GENERAL]** and **[PROPOSED]**. CapCut's project format and storage layout are **[UNKNOWN]**; nothing found so far documents them. Do not infer them. Windows file-API citations (Microsoft Learn: atomic replace, `ReplaceFile`/`MoveFileEx`, `FlushFileBuffers`, known folders) are **still to be added**; the behaviors below are stated as general practice and must be verified against that documentation before implementation.

---

## 16.1 Four different things

| Thing | Contains | Lifetime |
|---|---|---|
| Project document | Edit decisions: tracks, clips, ranges, properties, effects, keyframes, text, settings, asset table (paths and metadata) | User-owned, saved deliberately |
| Source media | Original video/audio/images | User-owned, never modified |
| Temporary cache | Thumbnails, waveforms, proxies, frame cache | Disposable, rebuildable |
| Exported video | A rendered result | Independent of the project |

Deleting a project document must not delete source media or exports. Deleting cache must not affect the project.

## 16.2 Document contents

```text
Project {
  format_version, app_version_created, app_version_last_saved,
  settings { resolution, frame_rate, color settings, audio rate },
  assets[]  { id, paths, fingerprint, metadata },
  timeline { tracks[ { clips[ { asset_id, start, in, out, speed,
                                transform, keyframes, effects[] } ] } ] },
  text_items[], subtitle_segments[], audio_config,
  ui_state? (optional: zoom, playhead, panel layout)
}
```

Keep UI state separate from edit data so that changing zoom does not make the project "dirty" in the editing sense (or mark it as a low-priority change).

## 16.3 Serialization format options

| Option | Pros | Cons |
|---|---|---|
| JSON (single file) | Human-readable, easy to diff and debug, widely supported | Large projects are big; whole-file rewrite on each save |
| JSON in a zip container | Compact; can bundle thumbnails or attachments | Slightly more complex |
| SQLite database | Transactional, incremental saves, queries, crash-safe | Not human-readable; schema migrations needed |
| Binary custom | Compact and fast | Hard to debug and migrate; risk of format lock-in |

Decision criteria: project size expectations, need for incremental/auto-save, debuggability, migration complexity. This is left open for the future coding agent (see the decisions table, Part IV).

## 16.4 Safe saving (atomic write)

```text
function save(project, path):
    data = serialize(snapshot(project))          # snapshot first; editing may continue
    tmp = path + ".tmp-" + random
    write data to tmp
    flush to disk (OS-level flush)
    validate: re-read tmp, parse, check checksum/schema
    if path exists: copy path -> path + ".bak" (or keep N rotated backups)
    atomically replace path with tmp           # rename/replace API on the same volume
    on any failure: delete tmp, keep original, report error, remain dirty
```

Principles: never write directly over the only copy; write temp then replace on the same volume (so the replace is atomic); validate before replacing; keep at least one previous version.

Other failure cases: disk full (check free space before; handle write error), path not writable, antivirus lock (retry briefly), project on removable drive that disappears.

## 16.5 Autosave and crash recovery

- **Autosave:** periodic (for example every few minutes when dirty) and after bursts of editing. Writes to a **separate recovery location**, not over the user's file, so unwanted changes are not auto-committed.
- **Recovery on startup:** if a recovery file is newer than the last explicit save and a clean-shutdown marker is absent, offer to restore, discard, or keep both.
- **Journal alternative:** append each command to a log; recovery replays the log over the last saved snapshot. More complex, but finer-grained.
- Detect unclean shutdown with a lock/marker file removed on normal exit. Lock files also prevent two instances editing the same project (decide the policy).

## 16.6 Undo and redo

**Design A: Command pattern with inverse** — each command stores what is needed to reverse itself.
**Design B: Snapshot/delta** — store state deltas (patches) between versions.
**Design C: Persistent (immutable) data structures** — each edit yields a new version sharing structure; undo is a pointer move.

```text
UndoStack { commands[], index }
do(cmd):     cmd.apply(); truncate commands after index; push; index++
undo():      if index>0: commands[index-1].revert(); index--
redo():      if index<len: commands[index].apply(); index++
```

Requirements:

- **Transactions:** a drag that emits hundreds of intermediate updates becomes **one** undo step (begin/commit; coalesce).
- Composite commands (split a linked pair, ripple delete) are one step.
- Record selection and playhead with the command so undo restores context sensibly.
- A new edit after undo clears the redo tail.
- Undo history is **session data**, not part of the saved project (unless the design chooses to persist it). Do not confuse "undo history" with "saved project data".
- Bound memory: cap the number of steps or the total size.
- Which actions are undoable in CapCut is **[UNKNOWN]** here; Chapter 3 rows must record this per control.

Dirty flag with undo: store `saved_index`; project is clean when `index == saved_index`.

## 16.7 Version compatibility and migration

- Store `format_version`. On load: if newer than the app supports, open read-only or refuse with a clear message (never silently drop unknown fields and save over the file).
- Keep **migrators** from each older version to the next; run them in sequence.
- Preserve unknown fields when feasible (round-trip safety).
- Keep a pre-migration backup.

## 16.8 Corruption and missing assets

- On parse failure: try the `.bak`, then the latest autosave, then show a recovery dialog; never overwrite the corrupt file without a copy.
- Validate on load: referential integrity (every clip's asset exists), range validity, no cycles in nested sequences, time bounds. Repair what is safe (clamp), report what is not.
- Missing assets follow Chapter 7: open the project with offline placeholders.

## 16.9 Backup, portability

- "Collect project" command: copy used media plus the project into a folder, rewriting paths relative.
- Export/import of project packages for moving between machines.
- App data and recovery files go in the per-user application data location; verify the correct known-folder APIs in Microsoft documentation.

## 16.10 Test scenarios

| Scenario | Expected |
|---|---|
| Kill the process mid-save | Original file intact; temp file ignored or cleaned |
| Disk full during save | Error shown; original intact; stays dirty |
| Open project from a newer app version | Clear refusal or read-only |
| Undo after save, then save again | Dirty/clean transitions correct |
| Drag edit then one undo | Whole drag undone |
| Delete asset file, reopen | Offline placeholder; relink works |
| Corrupt JSON | Fall back to backup/autosave |

## What a Future Coding Agent Must Understand

- Four artifacts: project document, source media, cache, export, each with its own lifetime and deletion rules.
- Save atomically with validation and a backup; autosave to a separate recovery location.
- Undo is command- or delta-based, transactional for drags, and separate from the saved document.
- Version the format and plan migrations from the first release.
- Choose the storage technology (JSON, zip, SQLite) deliberately; this book does not choose for you.
- **Verified:** nothing CapCut-specific. Windows API behavior still needs Microsoft Learn citations.
- **Related:** Chapters 5, 7, 8, 21, 23, 24.
