# Windows desktop integration

**Date:** 2026-10-26
**Scope:** file hand-off, drop targets, native dialogs, clipboard, notifications,
window behaviour and application identity.
**Rule followed:** use what Electron and Windows already provide, add no
dependency, and do not invent an integration the product has no use for.

---

## 1. What was there before

| Piece | Before | Problem |
| --- | --- | --- |
| Window position | `new BrowserWindow({ width: 1440, height: 900 })` every launch | The window reopened in the same place regardless of where you left it, and on a smaller monitor than last time it could open off-screen. |
| Opening a file from Explorer | nothing | Dropping a video on the executable or choosing *Open with…* launched the app and ignored the file. |
| Drop inside the app | media panel and timeline only | Dropping on the Projects page did nothing, and there was no signal that a drop was even possible. |
| Notifications | none | A ten-minute transcription finishing while you were in another window told you nothing. |
| Taskbar | none | A render in progress was invisible unless the window was open on the queue. |
| Recent projects | one list, sorted by edit time, inside the app | Nothing on the Windows side; the jump list was empty. |
| Clipboard | `clipboard.writeText` | A transcript pasted into Word arrived as one wall of text with no structure. |
| Quitting with unsaved edits | the window just closed | A debounced edit could be lost between the keystroke and the write. The draft journal helped on the next launch, but nothing asked first. |
| App identity | none | Windows notifications and taskbar grouping need an explicit AppUserModelID; without one a toast appears unnamed. |

---

## 2. What exists now

### 2.1 Files Windows hands the app

Three routes, one parser (`src/main/desktop/open-files.ts`):

- a file dropped on the executable;
- *Open with…* from Explorer;
- a *SendTo* shortcut.

All three arrive as `argv`. The parser ignores flags, Electron's development
argument (`.`), anything with an extension this app cannot import, duplicates
and anything that is not a file on disk. It is parsed **before** the single
instance lock, so a second copy of the app hands its files to the running one
through `second-instance`. macOS gets the same treatment through `open-file`.

The hand-off has exactly one owner: the renderer calls `rendererReady()` on mount
and receives any pending paths **in the reply**, not as an event, so a file can
never be imported twice by a race between the two.

### 2.2 Dropping files inside the window

`components/FileDropOverlay.tsx` is a window-level drop target:

- it only reacts to drags that carry files (`dataTransfer.types` includes
  `Files`), so dragging a timeline clip around never triggers it;
- the overlay is `pointer-events: none`: it is a hint, and the drop still lands
  on whatever is under the cursor;
- a panel that handles its own drop (media library, timeline) calls
  `preventDefault`, and the window handler skips those;
- Escape cancels; leaving the window clears it.

What a drop does (`features/import/importFiles.ts`, one rule set for drops,
*Open with* and the command line):

| Situation | Result |
| --- | --- |
| Nothing open, media files | A project is created and named after the first file, imported, opened; any remaining files join it as assets. A failed import deletes the empty project it created. |
| A project open, media files | Added as **assets** of that project — the source is never replaced by accident. |
| `.srt` / `.vtt` / `.json` / `.txt` with a project open | Imported as the transcript, with the segment count in the toast. |
| Transcript with no project | Explained, not swallowed: "Open a project before adding a transcript." |
| Unsupported files | One warning naming up to three of them and listing what is supported. |
| A file from a web page inside Electron | "That item has no file on disk to import." |
| Browser preview | The file is uploaded first, then imported through the same path. |

### 2.3 Native dialogs

- Media and transcript pickers (existing).
- **Save a copy…** on a finished render (`system.saveFileAs`): the OS save
  dialog, starting in Videos, suggesting the clip's own name, with Windows'
  own overwrite confirmation. The source path must be inside the workspace and
  the suggested name is stripped of separators, control characters and
  traversal before it reaches the dialog. In the browser preview the same button
  falls back to a normal download.

### 2.4 Clipboard

| Operation | Detail |
| --- | --- |
| Copy transcript | Plain text **and** HTML: timecodes bold, one paragraph per segment, speakers italic. Pasted into Word it keeps its shape; pasted into an editor it is plain text. |
| Copy title/description | Plain text (unchanged). |
| Paste into a link field | A paste longer than 2 048 characters is capped at the field, with a toast saying so, instead of putting a whole document into React state and a URL validator. Line breaks from a copied link are collapsed. |
| Copy / cut / select-all in text fields | Untouched. The command system never claims a Ctrl+C/V/X shortcut; its only key handling skips events from inputs entirely. |

All clipboard text is escaped before it becomes HTML, and both the text and the
HTML are length-bounded by the payload schema before they can reach the OS.

### 2.5 Notifications

`src/main/desktop/notifications.ts` decides from a **pure function**:

- only while the window is minimised, unfocused or hidden — anything already on
  screen stays on screen;
- only for work that takes time: transcription, analysis, speaker
  identification, downloads, renders. Thumbnails, proxies and asset imports are
  silent;
- a render is announced once, from `render:state`, not twice through the task
  row that mirrors it;
- each job notifies at most once, keyed by task/render id;
- failures carry the reason, trimmed to 140 characters.

Clicking a notification restores and focuses the window and opens the render
queue (for renders) or the project that owns the job. Switching them off is
**Settings → Advanced → Interface → Desktop notifications**; the OS-level
permission always wins, and `Notification.isSupported()` is checked first.

`app.setAppUserModelId('com.clipwright.studio')` matches the installer's `appId`,
so the toast is named and grouped with the app.

### 2.6 Window behaviour

- Position, size and the maximised state are remembered in
  `userData/window-state.json` (written atomically, debounced to one write per
  settled drag, and again on close).
- Every restore is clamped, in DIP, against the work areas that exist **now**:
  a window saved on a 4K monitor that is no longer connected opens centred on
  the current primary display at a size that fits; a window saved wider than the
  screen is narrowed; one saved below 1024×680 is grown to the minimum.
- Display changes at runtime (`display-removed`, `display-added`,
  `display-metrics-changed`) pull the window back on screen.
- The window is shown on `ready-to-show`, so there is no white flash and no
  jump from the default position to the restored one.
- Closing with unsaved work asks in a **native dialog**: *Save and quit* /
  *Quit without saving* / *Cancel*. *Save and quit* asks the editor to write what
  it still holds (the same flush the editor uses when you leave it) and then
  flushes the database; if the write fails, a second dialog says so and offers to
  quit anyway or stay. A renderer that never answers cannot block the quit —
  there is a six-second timeout. The same prompt runs from `before-quit`, before
  the backend starts shutting down, so cancelling never leaves a half-stopped
  app.
- Multi-window is deliberately not implemented: one project workspace, one
  window, and a second launch focuses the first (with its files).

### 2.7 Taskbar

- Progress: a real fraction while renders run, indeterminate while a long job
  without a usable percentage runs, cleared when the queue is empty. Values above
  1 are the documented way to ask Windows for the indeterminate bar.
- Jump list: the five most recently edited projects, rebuilt when the project
  list changes, each launching `--open-project <id>`. Only on packaged Windows
  builds — in development `process.execPath` is Electron itself, so the entry
  would start the wrong program.

---

## 3. Deliberately not done

| Not done | Why |
| --- | --- |
| File association for media types (`.mp4`, `.mov`, …) | It would take those types away from the media player on every machine that installs the app. Winamp-style hijacking is not a feature. *Open with…* and drag-onto-the-exe already cover the case, chosen per launch by the user. |
| A custom `.clipwright` document type | Projects are folders with a database, not documents. Inventing a file format to have a double-click would be a new persistence model for a cosmetic win. |
| Copying a **file** to the clipboard (`CF_HDROP`) | Electron 44 replaced the raw clipboard API with the async `ClipboardItem` one, which has no way to write a Windows file-list format. Rather than ship something that silently pastes as text, the app offers *Save a copy…* (native dialog) and *Show in folder*, which cover the same job. |
| Multiple windows / tabs | Nothing in the workflow needs two projects side by side; a second window would duplicate the player and split the render queue. |
| Tray icon and background running | The app is not a service; a tray icon that keeps a renderer alive would change the shutdown and memory story for no asking. |
| Global (system-wide) hotkeys | They would collide with other apps and there is no capture-while-elsewhere workflow. |

---

## 4. Security notes

- The renderer never touches `fs`, `path` or `shell`. The preload exposes named
  calls only; there is no raw `ipcRenderer`.
- `system.saveFileAs` validates: source inside the workspace, source exists and
  is a file, name stripped of `/ \ : * ? " < > |`, control characters and
  trailing dots. Copying only happens after the OS dialog returns a path the
  user chose.
- The media protocol still serves only workspace files and bundled caption fonts
  (unchanged).
- Window state is a 4 KB-capped JSON file; anything unreadable is ignored.
- Notification bodies contain a project-level message, never a path.

---

## 5. Verification

`tests/unit/desktop-integration.test.ts` — **47 tests**:

| Area | What is asserted |
| --- | --- |
| Command-line files | media and transcript accepted; flags, the dev app path, unsupported extensions, missing files and duplicates rejected; relative paths resolved from the reported working directory; capped at 20 / a custom limit; a real temp file accepted through the real `fs.statSync` check |
| Jump list | built only for packaged Windows; capped at five; long names shortened at a word; both `--open-project <id>` and `=` forms; a traversal attempt rejected |
| Window state | first launch centred at 1440×900; a still-valid position restored; second monitor kept; unplugged-monitor window re-centred; nearly-off-screen window pulled back; below-minimum grown; oversized clamped to the display; maximised remembered with its normal bounds; junk input and zero displays fall back without throwing; DIP rounding; a real file round trip through `writeWindowState`/`readWindowState` with a smaller display, a corrupt file and an oversized file |
| Notifications | background-only; quiet job types skipped; renders announced once from `render:state`; failure text trimmed; setting and OS support respected; progress and unrelated events ignored; each job once; a throwing host does not propagate; click target = queue or owning project |
| File kinds | source vs asset rules (an image cannot be a source), transcripts, unknown extensions, `.hidden`, duplicates, the copy used in warnings |
| Quit flush | all screens awaited; a failing or throwing screen reported as unsaved; no screens = success |
| Clipboard | HTML escaping; payload bounds for text and HTML |
| Wiring | AppUserModelID present; close prompt and its six-second timeout; second-instance hand-off; no raw `ipcRenderer`/`require` in preload; workspace + name validation on save-as; overwrite confirmation requested; notification preference on by default and schema-validated |
| Drop overlay | never takes the pointer; sits below toasts; uses tokens |

Full suite: **51 files / 551 tests pass**; `tsc` clean for both projects; build
clean (`index-CR8LxnX0.js` 1 377 kB, `index-BptInCc1.css` 151 kB — +19 kB JS for
this pass, no new dependency).

### 5.1 What could not be verified here

This sandbox has **no Windows machine, no display and no Electron binary** (the
runtime download is blocked), so the following are covered by their rules and by
the code contract, not by observation:

- a toast actually appearing in the Windows Action Center;
- the taskbar progress bar and the jump list rendering;
- the OS save dialog and its overwrite prompt;
- dragging a file from Explorer onto the window or the executable;
- the native close prompt.

### 5.2 Manual check on Windows (5 minutes)

1. Open a clip, change the title, and close the window with the X → the dialog
   appears. Choose **Cancel**, then close again and choose **Save and quit**;
   reopen and confirm the title is the new one.
2. Move and resize the window, quit, relaunch → same position and size.
   Maximise, quit, relaunch → opens maximised.
3. Start a transcription and switch to another window → a named notification
   appears when it finishes; clicking it focuses the app on the project. Turn
   *Settings → Advanced → Interface → Desktop notifications* off and repeat → no
   notification.
4. Queue several renders → the taskbar button shows progress; the icon's jump
   list shows recent projects; choosing one opens that project in the running app.
5. Drag a `.mp4` from Explorer onto the Projects page → a project is created and
   imported. Drag it onto the media panel of an open project → it becomes an
   asset. Drag a `.docx` anywhere → one warning naming the file.
6. Right-click a finished render → **Save a copy…**, choose a location that
   already has a file → Windows asks before replacing.
7. Copy a transcript, paste into Word → timecodes bold, one paragraph per line.
8. Unplug the monitor the window is on → the window moves onto the remaining
   display.
