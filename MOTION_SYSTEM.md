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

---

# 8. The live layer (2026-10-26)

The first pass kept motion to state changes. This pass adds continuous motion,
and the rule that keeps it from becoming noise: **an animation either explains a
state that exists, or it is decoration that can be switched off.**

## 8.1 Two kinds of motion, two rules

| | functional | ambient |
| --- | --- | --- |
| examples | spinner, determinate bar, indeterminate sliver | welcome wash, status pulse, activity graph |
| may run continuously | yes — it is the only "still working" signal | yes, but only while visible and allowed |
| stops for reduce-motion | no, only slows | yes |
| stops for the setting | no | yes |
| carries information alone | no (always paired with text) | no (decoration by definition) |

`src/renderer/lib/motion.ts` holds the decision in one function:

```
resolveMotionMode({ ambientEffects, systemReducedMotion })
  → 'full' only when the system allows motion AND the setting is on
```

`App` writes the result to the document, and all CSS that moves by itself reads
it:

* `html[data-motion="full"]` — ambient animation may run;
* `html[data-ambient="off"]` — the user turned the wash off entirely (the static
  gradient goes too);
* `html[data-hidden="true"]` — the window is not visible, so ambient animation is
  paused rather than left to burn frames.

Functional motion ignores all three. A spinner that stops because a user asked
for less motion would be a bug, not a courtesy.

## 8.2 What was added, and why each one exists

| Where | What moves | Driven by |
| --- | --- | --- |
| Welcome screen | Slow warm wash behind the card (`ambient-drift`, 34 s, two glows) | Decoration on the one screen a new user reads first. Static when motion is reduced or the setting is off. |
| Projects empty / Queue empty | The same wash, at the same slow rate | The two screens where "nothing here yet" is the message. |
| Render queue, active jobs | Status dot pulse (1.8 s) | Genuine `running` state. A queued job gets a muted, still dot — waiting is not working. |
| Render queue + render rows | Progress bar, percentage, elapsed time, activity graph | Real `progress`, real `createdAt`, real measured samples. |
| Clip editor, timeline ruler | 2 px "played" strip following the playhead | Existing rAF playhead loop, written to one custom property. |
| Every view | 2 px rise + fade on mount (`view-in`, 180 ms) | Marks that the workspace changed. Runs once per navigation, not per render. |

Deliberately **not** added, and why:

* **Particles, parallax, cursor-following glows.** They add nothing the design
  says, and they cost frames on every pointer move. The design language is a
  quiet dark studio; drifting light is the only ambient effect that fits it.
* **A canvas/WebGL visualiser.** There is real audio data (FFmpeg waveform
  peaks) but no live spectrum to visualise: the app does not run an analyser, and
  inventing moving bars would be exactly the "fabricated values" this brief
  forbids. The waveform that does exist is already drawn from real peaks.
* **Animated numbers counting up.** On a bar that already fills, a count-up
  animation makes the number disagree with the bar for its duration.

## 8.3 Honest progress

`ProgressBar` now takes `number | null | undefined` and has exactly two shapes:

| value | shape | announced as |
| --- | --- | --- |
| a number | fills to that percentage | `aria-valuenow` + the text percentage |
| `null` | 34 %-wide sliver travelling across the track | `aria-busy="true"`, `aria-valuetext="Working, length unknown"`, text "Working" |

A queued job draws **no bar at all** — it is not working yet, and a moving bar
would say it is. A working job with a real start timestamp also shows elapsed
time, so a stalled render is visibly stalled: the number stops, the clock keeps
going. Jobs whose backend record has no start time show no clock at all, rather
than counting from "created" and calling it a duration.

With reduce-motion, the indeterminate bar does not freeze into something that
looks like a stuck partial bar; it becomes a static striped track, so it still
reads as "unknown length".

## 8.4 Real data only

The activity graph plots the values the backend actually reported, in order, and
nothing else:

* samples are appended in `stores/data.ts` from `task:update`, `render:progress`,
  `render:state` and the two polling fallbacks;
* a repeated value adds nothing (the store keeps the same object, so there is no
  write and no re-render);
* a job's history is dropped the moment it stops, so nothing accumulates;
* the graph is `aria-hidden`: the percentage and stage text next to it are the
  accessible version of the same fact.

## 8.5 Measured cost

Micro-benchmarks of the hot helpers (`node` + tsx, 100 000 iterations each):

| operation | cost |
| --- | --- |
| `recordActivity`, new sample | 0.34 µs |
| `recordActivity`, repeated value | 0.05 µs, and **no store write** |
| `pushActivity` at the 48-sample cap | 0.62 µs |
| `sparklinePoints`, 48 samples | 13.8 µs (once per new sample, ~10× a second at most) |
| `formatElapsed` | 0.47 µs |

Where the per-frame budget actually is:

* **No React work per animation frame.** The ambient wash, status pulse and
  indeterminate bar are CSS. The activity graph updates on progress events, not
  on a timer.
* **One timer for the whole app.** Elapsed-time readouts share a single
  one-second interval that starts with the first subscriber and stops with the
  last (`useNow`). It does not tick while the window is hidden.
* **The playhead reuses the existing loop.** The played strip is written by the
  rAF loop that already moves the cursor, as one custom property consumed by a
  `transform`, so playback does not add renders.
* **Bundle cost:** renderer JS 1 324 → 1 335 kB (+11 kB), CSS 137.1 → 142.7 kB
  (+5.5 kB). No new dependency; `package.json` is unchanged.

## 8.6 Accessibility and control

* **Setting:** Settings → Advanced → *Ambient visual effects*. Turning it off
  stops the wash, the pulse and the graphs; progress bars, spinners and status
  text keep working. The hint says so.
* **System preference wins.** `prefers-reduced-motion: reduce` disables every
  ambient animation and collapses the global transition durations, exactly as
  before.
* **No information is motion-only.** Every animated state has a word, a number or
  a colour next to it: "Rendering · 42 % · 1m 04s", "Queued · Waiting",
  "Working, length unknown".
* **Nothing flashes.** The fastest continuous animation is 1.5 s; nothing strobes,
  nothing exceeds three flashes a second, no effect fires on error or success
  (results are colour + text, as before).
* **Motion never blocks input.** Ambient layers are `pointer-events: none`, sit
  behind their content with `--z-behind` inside an isolated stacking context, and
  never overlap controls.

## 8.7 Guards

`tests/unit/design-tokens.test.ts` (27 tests) now enforces:

* only four infinite animations may exist — `spin` (functional), `progress-sweep`
  (indeterminate bar), and `ambient-drift` / `status-live` which **must** sit
  behind `html[data-motion="full"]`;
* the two pause rules (`data-hidden`) must exist;
* the reduced-motion block must still carry the striped indeterminate bar.

`tests/unit/motion.test.ts` (19 tests) covers the mode matrix, progress truth
(`null` ≠ 0), history growth/identity, pruning, elapsed formatting, graph
geometry, the two bar shapes, the three job states, and the store recording path.

Visual baseline: `.ambient-field`, `.job-activity*`, `.activity-graph`,
`.progress-track.indeterminate .progress-fill`, `.status.queued`,
`.multi-track-played` and the gated pulse rule are now baselined.

## 8.8 What could not be verified here

There is no browser engine in this environment, so these are for a machine with
a display:

1. The wash drifts slowly and does not distract while reading the welcome copy.
2. The dot pulse is visible but not demanding on a running queue row.
3. The activity graph fills left-to-right as a real render progresses, and goes
   flat when a render stalls.
4. With the setting off, nothing decorative moves; bars and spinners still do.
5. With reduce-motion on (OS level), the wash and pulse stop, the indeterminate
   bar shows stripes, and the spinner still turns.
6. The played strip tracks the playhead during playback, on seek, and after a
   zoom or resize.
7. Hiding the window pauses the wash and the pulse; returning resumes them.
