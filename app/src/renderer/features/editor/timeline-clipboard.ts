/**
 * The editor's own clipboard for timeline clips.
 *
 * Deliberately not the operating-system clipboard: a timeline clip is a
 * reference to media plus a dozen edit properties, and pasting it into another
 * program (or pasting a document into the timeline) must not be possible by
 * accident. Text copy and paste keep using the real clipboard through the normal
 * fields. The store also remembers where the last paste landed so pressing paste
 * again tiles the block instead of stacking it on itself.
 */

import { create } from 'zustand'
import type { TimelineClipboard } from '@shared/editor/timeline-editing'

interface TimelineClipboardState {
  clipboard: TimelineClipboard | null
  /** Where the last paste landed and how long the block was. */
  lastPaste: { at: number; span: number } | null
  setClipboard(clipboard: TimelineClipboard | null): void
  rememberPaste(at: number, span: number): void
  forgetPaste(): void
  /** Paste position for `playhead`; repeats tile after the previous block. */
  pasteTarget(playhead: number): number
}

export const useTimelineClipboard = create<TimelineClipboardState>((set, get) => ({
  clipboard: null,
  lastPaste: null,

  setClipboard(clipboard) {
    set({ clipboard, lastPaste: null })
  },

  rememberPaste(at, span) {
    set({ lastPaste: { at, span } })
  },

  forgetPaste() {
    set({ lastPaste: null })
  },

  pasteTarget(playhead) {
    const state = get()
    if (!state.lastPaste) return playhead
    // A repeated paste at the very same spot continues after the first block.
    // Moving the playhead means the user chose a new place, so use it.
    const samePlace = Math.abs(state.lastPaste.at - playhead) < 0.001
    return samePlace ? state.lastPaste.at + Math.max(0, state.lastPaste.span) : playhead
  }
}))

/** Read-only access for the commands that only need the state. */
export function clipboardSnapshot(): TimelineClipboard | null {
  return useTimelineClipboard.getState().clipboard
}
