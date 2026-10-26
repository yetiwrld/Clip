import { afterEach, describe, expect, it } from 'vitest'
import type { ClipTimeline, TimelineItem } from '../../src/shared/types'
import { useTimelineClipboard } from '../../src/renderer/features/editor/timeline-clipboard'
import {
  copyTimelineItems,
  cutTimelineItems,
  deleteTimelineItems,
  duplicateTimelineItems,
  hasTimelineOverlap,
  pasteTimelineItems,
  resolveTimelineOverlaps,
  selectTimelineRange,
  selectableTimelineIds,
  splitTimelineItemsAt
} from '../../src/shared/editor/timeline-editing'

/**
 * Timeline editing operations.
 *
 * Every command in the editor — a shortcut, a menu row, a toolbar button — ends
 * in these functions, so these tests cover what each one does to the real
 * project data: which clips move, which source intervals they keep, which track
 * they land on, and what is left behind.
 */

const tracks: ClipTimeline['tracks'] = [
  { id: 'video-1', name: 'Video 1', type: 'video', order: 0, muted: false, hidden: false, locked: false },
  { id: 'video-2', name: 'Video 2', type: 'video', order: 1, muted: false, hidden: false, locked: false },
  { id: 'audio-1', name: 'Audio 1', type: 'audio', order: 2, muted: false, hidden: false, locked: false }
]

function item(over: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'a', assetId: 'asset-1', trackId: 'video-1', startTime: 0, sourceIn: 0, sourceOut: 4,
    volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false,
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...over
  }
}

const timeline = (items: TimelineItem[], extra: Partial<ClipTimeline> = {}): ClipTimeline => ({
  tracks, items, snapEnabled: true, ...extra
})

function ids() {
  let n = 0
  return () => `new-${++n}`
}

describe('copy', () => {
  it('keeps every edit property, the source asset and relative timing', () => {
    const clip = item({ id: 'a', startTime: 6, sourceIn: 2, sourceOut: 12, speed: 2, volume: 0.7, rotation: 12, opacity: 0.5 })
    const other = item({ id: 'b', assetId: 'asset-2', trackId: 'audio-1', startTime: 9, sourceIn: 0, sourceOut: 5, fadeIn: 0.5 })
    const clipboard = copyTimelineItems(timeline([clip, other]), ['a', 'b'])
    expect(clipboard).not.toBeNull()
    expect(clipboard!.entries).toHaveLength(2)
    const [first, second] = clipboard!.entries
    expect(first.item).toMatchObject({ assetId: 'asset-1', sourceIn: 2, sourceOut: 12, speed: 2, volume: 0.7, rotation: 12, opacity: 0.5 })
    expect(first.offset).toBe(0)
    expect(second.offset).toBe(3)
    expect(second.trackType).toBe('audio')
    // 6..12 at speed 2 is 3 s long; the block runs from 6 to 12 (audio ends at 14).
    expect(clipboard!.span).toBe(8)
  })

  it('does not duplicate media: the copy still points at the same asset', () => {
    const clipboard = copyTimelineItems(timeline([item({ id: 'a' })]), ['a'])
    expect(clipboard!.entries[0].item.assetId).toBe('asset-1')
  })

  it('returns null when nothing usable is selected', () => {
    expect(copyTimelineItems(timeline([item({ id: 'a' })]), ['missing'])).toBeNull()
    expect(copyTimelineItems(timeline([item({ id: 'a' })]), [])).toBeNull()
  })
})

describe('cut', () => {
  it('removes the clips and keeps them on the clipboard', () => {
    const result = cutTimelineItems(timeline([item({ id: 'a' }), item({ id: 'b', startTime: 5 })]), ['a'])
    expect(result).not.toBeNull()
    expect(result!.timeline.items.map((entry) => entry.id)).toEqual(['b'])
    expect(result!.clipboard.entries).toHaveLength(1)
    expect(result!.clipboard.entries[0].item.assetId).toBe('asset-1')
  })

  it('leaves locked clips alone', () => {
    const locked = timeline([item({ id: 'a' })], {
      tracks: tracks.map((track) => (track.id === 'video-1' ? { ...track, locked: true } : track))
    })
    expect(cutTimelineItems(locked, ['a'])).toBeNull()
    expect(copyTimelineItems(locked, ['a'])!.entries).toHaveLength(1)
  })
})

describe('paste', () => {
  const source = timeline([item({ id: 'a', startTime: 2, sourceOut: 3 }), item({ id: 'b', assetId: 'asset-2', startTime: 4, sourceOut: 2 })])

  it('lands at the playhead, keeps relative timing and creates new ids', () => {
    const clipboard = copyTimelineItems(source, ['a', 'b'])
    const result = pasteTimelineItems(source, clipboard, { at: 20, newId: ids() })
    expect(result).not.toBeNull()
    const pasted = result!.timeline.items.filter((entry) => result!.ids.includes(entry.id))
    expect(pasted.map((entry) => entry.startTime)).toEqual([20, 22])
    expect(pasted.every((entry) => entry.id.startsWith('new-'))).toBe(true)
    // The originals are untouched.
    expect(result!.timeline.items.filter((entry) => entry.id === 'a' || entry.id === 'b')).toHaveLength(2)
  })

  it('pastes repeatedly without stacking the copies on each other', () => {
    const clipboard = copyTimelineItems(source, ['a'])
    const first = pasteTimelineItems(source, clipboard, { at: 10, newId: ids() })!
    // Second paste at the same playhead would overlap, so the UI advances it.
    const second = pasteTimelineItems(first.timeline, clipboard, { at: 10 + clipboard!.span, newId: ids() })!
    const starts = second.timeline.items.map((entry) => entry.startTime)
    expect(starts.filter((start) => start === 10)).toHaveLength(1)
    expect(starts.filter((start) => start === 10 + clipboard!.span)).toHaveLength(1)
  })

  it('overwrites the space it takes instead of stacking two clips there', () => {
    const bed = timeline([item({ id: 'bed', startTime: 0, sourceOut: 10 })])
    const clipboard = copyTimelineItems(source, ['a'])
    const result = pasteTimelineItems(bed, clipboard, { at: 5, newId: ids() })!
    // The bed gives up 5..8: it keeps its head, the pasted clip owns the middle,
    // and a new tail piece continues where the bed left off.
    const pieces = result.timeline.items.filter((entry) => entry.assetId === 'asset-1')
    expect(pieces).toHaveLength(3)
    const head = pieces.find((entry) => entry.id === 'bed')!
    expect(head.startTime).toBe(0)
    expect(head.sourceOut).toBeCloseTo(5)
    const tail = pieces.find((entry) => !result.ids.includes(entry.id) && entry.id !== 'bed')!
    expect(tail.startTime).toBeCloseTo(8)
    expect(tail.sourceIn).toBeCloseTo(8)
  })

  it('splits a clip the paste lands in the middle of', () => {
    const bed = timeline([item({ id: 'bed', startTime: 0, sourceOut: 10 })])
    const clipboard = copyTimelineItems(source, ['a'])
    const result = pasteTimelineItems(bed, clipboard, { at: 4, newId: ids() })!
    const pieces = result.timeline.items.filter((entry) => entry.assetId === 'asset-1')
    expect(pieces).toHaveLength(3) // head, paste, tail
    const tail = pieces.find((entry) => entry.startTime === 7)!
    expect(tail).toBeDefined()
    expect(tail.sourceIn).toBeCloseTo(7)
    expect(tail.sourceOut).toBeCloseTo(10)
  })

  it('skips clips whose source media is gone, and clips with no usable track', () => {
    const clipboard = copyTimelineItems(source, ['a', 'b'])
    const result = pasteTimelineItems(source, clipboard, { at: 20, newId: ids(), existingAssetIds: new Set(['asset-1']) })
    expect(result!.ids).toHaveLength(1)
    expect(result!.skipped).toBe(1)

    const audioOnly = timeline([], { tracks: tracks.filter((track) => track.type !== 'video') })
    const noTarget = pasteTimelineItems(audioOnly, copyTimelineItems(source, ['a']), { at: 0, newId: ids() })
    expect(noTarget).toEqual({ timeline: audioOnly, ids: [], skipped: 1 })
  })

  it('falls back to another track of the same type when the original is locked', () => {
    const clipboard = copyTimelineItems(timeline([item({ id: 'a' })]), ['a'])
    const lockedFirst = timeline([item({ id: 'a' })], {
      tracks: tracks.map((track) => (track.id === 'video-1' ? { ...track, locked: true } : track))
    })
    const result = pasteTimelineItems(lockedFirst, clipboard, { at: 0, newId: ids() })!
    expect(result.timeline.items.find((entry) => entry.id === result.ids[0])!.trackId).toBe('video-2')
  })
})

describe('delete and ripple delete', () => {
  const three = timeline([
    item({ id: 'a', startTime: 0, sourceOut: 2 }),
    item({ id: 'b', startTime: 2, sourceOut: 3 }),
    item({ id: 'c', startTime: 5, sourceOut: 2 }),
    item({ id: 'audio', assetId: 'asset-2', trackId: 'audio-1', startTime: 5, sourceOut: 2 })
  ])

  it('plain delete leaves the gap where the clip was', () => {
    const result = deleteTimelineItems(three, ['b'])!
    expect(result.timeline.items.map((entry) => entry.id)).toEqual(['a', 'c', 'audio'])
    expect(result.timeline.items.find((entry) => entry.id === 'c')!.startTime).toBe(5)
  })

  it('ripple delete closes the gap on that track only', () => {
    const result = deleteTimelineItems(three, ['b'], { ripple: true })!
    expect(result.timeline.items.map((entry) => entry.id)).toEqual(['a', 'c', 'audio'])
    expect(result.timeline.items.find((entry) => entry.id === 'c')!.startTime).toBe(2)
    // A different track keeps its sync.
    expect(result.timeline.items.find((entry) => entry.id === 'audio')!.startTime).toBe(5)
  })

  it('ripple delete of several clips closes each gap in order', () => {
    const result = deleteTimelineItems(three, ['a', 'b'], { ripple: true })!
    expect(result.timeline.items.find((entry) => entry.id === 'c')!.startTime).toBe(0)
  })

  it('never removes or shifts a locked track', () => {
    const locked = { ...three, tracks: tracks.map((track) => (track.id === 'audio-1' ? { ...track, locked: true } : track)) }
    const result = deleteTimelineItems(locked, ['b', 'audio'], { ripple: true })!
    expect(result.removedIds).toEqual(['b'])
    expect(result.timeline.items.find((entry) => entry.id === 'audio')!.startTime).toBe(5)
  })

  it('clamps a shifted clip to the start of the timeline', () => {
    const result = deleteTimelineItems(timeline([item({ id: 'a', startTime: 0, sourceOut: 5 }), item({ id: 'b', startTime: 5, sourceOut: 1 })]), ['a'], { ripple: true })!
    expect(result.timeline.items[0].startTime).toBe(0)
  })
})

describe('duplicate and split', () => {
  it('duplicates a block after itself, keeping relative timing', () => {
    const result = duplicateTimelineItems(timeline([item({ id: 'a', startTime: 2, sourceOut: 2 }), item({ id: 'b', startTime: 5, sourceOut: 1 })]), ['a', 'b'], ids())!
    expect(result.timeline.items.filter((entry) => result.ids.includes(entry.id)).map((entry) => entry.startTime)).toEqual([6, 9])
  })

  it('splits every selected clip the playhead crosses, mapping source time through speed', () => {
    const fast = item({ id: 'fast', startTime: 0, sourceIn: 4, sourceOut: 12, speed: 2 })
    const span = item({ id: 'span', startTime: 8, sourceOut: 4 })
    const result = splitTimelineItemsAt(timeline([fast, span]), ['fast', 'span'], 2, ids())
    expect(result).not.toBeNull()
    const right = result!.timeline.items.filter((entry) => result!.ids.includes(entry.id))
    expect(right).toHaveLength(1) // only the fast clip is under the playhead at 2 s
    expect(right[0].sourceIn).toBe(8)
    expect(right[0].startTime).toBe(2)
  })
})

describe('selection', () => {
  const row = timeline([
    item({ id: 'a', startTime: 0, sourceOut: 1 }),
    item({ id: 'b', startTime: 4, sourceOut: 1 }),
    item({ id: 'c', startTime: 8, sourceOut: 1 }),
    item({ id: 'other', assetId: 'asset-2', trackId: 'video-2', startTime: 2, sourceOut: 1 })
  ])

  it('selects a range along the clicked track', () => {
    expect(selectTimelineRange(row, 'a', 'c')).toEqual(['a', 'b', 'c'])
    expect(selectTimelineRange(row, 'c', 'a')).toEqual(['a', 'b', 'c'])
    expect(selectTimelineRange(row, 'b', 'c')).toEqual(['b', 'c'])
    // An anchor on another track does not pull that track in.
    expect(selectTimelineRange(row, 'other', 'c')).toEqual(['c'])
  })

  it('offers every unlocked clip for select-all', () => {
    const locked = { ...row, tracks: tracks.map((track) => (track.id === 'video-2' ? { ...track, locked: true } : track)) }
    expect(selectableTimelineIds(locked)).toEqual(['a', 'b', 'c'])
  })
})

describe('dropping a clip onto another clip', () => {
  it('detects and resolves the covered part on release', () => {
    const moved = timeline([item({ id: 'bed', startTime: 0, sourceOut: 6 }), item({ id: 'drop', startTime: 4, sourceOut: 2 })])
    expect(hasTimelineOverlap(moved, ['drop'])).toBe(true)
    const resolved = resolveTimelineOverlaps(moved, ['drop'], ids())
    expect(resolved.items.find((entry) => entry.id === 'bed')!.sourceOut).toBeCloseTo(4)
    expect(resolved.items.find((entry) => entry.id === 'drop')!.startTime).toBe(4)
  })

  it('is quiet when the clip lands in empty space or on another track', () => {
    const clear = timeline([item({ id: 'bed', startTime: 0, sourceOut: 2 }), item({ id: 'drop', startTime: 4, sourceOut: 2 })])
    expect(hasTimelineOverlap(clear, ['drop'])).toBe(false)
    expect(resolveTimelineOverlaps(clear, ['drop'], ids())).toBe(clear)
    const otherTrack = timeline([item({ id: 'bed', startTime: 0, sourceOut: 6 }), item({ id: 'drop', trackId: 'video-2', startTime: 1, sourceOut: 2 })])
    expect(hasTimelineOverlap(otherTrack, ['drop'])).toBe(false)
  })
})

describe('clip clipboard store', () => {
  afterEach(() => useTimelineClipboard.getState().setClipboard(null))

  it('tiles a repeated paste at the same playhead and follows a moved playhead', () => {
    const store = useTimelineClipboard.getState()
    store.setClipboard(copyTimelineItems(timeline([item({ id: 'a' })]), ['a']))
    expect(useTimelineClipboard.getState().pasteTarget(10)).toBe(10)
    useTimelineClipboard.getState().rememberPaste(10, 4)
    // Same spot again: continue after the block that was just pasted.
    expect(useTimelineClipboard.getState().pasteTarget(10)).toBe(14)
    // A new playhead position is taken as-is.
    expect(useTimelineClipboard.getState().pasteTarget(30)).toBe(30)
  })

  it('forgets the paste position for a new clipboard or a new clip', () => {
    const store = useTimelineClipboard.getState()
    store.setClipboard(copyTimelineItems(timeline([item({ id: 'a' })]), ['a'])!)
    store.rememberPaste(5, 3)
    useTimelineClipboard.getState().forgetPaste()
    expect(useTimelineClipboard.getState().pasteTarget(5)).toBe(5)
    store.rememberPaste(5, 3)
    store.setClipboard(copyTimelineItems(timeline([item({ id: 'a' })]), ['a']))
    expect(useTimelineClipboard.getState().pasteTarget(5)).toBe(5)
  })
})
