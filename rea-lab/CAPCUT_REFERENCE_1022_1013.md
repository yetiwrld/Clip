# The two real CapCut projects — what they actually contain

**Received:** `1022.zip` on 2026-10-25 (on `main`, commit `18bc254`).
**Update:** the finished export of 1022 also arrived — measured in
[`CAPCUT_EXPORT_1022.md`](CAPCUT_EXPORT_1022.md). Where the draft and the video disagree, the
video wins, and it gave exact numbers for the label (centre 0.499 × 0.151, cap height 3.4%,
outline ~13% of cap height, no animation).
**Read with:** `rea-lab/tools/capcut-digest.py` — run it yourself on any draft folder.
**Copied here:** the `draft_content.json`, `draft_meta_info.json`, `draft_settings` and cover
image of each project, in [`reference/`](reference/). The caches and media were left out.

This document says what your two projects are made of, and what that changes about the plan.

---

## 1. Short version

You sent two projects, and they are **two different products**, not one style:

| | **1022** | **1013** |
|---|---|---|
| Shape | 1080×1920 vertical (Short) | 1920×1072 horizontal (long video) |
| Length | 63.1 s | 375.8 s (6m 16s) |
| Content | 16 AI video clips, one every 4.0 s | 85 illustrated stills |
| Text | 16 text overlays: "Level 1 → Level 2 → Level 3 → FINAL BOSS!!!" | none (text is drawn into the images) |
| Audio | none in the project | 8 narration/music files, all at +6 dB |
| Transitions | none — hard cuts | 5 × "Slow Fade" |
| Speed changes | one clip at 2.19× | none |
| Keyframes, filters, effects, masks, colour grading | **none at all** | **none at all** |

The single most useful finding: **almost none of the features I ranked highly in the plan are
used in either project.** No speed curves. No keyframes. No colour grading. No masks. No effects.
No beat sync (the project has empty beat containers). What you actually use is a small, sharp set
of techniques.

---

## 2. Project 1022 — the "levels" short

```
canvas      1080x1920 vertical @ 30fps, 63.1s
tracks      video (16 clips), text (16 overlays)
pacing      every clip is exactly 4.00s (one is 3.13s) -> a fixed grid
text        identical style x16: white #ffffff, bold, black #000000 outline width 0.06,
            position y = +0.6929 (upper area), scale 1.0, centred
content     Barber -> Dentist -> Cashier -> Chiropractor, each escalating:
            "Level 1", "Level 2", "Level 3", "FINAL BOSS!!!"
```

Two visual details that matter:

1. **The text sits near the top, not the bottom.** CapCut's `transform.y` is in half-canvas
   units with +y pointing up, so `+0.6929` means "0.35 of the canvas above centre" — about 15%
   from the top. The cover image confirms it: "Level 1" is written high, above the subject's
   head, not as a subtitle.
2. **The outline is what makes the text readable.** White bold text with a black edge, no box,
   no shadow. That is the entire recipe.

The last clip is different: `dreamina-seedance 720p`, 1284×716, 8.77 s at 2.19× speed. That is a
generated "boss" clip, not a 720×1280 source, and it is the one place a speed change is used.

---

## 3. Project 1013 — the illustrated story

```
canvas      1920x1072 horizontal @ 30fps, 375.8s
tracks      video (7 intro stills), video (78 body stills), audio (2), audio (6)
pacing      intro stills 3.9-7.2s; body stills 0.53-10.6s, median 3.83s
transitions 5 x "Slow Fade", durations 0.267s, 0.333s, 0.333s, 0.467s, 1.000s, overlap=true
audio       8 files (1.mp3 ... 8.mp3), volume 1.9953 = +6.0 dB, no fades, no ducking
content     "You Survive the Black Death (1348)" - a history story
```

### The interesting technique: still-flicker sequences

The five Slow Fades are not decoration. Four of them cluster into two deliberate bursts:

```
#51  E-09a.jpg   0.53s   Slow Fade 0.267s
#52  E-09b.jpg   0.73s   Slow Fade 0.333s
#53  E-09c.jpg   0.90s   Slow Fade 0.333s
#54  E-09d.jpg   1.67s   (no fade)

#66  F-12a.jpg   3.33s   Slow Fade 1.000s
#67  F-12b.jpg   2.00s   Slow Fade 0.467s
#68  F-12c.jpg   1.57s   (no fade)
```

Four near-identical stills (a/b/c/d) held for under a second each, with short crossfades, then a
longer hold. That is **how you fake motion from a single drawing** — the picture "shakes" or
"settles" by flickering between variants. You did it by hand. It is the one place in either
project where a real editing idea is hiding.

### The rest of it

- Stills are cut **hard** to the narration. Median 3.83 s, but the range 0.53–10.6 s means the
  timing follows the words, not a grid.
- Music is +6 dB, continuous, split into 8 pieces with 0.3–2.3 s gaps — each piece covers a
  chapter.
- No Ken Burns, no zoom, no pan. The drawings carry it.
- The cover/intro frame is a thumbnail-style composition: white background, hand-drawn arrow,
  "Survive" / "Or" / "DIE" in black-black-red. That is baked into the image asset.

---

## 4. What this changes about the plan

I ranked features from documentation in
[`CAPCUT_STYLE_ANALYSIS.md`](CAPCUT_STYLE_ANALYSIS.md). Your real projects reorder that ranking.
Honest revision:

| Feature | Plan rank before | **Evidence** | Plan rank now |
|---|---|---|---|
| Text overlay look (white bold + black outline, top position) | not listed — I assumed we had it | used in **16 of 16** clips in 1022, and we **cannot** reproduce it (§5) | **#1** |
| Crossfade transitions | Tier 3, "risky, ship last" | the **only** transition used, 5 times, 0.27–1.0 s | **#2** |
| Music at +6 dB | not listed | **8 of 8** audio clips | **#3** |
| Still-flicker micro-montage | not listed | the one genuine technique in 1013 | **#4** |
| Fixed-pace clip grid (4.0 s) | not listed | 15 of 16 clips in 1022 | **#5** |
| Speed curves | "the CapCut signature", Tier 2 | **1** clip, at 2.19× — no curves at all | demoted |
| Property keyframes | Tier 1 | **0** keyframes in both projects | demoted |
| Colour grading / adjust panel | Tier 1 | **0** filters, 0 adjusts | demoted |
| Masks / chroma / blend | Tier 3 | **0** | demoted |
| Beat-synced cutting | Tier 3 | beat containers exist but are **empty** | dropped for now |
| Auto reframe | Tier 2 | not used | keep, low priority |

**One caveat, said plainly:** two projects by one creator are evidence of *your* style, not of
all CapCut style. I am not throwing the rest of the plan away — I am reordering it so that what
you actually do gets built first. If you also want the flashy CapCut features for users who are
not you, say so and they stay on the list, just behind your own workflow.

---

## 5. Three things we cannot do today, found by reading our code against your projects

These are not opinions. Each is a specific line in our source that blocks a technique you use.

### 5.1 Text layers have no outline — so "Level 1" is impossible
*(confirmed against the export: the label's outline is ~2 px at 480p, i.e. ~13% of cap height,
and our text path cannot produce any outline at all)*

`src/shared/captions/text-ass.ts` writes the outline colour as *the same colour as the text*, and
sets outline width to `0` unless the layer has a background box:

```js
const outline = layer.backgroundOpacity > 0 ? Math.max(1, size * 0.12) : 0
`Style: ...,${color(layer.color,1)},${color(layer.color,1)},${color(layer.color,1)},${bg},...`
//          PrimaryColour              SecondaryColour            OutlineColour
```

`TextLayer` has no `outlineColor` or `outlineWidth` field at all. Captions *do* have both
(`CaptionOverrides.outlineColor` / `outlineWidth`, used properly in `ass.ts`). So the text-layer
path is simply behind the caption path.

**Fix:** add `outlineColor`, `outlineWidth`, `shadow` to `TextLayer`, wire into the ASS style
line, expose three controls in the text inspector. Small change, and it unblocks your signature
look.

### 5.2 Volume is clamped at 1.0, so we cannot do +6 dB

`src/main/services/rendering/plan.ts` line ~125:

```js
`volume=${Math.max(0, Math.min(1, item.volume)).toFixed(3)}`
```

The schema allows `volume` up to `4` (`src/shared/schemas/index.ts`), and your projects use
`1.9953` — exactly +6 dB. The renderer throws that away and plays it at 1.0. Anything above
100% is silently lost on export.

**Fix:** clamp to the schema's range (0–4) instead of 0–1, i.e.
`Math.max(0, Math.min(4, item.volume))`, and add a regression test.

### 5.3 Nothing can blend two neighbouring clips

There is no transition concept in the model and no `xfade` in the renderer (0 occurrences). Two
clips on one track are always a hard cut. Your "Slow Fade" is therefore not reproducible at all
right now — this is the same gap I flagged as the architectural one in the plan, now confirmed
against real use rather than assumed.

---

## 6. Revised Tier 1 (what I would build first now)

**Updated after measuring the export** — the label needs no animation and no keyframes, which
removes work from item 1. Numbers are now known instead of estimated.

1. **Text layer outline + a saved "Bold Top Label" preset** — the preset is the measured recipe:
   white, bold, centre 0.499 × 0.151, cap height 3.4% of frame height, outline ~13% of cap
   height, no animation. Half a day. Unblocks your main look.
2. **Volume range fix (0–4)** — minutes. Stops losing +6 dB on export.
3. **Crossfade transitions, "Slow Fade" first** — the only transition you use. Needs the
   canvas-per-track change, but only for tracks that have a transition; hard-cut tracks keep
   today's fast path.
4. **Still-flicker helper** — take one image, split into N sub-clips (0.5/0.7/0.9/1.7 s) with
   small transform variation and crossfades between them. Automates what you did by hand in 1013.
5. **Pacing grid preset** — "every clip exactly 4.0 s" for the vertical format.

Items 1, 2 and 5 are small and independent. Item 3 is the one with real risk. Item 4 depends on 3.

---

## 7. What would make this analysis better

1. **An exported MP4 of 1022** (and 1013 if you have it). With the export plus the draft I can
   compare our render to yours frame by frame and tune the text size and outline exactly, instead
   of estimating from the draft numbers.
2. Confirmation of what "1022" meant in your message — I treated it as the project name, since
   the zip contains a folder called `1022`. If you meant something else, tell me.
3. Whether you want the flashy CapCut features (speed ramps, effect packs, colour looks) for
   *other* users even though your own workflow doesn't use them.

---

## 8. Reproducing this analysis

```bash
python3 rea-lab/tools/capcut-digest.py rea-lab/reference/1022
python3 rea-lab/tools/capcut-digest.py rea-lab/reference/1013
python3 rea-lab/tools/capcut-digest.py <any-unzipped-draft-folder> --json
```

The tool reads only JSON, so it is safe to point at a freshly unzipped folder.
