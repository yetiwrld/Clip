# Timeline editing

What the editor could do before, what it does now, and what it still does not do.
Written for this task: "Implement Professional Video Editor Editing Controls and
Timeline Operations".

The short version: cut, copy, paste, duplicate, delete, split, trim, move,
multi-select, snapping and undo/redo now act on the real `ClipTimeline` the
project saves. One implementation is shared by the keyboard, the icon toolbar,
the right-click menu and the command palette. The timeline itself is laid out
like a desktop editor: track headers with mute / hide / lock / options, a
dedicated playhead, and a ruler in `00:00` timecodes.

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
selection; delete only ever removed one clip; no cross-track
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
| Select all | Ctrl/⌘ A | Selects every clip on an unlocked track. |
| Clear selection | Esc | Clears the selection (closes the properties panel first). |
| Snapping | Shift S | Toggles magnetic snapping. |

Split, trim and move all map through clip speed: a 2× clip cut one second into
its timeline life cuts two seconds into its source.

Ripple delete is not offered. Delete leaves the gap, so a remove never shifts
clips the user did not select.

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

- **Toolbar**: Cut, Copy, Paste, Split, Duplicate and Delete are icon-only
  buttons on the full 30px control height, next to snapping, Add track, Undo and
  Redo. Hovering any icon shows its name and shortcut (and the reason it is
  disabled): "Split clips at playhead · move the playhead inside a clip first ·
  Ctrl+B". The main source clip is trimmed with its edge handles or the I / O
  keys; when it is selected the edit buttons say so ("the main source is one
  clip — trim its edges") instead of asking for a clip that is already selected.
- **Selecting is not seeking**: clicking a timeline clip, a caption block or a
  text layer selects it and leaves the playhead alone. Double-click moves the
  playhead to that block. Only the ruler, the playhead grip and empty space move
  it.
- **Status line**: names the selection ("2 clips selected"), warns when the
  playhead still has to move for a split, says when the selection is on a locked
  track, and shows the result of the last command ("Copied 2 clips", "Pasted 3
  clips at 0:12.0") without opening a toast.
- **Right-click menu**: the same actions for the clip or the empty space under
  the pointer, with the same shortcuts and disabled states.
- **Getting media onto the timeline**: every card in the Media panel has a
  `+` button that places the asset at the playhead, on the first unlocked track
  that takes its media type (creating one when needed). Dragging a card onto a
  track does the same thing through the same helper
  (`addAssetToTimeline` in `src/shared/editor/timeline-editing.ts`), and an
  empty lane says where media comes from. Until a clip is on a track there is
  nothing for cut, split or delete to act on, which is why that path is now one
  click rather than a drag.
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

### Timeline layout

Researched against CapCut Desktop, then applied to this app's own timeline
(keeping the existing palette and controls):

| Part | What it does now | Why |
|---|---|---|
| Rows | Captions, then text / graphics, then camera markers, then the video tracks, then the audio tracks. The order is what decides who covers whom: a track further down the list is drawn in front of the ones above it. | This is the stacking order of the app's own render path, so the editor and the exported file agree. Captions and text still sit above the picture. |
| The main clip | The clip you are editing is drawn **once**, as one block on the first video track, with its name, its trimmed length, a filmstrip texture and a waveform strip. Clicking it selects it and says where the trim lives; it cannot be dragged, trimmed or deleted on the timeline. | One block answers "what am I editing and how long is it" without pretending to be a second clip. An earlier version of this pass drew a block per cut range; that is the same footage twice, and it made copy, paste, split and delete need an exception for blocks that were not clips. |
| Video naming | Video tracks number from one (`Video 1`, `Video 2`, …), for new tracks as well as projects. | "Video 2" as the first track was a leftover from the old single-clip model. |
| Track header | Type icon, editable name, mute, hide, lock, and a `⋯` menu with **Move up**, **Move down** and **Delete track**. Delete is only enabled when the track holds nothing. | Reordering is how you decide what covers what; the menu makes it a real edit instead of a display setting, and nothing is deleted out from under a clip. |
| Ruler | `00:00` / `00:10` timecodes instead of `0:00.0`, with the played part of the ruler tinted. | Matches the reference editor and is easier to scan than a decimal suffix. |
| Playhead | A full-height line over every track, with its own handle in the ruler. It is separate from the dashed hover guide. | The playhead is where the edit happens; the dashed line is only where a click would land. Conflating them made the playhead look like it followed the mouse. |
| Clips | Repeated thumbnail texture (a filmstrip), name on the left, duration chip, trim handles at both edges. | A clip should say what it is and how long it is without opening the inspector. |
| Row height | 56 px for video and audio, 48 px for the caption, text and camera rows. | One more track fits in the same panel height. |

## 3. Deliberate decisions

| Decision | Why |
|---|---|
| Arrows changed from "one second" to "one frame"; Shift+arrow = one second | Frame stepping is the desktop convention and the request asked for frame-accurate playhead movement. `,` and `.` still step frames too, so nothing was lost. |
| Ctrl+C/V/X/A are claimed only when a selection or the clip clipboard exists | Outside the editing context those keys keep their native behaviour. Text fields always keep them: the dispatcher checks the focused element first. |
| Paste overwrites the space it takes | The render path treats clips on one track as a sequence; leaving two clips stacked in the same interval would look correct in the timeline and render unpredictably. |
| Delete never moves unrelated clips | There is no ripple mode on overlay tracks: a remove leaves a gap, and later edits are never shifted silently. |
| The main clip has no edit commands of its own | Copy, cut, split, duplicate and delete stay unavailable while it is selected, and the tooltip says "the main clip is trimmed in Properties → Trim". Showing the commands and having them do nothing would be the fake control this pass set out to remove. |
| A finished command is written at once; a drag still waits | Delete, split, paste, duplicate and the end of a drag are complete edits, so they are saved immediately instead of after a 450 ms pause. Only an in-progress drag coalesces, because it reports a new value dozens of times a second. The timeline calls an explicit "commit" when the pointer is released, so the last value of a drag is never left inside the pause. |
| A reload hands the last edit to the browser | While a save is still in flight, leaving the page cancels the request. The editor now also posts the pending write as a beacon, which the browser delivers even as the page closes. Same endpoint, same payload — no second write path. |
| Sound is drawn on the clip that carries it | An audio clip is the sound, so its waveform fills it. A video clip gets a slim strip along the bottom, so the footage stays readable. Both come from the asset's real peaks; a still image has none. |
| No linkage between clips | CapCut moves attached overlays when the clip under them moves. This model has no linked pairs — an item references one asset on one track — so moving one clip never drags another with it. Adding linkage would invent a relationship the data cannot store. |
| Escape is shared with the properties panel | The panel registers last, so it closes first when open; Escape then clears the selection. The conflict test allows exactly this pair. |
| Selection stays in the timeline component | The parent already owned the primary clip for the inspector; adding a second owner would create two sources of truth. |

---

## 4. Not implemented

| Not done | Why |
|---|---|
| Insert editing for paste | The timeline has no insert mode today; paste is an overwrite edit and drag-drop is free placement. Adding insert semantics would change how dropping media behaves, which was out of scope for this pass. |
| Linking/unlinking audio and video | The data model has no linked pairs: an item references one asset on one track. There is nothing to link. |
| Marquee (rubber-band) selection | Multi-select, range select and select-all cover the workflow without a new pointer mode. |
| Keyboard nudging of clips | Not requested in a form that did not collide with playhead keys. |

---

## 5. Tests actually run

| Test | What it proves |
|---|---|
| `tests/unit/timeline-clipboard.test.ts` (21) | Copy keeps properties and relative timing; cut stores and removes; paste tiles, overwrites and splits; locks are respected; delete leaves a gap and never touches a locked track; duplicate and split keep source intervals; range select; drop-on-clip resolution. |
| `tests/unit/timeline-wiring.test.ts` (24) | The labelled toolbar, its order, tooltips, disabled states and disabled hints are rendered from the real commands; tapping a clip has no seek; the main clip is drawn once with its length and sound and offers no edit commands; nothing derived from the source is drawn on the tracks; a clip's sound is drawn as a full waveform for audio and a strip for video; a finished drag asks for an immediate write; the playhead grip exists; undo/redo reflect both histories; the timeline registers in the shared registry and has no keyboard listener of its own; every edit flows through the persisted save path; each operation has one call site. |
| `tests/unit/commands.test.ts` (23) | Cut/copy/paste/select-all are inert in text fields and unavailable without a selection or clipboard; Escape ordering; no duplicate shortcuts beyond the documented pair. |
| `tests/unit/timeline-commands.test.ts` (7) | A discrete command is never merged into a surrounding drag; drag values coalesce; undo order and redo branching. |
| `tests/unit/frame-rate.test.ts` (4) | Frame rounding at 25 fps and 23.976 fps, negative and invalid input. |
| `tests/unit/playback.test.ts` (4) | Pressing play keeps a playhead outside the clip range where it is, restarts only at the end, clamps to the media, and does not guess before metadata loads. |
| `tests/integration/timeline-editing.test.ts` (3) | Split, cut and paste saved through the real dispatcher and read back after a restart; delete persisted; a corrupt timeline is rejected; undo/redo round trip. |
| Full suite | 55 files / 613 tests pass. |
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
shift-click another, drag the pair, drop one on the other track, Delete the
selection, then reload the page within a second of the last edit and check that
the edit is still there. Drag the timeline sideways and confirm the track names
stay solid on top of the clips while the lanes scroll under them. Click the main
clip: it highlights, the picture does not move, and the tooltips point at
Properties for the trim.
