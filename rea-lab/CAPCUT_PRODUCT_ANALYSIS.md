# CapCut as a product — and what actually transfers to Clipwright

**Written:** 2026-10-25 · supersedes the *ranking* in `CAPCUT_STYLE_ANALYSIS.md` and
`CAPCUT_IMPLEMENTATION_PLAN.md` (their measurements are still valid; their conclusions about what
to build first were answering the wrong question).

---

## 1. What I got wrong, specifically

I set out to understand CapCut and ended up measuring two of your videos and saying
"build these three things, because nothing else appears in the export."

That is a category error, and it has three parts:

1. **I treated two videos as a specification.** They are evidence of one creator's choices on one
   job. A user not using a feature says nothing about whether the feature has value — it can mean
   they didn't need it, didn't know it, or ran out of time. I used absence as evidence of absence.
2. **I answered "what's in these pixels?" instead of "what makes CapCut good?"** The first is a
   measurement task. The second is the one that improves your product.
3. **I let the sample decide the roadmap.** Because 1022 uses hard cuts, transitions fell to last.
   But transitions aren't valuable *because* 1022 lacks them; they're valuable if they make
   output feel finished. Those are independent questions.

The measurements themselves were worth doing — for a reason I only saw after your correction.
More on that in §5.

---

## 2. What CapCut actually is

Strip away the marketing and CapCut's core insight is this:

> **The shortest path from raw footage to a publishable vertical short, on cheap hardware, free.**

It is not trying to be a professional NLE. Every design decision in the observed UI serves that
one goal — and this is the part worth understanding, because it is a *product* thesis, not a
feature list:

| Observed design | The job it does |
|---|---|
| **Templates and presets over a blank timeline** | You start from something, not nothing. Blank-canvas paralysis is the biggest drop-off for non-editors. |
| **A "finishing layer" always one click away**: Captions · Text · Stickers · Effects · Transitions · Filters · Adjustment | Polish is never more than a tab away. You don't have to know it exists to find it. |
| **Effects named after intent** — Hero, Bullet, Jump Cut, Montage | You pick a *feeling*, not parameters. This is why non-editors can use it. |
| **One interaction pattern for everything**: the diamond beside every property (prev ◀ / ◆ / next ▶) | One mental model, learned once, applies to scale, position, colour, volume, filters. |
| **"Apply to all" on captions** | Style once, not thirty times. Kills the repetitive labour that makes people quit. |
| **Context-sensitive inspector** (video clip → Video/Audio/Speed/Animation; text clip → Text/Animation/Tracking) | You only see what's relevant. No modal maze. |
| **Generate/AI everywhere** — auto captions, auto reframe, background removal, AI clipper | Removes labour, even if the results need fixing. |
| **Gem icons on paid features** | Not product — commercial. Ignore it. |

**CapCut's real strength is lowering the cost of the last 20%** — the part that separates "raw cut"
from "looks like it belongs on TikTok." That last 20% is captions, punch, motion, sound, pacing.

**And its structural weakness, which is your opening:** it is a *manual* editor. It gives you
tools and expects you to know what your video should be. It has no idea which 40 seconds of your
two-hour podcast are the good ones.

---

## 3. The thing that actually matters for Clipwright

Clipwright already does the thing CapCut cannot: **it finds the moments.** Candidate scoring,
silence detection, transcript-driven selection, metadata.

So Clipwright is not "CapCut but ours." It is:

> **A machine that picks the moments, and then has to finish them.**

And the gap is precisely the finishing layer. You have the selection engine and a solid render
pipeline, but the output of an auto-clip currently looks like a *cut*, not like a *short*. That is
the whole opportunity, and it is where CapCut's vocabulary is genuinely useful.

**Which leads to the thesis I should have started with:**

> ## Take CapCut's finishing vocabulary. Deliver it with Clipwright's automation.
>
> Copy the *what*, automate the *how*. Never copy the manual labour.

If Clipwright copies CapCut's panels, it becomes a worse CapCut — a general editor competing on
breadth, which is unwinnable. If it **auto-applies** CapCut's finishing vocabulary to the moments
it already selected, it becomes something CapCut structurally cannot be.

---

## 4. The translation: every CapCut capability becomes an automatic behaviour

This is the whole reframe in one table. Left column is what CapCut gives a human to do by hand.
Right column is what Clipwright should do to the clip without being asked, with the manual control
still available underneath.

| CapCut capability (manual) | Clipwright behaviour (automatic, overridable) |
|---|---|
| Diamond keyframes on every property | **Auto punch-in** on emphasis (keyword, loud word, speaker change); **auto settle-zoom** on scene change. Writes real editable keyframes — not a baked effect. |
| Speed curves (Hero / Bullet / Jump Cut) | **Auto hook ramp**: a short acceleration into the first beat, hold on the payoff line. |
| Transition library | **Auto transition choice**: hard cut when pacing is fast, short dissolve when the beat is slow or the shot is a still. |
| Filters / Adjust panel (brightness, contrast, saturation, temperature, sharpen, vignette, grain) | **Auto grade**: one look applied to the whole clip at render, chosen to match the source (flat footage gets contrast, warm footage gets left alone). |
| Text panel with outline, "Save as preset" | **Auto label**: the hook line typeset in the measured house style, top-centre, no animation — applied at the moment the auto-clipper marks as the hook. |
| 50 caption presets + **Apply to All** | Style chosen once per project, **applied to every clip by default**, not per clip. |
| Beat detection / auto-cut | **Cut to the music**, not only to speech pauses — the current silence-only cutting misses rhythm entirely. |
| Auto reframe | Already half-built: `trackingKeyframes` exist and are editable; they just aren't driving the crop automatically. |
| Caption templates / styles | Already ahead of CapCut in breadth (50 presets). Behind in defaults. |

**The key insight in that table:** automation needs *taste rules*, not *parameter parity*. To build
"auto punch-in," I don't need to know CapCut's keyframe values. I need a defensible rule — punch in
when the emphasis score is high — plus a range I can tune. That means the features I was "blind" on
are far less blocked than I claimed, because I'm not replicating their numbers, I'm designing our
own defaults around our own selection signals.

---

## 5. Where the measurements now earn their keep

I spent effort measuring 1022 pixel by pixel because I thought it was a spec. It isn't a spec —
but it is exactly what calibration data is for.

The "Bold Top Label" recipe is not "the way 1022 did it." It is a **measured house style**:

```
centre   0.499 × 0.151 of frame
cap height 3.4% of frame height
outline  ~13% of cap height, black
fill     #FFFFFF, bold
animation none
```

That is a *calibrated default*. When Clipwright auto-labels a hook, it should use those numbers —
not because your video did, but because those numbers are known-good at 1080×1920 against a busy
background. This is the right use of the measurement: constants for automation, not a checklist
for a rebuild.

Same for 1013: the still-flicker (four sub-second stills with short crossfades) is not "how to edit
a plague documentary" — it is a **technique for faking motion from one image**, which is directly
automatable and directly useful for the slideshow-style content your auto-clipper will produce
when the source is a talk with no B-roll.

---

## 6. What to build, in order — justified by product logic

Ordered by "does the auto-clipper's output stop looking like a cut and start looking like a short,"
not by what appeared in a sample.

### Tier 1 — make the finishing layer exist and be automatic

1. **Auto label (hook text) — text outline + measured preset.** Today our text layers literally
   cannot draw an outline, so this is impossible, not merely unpolished. Once fixed, apply the
   calibrated default to the hook automatically.
2. **Auto grade** — one look applied at render. Cheap (a filter chain we can already emit), and
   nothing else moves the perceived quality as much per hour of work.
3. **Auto caption style across the project** — you have 50 styles and no "apply to all." A user
   shouldn't have to style 12 clips by hand.

These three are the difference between "a cut with subtitles" and "a short."

### Tier 2 — the motion layer (this is where I was wrong before)

4. **Auto punch-in / settle-zoom** — needs the keyframe primitive (`Animated<V>`), which is
   already half-built: you have a working interpolator with easing for the camera and text layers.
   Generalise it to timeline items, then drive it from the emphasis signals you already compute.
   *I previously demoted this because 1022 has no keyframes. That was the wrong reasoning:
   keyframes are the substrate for automatic motion, and automatic motion is the second-biggest
   quality lever after captions.*
5. **Auto speed ramp on the hook** — the "CapCut feel" most people mean. Medium cost because the
   time-mapping functions assume constant speed.

### Tier 3 — structure and rhythm

6. **Transitions**, starting with the still-sequence case (auto flicker from one image) and
   dissolves on slow beats. This is the one change that restructures the render graph, so it stays
   behind the existing fast path.
7. **Beat-aware cutting** — align auto-clip boundaries to music, not just silences.

### Tier 4 — the manual tools, once the defaults are good

8. Keyframe panel with per-property diamonds (the CapCut pattern — confirmed by the screenshots).
9. Adjust/colour panel with before/after.
10. Transition picker, speed-curve editor, effect presets.

**The ordering principle:** a feature earns its place by making the *default* output better, not by
giving the user another thing to operate. Manual control is a safety valve, not the product.

---

## 7. What is *not* worth copying, and why (product reasons, not sample reasons)

| CapCut thing | Why not |
|---|---|
| Effect/sticker/asset library treadmill | It's licensed content and a retention mechanic. You cannot out-content ByteDance. Compete on outcome, not catalogue. |
| Stock music and SFX libraries | Licensing cost and rights management — a business, not a feature. |
| Cloud generative AI (text-to-video, AI avatars) | Cost, latency, dependency, and it undercuts your local-first position. |
| Voice changer, multi-camera, compound clips | Professional breadth serving use cases your users don't have. |
| Plan gating / watermarks | Obviously not. |
| Templates as a *marketplace* | The idea of templates is good; a marketplace isn't. Local presets, shipped with the app. |
| Its actual interface pixels | Your design guide exists. Take the vocabulary (inspector, diamonds, presets), keep your own visual language. |

---

## 8. Honest limits on what I know

- **CapCut's internals: still unknown.** The research package confirms nothing about their engine.
  For an *automation-first* plan this matters much less than I previously claimed — we're designing
  our own defaults, not matching theirs.
- **I have not seen CapCut's keyframe or speed-curve screens.** The addenda list them as uncaptured.
  If we build the manual tools in Tier 4, screenshots of those two panels would sharpen the UX.
- **My proposed taste rules are hypotheses**, not science. "Punch in on emphasis" needs A/B testing
  against real output. That's an argument for shipping them *as adjustable presets with strong
  defaults*, and for keeping the metrics to tune them.
- **One creator's style is not the market's style.** Your two projects calibrate our defaults for
  *your* content. If Clipwright serves many creators, defaults should become presets with a
  sensible neutral base.

---

## 9. What I'd do next

The same three changes as before — volume fix, text outline + label preset, caption style across
project — but for a different reason and in a different order of importance: they are the cheapest
way to make the **automatic output** look finished, which is the product.

Then the motion layer (auto punch-in), which I had wrongly pushed to the back because a sample
happened not to use it.

If that framing is right, tell me and I'll start on Tier 1, verifying with the loop I set up
(typecheck → 291 tests → build → live app). If you'd rather I go straight at the motion layer
because that's the "CapCut feel" you actually want, say so — it's a bigger job but it's the more
distinctive one.
