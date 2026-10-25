import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '../../src/shared/types'
import {
  mapTimelineRangeToSource,
  sourceTimeAtTimelineTime,
  timelineItemDuration,
  timelineItemEnd,
  timelineOverlayGeometry,
  timelineTimeAtSourceTime
} from '../../src/shared/video/time-map'

const item: TimelineItem = {
  id: 'item-1', assetId: 'asset-1', trackId: 'track-1',
  startTime: 10, sourceIn: 2, sourceOut: 8,
  volume: 1, muted: false, fadeIn: 0, fadeOut: 0,
  speed: 1.5, loop: false, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1
}

describe('canonical timeline/source time mapping', () => {
  it('derives duration and end in project time from source range and speed', () => {
    expect(timelineItemDuration(item)).toBe(4)
    expect(timelineItemEnd(item)).toBe(14)
  })

  it('maps timestamps in both directions without changing persisted seconds', () => {
    expect(sourceTimeAtTimelineTime(item, 11.25)).toBeCloseTo(3.875)
    expect(timelineTimeAtSourceTime(item, 3.875)).toBeCloseTo(11.25)
    expect(sourceTimeAtTimelineTime(item, 14)).toBeNull()
    expect(timelineTimeAtSourceTime(item, 9)).toBeNull()
  })

  it('maps an overlapping timeline range onto the matching source range', () => {
    expect(mapTimelineRangeToSource(item, 12, 13)).toEqual({
      timelineStart: 12,
      timelineEnd: 13,
      sourceStart: 5,
      sourceEnd: 6.5,
      speed: 1.5
    })
    expect(mapTimelineRangeToSource(item, 2, 9)).toBeNull()
  })

  it('loops source time only when the timeline instance is marked to loop', () => {
    const looping = { ...item, loop: true }
    expect(sourceTimeAtTimelineTime(looping, 15)).toBeCloseTo(3.5)
    expect(sourceTimeAtTimelineTime(item, 15)).toBeNull()
  })

  it('shares centered preview/export placement and clamps size/opacity consistently', () => {
    expect(timelineOverlayGeometry({ x: 0.5, y: -0.5, scale: 0.05, opacity: 1.2 })).toEqual({
      scale: 0.1,
      centerX: 0.75,
      centerY: 0.25,
      opacity: 1
    })
    expect(timelineOverlayGeometry({ x: -0.2, y: 0.4, scale: 8, opacity: -1 })).toEqual({
      scale: 4,
      centerX: 0.4,
      centerY: 0.7,
      opacity: 0
    })
  })
})
