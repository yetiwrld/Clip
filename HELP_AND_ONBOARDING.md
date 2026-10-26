# Help and onboarding

**Date:** 2026-10-26
**Scope:** first launch, guided tour, contextual help, one place to find help, and
the settings that remember all of it.
**Rule followed:** teach a new user in the first five minutes, then stay out of
the way. Nothing here gates a project, changes a project, or touches stored
media.

---

## 1. What was there before

An audit of the rendered surface found three things:

| Piece | Before | Problem |
| --- | --- | --- |
| Welcome | `features/onboarding/FirstRunModal.tsx`, two pages ("welcome", "environment") | Explained the workflow, but the only actions were *Skip intro* and *Start creating*. It never told you where to click first, and the setup page was a second way to do what Settings already does. |
| Teaching | none | A first-time user had a three-step card and nothing else. Nothing pointed at the sidebar, the render queue, or the fact that jobs keep running. |
| Help | the command palette and the shortcut list | Good for people who already know the app. No place that answers “what does this do”, “why is FFmpeg missing”, or “what version am I running”. |

Deliberately kept: the palette, the shortcut list, the `.welcome-*` design, the
dependency probe, and the diagnostics/log actions in Settings. All of it is
reused rather than duplicated.

---

## 2. What exists now

### 2.1 First launch — one screen, four real ways in

`features/onboarding/FirstRunModal.tsx` keeps its three-step explanation and its
look, and adds a **Start with** row:

- **New project** — closes the welcome screen, goes to Projects and focuses the
  project name field.
- **Import a video** — closes the welcome screen and runs the real import. The
  pick/create/import/open sequence moved to
  `features/dashboard/importVideo.ts` so the Projects page and the welcome
  screen cannot drift apart.
- **Open a project** — only shown when projects exist.
- **Take the tour** — closes the welcome screen and starts the tour on Projects.

Footer: **Skip intro**, **Check setup**, **Start creating**. Every button marks
first run complete, so the screen appears exactly once.

There is **no sample project**: the app has no sample media and no demo project
generator, so offering one would be a dead button. That is why it is missing
rather than forgotten.

### 2.2 The guided tour — six stops, real elements

`features/help/tour.ts` holds the stops as data. Each stop names a `data-tour`
marker that the app really renders:

| Stop | Marker | Screen |
| --- | --- | --- |
| Your projects live here | `data-tour="projects"` (sidebar) | Projects |
| Start with one long video | `data-tour="create-bar"` (the import/create grid) | Projects |
| Renders keep running | `data-tour="queue"` | any |
| Help is always one click away | `data-tour="help"` | any |
| Find any action | `data-tour="shortcuts"` | any |
| Set up once | `data-tour="settings"` | any |

`availableSteps(view, hasTarget)` drops a stop when the current screen does not
own it, and when the element is not on the page (a narrow window, a future
layout change). A test asserts that every marker the tour asks for is really in
the source, so renaming a marker fails the suite instead of silently breaking
the tour.

`features/help/TourOverlay.tsx` draws it:

- a spotlight on the target's measured rectangle, with the card placed below the
  target when there is room, above it otherwise, and clamped inside the window;
- the overlay layer itself ignores pointer events, so every control underneath
  stays clickable and the app is never blocked;
- **Next**, **Back**, **Skip**, **Finish**, plus `←`/`→` while the card has
  focus, and `Esc` from anywhere;
- closing by any route records `help.tourCompleted`, so it does not return;
- focus goes to the card on each stop and returns to where it came from on
  close.

### 2.3 Contextual help — two shapes, both optional

`features/help/InfoTip.tsx`:

- **`InfoTip`** — a small round button beside a label that unfolds one short
  explanation. Closed by default, `aria-expanded`/`aria-controls`, `Esc` and
  outside-click to close. It can never nag because it never opens itself.
- **`TipNote`** — a one-line note attached to a feature. Dismissing it stores the
  id in `settings.help.dismissedTips`, so it stays gone across restarts.

Wired to real features:

| Where | Kind | Id |
| --- | --- | --- |
| Settings → Advanced, video tools | `InfoTip` | — |
| Clip list, above the clips | `TipNote` | `clips.render-queue` |

Both placements say something the screen does not already say. Existing inline
hints (keyframe explanation, audio-only source, privacy note) were left alone
rather than converted into tips.

### 2.4 The Help screen

`features/help/HelpPage.tsx`, rendered for `view === 'help'`, reached from the
sidebar's **Help** row or the palette (`Help and setup`):

1. **Start here** — the three things that produce a clip, then buttons for
   Projects, the tour, the shortcut list, and **Welcome screen again** (resets
   only `general.firstRunCompleted`, so the intro can be re-read without
   touching projects, clips or dismissed tips).
2. **Setup check** — the same dependency list Settings shows, with a re-check
   button and a link to Settings → Advanced.
3. **Common questions** — four `<details>` answers about privacy, AI keys, where
   files live, and why FFmpeg is needed.
4. **Troubleshooting** — open the logs folder, export diagnostics, show the
   workspace folder. All three call existing IPC methods; the folder buttons are
   disabled in the browser preview, which cannot open a folder on the host.
5. **About** — version, platform, workspace path.

No link here points at a page that does not exist, and no button is decorative.
A test checks every `api[...]` method the page uses against `src/shared/ipc.ts`.

### 2.5 Persistence and control

- `AppSettings.help = { tourCompleted: boolean; dismissedTips: string[] }`
  (validated in `shared/schemas`, defaulted in `settingsRepo.defaults()`, so an
  older database simply gains the section on next save).
- `stores/app.ts`: `tourOpen`, `startTour()`, `closeTour()`, `dismissTip(id)`,
  `isTipDismissed(id)`.
- Restart the tour: Help → **Take the guided tour**, or the palette command.
- Re-read the intro: Help → **Welcome screen again**.
- Nothing else re-triggers onboarding: the welcome screen is gated on
  `general.firstRunCompleted` only, exactly as before.

---

## 3. What was checked

`tests/unit/onboarding.test.ts` (17 tests):

- help defaults exist, and the schema accepts good help state and rejects an
  empty tip id and more than 100 tips;
- the tour records completion; a dismissed tip is stored once and is not written
  twice;
- tour stops are unique, and every requested `data-tour` marker exists in the
  app source;
- a stop is dropped for another screen and for a missing element;
- the overlay layer is `pointer-events: none` and only the card takes clicks;
  the tour z-index is on the ladder (`--z-tour: 460`, under toasts);
- the Help page only calls declared IPC methods, and it uses the real
  `startTour` / `openPalette('shortcuts')` actions;
- replaying the welcome resets the first-run flag and nothing else;
- the welcome screen offers all four real ways in, has no visible sample
  promise, and marks first run complete before doing anything else;
- Help is a real view, has a sidebar row, mounts the tour, and is reachable from
  the palette.

Full suite: **48 files, 451 tests pass**. `tsc -p tsconfig.web.json` clean,
`electron-vite build` clean (`index-Bs7TKiy5.js`, `index-B9pLto0s.css`).

The visual baseline in `tests/unit/ui-visual-baseline.test.ts` now also locks the
new surface: `.welcome-paths`, `.help-steps`, `.help-faq`, `.help-about`,
`.info-tip-button`, `.info-tip-pop`, `.tip-note`, `.tour-layer`,
`.tour-spotlight`, `.tour-card`, `.tour-title`, `.tour-body`, `.tour-actions`.

### Manual checks that could not be automated here

There is no browser engine in this environment (no Playwright, Puppeteer,
Chromium or Xvfb), so these are recorded for a machine with a display:

1. First launch on a clean settings database: the welcome screen appears once;
   each of the four buttons lands where it says.
2. Second launch: no welcome screen.
3. Skip, then restart: still no welcome screen.
4. Dismiss the clip-list tip, restart: it stays dismissed.
5. Start the tour, then use the sidebar to move between screens: the tour
   follows the screen and drops stops that are not there.
6. Resize to 1024×680 and to a very tall window: the card stays inside the
   window and the spotlight tracks its target.
7. Keyboard only: `Esc` closes, `←`/`→` move while the card is focused, arrows
   go back to the app once focus moves elsewhere.
8. Open a project, then the tour: no project data, clip or render changes.

---

## 4. Installing and running it

Consumers install the Windows installer; developers run from source. The up-to-date
steps live in [`README.md`](app/README.md) (Windows install, source run, optional
installer build) and [`docs/API_SETUP.md`](app/docs/API_SETUP.md) (providers).
The short version:

**End users (Windows 10/11 x64).** Download the `unsigned` installer artifact
from the latest **Windows installer** workflow run, extract it, run
`Clipwright Studio-<version>-setup-x64.exe`. Node.js is not needed. FFmpeg,
FFprobe and the caption fonts are inside the installer.

**Developers.**

1. Node.js 22 LTS (20+ supported).
2. `npm ci` — installs Electron and the FFmpeg/FFprobe npm builds.
3. `npm run dev` — downloads the Electron runtime on first run.
4. Optional: FFmpeg on `PATH` instead of the bundled copy (set the path in
   **Settings → Advanced**), Python + `faster-whisper` for local transcription,
   Python + `resemblyzer` for local speaker grouping, and an OpenAI-compatible
   or Anthropic key for cloud analysis.
5. `npm run fixtures`, then `npm test`; `npm run typecheck`; `npm run build`.
6. `npm run preview:web` for the browser preview at `http://localhost:8787`
   (development only — folder buttons are disabled there).

Nothing new was added to the dependency list for this work: the tour and the
tips use React, the existing store, the existing settings table and the existing
icon set.

---

## 5. Known limits

- The tour is six static stops, not a scripted animation of the app. It cannot
  highlight something that is not rendered, and it does not scroll a container to
  reach a target that is off-screen inside a scroll area. Current targets are all
  in the always-visible shell or at the top of Projects.
- There is no sample project, because the app cannot create one yet.
- The Help screen's FAQ is fixed copy, not a search index. The palette is the
  search.
- `TipNote` dismissals are permanent by design; there is no “show dismissed tips
  again” switch yet. Reset by clearing `help.dismissedTips` in the settings
  record.
