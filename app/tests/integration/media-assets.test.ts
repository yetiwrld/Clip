import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeTestContext, SAMPLE_VIDEO, SILENCE_VIDEO } from '../helpers/context'
import { clipsRepo, projectsRepo, assetsRepo, clipTimelineRepo, rendersRepo } from '../../src/main/services/database/repositories'
import { importProjectAssets, relinkProjectAsset, removeProjectAsset, saveClipTimeline } from '../../src/main/services/media/assets'
import { createProject, importMediaFile } from '../../src/main/services/projects'
import { RenderQueue } from '../../src/main/services/rendering/queue'

let cleanup: (() => Promise<void>) | null = null
afterEach(async () => { vi.restoreAllMocks(); if (cleanup) await cleanup(); cleanup = null })

describe('project media library and clip timeline', () => {
  it('imports readable video into project storage and preserves metadata', async () => {
    const { ctx, cleanup: dispose } = await makeTestContext()
    cleanup = dispose
    const project = projectsRepo.create(ctx.db, crypto.randomUUID(), 'Media Test', { durationPreset: 'medium', maxCandidates: 8 })
    const report = () => undefined
    const [asset] = await importProjectAssets(ctx, project.id, [SAMPLE_VIDEO], report)

    expect(asset.mediaType).toBe('video')
    expect(asset.path).toContain(ctx.projectDir(project.id))
    expect(asset.duration).toBeGreaterThan(0)
    expect(asset.missing).toBe(false)
    expect(assetsRepo.list(ctx.db, project.id).map((row) => row.id)).toContain(asset.id)
  })

  it('preserves the old media copy when a relink loses its asset row', async () => {
    const { ctx, cleanup: dispose } = await makeTestContext()
    cleanup = dispose
    const project = projectsRepo.create(ctx.db, crypto.randomUUID(), 'Relink Test', { durationPreset: 'medium', maxCandidates: 8 })
    const [asset] = await importProjectAssets(ctx, project.id, [SAMPLE_VIDEO], () => undefined)
    const replacement = path.join(os.tmpdir(), `clipwright-relink-${crypto.randomUUID()}.mp4`)
    fs.copyFileSync(SAMPLE_VIDEO, replacement)
    vi.spyOn(assetsRepo, 'updateMedia').mockReturnValueOnce(null)

    try {
      await expect(relinkProjectAsset(ctx, asset.id, replacement)).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' })
      expect(fs.existsSync(asset.path)).toBe(true)
      expect(assetsRepo.get(ctx.db, asset.id)?.path).toBe(asset.path)
      expect(fs.readdirSync(path.join(ctx.projectDir(project.id), 'assets'))).toEqual([path.basename(asset.path)])
    } finally {
      fs.rmSync(replacement, { force: true })
    }
  })

  it('persists timeline items and prevents deleting assets still in use', async () => {
    const { ctx, cleanup: dispose } = await makeTestContext()
    cleanup = dispose
    const project = projectsRepo.create(ctx.db, crypto.randomUUID(), 'Timeline Test', { durationPreset: 'medium', maxCandidates: 8 })
    const clip = clipsRepo.create(ctx.db, {
      id: crypto.randomUUID(), candidateId: null, projectId: project.id,
      startTime: 0, endTime: 10, aspectRatio: '9:16', cropMode: 'center', cropX: 0.5, zoom: 1,
      captionStyleId: 'none', captionOverrides: {}, captionTextEdits: {}, captionCueSplits: {}, captionCueMerges: {},
      captionTimingOffsets: {}, captionCueHidden: [], captionCueDuplicates: [], silenceCuts: [], trackingKeyframes: [],
      cameraKeyframes: [], textLayers: [], audioRestoration: 'off', outputResolution: '1080p', outputQuality: 'standard', outputFps: 'source',
      title: 'Timeline test', description: '', hashtags: [], cta: '', metadataProvider: null, status: 'draft'
    })
    const [asset] = await importProjectAssets(ctx, project.id, [SAMPLE_VIDEO], () => undefined)
    const track = { id: crypto.randomUUID(), name: 'Video 2', type: 'video' as const, order: 0, muted: false, hidden: false, locked: false }
    const timeline = {
      tracks: [track], snapEnabled: true,
      items: [{ id: crypto.randomUUID(), assetId: asset.id, trackId: track.id, startTime: 1, sourceIn: 0, sourceOut: Math.min(asset.duration ?? 1, 2), volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }]
    }
    saveClipTimeline(ctx, clip.id, timeline)
    expect(clipTimelineRepo.get(ctx.db, clip.id)).toEqual(timeline)
    expect(() => removeProjectAsset(ctx, asset.id)).toThrow(/used on a clip timeline/i)

    // The asset id appearing in a track id is not a reference to the asset.
    // This used to false-positive because removal queried document LIKE '%id%'.
    saveClipTimeline(ctx, clip.id, {
      tracks: [{ ...track, id: `track-${asset.id}` }],
      items: [], snapEnabled: true
    })
    expect(() => removeProjectAsset(ctx, asset.id)).not.toThrow()
    expect(assetsRepo.get(ctx.db, asset.id)).toBeNull()
  })

  it('renders timeline images and layered audio with timestamps remapped across silence cuts', async () => {
    const { ctx, cleanup: dispose } = await makeTestContext()
    cleanup = dispose
    const project = createProject(ctx, 'Timeline Render Test')
    await importMediaFile(ctx, project.id, SILENCE_VIDEO)
    const ffmpeg = (require('@ffmpeg-installer/ffmpeg') as { path: string }).path
    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-layer-fixture-'))
    const imagePath = path.join(mediaDir, 'overlay.png')
    const audioPath = path.join(mediaDir, 'music.wav')
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=96x96:d=1', '-frames:v', '1', imagePath], { windowsHide: true })
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=4', '-c:a', 'pcm_s16le', audioPath], { windowsHide: true })
    const [image, audio, video] = await importProjectAssets(ctx, project.id, [imagePath, audioPath, SILENCE_VIDEO], () => undefined)
    fs.rmSync(mediaDir, { recursive: true, force: true })

    const clip = clipsRepo.create(ctx.db, {
      id: crypto.randomUUID(), candidateId: null, projectId: project.id,
      startTime: 0, endTime: 4.5, aspectRatio: '16:9', cropMode: 'center', cropX: 0.5, zoom: 1,
      captionStyleId: 'none', captionOverrides: {}, captionTextEdits: {}, captionCueSplits: {}, captionCueMerges: {},
      captionTimingOffsets: {}, captionCueHidden: [], captionCueDuplicates: [], silenceCuts: [{ start: 1.5, end: 2 }],
      trackingKeyframes: [], cameraKeyframes: [], textLayers: [], audioRestoration: 'off', outputResolution: '720p', outputQuality: 'standard',
      outputFps: 'source', title: 'Layer render', description: '', hashtags: [], cta: '', metadataProvider: null, status: 'draft'
    })
    const audioTrack = { id: crypto.randomUUID(), name: 'Music', type: 'audio' as const, order: 0, muted: false, hidden: false, locked: false }
    const audioTrack2 = { id: crypto.randomUUID(), name: 'Sound effects', type: 'audio' as const, order: 1, muted: false, hidden: false, locked: false }
    const imageTrack = { id: crypto.randomUUID(), name: 'Overlay', type: 'image' as const, order: 2, muted: false, hidden: false, locked: false }
    const videoTrack = { id: crypto.randomUUID(), name: 'B-roll', type: 'video' as const, order: 3, muted: false, hidden: false, locked: false }
    saveClipTimeline(ctx, clip.id, {
      tracks: [audioTrack, audioTrack2, imageTrack, videoTrack], snapEnabled: true,
      items: [
        { id: crypto.randomUUID(), assetId: audio.id, trackId: audioTrack.id, startTime: 0.5, sourceIn: 0, sourceOut: 4, volume: 0.3, muted: false, fadeIn: 0.2, fadeOut: 0.3, speed: 1, loop: false, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        { id: crypto.randomUUID(), assetId: audio.id, trackId: audioTrack2.id, startTime: 1.25, sourceIn: 0.5, sourceOut: 3.5, volume: 0.15, muted: false, fadeIn: 0, fadeOut: 0.25, speed: 1.1, loop: false, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        { id: crypto.randomUUID(), assetId: image.id, trackId: imageTrack.id, startTime: 0.25, sourceIn: 0, sourceOut: 3, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false, x: 0, y: 0, scale: 0.4, rotation: 8, opacity: 0.9 },
        { id: crypto.randomUUID(), assetId: video.id, trackId: videoTrack.id, startTime: 0.6, sourceIn: 0, sourceOut: 2.5, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false, x: 0.2, y: -0.15, scale: 0.3, rotation: 0, opacity: 1 }
      ]
    })

    const queue = new RenderQueue(ctx)
    const renderId = await queue.queueRender(clip.id, true)
    const timeout = Date.now() + 120_000
    while (Date.now() < timeout) {
      const render = rendersRepo.get(ctx.db, renderId)
      if (render?.status === 'completed') {
        expect(render.outputPath).toBeTruthy()
        const probe = JSON.parse(execFileSync((require('@ffprobe-installer/ffprobe') as { path: string }).path,
          ['-v', 'error', '-show_entries', 'stream=codec_type', '-show_entries', 'format=duration', '-of', 'json', render.outputPath!], { encoding: 'utf8', windowsHide: true })) as { streams: Array<{ codec_type: string }>; format: { duration: string } }
        expect(probe.streams.some((stream) => stream.codec_type === 'video')).toBe(true)
        expect(probe.streams.some((stream) => stream.codec_type === 'audio')).toBe(true)
        expect(Number(probe.format.duration)).toBeGreaterThan(3.5)
        expect(Number(probe.format.duration)).toBeLessThan(4.5)

        // The timeline still image begins at source time 0.25s. At output
        // t=0.75s, this pixel lies inside its rotated red image but outside the
        // later video overlay. Before the image PTS shift fix, eof_action=pass
        // left this pixel as the blue testsrc background.
        const frame = execFileSync(ffmpeg, [
          '-hide_banner', '-loglevel', 'error', '-ss', '0.75', '-i', render.outputPath!,
          '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos,format=rgb24',
          '-f', 'rawvideo', 'pipe:1'
        ], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
        const pixelOffset = (360 * 1280 + 512) * 3
        const [red, green, blue] = frame.subarray(pixelOffset, pixelOffset + 3)
        expect(red).toBeGreaterThan(150)
        expect(red).toBeGreaterThan(blue * 2)
        expect(red).toBeGreaterThan(green * 2)
        return
      }
      if (render?.status === 'failed') throw new Error(`Layer render failed: ${JSON.stringify(render.error)}`)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('Layer render timed out')
  }, 150_000)
})
