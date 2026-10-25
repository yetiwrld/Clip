import { describe, expect, it } from 'vitest'
import { frameDuration, frameTime, frameTimeTolerance, rationalFrameRate } from '../../src/shared/video/frame-rate'

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
})
