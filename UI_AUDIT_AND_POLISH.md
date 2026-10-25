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
