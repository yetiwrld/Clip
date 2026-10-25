# Chapter 14: Color, Exposure, and Image Appearance

**Draft v1, 25 October 2026.** Layers B and C are **[GENERAL]** and **[PROPOSED]**. CapCut's color controls are only mentioned by secondary sources (a course lists color adjustments and grading; one guide mentions a palette tool for matching a reference look [SECONDARY: parrainduweb.fr; Udemy descriptions]); labels, ranges, and implementation are **[UNKNOWN]**. Standards (ITU-R BT.601/709/2020/2100, sRGB) still need to be cited from their publishers; the facts below are standard but not yet source-linked. FFmpeg's libswscale is documented as the color conversion and scaling library (https://ffmpeg.org/doxygen/0.10/index.html, accessed 25 Oct 2026).

---

## 14.1 Basic adjustments and what they do mathematically

Assume pixel values `v` in 0..1 per channel (in a defined color space, 14.4).

| Control | Typical operation |
|---|---|
| Exposure | Multiply by `2^stops` (best in linear light) |
| Brightness | Add an offset (simple, lifts blacks) |
| Contrast | Scale around a pivot (mid-gray): `(v - p) * c + p` |
| Saturation | Mix between luma and color: `luma + (v - luma) * s` |
| Hue shift | Rotate chroma around the hue axis (in HSV/HSL or YCbCr/IPT-like space) |
| White balance (temperature/tint) | Per-channel gains (ideally in a linear, camera-aware space) |
| Highlights/shadows | Tone-dependent adjustments: a mask by luminance (smooth weights) times an adjustment |
| Gamma | `v^(1/gamma)` midtone shift without moving black and white |
| Curves | User-defined 1D mapping per channel or luma, spline interpolated, baked into a lookup table |
| Color wheels (lift/gamma/gain) | Lift raises blacks, gain scales whites, gamma shapes mids, per color channel |

Order of operations changes results (like effects, Chapter 11). Define a fixed internal order for the basic panel, or a user-ordered chain.

## 14.2 LUTs

- **1D LUT:** per-channel curve table.
- **3D LUT:** maps RGB triples through a 3D grid (commonly 17^3, 33^3, 65^3) with trilinear or tetrahedral interpolation; can express arbitrary color transforms.
- Common file formats: `.cube`, `.3dl`. Check the format specs before parsing.
- A LUT assumes a specific **input** color space; applying a log-camera LUT to Rec.709 footage gives wrong results. Metadata or user selection must define input/output.
- Intensity blend: `mix(original, lut_applied, amount)`.
- Missing LUT file on reopen: follow the unavailable-effect policy (Chapter 11).

## 14.3 Color spaces, transfer functions, range

- **Primaries and white point:** which red/green/blue and white define the gamut (BT.709 and sRGB share primaries; BT.2020 is wider; Display P3 is another wide gamut).
- **Transfer function (gamma/EOTF):** non-linear encoding of light: sRGB piecewise curve, BT.1886 display gamma (about 2.4), HLG and PQ for HDR.
- **Matrix coefficients:** how Y'CbCr relates to R'G'B' (BT.601 vs BT.709 vs BT.2020).
- **Range:** limited (video, 16-235 for 8-bit luma) vs full (0-255). Mismatch gives washed-out or crushed images.
- **Chroma subsampling:** 4:2:0 loses color resolution; upsample properly (bilinear or better) when converting to RGB.

## 14.4 Working space and precision

| Approach | Behavior | Trade-off |
|---|---|---|
| Display-referred, gamma-encoded 8-bit | Simple; math done on encoded values | Fast and common; blends and blurs are slightly "wrong" (darker edges), banding in gradients |
| Linear light, float (16-bit half or 32-bit) | Physically plausible blends/exposure | More memory and bandwidth; needs conversions |
| Full color-managed pipeline | Input transform, working space, output transform per clip and per display | Most correct; most complex |

Banding: 8-bit gradients show steps after strong adjustments; use higher internal precision and dither at export to 8-bit.

Clipping: values above 1.0 or below 0 are either preserved (float) or lost (integer). Highlight recovery is only possible if values are preserved until the adjustment.

## 14.5 SDR vs HDR

HDR footage (HLG/PQ, BT.2020, 10-bit) needs: correct detection from stream metadata, tone mapping for SDR preview/export when the project is SDR, and correct tagging on export. Mixing SDR and HDR clips requires an explicit rule. HDR is a high-complexity feature for a first version; a reasonable minimum is to **detect HDR sources and tone-map to SDR with a warning**.

## 14.6 Preview vs export consistency

Sources of mismatch: different conversion code paths (GPU shader vs CPU scaler), different range assumptions, monitor profile (the OS may or may not color-manage the preview), missing stream tags causing players to guess. Mitigate: one conversion implementation used by both; explicit output tagging; test charts (gradients, color bars) rendered through both paths and compared numerically.

## 14.7 Simple adjustments vs color management

- **Simple (recommended first scope):** assume Rec.709 SDR everywhere, convert at import and export with the right matrix/range, adjust in a fixed internal space, document the assumption.
- **Complete management:** per-clip input space, working space, display transform from the monitor profile, HDR support. Treat as a separate project.

## 14.8 AI color tools

An "AI adjustment" or "match a reference look" feature typically analyzes statistics of an image (histograms, color distribution) or uses a model to predict adjustment parameters, then writes ordinary parameters or a LUT. CapCut's implementation is **[UNKNOWN]**. Design tip: such features should output normal, editable parameters so the user can refine them and the renderer needs no special case.

## 14.9 Test scenarios

| Scenario | Expected |
|---|---|
| Rec.601 vs 709 tagged clips | Colors match reference after conversion |
| Limited vs full range input | No washed-out or crushed result |
| Strong exposure on 8-bit gradient | Minimal banding with dither/high precision |
| 3D LUT with wrong input space | User warned or selectable input |
| HDR clip in SDR project | Detected; tone-mapped; warning |
| Preview vs export on a test chart | Numeric difference within tolerance |
| Hue shift at extremes | No NaN/overflow, valid output |

## What a Future Coding Agent Must Understand

- Each basic color control maps to a defined operation, applied in a defined order.
- Color space, transfer function, matrix, and range are four separate things that all must be correct at import and export.
- Choose internal precision and working space deliberately; start with Rec.709 SDR and state it.
- LUTs depend on their input space; handle missing LUTs gracefully.
- AI color features should produce ordinary parameters.
- **Verified:** only FFmpeg's color conversion library role. CapCut color controls unverified; standards citations pending.
- **Related:** Chapters 6, 9, 11, 15, 20.
