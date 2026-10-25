import { clamp } from '../utils/time'
import type { TimelineItem } from '../types'

/** Time interval shared by the editor, timeline UI and renderer. */
export interface MappedTimelineRange {
  /** Visible project/timeline interval. */
  timelineStart: number
  timelineEnd: number
  /** Corresponding interval in the referenced media asset. */
  sourceStart: number
  sourceEnd: number
  speed: number
}

/** Keep malformed legacy speed values from producing invalid time mappings. */
export function effectiveItemSpeed(speed: number): number {
  return clamp(Number.isFinite(speed) ? speed : 1, 0.25, 4)
}

/**
 * Shared geometry for a timeline image/video layer. CSS preview and FFmpeg
 * export both anchor the layer by its center, use the same normalized offsets,
 * clamp its size to the renderer's supported range, and clamp opacity. Keeping
 * this in shared code prevents preview/export drift when the inspector edits
 * x, y, scale, or opacity.
 */
export function timelineOverlayGeometry(
  item: Pick<TimelineItem, 'x' | 'y' | 'scale' | 'opacity'>
): { scale: number; centerX: number; centerY: number; opacity: number } {
  const x = Number.isFinite(item.x) ? item.x : 0
  const y = Number.isFinite(item.y) ? item.y : 0
  return {
    scale: clamp(Number.isFinite(item.scale) ? item.scale : 1, 0.1, 4),
    centerX: 0.5 + x / 2,
    centerY: 0.5 + y / 2,
    opacity: clamp(Number.isFinite(item.opacity) ? item.opacity : 1, 0, 1)
  }
}

/** Duration of a constant-speed timeline instance, measured in project time. */
export function timelineItemDuration(item: Pick<TimelineItem, 'sourceIn' | 'sourceOut' | 'speed'>): number {
  const sourceDuration = Math.max(0, item.sourceOut - item.sourceIn)
  return sourceDuration / effectiveItemSpeed(item.speed)
}

export function timelineItemEnd(item: Pick<TimelineItem, 'startTime' | 'sourceIn' | 'sourceOut' | 'speed'>): number {
  return item.startTime + timelineItemDuration(item)
}

export function sourceDeltaForTimelineDelta(timelineDelta: number, speed: number): number {
  return timelineDelta * effectiveItemSpeed(speed)
}

/** Map a timeline/project timestamp onto the referenced media's source time. */
export function sourceTimeAtTimelineTime(
  item: Pick<TimelineItem, 'startTime' | 'sourceIn' | 'sourceOut' | 'speed' | 'loop'>,
  timelineTime: number
): number | null {
  const duration = timelineItemDuration(item)
  if (!Number.isFinite(timelineTime) || duration <= 0 || timelineTime < item.startTime || (!item.loop && timelineTime >= item.startTime + duration)) return null
  const elapsed = timelineTime - item.startTime
  const sourceDuration = item.sourceOut - item.sourceIn
  const offset = item.loop && sourceDuration > 0
    ? (elapsed * effectiveItemSpeed(item.speed)) % sourceDuration
    : elapsed * effectiveItemSpeed(item.speed)
  return item.sourceIn + offset
}

/** Inverse mapping for a source timestamp inside an item's selected range. */
export function timelineTimeAtSourceTime(
  item: Pick<TimelineItem, 'startTime' | 'sourceIn' | 'sourceOut' | 'speed'>,
  sourceTime: number
): number | null {
  if (!Number.isFinite(sourceTime) || sourceTime < item.sourceIn || sourceTime > item.sourceOut) return null
  return item.startTime + (sourceTime - item.sourceIn) / effectiveItemSpeed(item.speed)
}

/** Map an overlapping project-time interval to its corresponding source range. */
export function mapTimelineRangeToSource(
  item: Pick<TimelineItem, 'startTime' | 'sourceIn' | 'sourceOut' | 'speed'>,
  rangeStart: number,
  rangeEnd: number
): MappedTimelineRange | null {
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) return null
  const timelineStart = Math.max(rangeStart, item.startTime)
  const timelineEnd = Math.min(rangeEnd, timelineItemEnd(item))
  if (timelineEnd <= timelineStart) return null
  const speed = effectiveItemSpeed(item.speed)
  return {
    timelineStart,
    timelineEnd,
    sourceStart: item.sourceIn + (timelineStart - item.startTime) * speed,
    sourceEnd: item.sourceIn + (timelineEnd - item.startTime) * speed,
    speed
  }
}
