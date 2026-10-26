# Navigation and information architecture

What the app's navigation actually is, what was broken about it, and what changed.
Scope: the app shell (sidebar), the project screen (tabs), the editor, the
settings screen, and the command palette that mirrors all of them.

## The structure as it stands

```
Sidebar (always visible)                 Projects · Render queue · Settings
                                         └ Shortcuts (opens the palette, not a screen)
                                         └ build footer (version, workspace, credit)

Projects ──▶ Project ──▶ Source | Transcript | Moments | Clips | Renders
     │            └────▶ Editor (per clip) ──▶ back to Project
     ├──▶ Render queue
     └──▶ Settings ──▶ AI · Transcription · Video · Captions · Export · Storage · Advanced
```

Depth is two clicks for every feature, three for a clip. That is a sound shape
for this app and it was **not** redesigned. This pass fixed the behaviour inside
that shape, the duplicate destination, and the consistency between what the
screens call things and what the command palette calls them.

## What was wrong

### 1. Back was fiction (severity: high)

`useAppStore` kept a single `lastView` and exposed `goBack()`, but nothing ever
called it — the function was dead code. The `Go back` command hardcoded
`editor → project, anything else → dashboard`, so:

* Back from Settings or the Render queue went to Projects, even when you arrived
  from a project. The project you were working in was lost.
* There was no forward step at all.
* Repeated back presses did nothing after the first.

Fixed: the store now keeps a bounded (25) `history` and `future`, each entry a
complete place (`view`, project, clip, project tab, settings section).
`navigate`, `openProject` and `openEditor` record a step; `back()` and
`forward()` restore the whole place; navigating somewhere new clears the forward
steps; selecting the screen you are already on records nothing. Commands:
`Go back` (Alt+←) and the new `Go forward` (Alt+→). Settings and the Render queue
show a Back button when there is somewhere to go back to.

### 2. The project tab was pulled out from under the user (severity: high)

Two separate mechanisms set the tab:

* `openProject()` reset it to Source on every open, so returning to a project
  always dropped you at the beginning.
* An effect in `ProjectPage` re-applied a "suggested" tab whenever the project
  status changed — starting a transcription while you were reading Clips moved
  you to Transcript.

Fixed: each project remembers its tab (`projectTabs`), `openProject` restores it,
and the suggestion is applied **once**, only when a project is opened that has no
remembered tab. A status change can no longer change the tab.

### 3. A duplicate navigation row (severity: medium)

The sidebar rendered a second, near-identical row — `3 interrupted jobs` — that
went to the same Render queue screen. Two rows, one destination.

Fixed: interrupted work is now a warning badge on the Render queue row
(`.nav-badge.warn-count`), with an accessible label and an explanatory title on
the row. Same discoverability, one destination.

### 4. Settings sections were unreachable from the palette (severity: medium)

`Settings: Storage and privacy` and friends were gated on
`enabled: () => app().view === 'settings'`, so searching for "storage" from the
dashboard found a command that could not run. Fixed: section commands navigate to
Settings *and* select the section, from anywhere.

### 5. The queue page pointed at another screen without a way to get there

`Render queue`'s subtitle said "Set how many run at once in Settings → Video" as
plain text. It is now an inline `Settings → Video & rendering` button that opens
that section, reusing the existing store calls rather than adding a route.

### 6. Active state was colour only (severity: medium, accessibility)

The current sidebar destination, project tab and settings section were marked by
a class and nothing else. Fixed: `aria-current="page"` on all three, so the state
survives a screen reader and a high-contrast theme.

### 7. The editor breadcrumb was not a link

The editor title reads `Project name / Clip title`, but the project name was a
`<span>`: the hierarchy was visible, the way back was not. It is now a button
that returns to the project through the unsaved-changes guard, styled to look
identical (`border: 0`, no background, same colour, hover brightens).

### 8. Naming: checked, mostly already consistent

| Where | Label |
| --- | --- |
| Sidebar / page title | Projects · Render queue · Settings |
| Palette | Go to Projects · Go to Render queue · Go to Settings |
| Project tabs | Source · Transcript · Moments · Clips · Renders |
| Palette | Go to Source tab · … |
| Settings sections | AI providers · Transcription · Video & rendering · Captions · Export · Storage & privacy · Advanced |
| Palette | Settings: Video and rendering (…) |

The one drift was `Video and rendering` in the palette against `Video & rendering`
on screen. The palette keeps ordinary words (searching "and" is easier to type
than "&"), and a test now normalises the two so they cannot diverge further.

`Renders` (this project) and `Render queue` (all jobs) stay separate names on
purpose: they are different screens with different contents, and renaming either
would make them collide.

### 9. The render queue had no empty state

With nothing running and no history, the screen was a title and a subtitle over
blank space. It now uses the shared `EmptyState` ("Nothing queued", what appears
there, and a way to Projects), like every other destination.

## What was deliberately left alone

* **The three-destination sidebar.** Every feature is two clicks away; adding
  groups or nesting would add depth without adding reach.
* **`Shortcuts` in the sidebar.** It looks like a destination but opens the
  palette in shortcuts mode. It stays, because the palette's own shortcut
  reference is otherwise only discoverable if you already know Ctrl+/ — but it is
  in the bottom utility block, not the Workspace group.
* **Palette entries for project tabs stay gated** to a project context: there is
  no "Transcript here" to open without a project.
* **No roving tabindex on the tab strip.** The tabs are ordinary buttons reachable
  with Tab and activated with Enter/Space. Arrow-key navigation inside a `tablist`
  would need `role="tab"`/`tabpanel` wiring that the current markup does not have;
  `aria-current` gives the same information without a half-implemented pattern.
* **No URL routing.** This is a single-window desktop app; screens are store
  state. "Deep links" here means the palette, the keyboard shortcuts, and the
  remembered place — all of which now work.
* **Sidebar at narrow widths** is unchanged (still 176px at ≤1100px). It has not
  been verified visually in this environment.

## Tests

`tests/unit/navigation.test.ts` — 18 cases:

* back returns to the screen you came from, not the dashboard;
* forward works, and a new navigation drops the forward steps;
* the tab and settings section of the place you return to are restored;
* picking the current screen records no step; history stays bounded;
* each project remembers its tab, including across `editor → back`;
* transcript search, follow and scroll are kept per project and an identical
  write does not touch the store;
* palette parity: every primary destination, project tab and settings section has
  a command, ids are unique, and the on-screen labels match the command titles;
* active state: `aria-current` on sidebar, tabs and settings sections, and no
  second navigation row for the queue.

## Verification

* `tsc --noEmit -p tsconfig.web.json` clean.
* Full suite **47 files / 434 tests** pass (18 of them new). The visual baseline
  gained `.text-link`, `.editor-project-link` and `.nav-item .nav-badge`, so the
  new chrome is covered by the same contract snapshots.
* `electron-vite build` clean — `index-iUgn3l65.js` / `index-CuboyHWs.css`; the
  preview server serves the rebuilt bundle.
* Not verified visually: this environment has no display, so the Back button
  placement, the warning badge and the clickable crumb were checked by reading
  the markup and by the style contract, not by looking at them.
