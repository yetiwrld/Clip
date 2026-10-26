# Timeline editing

What the editor could do before, what it does now, and what it still does not do.
Written for this task: "Implement Professional Video Editor Editing Controls and
Timeline Operations".

The short version: cut, copy, paste, duplicate, delete, ripple delete, split,
trim, move, multi-select, snapping and undo/redo now act on the real
`ClipTimeline` the project saves. One implementation is shared by the keyboard,
the labelled toolbar, the right-click menu and the command palette.

---

## 1. What already existed (audited, not assumed)

| Area | State before | Kept? |
|---|---|---|
| Timeline model | `ClipTimeline { tracks, items, snapEnabled }`, items hold `assetId`, `trackId`, `startTime`, `sourceIn/Out`, speed, volume, fades, transform. One track per media type. | **Kept unchanged.** |
| Persistence | `timeline.save` / `timeline.get`, JSON document per clip, validated in `saveClipTimeline` (asset must exist, track type must match). | **Kept.** |
| Timeline UI | `MultiTrackTimeline.tsx`: ruler, playhead, zoom slider, ctrl+wheel zoom, fit, vertical scroll, waveforms, filmstrip, captions/text/camera rows, track mute/hide/lock. | **Kept.** |
| Drag and trim | Single clip drag, left/right trim handles, keyboard trim by frame, drag auto-scroll. | **Kept and extended.** |
| Split / duplicate / delete | One clip at a time, via `timeline-editing.ts` helpers, wired to Ctrl+B, Ctrl+D, Delete. | **Kept; now selection-wide.** |
| Undo | Two histories: clip settings and timeline. `recordTimelineCommand` merged any two edits 650 ms apart. | **Kept; grouping fixed.** |
| Shortcuts | One registry (`commands/registry.ts`) with conflict tests and text-field protection. | **Kept; extended.** |
| Playhead | Click/drag seek, J/K/L, `,`/`.`, frame stepping. | **Kept.** |
| Preview | Stage, multi-track media elements, silence skipping. | **Untouched.** |

Gaps found: no copy, cut or paste of clips; no multi-selection or range
selection; delete only ever removed one clip; no ripple delete; no cross-track
drag; no context menu; no edit menu; discrete commands could be merged into the
undo step of a neighbouring drag; drags did not snap to other clips' edges for
trims; times were rounded to 0.01 s instead of the project frame grid.

---

## 2. What the editor does now

### Commands

| Action | Shortcut | What it does to the project |
|---|---|---|
| Cut | Ctrl/⌘ X | Copies the selected clips into the clip clipboard, then removes them. Locked tracks are untouched. |
| Copy | Ctrl/⌘ C | Copies the selected clips. The timeline value does not change. |
| Paste | Ctrl/⌘ V | Inserts the clipboard at the playhead, keeping relative timing. Repeated paste continues after the previous block. |
| Duplicate | Ctrl/⌘ D | Copies the selection directly after itself. |
| Split | Ctrl/⌘ B | Splits every selected clip (or every clip under the playhead when nothing is selected). The right-hand pieces become the selection. |
| Delete | Delete / Backspace | Removes the selection and leaves a gap. |
| Ripple delete | Shift Delete | Removes the selection and closes the gap on the affected tracks. |
| Select all | Ctrl/⌘ A | Selects every clip on an unlocked track. |
| Clear selection | Esc | Clears the selection (closes the properties panel first). |
| Snapping | Shift S | Toggles magnetic snapping. |

Split, trim and move all map through clip speed: a 2× clip cut one second into
its timeline life cuts two seconds into its source.

### The clip clipboard

`src/shared/editor/timeline-editing.ts` + a small Zustand store
(`timeline-clipboard.ts`). It is deliberately **not** the operating-system
clipboard, so a clip cannot be pasted into another program and a document cannot
be pasted into the timeline.

Copy stores each clip's properties (asset, source in/out, speed, volume, fades,
transform, opacity, loop, mute) plus its offset from the earliest copied clip,
its track id, track type and track order. Media is referenced, never duplicated.

Paste:

- lands on the clip's own track where possible; otherwise the nearest unlocked
  track of the same media type, otherwise the clip is skipped and the user is
  told how many were skipped;
- skips any clip whose source media no longer exists, so a stale clipboard
  cannot create a broken reference;
- keeps relative timing between the copied clips;
- overwrites the space it takes: a clip it covers is shortened, and a clip it
  lands inside becomes two clips (head and tail) with correct source intervals;
- advances to the end of the previous block when paste is pressed again at the
  same playhead (repeat paste tiles rather than stacks).

### Selection

- Click: select one clip.
- Ctrl/⌘ click: add or remove a clip.
- Shift click: select the range between the last clicked clip and this one, on
  this track.
- Click empty timeline space: clear the selection.
- Dragging a clip that is already selected moves the whole selection together.
- Locked tracks cannot be selected, edited, moved to, or pasted onto.
- Every selected clip shows the accent outline; the primary clip is the one the
  inspector shows.

### Drag, trim, snapping

- Dragging the body moves the clip; the two edge handles trim. The body and the
  handles are separate hit areas, so dragging cannot trim by accident.
- The selection can be dragged as a group; one clip at a time can be dragged to
  another compatible track (the target row highlights).
- On release, a clip that lands on top of another replaces the covered part
  instead of stacking two clips in the same space.
- Snapping targets: playhead, timeline zero, other clips' start and end edges,
  silence cuts and camera keyframes. A thin accent guide shows what it locked
  onto; Shift S or the toolbar turns it off.
- Times snap to the project frame grid (`snapTimeToFrame`), including the
  playhead, moves, trims and pastes. Split keeps the exact playhead time and
  maps it to source time through speed.

### Undo and redo

The existing snapshot history was kept. The fix that mattered: entries now
carry a group. A drag names its gesture, so every value it reports becomes one
undo step however long the drag lasts; a cut, paste, delete, split, duplicate or
track toggle gets a unique group, so an edit that follows milliseconds later can
never be folded into it.
Undo restores the whole timeline value (positions, durations, tracks, properties
and selection safety), redo re-applies it, and a new edit after an undo clears
the redo branch. The toolbar buttons and the palette entries reflect whether
undo/redo are available right now.

Undo still restores the previous timeline value; it is not a full command
system. That is the existing design and it is reliable for these operations.

### Menus, toolbar and feedback

- **Toolbar**: Cut, Copy, Paste, Split, Duplicate, Delete and Ripple delete are
  visible, labelled buttons next to snapping, Add track, Undo and Redo. Each
  carries its shortcut in the tooltip and is disabled when it cannot run.
  A disabled button also says why: "Split clips at playhead · move the playhead
  inside the clip first · Ctrl+B". Selecting the main source adds Trim in and
  Trim out, which move the clip's own in/out points to the playhead (I / O do the
  same thing from the keyboard).
- **Status line**: names the selection ("2 clips selected"), warns when the
  playhead still has to move for a split, says when the selection is on a locked
  track, and shows the result of the last command ("Copied 2 clips", "Pasted 3
  clips at 0:12.0") without opening a toast.
- **Right-click menu**: the same actions for the clip or the empty space under
  the pointer, with the same shortcuts and disabled states.
- **Command palette**: the same commands, searchable, gated by the same
  `enabled()` checks.
- Errors still use the toast when they need attention: "Move the playhead inside
  a selected clip to split it.", "There is no compatible unlocked track to paste
  onto."

### The playhead is not the clip

Two behaviours made the timeline feel locked to one clip and were fixed here:

- **Selecting a clip does not seek.** Pointer-down only selects (plain, Ctrl/Cmd
  toggle, Shift range). The old code ran `seekTo(item.startTime)` on every press,
  so a preview that was playing jumped to the clip's first frame and the Split
  button was immediately disabled because the playhead sat on the clip's edge.
  Clicking the main source clip did the same. Now the playhead moves only from
  the ruler, the new playhead grip, empty timeline space, or the transport keys.
- **Playback is not forced back into the clip range.** Playback used to jump to
  `clip.startTime` whenever the playhead passed `clip.endTime`, so pressing play
  after seeking anywhere else restarted from the beginning. The transport now
  starts at the playhead, keeps going across the timeline, and stops at the end
  of the media (the `ended` event releases the play state). Pressing play while
  already at the end still restarts from the clip's in-point.

The split point is rounded to the project frame grid, and the ruler carries a
draggable playhead cap so scrubbing does not depend on hitting a hairline.

### Consistency with preview and saving

Every command returns a new `ClipTimeline` and hands it to `onChange`. That one
path updates the timeline view, records history, marks the project dirty, writes
the crash draft and schedules the same debounced `timeline.save` used by every
other edit. Nothing in the menus edits state directly.

---

## 3. Deliberate decisions

| Decision | Why |
|---|---|
| Arrows changed from "one second" to "one frame"; Shift+arrow = one second | Frame stepping is the desktop convention and the request asked for frame-accurate playhead movement. `,` and `.` still step frames too, so nothing was lost. |
| Ctrl+C/V/X/A are claimed only when a selection or the clip clipboard exists | Outside the editing context those keys keep their native behaviour. Text fields always keep them: the dispatcher checks the focused element first. |
| Paste overwrites the space it takes | The render path treats clips on one track as a sequence; leaving two clips stacked in the same interval would look correct in the timeline and render unpredictably. |
| Ripple delete is a separate command (Shift+Delete) | Plain delete must not move unrelated clips, and paste/cut must stay non-rippling. |
| Escape is shared with the properties panel | The panel registers last, so it closes first when open; Escape then clears the selection. The conflict test allows exactly this pair. |
| Selection stays in the timeline component | The parent already owned the primary clip for the inspector; adding a second owner would create two sources of truth. |

---

## 4. Not implemented

| Not done | Why |
|---|---|
| Insert (ripple) editing for paste | The timeline has no insert mode today; paste is an overwrite edit and drag-drop is free placement. Adding insert semantics would change how dropping media behaves, which was out of scope for this pass. |
| Linking/unlinking audio and video | The data model has no linked pairs: an item references one asset on one track. There is nothing to link. |
| Marquee (rubber-band) selection | Multi-select, range select and select-all cover the workflow without a new pointer mode. |
| Keyboard nudging of clips | Not requested in a form that did not collide with playhead keys. |

---

## 5. Tests actually run

| Test | What it proves |
|---|---|
| `tests/unit/timeline-clipboard.test.ts` (24) | Copy keeps properties and relative timing; cut stores and removes; paste tiles, overwrites and splits; locks are respected; ripple closes gaps; duplicate and split keep source intervals; range select; drop-on-clip resolution. |
| `tests/unit/timeline-wiring.test.ts` (16) | The labelled toolbar, its order, tooltips, disabled states and disabled hints are rendered from the real commands; tapping a clip or the main source has no seek; the playhead grip exists; undo/redo reflect both histories; the timeline registers in the shared registry and has no keyboard listener of its own; every edit flows through the persisted save path; each operation has one call site. |
| `tests/unit/commands.test.ts` (23) | Cut/copy/paste/select-all are inert in text fields and unavailable without a selection or clipboard; Escape ordering; no duplicate shortcuts beyond the documented pair. |
| `tests/unit/timeline-commands.test.ts` (7) | A discrete command is never merged into a surrounding drag; drag values coalesce; undo order and redo branching. |
| `tests/unit/frame-rate.test.ts` (4) | Frame rounding at 25 fps and 23.976 fps, negative and invalid input. |
| `tests/unit/playback.test.ts` (4) | Pressing play keeps a playhead outside the clip range where it is, restarts only at the end, clamps to the media, and does not guess before metadata loads. |
| `tests/integration/timeline-editing.test.ts` (3) | Split, cut and paste saved through the real dispatcher and read back after a restart; ripple delete persisted; a corrupt timeline is rejected; undo/redo round trip. |
| Full suite | 55 files / 605 tests pass. |
| Typecheck | `tsc` clean for the renderer and for main/shared. |
| Build | `electron-vite build` succeeds. |
| Preview | Built app served on :8787; `timeline.get`/`timeline.save` round trip through the real backend; new command strings present in the bundle. |

Not tested here: the pointer interactions themselves (drag, shift-click,
right-click) need a human in a desktop window — this sandbox has no display,
no Electron binary and no headless browser. The data operations underneath them
are covered by the tests above.

**Five-minute manual check on Windows:** open a project with media on a video
track, press play, click a clip and confirm the picture keeps playing instead of
jumping; then Ctrl+X, move the playhead, Ctrl+V, Ctrl+Z twice, click a clip then
shift-click another, drag the pair, drop one on the other track, Shift+Delete
the selection, then close and reopen the project.
