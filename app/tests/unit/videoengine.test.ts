import { describe, it, expect } from 'vitest'
import { resolutionFor, estimateRenderSizeMb, getQualityPreset, QUALITY_PRESETS, RESOLUTION_PRESETS } from '@shared/constants'
import { keptSegments, keptDuration, remapTime, remapCuesToKept, segmentDraws, normalizeCuts } from '@shared/video/segments'
import {
  sentenceSpans,
  snapToSentenceBoundaries,
  expandWithLeadIn,
  boundaryQuality,
  deadAirRatio
} from '@shared/analysis/boundaries'
import { buildCues, type CaptionCue } from '@shared/captions/segmentation'
import { hwBitrate, effectiveFps } from '@main/services/rendering/plan'
import { applyTrackingToCrop, buildCameraCropFilter, buildTrackedCropFilter, cameraStateAt, computeCameraCrop, trackingPositionAt } from '@shared/video/crop'
import type { Clip, Project, TranscriptSegment } from '@shared/types'

/**
 * Video-engine overhaul: pure-math coverage for resolution/quality presets,
 * silence-removal time remapping, sentence-boundary optimization, and cue
 * editing. Integration coverage (real FFmpeg renders) lives in
 * tests/integration/videoengine.test.ts.
 */

// --------------------------------------------------------- resolution -----

describe('resolution presets (§49-50)', () => {
  it('derives exact even dimensions for every ratio × tier', () => {
    expect(resolutionFor('9:16', '1080p')).toEqual({ w: 1080, h: 1920 })
    expect(resolutionFor('9:16', '720p')).toEqual({ w: 720, h: 1280 })
    expect(resolutionFor('9:16', '1440p')).toEqual({ w: 1440, h: 2560 })
    expect(resolutionFor('9:16', '2160p')).toEqual({ w: 2160, h: 3840 })
    expect(resolutionFor('16:9', '1080p')).toEqual({ w: 1920, h: 1080 })
    expect(resolutionFor('16:9', '2160p')).toEqual({ w: 3840, h: 2160 })
    expect(resolutionFor('1:1', '1440p')).toEqual({ w: 1440, h: 1440 })
    expect(resolutionFor('4:5', '1080p')).toEqual({ w: 1080, h: 1350 })
    expect(resolutionFor('4:3', '1080p')).toEqual({ w: 1440, h: 1080 })
    expect(resolutionFor('21:9', '1080p')).toEqual({ w: 2520, h: 1080 })
    expect(resolutionFor('custom', '1080p', { w: 2.39, h: 1 })).toEqual({ w: 2580, h: 1080 })
    expect(resolutionFor('custom', '1080p', { w: 1080, h: 1920 })).toEqual({ w: 1080, h: 1920 })
  })

  it('always produces even dimensions (yuv420p safe)', () => {
    for (const ratio of ['9:16', '1:1', '4:5', '16:9'] as const) {
      for (const tier of RESOLUTION_PRESETS) {
        const { w, h } = resolutionFor(ratio, tier.id)
        expect(w % 2).toBe(0)
        expect(h % 2).toBe(0)
      }
    }
  })

  it('exposes four tiers and four quality presets with sane ordering', () => {
    expect(RESOLUTION_PRESETS.map((r) => r.id)).toEqual(['720p', '1080p', '1440p', '2160p'])
    expect(QUALITY_PRESETS.map((q) => q.id)).toEqual(['draft', 'standard', 'high', 'maximum'])
    // lower CRF = better quality; draft must be worse than maximum
    expect(getQualityPreset('draft').crf).toBeGreaterThan(getQualityPreset('maximum').crf)
  })

  it('size estimate grows with resolution and quality, falls with duration', () => {
    const small = estimateRenderSizeMb('9:16', '720p', 'draft', 30)
    const big = estimateRenderSizeMb('9:16', '2160p', 'maximum', 30)
    expect(big).toBeGreaterThan(small * 3)
    // Keep the estimate in the range observed from real 1080p x264 renders.
    expect(estimateRenderSizeMb('16:9', '1080p', 'standard', 30)).toBeGreaterThanOrEqual(25)
    expect(estimateRenderSizeMb('9:16', '1080p', 'standard', 60)).toBeGreaterThan(
      estimateRenderSizeMb('9:16', '1080p', 'standard', 30)
    )
  })

  it('hw bitrate scales with output area and quality factor', () => {
    expect(hwBitrate(1080, 1920, getQualityPreset('standard'))).toBe('8.0M')
    expect(parseFloat(hwBitrate(720, 1280, getQualityPreset('standard')))).toBeLessThan(8)
    expect(parseFloat(hwBitrate(1080, 1920, getQualityPreset('maximum')))).toBeGreaterThan(
      parseFloat(hwBitrate(1080, 1920, getQualityPreset('standard')))
    )
  })
})

// ------------------------------------------------------------- segments ----

describe('silence-cut math (§60-63)', () => {
  const cuts = [
    { start: 12, end: 15 },
    { start: 30, end: 32.5 }
  ]

  it('keptSegments is the complement of cuts inside the window', () => {
    const kept = keptSegments(10, 40, cuts)
    expect(kept).toEqual([
      { start: 10, end: 12 },
      { start: 15, end: 30 },
      { start: 32.5, end: 40 }
    ])
  })

  it('clamps cuts to the window and drops invalid ones', () => {
    expect(keptSegments(20, 40, [{ start: 0, end: 25 }, { start: 50, end: 60 }])).toEqual([{ start: 25, end: 40 }])
    expect(keptSegments(0, 10, [{ start: 4, end: 4.05 }])).toEqual([{ start: 0, end: 4 }, { start: 4.05, end: 10 }])
    // sub-20ms cuts are noise and vanish entirely
    expect(keptSegments(0, 10, [{ start: 4, end: 4.01 }])).toEqual([{ start: 0, end: 10 }])
  })

  it('kept detected pauses stay in the edit list but are excluded from playback and render cuts', () => {
    const regions = [
      { start: 4.4, end: 5.6, detectedStart: 4, detectedEnd: 6, status: 'removed' as const },
      { start: 8.2, end: 9.8, detectedStart: 8, detectedEnd: 10, status: 'kept' as const }
    ]
    expect(normalizeCuts(regions)).toEqual([{ start: 4.4, end: 5.6 }])
    expect(keptSegments(0, 12, regions)).toEqual([
      { start: 0, end: 4.4 },
      { start: 5.6, end: 12 }
    ])
    const restored = regions.map((region) => ({ ...region, status: 'kept' as const }))
    expect(normalizeCuts(restored)).toEqual([])
    expect(keptSegments(0, 12, restored)).toEqual([{ start: 0, end: 12 }])
  })

  it('normalizeCuts sorts and merges overlaps', () => {
    expect(normalizeCuts([{ start: 20, end: 25 }, { start: 24, end: 30 }, { start: 5, end: 8 }])).toEqual([
      { start: 5, end: 8 },
      { start: 20, end: 30 }
    ])
  })

  it('keptDuration sums the kept ranges', () => {
    expect(keptDuration(keptSegments(10, 40, cuts))).toBeCloseTo(24.5, 5)
  })

  it('remapTime maps source→output time and nulls inside cuts', () => {
    const kept = keptSegments(10, 40, cuts)
    expect(remapTime(10, kept)).toBe(0)
    expect(remapTime(12, kept)).toBe(2) // cut boundary maps onto the adjacent edge
    expect(remapTime(12.5, kept)).toBeNull()
    expect(remapTime(15, kept)).toBe(2)
    expect(remapTime(31, kept)).toBeNull()
    expect(remapTime(40, kept)).toBeCloseTo(24.5, 5)
  })

  it('segmentDraws yields one -ss/-t pair per kept range', () => {
    const draws = segmentDraws(keptSegments(10, 40, cuts))
    expect(draws).toEqual([
      { seek: 10, duration: 2 },
      { seek: 15, duration: 15 },
      { seek: 32.5, duration: 7.5 }
    ])
  })

  it('remapCuesToKept compresses straddling cues and drops removed ones', () => {
    const cue = (key: string, start: number, end: number): CaptionCue => ({
      key,
      startTime: start,
      endTime: end,
      text: 'x',
      lines: ['x'],
      words: [
        { text: 'a', start, end: start + 1 },
        { text: 'b', start: start + 1, end: start + 2 },
        { text: 'c', start: start + 2, end }
      ]
    })
    const kept = keptSegments(10, 40, cuts)
    const straddling = cue('k1', 11, 16) // words at 11-12, 12-13 (cut), 13-14 (cut) → wait: words 11→12, 12→13, 13→14; cut is 12–15
    const inside = cue('k2', 12.5, 14.5)
    const after = cue('k3', 33, 36)
    const out = remapCuesToKept([straddling, inside, after], kept)
    expect(out.map((c) => c.key)).toEqual(['k1', 'k3'])
    // k1: word a (11→12) maps to 1→2; words b/c collapse to the cut boundary
    expect(out[0].words[0].start).toBeCloseTo(1, 5)
    expect(out[0].words[1].start).toBeCloseTo(2, 5)
    // k3 starts after the second cut: 33 → (12-10) + (30-15) + (33-32.5) = 17.5
    expect(out[1].startTime).toBeCloseTo(17.5, 5)
  })
})

describe('virtual camera tracking', () => {
  const keys = [
    { time: 2, x: 0.2, y: 0.4, score: 0.9 },
    { time: 4, x: 0.8, y: 0.6, score: 0.8 }
  ]

  it('interpolates selected target positions and holds the first/last samples', () => {
    expect(trackingPositionAt(keys, 1)).toEqual({ x: 0.2, y: 0.4 })
    expect(trackingPositionAt(keys, 3)).toEqual({ x: 0.5, y: 0.5 })
    expect(trackingPositionAt(keys, 5)).toEqual({ x: 0.8, y: 0.6 })
  })

  it('moves and clamps the fixed virtual camera crop around its tracked target', () => {
    const base = { w: 360, h: 640, x: 630, y: 0 }
    expect(applyTrackingToCrop(base, 1920, 1080, keys, 2).x).toBe(54)
    expect(applyTrackingToCrop(base, 1920, 1080, keys, 4).x).toBe(1206)
    expect(applyTrackingToCrop(base, 1920, 1080, keys, 4).x).toBeLessThanOrEqual(1920 - base.w)
  })

  it('emits a time-dependent FFmpeg crop filter for tracked renders', () => {
    const filter = buildTrackedCropFilter({ w: 360, h: 640, x: 0, y: 0 }, 1920, 1080, keys, 1)
    expect(filter).toContain('crop=360:640:')
    expect(filter).toContain('if(lt(t\\,1.000)')
    expect(filter).toContain('0.800000*iw')
  })
})

describe('manual virtual-camera keyframes', () => {
  const keys = [
    { time: 5, x: 0.2, y: 0.5, scale: 1, rotation: 0, easing: 'ease-in-out' as const },
    { time: 10, x: 0.8, y: 0.5, scale: 1.5, rotation: 12, easing: 'linear' as const },
    { time: 20, x: 0.5, y: 0.5, scale: 1.1, rotation: 0, easing: 'hold' as const }
  ]

  it('eases position, scale and rotation and holds before/after the keyed range', () => {
    expect(cameraStateAt(keys, 2)).toMatchObject({ x: 0.2, scale: 1, rotation: 0 })
    expect(cameraStateAt(keys, 7.5)).toMatchObject({ x: 0.5, scale: 1.25, rotation: 6 })
    expect(cameraStateAt(keys, 20)).toMatchObject({ x: 0.5, scale: 1.1, rotation: 0 })
    expect(cameraStateAt(keys, 25)).toMatchObject({ x: 0.5, scale: 1.1, rotation: 0 })
  })

  it('supports cut, linear, hold and easing variants', () => {
    const pair = [keys[0], { ...keys[1], easing: 'linear' as const }]
    expect(cameraStateAt(pair, 7.5)?.x).toBeCloseTo(0.5)
    const held = [{ ...keys[0], easing: 'hold' as const }, keys[1]]
    expect(cameraStateAt(held, 7.5)?.x).toBeCloseTo(0.2)
    const cut = [{ ...keys[0], easing: 'cut' as const }, keys[1]]
    expect(cameraStateAt(cut, 5.01)?.x).toBeCloseTo(0.8)
  })

  it('positions and resizes the virtual camera within source bounds', () => {
    const crop = computeCameraCrop(1920, 1080, 1080, 1920, { x: 0.9, y: 0.5, scale: 1.5 })
    expect(crop.w).toBe(404)
    expect(crop.x + crop.w).toBeLessThanOrEqual(1920)
    expect(crop.y + crop.h).toBeLessThanOrEqual(1080)
  })

  it('builds per-frame crop, zoom, easing and rotation and anchors cut segments to source time', () => {
    const filter = buildCameraCropFilter(1920, 1080, 1080, 1920, keys, 8)
    expect(filter).toContain('zoompan=')
    expect(filter).toContain('d=1:s=1920x1080:fps=30')
    expect(filter).toContain("crop=606:1076")
    expect(filter).toContain('scale=1080:1920')
    expect(filter).toContain('rotate=')
    expect(filter).toContain('0.800000')
    expect(filter).not.toContain('t-5.000')
  })
})

// ----------------------------------------------------------- boundaries ----

function seg(id: number, startTime: number, endTime: number, text: string, words?: Array<{ word: string; start: number; end: number }>): TranscriptSegment {
  return { id, startTime, endTime, text, speaker: null, confidence: 0.9, words: words ?? null }
}

const SEGMENTS: TranscriptSegment[] = [
  seg(1, 0, 4.0, 'Why does nobody talk about this simple trick?', [
    { word: 'Why', start: 0.1, end: 0.4 },
    { word: 'does', start: 0.45, end: 0.7 },
    { word: 'nobody', start: 0.75, end: 1.2 },
    { word: 'talk', start: 1.25, end: 1.6 },
    { word: 'about', start: 1.65, end: 2.0 },
    { word: 'this', start: 2.05, end: 2.3 },
    { word: 'simple', start: 2.35, end: 2.8 },
    { word: 'trick?', start: 2.85, end: 3.3 }
  ]),
  seg(2, 3.5, 9.0, 'Because it sounds too easy. Most people overcomplicate everything they build and never ship.', [
    { word: 'Because', start: 3.5, end: 3.9 },
    { word: 'it', start: 3.95, end: 4.1 },
    { word: 'sounds', start: 4.15, end: 4.5 },
    { word: 'too', start: 4.55, end: 4.75 },
    { word: 'easy.', start: 4.8, end: 5.2 },
    { word: 'Most', start: 5.6, end: 5.9 },
    { word: 'people', start: 5.95, end: 6.3 },
    { word: 'overcomplicate', start: 6.35, end: 7.1 },
    { word: 'everything', start: 7.15, end: 7.6 },
    { word: 'they', start: 7.65, end: 7.85 },
    { word: 'build', start: 7.9, end: 8.2 },
    { word: 'and', start: 8.25, end: 8.4 },
    { word: 'never', start: 8.45, end: 8.7 },
    { word: 'ship.', start: 8.75, end: 9.0 }
  ])
]

describe('sentence-boundary analysis (§31-36)', () => {
  const spans = sentenceSpans(SEGMENTS)

  it('builds sentence spans at punctuation with word timing', () => {
    expect(spans.length).toBe(3)
    expect(spans[0].text).toContain('trick?')
    expect(spans[0].start).toBeCloseTo(0.1, 3)
    expect(spans[0].end).toBeCloseTo(3.3, 3)
    expect(spans[1].text).toBe('Because it sounds too easy.')
    expect(spans[1].endsCleanly).toBe(true)
    expect(spans[2].endsCleanly).toBe(true)
  })

  it('snaps a mid-sentence start back to the sentence start', () => {
    const r = snapToSentenceBoundaries({ startTime: 6.5, endTime: 9.5 }, spans, { minLengthSec: 1, maxLengthSec: 60 })
    // 6.5 is inside "Most people overcomplicate…" → extend to 5.6
    expect(r.startTime).toBeCloseTo(5.6, 3)
    expect(r.adjusted).toBe(true)
    expect(r.startReason).toContain('full opening sentence')
  })

  it('snaps a mid-sentence end forward to the sentence end', () => {
    const r = snapToSentenceBoundaries({ startTime: 3.5, endTime: 7.0 }, spans, { minLengthSec: 1, maxLengthSec: 60 })
    expect(r.endTime).toBeCloseTo(9.0, 3)
    expect(r.endReason).toContain('finish the sentence')
  })

  it('trims trailing dead air', () => {
    const r = snapToSentenceBoundaries({ startTime: 0, endTime: 12 }, spans, { minLengthSec: 1, maxLengthSec: 60 })
    expect(r.endTime).toBeCloseTo(9.0, 3)
    expect(r.endReason).toContain('dead air')
  })

  it('respects the minimum length when snapping would make it too short', () => {
    const r = snapToSentenceBoundaries({ startTime: 6.5, endTime: 9.5 }, spans, { minLengthSec: 5, maxLengthSec: 60 })
    // including the full sentence (5.6→9.5) is only 3.9s < 5s → keep raw
    expect(r.startTime).toBeCloseTo(6.5, 3)
    expect(r.startReason).toContain('kept raw')
  })

  it('lead-in expansion pulls in a question that sets up the answer', () => {
    // clip starts at "Because it sounds too easy." — previous span is the question
    const r = expandWithLeadIn({ startTime: 3.5, endTime: 9 }, spans, { maxLeadSec: 3.5, maxLengthSec: 60 })
    expect(r.applied).toBe(true)
    expect(r.startTime).toBeCloseTo(0.1, 3)
    expect(r.reason).toContain('question')
  })

  it('lead-in skips a self-contained opener', () => {
    const r = expandWithLeadIn({ startTime: 5.6, endTime: 9 }, spans, { maxLeadSec: 3.5, maxLengthSec: 60 })
    expect(r.applied).toBe(false)
  })

  it('boundaryQuality rates clean edges higher than mid-sentence cuts', () => {
    const clean = boundaryQuality({ startTime: 0.1, endTime: 3.3 }, spans)
    const ragged = boundaryQuality({ startTime: 2.0, endTime: 6.5 }, spans)
    expect(clean.score).toBeGreaterThan(ragged.score)
    expect(clean.startReason).toContain('sentence start')
    expect(ragged.startReason).toContain('mid-sentence')
  })

  it('deadAirRatio measures speechless time inside the window', () => {
    const full = deadAirRatio({ startTime: 0.1, endTime: 3.3 }, SEGMENTS)
    const silent = deadAirRatio({ startTime: 9.2, endTime: 11.5 }, SEGMENTS)
    expect(full).toBeLessThan(0.05)
    expect(silent).toBeGreaterThan(0.9)
  })
})

// ------------------------------------------------------------- cue edits ----

describe('cue editing: split / merge / timing (§28)', () => {
  const opts = { maxWordsPerCue: 8, maxCharsPerLine: 40, maxLines: 2, fromTime: 0, toTime: 10 }

  it('splits a cue after N words with stable derived keys', () => {
    const cues = buildCues(SEGMENTS, opts)
    const target = cues[0]
    expect(target.words.length).toBeGreaterThanOrEqual(4)
    const split = buildCues(SEGMENTS, { ...opts, splits: { [target.key]: 2 } })
    const parts = split.filter((c) => c.key.startsWith(`${target.key}/`))
    expect(parts.length).toBe(2)
    expect(parts[0].words.length).toBe(2)
    expect(parts[1].words[0].text).toBe(target.words[2].text)
    // parts touch (word-timing gaps of a few ms are preserved)
    expect(parts[0].endTime).toBeLessThanOrEqual(parts[1].startTime + 0.001)
  })

  it('merges a cue with the following cue', () => {
    const cues = buildCues(SEGMENTS, opts)
    const merged = buildCues(SEGMENTS, { ...opts, merges: { [cues[0].key]: true } })
    expect(merged.length).toBe(cues.length - 1)
    expect(merged[0].text).toContain(cues[0].text.split(' ')[cues[0].text.split(' ').length - 1])
    expect(merged[0].endTime).toBeGreaterThanOrEqual(cues[1].endTime - 0.01)
  })

  it('shifts cue timing with neighbour clamping', () => {
    const cues = buildCues(SEGMENTS, opts)
    const shifted = buildCues(SEGMENTS, { ...opts, timingOffsets: { [cues[1].key]: 0.5 } })
    const target = shifted.find((c) => c.key === cues[1].key)!
    expect(target.startTime).toBeCloseTo(cues[1].startTime + 0.5, 3)
    // never overlaps the next cue
    const next = shifted[shifted.indexOf(target) + 1]
    if (next) expect(target.endTime).toBeLessThanOrEqual(next.startTime + 0.001)
  })

  it('resizes a caption entry and exit independently and retimes karaoke words', () => {
    const cues = buildCues(SEGMENTS, opts)
    const target = cues[cues.length - 1]
    const resized = buildCues(SEGMENTS, {
      ...opts,
      timingOffsets: {
        [`${target.key}/start`]: 0.12,
        [`${target.key}/end`]: 0.18
      }
    }).find((cue) => cue.key === target.key)!
    expect(resized.startTime).toBeCloseTo(target.startTime + 0.12, 3)
    expect(resized.endTime).toBeCloseTo(target.endTime + 0.18, 3)
    expect(resized.words[0].start).toBeGreaterThanOrEqual(resized.startTime)
    expect(resized.words.at(-1)?.end).toBeLessThanOrEqual(resized.endTime)
    expect(resized.endTime - resized.startTime).toBeGreaterThanOrEqual(0.15)
  })
})

// ----------------------------------------------------------------- fps -----

describe('effective fps + VFR safety (§57-58)', () => {
  const baseProject = { fps: 29.97, duration: 60 } as unknown as Project

  it('follows the source fps when set to source', () => {
    const clip = { outputFps: 'source' } as Pick<Clip, 'outputFps'>
    expect(effectiveFps(clip as Clip, baseProject)).toBeCloseTo(29.97, 2)
  })

  it('uses the fixed fps when configured', () => {
    const clip = { outputFps: 30 } as unknown as Clip
    expect(effectiveFps(clip, baseProject)).toBe(30)
  })

  it('falls back to 30 for unknown/invalid source fps', () => {
    const clip = { outputFps: 'source' } as Pick<Clip, 'outputFps'>
    expect(effectiveFps(clip as Clip, { fps: null } as unknown as Project)).toBe(30)
    expect(effectiveFps(clip as Clip, { fps: 0 } as unknown as Project)).toBe(30)
    expect(effectiveFps(clip as Clip, { fps: 500 } as unknown as Project)).toBe(30)
  })
})
