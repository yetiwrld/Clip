# Performance and perceived responsiveness

What was measured, what was changed, and what is still slow. Numbers come from
`npm run perf` (`app/scripts/perf-probe.ts`), which builds a throwaway workspace
and drives the real IPC backend, and from the two new unit tests. **Nothing here
is a browser profile**: this environment has no display, so commit time, paint
time and layout time could not be measured — only backend work, pure functions,
and the number of renders the code is capable of triggering.

## How it was measured

```bash
cd app
npm run perf                                  # 5000 segments, 200 clips, 26 projects
PROBE_SEGMENTS=20000 PROBE_CLIPS=500 npm run perf
```

The probe seeds a real SQLite workspace through the real service stack, then
times the same methods the UI calls. It is deliberately not a benchmark suite —
it is a repeatable way to answer "is this still acceptable?" after a change.

Baseline dataset: **5000 transcript segments with word timings, 200 clips,
26 projects, 4.7 MB database.**

| Measurement | Before | After |
| --- | --- | --- |
| `projects.list` (26 projects) | 13.90 ms | **2.75–4.4 ms** |
| Store writes on an idle transcript tab (60 s) | 40 | **0** |
| Store writes on an idle queue screen (60 s) | 15 | **4** (15 s heartbeat) |
| `buildCues` when only zoom/crop/title changed | 131 ms at 5000 segments | **0 ms** (memo now keyed on caption inputs) |
| Full editor re-renders per second, paused | ~8 | **0** |
| Full editor re-renders per second, playing | ~8 | ~8 (only when the time really moved) |
| `App` re-renders per background task tick | 1 whole-screen tree | **0** |
| Bytes re-read by `App` on any store write | whole store | only the selected fields |

Unchanged costs, for reference: `transcript.get` 115–140 ms and a 3.98 MB
payload at 5000 segments; a durable edit (`clips.update`) 19–23 ms at a 4.7 MB
database; `clips.list` 15–20 ms at 200 clips.

## What was actually slow

Findings, in the order they matter.

### 1. The app shell subscribed to every store (severity: high)

`App.tsx` wrapped every screen in `useAppStore()` and `useDataStore()` with no
selector. In Zustand that subscribes to the whole state object, so *any* write
re-rendered `App` and, through it, the open screen — including a task progress
tick, a toast, an unrelated render job.

Fixed for the shell: `App` now selects the ten values it actually uses. The
remaining 34 call sites are other screens; converting them is mechanical but
wide, so the count is pinned by a test (`tests/unit/render-subscriptions.test.ts`)
that fails if the number grows and asks for a selector instead.

### 2. Idle polling wrote to the store 40 times a minute (severity: high)

The transcript tab polled `tasks.list` every 1.5 s and the queue every 4 s, as a
fallback next to the backend event stream, and each poll replaced the array in
the store whether or not anything had changed. Combined with #1 this re-rendered
the whole UI once a second on an idle workspace.

Three changes:

* `loadTasks` / `loadRenders` compare the incoming list with the stored one
  (`id:state:stage:progress:message:updatedAt`) and return without writing when
  it is identical (`tests/unit/store-writes.test.ts`).
* Both screens poll through `usePoll`, which runs fast only while that project
  has work in flight and falls back to a 12 s / 15 s heartbeat when idle.
* In-flight requests are shared per key, so mounting a screen while a refresh is
  already running cannot fire the same query twice, and a slow first answer can
  no longer land after a newer one.

### 3. `projects.list` ran three queries per project (severity: medium)

`projectSummaries` asked for candidate/clip/render counts one project at a time:
78 round trips for 26 projects, 13.9 ms on the dashboard — which refreshes after
every project event. Replaced by three grouped `COUNT(*) … GROUP BY project_id`
queries: 2.75–4.4 ms.

### 4. Two memos in the editor could never hit (severity: medium)

* `target` (the output resolution) was rebuilt as a fresh `{w, h}` object every
  render, and `crop` was memoised on it — so the crop maths (`computeCrop` or
  `computeCameraCrop`, 0.24 ms) ran on every playhead tick. `target` is now
  memoised on primitives.
* `cues` (caption cues) was memoised on the whole `clip` object, which changes
  identity on every edit. Changing zoom, crop, title or audio therefore rebuilt
  every cue — 131 ms at 5000 segments. The dependency list is now the fields
  `buildCues` actually reads.

### 5. The playhead re-rendered the editor while paused (severity: medium)

A 120 ms interval copied `video.currentTime` into state unconditionally. A
paused player reports the same time forever, so a paused editor re-rendered its
3 400-line tree eight times a second. The update is now skipped when the value
has not moved (and at 0.05 s granularity in the transcript tab).

### 6. Per-render rebuilds in the timeline and transcript (severity: low–medium)

* `captions={cues.map(...)}` and `duration={Math.max(..., ...items.map(...))}`
  allocated new arrays/objects on every editor render, which also blocked any
  future memoisation of the timeline. Both are memoised now.
* Transcript rows are wrapped in `React.memo` with a comparator that ignores
  callback identity (every row gets fresh closures). The playhead now re-renders
  only the rows whose `active` flag changed instead of all of them.

### 7. Clean-up that was already correct

Every `addEventListener` in the renderer has a matching removal (18/18), every
`setInterval` is cleared, the event subscription in `App` is returned from its
effect, and the two background pollers now stop when the screen unmounts. No
leaks were found here, so nothing was rewritten.

## What is still slow, and why it was left alone

| Where | Cost | Why not fixed now | Recommended next step |
| --- | --- | --- | --- |
| `transcript.get` | 115–140 ms, 3.98 MB at 5000 segments (word timings are ~85 % of the payload) | Splitting the response changes the store contract for every screen; the editor genuinely needs word timings to place caption words. | Add `transcript.get({ words: false })` for the project tabs; keep the full version for the editor. Measure again. |
| Durable save on every edit | 19–23 ms at 4.7 MB, growing with the database (~4 ms/MB, whole file rewritten) | It is what makes "Saved" true. Coalescing would trade honesty for latency. | If workspaces above ~20 MB become normal, flush at most once per 2 s while typing, and always flush on explicit save, blur and quit. |
| Transcript tab renders every row | 5000 rows × ~8 elements on first mount | Windowing is a visible behaviour change (follow-playback, scroll anchoring) that cannot be verified without a browser here. | Window the list (active ±150 rows, expand on scroll) and keep the row memo. |
| Editor re-renders at 8 Hz while playing | The whole editor tree, not just the playhead | Isolating the playhead means moving `currentTime` behind a subscription in ~20 places. | Move the playhead into a tiny external store and subscribe only the ruler, the time readout and the active caption. |
| 34 whole-store subscriptions outside `App` | One screen re-render per store write | Wide but mechanical; risky to do blind in one pass. | Convert one screen per change, lowering the budget in `render-subscriptions.test.ts` each time. |
| Single 1.25 MB renderer bundle | Parse/compile on window open; screens are eagerly imported | Code splitting relies on dynamic `import()` under `file://` with `webSecurity: true`; this environment cannot run Electron to verify that it still loads. | Try `React.lazy` for Editor/Settings/Queue, and check the packaged app on a real machine before merging. |
| No DevTools profile | Commit and paint time unknown | No display in this environment. | On a real machine: Performance panel, record 10 s of playback and 10 s of idle, look for long tasks > 50 ms. |

## Rules this leaves behind

* Screens subscribe with a selector, never to the whole store. The budget test
  fails a new whole-store subscription.
* Task lists are polled through `usePoll`, fast only while work is live.
* A poll that returns the same data must not write to the store.
* `useMemo` dependencies list the values the body reads — not parent objects
  that change identity on every edit.
* An interval that copies a media time into state must skip unchanged values.

## Verification

* `tsc --noEmit -p tsconfig.web.json` clean; `electron-vite build` clean
  (`index-na3657yQ.js`).
* Full suite **46 files / 416 tests pass**, including the new
  `store-writes.test.ts` (5) and `render-subscriptions.test.ts` (3).
* Live backend on :8787 answers `storage.status` (`dirty: false`) and serves the
  rebuilt bundle.
