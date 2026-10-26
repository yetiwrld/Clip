import type { ClipTimeline, ProjectAsset, TimelineItem, TimelineTrack, TimelineTrackType } from '../types'
import { effectiveItemSpeed, sourceDeltaForTimelineDelta, timelineItemDuration, timelineItemEnd } from '../video/time-map'

/** Least source amount a trimmed or split piece may keep; below it the piece goes. */
const MIN_SOURCE = 0.02

/** Default name for a new track of one type, matching the Add-track menu. */
export function timelineTrackName(tracks: TimelineTrack[], type: TimelineTrackType): string {
  const sameType = tracks.filter((track) => track.type === type).length
  if (type === 'audio') return `Audio ${sameType + 1}`
  if (type === 'image') return `Graphics ${sameType + 1}`
  return `Video ${sameType + 2}`
}

export interface TimelinePlacement {
  timeline: ClipTimeline
  item: TimelineItem
  track: TimelineTrack
  createdTrack: boolean
}

/**
 * Put one library asset on the timeline at `at`.
 *
 * When `trackId` is given that track must be unlocked and must take the
 * asset's media type. Otherwise the earliest unlocked track of that type is
 * used, and a new one is created when there is none. This is the one
 * implementation behind a drop, the library's add button and a project import,
 * so a clip is always built from the same defaults.
 */
export function addAssetToTimeline(
  timeline: ClipTimeline,
  asset: ProjectAsset,
  options: { at: number; trackId?: string; newId: () => string }
): TimelinePlacement | null {
  if (!asset || asset.missing) return null
  const requested = options.trackId ? timeline.tracks.find((track) => track.id === options.trackId) : undefined
  if (requested && (requested.locked || requested.type !== asset.mediaType)) return null
  let track = requested ?? [...timeline.tracks]
    .filter((candidate) => candidate.type === asset.mediaType && !candidate.locked)
    .sort((a, b) => a.order - b.order)[0]
  let tracks = timeline.tracks
  let createdTrack = false
  if (!track) {
    createdTrack = true
    track = {
      id: options.newId(),
      name: timelineTrackName(timeline.tracks, asset.mediaType),
      type: asset.mediaType,
      order: timeline.tracks.length,
      muted: false,
      hidden: false,
      locked: false
    }
    tracks = [...timeline.tracks, track]
  }
  const at = Math.max(0, Number.isFinite(options.at) ? options.at : 0)
  const item: TimelineItem = {
    id: options.newId(), assetId: asset.id, trackId: track.id, startTime: at,
    sourceIn: 0, sourceOut: asset.duration ?? 5, volume: 1, muted: false,
    fadeIn: 0, fadeOut: 0, speed: 1, loop: false,
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1
  }
  return { timeline: { ...timeline, tracks, items: [...timeline.items, item] }, item, track, createdTrack }
}

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

// ---------------------------------------------------------------------------
// Multi-clip editing: copy, cut, paste, duplicate, delete, selection.
//
// Everything here is a pure function over `ClipTimeline`. The timeline's source
// of truth is that value, so a command is "real" exactly when these functions
// produce the timeline the UI then renders and saves. One rule set is shared by
// keyboard shortcuts, the edit menu, the context menu and the toolbar, so the
// four entry points cannot drift apart.
// ---------------------------------------------------------------------------

/** Most clips one copy may hold; the payload schema caps a timeline at 1000. */
export const TIMELINE_CLIPBOARD_LIMIT = 100

export interface TimelineClipboardEntry {
  /** Everything about the clip except its identity, track and placement. */
  item: Omit<TimelineItem, 'id' | 'trackId' | 'startTime'>
  /** Seconds after the earliest copied clip, so relative timing survives. */
  offset: number
  /** Where it came from, to paste back onto the same track when possible. */
  trackId: string
  trackType: TimelineTrackType
  trackOrder: number
}

export interface TimelineClipboard {
  entries: TimelineClipboardEntry[]
  /** Timeline length of the whole copied block, for repeated paste. */
  span: number
}

export interface TimelineDeleteResult {
  timeline: ClipTimeline
  removedIds: string[]
}

export interface TimelinePasteResult {
  timeline: ClipTimeline
  /** The clips that were created, in clipboard order. */
  ids: string[]
  /** Entries with no compatible unlocked track left to land on. */
  skipped: number
}

function trackOf(timeline: ClipTimeline, trackId: string): TimelineTrack | undefined {
  return timeline.tracks.find((track) => track.id === trackId)
}

/** Items that can be edited: they exist and their track is not locked. */
export function editableTimelineItems(timeline: ClipTimeline, ids: string[]): TimelineItem[] {
  const wanted = new Set(ids)
  return timeline.items.filter((item) => {
    if (!wanted.has(item.id)) return false
    const track = trackOf(timeline, item.trackId)
    return Boolean(track && !track.locked)
  })
}

/** Every clip the user may select: locked tracks are read-only, so not selectable. */
export function selectableTimelineIds(timeline: ClipTimeline): string[] {
  return timeline.items
    .filter((item) => {
      const track = trackOf(timeline, item.trackId)
      return Boolean(track && !track.locked)
    })
    .map((item) => item.id)
}

/**
 * Selection after a shift-click: every clip on the clicked clip's track whose
 * position falls between the anchor and the clicked clip, in timeline order.
 */
export function selectTimelineRange(timeline: ClipTimeline, anchorId: string, targetId: string): string[] {
  const target = timeline.items.find((item) => item.id === targetId)
  if (!target) return []
  const row = timeline.items
    .filter((item) => item.trackId === target.trackId)
    .slice()
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))
  const targetIndex = row.findIndex((item) => item.id === targetId)
  const anchorIndex = row.findIndex((item) => item.id === anchorId)
  if (targetIndex < 0) return []
  // No anchor on this track yet: the range is just the clicked clip.
  const from = anchorIndex < 0 ? targetIndex : Math.min(anchorIndex, targetIndex)
  const to = anchorIndex < 0 ? targetIndex : Math.max(anchorIndex, targetIndex)
  return row.slice(from, to + 1).map((item) => item.id)
}

/** Copy clips into the editor's own format, independent of the OS clipboard. */
export function copyTimelineItems(timeline: ClipTimeline, ids: string[]): TimelineClipboard | null {
  const wanted = new Set(ids)
  const found = timeline.items.filter((item) => wanted.has(item.id) && trackOf(timeline, item.trackId))
  if (found.length === 0) return null
  const origin = Math.min(...found.map((item) => item.startTime))
  const entries = found
    .slice()
    .sort((a, b) => a.startTime - b.startTime || a.trackId.localeCompare(b.trackId))
    .slice(0, TIMELINE_CLIPBOARD_LIMIT)
    .map((item) => {
      const track = trackOf(timeline, item.trackId) as TimelineTrack
      const { id, trackId, startTime, ...rest } = item
      void id
      void startTime
      return {
        item: rest,
        offset: Math.max(0, item.startTime - origin),
        trackId,
        trackType: track.type,
        trackOrder: track.order
      }
    })
  const span = Math.max(...entries.map((entry) => entry.offset + timelineItemDuration(entry.item)))
  return { entries, span }
}

/**
 * Remove clips. The gap stays where the clips were; nothing else moves. Locked
 * tracks are never touched.
 */
export function deleteTimelineItems(
  timeline: ClipTimeline,
  ids: string[]
): TimelineDeleteResult | null {
  const targets = editableTimelineItems(timeline, ids)
  if (targets.length === 0) return null
  const removedIds = targets.map((item) => item.id)
  const removed = new Set(removedIds)
  const items = timeline.items.filter((item) => !removed.has(item.id))
  return { timeline: { ...timeline, items }, removedIds }
}

/** Cut = copy into the editor clipboard, then remove. One undo step. */
export function cutTimelineItems(
  timeline: ClipTimeline,
  ids: string[]
): { timeline: ClipTimeline; clipboard: TimelineClipboard } | null {
  const editable = editableTimelineItems(timeline, ids)
  if (editable.length === 0) return null
  const clipboard = copyTimelineItems(timeline, editable.map((item) => item.id))
  const result = deleteTimelineItems(timeline, editable.map((item) => item.id))
  if (!clipboard || !result) return null
  return { timeline: result.timeline, clipboard }
}

/** The track a pasted clip belongs on: same track, else the nearest free one. */
function pasteTrackFor(timeline: ClipTimeline, entry: TimelineClipboardEntry): TimelineTrack | null {
  const usable = timeline.tracks.filter((track) => !track.locked && track.type === entry.trackType)
  if (usable.length === 0) return null
  const same = usable.find((track) => track.id === entry.trackId)
  if (same) return same
  return usable
    .slice()
    .sort((a, b) => Math.abs(a.order - entry.trackOrder) - Math.abs(b.order - entry.trackOrder) || a.order - b.order)[0] ?? null
}

/**
 * Trim or split the clips already on a track so a new block can take its place.
 *
 * This is overwrite editing: the pasted clip wins the space, and what it covers
 * is shortened rather than silently stacked underneath. A clip that the block
 * lands in the middle of becomes two clips.
 */
function overwriteItems(
  items: TimelineItem[],
  ranges: Array<{ trackId: string; start: number; end: number }>,
  newId: () => string
): TimelineItem[] {
  if (ranges.length === 0) return items
  const byTrack = new Map<string, Array<{ start: number; end: number }>>()
  for (const range of ranges) {
    const list = byTrack.get(range.trackId) ?? []
    list.push({ start: range.start, end: range.end })
    byTrack.set(range.trackId, list)
  }
  const out: TimelineItem[] = []
  for (const item of items) {
    const cuts = byTrack.get(item.trackId)
    if (!cuts || cuts.length === 0) {
      out.push(item)
      continue
    }
    const speed = effectiveItemSpeed(item.speed)
    const itemEnd = timelineItemEnd(item)
    let pieces: TimelineItem[] = [item]
    for (const cut of cuts) {
      const next: TimelineItem[] = []
      for (const piece of pieces) {
        const pieceEnd = timelineItemEnd(piece)
        if (cut.end <= piece.startTime + 1e-6 || cut.start >= pieceEnd - 1e-6) {
          next.push(piece)
          continue
        }
        const trimsHead = cut.start <= piece.startTime + 1e-6
        const trimsTail = cut.end >= pieceEnd - 1e-6
        if (trimsHead && trimsTail) continue
        if (trimsHead) {
          const sourceIn = piece.sourceIn + (cut.end - piece.startTime) * speed
          if (piece.sourceOut - sourceIn < MIN_SOURCE) continue
          next.push({ ...piece, startTime: cut.end, sourceIn })
          continue
        }
        if (trimsTail) {
          const sourceOut = piece.sourceOut - (pieceEnd - cut.start) * speed
          if (sourceOut - piece.sourceIn < MIN_SOURCE) continue
          next.push({ ...piece, sourceOut })
          continue
        }
        const headSourceOut = piece.sourceIn + (cut.start - piece.startTime) * speed
        const tailSourceIn = piece.sourceIn + (cut.end - piece.startTime) * speed
        if (headSourceOut - piece.sourceIn >= MIN_SOURCE) next.push({ ...piece, sourceOut: headSourceOut })
        if (piece.sourceOut - tailSourceIn >= MIN_SOURCE) {
          next.push({ ...piece, id: newId(), startTime: cut.end, sourceIn: tailSourceIn })
        }
      }
      pieces = next
    }
    out.push(...pieces)
  }
  return out
}

/**
 * Paste a copied block at `at`, keeping the clips' relative timing.
 *
 * Clips land on their own track when it still exists and is unlocked, otherwise
 * on the nearest compatible track. Clips covered by the block are overwritten
 * the way an overwrite edit does it. Entries with no usable track are reported
 * as skipped instead of being dropped silently or pointed at a missing asset.
 */
export function pasteTimelineItems(
  timeline: ClipTimeline,
  clipboard: TimelineClipboard | null,
  options: {
    at: number
    newId: () => string
    /**
     * Media ids the project still has. A clip whose source was removed since it
     * was copied is skipped rather than pasted as a broken reference.
     */
    existingAssetIds?: Set<string>
  }
): TimelinePasteResult | null {
  if (!clipboard || clipboard.entries.length === 0) return null
  const at = Math.max(0, Number.isFinite(options.at) ? options.at : 0)
  const placements: TimelineItem[] = []
  let skipped = 0
  for (const entry of clipboard.entries) {
    if (options.existingAssetIds && !options.existingAssetIds.has(entry.item.assetId)) {
      skipped += 1
      continue
    }
    const track = pasteTrackFor(timeline, entry)
    if (!track) {
      skipped += 1
      continue
    }
    placements.push({
      ...entry.item,
      id: options.newId(),
      trackId: track.id,
      startTime: at + Math.max(0, entry.offset)
    })
  }
  if (placements.length === 0) return { timeline, ids: [], skipped }
  const existing = overwriteItems(
    timeline.items,
    placements.map((item) => ({ trackId: item.trackId, start: item.startTime, end: timelineItemEnd(item) })),
    options.newId
  )
  return {
    timeline: { ...timeline, items: [...existing, ...placements] },
    ids: placements.map((item) => item.id),
    skipped
  }
}

/**
 * Trim whatever a moved clip now covers on its destination track.
 *
 * Dragging is free-form while the pointer moves; this runs once on release so a
 * clip dropped on top of another one replaces the covered part instead of
 * stacking two clips in the same space.
 */
export function resolveTimelineOverlaps(timeline: ClipTimeline, movingIds: string[], newId: () => string): ClipTimeline {
  const moving = timeline.items.filter((item) => movingIds.includes(item.id))
  if (moving.length === 0) return timeline
  // Nothing is covered, so nothing changes: keep the same value (and the same
  // item order) instead of rebuilding the array.
  if (!hasTimelineOverlap(timeline, movingIds)) return timeline
  const items = overwriteItems(
    timeline.items.filter((item) => !movingIds.includes(item.id)),
    moving.map((item) => ({ trackId: item.trackId, start: item.startTime, end: timelineItemEnd(item) })),
    newId
  )
  return { ...timeline, items: [...items, ...moving] }
}

/** True when a moved clip now sits on top of another clip on the same track. */
export function hasTimelineOverlap(timeline: ClipTimeline, movingIds: string[]): boolean {
  const moving = new Set(movingIds)
  const moved = timeline.items.filter((item) => moving.has(item.id))
  const others = timeline.items.filter((item) => !moving.has(item.id))
  for (const item of moved) {
    const start = item.startTime
    const end = timelineItemEnd(item)
    for (const other of others) {
      if (other.trackId !== item.trackId) continue
      if (other.startTime < end - 1e-6 && timelineItemEnd(other) > start + 1e-6) return true
    }
  }
  return false
}

/**
 * Duplicate a selection directly after itself, keeping relative timing.
 *
 * The copies follow the last clip in the block, so duplicating twice builds a
 * continuous sequence rather than a pile on one spot.
 */
export function duplicateTimelineItems(
  timeline: ClipTimeline,
  ids: string[],
  newId: () => string
): TimelineItemEditResultMultiple | null {
  const targets = editableTimelineItems(timeline, ids)
  if (targets.length === 0) return null
  const origin = Math.min(...targets.map((item) => item.startTime))
  const blockEnd = Math.max(...targets.map(timelineItemEnd))
  const copies = targets.map((item) => ({
    ...item,
    id: newId(),
    startTime: blockEnd + (item.startTime - origin)
  }))
  return {
    timeline: { ...timeline, items: [...timeline.items, ...copies] },
    ids: copies.map((item) => item.id)
  }
}

export interface TimelineItemEditResultMultiple {
  timeline: ClipTimeline
  ids: string[]
}

/**
 * Split every selected clip the playhead passes through.
 *
 * Selection becomes the right-hand halves, which is what you want after a cut:
 * the next command acts on the material that starts at the playhead.
 */
export function splitTimelineItemsAt(
  timeline: ClipTimeline,
  ids: string[],
  time: number,
  newId: () => string
): TimelineItemEditResultMultiple | null {
  let current = timeline
  const created: string[] = []
  for (const id of ids) {
    const result = splitTimelineItemAt(current, id, time, newId())
    if (!result) continue
    current = result.timeline
    if (result.selectedId) created.push(result.selectedId)
  }
  return created.length > 0 ? { timeline: current, ids: created } : null
}
