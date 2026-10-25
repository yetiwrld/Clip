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
  options: { coalesceMs?: number; maxEntries?: number } = {}
): TimelineCommandHistory {
  const coalesceMs = options.coalesceMs ?? 650
  const maxEntries = options.maxEntries ?? 50
  const undo = [...history.undo]
  const previous = undo[undo.length - 1]
  if (history.redo.length === 0 && previous && issuedAt - previous.issuedAt <= coalesceMs) {
    undo[undo.length - 1] = { ...previous, after, issuedAt }
  } else {
    undo.push({ before, after, issuedAt })
  }
  if (undo.length > maxEntries) undo.splice(0, undo.length - maxEntries)
  return { undo, redo: [], lastActionAt: issuedAt }
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
