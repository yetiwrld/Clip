import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import {
  rawCandidateSchema, rawScoresSchema, ipcPayloads, appSettingsSchema
} from '@shared/schemas'

describe('AI output schemas (defense against model drift)', () => {
  const goodCandidate = {
    startSegmentId: 1,
    endSegmentId: 4,
    title: 'A moment',
    clipType: 'advice'
  }

  it('accepts a minimal candidate and applies defaults', () => {
    const parsed = rawCandidateSchema.parse(goodCandidate)
    expect(parsed.hook).toBe('')
    expect(parsed.reason).toBe('')
  })

  it('rejects unknown clip types', () => {
    expect(rawCandidateSchema.safeParse({ ...goodCandidate, clipType: 'viral-banger' }).success).toBe(false)
  })

  it('rejects non-integer or negative segment ids', () => {
    expect(rawCandidateSchema.safeParse({ ...goodCandidate, startSegmentId: 1.5 }).success).toBe(false)
    expect(rawCandidateSchema.safeParse({ ...goodCandidate, startSegmentId: -1 }).success).toBe(false)
  })

  it('rejects scores outside 0–100', () => {
    const base = { candidateIndex: 0, hook: 50, contextCompleteness: 50, clarity: 50, retention: 50, emotionalImpact: 50, standaloneValue: 50, shareability: 50, visualSuitability: 50 }
    expect(rawScoresSchema.safeParse({ ...base, hook: 101 }).success).toBe(false)
    expect(rawScoresSchema.safeParse({ ...base, hook: -1 }).success).toBe(false)
    expect(rawScoresSchema.safeParse(base).success).toBe(true)
  })
})

describe('IPC payload validation (the explicit bridge contract)', () => {
  it('every declared API method has a payload schema', () => {
    for (const method of Object.keys(ipcPayloads)) {
      expect(ipcPayloads[method as keyof typeof ipcPayloads]).toBeDefined()
    }
    // every method the renderer can call must be present (exhaustive list)
    const expected = [
      'app.getInfo', 'app.diagnostics', 'app.checkDependencies',
      'projects.list', 'projects.create', 'projects.get', 'projects.document', 'projects.rename', 'projects.delete',
      'projects.storage', 'storage.cleanup.scan', 'storage.cleanup.run', 'projects.updateSettings',
      'media.importFile', 'media.importUrl', 'media.importUrlAudio', 'media.importUrlSection', 'media.checkUrl', 'media.pickSourceFile', 'media.pickTranscriptFile',
      'media.checkPlayback', 'media.renderProxy', 'media.filmstrip', 'media.waveform',
      'media.assets.list', 'media.assets.import', 'media.assets.pickFiles', 'media.assets.rename',
      'media.assets.relink', 'media.assets.remove', 'media.assets.waveform', 'timeline.get', 'timeline.save',
      'transcript.get', 'transcript.start', 'transcript.import', 'transcript.speakers', 'transcript.identifySpeakers',
      'transcript.updateSpeaker', 'transcript.renameSpeaker', 'audio.previewRestoration',
      'analysis.providers', 'analysis.start', 'analysis.getCandidates', 'analysis.updateCandidate',
      'analysis.detectSilence',
      'clips.list', 'clips.createFromCandidate', 'clips.fetchCandidateSection', 'clips.update', 'clips.delete', 'clips.generateMetadata', 'clips.trackSubject',
      'clips.optimizeBoundaries',
      'renders.queue', 'renders.list', 'renders.cancel', 'renders.retry',
      'tasks.list', 'tasks.cancel', 'tasks.resume', 'tasks.discard',
      'settings.get', 'settings.update', 'settings.setSecret', 'settings.deleteSecret',
      'settings.secretHints', 'settings.testAiProvider',
      'exports.run',
      'system.revealPath', 'system.copyToClipboard', 'system.openLogsFolder', 'system.exportDiagnostics', 'system.fontUrl'
    ]
    expect(Object.keys(ipcPayloads).sort()).toEqual([...expected].sort())
  })

  it('renderer API client binds every method declared by the contract', () => {
    const file = path.resolve(process.cwd(), 'src/renderer/api/client.ts')
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const wire = source.statements.find((statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'wire'
    )
    const apiDeclaration = wire?.body?.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations)
      .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'api')
    const initializer = apiDeclaration?.initializer
    const apiObject = initializer && ts.isAsExpression(initializer) ? initializer.expression : initializer
    expect(apiObject && ts.isObjectLiteralExpression(apiObject)).toBe(true)
    if (!apiObject || !ts.isObjectLiteralExpression(apiObject)) return
    const clientMethods = apiObject.properties
      .map((property) => property.name && (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name)) ? property.name.text : null)
      .filter((name): name is string => name !== null)
    expect(clientMethods.sort()).toEqual(Object.keys(ipcPayloads).sort())
  })

  it('validates low-data URL imports and rejects invalid time ranges', () => {
    const base = {
      projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      url: 'https://example.com/video.mp4'
    }
    expect(ipcPayloads['media.importUrlAudio'].safeParse(base).success).toBe(true)
    expect(ipcPayloads['media.importUrlSection'].safeParse({ ...base, startTime: 10, endTime: 20 }).success).toBe(true)
    expect(ipcPayloads['media.importUrlSection'].safeParse({ ...base, startTime: 20, endTime: 10 }).success).toBe(false)
    expect(ipcPayloads['media.importUrlSection'].safeParse({ ...base, startTime: -1, endTime: 10 }).success).toBe(false)
  })

  it('projects.create requires a non-empty name', () => {
    expect(ipcPayloads['projects.create'].safeParse({ name: 'My project' }).success).toBe(true)
    expect(ipcPayloads['projects.create'].safeParse({ name: '' }).success).toBe(false)
    expect(ipcPayloads['projects.create'].safeParse({ name: 'x', description: 'extra' }).success).toBe(false) // strict
  })

  it('projects.delete defaults confirm to false (backend refuses without an explicit true)', () => {
    const noConfirm = ipcPayloads['projects.delete'].safeParse({ id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
    expect(noConfirm.success).toBe(true)
    if (noConfirm.success) expect(noConfirm.data.confirm).toBe(false)
    const confirmed = ipcPayloads['projects.delete'].safeParse({ id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', confirm: true })
    expect(confirmed.success).toBe(true)
    if (confirmed.success) expect(confirmed.data.confirm).toBe(true)
  })

  it('storage cleanup accepts only explicit allowlisted categories and a reviewed scan token', () => {
    const scanToken = 'a'.repeat(64)
    expect(ipcPayloads['storage.cleanup.scan'].safeParse({}).success).toBe(true)
    expect(ipcPayloads['storage.cleanup.scan'].safeParse({ path: '/tmp/user-file' }).success).toBe(false)
    expect(ipcPayloads['storage.cleanup.run'].safeParse({ categories: ['preview-proxies'], scanToken }).success).toBe(true)
    expect(ipcPayloads['storage.cleanup.run'].safeParse({ categories: [], scanToken }).success).toBe(false)
    expect(ipcPayloads['storage.cleanup.run'].safeParse({ categories: ['exports'], scanToken }).success).toBe(false)
    expect(ipcPayloads['storage.cleanup.run'].safeParse({ categories: ['filmstrips'], scanToken, path: '/tmp/file' }).success).toBe(false)
    expect(ipcPayloads['storage.cleanup.run'].safeParse({ categories: ['filmstrips'], scanToken: 'stale' }).success).toBe(false)
  })

  it('validates local speaker editing and audio-restoration endpoints', () => {
    const projectId = 'project-1234'
    expect(ipcPayloads['transcript.identifySpeakers'].safeParse({ projectId }).success).toBe(true)
    expect(ipcPayloads['transcript.updateSpeaker'].safeParse({ projectId, segmentId: 4, speakerLabel: 'speaker-1' }).success).toBe(true)
    expect(ipcPayloads['transcript.updateSpeaker'].safeParse({ projectId, segmentId: 0, speakerLabel: null }).success).toBe(false)
    expect(ipcPayloads['transcript.renameSpeaker'].safeParse({ projectId, speakerLabel: 'speaker-1', name: 'Host' }).success).toBe(true)
    expect(ipcPayloads['audio.previewRestoration'].safeParse({ clipId: 'clip-1234' }).success).toBe(true)
    expect(ipcPayloads['clips.update'].safeParse({ id: 'clip-1234', patch: { audioRestoration: 'standard' } }).success).toBe(true)
    expect(ipcPayloads['clips.update'].safeParse({ id: 'clip-1234', patch: { audioRestoration: 'destroy' } }).success).toBe(false)
  })
})

describe('app settings schema', () => {
  it('rejects an empty object (validation-only — defaults live in settingsRepo)', () => {
    expect(appSettingsSchema.safeParse({}).success).toBe(false)
  })

  it('accepts a complete settings object', () => {
    const parsed = appSettingsSchema.safeParse({
      general: { firstRunCompleted: true },
      ai: {
        activeProvider: 'none',
        openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', temperature: 0.2, maxTokens: 4096, jsonMode: true, supportsAudio: false },
        anthropic: { baseUrl: '', model: 'claude-sonnet-4-5', temperature: 0.2, maxTokens: 4096, jsonMode: false, supportsAudio: false }
      },
      transcription: { providerId: 'import-file', language: 'auto', whisperModel: 'base', whisperCompute: 'int8', whisperBeamSize: 1 },
      video: {
        targetDurationPreset: 'medium', crf: 20, renderPreset: 'veryfast', useHardwareEncoder: true, audioNormalize: true,
        defaultResolution: '1080p', defaultQuality: 'standard', hardwareEncoding: 'auto',
        silence: { mode: 'auto', minSilenceMs: 700, paddingMs: 130, maxCutSec: 8 }
      },
      captions: { defaultStyleId: 'classic' },
      export: { preset: 'tiktok', filenameTemplate: '{index}_{slug}', includeMetadataFiles: true },
      advanced: { ffmpegPath: '', ffprobePath: '', logLevel: 'info', renderConcurrency: 2 }
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects unknown resolution/quality/silence values', () => {
    const base = {
      general: { firstRunCompleted: true },
      ai: {
        activeProvider: 'none',
        openai: { baseUrl: '', model: '', temperature: 0.2, maxTokens: 4096, jsonMode: true, supportsAudio: false },
        anthropic: { baseUrl: '', model: '', temperature: 0.2, maxTokens: 4096, jsonMode: false, supportsAudio: false }
      },
      transcription: { providerId: 'import-file', language: 'auto', whisperModel: 'base', whisperCompute: 'int8' },
      captions: { defaultStyleId: 'classic' },
      export: { preset: 'tiktok', filenameTemplate: '{index}_{slug}', includeMetadataFiles: true },
      advanced: { ffmpegPath: '', ffprobePath: '', logLevel: 'info', renderConcurrency: 2 }
    }
    expect(
      appSettingsSchema.safeParse({
        ...base,
        video: { targetDurationPreset: 'medium', crf: 20, renderPreset: 'veryfast', useHardwareEncoder: true, audioNormalize: true, defaultResolution: '480p', defaultQuality: 'standard', hardwareEncoding: 'auto', silence: { mode: 'auto', minSilenceMs: 700, paddingMs: 130, maxCutSec: 8 } }
      }).success
    ).toBe(false)
    expect(
      appSettingsSchema.safeParse({
        ...base,
        video: { targetDurationPreset: 'medium', crf: 20, renderPreset: 'veryfast', useHardwareEncoder: true, audioNormalize: true, defaultResolution: '1080p', defaultQuality: 'ultra', hardwareEncoding: 'auto', silence: { mode: 'auto', minSilenceMs: 700, paddingMs: 130, maxCutSec: 8 } }
      }).success
    ).toBe(false)
  })

  it('rejects out-of-range values', () => {
    expect(appSettingsSchema.safeParse({
      general: { firstRunCompleted: true },
      ai: {
        activeProvider: 'none',
        openai: { baseUrl: '', model: '', temperature: 5, maxTokens: 4096, jsonMode: true, supportsAudio: false },
        anthropic: { baseUrl: '', model: '', temperature: 0.2, maxTokens: 4096, jsonMode: false, supportsAudio: false }
      },
      transcription: { providerId: 'import-file', language: 'auto', whisperModel: 'base', whisperCompute: 'int8' },
      video: { targetDurationPreset: 'medium', crf: 99, renderPreset: 'veryfast', useHardwareEncoder: true, audioNormalize: true, defaultResolution: '1080p', defaultQuality: 'standard', hardwareEncoding: 'auto', silence: { mode: 'auto', minSilenceMs: 700, paddingMs: 130, maxCutSec: 8 } },
      captions: { defaultStyleId: 'classic' },
      export: { preset: 'tiktok', filenameTemplate: '{index}_{slug}', includeMetadataFiles: true },
      advanced: { ffmpegPath: '', ffprobePath: '', logLevel: 'info', renderConcurrency: 2 }
    }).success).toBe(false)
  })
})
