# UI audit and polish pass

What was wrong with the interface, what was changed, and what is still open.
The rule for this pass: **no redesign**. Same product, same screens, same
graphite-and-orange palette. Only the inconsistencies were removed.

---

## 1. How the audit was done

The renderer could not be run in this environment (no display, no browser),
so the audit was done by reading the code against itself:

* every class used in the `.tsx` files, checked against the stylesheet
  (used-but-unstyled, and styled-but-unused);
* every declared value for type size, weight, line height, radius, spacing and
  z-index, collected and grouped to see how many "one-off" values existed;
* every selector declared more than once, with its copies compared;
* every custom property referenced in the stylesheet, checked against `:root`
  for accidental typos;
* every component that builds a button, dialog, empty state or chip by hand
  instead of using the shared primitive.

The screenshots from the user drive the visual judgement. Anything that could
only be decided by looking at pixels is listed in section 6 instead of being
guessed at.

---

## 2. Findings

### Type was ad hoc

| | before | after |
|---|---|---|
| distinct font sizes | 19 (10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28 …) | 8 |
| font weights | 5 (500, 550, 600, 650, 700) | 3 |
| line heights | 6 mixed unitless and pixel | 5 unitless |

Half-pixel sizes (10.5, 11.5, 12.5) were the worst offenders: at 100 % zoom
they land between device pixels and render as blurry text.

### Corners had no rule

13 different radii in use for the same kinds of surface: 2, 3, 4, 5, 6, 7, 8,
9, 10, 12, 14, 999 and 50 %. A button could be 4 px and the input beside it
7 px.

### Icons were arbitrary

`size={n}` had 11 distinct values across 231 call sites. Icons in one row
could be 13, 14 and 15 px tall.

### The stylesheet had grown by accretion

Roughly a third of the file was override passes appended on top of older
rules — `WORKSPACE PASS`, `CAPTION PROPERTIES`, `UI POLISH PASS` — each
restating selectors instead of editing them.

* 98 selectors were declared more than once; the worst were `.editor-body`
  (11 copies, three different paddings), `.editor-tool-panel` (6),
  `.multi-track-label` (4).
* 57 rules could never match anything: an entire earlier timeline
  implementation (`.tl-*`, `.timeline-ruler`, `.timeline-playhead`,
  `.timeline-tick`, `.timeline-handle` …) plus `.skeleton`, `.fade-in`,
  `.card-title`, `.section-desc`, `.score-ring`.
* 3 custom properties were used but never declared (`--surface-1`,
  `--text-secondary`, `--radius-sm`), so every rule that referenced them fell
  back to "no background" / "no colour".

### Stacking order was guesswork

38 raw z-index integers between 1 and 1000, including `41` and `42` for an
overlay and its drawer, `16` for a dropdown, and `1000` for fullscreen. Two
panels that happened to get the same number would silently overlap.

### Colour was doing decoration

Selection was marked with three different yellows on the timeline
(`#fff0a8`, `#d8e8ff`, `#ffe39a`) on top of the orange accent, so "selected"
meant three different things. Clip colours included a saturated blue border
(`#527fb2`) left over from an earlier theme.

### Component duplication

* `FirstRunModal` rebuilds the modal frame by hand instead of using `Modal`.
* Empty states were styled in five places (`empty`, `asset-empty`,
  `inspector-empty`, `editor-panel-empty`, `settings-empty`) with different
  sizes and colours.
* `.modal-title` was declared twice, `.editor-topbar` three times.

---

## 3. What was changed

1. **One token set** (`:root` in `global.css`) — type scale, weights, line
   heights, radii, control heights, icon sizes, sidebar width, focus ring,
   shadows, motion durations, z-index ladder, spacing scale and density roles.
2. **Bulk conversion** of the values that were already in use: 156 font sizes,
   25 line heights, 61 radii, 51 weights, 4 durations in CSS; 31 inline
   `fontSize` and 231 icon sizes in components. No element changed size by
   more than half a pixel.
3. **Dead CSS removed** — 57 rules, ~430 lines, all unreachable.
4. **Duplicate rules folded** — 46 selectors now declared once, with the
   winning value of each property. 322 lines removed. Where folding would
   have changed which rule wins, the copy was left alone and is listed in
   section 6.
5. **One stacking ladder** — 38 integers replaced by named roles
   (`--z-clip`, `--z-selected`, `--z-handle`, `--z-popover`, `--z-modal` …).
6. **Selection means one thing** — every selected item, in the timeline and on
   the canvas, now uses the orange accent.
7. **States stated once** — a single focus ring, one hover treatment for
   inputs, one disabled treatment, one press treatment. All of them were
   previously re-declared per component with slightly different values.
8. **Tests** — `tests/unit/design-tokens.test.ts` guards the scales and the
   state rules, so the drift cannot come back unnoticed.

Verification: `tsc --noEmit` clean, `electron-vite build` clean,
`vitest run` 36 files / 306 tests green.

---

## 4. What it looks like now

* Top bar: back, project name, clip title on the left; save state, undo/redo,
  timecode, Export on the right. One 50 px row.
* Tool rail 72 px: icon above a 11 px label, single tinted active state.
* Tool panel 212–268 px: heading with one line of description, media as
  16:9 thumbnail tiles in two columns, actions appear on hover.
* Player: 40 px panel title bar, letterboxed canvas, transport docked
  underneath (timecode left, controls centre, speed and fullscreen right).
* Inspector 276–316 px: quiet sentence-case sections, chevron on the right.
* Timeline: icon toolbar, flat tracks, one clip colour family.

---

## 5. Files touched

* `app/src/renderer/styles/global.css` — tokens, dead rules, folded rules,
  stacking ladder, state rules.
* `app/src/renderer/features/**` and `components/ui.tsx` — tokenised sizes.
* `app/tests/unit/design-tokens.test.ts` — new guard.
* `app/scripts/prune-dead-css.py`, `fold-duplicate-rules.py`,
  `tokenise-z-index.py` — the one-shot clean-up scripts, kept so the checks
  can be re-run.

---

## 6. Still open

* **13 selector groups were left unmerged on purpose** — same specificity,
  conflicting declarations, and no way to look at the result here. They need
  a screenshot to decide which value is right:
  `.multi-track-item.image` / `.audio` / `.missing`,
  `.editor-tool-panel .asset-*`, `.inspector-context-heading strong` / `span`,
  `.multi-track-lane`, `.source-track-clip`.
* **`.multi-track-item`** still carries a leftover blue border from an earlier
  theme, overridden by a later rule. Harmless, worth deleting.
* **`FirstRunModal`** still hand-builds its frame.
* **Five empty-state classes** still exist; they now look the same, but they
  should become one class.
* **Nothing has been checked on a real screen yet.** Colour contrast, long
  project names, long caption text, and the 680 px breakpoint all need a look
  at an actual window.

---

# Progressive disclosure pass

Second pass. Same principle as before: nothing was deleted, everything that
was hidden is one predictable click away.

## What was measured

| screen | visible at once before | after |
|---|---|---|
| Editor inspector | 1 collapsed drawer holding 8 fully expanded sections | 9 section rows, 1 open |
| Clip row actions | 6 buttons | 3 buttons + a menu |
| Clip delete | no confirmation | confirmation dialog |
| Timeline toolbar | snap, add track, split, duplicate, delete, zoom, fit | unchanged — already contextual and disabled without a selection |
| Settings | left nav, one section at a time | unchanged — already disclosed |
| Project tabs | toolbars of 2–5 actions | unchanged |

## What changed in the editor inspector

The worst offender was structural rather than visual: **every** control lived
inside one collapsed drawer labelled "Clip, camera & export settings". So the
inspector looked almost empty, and opening that drawer produced a column
about three thousand pixels tall, because eight sections inside it were all
expanded.

Now:

* the drawer is gone — Trim, Silence removal, Audio restoration, Captions,
  Crop & framing, Camera keyframes, Text / graphics, Output & quality and
  Metadata are top-level section rows;
* Trim is open (it is the first task on a clip), everything else is closed;
* each row is a native `<details>`/`<summary>`, so it is keyboard operable and
  announces its expanded state without extra scripting;
* when a caption or a text layer is selected, the inspector still swaps to
  that item's own panel, so the section you need is the one on screen.

## Clip list

`Edit` and `Render` (and `Export` once rendered) stay visible. `Open folder`,
`Copy title, description` and `Delete clip…` moved into a `⋯` menu built from
the same `.menu` component the dashboard already uses.

Deleting a clip now opens a confirmation dialog. It removes the clip's trims,
captions and renders and there is no undo.

## Discoverability and states

* Every icon-only control now has a tooltip; the two overflow menus announce
  `aria-haspopup` and `aria-expanded`.
* Expanded, collapsed, hover, selected and keyboard focus all reuse the
  existing section, menu and focus-ring rules — no new visual language.
* Disabled actions (split, duplicate, delete in the timeline toolbar) remain
  visible with their shortcut in the tooltip, so the function is still
  discoverable.

## Still open

* The `⋯` menu closes on outside click but not on `Escape`.
* The transcript toolbar shows five actions at once (two transcribe buttons,
  speaker detection, import, copy). Acceptable today; a candidate for the same
  menu treatment.

---

# Timeline scrolling pass

The timeline is the only surface in the product that scrolls in two axes, and
it was fighting itself.

## What was broken

1. **Scrolling fought playback.** An effect ran on every `currentTime` change
   and, whenever the playhead was within 220 px of an edge, jumped
   `scrollLeft` by up to 500 px. During playback that fired several times a
   second, so the timeline appeared to lurch sideways on its own. Any manual
   scroll was undone by the next update.
2. **Ctrl + wheel zoomed the whole window.** The zoom handler was a React
   `onWheel`, and React registers wheel events as passive, so
   `preventDefault()` silently did nothing. Chromium then zoomed the app.
3. **The wheel often did nothing.** With no vertical overflow, a plain wheel
   had nothing to scroll and fell through to a page that cannot scroll.
   Horizontal movement was only reachable through the scrollbar.
4. **Dragging drifted once the view moved.** Drag maths used
   `clientX - startX` only, ignoring how far the container had scrolled during
   the gesture, so a clip slid away from the cursor whenever anything scrolled.
5. **The panel resize strip was invisible** — an 11 px band with no grip, and
   its label was `display: none`.
6. **Scrollbars were hard to see** on the timeline surface, and the inspector
   shifted sideways whenever a scrollbar appeared or vanished as a section
   opened.

## What it does now

| gesture | result |
|---|---|
| plain wheel | scrolls the track list; once that is exhausted, scrolls time |
| shift + wheel | always time (horizontal), matching Chromium |
| ctrl / cmd + wheel | zooms around the pointer, keeping that moment under the cursor |
| trackpad horizontal | native |
| drag near an edge | the timeline auto-scrolls and the clip stays under the cursor |
| click a ruler tick | seeks, as before |

* Playback follows the playhead **one frame at a time** at 70 % of the visible
  width, and pauses following for 1.2 s after any manual scroll.
* A seek only moves the view when the playhead is actually off screen, with a
  16 px tolerance, and only while paused. Zooming never moves the view: the
  slider anchors on the centre, the wheel on the pointer, and `Fit` returns to
  zero.
* Drag maths now includes the scroll offset, so a clip cannot drift from the
  pointer during autoscroll, wheel scroll or playback follow.
* The timeline scrollbars are 10 px with a surface-coloured track, and the
  corner where both axes meet stays solid under the sticky ruler.
* The resize strip has a visible grip that widens and turns accent on hover.
* The inspector and the tool panel reserve their scrollbar gutter, so
  expanding a section no longer shifts the content sideways.
* The timeline no longer scrolls the page: `overscroll-behavior: contain`.

## Still open

* The resize strip is mouse-draggable but has no keyboard handling, even
  though it carries `role="separator"`.
* Autoscroll is driven by pointer events, so holding perfectly still at the
  edge advances very slowly.

---

## 2026-10-25 — One layout, one frame

### What was wrong

The screens were each spaced correctly on their own and wrong next to each other.

* **The dashboard had no page header.** Every other screen opened with a title
  and a subtitle; Projects opened with a form.
* **Five left edges on one page.** The page padding was 24px, the project rows
  padded 12px inside it, the URL row padded 8px, the toolbar 0. So the page
  title (when there was one), the project thumbnail, the URL icon and the
  import button all started at different x positions.
* **Hand-spaced rows.** The dashboard's two import rows were flex containers
  with `flex: 1` spacer spans, inline `maxWidth: 420`, an inline border on one
  of them and different paddings on each. Nothing about them was shared.
* **Content stretched to the window.** Lists and settings forms grew with the
  window with no upper bound, so a 1600px window produced 1400px-wide rows of
  three words.
* **Settings had four different two-column form declarations**, all typed out
  inline, all `1fr 1fr`. A bare `1fr` keeps its min-content floor, so one long
  URL in a field could push the whole settings column sideways.
* **Six duplicated editor breakpoints.** The editor body had a fresh
  `grid-template-columns` block added at 1280, 1180 (twice), 1100, 980, 920
  (twice) and 680, without removing the previous ones. The floating tool panel
  was positioned at a hard-coded `left: 68px` while the rail above 1180 was
  72px, and its drawer width at 680 was silently overwritten by a later base
  rule.
* **`<ul>` indents typed inline** in the storage section, and an inline
  `position: fixed` scrim repeated in two screens.

### The frame

Seven tokens, declared once in `:root`:

| token | value | meaning |
|---|---|---|
| `--page-gutter` | 24px | window edge to content. Fixed, not density-scaled: titles must not move between screens. |
| `--row-pad-x` | 8px | inner padding of a list row, table cell or nav item |
| `--row-bleed` | −8px | the negative margin that cancels it |
| `--content-max` | 1180px | widest a list or dashboard may get |
| `--form-max` | 640px | widest a settings form may get |
| `--read-max` | 720px | widest a block of running text may get |
| `--editor-rail-w` | 68px → 52px | editor tool rail, per breakpoint |

`.page` owns the gutter and the centring:

```css
padding-inline: max(var(--page-gutter), (100% - var(--content-max)) / 2);
```

One rule replaces a `max-width` on every page. On a very wide window the
content column centres instead of stretching; the scrollbar stays at the window
edge because `.page` is still full width.

Rows all use the same pair, so text lands on the gutter while hover fills keep
their air:

```css
padding: var(--space-4) var(--row-pad-x);
margin-inline: var(--row-bleed);
```

Applied to `.project-row`, `.queue-row`, `.clip-row`, `.moment-head`,
`.moment-body`, `.task-row`, `.settings-nav` and `.tabs`. Tables get the same
treatment through `.table-wrap`, which also becomes the only horizontal scroll
container in the app.

### Grid instead of offsets

* The two dashboard import rows became **one** `.create-bar` grid with labels.

  ```
  92px | minmax(160px, 420px) | auto | 1fr
  ```

  Both inputs, both buttons and the status note now share column edges at every
  width, and collapse to one column under 760px.
* `.grid` gained `.two`, `.three`, `.split` and `.transcript` variants, all
  `minmax(0, 1fr)`, so a long string can shrink instead of pushing the layout.
  `.split` and `.transcript` stack under 980/900px.
* `.queue-row` uses named areas (`main meta value actions`) instead of child
  order. Under 860px it reflows to two columns with the metadata on its own
  line, so nothing is clipped and the buttons keep the right edge.
* `.row` gained `.between`, `.end`, `.center`, `.top` helpers, replacing inline
  `justifyContent` in the settings sections.

### The editor ladder

One ordered block at the end of the stylesheet now owns the workspace grid:

| width | columns |
|---|---|
| ≥1281 | 68 \| 212–268 \| 1fr \| 276–316 |
| ≤1280 | 64 \| 190–228 \| 1fr \| 240–276 |
| ≤1180 | 60 \| 184–212 \| 1fr \| 232–260 |
| ≤1100 | 56 \| 176–200 \| 1fr \| 224–248 |
| ≤920 | 56 \| 1fr \| 248, panel floats over the stage |
| ≤680 | 52 \| 1fr, inspector becomes a drawer |

The floating panel's `left` is `var(--editor-rail-w)`, so it starts exactly
where the rail ends at every breakpoint. It also spans the full height of the
body now: it used to start 50px down and stop `220px + 30vh` short, which left
a visible gap under a floating panel.

### Other alignment fixes

* Page headers: `.page-heading` takes the free space, so action buttons pin to
  the right edge and a long project name truncates instead of pushing them.
  `.page-subtitle` clamps to two lines.
* Empty states: five inline paddings replaced by `.empty`, `.empty-title`,
  `.empty-copy`, so the four tabs match.
* `.toolbar.plain` replaces three copies of `borderBottom: none, paddingBottom: 0`.
* `.settings-head` + `.spacer` replace `.row` + an inline `flex: 1` span.
* `.menu-scrim` replaces two inline fixed-position layers.
* `.moment-chev` replaces an inline transform with a hard-coded 120ms.
* `.doc-list` / `.doc-sublist` replace inline list indents.

### Guards

`tests/unit/design-tokens.test.ts` gained a `layout` suite: the tokens must
exist, `.page` must own its padding, every list row must use the inset and the
bleed, `.grid.two/three` must use `minmax(0, 1fr)`, wide tables must sit in a
`.table-wrap`, the tool panel must use the rail token, and the four page-level
screens may not introduce inline padding or horizontal margins.

### Not done

* Nothing was checked on a real screen. The alignment is arithmetic, not
  observation, so the numbers in the table above are the part to verify first.
* `.page` centres only above 1180px + 2 × 24px of window, so on a laptop the
  frame is exactly the gutter and nothing visibly changes.
* Per-element vertical margins inside the storage section were left as they
  are: they set rhythm inside one list, not a shared edge.

---

## 2026-10-25 — Command palette and one shortcut registry

The renderer had four independent `keydown` listeners (editor transport,
timeline editing, the mobile inspector drawer, every modal) and no way to
discover any of them. Space played, but only a hard-coded tooltip said so.

* New `src/renderer/commands/` — types, key matching and formatting, fuzzy
  scoring, the registry store, the app and screen catalogs, and the single
  global listener.
* Ctrl+K opens a command palette: fuzzy search, categories, recent actions,
  arrow/Enter/Escape, a listbox with `aria-activedescendant`, focus returned on
  close, and Ctrl+/ switching to a searchable shortcut reference.
* Every command runs a real action through the stores. Project tabs and
  settings sections moved into the app store so the palette can actually switch
  them instead of pretending to.
* Editor and timeline shortcuts were removed from their components and
  registered as commands, with the behaviour supplied through a ref. The
  inspector's Escape listener became a command with `allowInInput`.
  Result: exactly one `addEventListener('keydown')` in the renderer.
* Tooltips for undo/redo, play and clip start now read their key from the
  registry, so a rebinding updates the tooltip.
* Sidebar gained a Shortcuts row with its key hint, so the palette is
  discoverable without knowing Ctrl+K.
* 18 new unit tests; 37 files / 339 tests pass.

---

## 2026-10-25 — Interface copy audit and microcopy pass

Read every user-facing string in the renderer before changing any of them:
816 strings across 19 components (JSX text plus `placeholder`, `title`,
`aria-label` and `alt`), collected with the TypeScript parser so no label hid in
a conditional. The rules and the terminology table now live in `COPY_GUIDE.md`.

### What the audit found

* **One concept, several names.** "Moment" / "candidate" / "highlight"; "render"
  / "export" for the same button; "inspector" / "Properties" for one panel;
  "proxy" / "preview copy"; "asset" / "media"; "speaker identification" for what
  is really voice grouping.
* **One button, two meanings.** The editor's main **Export** button queued a
  render. Export in the Clips tab copies finished renders into
  `<workspace>/exports` with metadata — a different step.
* **Raw stored enums on screen.** `clip.status` printed `draft`/`rendered`; the
  render queue printed `speaker-identification`, `download`, `preparing`,
  `encoding` and lowercase task states.
* **"1 clips" grammar.** Seven hand-rolled singular/plural ternaries, two of them
  wrong for zero.
* **Vague failures.** "Playback problem", "Unable to play this", "Copy failed",
  "Still not detected", "A core media tool is unavailable", and an error written
  as a question ("is the preview server still running?").
* **Copy bugs.** `{cuts.length} detected pauses ? -Xs removed` shipped a literal
  `?`; "Media Missing" and "Media missing" in two files; "Coloureds" vs "color"
  (one British heading in an otherwise American interface); `...` instead of `…`
  in one status label; hyphens used where dashes belonged in six option labels.
* **Unlabelled icon buttons.** The remove-key control and the transcript copy
  control relied on `title` alone, so screen readers announced nothing useful.
* **Placeholder-only fields.** The Source tab's URL input had no visible label,
  and the editor's clip title depended on its placeholder.

### What changed

* New `src/renderer/copy/labels.ts` — job types, render stages, render statuses,
  task states, clip statuses, provider names and `plural()`. Every screen now
  reads its state labels from one place.
* `COPY_GUIDE.md` — voice, the terminology table, the verb table
  (Save/Apply/Cancel/Close/Remove/Delete/Discard/Keep), the ellipsis rule, error
  and toast structure, dialog structure, unit and punctuation rules.
* 14 components edited for copy only. No behaviour, layout or state changed
  except the two accessibility fixes below.
* Editor button, palette command and tooltip renamed Export → **Render** so the
  label matches the action; the Clips tab still owns **Export**.
* Accessibility repairs that came out of the audit: `aria-label` on the
  remove-key and transcript-copy icon buttons, a visible label for the Source URL
  field, `aria-label` on the editor clip-title input, and placeholder search
  fields whose `aria-label` matches the visible text.
* New `tests/unit/copy-consistency.test.ts` (15 tests) reads the components with
  the TypeScript parser and fails on: three-dot ellipses, vague system phrases,
  bare OK/Submit/Yes/No/Done, Title Case button labels, labels ending in a full
  stop, icon-only buttons without `aria-label`, tooltips over 90 characters,
  placeholder-only fields, and double spaces. It also pins the label maps and
  `plural()`.

### Verification

* `npx tsc --noEmit -p tsconfig.web.json` clean.
* `npx electron-vite build` clean.
* `npx vitest run` — 38 files / 356 tests pass, including the 15 new copy tests.
  The integration project needs the gitignored media fixtures, so
  `npx tsx scripts/make-fixtures.ts` (or `npm run fixtures`) has to run once
  after a fresh checkout; it did here before the final run.
* Preview rebuilt on `0.0.0.0:8787`; the served bundle hash changed from
  `index-DKqx6dvl.js` to `index-D8G-yyJa.js` and the stylesheet hash did not
  change, which is the expected signature of a copy-only pass.

### Not done

* Nothing was seen on screen. Every claim about clipping and wrapping is
  reasoned from label lengths and the existing classes, not observed. The three
  strings worth checking first are the editor's new "Render" tooltip, the
  Settings cleanup dialog buttons ("Keep files" / "Remove 3 files") and the
  transcript toolbar ("Transcribe locally" / "Transcribe in cloud" / "Group
  voices" / "Import file…"), which is the tightest row in the app.
* `Field` renders a visible label but does not associate it with its input
  (`htmlFor` / `aria-labelledby`). Fixing that belongs with the shared form
  components, not with copy.
* Native `window.prompt` is still used for renaming an asset and naming a caption
  preset. The wording is now clear, the dialog is not.

---

## 2026-10-25 — Dashboard create bar: two rows, three columns

The create bar was one grid with four columns and the labels typed into it in
DOM order, so the `From URL` label landed at the end of the first row. The URL
field then wrapped into the 92px label column on the second row, which made the
two rows read as unrelated fragments.

* `.create-bar` is now three columns — label · field · action — with
  `justify-content: start` so the auto column cannot absorb the free space.
* Both rows share those columns: the project name and the URL field keep one
  width (up to 420px), and the two buttons stretch to the same width because
  they share the auto column.
* Row gap opened from 8px to 12px, matching the column gap, so the two rows read
  as one form instead of two lines of text.
* Below 760px the bar collapses to field + action with the label above, as
  before.
* URL placeholder shortened to "Paste a media URL you have the right to use" so
  it fits the 420px field instead of being cut off.
* `design-tokens.test.ts` now pins the three-column template and the DOM order
  inside the bar (label, field, action; twice; note last), so the row structure
  cannot silently break again.

Verified: `tsc` clean, build clean, unit project 30 files / 260 tests pass. The
served stylesheet carries the new rule and the served bundle hash changed to
`index-CWqnWCu8.js` / `index-Ckb1PPHc.css`. Still not seen on screen — the
column widths are arithmetic, not observation.

---

## 2026-10-26 — Data safety: autosave truth, undo for deletion, crash recovery

The audit started from the storage layer because "Saved" is a promise about
bytes, and the interface was making that promise before the bytes existed.

### What the existing system already did well

* SQLite via sql.js with atomic whole-file writes (temp file → rename).
* Debounced clip autosave (700 ms) and timeline autosave (450 ms), merged per
  clip, serialised through a promise queue, flushed on `pagehide` and unmount.
* Undo/redo in the editor with snapshot history, a shortcut registry that
  already ignores text fields, and a timeline history merged into the same
  Ctrl+Z.
* Task and render recovery at startup for interrupted background work.

None of that was replaced. The work below closes the gaps around it.

### Gaps found

1. **"Saved" could be false.** `clips.update` resolved when the change reached
   the in-memory database. The file write was debounced 250 ms and its failure
   was swallowed, so the editor could show "Saved" for a change that never
   reached disk.
2. **A failed write disabled all later writes.** `persistNow` cleared `pending`
   before writing and chained the write with `.then`; after one failure the
   queue stayed rejected and the dirty flag was re-set only by the debounce
   callback, so nothing retried.
3. **No failure state.** The save indicator had three states; a failed write
   fell back to "Unsaved changes" with a toast, and the failure was invisible
   one second later.
4. **Timeline edits never showed as unsaved.** `scheduleTimelineSave` did not
   touch the save state, so a timeline drag showed "Saved" while the write was
   still pending.
5. **A crash inside the debounce window lost the edit.** There was no local
   copy between "typed" and "written".
6. **Clip deletion destroyed work with no way back**, and said "this cannot be
   undone" next to a plain confirm.
7. **A corrupt database file stopped the app from starting at all.**
8. **Project deletion was one Enter away.** The dialog listed consequences but
   the confirm button was ordinary.

### What changed

* `AppDatabase.persistNow()` keeps `pending` set until the rename succeeds,
  never poisons the queue on failure, records `lastError`/`lastPersistedAt`,
  and reports all of it through `status()`. `close()` flushes and rethrows
  instead of silently dropping the last write.
* New `flushDurability()` service + `storage.status` / `storage.flush` IPC.
  Every user-data method in the dispatcher (`DURABLE_METHODS`) flushes before
  it returns, so a resolved save is a written save. Failures raise
  `STORAGE_WRITE_FAILED` with the "still in memory" explanation and a retry
  hint.
* Editor save indicator: **Saving… / All changes saved / Unsaved changes /
  Save failed**, with an inline **Retry save** when it failed, `aria-live`, and
  no success state before the flush resolves. Timeline saves now feed the same
  state.
* Draft journal (`src/renderer/persistence/draft-journal.ts`) + recovery strip:
  "Unsaved changes from <time> were found for this clip" with **Restore
  changes** / **Discard**. Versioned, size-capped, corruption-tolerant, and
  only offered when newer than the stored clip.
* Leaving the editor with unwritten edits opens **Leave without saving?**
  (Keep editing / Try saving again / Leave and discard changes), and the window
  warns on `beforeunload` while a write is outstanding.
* **Undo for clip deletion.** `clips.delete` now returns a snapshot (row,
  timeline, render records) and `clips.restore` puts it back in one
  transaction; the toast carries **Undo** for 12 seconds. The dialog says the
  delete is undoable and that finished renders stay on disk.
* **Project deletion** now requires typing the project name; the dialog states
  that this one is permanent and contrasts it with clip deletion. Implemented
  as a new shared `ConfirmDialog` in `components/ui.tsx` (also used to keep the
  dashboard and Source tab dialogs identical).
* **Settings** show **Saving… / Saved / Save failed** in the page header;
  settings writes are durable too.
* **Corrupt database** is moved to `app.db.corrupt-<time>` and the app starts
  fresh with a warning toast naming the kept file, instead of failing to boot.
* Asset removal copy now says the project's copy is deleted (the original is
  not), because that one really is permanent.

### Not changed on purpose

Clip deletion still asks for confirmation even though it can be undone: the
settings on a clip are hand-made and the Undo toast is time-limited. Project
deletion stays permanent — a trash folder that keeps gigabytes of media would
be a worse surprise than a typed confirmation. Both decisions are written down
in `DATA_SAFETY.md` §7 and §9.

### Verification

* `tsc --noEmit -p tsconfig.web.json` clean; `electron-vite build` clean.
* New: `tests/unit/draft-journal.test.ts` (11 tests),
  `tests/integration/persistence.test.ts` (7 tests: restart, failed write +
  retry, 25 rapid writes, corrupt database, leftover temp file, delete → undo,
  double restore).
* `tests/unit/durable-saves.test.ts` (6 tests) pins the contract itself: durable
  methods stay listed, the dispatcher flushes after the handler, `pending`
  survives a failed write, and the editor has no optimistic "saved".
* `schemas.test.ts` and `renderer-api-contract.test.ts` extended for the three
  new methods.
* Full suite: 41 files / 381 tests pass. `electron-vite build` clean; the
  preview backend answers `storage.status` / `storage.flush` and a create →
  delete round trip over the live server leaves the database clean.

---

## 2026-10-26 — UI consistency audit and visual regression system

The goal was not a redesign. It was to find the places where the interface had
drifted from its own rules, fix the ones that were clearly wrong, and leave a
process that makes the next drift visible in a test instead of in a screenshot
thread.

### How the audit was done

* One stylesheet (`src/renderer/styles/global.css`, ~4.6k lines) and one
  primitives module (`components/ui.tsx`) hold the whole design system, so the
  audit could be done by parsing rather than by eye: rules, declarations,
  tokens, inline styles and class usage were all extracted and compared.
* Every screen was read for inline styles: 205 `style={{ … }}` props across 13
  renderer files, 17 of which carried a value that was not a token.
* No headless browser exists in this project and adding one is a dependency
  decision, so nothing here is a screenshot. **Layout findings are arithmetic
  and static, not observed.** The window-size and 200 % zoom matrix is still a
  manual pass (see "Still open").

### Fixed: colour literals in the chrome (severity: medium)

The chrome had picked up one-off `rgba()`/hex values for the same three ideas
spelled many ways: tinted borders on chips, the error box, the transcript mark,
the selection highlight, and two backdrops. The first pass moved them onto
tokens; the guard then caught the last four stragglers.

* New tokens: `--success-border`, `--warn-border`, `--danger-border`,
  `--danger-border-strong`, `--mark`, `--selection`, `--scrim`, `--scrim-soft`.
* Three backdrop opacities (`.55`, `.58`, `.6`, `.8`) became two scrim tokens.
  `.editor-inspector-backdrop` and `.editor-tool-panel .asset-actions` had
  drifted off the set; both now use `var(--scrim)`.
* `.render-thumb` (renders list) used a raw `#000`; it is `var(--stage)`.
* Chrome literals: **0**, now held by a test. The media/timeline layer
  keeps its own clip colours deliberately; the test allows that area but counts
  it (**87** literals) so the number can only go down.

### Fixed: type scale bypasses (severity: medium)

* Six `font:` shorthands (`font: 9px var(--mono)`, `font: inherit`, …) reset the
  whole type scale and then only fixed the size. All are longhands now.
* Two mono labels were set at 9px, off the scale (`--fs-micro` is 10px). They
  now use the token.
* Eight inline `lineHeight: 1.55 / 1.6` values (dialog bodies, section hints,
  moment explanations) collapsed onto one rule pair: `.text-body` for running
  text, `.section-hint` for the explanation under a section title.
* Inline `fontWeight: 550` (a weight that exists in no token) became
  `var(--fw-medium)`; inline `borderRadius: 8 / 4` became `var(--radius-lg)` and
  `var(--radius)`.

### Fixed: stacking, radii, states and containment

* Nine raw `z-index` numbers in the timeline block were mapped onto the ladder
  that already existed (`--z-raised`, `--z-clip`, `--z-marker`, `--z-handle`,
  `--z-sticky`, `--z-top`), preserving each value exactly.
* Four `border-radius: 50%` circles now use `--radius-round`.
* `--speed: 120ms` was a second name for `--dur-fast: 120ms`; 20 uses retired,
  the duplicate token deleted. `.btn:disabled` declared its opacity twice
  (0.45 then 0.5, so only 0.5 ever applied); it is declared once now.
* Two rules asked for truncation they could not perform: `.track-title input`
  had `text-overflow` with no `overflow`, and `.save-state-text` had ellipsis
  with no `nowrap`. Both fixed — the state text now truncates instead of
  wrapping the top bar.
* `.toasts` was pinned `16px` from the corner with a fixed width; it now uses
  `--space-5` and `min(380px, calc(100vw - var(--space-8)))` so it cannot cross
  the right edge on a narrow window. `.menu` gained `max-height: 60vh` with
  scroll, so a long command menu cannot run off the bottom.
* `.modal-foot` wraps its buttons. The command palette dropped a hint by
  `nth-child(3)` (fragile); the hint carries a class now, and the small-screen
  palette height is capped at `min(76vh, 560px)` instead of overriding the base
  `min(62vh, 560px)` with a taller value.
* `.render-thumb` replaced an inline-styled `<video>` in the renders list.

### Fixed: accessibility (severity: high, small change)

`Field` never bound its label to its control: `htmlFor` was absent, so clicking
a settings label did nothing and a screen reader announced an unnamed select.
`Field` now generates an id, binds the label, and points `aria-describedby` at
the hint — but only when the child is a single native `input`/`select`/
`textarea`. A composite child (a row of buttons) is left alone rather than given
a label that points at nothing. Covered by `tests/unit/ui-a11y.test.ts`.

### The regression system

Three layers, all in the existing Vitest project, no new dependency:

1. **`tests/unit/ui-consistency.test.ts`** (10 rules) — parses the stylesheet:
   colour literals outside the named media layer, the `font` shorthand, the
   z-index ladder, radii/shadows vs scale, truncation that cannot truncate,
   dialog/menu/toast containment, required hover/focus/selected/disabled states,
   semantic colour families (a `-border` must be the same hue as its base), and
   duplicate declarations for one selector. Two frozen budgets: media-layer
   literals **≤ 87**, duplicate declarations **≤ 26**.
2. **`tests/unit/ui-visual-baseline.test.ts`** + `__snapshots__` — resolves the
   visual contract (box, spacing, type, colour, radius, elevation, stacking, and
   the responsive overrides) of 55 contracts — the chrome components plus the
   screen frames (`.app-shell`, `.sidebar`, `.page`, `.editor-topbar`,
   `.editor-body`, `.editor-stage`, `.editor-inspector`, `.timeline`,
   `.editor-tool-panel`). The editor's four-column ladder is therefore pinned at
   1280px, 1180px and below, and the shell at 1100px. It also snapshots the
   markup of every shared primitive in its empty, error, loading, progress,
   selected and disabled states. A change is a snapshot diff a human approves with
   `npm run test:visual:update`.
3. **`tests/unit/ui-a11y.test.ts`** (7) — label binding, switch state, dialog
   naming, progress value, alert role, spinner name.

Wired as `npm run test:visual`, `npm run test:visual:update`, and
`npm run verify` (typecheck + full suite). They run inside `npm test`, so they
are part of the existing workflow rather than a separate ritual.

**What this cannot catch:** anything that depends on real layout — text growing
past its box at a specific width, a menu that opens downward near the bottom
edge, a 200 % zoom overflow, a hover state that never fires. Snapshots are
strings; they protect consistency, not composition. Those need a browser, and a
browser needs a dependency decision.

### Still open

| Location | Severity | Finding | Recommendation |
| --- | --- | --- | --- |
| `.editor-tool-panel .asset-*`, `.multi-track-lane`, `.multi-track-item.audio/.image`, `.source-track-clip`, `.editor-tool-button.active`, `.inspector-context-heading span` | medium | Most of the 26 duplicate declarations: a compatibility block at the end of the file silently overrides earlier definitions with different values (`min-height: 51px` vs `63px`; two `transition` spellings on `.btn`). | Merge each pair into one rule. Needs a visual check per component — doing it blind is how the current state happened. |
| Media layer (87 literals) | low | Clip/trim/waveform colours are literals; two greens and two blues are in use for the same "audio"/"image" meaning. | Tokenise as `--clip-audio-*`, `--clip-image-*` when the media style is next touched. |
| `.modal` 580 / `.modal.wide` 740 / `.palette` 620 / `.editor-tool-panel` 264 | low | Hand-picked widths next to a scale that has `--content-max`, `--form-max`. | Leave: these are deliberate measures, and changing them changes the app's proportions. |
| `.asset-grid` etc. | low | ~30 class names defined in CSS with no reference in the renderer (dead selectors from earlier layouts). | Delete in a dedicated sweep with the class scan, after confirming no dynamic `className` build-up uses them. |
| `Field` in `SettingsPage` | medium | Several settings still use native `window.prompt` for renaming (asset rename, caption preset). Inconsistent with `ConfirmDialog` and unreachable by keyboard users who dismiss prompts. | Replace with the existing `Modal` + `Field`, one call site at a time. |
| Menus near the bottom edge | medium | `.menu` has a max-height but no flip; a dropdown opened in the last 60 % of the window can be clipped. | Needs measurement at runtime (portal or `getBoundingClientRect` flip). Not guessable statically. |
| Responsive / zoom matrix | unknown | 1024×680 → 1920×1080, plus 200 % zoom, has not been seen. Two `.modal`/`.palette` caps and the `.create-bar` breakpoint are arithmetic only. | Manual pass; the caps are `min()` of viewport units, so they cannot overflow, but composition is unverified. |

### Verification

* `tsc --noEmit -p tsconfig.web.json` clean.
* `electron-vite build` clean — `index-BToojEnT.js` / `index-Ccx-rffR.css`.
* Full suite **44 files / 408 tests pass** (was 38 / 356 at the start of this
  pass). New: `ui-consistency.test.ts` (10), `ui-visual-baseline.test.ts` (10 +
  17 snapshots), `ui-a11y.test.ts` (7).
* Preview backend on :8787 serves the rebuilt bundle.
