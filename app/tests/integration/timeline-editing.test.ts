import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAppContext } from '../../src/main/services/app-context'
import type { AppContext } from '../../src/main/services/app-context'
import { createBackend } from '../../src/main/ipc/backend'
import { clipTimelineRepo, clipsRepo, projectsRepo } from '../../src/main/services/database/repositories'
import type { ClipTimeline, TimelineItem } from '../../src/shared/types'
import {
  copyTimelineItems,
  cutTimelineItems,
  deleteTimelineItems,
  pasteTimelineItems,
  splitTimelineItemsAt
} from '../../src/shared/editor/timeline-editing'
import {
  discreteTimelineGroup,
  recordTimelineCommand,
  redoTimelineCommand,
  undoTimelineCommand,
  emptyTimelineCommandHistory
} from '../../src/shared/editor/timeline-commands'
import { importProjectAssets } from '../../src/main/services/media/assets'
import { rmTempDir, SAMPLE_VIDEO } from '../helpers/context'

/**
 * Editing round trip through the real backend.
 *
 * The editor's commands are pure functions over the timeline document, and the
 * document is what `timeline.save` writes. These tests drive the same functions
 * the shortcuts call, store the result through the real dispatcher, restart the
 * application and read the project back — the part a unit test cannot prove.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const roots: string[] = []
const live: AppContext[] = []

function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-timeline-'))
  roots.push(root)
  return root
}

async function open(root: string): Promise<AppContext> {
  const ctx = await createAppContext({
    workspaceRoot: root,
    appVersion: '0.0.0-test',
    isElectron: false,
    moduleDir: REPO_ROOT,
    logLevel: 'error'
  })
  live.push(ctx)
  return ctx
}

function makeProject(ctx: AppContext, name = 'Timeline edits'): string {
  return projectsRepo.create(ctx.db, crypto.randomUUID(), name, { durationPreset: 'medium', maxCandidates: 8 }).id
}

function makeClip(ctx: AppContext, projectId: string): string {
  return clipsRepo.create(ctx.db, {
    id: crypto.randomUUID(), candidateId: null, projectId,
    startTime: 0, endTime: 10, aspectRatio: '9:16', cropMode: 'center', cropX: 0.5, zoom: 1,
    captionStyleId: 'classic', captionOverrides: {}, captionTextEdits: {},
    captionCueSplits: {}, captionCueMerges: {}, captionTimingOffsets: {}, captionCueHidden: [],
    captionCueDuplicates: [], silenceCuts: [], trackingKeyframes: [], cameraKeyframes: [], textLayers: [],
    audioRestoration: 'off', outputResolution: '1080p', outputQuality: 'standard', outputFps: 'source',
    title: 'timeline', description: '', hashtags: [], cta: '', metadataProvider: null, status: 'draft'
  }).id
}

function item(assetId: string, over: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: crypto.randomUUID(), assetId, trackId: 'video-1',
    startTime: 0, sourceIn: 0, sourceOut: 4, volume: 1, muted: false, fadeIn: 0, fadeOut: 0,
    speed: 1, loop: false, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...over
  }
}

const tracks: ClipTimeline['tracks'] = [
  { id: 'video-1', name: 'Video 1', type: 'video', order: 0, muted: false, hidden: false, locked: false },
  { id: 'video-2', name: 'Video 2', type: 'video', order: 1, muted: false, hidden: false, locked: false }
]

let idCounter = 0
const newId = () => `copy-${++idCounter}`

afterEach(async () => {
  await Promise.all(live.splice(0).map((ctx) => ctx.shutdown().catch(() => undefined)))
  for (const root of roots.splice(0)) rmTempDir(root)
})

describe('timeline edits survive a restart', () => {
  it('saves cut, paste and split results and reads them back exactly', async () => {
    const root = newRoot()
    const first = await open(root)
    const projectId = makeProject(first)
    const clipId = makeClip(first, projectId)
    const backend = createBackend(first, null)

    const [leadAsset, subjectAsset] = await importProjectAssets(first, projectId, [SAMPLE_VIDEO, SAMPLE_VIDEO], () => undefined)
    const original: ClipTimeline = {
      tracks,
      items: [
        item(leadAsset.id, { id: 'lead', startTime: 0, sourceOut: 2 }),
        item(leadAsset.id, { id: 'subject', startTime: 2, sourceIn: 2, sourceOut: 8, speed: 2 }),
        item(subjectAsset.id, { id: 'music', trackId: 'video-2', startTime: 0, sourceOut: 6 })
      ],
      snapEnabled: true
    }
    await backend.invoke('timeline.save', { clipId, timeline: original })
    expect(first.db.status().dirty).toBe(false)

    // Split the subject at the playhead (2 s into a 3 s clip), cut the head
    // piece, and paste it further down the timeline.
    const split = splitTimelineItemsAt(original, ['subject'], 3, newId)!
    const cut = cutTimelineItems(split.timeline, split.ids)!
    const pasted = pasteTimelineItems(cut.timeline, cut.clipboard, { at: 6, newId })!
    await backend.invoke('timeline.save', { clipId, timeline: pasted.timeline })

    const saved = (await backend.invoke('timeline.get', { clipId })) as ClipTimeline
    expect(saved.items.map((entry) => entry.id).sort()).toEqual(
      ['lead', 'subject', 'music', ...pasted.ids].sort()
    )
    const pastedClip = saved.items.find((entry) => entry.id === pasted.ids[0])!
    // The split kept the source interval and the speed; the paste kept both.
    // Playhead at 3 s inside a clip that starts at 2 s at double speed is 2 s
    // of source in, so the cut lands at source 4 — not at source 3.
    expect(pastedClip).toMatchObject({ startTime: 6, sourceIn: 4, sourceOut: 8, speed: 2, trackId: 'video-1' })

    await first.shutdown()
    const second = await open(root)
    const reopened = clipTimelineRepo.get(second.db, clipId)
    expect(reopened.items).toEqual(saved.items)
    expect(reopened.tracks).toEqual(saved.tracks)
  })

  it('stores a delete and refuses a corrupt timeline', async () => {
    const root = newRoot()
    const ctx = await open(root)
    const projectId = makeProject(ctx, 'Delete')
    const clipId = makeClip(ctx, projectId)
    const backend = createBackend(ctx, null)

    const [asset] = await importProjectAssets(ctx, projectId, [SAMPLE_VIDEO], () => undefined)
    const original: ClipTimeline = {
      tracks,
      items: [
        item(asset.id, { id: 'a', startTime: 0, sourceOut: 2 }),
        item(asset.id, { id: 'b', startTime: 2, sourceOut: 3 }),
        item(asset.id, { id: 'c', startTime: 5, sourceOut: 2 })
      ],
      snapEnabled: true
    }
    const deleted = deleteTimelineItems(original, ['b'])!.timeline
    await backend.invoke('timeline.save', { clipId, timeline: deleted })
    expect(clipTimelineRepo.get(ctx.db, clipId).items.find((entry) => entry.id === 'c')!.startTime).toBe(5)

    // A clip whose source-out is before its source-in would render nothing and
    // is rejected before it can be written.
    const corrupt = { ...deleted, items: [{ ...deleted.items[0], sourceIn: 5, sourceOut: 1 }] }
    await expect(backend.invoke('timeline.save', { clipId, timeline: corrupt })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED'
    })
    expect(clipTimelineRepo.get(ctx.db, clipId).items).toHaveLength(2)
    await ctx.shutdown()
  })

  it('undo and redo restore the saved project state, and a new edit clears redo', async () => {
    const root = newRoot()
    const ctx = await open(root)
    const projectId = makeProject(ctx, 'Undo')
    const clipId = makeClip(ctx, projectId)
    const backend = createBackend(ctx, null)

    const [asset] = await importProjectAssets(ctx, projectId, [SAMPLE_VIDEO], () => undefined)
    const before: ClipTimeline = { tracks, items: [item(asset.id, { id: 'a', startTime: 0, sourceOut: 4 })], snapEnabled: true }
    let history = emptyTimelineCommandHistory()
    const afterCut = cutTimelineItems(before, ['a'])!
    // Cut and paste are discrete commands: two undo steps even though they
    // arrive milliseconds apart.
    history = recordTimelineCommand(history, before, afterCut.timeline, 1, { group: discreteTimelineGroup() })
    const afterPaste = pasteTimelineItems(afterCut.timeline, afterCut.clipboard, { at: 5, newId })!
    history = recordTimelineCommand(history, afterCut.timeline, afterPaste.timeline, 2, { group: discreteTimelineGroup() })
    await backend.invoke('timeline.save', { clipId, timeline: afterPaste.timeline })

    const undone = undoTimelineCommand(history)
    expect(undone.timeline).toEqual(afterCut.timeline)
    await backend.invoke('timeline.save', { clipId, timeline: undone.timeline! })
    expect(clipTimelineRepo.get(ctx.db, clipId).items).toHaveLength(0)

    const redone = redoTimelineCommand(undone.history)
    expect(redone.timeline).toEqual(afterPaste.timeline)

    // Editing after an undo starts a new branch: redo is gone.
    const branched = recordTimelineCommand(undone.history, undone.timeline!, before, 3, { group: discreteTimelineGroup() })
    expect(branched.redo).toHaveLength(0)
    expect(redoTimelineCommand(branched).timeline).toBeNull()
    await ctx.shutdown()
  })
})
