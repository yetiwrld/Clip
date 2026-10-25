import type { ClipTimeline, TimelineItem } from '../types'
import { sourceDeltaForTimelineDelta, timelineItemDuration, timelineItemEnd } from '../video/time-map'

export interface TimelineItemEditResult {
  timeline: ClipTimeline
  selectedId: string | null
}

function editableItem(timeline: ClipTimeline, itemId: string): TimelineItem | null {
  const item = timeline.items.find((candidate) => candidate.id === itemId)
  if (!item) return null
  const track = timeline.tracks.find((candidate) => candidate.id === item.trackId)
  return track && !track.locked ? item : null
}

/** Split a clip at a timeline-time playhead, preserving source-time and speed. */
export function splitTimelineItemAt(
  timeline: ClipTimeline,
  itemId: string,
  time: number,
  rightItemId: string
): TimelineItemEditResult | null {
  const item = editableItem(timeline, itemId)
  if (!item || !Number.isFinite(time) || !rightItemId || timeline.items.some((candidate) => candidate.id === rightItemId)) return null
  const duration = timelineItemDuration(item)
  const offset = time - item.startTime
  if (offset <= 0.05 || offset >= duration - 0.05) return null

  const sourceCut = item.sourceIn + sourceDeltaForTimelineDelta(offset, item.speed)
  if (sourceCut <= item.sourceIn + 0.05 || sourceCut >= item.sourceOut - 0.05) return null

  const right: TimelineItem = { ...item, id: rightItemId, startTime: time, sourceIn: sourceCut }
  return {
    timeline: {
      ...timeline,
      items: timeline.items.map((candidate) => candidate.id === itemId ? { ...candidate, sourceOut: sourceCut } : candidate).concat(right)
    },
    selectedId: rightItemId
  }
}

/** Duplicate a clip directly after its current timeline interval. */
export function duplicateTimelineItem(
  timeline: ClipTimeline,
  itemId: string,
  duplicateId: string
): TimelineItemEditResult | null {
  const item = editableItem(timeline, itemId)
  if (!item || !duplicateId || timeline.items.some((candidate) => candidate.id === duplicateId)) return null
  const duplicate = { ...item, id: duplicateId, startTime: timelineItemEnd(item) }
  return {
    timeline: { ...timeline, items: [...timeline.items, duplicate] },
    selectedId: duplicateId
  }
}

/** Remove an unlocked clip from the timeline without changing its asset. */
export function deleteTimelineItem(timeline: ClipTimeline, itemId: string): TimelineItemEditResult | null {
  if (!editableItem(timeline, itemId)) return null
  return {
    timeline: { ...timeline, items: timeline.items.filter((item) => item.id !== itemId) },
    selectedId: null
  }
}

export const TIMELINE_HEIGHT_MIN = 220

/** Responsive default with saved heights bounded to the current viewport. */
export function initialTimelineHeight(viewportHeight: number, savedHeight?: number): number {
  const safeHeight = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0
  const viewportMax = Math.max(TIMELINE_HEIGHT_MIN, safeHeight * 0.68)
  if (savedHeight !== undefined && Number.isFinite(savedHeight) && savedHeight >= TIMELINE_HEIGHT_MIN) {
    return Math.min(savedHeight, viewportMax)
  }
  return Math.max(TIMELINE_HEIGHT_MIN, Math.min(300, safeHeight * 0.38))
}

export function clampTimelineHeight(height: number, viewportHeight: number): number {
  const safeHeight = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0
  const viewportMax = Math.max(TIMELINE_HEIGHT_MIN, safeHeight * 0.68)
  const safeHeightValue = Number.isFinite(height) ? height : TIMELINE_HEIGHT_MIN
  return Math.max(TIMELINE_HEIGHT_MIN, Math.min(viewportMax, safeHeightValue))
}

export const TIMELINE_ZOOM_MIN = 0.25
export const TIMELINE_ZOOM_MAX = 240

/** Logarithmic zoom keeps both fine and whole-project scales reachable. */
export function timelineZoomFromSlider(value: number): number {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)) / 100
  return TIMELINE_ZOOM_MIN * (TIMELINE_ZOOM_MAX / TIMELINE_ZOOM_MIN) ** normalized
}

export function timelineZoomSliderValue(pixelsPerSecond: number): number {
  const zoom = Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, pixelsPerSecond))
  return 100 * Math.log(zoom / TIMELINE_ZOOM_MIN) / Math.log(TIMELINE_ZOOM_MAX / TIMELINE_ZOOM_MIN)
}

/** Compute a scale that fits the full edit duration beside its fixed track labels. */
export function fitTimelineZoom(viewportWidth: number, labelWidth: number, duration: number): number {
  const usableWidth = Math.max(1, viewportWidth - labelWidth - 24)
  const safeDuration = Math.max(1, Number.isFinite(duration) ? duration : 1)
  return Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, usableWidth / safeDuration))
}
