import type { Clip, ClipTimeline } from '../types'

export type ClipEditCommand =
  | { type: 'clip.patch'; patch: Partial<Clip>; issuedAt: number }
  | { type: 'clip.restore'; snapshot: Partial<Clip>; issuedAt: number }

/** Apply clip edits through the same pure command boundary as timeline edits. */
export function executeClipCommand(current: Clip, command: ClipEditCommand): Clip {
  if (command.type === 'clip.patch') return { ...current, ...command.patch }
  return { ...current, ...command.snapshot }
}

/** Additive command boundary for legacy timeline edits; persistence stays normalized. */
export interface TimelineReplaceCommand {
  type: 'timeline.replace'
  timeline: ClipTimeline
  issuedAt: number
}

interface TimelineHistoryEntry {
  before: ClipTimeline
  after: ClipTimeline
  issuedAt: number
  /**
   * Edits inside one gesture share a group so a drag becomes one undo step.
   * A discrete command (cut, paste, delete…) gets a group of its own, which
   * can never match the next gesture — that is what stops a delete from
   * being swallowed by a drag that follows it.
   */
  group?: string
}

let groupCounter = 0

/** A group no other entry can share, for one-shot commands. */
export function discreteTimelineGroup(): string {
  groupCounter += 1
  return `command-${groupCounter}`
}

export interface TimelineCommandHistory {
  undo: TimelineHistoryEntry[]
  redo: TimelineHistoryEntry[]
  lastActionAt: number
}

export function emptyTimelineCommandHistory(): TimelineCommandHistory {
  return { undo: [], redo: [], lastActionAt: 0 }
}

/** Execute a validated renderer edit command as an immutable timeline value. */
export function executeTimelineCommand(
  current: ClipTimeline,
  command: TimelineReplaceCommand
): ClipTimeline {
  if (command.type !== 'timeline.replace') return current
  return command.timeline
}

/** Record a command; rapid pointer/slider changes coalesce into one undo step. */
export function recordTimelineCommand(
  history: TimelineCommandHistory,
  before: ClipTimeline,
  after: ClipTimeline,
  issuedAt: number,
  options: { coalesceMs?: number; maxEntries?: number; group?: string } = {}
): TimelineCommandHistory {
  const coalesceMs = options.coalesceMs ?? 650
  const maxEntries = options.maxEntries ?? 50
  const undo = [...history.undo]
  const previous = undo[undo.length - 1]
  // A named group is one gesture: every value it reports belongs to the same
  // undo step, however long the user holds the pointer. Unnamed edits (a typed
  // number, one slider tick) fall back to the short time window.
  const sameGroup = previous !== undefined && previous.group === options.group
  const withinWindow = previous !== undefined && issuedAt - previous.issuedAt <= coalesceMs
  const merge = history.redo.length === 0 && previous !== undefined && sameGroup &&
    (options.group !== undefined || withinWindow)
  if (merge) {
    undo[undo.length - 1] = { ...previous, after, issuedAt }
  } else {
    undo.push({ before, after, issuedAt, group: options.group })
  }
  if (undo.length > maxEntries) undo.splice(0, undo.length - maxEntries)
  return { undo, redo: [], lastActionAt: issuedAt }
}

/**
 * Drop history entries that would restore a clip pointing at media the user has
 * just removed from the project.
 *
 * Without this, "delete the clip, remove its media, undo" would restore a
 * reference the backend refuses to save. Losing those steps is the honest
 * result: the edit they would recreate is no longer part of the project.
 */
export function pruneTimelineHistory(
  history: TimelineCommandHistory,
  removedAssetId: string
): TimelineCommandHistory {
  const referencesRemoved = (timeline: ClipTimeline): boolean =>
    timeline.items.some((item) => item.assetId === removedAssetId)
  const undo = history.undo.filter((entry) => !referencesRemoved(entry.before) && !referencesRemoved(entry.after))
  const redo = history.redo.filter((entry) => !referencesRemoved(entry.before) && !referencesRemoved(entry.after))
  if (undo.length === history.undo.length && redo.length === history.redo.length) return history
  return { ...history, undo, redo }
}

export function undoTimelineCommand(history: TimelineCommandHistory, issuedAt = Date.now()): {
  history: TimelineCommandHistory
  timeline: ClipTimeline | null
} {
  const undo = [...history.undo]
  const entry = undo.pop()
  return entry
    ? { history: { undo, redo: [...history.redo, entry], lastActionAt: issuedAt }, timeline: entry.before }
    : { history, timeline: null }
}

export function redoTimelineCommand(history: TimelineCommandHistory, issuedAt = Date.now()): {
  history: TimelineCommandHistory
  timeline: ClipTimeline | null
} {
  const redo = [...history.redo]
  const entry = redo.pop()
  return entry
    ? { history: { undo: [...history.undo, entry], redo, lastActionAt: issuedAt }, timeline: entry.after }
    : { history, timeline: null }
}
