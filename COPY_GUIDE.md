# Clipwright Studio — Copy Guide

The rules behind every label, message and error in the interface. Written after
reading all 816 user-facing strings in `src/renderer` (19 components), so it
describes the app as it is, not an idealised version of it.

Two things enforce it:

- `src/renderer/copy/labels.ts` — one place that turns stored states
  (`speaker-identification`, `preparing`, `draft`) into readable names.
- `tests/unit/copy-consistency.test.ts` — reads every component with the
  TypeScript parser and fails on the rules below.

---

## 1. Voice

Write like a colleague who knows the app and respects your time.

- Short sentences. One idea each.
- Familiar words. "Download", not "ingest". "Link", not "resource locator".
- Say what happened and what to do next. Never blame the reader.
- No hype. No exclamation marks. No "Oops", "Whoops", "Awesome" or "Success!".
- Address the reader as "you". Never "the user".
- Technical words only when they are the honest word: FFmpeg, codec, LUFS,
  yt-dlp, Whisper. Explain what they mean in the same breath.

## 2. One name for one thing

| Concept | Canonical name | Never say |
| --- | --- | --- |
| A long recording the user imports | **project** | job, session, workspace item |
| The saved media inside a project | **source** / **source media** | footage, input file |
| A sentence-timed line of the transcript | **segment** | block, cue (cue = on-screen caption) |
| A suggested clip from analysis | **moment** | candidate, highlight, suggestion |
| Alternate takes of one moment | **variation** | alt, option, version |
| A finished vertical video file | **render** (verb and noun) | export, encode, output job |
| Copying renders into the exports folder | **export** | render, save down |
| Media added for the timeline | **asset** (per file), **media library** | clip (reserve "clip" for timeline clips), footage |
| The right-hand panel in the editor | **Properties** | inspector, sidebar, panel |
| A cached low-resolution player copy | **preview copy** | proxy, transcode preview |
| Groups derived from voice similarity | **voice groups** | speakers (for the grouping action), diarization |
| Shared edge with black bar | **letterbox** | — (only if needed) |
| A background job in the queue | **job** | task, operation, process |

Screen and section names are fixed points: **Projects**, **Render queue**,
**Settings**, and the project tabs **Source · Transcript · Moments · Clips ·
Renders**.

### Render vs export — the distinction that matters

The app does two different things, and the copy now says so everywhere:

- **Render** produces the MP4 (Settings → "Render at the same time").
- **Export** copies finished renders into `<workspace>/exports` with their
  `.txt` and `.json` metadata.

The editor's main button used to say **Export** but queued a render. It is now
**Render**, with the tooltip "Render this clip. Export the finished file from
the Clips tab." The Clips tab keeps both buttons, so a reader can see the two
steps side by side.

### Voice grouping is not identification

"Identify speakers" promised something the feature does not do. The action is
now **Group voices**, the result is **voice groups**, and the copy states
plainly that groups come from voice similarity and do not identify people.

## 3. Actions

### Verbs

| Verb | Means | Examples |
| --- | --- | --- |
| **Create** | Makes something new that did not exist | Create project |
| **Add** | Adds to something that exists | Add keyframe, Add text layer, Add track |
| **Import** | Brings in a file or link from outside | Import video…, Import file… |
| **Download** | Fetches media over the network | Download full video, Download audio only |
| **Save** | Writes what you typed | Save key |
| **Apply** | Commits a value that takes effect at once | Apply (custom aspect ratio) |
| **Remove** | Takes something out of a collection; the original stays | Remove files (cache), Remove from project |
| **Delete** | Destroys the thing and its contents | Delete project…, Delete clip… |
| **Cancel** | Stops an operation in progress | Cancel download, Cancel transcription |
| **Close** | Dismisses a panel or dialog; nothing is undone | Close properties |
| **Discard** | Throws away interrupted work | Discard (queue) |
| **Keep files** | The safe option in a removal dialog | Keep files |

Rules:

- **Cancel is never "close".** A dialog that only dismisses says **Close** or
  **Later**. A dialog that discards typed input says **Cancel**.
- **Remove ≠ Delete.** Remove leaves the original file alone. Delete destroys
  the record and its files. If the word "Remove" appears, the copy must say what
  survives ("The original file is kept.").
- **Save = typed input.** A settings control that writes on change gets no Save
  button at all. The API-key field is the only explicit save, and the button
  says **Save key**, not a bare "Save".
- **Delete buttons name the object**: *Delete project*, *Delete clip*, never
  "Delete permanently" or "Yes".
- **One primary action per view.** The primary button carries the verb; the
  secondary one carries the escape ("Later", "Keep files").

### Labels are sentence case

"Create project", not "Create Project". Proper nouns and acronyms keep their
case: Clipwright Studio, FFmpeg, Whisper, Anthropic, OpenAI, TikTok, YouTube,
Instagram Reels, EBU R128, SRT/VTT/JSON.

Section headings may keep an ampersand ("Video & rendering", "Storage &
privacy"). Buttons and dialogs never use "&" — write "and".

### Ellipsis means "something comes next"

Use `…` (one character) only when the action opens a file picker, a name prompt
or a confirmation dialog:

- Import video… / Import file… / Save as preset… / Delete project… / Delete clip…
- Not: "Rename" (the field opens in place), "Refresh", "Render".

Never write three full stops. `…` is also used for "still working" labels
("Rendering…", "Saving…"), which never ends in a full stop.

### Sentence punctuation

- No full stop on labels, buttons, headings or tooltips.
- Full sentences in hints and notices take a full stop.
- Ellipsis + full stop never combine.

## 4. Labels and placeholders

- Every field has a **visible label**. Placeholders are examples or formats,
  never the only label. `tests/unit/copy-consistency.test.ts` fails any
  placeholder that has no `aria-label`, `id` or `Field` wrapper.
- Placeholder text shows a realistic value: `Episode 42 — Founder Interview`,
  `00:01:20`, `https://api.openai.com/v1`.
- Units live in the label: "Start — seconds", "Source in (s)", "Fade out (s)",
  "Max output tokens", "Keyframe time (source seconds)". Ranges that are unitless
  in the data (Volume 0–1, Opacity) keep the bare label rather than invent a
  unit.
- Hints sit under the label, explain consequences, and stay under two lines.
  "Non-destructive: the original file is never changed." is a hint; "Noise
  reduction" is a label.

## 5. Errors

Every error answers three questions: **what happened**, **why**, and **what to
do now**. The shared `AppError` already carries `message` + `hint`; the UI never
shows a bare code.

- Name the object and the failure: "The file could not be read. It may have
  moved, or the download was interrupted."
- Give the recovery step: "Restart the preview server, then reload this page."
- Keep cause lists short and concrete: "The built-in player cannot decode this
  video codec."
- Never: "An error occurred", "Something went wrong", "Unexpected error",
  "Invalid input", "Please try again later".
- A question is not an error message. "The upload failed — is the preview server
  still running?" became "The file could not be uploaded. The preview server may
  have stopped — restart it, then try again."

## 6. Notifications

A toast says what actually happened, in past tense, about the specific object.

- Good: "Deleted project “Episode 42”. Exported files were kept."
- Good: "Exported 2 clips to the exports folder." + hint about the metadata file.
- Good: "Voice groups are ready." + hint "Check the speaker on each line…"
- Never: "Success", "Done", "Saved successfully!".
- One optional hint line, one optional action ("Show in folder", "Open queue").
- Progress toasts use present tense with a job name: "Render queued.", "Importing
  3 media files into the project."
- Failures in the background (import, render) surface as errors with the server
  hint attached, not as silent rows.

## 7. Dialogs

Structure: **title asks about the action**, body states the consequence, footer
buttons are the verb and the escape.

- Title: "Delete project?" / "Remove these files?" / "Delete clip?"
- Body: what is removed, what survives, and whether it can be undone.
  "“Episode 42” and all of its imported media, transcripts, clips and renders
  will be removed from the workspace. Files already exported to the exports
  folder are kept." + "This cannot be undone."
- Buttons: **Keep files** / **Remove 3 files**; **Cancel** / **Delete project**.
- The destructive button repeats the verb from the title, never "OK" or "Yes".
- Confirm only for destructive or irreversible work: deleting projects, clips
  and cached files. Renaming, framing, trimming and metadata edits are undoable
  or non-destructive and confirm nothing.

## 8. Empty, loading and error states

- **Empty:** title names the situation ("No clips yet"), one or two sentences say
  how to create the first one, and there is a way forward where the screen allows
  it.
- **Loading:** name the operation, not the machinery. "Scanning for files that
  can be removed…", "Building preview copy…", "Downloading only this moment's
  video section.", "Transcription… 45%".
- **Error:** see §5, with a retry button labelled for the retry ("Scan again",
  "Retry render", "Try playing again").

## 9. Numbers, units and encodings

- Distances and durations: `45s`, `2.5s`, `00:01:20`, `1.2 GB`, `1920×1080`.
  A space between number and unit for file sizes, none for seconds in UI chips
  where space is tight ("45s"), and always `×` between dimensions.
- Counts always go through `plural()`: "1 clip", "2 clips", "0 files".
- Scores are shown out of 100: "78/100". The breakdown note says the estimate is
  not a prediction of views.
- Punctuation characters used on purpose:
  - `·` separates short facts in one line.
  - `—` introduces an explanation inside a label or sentence.
  - `–` joins a range ("15–30s", "Pause 00:01:20 – 00:01:24").
  - `“ ”` for quoted names and hooks; never straight quotes in interface copy.
- Never use a hyphen where a dash or a full stop belongs ("Center crop — safe
  default", not "Center crop - safe default").

## 10. Platform and privacy statements

These sentences make promises. Keep them factual and keep them short:

- "Your videos stay on this computer by default. Cloud features are used only
  when you choose them."
- "Sends transcript text only, never the video."
- "The key is kept in a protected file inside the workspace. It is never written
  to the database, the logs or a diagnostics report."
- "Groups come from voice similarity on this computer. They do not identify real
  people."

Do not add promises the app cannot keep (no "100% private", no "never leaves
your device" while a cloud provider is configured).

## 11. What changed in this pass

Screen by screen, the load-bearing changes:

- **Shell / navigation** — "1 to recover" → "1 interrupted job"; toast close is
  "Dismiss notification".
- **Projects** — "Import video…" (opens a picker); URL note no longer assumes
  yt-dlp is installed; delete dialog button "Delete project"; delete toast
  states that exports survive; counters use `plural()`.
- **Project header / tabs** — "Refresh project", "Back to projects" tooltips;
  project-not-found message says the project may have been deleted.
- **Source** — "Video or page link" is a real label; "Download part of a video",
  "Audio-only import", "Download audio only"; player errors name the cause and
  what still works; "Integrate/link" jargon removed; storage button "Show in
  folder".
- **Transcript** — "Transcribe in cloud" (was "Via cloud"), "Group voices" (was
  "Identify speakers"), "Voice groups", "No speaker" (was "Unassigned"),
  search empty state explains how to clear it, import toast uses `plural()`.
- **Moments** — counts read "3 moments · 2 variations" (no "candidates");
  buttons "Analyze offline" / "Analyze with Anthropic" / "Analyze with your AI
  endpoint"; "sends transcript text only — never the video" is now a sentence;
  score note credits the provider by name.
- **Clips** — clip status is "Draft"/"Rendered" (never raw enums); "Export all
  rendered clips"; export toast names the folder and the metadata file; menu item
  "Copy title, description and hashtags".
- **Renders** — stage labels are words ("Encoding", "Checking the file"), status
  chips read "Waiting"/"Rendering"/"Completed", "Show in folder".
- **Render queue** — job types are readable ("Moment analysis", "Voice
  grouping"), table headers "Job · Project · Status · Details · Finished",
  "These jobs were still running when the app last closed. Nothing was
  corrupted."
- **Settings** — "Check again" (was "Re-check"); option separators normalised to
  " — "; "Default clip length"; "Render at the same time"; "Save key"; the
  remove-key icon has an accessible name; base URL and model hints explain the
  endpoint without example-laden labels; cleanup dialog is "Remove these files?"
  with "Keep files" / "Remove 3 files" and no "file(s)".
- **Editor** — main button "Render" (see §2); "Properties" replaces "inspector";
  "This video cannot be played here"; "Preview copy" replaces "proxy"; caption
  count uses `plural()`; "Nothing selected" replaces "Select a clip to edit";
  "Add keyframe", "Reset colors", "Reset output", "Detect pauses";
  "Colors, outline & alignment" (one spelling of colour); metadata buttons
  "Copy metadata" / "Generate metadata".
- **Timeline** — "Delete selected timeline item", track counters use `plural()`,
  inspector labels carry units, "Missing media".
- **Onboarding** — "Edit and render" (matches the vocabulary), "FFmpeg is
  missing" with an install-and-retry step.
- **Updates** — "Update could not be downloaded", "Check again", no promise that
  the app will "ask before restarting" beyond what happens.

## 12. Adding copy later

1. Reuse an existing verb from §3 before inventing one.
2. Take state names from `copy/labels.ts`; never print a stored enum.
3. Counts go through `plural()`.
4. New destructive action? Title, consequence, verb button, and a confirmation.
5. Run `npx vitest run tests/unit/copy-consistency.test.ts`. It fails on three
   dots, vague system words, Title Case buttons, bare OK/Submit, unlabelled icon
   buttons, tooltips over 90 characters, and placeholder-only fields.


---

## Saving, undo and deletion wording

These strings are load-bearing: they are the only place the app tells the user
whether their work is safe. Keep them literal.

| State | Where | Text |
| --- | --- | --- |
| writing | editor top bar, settings header | `Saving…` |
| confirmed on disk | editor top bar | `All changes saved` |
| not sent yet | editor top bar | `Unsaved changes` |
| write failed | editor top bar | `Save failed` + button `Retry save` |
| recovered draft | editor strip | `Unsaved changes from <date> were found for this clip.` + `Restore changes` / `Discard` |
| leaving editor | dialog title | `Leave without saving?` + `Keep editing` / `Try saving again` / `Leave and discard changes` |

Rules:

* Never show `All changes saved` until the write has resolved. The word
  "Saved" alone is not enough — say what was saved and where it is.
* Failures name what happened and what to do: "Your clip edit is still in
  memory, but Clipwright could not write it to disk." plus a retry hint. Do
  not say "Save error" or "Something went wrong".
* Undo lives in the toast that follows the action, labelled exactly `Undo`.
  The confirmation in front of it must not claim a delete is permanent when
  Undo exists: "You can undo this from the message that appears."
* Permanent actions say so plainly and differently from reversible ones:
  "This is permanent: a deleted project cannot be brought back. Deleting a
  single clip can be undone."
* For irreversible deletes, the confirm button names the object
  (`Delete project`, `Delete clip`), never `OK`, and the dialog may ask the
  user to type the project name under a label that repeats it:
  `Type “<name>” to confirm`.
* Settings: "Saved" in the header refers to the setting just changed, not to
  the whole app.
