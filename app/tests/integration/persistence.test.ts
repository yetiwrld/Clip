import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppContext } from '../../src/main/services/app-context'
import type { AppContext } from '../../src/main/services/app-context'
import { createBackend } from '../../src/main/ipc/backend'
import { clipTimelineRepo, clipsRepo, projectsRepo, rendersRepo } from '../../src/main/services/database/repositories'
import { AppError } from '../../src/shared/errors'
import { rmTempDir } from '../helpers/context'

/**
 * Data safety: autosave durability, failed writes, restart recovery and undo
 * for deletions. These run against the real database and the real dispatcher,
 * so they exercise the same path the UI uses.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const PROJECT_SETTINGS = { durationPreset: 'medium' as const, maxCandidates: 8 }
const roots: string[] = []
const live: AppContext[] = []

function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-durable-'))
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

function makeProject(ctx: AppContext, name = 'Durable'): string {
  return projectsRepo.create(ctx.db, crypto.randomUUID(), name, PROJECT_SETTINGS).id
}

function makeClip(ctx: AppContext, projectId: string, title = 'clip'): string {
  return clipsRepo.create(ctx.db, {
    id: crypto.randomUUID(), candidateId: null, projectId,
    startTime: 0, endTime: 10, aspectRatio: '9:16', cropMode: 'center', cropX: 0.5, zoom: 1,
    captionStyleId: 'classic', captionOverrides: {}, captionTextEdits: {},
    captionCueSplits: {}, captionCueMerges: {}, captionTimingOffsets: {}, captionCueHidden: [],
    captionCueDuplicates: [], silenceCuts: [], trackingKeyframes: [], cameraKeyframes: [], textLayers: [],
    audioRestoration: 'off', outputResolution: '1080p', outputQuality: 'standard', outputFps: 'source',
    title, description: '', hashtags: [], cta: '', metadataProvider: null, status: 'draft'
  }).id
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(live.splice(0).map((ctx) => ctx.shutdown().catch(() => undefined)))
  for (const root of roots.splice(0)) rmTempDir(root)
})

describe('durable saves', () => {
  it('keeps an edit after a full restart', async () => {
    const root = newRoot()
    const first = await open(root)
    const projectId = makeProject(first)
    const clipId = makeClip(first, projectId)
    const backend = createBackend(first, null)

    await backend.invoke('clips.update', { id: clipId, patch: { title: 'Edited before restart' } })
    await backend.invoke('timeline.save', {
      clipId,
      timeline: { tracks: [], items: [], snapEnabled: false }
    })
    // Nothing is pending: every durable call flushed before it resolved.
    expect(first.db.status().dirty).toBe(false)
    await first.shutdown()

    const second = await open(root)
    expect(clipsRepo.get(second.db, clipId)?.title).toBe('Edited before restart')
    expect(clipTimelineRepo.get(second.db, clipId).snapEnabled).toBe(false)
  })

  it('reports a failed write, keeps the change pending, then retries it', async () => {
    const root = newRoot()
    const ctx = await open(root)
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId)
    const backend = createBackend(ctx, null)

    const write = vi.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(new Error('ENOSPC: no space left on device'))
    const failure = await backend
      .invoke('clips.update', { id: clipId, patch: { title: 'Not on disk yet' } })
      .catch((err: unknown) => err)
    expect(write).toHaveBeenCalled()
    expect(failure).toBeInstanceOf(AppError)
    expect((failure as AppError).code).toBe('STORAGE_WRITE_FAILED')
    expect((failure as AppError).message).toContain('still in memory')
    expect(ctx.db.status().dirty).toBe(true)
    expect(ctx.db.status().lastError).toContain('ENOSPC')

    // The change survived in memory and the failed write did not poison the
    // queue: the next flush writes it.
    write.mockRestore()
    const status = (await backend.invoke('storage.flush', {})) as { dirty: boolean; lastError: string | null }
    expect(status.dirty).toBe(false)
    expect(status.lastError).toBeNull()
    expect(clipsRepo.get(ctx.db, clipId)?.title).toBe('Not on disk yet')

    await ctx.shutdown()
    const reopened = await open(root)
    expect(clipsRepo.get(reopened.db, clipId)?.title).toBe('Not on disk yet')
  })

  it('keeps the newest value when edits arrive in quick succession', async () => {
    const root = newRoot()
    const ctx = await open(root)
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId)
    const backend = createBackend(ctx, null)

    const writes = Array.from({ length: 25 }, (_, index) =>
      backend.invoke('clips.update', { id: clipId, patch: { title: `title ${index}` } })
    )
    await Promise.all(writes)
    expect(clipsRepo.get(ctx.db, clipId)?.title).toBe('title 24')
    await ctx.shutdown()

    const reopened = await open(root)
    expect(clipsRepo.get(reopened.db, clipId)?.title).toBe('title 24')
  })

  it('moves an unreadable database aside instead of refusing to start', async () => {
    const root = newRoot()
    fs.mkdirSync(path.join(root, 'database'), { recursive: true })
    const file = path.join(root, 'database', 'app.db')
    fs.writeFileSync(file, 'this is not a sqlite database')

    const ctx = await open(root)
    expect(ctx.db.status().recoveredFromCorrupt).toBe(true)
    const backups = fs.readdirSync(path.join(root, 'database')).filter((name) => name.includes('.corrupt-'))
    expect(backups).toHaveLength(1)
    expect(fs.readFileSync(path.join(root, 'database', backups[0]), 'utf8')).toBe('this is not a sqlite database')

    // The app is usable with a fresh database.
    expect(makeProject(ctx, 'After recovery')).toBeTruthy()
    expect(projectsRepo.list(ctx.db).map((project) => project.name)).toContain('After recovery')
  })

  it('ignores a leftover temp file from an interrupted write', async () => {
    const root = newRoot()
    const first = await open(root)
    const projectId = makeProject(first, 'Interrupted')
    const clipId = makeClip(first, projectId, 'Original title')
    await first.shutdown()

    const databaseFile = path.join(root, 'database', 'app.db')
    fs.writeFileSync(`${databaseFile}.tmp`, 'half-written bytes that must never be read')

    const second = await open(root)
    // The atomic rename means the real file is still valid and the temp copy
    // is ignored rather than loaded as data.
    expect(projectsRepo.list(second.db).map((project) => project.name)).toEqual(['Interrupted'])
    expect(clipsRepo.get(second.db, clipId)?.title).toBe('Original title')
  })
})

describe('undo for deletion', () => {
  it('restores a deleted clip with its timeline and render records', async () => {
    const root = newRoot()
    const ctx = await open(root)
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId, 'Interview cut')
    clipTimelineRepo.save(ctx.db, clipId, {
      tracks: [{ id: 'track-1', name: 'Video 1', type: 'video', order: 0, muted: false, hidden: false, locked: false }],
      items: [],
      snapEnabled: true
    })
    const renderId = crypto.randomUUID()
    rendersRepo.create(ctx.db, renderId, clipId, projectId, { quality: 'high' })
    rendersRepo.update(ctx.db, renderId, { status: 'completed', outputPath: '/tmp/finished.mp4', progress: 1 })
    const backend = createBackend(ctx, null)

    const snapshot = await backend.invoke('clips.delete', { id: clipId })
    expect(snapshot).toBeTruthy()
    expect(clipsRepo.get(ctx.db, clipId)).toBeNull()
    expect(rendersRepo.list(ctx.db, projectId)).toHaveLength(0)

    await backend.invoke('clips.restore', { snapshot })
    const restored = clipsRepo.get(ctx.db, clipId)
    expect(restored?.title).toBe('Interview cut')
    expect(clipTimelineRepo.get(ctx.db, clipId).tracks.map((track) => track.name)).toEqual(['Video 1'])
    const renders = rendersRepo.list(ctx.db, projectId)
    expect(renders).toHaveLength(1)
    expect(renders[0].status).toBe('completed')
    expect(renders[0].outputPath).toBe('/tmp/finished.mp4')

    await ctx.shutdown()
    const reopened = await open(root)
    expect(clipsRepo.get(reopened.db, clipId)?.title).toBe('Interview cut')
    expect(clipTimelineRepo.get(reopened.db, clipId).tracks).toHaveLength(1)
  })

  it('refuses to restore the same clip twice', async () => {
    const root = newRoot()
    const ctx = await open(root)
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId)
    const backend = createBackend(ctx, null)

    const snapshot = await backend.invoke('clips.delete', { id: clipId })
    await backend.invoke('clips.restore', { snapshot })
    const second = await backend.invoke('clips.restore', { snapshot }).catch((err: unknown) => err)
    expect(second).toBeInstanceOf(AppError)
    expect((second as AppError).code).toBe('CLIP_RESTORE_CONFLICT')
    expect(clipsRepo.listForProject(ctx.db, projectId)).toHaveLength(1)
  })
})
