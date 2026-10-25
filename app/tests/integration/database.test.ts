import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeTestContext, rmTempDir } from '../helpers/context'
import type { AppContext } from '../../src/main/services/app-context'
import {
  projectsRepo, segmentsRepo, speakersRepo, candidatesRepo, clipsRepo, clipTimelineRepo, rendersRepo, tasksRepo, settingsRepo
} from '../../src/main/services/database/repositories'
import { getProjectDocument } from '../../src/main/services/projects/document'

let cleanup: (() => Promise<void>) | null = null

afterEach(async () => {
  if (cleanup) await cleanup()
  cleanup = null
})

const PROJECT_SETTINGS = { durationPreset: 'medium' as const, maxCandidates: 8 }

function makeProject(ctx: AppContext): string {
  return projectsRepo.create(ctx.db, crypto.randomUUID(), 'DB Test', PROJECT_SETTINGS).id
}

function makeClip(ctx: AppContext, projectId: string): string {
  return clipsRepo.create(ctx.db, {
    id: crypto.randomUUID(), candidateId: null, projectId,
    startTime: 0, endTime: 10, aspectRatio: '9:16', cropMode: 'center', cropX: 0.5, zoom: 1,
    captionStyleId: 'classic', captionOverrides: {}, captionTextEdits: {},
    captionCueSplits: {}, captionCueMerges: {}, captionTimingOffsets: {}, captionCueHidden: [], captionCueDuplicates: [], silenceCuts: [], trackingKeyframes: [], cameraKeyframes: [], textLayers: [], audioRestoration: 'off',
    outputResolution: '1080p', outputQuality: 'standard', outputFps: 'source',
    title: 'clip', description: '', hashtags: [], cta: '', metadataProvider: null, status: 'draft'
  }).id
}

describe('database: projects + state machine', () => {
  it('persists editable camera keyframes', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId)
    const keyframes = [
      { time: 5, x: 0.22, y: 0.5, scale: 1.15, rotation: 0, easing: 'ease-in-out' as const },
      { time: 10, x: 0.78, y: 0.5, scale: 1.1, rotation: 0, easing: 'hold' as const }
    ]
    clipsRepo.update(ctx.db, clipId, { cameraKeyframes: keyframes })
    expect(clipsRepo.get(ctx.db, clipId)?.cameraKeyframes).toEqual(keyframes)
  })

  it('persists clip restoration presets, speaker groups, and editable segment assignments', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId)
    expect(clipsRepo.update(ctx.db, clipId, { audioRestoration: 'strong' })?.audioRestoration).toBe('strong')
    expect(clipsRepo.get(ctx.db, clipId)?.audioRestoration).toBe('strong')

    segmentsRepo.replaceForProject(ctx.db, projectId, [
      { startTime: 0, endTime: 1.4, text: 'First voice turn' },
      { startTime: 1.6, endTime: 3.2, text: 'Second voice turn' }
    ])
    const segments = segmentsRepo.listForProject(ctx.db, projectId)
    speakersRepo.ensureLabels(ctx.db, projectId, ['speaker-1', 'speaker-2'])
    segmentsRepo.updateSpeakersForProject(ctx.db, projectId, [
      { segmentId: segments[0].id, speaker: 'speaker-1' },
      { segmentId: segments[1].id, speaker: 'speaker-2' }
    ])
    const renamed = speakersRepo.rename(ctx.db, projectId, 'speaker-1', 'Host')
    expect(renamed?.name).toBe('Host')
    expect(segmentsRepo.listForProject(ctx.db, projectId).map((segment) => segment.speaker)).toEqual(['speaker-1', 'speaker-2'])
    expect(speakersRepo.listForProject(ctx.db, projectId).map((speaker) => speaker.label)).toEqual(['speaker-1', 'speaker-2'])
    expect(segmentsRepo.updateSpeakerForSegment(ctx.db, projectId, segments[1].id, 'speaker-1')).toBe(true)
    expect(segmentsRepo.listForProject(ctx.db, projectId)[1].speaker).toBe('speaker-1')
  })

  it('persists independent crop axes, custom ratio, and fit mode', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId)
    clipsRepo.update(ctx.db, clipId, {
      cropMode: 'manual', cropX: 0.82, cropY: 0.27, zoom: 1.65,
      aspectRatio: 'custom', customAspectW: 2.39, customAspectH: 1, fitMode: 'fit'
    })
    const saved = clipsRepo.get(ctx.db, clipId)!
    expect(saved.cropX).toBeCloseTo(0.82)
    expect(saved.cropY).toBeCloseTo(0.27)
    expect(saved.customAspectW).toBeCloseTo(2.39)
    expect(saved.customAspectH).toBe(1)
    expect(saved.fitMode).toBe('fit')
  })

  it('persists editable text layers and their animation keyframes', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId)
    const layers = [{
      id: 'title-1', text: 'Opening title', startTime: 1, endTime: 4, x: 0.5, y: 0.25,
      scale: 1, rotation: 0, opacity: 1, fontFamily: 'Inter', fontWeight: 700, fontSize: 64,
      color: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0,
      animationIn: 'rise' as const, animationOut: 'fade' as const,
      keyframes: [{ time: 2, x: 0.3, y: 0.4, scale: 1.2, rotation: 5, opacity: 0.8 }]
    }]
    clipsRepo.update(ctx.db, clipId, { textLayers: layers })
    expect(clipsRepo.get(ctx.db, clipId)?.textLayers).toEqual(layers)
  })

  it('persists deleted and duplicated caption blocks', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId)
    const duplicates = [{ key: 'manual:test', startTime: 2, endTime: 3.2, text: 'Edited caption' }]
    clipsRepo.update(ctx.db, clipId, { captionCueHidden: ['0:1.25'], captionCueDuplicates: duplicates })
    const saved = clipsRepo.get(ctx.db, clipId)!
    expect(saved.captionCueHidden).toEqual(['0:1.25'])
    expect(saved.captionCueDuplicates).toEqual(duplicates)
  })

  it('persists virtual camera tracking keyframes', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const projectId = makeProject(ctx)
    const clipId = makeClip(ctx, projectId)
    const keyframes = [{ time: 3.5, x: 0.82, y: 0.46, score: 0.94 }]
    clipsRepo.update(ctx.db, clipId, { trackingKeyframes: keyframes })
    expect(clipsRepo.get(ctx.db, clipId)?.trackingKeyframes).toEqual(keyframes)
  })

  it('persists URL source modes and completed task result payloads', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const projectId = makeProject(ctx)
    expect(projectsRepo.get(ctx.db, projectId)?.sourceMode).toBe('full')

    projectsRepo.update(ctx.db, projectId, {
      source_type: 'url', source_mode: 'audio-first', source_path: '/workspace/audio.m4a', has_audio: 1,
      audio_codec: 'opus', video_codec: null
    })
    expect(projectsRepo.get(ctx.db, projectId)?.sourceMode).toBe('audio-first')

    const task = tasksRepo.create(ctx.db, { id: crypto.randomUUID(), type: 'download', projectId })
    const result = { kind: 'moment-section', clipId: 'clip-id', projectId: 'child-project-id' }
    tasksRepo.update(ctx.db, task.id, { state: 'completed', result })
    expect(tasksRepo.get(ctx.db, task.id)?.result).toEqual(result)
  })

  it('creates, reads, lists, updates', async ({ }) => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const id = makeProject(ctx)

    const project = projectsRepo.get(ctx.db, id)
    expect(project).not.toBeNull()
    expect(project!.status).toBe('created')
    expect(project!.settings.durationPreset).toBe('medium')

    projectsRepo.update(ctx.db, id, { duration: 42.5, width: 1280, height: 720, has_audio: 1 })
    expect(projectsRepo.get(ctx.db, id)!.duration).toBe(42.5)

    const listed = projectsRepo.list(ctx.db)
    expect(listed.some((p) => p.id === id)).toBe(true)
  })

  it('walks the documented status machine and records failure states', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const id = makeProject(ctx)

    const flow: Array<['importing' | 'ready' | 'transcribing' | 'transcribed' | 'analyzing' | 'analyzed' | 'import_failed' | 'transcription_failed' | 'analysis_failed', string | null]> = [
      ['importing', 'Copying media'],
      ['ready', null],
      ['transcribing', 'Local Whisper'],
      ['transcribed', null],
      ['analyzing', 'Analyzing transcript'],
      ['analyzed', null]
    ]
    for (const [status, message] of flow) {
      projectsRepo.setStatus(ctx.db, id, status, message)
      const p = projectsRepo.get(ctx.db, id)!
      expect(p.status).toBe(status)
      expect(p.statusMessage).toBe(message)
    }

    // failure states carry a human-readable message (never silent)
    projectsRepo.setStatus(ctx.db, id, 'transcription_failed', 'ffmpeg exited with code 1')
    expect(projectsRepo.get(ctx.db, id)!.statusMessage).toBe('ffmpeg exited with code 1')
  })

  it('delete cascades to child rows', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const id = makeProject(ctx)

    segmentsRepo.replaceForProject(ctx.db, id, [
      { startTime: 0, endTime: 2, text: 'hello' },
      { startTime: 2, endTime: 4, text: 'world' }
    ])
    const clipId = makeClip(ctx, id)
    candidatesRepo.replaceForProject(ctx.db, id, [{
      projectId: id, startTime: 0, endTime: 20, startSegmentId: 0, endSegmentId: 3,
      title: 't', hook: '', reason: '', clipType: 'other', transcriptExcerpt: 'x',
      scores: null, overallScore: 50, scoreExplanation: null, provider: 'heuristic-local',
      momentKey: 'm', rankInMoment: 0, status: 'discovered'
    }])
    rendersRepo.create(ctx.db, crypto.randomUUID(), clipId, id, {})
    tasksRepo.create(ctx.db, { id: crypto.randomUUID(), type: 'render', projectId: id })

    projectsRepo.delete(ctx.db, id)
    expect(projectsRepo.get(ctx.db, id)).toBeNull()
    expect(segmentsRepo.countForProject(ctx.db, id)).toBe(0)
    expect(rendersRepo.countForProject(ctx.db, id)).toBe(0)
    expect(clipsRepo.listForProject(ctx.db, id)).toHaveLength(0)
    expect(candidatesRepo.countForProject(ctx.db, id)).toBe(0)
  })

  it('persists across context restarts (sql.js atomic save)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-persist-'))
    try {
      const { createAppContext } = await import('../../src/main/services/app-context')
      const first = await createAppContext({
        workspaceRoot: root, appVersion: 't', isElectron: false, moduleDir: path.resolve(__dirname, '..', '..'), logLevel: 'error'
      })
      const id = makeProject(first)
      const clipId = makeClip(first, id)
      segmentsRepo.replaceForProject(first.db, id, [{ startTime: 0, endTime: 1, text: 'persisted' }])
      clipsRepo.update(first.db, clipId, { cropMode: 'manual', cropX: 0.72, cropY: 0.31, zoom: 1.4 })
      clipTimelineRepo.save(first.db, clipId, { tracks: [], items: [], snapEnabled: false })
      await first.shutdown()

      const second = await createAppContext({
        workspaceRoot: root, appVersion: 't', isElectron: false, moduleDir: path.resolve(__dirname, '..', '..'), logLevel: 'error'
      })
      expect(projectsRepo.get(second.db, id)).not.toBeNull()
      expect(segmentsRepo.listForProject(second.db, id)[0].text).toBe('persisted')
      const document = getProjectDocument(second, id)
      expect(document.format).toBe('clipwright-project')
      expect(document.schemaVersion).toBe(1)
      expect(document.project.id).toBe(id)
      expect(document.transcript.map((segment) => segment.text)).toEqual(['persisted'])
      expect(document.clips).toHaveLength(1)
      expect(document.clips[0].clip.cropX).toBeCloseTo(0.72)
      expect(document.clips[0].clip.cropY).toBeCloseTo(0.31)
      expect(document.clips[0].timeline.snapEnabled).toBe(false)
      await second.shutdown()
    } finally {
      rmTempDir(root)
    }
  })

  it('serializes concurrent persistence flushes and closes after the final save', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-persist-race-'))
    try {
      const { createAppContext } = await import('../../src/main/services/app-context')
      const ctx = await createAppContext({
        workspaceRoot: root, appVersion: 't', isElectron: false, moduleDir: path.resolve(__dirname, '..', '..'), logLevel: 'error'
      })
      const id = makeProject(ctx)
      segmentsRepo.replaceForProject(ctx.db, id, [{ startTime: 0, endTime: 1, text: 'latest write' }])
      await Promise.all([ctx.db.persistNow(), ctx.db.persistNow(), ctx.shutdown()])

      const reopened = await createAppContext({
        workspaceRoot: root, appVersion: 't', isElectron: false, moduleDir: path.resolve(__dirname, '..', '..'), logLevel: 'error'
      })
      expect(segmentsRepo.listForProject(reopened.db, id)[0].text).toBe('latest write')
      await reopened.shutdown()
    } finally {
      rmTempDir(root)
    }
  })
})

describe('database: transcript segments', () => {
  it('replaces atomically and round-trips word timings', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const id = makeProject(ctx)

    const n = segmentsRepo.replaceForProject(ctx.db, id, [
      { startTime: 0, endTime: 2, text: 'one two', words: [{ word: 'one', start: 0, end: 1 }, { word: 'two', start: 1, end: 2 }] },
      { startTime: 2, endTime: 4, text: 'three' }
    ])
    expect(n).toBe(2)

    segmentsRepo.replaceForProject(ctx.db, id, [{ startTime: 5, endTime: 7, text: 'fresh' }])
    const segments = segmentsRepo.listForProject(ctx.db, id)
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('fresh')

    const withWords = segmentsRepo.replaceForProject(ctx.db, id, [
      { startTime: 0, endTime: 2, text: 'one two', words: [{ word: 'one', start: 0, end: 1 }, { word: 'two', start: 1, end: 2 }] }
    ])
    expect(withWords).toBe(1)
    const words = segmentsRepo.listForProject(ctx.db, id)[0].words
    expect(words).toEqual([{ word: 'one', start: 0, end: 1 }, { word: 'two', start: 1, end: 2 }])
  })
})

describe('database: candidates', () => {
  it('replaceForProject removes only discovered candidates', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const id = makeProject(ctx)

    const base = {
      projectId: id, startTime: 0, endTime: 20, startSegmentId: 0, endSegmentId: 3,
      title: 't', hook: '', reason: '', clipType: 'advice' as const, transcriptExcerpt: 'x',
      scores: null, overallScore: 50, scoreExplanation: null, provider: 'heuristic-local',
      momentKey: 'moment-x', rankInMoment: 0, status: 'discovered' as const
    }
    const first = candidatesRepo.replaceForProject(ctx.db, id, [base])
    expect(first).toHaveLength(1)

    // a converted candidate (already turned into a clip) must survive re-analysis
    candidatesRepo.updateStatus(ctx.db, first[0].id, 'converted')

    const second = candidatesRepo.replaceForProject(ctx.db, id, [
      { ...base, momentKey: 'moment-y' }
    ])
    const all = candidatesRepo.listForProject(ctx.db, id)
    expect(all).toHaveLength(2)
    expect(all.some((x) => x.id === first[0].id && x.status === 'converted')).toBe(true)
    expect(all.some((x) => x.id === second[0].id && x.status === 'discovered')).toBe(true)
  })

  it('orders by rank within moment, best score first', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const id = makeProject(ctx)

    candidatesRepo.replaceForProject(ctx.db, id, [
      { projectId: id, startTime: 0, endTime: 20, startSegmentId: 0, endSegmentId: 3, title: 'a', hook: '', reason: '', clipType: 'other', transcriptExcerpt: '', scores: null, overallScore: 40, scoreExplanation: null, provider: 'heuristic-local', momentKey: 'm1', rankInMoment: 1, status: 'discovered' },
      { projectId: id, startTime: 1, endTime: 21, startSegmentId: 0, endSegmentId: 3, title: 'b', hook: '', reason: '', clipType: 'other', transcriptExcerpt: '', scores: null, overallScore: 80, scoreExplanation: null, provider: 'heuristic-local', momentKey: 'm1', rankInMoment: 0, status: 'discovered' },
      { projectId: id, startTime: 60, endTime: 80, startSegmentId: 5, endSegmentId: 8, title: 'c', hook: '', reason: '', clipType: 'other', transcriptExcerpt: '', scores: null, overallScore: 55, scoreExplanation: null, provider: 'heuristic-local', momentKey: 'm2', rankInMoment: 0, status: 'discovered' }
    ])

    const list = candidatesRepo.listForProject(ctx.db, id)
    // global order: rank asc, then score desc (UI regroups by momentKey)
    expect(list.map((x) => x.title)).toEqual(['b', 'c', 'a'])
  })
})

describe('database: renders + tasks + recovery', () => {
  it('tracks render job lifecycle fields', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const id = makeProject(ctx)
    const clipId = makeClip(ctx, id)

    const render = rendersRepo.create(ctx.db, crypto.randomUUID(), clipId, id, { crf: 20 })
    expect(render.status).toBe('queued')

    rendersRepo.update(ctx.db, render.id, { status: 'rendering', progress: 0.5, stage: 'encoding' })
    const mid = rendersRepo.get(ctx.db, render.id)!
    expect(mid.status).toBe('rendering')
    expect(mid.progress).toBe(0.5)

    rendersRepo.update(ctx.db, render.id, {
      status: 'completed', progress: 1, outputPath: '/tmp/out.mp4', completedAt: new Date().toISOString()
    })
    const done = rendersRepo.get(ctx.db, render.id)!
    expect(done.status).toBe('completed')
    expect(done.outputPath).toBe('/tmp/out.mp4')

    expect(rendersRepo.activeCount(ctx.db)).toBe(0)
  })

  it('finds interrupted renders for startup recovery', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const id = makeProject(ctx)
    const clipId = makeClip(ctx, id)

    const a = rendersRepo.create(ctx.db, crypto.randomUUID(), clipId, id, {})
    rendersRepo.create(ctx.db, crypto.randomUUID(), clipId, id, {}) // queued counts too
    rendersRepo.update(ctx.db, a.id, { status: 'rendering' })

    const interrupted = rendersRepo.findInterrupted(ctx.db)
    expect(interrupted).toHaveLength(2)
    expect(rendersRepo.activeCount(ctx.db)).toBe(2)
  })

  it('marks in-flight tasks interrupted on launch', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const id = makeProject(ctx)

    const running = tasksRepo.create(ctx.db, { id: crypto.randomUUID(), type: 'render', projectId: id })
    tasksRepo.update(ctx.db, running.id, { state: 'running' })
    const done = tasksRepo.create(ctx.db, { id: crypto.randomUUID(), type: 'render', projectId: id })
    tasksRepo.update(ctx.db, done.id, { state: 'completed' })

    const interrupted = tasksRepo.markInterruptedOnLaunch(ctx.db)
    expect(interrupted.map((t) => t.id)).toContain(running.id)
    expect(tasksRepo.get(ctx.db, running.id)!.state).toBe('interrupted')
    expect(tasksRepo.get(ctx.db, done.id)!.state).toBe('completed') // untouched
  })
})

describe('database: settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const s = settingsRepo.load(ctx.db)
    expect(s.general.firstRunCompleted).toBe(false)
    expect(s.transcription.providerId).toBe('import-file')
    expect(s.captions.defaultStyleId).toBe('classic')
    expect(s.advanced.renderConcurrency).toBe(1)
  })

  it('merges partial stored settings over defaults (per-section)', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    const defaults = settingsRepo.defaults()
    // store only one section — everything else must fall back
    settingsRepo.save(ctx.db, { ...defaults, video: { ...defaults.video, crf: 23, renderPreset: 'medium' } })

    const loaded = settingsRepo.load(ctx.db)
    expect(loaded.video.crf).toBe(23)
    expect(loaded.video.renderPreset).toBe('medium')
    expect(loaded.video.audioNormalize).toBe(defaults.video.audioNormalize)
    expect(loaded.captions.defaultStyleId).toBe(defaults.captions.defaultStyleId)
  })

  it('merges partially stored nested provider settings without discarding sibling defaults', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    ctx.db.run(`INSERT INTO app_settings (key, value) VALUES ('app', ?)`, [JSON.stringify({ ai: { openai: { model: 'custom-transcriber' } }, advanced: { renderConcurrency: 2 } })])
    const loaded = settingsRepo.load(ctx.db)
    expect(loaded.ai.openai.model).toBe('custom-transcriber')
    expect(loaded.ai.openai.baseUrl).toBe(settingsRepo.defaults().ai.openai.baseUrl)
    expect(loaded.ai.anthropic.model).toBe(settingsRepo.defaults().ai.anthropic.model)
    expect(loaded.advanced.renderConcurrency).toBe(2)
    expect(loaded.video.crf).toBe(settingsRepo.defaults().video.crf)
  })

  it('falls back only the section with corrupt stored settings', async () => {
    const { ctx, cleanup: c } = await makeTestContext()
    cleanup = c
    ctx.db.run(`INSERT INTO app_settings (key, value) VALUES ('app', ?)`, [JSON.stringify({ ai: { openai: { model: 'retained-model' } }, video: { crf: 'not a number' } })])
    const loaded = settingsRepo.load(ctx.db)
    expect(loaded.video.crf).toBe(settingsRepo.defaults().video.crf)
    expect(loaded.ai.openai.model).toBe('retained-model')
  })
})
