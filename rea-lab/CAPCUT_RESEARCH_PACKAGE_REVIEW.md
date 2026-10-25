# The `Video Editor/` research folder — my honest read

**Source:** `Video Editor/` uploaded to `main` at `4b05d5a` (2026-10-25). 36 markdown files,
about 33,000 words: 26 chapters, 2 screenshot addenda, 4 deliverable notes, a decisions table.

I read all the parts that matter for our work: the handoff brief, the uncertainty register, the
coverage audit, both screenshot addenda, and chapters 8 (timeline), 10 (properties/animation),
11 (effects/transitions), 12 (text), 20 (performance), 22 (prioritisation), 24 (algorithms),
29 (decisions).

---

## 1. What this folder actually is

It is **not** a description of how CapCut works inside. It is a **research textbook for building
your own video editor**, written with clear evidence labels: `OFFICIAL`, `SECONDARY`, `GENERAL`,
`PROPOSED`, `UNKNOWN`.

I counted the labels across all files:

| Label | Count | Meaning |
|---|---|---|
| `UNKNOWN` | **65** | Explicitly "we could not find this out" |
| `SECONDARY` | 63 | Third-party blog, not CapCut itself |
| `PROPOSED` | 31 | The author's suggested design, **not** a fact about CapCut |
| `GENERAL` | 17 | Standard video-editing knowledge, no source |
| `OFFICIAL` | 17 | CapCut's own pages |

And its own audit (`D1_coverage_audit_and_matrix.md`) says so plainly:

> "**Result: the audit did not pass in full.** … The CapCut-specific chapters (2, 3, 4, 17, 18)
> are materially incomplete because first-party documentation was thin and I had no first-hand
> access to the application."

And on the exact thing I said I was blind to (`D2`, section D.5):

> "CapCut's media engine, rendering architecture, GPU usage, project file format and location,
> cache layout, undo implementation, **effect implementations**… **No evidence was found for any of
> them.** Nothing in the textbook asserts them; all architecture is **[PROPOSED]**."

**So: it does not explain CapCut's internals.** It explains CapCut's *screen* — and that part is
genuinely new and useful. More below.

---

## 2. The genuinely new part: observed screenshots

Two addenda describe six real screenshots of CapCut Desktop — **including your own project 1022
open on screen**. That is first-hand observation, not documentation. This is the valuable half of
the package, and it confirms and extends what I had guessed from the draft files.

### 2.1 The inspector — confirms the keyframe model I planned

Observed, on your project:

- Right-hand panel tabs for a video clip: **Video · Audio · Speed · Animation · Adjust · AI stylize**
- Sub-tabs under Video: **Basic · Remove BG · Mask · Retouch**
- Every property row has **three keyframe controls**: previous keyframe ◀, diamond ◆, next ▶
- Property rows: Scale (100%), Uniform scale toggle, Position X/Y, Rotate (0.00°) with a dial,
  8 alignment buttons, **Blend**, **Stabilize** (gem = paid), **Enhance quality** (gem)
- Section headers have a **reset icon**

My plan proposed "diamond next to every property". That is now **confirmed as CapCut's actual
pattern**, including the previous/next arrows. Good — no change needed, just higher confidence.

### 2.2 The text panel — gives me our text inspector design directly

Observed with a text clip selected. Panel tabs: **Text · Animation · Tracking · Text to speech ·
AI avatars**. Sub-tabs: **Basic · Bubble · Effects**. Fields:

| Control | Observed |
|---|---|
| Content | editable text field |
| Font | dropdown ("System") |
| Font size | slider + number (**15**) |
| Bold / Underline / Italic | B U I buttons |
| Case | **TT / tt / Tt** buttons |
| Colour | white swatch **with keyframe controls** |
| Spacing | **Character** and **Line**, both 0 |
| Alignment | six icons |
| Preset | **Save as preset** button |

Two things to take: colour is **animatable** (so our text colour should be keyframable, not
static), and **"Save as preset"** is a first-class button — exactly the "saved preset" item I
proposed after measuring the export. CapCut puts it right there in the panel.

### 2.3 Shortcuts — observed, including the ones I'd have got wrong

Split `Ctrl+B`, Split all `Ctrl+Shift+B`, Select mode `A`, Split mode `B`, `Q`/`W` delete
left/right, main-track magnet `P`, auto snapping `N`, linkage switch `~`, preview axis `S`,
**J/K/L shuttle**, `[`/`]` select left/right, **show keyframe panel `Alt+K`**, **add keyframe
`Shift+Alt+K`**, and — tellingly — **Ease in / Ease out / Easing / Linear exist as commands with
no default key**.

That last one is a strong hint about CapCut's animation model: easing is a *command applied to a
keyframe*, not a numeric field you type. Worth mirroring: our easing is currently a dropdown value
on the keyframe, which is fine, but a keyframe-panel + ease commands is the CapCut-shaped UX.

### 2.4 Timeline and tracks (observed)

- Text track is **separate and sits above** the video track — same as ours.
- Video clips show **thumbnails and an audio waveform inside the same clip strip**.
- Track headers: **track icon, lock, eye, speaker (mute)**, and a "…" menu; a **Cover** button.
- Toolbar contents are **context-sensitive**: fewer icons with a text clip selected than with a
  video clip.
- Timecode shows **frames**: `00:00:00:00 / 00:01:03:04`.

### 2.5 The right-click menu (observed) — a list of features we don't have

`Copy` `Ctrl+C` · `Cut` · **`Copy attributes` `Ctrl+Shift+C` / `Paste attributes`** · `Delete`
`Backspace` · `Edit` ▸ · `Split scenes` (Free) · `Transcript` (paid) · `Separate audio` ·
`Extract audio` · `Sync video and audio` · **`Create compound clip (subproject)` `Alt+G`** ·
`Create multi-camera clip` · **`Save preset`** · `Group`/`Ungroup` · `Export selected clips` ·
**`Deactivate clip` `V`** · `Trim clip` · **`Replace clip`** · **`Link to media`** (relink) ·
`Open file location` · `Edit effects` · `Show variable speed animation` · `Range` ▸ · `Render` ▸

The disabled states are informative: "Paste attributes" greys out when the clipboard is empty,
"Link to media" greys out when media is linked, "Show variable speed animation" greys out when no
speed curve exists.

### 2.6 Export dialog and settings (observed)

Export: Resolution **480P**, Bit rate **Recommended**, Codec **H.264**, Format **mp4**, Frame rate
**30fps** with a list of **24, 25, 29.97, 30, 50, 59.94, 60**, an **estimated size** ("about 22 MB
for 1m 4s"), separate **Video** and **Audio** sections each with its own checkbox, and a
**Remove watermark** toggle behind the paid tier.

Settings ▸ Draft: project folder (`com.lveditor.draft`), separate screen-recording / downloads /
presets folders, **cache 273.48 MB with a clear button**, and **auto-delete cache after N days**.

---

## 3. What it does NOT contain (so nothing on my build list changes)

I checked specifically for the things I said I was blind to:

- **No animation values.** No easing curves, no default keyframe durations, no CapCut parameter ranges. Chapter 10 says CapCut's property set is "**[UNKNOWN]**", "only secondary mentions".
- **No speed-curve data.** Chapter 8 gives the *general* maths (integrate the speed function, build a monotonic lookup table) but nothing about how CapCut stores a curve.
- **No filter or effect parameters.** Effect names appear only as "examples of user-visible effects"; implementation is `UNKNOWN`.
- **No transition catalogue.** Chapter 11 explains transitions generally; only "cross-dissolve first" is suggested as a starting point.
- **No colour/LUT values.** Chapter 14 is general colour theory.

So the three-item build list from the export measurement stands unchanged:
**text outline → volume clamp fix → pacing snap**, plus the measured "Bold Top Label" preset.

---

## 4. What it *does* change — six concrete things

These are real findings for our app, not general advice. I checked each against our source.

### 4.1 We do not support fractional frame rates

CapCut's observed list is 24, 25, **29.97**, 30, 50, **59.94**, 60. Ours:

```ts
// src/shared/types/index.ts:267
export type OutputFps = 'source' | 24 | 25 | 30 | 50 | 60
```

No 29.97 or 59.94. Those are the *actual* rates of most NTSC broadcast and a lot of phone/screen
footage, so "source" is our only way to keep them — and any user picking a number forces 30.
**Gap, easy to fix.**

### 4.2 We have essentially no keyboard shortcuts

Our editor handles `ArrowLeft`, `Backspace`, `Delete`, `Enter` and a couple of modifier combos.
There is no `Ctrl+B` split, no `J/K/L`, no select modes, no `Alt+K` keyframe panel. CapCut's whole
editing feel is shortcut-driven. **Gap, medium.**

### 4.3 Keyframes must survive split and trim — a rule our model will break

Chapter 24 states it exactly:

```
partition keyframes at (t - clip.start); add boundary keys
```

and chapter 10: "when the left edge is trimmed, shift keyframe times or insert boundary keyframes
to preserve the look".

Our keyframes (`cameraKeyframes`, `textLayers[].keyframes`, `trackingKeyframes`) live in **source
time**, and our trim/split operations in `timeline-editing.ts` do not touch them. That happens to
work for camera/text today, but the moment I add per-item property keyframes (WS1 in the plan) in
*timeline* time, split will silently break animation. **This validates the exact concern I flagged
in the plan — and now I have the algorithm to follow.**

### 4.4 Transitions need handles — my "handle-consumption" recommendation is confirmed

Chapter 11: "Frames from **both** clips are needed during the overlap, so each clip needs source
media beyond its cut ('handles'). If handles are missing: **shorten the transition or freeze
frames**." That is precisely the duration policy I recommended you pick. Good.

### 4.5 Features we simply don't have (worth knowing they're normal)

`Copy/Paste attributes`, `Deactivate clip` (disable without deleting), `Replace clip`,
`Link to media` (relink — we only have a `missing` flag), `Create compound clip` / subprojects,
`Group/Ungroup`, `Save preset`, multi-timeline projects. Each is small-to-medium, none is urgent,
and our `missing` flag is already the seed of a proper relink flow.

### 4.6 Our timeline time model is floats; the textbook calls that out as a defect

"Floats are not acceptable for stored times" — it recommends integer ticks at 1/240000 s. Our
`TimelineItem.startTime`, `sourceIn`, `sourceOut` are all `number` seconds and we do floating-point
arithmetic on them (`timemap.ts`). This is a real long-term risk: repeated trim/split/concat can
accumulate drift, and frame-exact cuts get fuzzy. **Not urgent, but it is the kind of thing that
becomes un-fixable later.** My honest opinion: don't rewrite now, but add exact-time conversion at
the FFmpeg boundary (`-ss`/`-t` already get 3 decimals) and treat it as a known debt.

---

## 5. Where the package's advice conflicts with our app

Important, because the package is written for a different product shape.

| The package assumes | Our app actually is |
|---|---|
| Build your own frame compositor: decode → transform → blend → encode per frame | We emit an **FFmpeg filter graph** and let FFmpeg do it |
| Build a Qt/C++ or similar native Windows editor from scratch | We are Electron + TypeScript + FFmpeg |
| Start from import, timeline, undo, export | We already have import, timeline, undo/redo, export |
| Preview = same `render_frame()` at lower quality | We preview with CSS and render with FFmpeg, kept honest by shared geometry functions |
| "Early targets" are the fundamentals | Our fundamentals exist; our gap is *editing vocabulary* |

So I take the **semantics** (time model, keyframe rules, split/trim preservation, transform order,
transition handles, half-open intervals) and the **UI vocabulary** (inspector tabs, per-property
diamonds, keyframe panel, presets). I do **not** take "write your own compositor" — that would
throw away the working engine to solve a problem we don't have.

Its transform order is worth stealing verbatim though, since we do compose transforms:

```
p_canvas = T(position) · R(rotation) · S(scale) · T(−anchor)
```

plus its warnings: interpolate rotation by shortest path or by accumulated degrees (pick one),
interpolate scale in log space for perceptually even zooms, and interpolate colours in a stated
space. Our `timelineOverlayGeometry` does centre-anchor translate + scale + rotate, which matches
this order already — but the rotation-wrap and log-scale points are ones I had not written down.

---

## 6. Take / skip

| Item | Decision |
|---|---|
| Observed inspector layout (tabs per clip type, diamonds + prev/next) | **Take** — design our inspector to match |
| Observed text panel fields + "Save as preset" | **Take** — becomes our text inspector spec |
| Shortcut set (`Ctrl+B`, `J/K/L`, `A`/`B`, `Alt+K`, ease commands) | **Take** — build a real shortcut map |
| Fractional fps 29.97 / 59.94 | **Take** — actual bug in our types |
| Keyframes survive split/trim (partition + boundary keys) | **Take** — mandatory before WS1 |
| Transitions need handles → shorten or freeze | **Take** — confirms our policy choice |
| Integer ticks over float seconds | **Note as debt**, don't rewrite now |
| Transform order + rotation wrap + log-space scale | **Take** the rules |
| Copy/paste attributes, deactivate clip, replace clip, relink, compound clips | **Backlog**, low priority |
| Write your own compositor / native app | **Skip** — wrong for our architecture |
| Chapter 22's "early targets" list | **Skip** — we already have those |
| Any "PROPOSED" design presented as CapCut behaviour | **Skip** — it isn't |

---

## 7. Bottom line

You were right that it explains something important — but it explains **CapCut's screen**, not
CapCut's engine. The screenshot addenda are the valuable half: they gave me the inspector layout,
the text panel, the shortcut map, the context menu and the export dialog as *observed fact*, which
is much better than the docs I had before.

It did **not** unblock the fancy features (speed curves, effects, filters) — it says outright that
none of that was verifiable. It also did not change what your own export told me to build.

What it did do is expose **three real gaps in our app I didn't know I had**: no 29.97/59.94,
no shortcut system, and a keyframe/split interaction that would bite us the moment we add
per-property animation.

### Still missing, if you want to keep closing the gap

1. **The 1013 export** — so I can measure the still-flicker and the +6 dB music.
2. **A project using a speed curve and a keyframe** — the two things I'm still blind on.
3. **The screenshots this package worked from**, if you still have them — the addenda list what's
   still uncaptured (Speed tab, Animation tab, keyframe panel, Captions tab, export Audio section).
   Typed lists of those panels' fields work just as well as images.
