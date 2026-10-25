# Chapter 21: Reliability, Errors, Testing, and Edge Cases

**Draft v1, 25 October 2026.** **[GENERAL]** and **[PROPOSED]**. Nothing here is a claim about CapCut's behavior.

---

## 21.1 Error taxonomy

Give every failure a typed category, a user-facing message, a technical detail for logs, and a recovery action.

| Category | Examples | User-facing handling |
|---|---|---|
| Input media | Unsupported format, corrupt file, truncated file, DRM-protected file | Name the file and stream, state the cause, suggest convert/replace |
| File system | Missing file, disconnected drive, permission denied, locked file, path too long, disk full | Offer retry, relink, choose another folder |
| Decoder | Decoder fails mid-stream, hardware decoder error | Fall back to software, mark clip as problematic, continue |
| Encoder / export | Encoder init failure, mux failure, out of disk | Stage-specific message; keep project safe; remove temp output |
| Graphics | GPU init failure, device lost, shader compile error | Fall back to CPU path or reduced mode; offer to disable acceleration |
| Memory | Out-of-memory | Free caches, lower preview quality, warn; never corrupt the project |
| Fonts | Missing font, glyph missing | Substitute and warn (Chapter 12) |
| Audio device | Device removed or changed | Reopen default, keep position (Chapter 13) |
| Project | Corrupt file, newer version, migration failure | Backup/autosave fallback; read-only; never overwrite silently (Chapter 16) |
| Worker | Background process crashed or hung | Restart worker; retry once; surface persistent failures |
| Cancellation | User cancels | Not an error; clean up and return to a stable state |

Principles: fail **locally** (one bad clip should not break the project), never lose user work, tell users what happened and what they can do, and keep the app usable.

## 21.2 Long-running operations

Every long task has: a cancel token checked frequently, progress reporting, a timeout/watchdog for hung external components, and defined cleanup. Cancelled and failed tasks leave no half-written outputs (temp-then-rename, Chapter 16) and release resources.

## 21.3 Crash and unexpected closure

- Autosave and recovery (Chapter 16).
- Clean-shutdown marker to detect crashes.
- Local crash dumps; user-approved sharing only.
- On restart: offer recovery; show what was recovered.
- Child-process isolation for risky operations (Chapter 19) so a decoder crash does not take down the editor.

## 21.4 Test layers

| Layer | What it covers | Tooling idea |
|---|---|---|
| Unit tests | Time math, split/trim/move, keyframe evaluation, interpolation, SRT parsing, command apply/revert | Fast, deterministic, no UI or media files |
| Property-based tests | Invariants hold after random sequences of edits (no overlaps, ranges valid, undo restores state exactly) | Random command generators with a seed |
| Integration tests | Import real media, render a frame, export a short clip, reopen a saved project | Small fixture files |
| Media conformance tests | A corpus of files: codecs, containers, VFR, odd resolutions, rotation tags, interlaced, HDR, broken files | Reference outputs and tolerance thresholds |
| Rendering regression | Render known projects to frames; compare to stored references with tolerances | Perceptual or numeric diff; allow tiny GPU differences |
| UI tests | Selection, shortcut routing, focus handling, dialogs | UI automation; limited and focused |
| Performance tests | Frame times, memory growth, export time on reference hardware | Tracked over time; fail on regressions beyond a threshold |
| Soak tests | Hours of repeated edit/play/save cycles | Watch memory, handles, threads |
| Fault-injection tests | Kill process mid-save/export, fill disk, remove drive, deny permission | Scripted, repeatable |
| Manual workflow tests | New-user flows end to end | Checklists per release |

Keep a **golden project set**: small projects exercising each feature, rendered as regression references.

## 21.5 Edge-case scenarios

| Scenario | Expected outcome |
|---|---|
| Clip of 1 frame | Can move; cannot split; export includes it |
| Clips with tiny gaps (1 frame) | Gap preserved and shown; export renders black or background for the gap |
| Overlapping clips on different tracks | Higher track on top; audio mixed |
| Split exactly at a clip edge | No-op with feedback |
| Trim beyond source media | Clamped |
| VFR phone footage with audio | Audio stays in sync after edit and export |
| 23.976, 29.97, 59.94 fps media in a 30 fps project | Frame mapping documented; no drift in long clips |
| Unusual rates (e.g., 12 or 120 fps) | Handled by mapping rules |
| Portrait clip with rotation tag in landscape project | Displayed upright, fitted by rule |
| Media offline then relinked | Clips restored, caches rebuilt |
| Two audio tracks, one muted, one soloed | Defined, consistent result |
| 500+ clips, 20+ tracks | UI remains responsive (virtualized) |
| Very long timeline (several hours) | Navigation and export stable |
| Rapid undo/redo after a drag | Exact state restored |
| Project opened while source drive is asleep or slow | UI not blocked |
| Text with emoji and mixed scripts | Fallback fonts used |
| Export while editing | Export uses snapshot; result unaffected |
| Disk fills mid-export | Clean abort and message |
| Same file imported twice | Duplicate handling per policy |
| Filename with non-ASCII characters or spaces | Works through all layers (UI, media library, export path) |

## 21.6 Logging and diagnostics without leaking private content

- Log events, stages, error codes, durations, and versions.
- Avoid logging media content, caption text, or full personal paths by default; hash or truncate paths; let the user opt in to verbose logging.
- Include a diagnostic bundle option: app version, OS version, hardware summary, recent log lines, and codec capability report; the user reviews before sharing.
- Correlate by job ID so a failed export can be traced across subsystems.
- Rotate logs by size and age.

## 21.7 Defensive practices

- Validate at boundaries: file parsing, project loading, command preconditions.
- Treat external libraries as untrusted for robustness: malformed media can crash decoders; sandbox or isolate where practical, and keep libraries updated.
- Use assertions for internal invariants in debug builds; in release, convert violations to recoverable errors where possible.
- Do not trust file extensions; probe content.
- Time limits on external operations.

## 21.8 Definition of "reliable enough" checklist

- No data loss in any fault-injection test.
- Every error path has a message and a recovery action.
- Memory flat across soak tests.
- Exports reproducible for golden projects within tolerance.
- Project files from older versions still open.

## What a Future Coding Agent Must Understand

- Build typed errors and recovery paths from the start; a "generic failure" message is a defect.
- Make long operations cancellable and cleanly abortable.
- Test the time/edit logic exhaustively at the unit and property level before building UI on it.
- Maintain a media conformance corpus and golden projects for regression.
- Log enough to diagnose without capturing private content.
- **Verified:** none (no CapCut claims). All guidance is general engineering practice.
- **Related:** Chapters 5, 7, 8, 9, 15, 16, 19, 20.
