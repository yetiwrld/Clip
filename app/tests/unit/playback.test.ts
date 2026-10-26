import { describe, expect, it } from 'vitest'
import { playFromTime } from '../../src/shared/video/playback'

describe('playFromTime', () => {
  it('keeps a playhead that sits outside the clip range exactly where it is', () => {
    // The reported bug: tapping a clip at 12 s and pressing play jumped back
    // to the clip's in-point because 12 s was outside [2, 5].
    expect(playFromTime(12, 60, 2)).toBe(12)
    expect(playFromTime(1, 60, 2)).toBe(1)
  })

  it('restarts from the clip start when the playhead is at the end', () => {
    expect(playFromTime(60, 60, 2)).toBe(2)
    expect(playFromTime(59.99, 60, 2)).toBe(2)
  })

  it('clamps the restart point to the media and never returns a negative time', () => {
    expect(playFromTime(10, 5, 9)).toBe(5)
    expect(playFromTime(-3, 30, 0)).toBe(0)
    expect(playFromTime(Number.NaN, 30, 4)).toBe(0)
  })

  it('does not guess when the media duration is not known yet', () => {
    expect(playFromTime(7, 0, 2)).toBe(7)
    expect(playFromTime(7, Number.NaN, 2)).toBe(7)
  })
})
