import { describe, expect, it } from 'vitest'
import type { ClipTimeline, TimelineItem } from '../../src/shared/types'
import {
  clampTimelineHeight,
  deleteTimelineItem,
  duplicateTimelineItem,
  fitTimelineZoom,
  initialTimelineHeight,
  splitTimelineItemAt,
  timelineZoomFromSlider,
  timelineZoomSliderValue
} from '../../src/shared/editor/timeline-editing'

const item: TimelineItem = {
  id: 'clip-a', assetId: 'asset-a', trackId: 'video-1', startTime: 4, sourceIn: 3, sourceOut: 13,
  volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 2, loop: false,
  x: 0, y: 0, scale: 1, rotation: 0, opacity: 1
}
const base: ClipTimeline = {
  tracks: [{ id: 'video-1', name: 'Video 1', type: 'video', order: 0, muted: false, hidden: false, locked: false }],
  items: [item], snapEnabled: true
}

describe('timeline editing actions and zoom', () => {
  it('splits at timeline time while mapping the playhead through clip speed', () => {
    const result = splitTimelineItemAt(base, item.id, 6.5, 'clip-b')
    expect(result?.selectedId).toBe('clip-b')
    expect(result?.timeline.items).toHaveLength(2)
    expect(result?.timeline.items[0].sourceOut).toBe(8)
    expect(result?.timeline.items[1]).toMatchObject({ id: 'clip-b', startTime: 6.5, sourceIn: 8, sourceOut: 13, speed: 2 })
    expect(item.sourceOut).toBe(13)
  })

  it('refuses splits outside the clip, too close to an edge, or on a locked track', () => {
    expect(splitTimelineItemAt(base, item.id, 3, 'outside')).toBeNull()
    expect(splitTimelineItemAt(base, item.id, 4.02, 'edge')).toBeNull()
    const locked = { ...base, tracks: base.tracks.map((track) => ({ ...track, locked: true })) }
    expect(splitTimelineItemAt(locked, item.id, 6, 'locked')).toBeNull()
  })

  it('duplicates after the selected item and preserves its edit settings', () => {
    const result = duplicateTimelineItem(base, item.id, 'clip-copy')
    expect(result?.selectedId).toBe('clip-copy')
    expect(result?.timeline.items[1]).toMatchObject({ ...item, id: 'clip-copy', startTime: 9 })
    expect(duplicateTimelineItem(base, item.id, item.id)).toBeNull()
  })

  it('deletes only unlocked timeline instances and leaves source assets untouched', () => {
    const result = deleteTimelineItem(base, item.id)
    expect(result?.selectedId).toBeNull()
    expect(result?.timeline.items).toEqual([])
    expect(result?.timeline.tracks).toEqual(base.tracks)
    const locked = { ...base, tracks: base.tracks.map((track) => ({ ...track, locked: true })) }
    expect(deleteTimelineItem(locked, item.id)).toBeNull()
  })

  it('chooses a responsive timeline height and clamps saved or dragged sizes to the viewport', () => {
    expect(initialTimelineHeight(1000)).toBe(300)
    expect(initialTimelineHeight(700)).toBe(266)
    expect(initialTimelineHeight(500)).toBe(220)
    expect(initialTimelineHeight(900, 800)).toBe(612)
    expect(initialTimelineHeight(900, 420)).toBe(420)
    expect(clampTimelineHeight(900, 900)).toBe(612)
    expect(clampTimelineHeight(Number.NaN, 900)).toBe(220)
  })

  it('uses a stable logarithmic zoom slider and computes a true fit scale', () => {
    expect(timelineZoomFromSlider(0)).toBeCloseTo(0.25)
    expect(timelineZoomFromSlider(100)).toBeCloseTo(240)
    for (const zoom of [0.25, 1, 12, 40, 240]) {
      expect(timelineZoomSliderValue(timelineZoomFromSlider(timelineZoomSliderValue(zoom)))).toBeCloseTo(timelineZoomSliderValue(zoom))
    }
    expect(fitTimelineZoom(1200, 160, 60)).toBeCloseTo((1200 - 160 - 24) / 60)
    expect(fitTimelineZoom(320, 160, 3600)).toBeGreaterThanOrEqual(0.25)
  })
})
