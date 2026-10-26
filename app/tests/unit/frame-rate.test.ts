import { describe, expect, it } from 'vitest'
import { frameDuration, frameTime, frameTimeTolerance, framesBetween, rationalFrameRate, snapTimeToFrame } from '../../src/shared/video/frame-rate'

describe('legacy numeric frame-rate adapter', () => {
  it('recognizes common NTSC rates as exact rational rates', () => {
    expect(rationalFrameRate(29.97)).toEqual({ numerator: 30000, denominator: 1001 })
    expect(frameDuration(23.976)).toBeCloseTo(1001 / 24000, 12)
    expect(frameTime(30, 29.97)).toBeCloseTo(1.001, 12)
  })

  it('keeps integer and unusual numeric rates usable and defaults invalid values', () => {
    expect(rationalFrameRate(60)).toEqual({ numerator: 60, denominator: 1 })
    expect(frameDuration(47.5)).toBeCloseTo(1 / 47.5, 12)
    expect(frameDuration(null)).toBe(1 / 25)
    expect(frameDuration(0)).toBe(1 / 25)
  })

  it('uses a frame-relative keyframe matching tolerance', () => {
    expect(frameTimeTolerance(60)).toBeLessThan(frameTimeTolerance(24))
    expect(frameTimeTolerance(30)).toBeCloseTo((1 / 30) / 2 + 1e-6, 12)
  })

  it('rounds edit times onto the project frame grid', () => {
    // 25 fps: 40 ms frames. Pointer maths and pastes must land on a frame.
    expect(snapTimeToFrame(1.037, 25)).toBeCloseTo(1.04)
    expect(snapTimeToFrame(0.02, 25)).toBeCloseTo(0.04)
    expect(snapTimeToFrame(-1, 25)).toBe(0)
    expect(snapTimeToFrame(Number.NaN, 25)).toBe(0)
    // 23.976 fps keeps its own frame length instead of a 25 fps grid.
    const ntsc = frameDuration(24000 / 1001)
    expect(snapTimeToFrame(1.001, 24000 / 1001)).toBeCloseTo(ntsc * 24, 6)
    expect(framesBetween(0, snapTimeToFrame(1.0, 25), 25)).toBe(25)
    expect(framesBetween(snapTimeToFrame(2, 25), snapTimeToFrame(1, 25), 25)).toBe(-25)
  })
})
