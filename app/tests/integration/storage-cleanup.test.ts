import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runStorageCleanup, scanStorageCleanup } from '../../src/main/services/storage/cleanup'
import { tasksRepo } from '../../src/main/services/database/repositories'
import { makeTestContext } from '../helpers/context'
import type { AppContext } from '../../src/main/services/app-context'
import type { StorageCleanupCategoryId } from '../../src/shared/types'

const contexts: Array<{ ctx: AppContext; cleanup: () => Promise<void> }> = []
const OLD = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)

async function context() {
  const instance = await makeTestContext()
  contexts.push(instance)
  return instance.ctx
}

function writeFile(filePath: string, size = 8): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Buffer.alloc(size, 1))
}

function ageFile(filePath: string, time = OLD): void {
  fs.utimesSync(filePath, time, time)
}

function category(report: ReturnType<typeof scanStorageCleanup>, id: StorageCleanupCategoryId) {
  return report.categories.find((entry) => entry.id === id)!
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((instance) => instance.cleanup()))
})

describe('storage cleanup center service', () => {
  it('scans and removes only selected regenerable files while preserving user data', async () => {
    const ctx = await context()
    const projectId = '12345678-1234-4234-8234-123456789abc'
    const projectDir = ctx.projectDir(projectId)
    const renderId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const assetId = '87654321-4321-4321-8321-cba987654321'

    const proxy = path.join(projectDir, 'source', 'proxy.mp4')
    const sourceMedia = path.join(projectDir, 'source', 'camera-original.mp4')
    const filmstripFrame = path.join(projectDir, 'thumbnails', 'filmstrip', 'f000.jpg')
    const filmstripMeta = path.join(projectDir, 'thumbnails', 'filmstrip', 'meta.json')
    const waveform = path.join(projectDir, 'thumbnails', 'waveform.json')
    const abandonedWaveform = path.join(projectDir, 'thumbnails', `waveform-${assetId}.raw`)
    const extractedAudio = path.join(projectDir, 'cache', 'audio-for-transcription.m4a')
    const temporaryRender = path.join(projectDir, 'renders', `${renderId}.tmp.mp4`)
    const finalRender = path.join(projectDir, 'renders', `${renderId}.mp4`)
    const importedAsset = path.join(projectDir, 'assets', 'overlay.mp4')
    const transcript = path.join(projectDir, 'transcription', 'transcript.json')
    const exportedVideo = path.join(ctx.paths.exportsDir, 'final-export.mp4')
    const oldLog = path.join(ctx.paths.logsDir, 'app-old.log')
    const recentLog = path.join(ctx.paths.logsDir, 'app-recent.log')
    const diagnosticExport = path.join(ctx.paths.logsDir, 'diagnostics-old.json')

    writeFile(proxy, 100)
    writeFile(sourceMedia, 200)
    writeFile(filmstripFrame, 30)
    writeFile(filmstripMeta, 20)
    writeFile(waveform, 40)
    writeFile(abandonedWaveform, 50)
    writeFile(extractedAudio, 60)
    writeFile(temporaryRender, 70)
    writeFile(finalRender, 80)
    writeFile(importedAsset, 90)
    writeFile(transcript, 100)
    writeFile(exportedVideo, 110)
    writeFile(oldLog, 120)
    writeFile(recentLog, 130)
    writeFile(diagnosticExport, 140)
    for (const filePath of [abandonedWaveform, temporaryRender, oldLog]) ageFile(filePath)

    const report = scanStorageCleanup(ctx)
    expect(category(report, 'preview-proxies')).toMatchObject({ fileCount: 1, bytes: 100 })
    expect(category(report, 'preview-proxies').examples).toEqual([`projects/${projectId}/source/proxy.mp4`])
    expect(category(report, 'filmstrips')).toMatchObject({ fileCount: 2, bytes: 50 })
    expect(category(report, 'waveforms')).toMatchObject({ fileCount: 2, bytes: 90 })
    expect(category(report, 'transcription-audio')).toMatchObject({ fileCount: 1, bytes: 60 })
    expect(category(report, 'stale-temporary-files')).toMatchObject({ fileCount: 1, bytes: 70 })
    expect(category(report, 'old-logs')).toMatchObject({ fileCount: 1, bytes: 120 })

    const result = runStorageCleanup(ctx, [
      'preview-proxies', 'filmstrips', 'waveforms', 'transcription-audio', 'stale-temporary-files', 'old-logs'
    ], report.scanToken)
    expect(result.removedFiles).toBe(8)
    expect(result.removedBytes).toBe(490)
    expect(result.skippedFiles).toBe(0)

    for (const filePath of [proxy, filmstripFrame, filmstripMeta, waveform, abandonedWaveform, extractedAudio, temporaryRender, oldLog]) {
      expect(fs.existsSync(filePath), `${filePath} should be removed`).toBe(false)
    }
    for (const filePath of [sourceMedia, finalRender, importedAsset, transcript, exportedVideo, recentLog, diagnosticExport]) {
      expect(fs.existsSync(filePath), `${filePath} must be preserved`).toBe(true)
    }
    expect(result.report.reclaimableBytes).toBe(0)
  })

  it('aborts instead of deleting a cache set that changed after the user reviewed it', async () => {
    const ctx = await context()
    const projectId = '33333333-4444-4555-8666-777777777777'
    const projectDir = ctx.projectDir(projectId)
    const proxy = path.join(projectDir, 'source', 'proxy.mp4')
    writeFile(proxy, 64)
    const reviewed = scanStorageCleanup(ctx)

    // A cache appears after the review screen was populated. Cleanup must not
    // silently broaden the user's approval to this new candidate set.
    writeFile(path.join(projectDir, 'thumbnails', 'waveform.json'), 32)
    let caught: unknown
    try {
      runStorageCleanup(ctx, ['preview-proxies'], reviewed.scanToken)
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({ code: 'STORAGE_SCAN_STALE' })
    expect(fs.existsSync(proxy)).toBe(true)
  })

  it('leaves every project cache untouched while that project has a queued or running task', async () => {
    const ctx = await context()
    const projectId = '11111111-2222-4333-8444-555555555555'
    const proxy = path.join(ctx.projectDir(projectId), 'source', 'proxy.mp4')
    writeFile(proxy, 64)

    const taskId = '99999999-aaaa-4bbb-8ccc-dddddddddddd'
    tasksRepo.create(ctx.db, { id: taskId, type: 'proxy', projectId })
    tasksRepo.update(ctx.db, taskId, { state: 'running' })

    const report = scanStorageCleanup(ctx)
    expect(report.skippedActiveProjects).toBe(1)
    expect(category(report, 'preview-proxies')).toMatchObject({ fileCount: 0, bytes: 0 })
    expect(runStorageCleanup(ctx, ['preview-proxies'], report.scanToken)).toMatchObject({ removedFiles: 0, removedBytes: 0, skippedActiveProjects: 1 })
    expect(fs.existsSync(proxy)).toBe(true)

    tasksRepo.update(ctx.db, taskId, { state: 'completed' })
    expect(category(scanStorageCleanup(ctx), 'preview-proxies')).toMatchObject({ fileCount: 1, bytes: 64 })
  })

  it('rejects symlinked project cache folders instead of following them outside the project', async () => {
    const ctx = await context()
    const projectId = '22222222-3333-4444-8555-666666666666'
    const projectDir = ctx.projectDir(projectId)
    const outsideDir = path.join(ctx.workspaceRoot, 'outside-cache-target')
    const externalProxy = path.join(outsideDir, 'proxy.mp4')
    fs.mkdirSync(projectDir, { recursive: true })
    writeFile(externalProxy, 32)
    fs.mkdirSync(path.dirname(path.join(projectDir, 'source', 'placeholder')), { recursive: true })

    try {
      fs.rmSync(path.join(projectDir, 'source'), { recursive: true, force: true })
      fs.symlinkSync(outsideDir, path.join(projectDir, 'source'), process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      // Some Windows runners disallow creating junctions; the other tests still cover safe cleanup.
      return
    }

    const report = scanStorageCleanup(ctx)
    expect(category(report, 'preview-proxies').fileCount).toBe(0)
    runStorageCleanup(ctx, ['preview-proxies'], report.scanToken)
    expect(fs.existsSync(externalProxy)).toBe(true)
  })
})
