import { describe, expect, it } from 'vitest'
import type { Clip, ClipTimeline } from '../../src/shared/types'
import {
  discreteTimelineGroup,
  emptyTimelineCommandHistory,
  executeClipCommand,
  pruneTimelineHistory,
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

  it('never swallows a discrete command into the drag around it', () => {
    let history = recordTimelineCommand(emptyTimelineCommandHistory(), base, withSnapOff, 100, { group: 'gesture' })
    // A cut/paste/delete lands 50 ms after a drag value: it must be its own step.
    history = recordTimelineCommand(history, withSnapOff, withTrack, 150, { group: discreteTimelineGroup() })
    history = recordTimelineCommand(history, withTrack, base, 200, { group: 'gesture' })
    expect(history.undo).toHaveLength(3)
    expect(history.undo.map((entry) => entry.before)).toEqual([base, withSnapOff, withTrack])
    // Undoing three times walks back through each step in order.
    const first = undoTimelineCommand(history)
    const second = undoTimelineCommand(first.history)
    const third = undoTimelineCommand(second.history)
    expect([first.timeline, second.timeline, third.timeline]).toEqual([withTrack, withSnapOff, base])
    expect(third.history.undo).toHaveLength(0)
  })

  it('keeps coalescing the values of one drag, however long it lasts', () => {
    let history = recordTimelineCommand(emptyTimelineCommandHistory(), base, withSnapOff, 100, { group: 'drag-1' })
    // A three-second drag: every value still belongs to the same undo step.
    for (let step = 1; step <= 30; step += 1) {
      history = recordTimelineCommand(history, withSnapOff, withTrack, 100 + step * 100, { group: 'drag-1' })
    }
    expect(history.undo).toHaveLength(1)
    expect(history.undo[0].after).toBe(withTrack)
    // The next drag is a new step.
    history = recordTimelineCommand(history, withTrack, base, 5000, { group: 'drag-2' })
    expect(history.undo).toHaveLength(2)
  })

  it('forgets undo steps that would restore removed media', () => {
    const withClip = {
      ...withTrack,
      items: [{ id: 'x', assetId: 'gone-asset', trackId: 't1', startTime: 0, sourceIn: 0, sourceOut: 2, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }]
    }
    // The clip existed before the edit and not after it: undo would restore it.
    const history = recordTimelineCommand(emptyTimelineCommandHistory(), withClip, withTrack, 100, { group: discreteTimelineGroup() })
    const pruned = pruneTimelineHistory(history, 'gone-asset')
    expect(pruned.undo).toHaveLength(0)
    expect(pruned.redo).toHaveLength(0)
    // Unrelated history is left alone, and the same object comes back when
    // nothing matches.
    const untouched = recordTimelineCommand(emptyTimelineCommandHistory(), withTrack, withSnapOff, 100, { group: discreteTimelineGroup() })
    expect(pruneTimelineHistory(untouched, 'gone-asset')).toBe(untouched)
  })

  it('bounds undo history and starts separate commands after the coalesce window', () => {
    let history = recordTimelineCommand(emptyTimelineCommandHistory(), base, withSnapOff, 100, { maxEntries: 1 })
    history = recordTimelineCommand(history, withSnapOff, withTrack, 900, { maxEntries: 1 })
    expect(history.undo).toHaveLength(1)
    expect(history.undo[0].before).toBe(withSnapOff)
  })
})
