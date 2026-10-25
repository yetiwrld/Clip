# Data safety: autosave, undo and recovery

What happens to your work between one click and the next, and what the app
promises when it says a change is saved.

Last updated: 2026-10-26.

---

## 1. Where data lives

| Layer | What it holds | How it is written |
| --- | --- | --- |
| SQLite database (`<workspace>/database/app.db`) | projects, clips, timelines, transcripts, moments, renders, assets, settings, tasks | whole-file export → temp file → atomic rename |
| Project folders (`<workspace>/projects/<id>/…`) | imported media, thumbnails, caches | copied in on import, never edited in place |
| Exports (`<workspace>/exports/…`) | finished videos plus `.txt` / `.json` metadata | written once, never touched by the app later |
| Draft journal (`localStorage`, one key per clip) | the last edits that had not reached the database yet | written during the autosave debounce, cleared after a confirmed save |

There is no server and no account. Everything above is on the machine running
the app.

## 2. What saves automatically

* **Clip edits** — title, trim, crop, framing, captions, silence cuts, text
  layers, camera keyframes, background removal, output settings. Debounced 700 ms
  after the last change, merged per clip, written in order.
* **Timeline changes** — debounced 450 ms.
* **Settings** — written immediately on change; text fields on blur or Enter.
* **Project name and project settings** — written when changed.
* **Speaker names and segment assignments** — written when changed.
* **Anything that takes longer than a moment** (transcription, analysis,
  renders, imports) runs on the task queue and writes its own result when it
  finishes; an interrupted task is marked `interrupted` and can be resumed.

Not autosaved on purpose: playhead position, open panels, tool selection and
other view state. Those are not work.

## 3. "Saved" means written

A backend call returning success used to mean "applied in memory". For user
data that is not good enough, so:

* every method in `DURABLE_METHODS` (`src/main/ipc/backend.ts`) flushes the
  database before it returns;
* the flush is a real write to a temp file followed by an atomic rename;
* if the write fails the call throws `STORAGE_WRITE_FAILED`, and the change
  stays pending for the next attempt;
* the editor shows one of four states — **Saving…**, **All changes saved**,
  **Unsaved changes**, **Save failed** — and `All changes saved` is only set
  after `storage.flush` has resolved.

The database keeps `pending` set until bytes reach the disk. A failed write is
retried by the next edit, the next flush, or shutdown, and it no longer breaks
the write queue for later saves (previously one failure could poison the
chain).

## 4. Failures

| Situation | What the user sees | What happens to the data |
| --- | --- | --- |
| Disk full / folder not writable | "Save failed" in the editor with **Retry save**, plus a toast with the reason and a hint | The change stays in memory and in the draft journal |
| App killed mid-write | Nothing at the time | The atomic rename means the previous good file survives; the `.tmp` file is ignored on next start |
| Database file unreadable at startup | Warning toast: the old file was kept as `app.db.corrupt-<time>` | The app opens with a fresh database instead of refusing to start |
| Save attempt during slow disk | "Saving…" stays until it resolves | Writes are serialised, so an older write can never land after a newer one |

## 5. Undo and redo

* **Ctrl/Cmd+Z**, **Ctrl/Cmd+Shift+Z** and **Ctrl/Cmd+Y** — clip edits and
  timeline edits in the editor, with the most recent of the two histories
  winning. Shortcuts are ignored while focus is in a text field, so the field's
  own undo works.
* History is capped at 50 snapshots per clip and reset when a different clip is
  opened, so one clip's history can never be applied to another.
* **Undo for deletion** — deleting a clip removes it immediately and shows an
  Undo action for 12 seconds. The backend captures the clip, its timeline and
  its render records before deleting, so Undo restores all three.
* **Not undoable**: deleting a project, removing an imported asset (its project
  copy is deleted), running a cleanup in Settings, and anything the backend
  writes outside the editor. Each of those has a confirmation that says so in
  words.

## 6. Recovery after a crash

The draft journal (`src/renderer/persistence/draft-journal.ts`) keeps the edits
inside the autosave window:

* written at most every 150 ms per clip, merged into one record;
* bounded to 512 KB — an oversized record drops the timeline first, then is
  skipped rather than blocking editing;
* validated on read; unreadable, foreign or older-format records are deleted
  instead of shown;
* offered back as **Restore changes** / **Discard** only when the draft is
  newer than the saved clip, so a slow background write can never resurrect old
  text over newer data;
* a restore goes through the normal edit path, so it is autosaved and undoable.

The desktop window is deliberately *not* blocked on close: Electron cancels the
close silently, which reads as the app refusing to quit. The journal exists so a
close cannot lose the last edits, and the editor flushes on unmount either way.

If the app closed while a write was still failing, the editor opens with that
draft offered and the status shows what happened.

## 7. Destructive actions

| Action | Reversible? | Safeguard |
| --- | --- | --- |
| Delete a clip | Yes, for 12 s | Confirmation naming the clip, then Undo in the toast |
| Delete a project | No | Confirmation listing what is removed, plus typing the project name |
| Remove an asset | No | Native confirmation saying the project copy is deleted, original untouched |
| Cleanup caches | No, but only regenerable files | Scan first, explicit category selection |
| Leave the editor with unwritten edits | — | "Leave without saving?" dialog; the draft is kept either way |
| Close a browser-preview tab mid-write | — | The browser's own "leave site?" prompt |

## 8. Tests

* `app/tests/unit/draft-journal.test.ts` — merge, corrupt, version, oversize,
  refused-write, newer-than checks (11 tests).
* `app/tests/integration/persistence.test.ts` — restart durability, failed
  write + retry, 25 rapid writes ending with the newest value, corrupt database
  quarantine, leftover `.tmp` file, delete → undo round trip, double restore
  (7 tests).
* `app/tests/unit/durable-saves.test.ts` — guard that pins the contract: the
  user-data methods stay durable, the dispatcher flushes after the handler, the
  database keeps `pending` set on failure, and the editor never sets "saved"
  optimistically (6 tests).
* `app/tests/unit/renderer-api-contract.test.ts` and `schemas.test.ts` keep the
  new methods in the declared IPC surface.

Run them with:

```
cd app
npx tsx scripts/make-fixtures.ts   # once per checkout
npx vitest run tests/unit/draft-journal.test.ts tests/integration/persistence.test.ts
```

## 9. Considered and not built

* **Per-project version history / snapshots.** The database is a single
  SQLite file that is written atomically; clip-level undo plus the draft
  journal cover the realistic loss cases without a second copy of every
  project. Revisit if projects start sharing a workspace across machines.
* **A network sync layer.** There is no remote store, so there is nothing to
  conflict with. The write queue is still serialised per clip so the local
  ordering rule holds if one is added later.
* **Trash folder for deleted projects.** Deleting a project also frees its
  media; a trash that kept gigabytes indefinitely would surprise users more
  than it helps. The typed confirmation is the safeguard, and the dialog says
  the deletion is permanent.
