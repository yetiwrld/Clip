import type { Clip, ClipTimeline } from '../types'
import { keptSegments, type TimeSegment } from './segments'
import { timelineTrackName } from '../editor/timeline-editing'

/**
 * The main video as *timeline pieces*.
 *
 * A clip stores its own window in source time (`startTime`/`endTime`) plus the
 * source ranges it hides (`silenceCuts`). Those two fields already drive the
 * preview and the render. This module turns the same data into the pieces the
 * first video track draws, so the main video is a row of removable parts on the
 * timeline instead of one immutable bar — without introducing a second model:
 * a piece is derived, and removing one writes a cut back into `silenceCuts`.
 *
 * Pieces are laid out back to back: the main track never keeps a gap, which is
 * what "main track magnet" means in a desktop editor. Total duration therefore
 * equals the kept duration, and both the remover below and `keptSegments`
 * agree on the arithmetic.
 */

export interface MainTrackPiece {
  /** Stable across renders while the range is unchanged. */
  id: string
  /** Source-time range this piece plays. */
  sourceStart: number
  sourceEnd: number
  /** Where it starts on the (output) timeline. */
  startTime: number
  duration: number
}

export function mainTrackPieces(
  clip: Pick<Clip, 'startTime' | 'endTime' | 'silenceCuts'>
): MainTrackPiece[] {
  const kept = keptSegments(clip.startTime, clip.endTime, clip.silenceCuts ?? [])
  let cursor = 0
  return kept.map((segment) => {
    const duration = Math.max(0, segment.end - segment.start)
    const piece: MainTrackPiece = {
      id: `main-${segment.start.toFixed(3)}-${segment.end.toFixed(3)}`,
      sourceStart: segment.start,
      sourceEnd: segment.end,
      startTime: cursor,
      duration
    }
    cursor += duration
    return piece
  })
}

export function mainTrackDuration(pieces: MainTrackPiece[]): number {
  const last = pieces[pieces.length - 1]
  return last ? last.startTime + last.duration : 0
}

/** The piece that contains an output-timeline time, if any. */
export function mainPieceAt(pieces: MainTrackPiece[], time: number): MainTrackPiece | null {
  for (const piece of pieces) {
    if (time >= piece.startTime && time < piece.startTime + piece.duration) return piece
  }
  return null
}

/**
 * Remove one source range from the main video.
 *
 * The result is a new `silenceCuts` array: the removed range joins the other
 * removed ranges, touching ones are merged, and ranges the user deliberately
 * kept (`status: 'kept'`) are left alone. Nothing else in the clip changes, so
 * every consumer of `keptSegments` — preview seeking, render segmentation,
 * caption remapping — sees the removal with no extra wiring.
 */
export function addRemovedRange(
  cuts: TimeSegment[],
  start: number,
  end: number
): TimeSegment[] {
  if (!(end - start > 0.02)) return cuts
  const kept = cuts.filter((cut) => cut.status === 'kept')
  const removed = cuts
    .filter((cut) => cut.status !== 'kept')
    .map((cut) => ({ ...cut }))
    .sort((a, b) => a.start - b.start)

  const merged: TimeSegment[] = []
  for (const cut of [...removed, { start, end }].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1]
    if (last && cut.start <= last.end + 0.01) {
      // Two removed ranges become one, so the detected-pause metadata of the
      // original detection no longer describes the merged range.
      if (last.end !== cut.end || last.start !== cut.start) {
        delete last.detectedStart
        delete last.detectedEnd
      }
      last.start = Math.min(last.start, cut.start)
      last.end = Math.max(last.end, cut.end)
    } else {
      merged.push({ ...cut, status: 'removed' })
    }
  }

  return [...kept, ...merged]
}

/**
 * Keep the first video track free for the main video.
 *
 * Projects saved before the main video had a track may already hold overlay
 * clips there. Those clips are moved one row up (the next video track, created
 * if there is none) instead of being deleted: the row they land on is drawn in
 * front of the main video, which is where an overlay belongs.
 */
export function liftItemsOffMainTrack(
  timeline: ClipTimeline,
  newTrackId: () => string
): { timeline: ClipTimeline; moved: number } {
  const ordered = [...timeline.tracks].sort((a, b) => a.order - b.order)
  const main = ordered.find((track) => track.type === 'video')
  if (!main) return { timeline, moved: 0 }
  const onMain = timeline.items.filter((item) => item.trackId === main.id)
  if (onMain.length === 0) return { timeline, moved: 0 }

  const above = ordered.find((track) => track.order > main.order && track.type === 'video')
  const tracks = above
    ? timeline.tracks
    : [
        ...timeline.tracks.map((track) => (track.order > main.order ? { ...track, order: track.order + 1 } : track)),
        {
          id: newTrackId(),
          name: timelineTrackName(timeline.tracks, 'video'),
          type: 'video' as const,
          order: main.order + 1,
          muted: false,
          hidden: false,
          locked: false
        }
      ]
  const target = above ?? tracks.find((track) => track.order === main.order + 1)!
  return {
    timeline: {
      ...timeline,
      tracks,
      items: timeline.items.map((item) => (item.trackId === main.id ? { ...item, trackId: target.id } : item))
    },
    moved: onMain.length
  }
}
