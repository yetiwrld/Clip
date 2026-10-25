# Chapter 10: Clip Properties, Transformations, and Animation

**Draft v1, 25 October 2026.** Layers B and C are **[GENERAL]** and **[PROPOSED]**. Layer A (which properties CapCut Desktop exposes and how) is **not yet verified**: secondary sources only name keyframes, speed curves, and motion tracking as present [SECONDARY: skillademia.com, commercial interest; litcommerce.com]. Exact control names, ranges, and defaults are **[UNKNOWN]** pending official help-center pages (Chapter 3).

---

## 10.1 Property categories

| Property | Type | Typical range | Notes |
|---|---|---|---|
| Position (x, y) | 2 floats | Canvas units | Offset of the clip anchor from canvas center |
| Scale (sx, sy) | 2 floats | > 0 | Uniform or non-uniform |
| Rotation | float | Degrees | Around the anchor |
| Anchor/pivot | 2 floats | In clip space | Default: clip center |
| Crop | 4 floats | 0..1 per edge | Applied before transform |
| Opacity | float | 0..1 | Multiplied into alpha |
| Blend mode | enum | Normal, multiply, screen, ... | Applied at composite |
| Flip/mirror | 2 bools | | Equivalent to negative scale |
| Speed | float | > 0 (+ reverse flag) | Changes timeline duration (Chapter 8) |
| Volume | float | 0..N (dB or linear) | Audio |
| Fade in/out | durations | >= 0 | Opacity or volume ramps |

## 10.2 Coordinate systems

Define these explicitly or bugs follow.

1. **Source pixels:** origin top-left, y down, units = pixels of the decoded frame (after applying rotation metadata and PAR).
2. **Clip space:** the source rectangle, normalized or in pixels.
3. **Canvas (project) space:** the output frame. Choose origin (center is convenient for rotation/scale) and units (pixels, or normalized so projects survive resolution changes).
4. **Screen space:** preview widget pixels; includes preview scaling and letterboxing.

Store properties in canvas-normalized units when you want a project to survive changing output resolution; store pixels when exact pixel alignment matters. This choice is left to the implementer.

## 10.3 Transform composition

Order (point from clip to canvas):

```text
p_canvas = T(position) * R(rotation) * S(scale) * T(-anchor) * p_clip
```

Read right to left: move the anchor to the origin, scale, rotate, then translate. Using the wrong order produces rotation around the wrong point or scale that shifts the clip. Represent as a 3x3 matrix (2D) or 4x4 (if 3D rotation/perspective is ever needed).

Crop applies **before** this transform in clip space. Flip = scale by -1 around the anchor.

**Worked example:** clip 1920x1080, anchor at center (960, 540), scale 0.5, rotation 90 degrees, position (0, 0) in center-origin canvas. The clip shrinks to 960x540 and rotates to appear 540 wide by 960 tall, centered. If the anchor were the top-left corner, it would rotate around the corner and shift off-center.

## 10.4 Keyframes and interpolation

An animated property stores a sorted list of keyframes:

```text
Keyframe { time (clip-relative), value, interpolation_out, ease params }
Property { default_value, keyframes[] }
```

Evaluation:

```text
function evaluate(prop, t):
    if prop.keyframes empty: return prop.default_value
    if t <= first.time: return first.value
    if t >= last.time:  return last.value
    find k0, k1 with k0.time <= t < k1.time       # binary search
    u = (t - k0.time) / (k1.time - k0.time)       # 0..1
    u = ease(k0.interpolation_out, u)
    return interpolate(k0.value, k1.value, u)
```

Interpolation types:

| Type | Behavior |
|---|---|
| Hold/step | Value jumps at k1 |
| Linear | Constant rate |
| Ease in/out | Smooth start and/or end (cubic polynomial or cubic Bezier on u) |
| Bezier with handles | User-shaped curves (graph editor) |

Interpolate **rotation** with care: values like 350 to 10 degrees. Decide whether the path is "shortest" or "as stored" (accumulated degrees allow multiple turns). Interpolate **colors** in a defined space (linear light vs gamma-encoded gives different results). Interpolate **scale** multiplicatively (log space) if you want perceptually even zooms.

**Worked examples** (clip-relative times, linear):

| Property | Keyframes | At t = 1.5 s |
|---|---|---|
| Opacity | (0 s, 0.0), (3 s, 1.0) | 0.5 |
| Scale | (0 s, 1.0), (2 s, 1.5) | 1.0 + 0.75*0.5 = 1.375 |
| Position x | (1 s, 0), (2 s, 200) | 100 |
| Rotation | (0 s, 0), (4 s, 90) | 33.75 |

Same values with ease-in/out: apply the easing to u first; at u=0.5 smoothstep gives 0.5, but at u=0.25 it gives 0.156, not 0.25.

## 10.5 Keyframes: editing semantics

- Adding a keyframe while the playhead is on a clip captures the current evaluated value.
- Changing a property value on an animated property **at a time with no keyframe**: either auto-create a keyframe or change the default; this is a design decision (CapCut's behavior **[UNKNOWN]**).
- Trimming and splitting: keep keyframes at clip-relative times; when the left edge is trimmed, shift keyframe times or insert boundary keyframes to preserve the look (Chapter 8, split algorithm).
- Speed changes: decide whether keyframe times scale with speed (they should follow the content) or stay in timeline time.

## 10.6 Time evaluation consistency

Preview and export must evaluate properties through the same function (Chapter 9). Evaluate at the **frame's time**, in exact time units (Chapter 8), never accumulate floats frame by frame.

For clips with speed changes, there are two times: timeline time (animation) and source time (content). Animation normally runs in clip time.

## 10.7 Speed, reverse, stabilization, tracking

- **Speed:** constant factor or curve (Chapter 8 conversion). Audio either follows (pitch changes) or is time-stretched with pitch preservation; both need resampling or a time-stretch algorithm.
- **Reverse:** read decoded frames backward; long-GOP sources require decoding a GOP then playing it in reverse; a cache or pre-render helps.
- **Slow motion quality:** frame duplication, frame blending, or optical-flow interpolation (heavy).
- **Stabilization:** estimate camera motion per frame (feature tracking), smooth the path, apply the inverse transform (crop/zoom to hide borders). Needs analysis pass; result stored as per-frame transforms.
- **Motion tracking:** track a region across frames and attach the transform to another layer. Verified CapCut availability: secondary sources only; implementation **[UNKNOWN]**.

## 10.8 Masks

A mask is a shape or image defining per-pixel alpha for a clip or effect. Parameters: shape, feather, invert, position/scale/rotation, and animation of those. Evaluate as a grayscale alpha map at output resolution, multiplied into the clip's alpha.

## 10.9 Proposed serialization

```json
{
  "clip": "c1",
  "transform": {
    "position": {"x": 0, "y": 0},
    "scale": {"x": 1, "y": 1},
    "rotation": 0,
    "anchor": {"x": 0.5, "y": 0.5},
    "opacity": {"default": 1,
                "keys": [{"t": 0, "v": 0, "ease": "linear"},
                         {"t": 90000, "v": 1, "ease": "easeInOut"}]}
  }
}
```

Label: **[PROPOSED]**. Times in ticks (Chapter 8).

## What a Future Coding Agent Must Understand

- Fix coordinate systems and transform order before writing any renderer code.
- One property-evaluation function serves preview and export.
- Keyframe times are clip-relative; split, trim, and speed edits must preserve animation.
- Interpolation needs type-specific care (rotation wrap, colors, scale).
- Codec keyframes (Chapter 6) are unrelated to animation keyframes.
- **Verified:** CapCut-specific property set is not verified; only secondary mentions.
- **Related:** Chapters 3, 8, 9, 11, 23, 24.
