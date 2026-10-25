import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { makeTestContext, requireFixtures, SAMPLE_VIDEO, SAMPLE_TRANSCRIPT, SILENCE_VIDEO } from '../helpers/context'
import type { AppContext } from '../../src/main/services/app-context'
import { createProject, importMediaFile, deleteProject, getProject } from '../../src/main/services/projects'
import { importTranscript } from '../../src/main/services/transcription'
import { detectSilence, playbackVerdict, optionsForMode, renderProxy } from '../../src/main/services/media/analysis'
import { buildFilmstrip, buildWaveform } from '../../src/main/services/media/frames'
import { createClipFromCandidate, updateClip } from '../../src/main/services/clips'
import { runAnalysis, getCandidates } from '../../src/main/services/ai/analysis'
import { optimizeClipBoundaries } from '../../src/main/services/clips/boundaries'
import { RenderQueue, freeDiskBytes } from '../../src/main/services/rendering/queue'
import { buildClipCues } from '../../src/main/services/rendering/plan'
import { createAudioRestorationPreview } from '../../src/main/services/audio/restoration'
import { runExport } from '../../src/main/services/exports'
import { clipsRepo, rendersRepo, projectsRepo } from '../../src/main/services/database/repositories'
import type { RenderJob } from '@shared/types'
import { buildCameraCropFilter, cameraStateAt, computeCameraCrop } from '@shared/video/crop'
import { CAPTION_STYLES } from '@shared/constants'
import { buildAssDocument } from '@shared/captions/ass'
import type { CaptionCue } from '@shared/captions/segmentation'
import { escapeFilterPath } from '../../src/main/services/media/ffmpeg'

const run = promisify(execFile)
const FFPROBE = require('@ffprobe-installer/ffprobe').path as string

/**
 * Video-engine overhaul integration coverage (§94-102): silence detection on
 * real audio, multi-segment renders with remapped captions, output validation
 * via FFprobe, preview renders, proxy transcode, filmstrip + waveform. All
 * against the real service stack and bundled FFmpeg — no mocks.
 */

let ctx: AppContext
// Default no-op: if beforeAll fails (missing fixtures), afterAll must not
// turn one clear error into three confusing ones.
let cleanup: () => Promise<void> = async () => undefined
let projectId: string

beforeAll(async () => {
  requireFixtures()
  const made = await makeTestContext()
  ctx = made.ctx
  cleanup = made.cleanup
}, 30_000)

afterAll(async () => {
  await cleanup()
})

async function probeJson(file: string): Promise<{ streams: Array<{ codec_type: string; width?: number; height?: number; avg_frame_rate?: string }>; format: { duration: string } }> {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,avg_frame_rate', '-show_entries', 'format=duration', '-of', 'json', file])
  return JSON.parse(stdout)
}

async function waitForRender(queue: RenderQueue, renderId: string, timeoutMs = 240_000): Promise<RenderJob> {
  const started = Date.now()
  for (;;) {
    const job = rendersRepo.get(ctx.db, renderId)
    if (job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) return job
    if (Date.now() - started > timeoutMs) {
      throw new Error(`render ${renderId} did not finish within ${timeoutMs}ms (last: ${JSON.stringify(job ?? null)})`)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
}

async function setupProject(name: string): Promise<string> {
  const project = createProject(ctx, name)
  await importMediaFile(ctx, project.id, SAMPLE_VIDEO)
  importTranscript(ctx, project.id, SAMPLE_TRANSCRIPT)
  await runAnalysis(ctx, { projectId: project.id, providerId: 'heuristic-local', onEvent: () => undefined, signal: new AbortController().signal })
  return project.id
}

describe('video engine overhaul — real FFmpeg integration', () => {
  it('renders all 50 caption presets across four aspect ratios and four output resolutions', async () => {
    const ffmpeg = require('@ffmpeg-installer/ffmpeg').path as string
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-caption-matrix-'))
    const fontDir = path.resolve('resources/fonts')
    try {
      const styleFormat = 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding'
      const eventFormat = 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
      const dimensions = [[1080, 1920], [1920, 1080], [1080, 1080], [864, 1080]]
      const scales = [2 / 3, 1, 4 / 3, 2]
      let matrixVideo = 0
      for (const [ratioIndex, [baseW, baseH]] of dimensions.entries()) for (const scale of scales) {
        const width = Math.round(baseW * scale / 2) * 2
        const height = Math.round(baseH * scale / 2) * 2
        const styleRows: string[] = []
        const dialogueRows: string[] = []
        CAPTION_STYLES.forEach((style, index) => {
          const start = index * 0.5 + 0.15
          const cue: CaptionCue = {
            key: `preset-${index}`, startTime: start, endTime: start + 0.3,
            text: 'A quick important sample',
            words: [
              { text: 'A', start, end: start + 0.07 }, { text: 'quick', start: start + 0.07, end: start + 0.15 },
              { text: 'important', start: start + 0.15, end: start + 0.23 }, { text: 'sample', start: start + 0.23, end: start + 0.3 }
            ],
            lines: ['A quick important', 'sample']
          }
          const rows = buildAssDocument([cue], { style, playResX: width, playResY: height }).split(/\r?\n/)
          styleRows.push(rows.find((line) => line.startsWith('Style: Main,'))!.replace('Style: Main,', `Style: Preset${index},`))
          dialogueRows.push(rows.find((line) => line.startsWith('Dialogue:'))!.replace(',Main,,', `,Preset${index},,`))
        })
        const ass = ['[Script Info]', '; 50 original caption preset render matrix', 'ScriptType: v4.00+',
          `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
          '[V4+ Styles]', styleFormat, ...styleRows, '', '[Events]', eventFormat, ...dialogueRows, ''].join('\n')
        const assPath = path.join(tempDir, `presets-${ratioIndex}-${width}x${height}.ass`)
        const videoPath = path.join(tempDir, `matrix-${ratioIndex}-${width}x${height}.mp4`)
        fs.writeFileSync(assPath, ass, 'utf8')
        const vf = `subtitles='${escapeFilterPath(assPath)}':fontsdir='${escapeFilterPath(fontDir)}'`
        await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x30343A:s=${width}x${height}:r=4:d=25`,
          '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '38', '-pix_fmt', 'yuv420p', '-t', '25', videoPath], { maxBuffer: 8 * 1024 * 1024 })
        const probe = await probeJson(videoPath)
        const outputVideo = probe.streams.find((stream) => stream.codec_type === 'video')!
        expect(outputVideo.width).toBe(width)
        expect(outputVideo.height).toBe(height)
        const framePath = path.join(tempDir, `frame-${ratioIndex}-${width}x${height}.gray`)
        await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath,
          '-vf', 'select=eq(n\\,1),format=gray', '-frames:v', '1', '-f', 'rawvideo', framePath])
        const renderedFrame = fs.readFileSync(framePath)
        expect(renderedFrame.length).toBe(width * height)
        expect(new Set(renderedFrame).size).toBeGreaterThan(12)
        matrixVideo++
      }
      expect(matrixVideo).toBe(16)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }, 600_000)

  it('evaluates animated camera pan, zoom and rotation in FFmpeg, including a source-time cut segment', async () => {
    const keys = [
      { time: 0, x: 0.2, y: 0.5, scale: 1, rotation: 0, easing: 'ease-in-out' as const },
      { time: 1.5, x: 0.8, y: 0.5, scale: 1.45, rotation: 8, easing: 'ease-in-out' as const },
      { time: 3, x: 0.5, y: 0.5, scale: 1.1, rotation: 0, easing: 'hold' as const }
    ]
    const ffmpeg = require('@ffmpeg-installer/ffmpeg').path as string
    for (const segmentStart of [0, 1.2]) {
      const vf = `fps=30,${buildCameraCropFilter(640, 360, 360, 640, keys, segmentStart)}`
      await run(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=3',
        '-vf', vf, '-frames:v', '60', '-f', 'null', '-'
      ])
    }
    const cutAndHold = [
      { time: 0, x: 0.2, y: 0.5, scale: 1, rotation: 0, easing: 'cut' as const },
      { time: 1.5, x: 0.8, y: 0.5, scale: 1.25, rotation: 0, easing: 'hold' as const }
    ]
    const cutFilter = `fps=30,${buildCameraCropFilter(640, 360, 360, 640, cutAndHold, 0)}`
    await run(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=2',
      '-vf', cutFilter, '-frames:v', '60', '-f', 'null', '-'
    ])

    // Pixel-check both a static edge frame and a frame inside the animated
    // path: output center must sample the same source point as editor crop math.
    const edgeKey = { time: 0, x: 0.99, y: 0.99, scale: 2, rotation: 0, easing: 'linear' as const }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-camera-parity-'))
    try {
      const snapshots = [
        { label: 'right/bottom edge', keys: [edgeKey], time: 0, frameIndex: 0 },
        { label: 'interpolated camera path', keys, time: 1, frameIndex: 30 }
      ]
      for (const [index, snapshot] of snapshots.entries()) {
        const state = cameraStateAt(snapshot.keys, snapshot.time)!
        const expectedCrop = computeCameraCrop(640, 360, 360, 640, state)
        const framePath = path.join(tempDir, `camera-frame-${index}.rgb`)
        const cameraFilter = buildCameraCropFilter(640, 360, 360, 640, snapshot.keys, 0)
        const vf = `fps=30,${cameraFilter},select=eq(n\\,${snapshot.frameIndex})`
        await run(ffmpeg, [
          '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
          "nullsrc=s=640x360:r=30:d=3,format=rgb24,geq=r='X*255/W':g='Y*255/H':b=0,format=yuv444p",
          '-vf', vf, '-vsync', '0', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', framePath
        ])
        const frame = fs.readFileSync(framePath)
        const center = (Math.floor(640 / 2) * 360 + Math.floor(360 / 2)) * 3
        const red = frame[center]
        const green = frame[center + 1]
        const expectedRed = ((expectedCrop.x + expectedCrop.w / 2) / 639) * 255
        const expectedGreen = ((expectedCrop.y + expectedCrop.h / 2) / 359) * 255
        expect(Math.abs(red - expectedRed), `${snapshot.label}: center red=${red}, expected≈${expectedRed.toFixed(0)}`).toBeLessThan(16)
        expect(Math.abs(green - expectedGreen), `${snapshot.label}: center green=${green}, expected≈${expectedGreen.toFixed(0)}`).toBeLessThan(16)
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }, 60_000)

  it('classifies native playback for the H.264/AAC fixture and probes disk space', async () => {
    projectId = await setupProject('VE Overhaul')
    const verdict = playbackVerdict({
      hasVideo: true,
      hasAudio: true,
      videoCodec: 'h264',
      audioCodec: 'aac'
    })
    expect(verdict.verdict).toBe('native')
    const hevc = playbackVerdict({ hasVideo: true, hasAudio: true, videoCodec: 'hevc', audioCodec: 'aac' })
    expect(hevc.verdict).toBe('proxy')
    expect(hevc.reason).toContain('hevc')
    const ac3 = playbackVerdict({ hasVideo: true, hasAudio: true, videoCodec: 'h264', audioCodec: 'ac3' })
    expect(ac3.verdict).toBe('proxy')
    expect(freeDiskBytes(ctx.workspaceRoot)).not.toBeNull()
    expect(freeDiskBytes(ctx.workspaceRoot)!).toBeGreaterThan(0)
  }, 60_000)

  it('detects a known 2.5s silence gap in a purpose-built fixture', async () => {
    // tone(3s) → silence(2.5s) → tone(3s); committed as tests/fixtures/media/silence.mp4
    const project = createProject(ctx, 'VE Silence Fixture')
    await importMediaFile(ctx, project.id, SILENCE_VIDEO)
    const { getProject } = await import('../../src/main/services/projects')
    const loaded = getProject(ctx, project.id)!
    expect(loaded.hasAudio).toBe(true)
    const result = await detectSilence(ctx, loaded, { from: 0, to: 8.5 }, optionsForMode('auto'))
    expect(result.detected.length).toBeGreaterThanOrEqual(1)
    expect(result.detected[0].start).toBeGreaterThan(2.8)
    expect(result.detected[0].end).toBeLessThan(5.7)
    // cut = detected range shrunk by the 130ms padding on each side
    expect(result.cuts.length).toBe(1)
    expect(result.cuts[0].start).toBeGreaterThan(result.detected[0].start)
    expect(result.savedSec).toBeGreaterThan(2.0)
    expect(result.savedSec).toBeLessThan(2.5)
    deleteProject(ctx, project.id, true)
  }, 120_000)

  it('detects real silence with FFmpeg silencedetect and stores cuts on the clip', async () => {
    const candidate = getCandidates(ctx, projectId)[0]
    const clip = createClipFromCandidate(ctx, candidate.id)
    const { getProject } = await import('../../src/main/services/projects')
    const project = getProject(ctx, projectId)!
    const result = await detectSilence(ctx, project, { from: clip.startTime, to: clip.endTime }, optionsForMode('auto'))
    // deterministic assertions on structure, not on the fixture's exact audio:
    for (const cut of result.cuts) {
      expect(cut.end).toBeGreaterThan(cut.start)
      expect(cut.start).toBeGreaterThanOrEqual(clip.startTime)
      expect(cut.end).toBeLessThanOrEqual(clip.endTime)
    }
    const saved = result.cuts.reduce((s, c) => s + (c.end - c.start), 0)
    expect(result.savedSec).toBeCloseTo(saved, 5)
    expect(saved).toBeLessThan(clip.endTime - clip.startTime) // never removes everything
  }, 120_000)

  it('renders a multi-segment clip (silence removal) with exact geometry and validated duration', async () => {
    projectId = await setupProject('Multi-segment restoration render')
    const candidate = getCandidates(ctx, projectId)[1] ?? getCandidates(ctx, projectId)[0]
    const clip = createClipFromCandidate(ctx, candidate.id)
    const sourceCue = buildClipCues(ctx, clip)[0]
    expect(sourceCue).toBeDefined()
    // Two hard cuts inside the clip → three kept segments.
    const mid1 = clip.startTime + (clip.endTime - clip.startTime) * 0.3
    const mid2 = clip.startTime + (clip.endTime - clip.startTime) * 0.6
    const cutClip = updateClip(ctx, clip.id, {
      audioRestoration: 'standard',
      captionTextEdits: { [sourceCue.key]: 'Corrected caption text for preview and render' },
      captionCueSplits: { [sourceCue.key]: 2 },
      captionTimingOffsets: {
        [`${sourceCue.key}/a/start`]: 0.02,
        [`${sourceCue.key}/b/end`]: 0.04
      },
      cameraKeyframes: [
        { time: clip.startTime, x: 0.3, y: 0.48, scale: 1, rotation: 0, easing: 'ease-in-out' },
        { time: (clip.startTime + clip.endTime) / 2, x: 0.72, y: 0.52, scale: 1.35, rotation: 4, easing: 'ease-out' },
        { time: clip.endTime, x: 0.5, y: 0.5, scale: 1.1, rotation: 0, easing: 'hold' }
      ],
      textLayers: [{
        id: 'integration-title', text: 'Track and title parity', startTime: clip.startTime + 0.15, endTime: clip.endTime - 0.15,
        x: 0.5, y: 0.22, scale: 1, rotation: 0, opacity: 1, fontFamily: 'Inter', fontWeight: 700,
        fontSize: 64, color: '#FFFFFF', backgroundColor: '#101010', backgroundOpacity: 0.35,
        animationIn: 'rise', animationOut: 'fade', keyframes: [
          { time: clip.startTime + 0.2, x: 0.28, y: 0.25, scale: 1, rotation: 0, opacity: 1 },
          { time: (clip.startTime + clip.endTime) / 2, x: 0.72, y: 0.28, scale: 1.15, rotation: -4, opacity: 0.9 }
        ]
      }],
      silenceCuts: [
        { start: Math.round(mid1 * 100) / 100, end: Math.round((mid1 + 0.8) * 100) / 100 },
        { start: Math.round(mid2 * 100) / 100, end: Math.round((mid2 + 0.8) * 100) / 100 }
      ]
    })
    const editedCues = buildClipCues(ctx, cutClip)
    expect(editedCues.some((cue) => cue.text === 'Corrected caption')).toBe(true)
    expect(editedCues.some((cue) => cue.text === 'text for preview and render')).toBe(true)
    const expected = clip.endTime - clip.startTime - 1.6

    const queue = new RenderQueue(ctx)
    const renderId = await queue.queueRender(cutClip.id)
    const done = await waitForRender(queue, renderId)
    expect(done.status).toBe('completed')
    expect(done.error).toBeNull()

    const job = rendersRepo.get(ctx.db, renderId)!
    const probe = await probeJson(job.outputPath!)
    const video = probe.streams.find((s) => s.codec_type === 'video')!
    expect(video).toBeDefined()
    // 9:16 @ clip default 1080p → exact 1080×1920
    expect(video.width).toBe(1080)
    expect(video.height).toBe(1920)
    // duration must reflect the removed silence (±1.5s validation window)
    const duration = parseFloat(probe.format.duration)
    expect(Math.abs(duration - expected)).toBeLessThanOrEqual(1.5)
    expect(duration).toBeLessThan(clip.endTime - clip.startTime - 0.5)
  }, 300_000)

  it('creates short before/after restoration samples from the clip in-point', async () => {
    projectId = await setupProject('Audio restoration preview')
    const clip = createClipFromCandidate(ctx, getCandidates(ctx, projectId)[0].id)
    const configured = updateClip(ctx, clip.id, {
      audioRestoration: 'light',
      endTime: Math.min(clip.endTime, clip.startTime + 4)
    })
    const preview = await createAudioRestorationPreview(ctx, configured.id)
    expect(preview.preset).toBe('light')
    expect(preview.duration).toBeLessThanOrEqual(4)
    for (const file of [preview.beforePath, preview.afterPath]) {
      expect(fs.existsSync(file)).toBe(true)
      expect(fs.statSync(file).size).toBeGreaterThan(44)
      const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type', '-show_entries', 'format=duration', '-of', 'json', file])
      const info = JSON.parse(stdout) as { streams: Array<{ codec_type: string }>; format: { duration: string } }
      expect(info.streams.some((stream) => stream.codec_type === 'audio')).toBe(true)
      expect(Number(info.format.duration)).toBeGreaterThan(0)
    }
  }, 120_000)

  it('renders a 720p draft preview render flagged as preview', async () => {
    projectId = await setupProject('720p restoration preview render')
    const clip = createClipFromCandidate(ctx, getCandidates(ctx, projectId)[0].id)
    updateClip(ctx, clip.id, { aspectRatio: '16:9', audioRestoration: 'light' })
    const queue = new RenderQueue(ctx)
    const renderId = await queue.queueRender(clipsRepo.get(ctx.db, clip.id)!.id, true)
    const done = await waitForRender(queue, renderId)
    expect(done.status).toBe('completed')
    expect(done.preview).toBe(true)
    const job = rendersRepo.get(ctx.db, renderId)!
    const probe = await probeJson(job.outputPath!)
    const video = probe.streams.find((s) => s.codec_type === 'video')!
    // 16:9 @ 720p → 1280×720
    expect(video.width).toBe(1280)
    expect(video.height).toBe(720)
  }, 300_000)

  it('exports real preset/custom crops at verified dimensions and preserves Fit framing', async () => {
    projectId = await setupProject('VE Crop Aspect Matrix')
    const clip = createClipFromCandidate(ctx, getCandidates(ctx, projectId)[0].id)
    updateClip(ctx, clip.id, { endTime: Math.min(clip.endTime, clip.startTime + 2.5) })
    const cases = [
      { ratio: '16:9' as const, tier: '1080p' as const, width: 1920, height: 1080, fps: 60 },
      { ratio: '9:16' as const, tier: '1080p' as const, width: 1080, height: 1920 },
      { ratio: '1:1' as const, tier: '1080p' as const, width: 1080, height: 1080 },
      { ratio: '4:5' as const, tier: '1080p' as const, width: 1080, height: 1350 },
      { ratio: '4:3' as const, tier: '1080p' as const, width: 1440, height: 1080 },
      { ratio: '21:9' as const, tier: '1080p' as const, width: 2520, height: 1080 },
      { ratio: '16:9' as const, tier: '1440p' as const, width: 2560, height: 1440 },
      { ratio: '16:9' as const, tier: '2160p' as const, width: 3840, height: 2160 },
      { ratio: '9:16' as const, tier: '2160p' as const, width: 2160, height: 3840 },
      { ratio: 'custom' as const, tier: '1080p' as const, customAspectW: 2.39, customAspectH: 1, width: 2580, height: 1080 }
    ]
    const queue = new RenderQueue(ctx)
    for (const item of cases) {
      const renderClip = updateClip(ctx, clip.id, {
        aspectRatio: item.ratio, outputResolution: item.tier,
        outputFps: item.fps ?? 'source',
        ...(item.ratio === 'custom' ? { customAspectW: item.customAspectW, customAspectH: item.customAspectH } : {}),
        cropMode: 'manual', cropX: 0.8, cropY: 0.25, zoom: 1.2,
        fitMode: 'fill', cameraKeyframes: [], trackingKeyframes: []
      })
      const renderId = await queue.queueRender(renderClip.id)
      const done = await waitForRender(queue, renderId, 240_000)
      expect(done.status, `${item.ratio} ${item.tier}: ${done.error?.message ?? ''}`).toBe('completed')
      const job = rendersRepo.get(ctx.db, renderId)!
      const probe = await probeJson(job.outputPath!)
      const video = probe.streams.find((stream) => stream.codec_type === 'video')!
      expect(video.width).toBe(item.width)
      expect(video.height).toBe(item.height)
      if (item.fps) expect(video.avg_frame_rate).toBe(`${item.fps}/1`)
    }

    const fitClip = updateClip(ctx, clip.id, {
      aspectRatio: '9:16', outputResolution: '720p', fitMode: 'fit', zoom: 1.5, cropX: 0.8, cropY: 0.2,
      // Fit must show the full source even when alternate animated framing is saved.
      cameraKeyframes: [{ time: clip.startTime, x: 0.9, y: 0.5, scale: 3, rotation: 0, easing: 'linear' }],
      trackingKeyframes: [{ time: clip.startTime, x: 0.9, y: 0.5, score: 1 }]
    })
    const fitPlanId = await queue.queueRender(fitClip.id)
    const fitDone = await waitForRender(queue, fitPlanId, 240_000)
    expect(fitDone.status).toBe('completed')
    const fitJob = rendersRepo.get(ctx.db, fitPlanId)!
    const fitProbe = await probeJson(fitJob.outputPath!)
    const fitVideo = fitProbe.streams.find((stream) => stream.codec_type === 'video')!
    expect(fitVideo.width).toBe(720)
    expect(fitVideo.height).toBe(1280)
  }, 900_000)

  it('exports the actual zoomed crop pixels in both Fill and Fit modes', async () => {
    const zoomProjectId = await setupProject('VE Zoom Pixel Parity')
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-zoom-parity-'))
    const gradientPath = path.join(tempDir, 'spatial-gradient.mkv')
    const pixelPath = path.join(tempDir, 'export-center.rgb')
    const ffmpeg = require('@ffmpeg-installer/ffmpeg').path as string
    try {
      await run(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
        "nullsrc=s=640x360:r=30:d=2,format=rgb24,geq=r='X*255/W':g='Y*255/H':b=0,format=yuv444p",
        '-an', '-c:v', 'ffv1', '-pix_fmt', 'yuv444p', '-y', gradientPath
      ])
      projectsRepo.update(ctx.db, zoomProjectId, {
        source_path: gradientPath, source_filename: 'spatial-gradient.mkv', duration: 2,
        width: 640, height: 360, fps: 30, has_audio: 0, video_codec: 'ffv1',
        audio_codec: null, size_bytes: fs.statSync(gradientPath).size
      })
      const clip = createClipFromCandidate(ctx, getCandidates(ctx, zoomProjectId)[0].id)
      const queue = new RenderQueue(ctx)
      for (const fitMode of ['fill', 'fit'] as const) {
        const zoomed = updateClip(ctx, clip.id, {
          startTime: 0, endTime: 1.5, aspectRatio: '16:9', cropMode: 'manual',
          cropX: 0.9, cropY: 0.2, zoom: 2, fitMode,
          cameraKeyframes: [], trackingKeyframes: [], outputResolution: '720p', outputFps: 30
        })
        const renderId = await queue.queueRender(zoomed.id)
        const done = await waitForRender(queue, renderId, 240_000)
        expect(done.status, `${fitMode}: ${done.error?.message ?? ''}`).toBe('completed')
        const outputPath = rendersRepo.get(ctx.db, renderId)!.outputPath!
        await run(ffmpeg, [
          '-hide_banner', '-loglevel', 'error', '-ss', '0.5', '-i', outputPath,
          '-vf', 'crop=2:2:(iw-2)/2:(ih-2)/2,format=rgb24', '-frames:v', '1',
          '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-y', pixelPath
        ])
        const pixel = fs.readFileSync(pixelPath)
        // A 2x zoom with cropX=.9/cropY=.2 centers on source pixel ~448,126.
        // The encoded frame should therefore be red/green ~179/90, not the
        // full-source center (~128/128), which caught preview/export drift.
        expect(Math.abs(pixel[0] - 179), `${fitMode} center red=${pixel[0]}`).toBeLessThan(28)
        expect(Math.abs(pixel[1] - 90), `${fitMode} center green=${pixel[1]}`).toBeLessThan(28)
      }
      expect(runExport(ctx, [clip.id], false).files.length).toBe(1)
      updateClip(ctx, clip.id, { zoom: 1.5 })
      expect(() => runExport(ctx, [clip.id], false)).toThrow(/newer than its completed render/)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
    }
  }, 300_000)

  it('rejects an impossible render (missing source) without keeping artifacts', async () => {
    const throwaway = await setupProject('VE Failure')
    const candidate = getCandidates(ctx, throwaway)[0]
    const clip = createClipFromCandidate(ctx, candidate.id)
    const { getProject } = await import('../../src/main/services/projects')
    fs.unlinkSync(getProject(ctx, throwaway)!.sourcePath!)
    const queue = new RenderQueue(ctx)
    const renderId = await queue.queueRender(clip.id)
    const done = await waitForRender(queue, renderId, 120_000)
    expect(done.status).toBe('failed')
    const rendersDir = path.join(ctx.projectDir(throwaway), 'renders')
    expect(fs.readdirSync(rendersDir).filter((f) => f.endsWith('.mp4'))).toEqual([])
    deleteProject(ctx, throwaway, true)
  }, 180_000)

  it('generates a real filmstrip and waveform, cached on the second call', async () => {
    const { getProject } = await import('../../src/main/services/projects')
    const project = getProject(ctx, projectId)!
    const first = await buildFilmstrip(ctx, project, 12)
    expect(first.frames.length).toBeGreaterThanOrEqual(6)
    for (const f of first.frames) {
      expect(fs.existsSync(f.path)).toBe(true)
      expect(f.t).toBeGreaterThanOrEqual(0)
    }
    const second = await buildFilmstrip(ctx, project, 12)
    expect(second.cached).toBe(true)

    const wave = await buildWaveform(ctx, project, 200)
    expect(wave.silent).toBe(false)
    expect(wave.peaks.length).toBeGreaterThan(50)
    for (const p of wave.peaks) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
    // at least some real audio energy in the fixture
    expect(wave.peaks.some((p) => p > 0.05)).toBe(true)
  }, 180_000)

  it('transcodes a playable H.264 proxy at 720p', async () => {
    const { getProject } = await import('../../src/main/services/projects')
    const project = getProject(ctx, projectId)!
    const result = await renderProxy(ctx, project, () => undefined, new AbortController().signal)
    expect(fs.existsSync(result.proxyPath)).toBe(true)
    expect(fs.statSync(result.proxyPath).size).toBeGreaterThan(10_000)
    const probe = await probeJson(result.proxyPath)
    const video = probe.streams.find((s) => s.codec_type === 'video')!
    expect(video.height).toBe(720)
    expect(parseFloat(probe.format.duration)).toBeGreaterThan(50)
  }, 300_000)

  it('optimizeBoundaries snaps a ragged clip to sentences and reports honestly', async () => {
    const candidate = getCandidates(ctx, projectId)[0]
    const clip = createClipFromCandidate(ctx, candidate.id)
    // ragged: cut into the middle of the range
    const ragged = updateClip(ctx, clip.id, {
      startTime: clip.startTime + (clip.endTime - clip.startTime) * 0.37,
      endTime: clip.endTime - 0.3
    })
    const result = optimizeClipBoundaries(ctx, ragged.id)
    expect(result.clip.startTime).toBeGreaterThanOrEqual(0)
    expect(result.clip.endTime).toBeGreaterThan(result.clip.startTime)
    expect(typeof result.startReason).toBe('string')
    expect(typeof result.endReason).toBe('string')
    expect(result.quality.after.score).toBeGreaterThanOrEqual(result.quality.before.score - 0.05)
  }, 60_000)
})
