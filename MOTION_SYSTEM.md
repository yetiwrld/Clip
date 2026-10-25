# Motion system

How the interface moves, why those numbers, and what was fixed. Same rules as
the other passes: no new dependency, no redesign, nothing decorative.

---

## 1. What the audit found

| | before | after |
|---|---|---|
| transition declarations | 11, covering buttons and a few fields | every interactive surface |
| durations | all `var(--speed)` = 120 ms, default easing | 120 / 180 / 240 ms on two defined curves |
| infinite animations | 2 — the spinner and a pulsing status dot | 1 — the spinner |
| dialog entry | 130 ms | 240 ms with a backdrop fade |
| toast entry | 150 ms | 180 ms |
| popover / menu entry | none, they appeared instantly | 180 ms fade + 4 px rise |
| expandable sections | instant, with a layout jump | 180 ms height transition |
| reduced motion | not supported | one global block |
| orphan keyframes | `fade-in`, `skeleton-pulse` (no users) | `fade-in` now drives the modal backdrop, `skeleton-pulse` deleted |

Most controls had **no transition at all**, so hover snapped from one colour to
the next. A dense list of rows flickered as the pointer crossed it.

## 2. The numbers

| token | value | used for |
|---|---|---|
| `--dur-fast` | 120 ms | hover, press, focus, colour changes |
| `--dur-base` | 180 ms | popovers, menus, tabs, expandable panels, toasts, progress |
| `--dur-slow` | 240 ms | dialogs and large-area changes |
| `--ease` | cubic-bezier(.2,.6,.2,1) | state changes |
| `--ease-out` | cubic-bezier(.16,1,.3,1) | anything that enters |
| `--ease-in` | cubic-bezier(.4,0,1,1) | anything that leaves |

Only `transform`, `opacity` and colour animate. Position, size and content
never do, with one deliberate exception: the progress bar animates `width`
because width is what a determinate bar means, and the element is a few pixels
tall.

## 3. Interaction by surface

**Buttons and controls** — 120 ms colour transition on background, border and
text. Press is a darker fill, disabled is 0.5 opacity with the glyph at 0.8.
Loading is a spinner inside the same box, so the button never changes size
while it works.

**Menus and popovers** — 180 ms fade plus a 4 px rise from the trigger's
corner (`transform-origin` points at the button that opened it). They are
interactive on the first frame; the animation decorates entry only.

**Dialogs** — backdrop fades at 180 ms, the panel rises 4 px at 240 ms.

**Toasts** — 180 ms slide-in from the right, 8 px. They are the only surface
that also carries a colour-coded left border, so status never depends on
motion.

**Tabs and navigation** — 120 ms colour transition. Selection is a background
and text change, immediate to the eye, never a sliding indicator that lags
behind the click.

**Expandable sections** — native `<details>` animated through
`::details-content` with `interpolate-size: allow-keywords` and a
`content-visibility` transition with `allow-discrete`. That gives a real
height animation with no JavaScript, and browsers without support fall back to
the instant open the app had before. The inspector reserves its scrollbar
gutter, so opening a section cannot shift the content sideways.

**Timeline** — clips and caption blocks transition colour only. Position is
deliberately excluded: a transition on `left` would lag behind the pointer
during a drag.

**Async work** —
* save state: spinner + "Saving…", then a tick + "Saved" (text always present,
  never motion alone);
* import / upload: spinner in the button, label changes to "Importing…";
* render / export: progress bar, queue status, toast on completion with a
  "Reveal folder" action;
* errors: `ErrorBox` with a retry button, or a toast that stays until
  dismissed.

## 4. Accessibility

* `@media (prefers-reduced-motion: reduce)` collapses every animation and
  transition to 0.01 ms and forces one iteration. The spinner keeps turning,
  because it is the only signal that a long task is alive.
* Nothing communicates state through motion alone: every animated change has a
  colour, text or icon equivalent.
* Focus rings are never animated, so keyboard focus is instant.
* No animation delays interaction — elements respond to hover, click and keys
  from their first frame.

## 5. What was removed

* The pulsing status dot (`status-pulse`, 1.2 s, infinite). "Working" now reads
  as an accent dot plus its label and progress bar. Continuous pulsing draws
  the eye away from the numbers that actually matter.
* The orphan `skeleton-pulse` keyframes. Skeletons were considered and
  deliberately not added: all data in this app is local SQLite or a single IPC
  round trip, so a skeleton would flash for a frame and read as a flicker. The
  places that genuinely wait — transcription, render, import — already show a
  spinner and a determinate progress bar.

## 6. Guards

`tests/unit/design-tokens.test.ts` now fails if:

* a transition uses a literal duration instead of a token;
* anything other than the spinner animates infinitely;
* the reduced-motion block disappears;
* the three durations or the easing curves are removed.

## 7. Still open

* Menus, dialogs and toasts animate in but not out: they unmount instantly.
  Doing exit properly needs a short close delay in React state, which risks
  blocking interaction — the reason it was left alone.
* Nothing has been checked on a real screen. The curves are chosen from
  convention, not from watching them.
