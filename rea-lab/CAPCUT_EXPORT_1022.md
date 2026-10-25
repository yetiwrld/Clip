# The finished 1022 export — measured, not guessed

**File:** `1022(1).mp4` (sent 2026-10-25, on `main` at `bfdc639`)
**Specs:** 480×854, 30 fps, 63.14 s, 1894 frames, H.264 + AAC 44.1 kHz stereo
**Read with:** ffmpeg 7.0.2 (fetched from PyPI, `imageio-ffmpeg`) + Pillow/numpy for pixel measuring

This is the most useful file you've sent. The draft told me what you *set*; the export shows what
it actually *looks like*. Where the two disagreed, the export wins.

Evidence frames are in [`reference/1022/frames/`](reference/1022/frames/):
`label-level1.jpg`, `label-final-boss.jpg`, `last-clip-letterbox.jpg`.

---

## 1. The text label, in exact numbers

I measured the white text on every label in the export. It is the same on all of them:

| Property | Measured value |
|---|---|
| Horizontal centre | **0.499** of frame width (dead centre) |
| Vertical centre | **0.151** of frame height (near the top) |
| Cap height (FINAL BOSS) | **29 px** at 854 px tall = **3.40%** of frame height → **65 px** at 1080×1920 |
| Width ("Level 1") | 127 px of 480 = 26% of frame |
| Width ("FINAL BOSS!!!") | 277 px of 480 = 58% of frame |
| Colour | white **#FFFFFF** |
| Outline | black, uniform, **~2 px at 480p** = 4–5 px at 1080p ≈ **12–15% of cap height** |
| Bold | yes |
| Shadow / box / fade | **none** — no entrance, no exit, no movement |

Movement check: the label's centre stayed at 0.498–0.499 and its height at 29 px from t=0.05 s
right through to the cut at t=3.95 s. **There is no animation at all** — it just appears with the
cut and disappears with the next cut. That is a genuinely useful finding: your style is
*restraint*, not motion, and reproducing it does **not** need keyframes.

### Why the draft's number looked odd

The draft stores the label at `transform.y = +0.6929`. CapCut's `y` is in half-canvas units with
**+y pointing up**, so that means 0.346 of the canvas *above* centre → 0.5 − 0.346 = 0.154 from
the top. My pixel measurement says 0.151. The two agree within one pixel. So the conversion is:

```
y_from_top = 0.5 − (capcut_y / 2)
```

Useful to know, because it's the same convention our `TextLayer.y` uses (0 = top, 1 = bottom),
so the conversion is trivial and exact.

---

## 2. What the export added that the draft didn't show

### 2.1 There is a soundtrack after all

The draft has **zero** audio materials, but the export has an AAC track at −21.1 dB mean,
−0.2 dB peak. Per-4-second loudness swings from −31 dB to −15 dB, which is the shape of
diegetic sound (machine noise on the mower clip, drill on the dentist clip) rather than a music
bed. Most likely CapCut's "extract audio from video" was used on the source clips, or each source
file's own audio was simply kept.

**Product implication:** our timeline alreadies map `TimelineItem.volume` per item, and video
sources carry audio (`hasAudio`). What we are missing is a *simple* "import a clip with its own
sound at normal level" path being the default. Worth checking before we add anything.

### 2.2 The last clip is deliberately letterboxed

```
t = 60s:  black bar   0..112
          picture   113..624   (full width, 60% of frame height)
          black bar 625..853
```

That is a landscape clip (`dreamina-seedance 720p`, 1284×716) sitting in a vertical canvas with
big black bands above and below, and the "FINAL BOSS!!!" label living in the top band.

**Good news:** our app can already do this — it's `fitMode: 'fit'` (show the whole picture,
letterbox). No new feature needed. What we *do* need is the label staying inside the black band
instead of overlapping the picture, which is a placement nicety, not an engine change.

One honest caveat: the black bars are not at the source's natural aspect (the picture measures
0.94:1, not 1.79:1), which suggests it was scaled by hand. I'm not going to copy that distortion
— I'd letterbox at the correct aspect unless you tell me you want the stretched look.

### 2.3 Cut points, checked against the draft

Scene detection finds 34 cuts. Every cut the draft predicts is present exactly:

- the 4.00 s grid: 4.00, 8.00, 12.00, 16.00, 20.00, 23.13, 27.13, 31.13 … 59.13 ✓
- the one 3.13 s clip (dentist, 20.00 → 23.13) ✓
- the last clip starting at 59.13 s ✓

The extra detections (1.47, 2.93, 6.00, 9.80, 15.07, 30.10, 41.13 …) are *movement inside a
shot*, not real cuts — a hand moving fast reads as a scene change to the detector. Nothing here
is a hidden transition.

---

## 3. The whole "1022" recipe, in plain terms

Exactly this, and nothing more:

1. **Vertical 1080×1920, 30 fps.**
2. **16 clips, each exactly 4.00 seconds**, one 3.13 s, cut as hard cuts. No transitions.
3. **One white bold label, top-centre**, black outline ~2 px at 480p, no animation, text changes
   with each clip: "Level 1" → "Level 2" → "Level 3" → "FINAL BOSS!!!" on a 4-clip loop.
4. **One landscape clip at the end**, letterboxed, still carrying the label.
5. **Clip audio left on**, no music bed, no fades.
6. That's it. No filters, no colour grade, no effects, no masks, no keyframes, no speed curves.

The comedy comes from **order and escalation** (barber → dentist → cashier → chiropractor, each
escalating, ending on a lawnmower through a wall), not from editing tricks. That is a very
cheap style to reproduce and a very expensive one to imitate badly.

---

## 4. What this means for the build list

Against what we can do **today**, using the export as the target:

| # | Need | Status in our app | Work |
|---|---|---|---|
| 1 | White bold text, top-centre, **black outline** | **blocked** — text layers have no outline at all (`text-ass.ts` writes the outline in the text colour, width 0) | **small** — add `outlineColor` / `outlineWidth` to `TextLayer`, colour the ASS outline properly, 3 controls in the inspector |
| 2 | Text with **no animation** | works — `animationIn: 'none'` / `animationOut: 'none'` exist | none |
| 3 | Text centred at 0.151 from the top | works — `y` is already 0..1 from the top | none, just a preset value of `0.15` |
| 4 | Cap height 3.4% of frame (65 px at 1920) | works — `fontSize` in px | none, preset value `65` |
| 5 | Outline ≈ 13% of cap height | needs the new outline field | same change as #1 |
| 6 | Clip audio at normal level | works — items have `volume`, video assets have `hasAudio` | none |
| 7 | Landscape clip letterboxed in a vertical canvas | works — `fitMode: 'fit'` | none |
| 8 | "Every clip exactly 4.00 s" pacing | not automatic — you'd trim each clip by hand | **small** — a pacing button that snaps clip boundaries to a fixed grid |
| 9 | Music at +6 dB (from project 1013) | **broken** — `plan.ts` clamps volume to 1.0, so anything above 100% is lost on export | **tiny** — clamp to the schema's own 0–4 range |

**So "the 1022 look" needs three code changes, two of them tiny**, plus one preset:

- **A.** Text outline support (the only real feature).
- **B.** Volume clamp fix (a two-character bug).
- **C.** Fixed-pace snapping (nice to have, not required to match the video).
- **D.** A saved text preset — working name *"1013 label"* or *"Bold Top Label"* — that is exactly
  the measured recipe: white, bold, `y = 0.15`, cap height 3.4% of height, outline 13% of cap
  height, no animation.

Note what fell off the list entirely: transitions, speed curves, keyframes, colour grading,
masks, effects. None of them appear in the finished video.

---

## 5. Still worth having from you

- An export of **1013** as well — that one has the still-flicker technique and the +6 dB music, and
  I'd like to measure both properly rather than infer them from JSON.
- Nothing else. With this video I can match the look.

---

## 6. Reproducing the measurements

```bash
# ffmpeg came from PyPI here because the sandbox has none installed
pip3 install --target /var/tmp/pylibs imageio-ffmpeg pillow numpy
FF=/var/tmp/pylibs/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2

$FF -i 1022.mp4                                  # specs
$FF -i 1022.mp4 -af volumedetect -f null -       # loudness
$FF -i 1022.mp4 -filter:v "select='gt(scene,0.3)',showinfo" -an -f null -   # cut points
$FF -ss 14 -i 1022.mp4 -frames:v 1 frame.png     # a frame to measure

python3 rea-lab/tools/capcut-digest.py rea-lab/reference/1022     # the draft side
```

Text position/size/outline were measured by finding white pixels that have dark pixels within
3 px (that separates outlined text from bright video), then taking the bounding box and the
median black run directly above the cap line.
