import { describe, expect, it } from 'vitest'
import {
  addRemovedRange,
  liftItemsOffMainTrack,
  mainPieceAt,
  mainTrackDuration,
  mainTrackPieces
} from '../../src/shared/video/main-track'
import type { ClipTimeline, TimelineItem } from '../../src/shared/types'

/**
 * The main video as timeline pieces.
 *
 * The point of these tests is that the row is *derived*: a piece is the kept
 * range the preview and the render already use, and deleting a piece writes a
 * cut back into the same `silenceCuts` field they read. If this file and
 * `segments.ts` ever disagree, moving the main video left or right in the
 * editor would no longer match what the file produces.
 */

const clip = (over: Partial<{ startTime: number; endTime: number; silenceCuts: Array<{ start: number; end: number; status?: 'removed' | 'kept'; detectedStart?: number }> }> = {}) => ({
  startTime: 0,
  endTime: 10,
  silenceCuts: [],
  ...over
})

describe('mainTrackPieces', () => {
  it('is one piece for an untouched clip, starting at zero', () => {
    const pieces = mainTrackPieces(clip())
    expect(pieces).toHaveLength(1)
    expect(pieces[0].sourceStart).toBe(0)
    expect(pieces[0].sourceEnd).toBe(10)
    expect(pieces[0].startTime).toBe(0)
    expect(pieces[0].duration).toBe(10)
  })

  it('splits at every removed range and closes the gaps between the pieces', () => {
    const pieces = mainTrackPieces(clip({ silenceCuts: [{ start: 3, end: 4 }] }))
    expect(pieces.map((piece) => [piece.sourceStart, piece.sourceEnd])).toEqual([[0, 3], [4, 10]])
    // Magnet: the second piece starts where the first ends, not at source 4.
    expect(pieces.map((piece) => [piece.startTime, piece.duration])).toEqual([[0, 3], [3, 6]])
    expect(mainTrackDuration(pieces)).toBe(9)
  })

  it('ignores ranges the user chose to keep', () => {
    const pieces = mainTrackPieces(clip({ silenceCuts: [{ start: 3, end: 4, status: 'kept' }] }))
    expect(pieces).toHaveLength(1)
    expect(pieces[0].duration).toBe(10)
  })

  it('keeps piece ids stable while the range is unchanged', () => {
    const first = mainTrackPieces(clip({ silenceCuts: [{ start: 2, end: 3 }] })).map((piece) => piece.id)
    const second = mainTrackPieces(clip({ silenceCuts: [{ start: 2, end: 3 }] })).map((piece) => piece.id)
    expect(second).toEqual(first)
    expect(new Set(first).size).toBe(first.length)
  })

  it('finds the piece under a timeline time', () => {
    const pieces = mainTrackPieces(clip({ silenceCuts: [{ start: 3, end: 4 }] }))
    expect(mainPieceAt(pieces, 1)?.sourceStart).toBe(0)
    expect(mainPieceAt(pieces, 4)?.sourceStart).toBe(4)
    expect(mainPieceAt(pieces, 30)).toBeNull()
  })
})

describe('addRemovedRange', () => {
  it('turns a piece into a removed cut without touching kept ranges', () => {
    const pieces = mainTrackPieces(clip({ silenceCuts: [{ start: 1, end: 2, status: 'kept' }] }))
    const next = addRemovedRange(clip().silenceCuts, pieces[0].sourceStart, pieces[0].sourceEnd)
    expect(next).toEqual([{ start: 0, end: 10, status: 'removed' }])
  })

  it('merges a removal that touches an existing one', () => {
    const next = addRemovedRange([{ start: 4, end: 6 }], 2, 4)
    expect(next).toEqual([{ start: 2, end: 6, status: 'removed' }])
  })

  it('keeps separate removals separate and sorted', () => {
    const next = addRemovedRange([{ start: 6, end: 7 }], 2, 3)
    expect(next.map((cut) => [cut.start, cut.end])).toEqual([[2, 3], [6, 7]])
  })

  it('drops the detected-pause metadata once two ranges are merged', () => {
    const next = addRemovedRange([{ start: 4, end: 6, detectedStart: 3.9, detectedEnd: 6.1 }], 2, 4)
    expect(next).toHaveLength(1)
    expect(next[0].detectedStart).toBeUndefined()
    expect(next[0].detectedEnd).toBeUndefined()
  })

  it('ignores an empty range', () => {
    const cuts = [{ start: 4, end: 6 }]
    expect(addRemovedRange(cuts, 5, 5)).toBe(cuts)
  })

  it('making a piece disappear leaves the remaining pieces gapless', () => {
    const first = mainTrackPieces(clip())
    const cuts = addRemovedRange([], 2, 5)
    const pieces = mainTrackPieces(clip({ silenceCuts: cuts }))
    expect(mainTrackDuration(pieces)).toBe(7)
    expect(mainTrackDuration(pieces)).toBeLessThan(mainTrackDuration(first))
    expect(mainPieceAt(pieces, 2)?.sourceStart).toBe(5)
  })
})

function item(over: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'seed-1', assetId: 'asset-1', trackId: 'video-1', startTime: 1, sourceIn: 0, sourceOut: 2,
    volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false,
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...over
  }
}

const base: ClipTimeline = {
  tracks: [
    { id: 'video-1', name: 'Video 1', type: 'video', order: 0, muted: false, hidden: false, locked: false },
    { id: 'audio-1', name: 'Audio 1', type: 'audio', order: 1, muted: false, hidden: false, locked: false }
  ],
  items: [],
  snapEnabled: true
}

describe('liftItemsOffMainTrack', () => {
  it('leaves a timeline alone when the main track is empty', () => {
    const result = liftItemsOffMainTrack(base, () => 'new')
    expect(result.moved).toBe(0)
    expect(result.timeline).toBe(base)
  })

  it('moves an overlay off the main track onto the next video track', () => {
    const timeline: ClipTimeline = {
      ...base,
      tracks: [...base.tracks, { id: 'video-2', name: 'Video 2', type: 'video', order: 1, muted: false, hidden: false, locked: false }],
      items: [item()]
    }
    const result = liftItemsOffMainTrack(timeline, () => 'new')
    expect(result.moved).toBe(1)
    expect(result.timeline.items[0].trackId).toBe('video-2')
    expect(result.timeline.tracks).toHaveLength(3)
  })

  it('creates a video track above the main one when there is nowhere to move to', () => {
    const timeline: ClipTimeline = { ...base, items: [item()] }
    const result = liftItemsOffMainTrack(timeline, () => 'video-new')
    expect(result.moved).toBe(1)
    const created = result.timeline.tracks.find((track) => track.id === 'video-new')
    expect(created?.type).toBe('video')
    expect(result.timeline.items[0].trackId).toBe('video-new')
    // Existing rows below the main track keep their relative order.
    expect(result.timeline.tracks.find((track) => track.id === 'audio-1')?.order).toBeGreaterThan(created!.order)
  })

  it('never moves an item onto a hidden or missing row', () => {
    const timeline: ClipTimeline = {
      ...base,
      tracks: [...base.tracks, { id: 'video-2', name: 'Video 2', type: 'video', order: 1, muted: false, hidden: false, locked: false }],
      items: [item()]
    }
    const result = liftItemsOffMainTrack(timeline, () => 'new')
    const target = result.timeline.tracks.find((track) => track.id === result.timeline.items[0].trackId)
    expect(target?.id).toBe('video-2')
    expect(result.timeline.tracks.some((track) => track.id === 'new')).toBe(false)
  })
})
