import { describe, expect, it } from 'vitest'
import type { Clip, ClipTimeline } from '../../src/shared/types'
import {
  emptyTimelineCommandHistory,
  executeClipCommand,
  executeTimelineCommand,
  recordTimelineCommand,
  redoTimelineCommand,
  undoTimelineCommand
} from '../../src/shared/editor/timeline-commands'

const base: ClipTimeline = { tracks: [], items: [], snapEnabled: true }
const withSnapOff: ClipTimeline = { ...base, snapEnabled: false }
const withTrack: ClipTimeline = { ...withSnapOff, tracks: [{ id: 't1', name: 'Video', type: 'video', order: 0, muted: false, hidden: false, locked: false }] }

describe('timeline edit command boundary', () => {
  it('applies clip patches immutably and restores snapshots through commands', () => {
    const clip = { id: 'clip1', title: 'Before', cropX: 0.5 } as Clip
    const patched = executeClipCommand(clip, { type: 'clip.patch', patch: { cropX: 0.7 }, issuedAt: 1 })
    expect(patched).toEqual({ ...clip, cropX: 0.7 })
    expect(clip.cropX).toBe(0.5)
    const restored = executeClipCommand(patched, { type: 'clip.restore', snapshot: { title: 'Restored', cropX: 0.5 }, issuedAt: 2 })
    expect(restored.title).toBe('Restored')
    expect(restored.cropX).toBe(0.5)
  })

  it('executes replacement commands and coalesces rapid edits into one undo step', () => {
    const first = executeTimelineCommand(base, { type: 'timeline.replace', timeline: withSnapOff, issuedAt: 100 })
    const history = recordTimelineCommand(emptyTimelineCommandHistory(), base, first, 100)
    const second = executeTimelineCommand(first, { type: 'timeline.replace', timeline: withTrack, issuedAt: 500 })
    const coalesced = recordTimelineCommand(history, first, second, 500)
    expect(coalesced.undo).toHaveLength(1)
    expect(coalesced.undo[0].before).toBe(base)
    expect(coalesced.undo[0].after).toBe(withTrack)
  })

  it('undoes and redoes snapshots, and starts a new branch after undo', () => {
    const history = recordTimelineCommand(emptyTimelineCommandHistory(), base, withSnapOff, 100)
    const undone = undoTimelineCommand(history)
    expect(undone.timeline).toBe(base)
    const branched = recordTimelineCommand(undone.history, base, withTrack, 200)
    expect(branched.undo).toHaveLength(1)
    const redone = redoTimelineCommand(undone.history)
    expect(redone.timeline).toBe(withSnapOff)
  })

  it('bounds undo history and starts separate commands after the coalesce window', () => {
    let history = recordTimelineCommand(emptyTimelineCommandHistory(), base, withSnapOff, 100, { maxEntries: 1 })
    history = recordTimelineCommand(history, withSnapOff, withTrack, 900, { maxEntries: 1 })
    expect(history.undo).toHaveLength(1)
    expect(history.undo[0].before).toBe(withSnapOff)
  })
})
