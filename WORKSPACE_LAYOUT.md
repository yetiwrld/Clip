# Customisable workspace and persistent layout

**Date:** 2026-10-26
**Scope:** resizable and collapsible panels in the app shell and the editor,
remembered across restarts, with one reset and two presets.
**Rule followed:** extend the layout that exists. No new layout engine, no new
dependency, no rewrite of the grid.

---

## 1. What was there before

| Piece | Before | Problem |
| --- | --- | --- |
| App shell | `.app-shell` grid: `var(--sidebar-w) 1fr`, fixed 198px, dropping to 176px below 1100px | Never resizable, never hideable. A wide screen was stuck with the same rail as a narrow one. |
| Editor body | `.editor-body` grid: rail, tool panel, stage, properties — four fixed `minmax()` tracks | Two useful panels with no way to make either bigger, and no way to close either on a 1440px window. |
| Timeline height | Drag handle, saved to `localStorage['clipwright.editor.timelineHeight']` | Pointer-only, no keyboard, no ARIA, and a second storage mechanism next to `settings`. |
| Inspector sections | `<details>` elements, one open by default | Every restart forgot which panels you had open. |
| Undo for any of it | none | A panel dragged to a silly size stayed that way. |

The shell is a CSS grid with one template. That is the right shape, so it was
extended rather than replaced.

---

## 2. The model

`shared/types` → `WorkspaceSettings`, validated by `shared/schemas` and defaulted
in `settingsRepo.defaults()`:

| Field | Default | Range | Meaning |
| --- | --- | --- | --- |
| `sidebarWidth` | 198 px | 180–380 | Rail width when expanded |
| `sidebarCollapsed` | `false` | — | Rail reduced to icons |
| `editorToolPanelWidth` | 268 px | 200–360 | Media / moments / camera panel |
| `editorToolPanelCollapsed` | `false` | — | Panel closed, rail keeps the restore button |
| `editorInspectorWidth` | 316 px | 260–460 | Properties panel |
| `editorInspectorCollapsed` | `false` | — | Properties closed, topbar keeps the restore button |
| `editorTimelineHeight` | `null` | 220–900 or `null` | `null` = fit the window it opens on |
| `openInspectorSections` | `['trim']` | known ids | Which `<details>` sections are open |

The defaults are the values the stylesheet already used, so an existing user's
first paint does not move.

### 2.1 Repair, not rejection

`features/workspace/layout.ts` is pure and JSX-free:

- `clampPane(value, limit, fallback)` — rounds, clamps, and falls back for
  anything that is not a finite number.
- `normalizeWorkspace(value)` — repairs **each field on its own**. A width from
  an older build costs that width, not every other choice.
- `mergeWorkspace(current, patch)` — applies a patch, then re-clamps, so nothing
  invalid can reach the schema.
- `sectionsOr` drops section ids this build does not know, so a layout saved by
  a newer build still opens.
- `null` beats `0`: a missing timeline height means "fit this window", not "zero
  pixels".

The schema is the second line of defence. A stored width outside the documented
range fails validation for the `workspace` section only, and
`settingsRepo.load` falls back to the defaults for that section — the same
per-section behaviour every other preference already had.

---

## 3. Persistence

No new storage. Layout writes go through `settings.update` → `updateSettings` →
SQLite, exactly like every other preference.

- **Only stable changes are written.** A drag updates React state per pointer
  move and calls `updateWorkspace` once, on release (or on a key press). There
  is no write per frame, and no write per pixel.
- **The timeline moved in.** Its `localStorage` key is gone; the height is now
  `editorTimelineHeight` in the same document. A `null` value is recomputed for
  the current window with the existing `initialTimelineHeight` helper, so a
  height saved on a large screen cannot open off-screen on a laptop.
- **Reset is one write**, not a series.

`features/workspace/useWorkspaceLayout.ts` exposes `useWorkspaceLayout()`
(`layout`, `update`), `resetWorkspaceLayout()` and `applyWorkspacePreset()`.
The hook memoises on the saved object, so unrelated settings changes do not
re-render the shell.

---

## 4. Interaction

### 4.1 One divider component

`features/workspace/ResizeHandle.tsx` is used by all four edges:

- pointer drag (window-level `pointermove`/`pointerup`, so the drag survives
  leaving the handle);
- arrow keys ±8 px, Shift ±1 px, Page Up/Down ±48 px, Home/End to the limits,
  Enter or double-click back to the default;
- `role="separator"`, `aria-orientation`, `aria-valuenow/min/max`, `aria-label`,
  visible focus ring;
- `invert` for the properties panel, whose edge grows to the left;
- a `body[data-resizing]` flag so the cursor stays correct during a drag.

The timeline's old pointer-only handle was replaced with the same component, so
it gained keyboard control and ARIA without a second implementation.

### 4.2 Collapsing

| Panel | Hide | Show again |
| --- | --- | --- |
| Sidebar | Button beside the brand | Same button, always visible |
| Tool panel | Bottom of the tool rail | Same rail button ("Show") |
| Properties | Header of the panel | Topbar button, only while hidden |
| Timeline | not collapsible — it resizes instead | — |

A collapsed panel gives its grid column back (`--editor-tool-track: 0px`), so
nothing is left as an empty stripe. The rail keeps `aria-expanded` and
`aria-controls` on every toggle.

**The sidebar rail keeps its labels for screen readers.** Collapsed labels use a
1 px clip, not `display: none`, so each nav item keeps its accessible name while
the rail shows only icons. Badges become dots; the count stays in the
accessibility tree and in the button's tooltip.

The sidebar's bottom block is unchanged in structure and order: Shortcuts, Help,
Settings, then the version/preview footer. In the collapsed rail the footer text
is hidden with the rest of the labels — say the word if it should stay.

### 4.3 Where a divider is honest

- The sidebar divider disappears below 1100 px, where the shell uses its fixed
  176 px template.
- The editor dividers disappear below 1180 px.
- Above those widths the saved width is used; the `minmax()` floor and the
  `min(var(--editor-tool-w), 228px)` caps in the breakpoints keep a wide saved
  panel from squeezing the stage on a smaller window.

A handle that cannot change anything is hidden rather than left dead.

### 4.4 Reset and presets

**Settings → Advanced → Interface → Workspace layout** shows the current values
in one line, a **Reset layout** button (disabled when the layout is already the
default) and two presets:

- **Wide stage** — hides the sidebar and tool panel, keeps properties.
- **Wide properties** — hides the tool panel, opens properties at 420 px.

Only two presets, because only two questions are actually different: stage big,
or controls big. Everything else is a drag away.

`Reset workspace layout` is also a command in the palette (settings.update path,
same result), so a lost panel can be recovered without finding the settings
screen.

---

## 5. Accessibility

- Every divider is a keyboard window splitter with a value, a range and a name.
- Every toggle has `aria-expanded` and `aria-controls`; the hidden panel and the
  rail button point at each other by id.
- Focus is visible (existing `--focus-ring` treatment) and never trapped.
- No animation was added. The divider line fades its opacity with the existing
  `--dur-fast` token, which the reduced-motion block already collapses; the
  ambient-motion gate does not apply because nothing here moves continuously.
- The editor's `.inspector-toolbar` is hidden below 681 px, where the drawer and
  its own header take over.

---

## 6. Verification

- `tests/unit/workspace-layout.test.ts` (29 tests): defaults match the
  stylesheet; clamping and repair; junk input; unknown section ids; schema
  ranges; presets valid as saved documents; reset/summary; the shell and editor
  read settings and keep no `localStorage` copy; save-on-release wiring; a way
  back from every panel; CSS contract (columns given back, caps per breakpoint,
  hidden dividers, focus, no new keyframes).
- `tests/unit/ui-visual-baseline.test.ts`: new baselined selectors
  (`.pane-resizer`, `.sidebar-resizer`, `.stage-resizer`, `.sidebar-toggle`,
  `.inspector-toolbar`, `.inspector-show-toggle`, `.editor-panel-toggle`,
  `.app-shell[data-sidebar="collapsed"]`,
  `.editor-shell[data-tools="collapsed"] .editor-body`) plus a markup snapshot
  that asserts the divider's ARIA contract.
- Full suite: **50 files / 504 tests pass**; `tsc -p tsconfig.web.json` clean.

### 6.1 What could not be verified here

There is no browser or screenshot harness in this project, so the following are
asserted by contract, not observed:

- smoothness of a live drag (no frame measurements were taken);
- the exact pixel look of the collapsed rail at every window size;
- window-resize behaviour of a drag in progress.

The CSS keeps a resize to custom-property changes on two grid containers, and no
React state is updated per frame in the shell grid itself, but that is an
argument, not a measurement.

---

## 7. Deliberately not done

- No docking/undocking, floating panels, or drag-to-rearrange. That is a layout
  engine, and this app does not need one.
- No per-project layouts. The workspace is one place; a project does not get to
  rearrange the app underneath you.
- No preset for "narrow window" — the breakpoints already do that.
- No extra dependency.
