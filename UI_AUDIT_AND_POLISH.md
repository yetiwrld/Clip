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
