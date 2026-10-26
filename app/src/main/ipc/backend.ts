import path from 'node:path'
import fs from 'node:fs'
import { AppError } from '@shared/errors'
import type { AppInfo, ClipDeletionSnapshot, ProjectSummary, RenderJob, StorageCleanupCategoryId } from '@shared/types'
import { ipcPayloads } from '@shared/schemas'
import type { AppContext } from '../services/app-context'
import { candidatesRepo, clipsRepo, projectsRepo, speakersRepo } from '../services/database/repositories'
import { TaskManager } from '../services/tasks'
import { RenderQueue } from '../services/rendering/queue'
import {
  cancelUrlImport, createProject, deleteProject, getProject, importMediaFile, importMediaUrl, importMediaUrlAudio, importMediaUrlSection,
  listProjects, projectStorage, renameProject, updateProjectSettings
} from '../services/projects'
import { getProjectDocument } from '../services/projects/document'
import { getClipTimeline, importProjectAssets, listProjectAssets, relinkProjectAsset, removeProjectAsset, renameProjectAsset, saveClipTimeline } from '../services/media/assets'
import { getTranscript, importTranscript, runTranscription } from '../services/transcription'
import { renameProjectSpeaker, runSpeakerIdentification, updateTranscriptSpeaker } from '../services/speakers'
import { createAudioRestorationPreview } from '../services/audio/restoration'
import { checkUrlProviders, getYtDlpProvider, parseUrlSafe } from '../services/media/url-providers'
import { detectSilence, optionsForMode, projectWithMedia, proxyStatus, renderProxy } from '../services/media/analysis'
import { buildAssetWaveform, buildFilmstrip, buildWaveform, projectForVisuals } from '../services/media/frames'
import { optimizeClipBoundaries } from '../services/clips/boundaries'
import { getCandidates, listAnalysisProviders, runAnalysis, updateCandidateStatus } from '../services/ai/analysis'
import { testAiProvider as testAiProviderService } from '../services/ai/test'
import { createClipFromCandidate, createRemoteSectionClip, deleteClip, generateClipMetadata, listClips, restoreClip, updateClip } from '../services/clips'
import { trackSubject } from '../services/clips/tracking'
import { getSettings, updateSettings } from '../services/settings'
import { buildDiagnostics, checkDependencies, exportDiagnostics } from '../services/diagnostics'
import { runExport } from '../services/exports'
import { runStorageCleanup, scanStorageCleanup } from '../services/storage/cleanup'
import { flushDurability } from '../services/storage/durability'

/**
 * Backend assembly + the single method registry. The same dispatcher serves
 * Electron IPC and the browser-preview HTTP transport. Every payload is
 * validated against the zod schemas; every method is allow-listed.
 */

export interface HostServices {
  pickFile(filters: Array<{ name: string; extensions: string[] }>): Promise<string | null>
  pickFiles?(filters: Array<{ name: string; extensions: string[] }>): Promise<string[]>
  revealPath(target: string): Promise<void>
  /** Text plus optional rich-text markup for the same content. */
  copyToClipboard(text: string, html?: string): Promise<void>
  /** Native Save-As with the OS overwrite confirmation. */
  saveFileAs?(options: { sourcePath: string; suggestedName: string }): Promise<{ path: string } | null>
  openLogsFolder(): Promise<void>
  isPathInsideWorkspace(target: string): boolean
}

export interface Backend {
  ctx: AppContext
  tasks: TaskManager
  renders: RenderQueue
  host: HostServices | null
  invoke(method: string, payload: unknown): Promise<unknown>
}

/**
 * Methods that change user data and must reach the disk before they resolve.
 * Everything else is either read-only or regenerable (task progress, render
 * stages), where a lost second of progress costs nothing.
 */
const DURABLE_METHODS: Record<string, string> = {
  'projects.create': 'new project',
  'projects.rename': 'project name',
  'projects.updateSettings': 'project settings',
  'projects.delete': 'project deletion',
  'clips.createFromCandidate': 'new clip',
  'clips.update': 'clip edit',
  'clips.delete': 'clip deletion',
  'clips.restore': 'clip restore',
  'timeline.save': 'timeline edit',
  'transcript.import': 'imported transcript',
  'transcript.updateSpeaker': 'speaker change',
  'transcript.renameSpeaker': 'speaker name',
  'media.assets.rename': 'asset name',
  'media.assets.remove': 'asset removal',
  'settings.update': 'settings change'
}

const MEDIA_FILTERS = [
  { name: 'Media files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv', 'mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac', 'opus', 'aiff', 'png', 'jpg', 'jpeg', 'webp', 'gif'] }
]
const TRANSCRIPT_FILTERS = [{ name: 'Transcripts', extensions: ['srt', 'vtt', 'json', 'txt'] }]

export function createBackend(ctx: AppContext, host: HostServices | null): Backend {
  const tasks = new TaskManager(ctx)
/** Fire-and-forget task dispatch: failures are recorded on the task row; the rethrow is swallowed so a failed background task can never crash the host (B-008). */
function runTask(taskId: string, fn: (report: import('../services/tasks/index').TaskReporter, signal: AbortSignal) => Promise<unknown>): void {
  void tasks.run(taskId, fn).catch(() => undefined)
}
  const renders = new RenderQueue(ctx)

  // ------------------------------------------------------------- runners ---
  tasks.registerRunner('transcribe', (payload, report, signal) =>
    runTranscription(ctx, {
      projectId: String(payload.projectId),
      providerId: payload.providerId === 'openai-compatible' ? 'openai-compatible' : 'faster-whisper-local',
      onEvent: (stage, progress, message) => report(stage, progress, message),
      signal
    })
  )
  tasks.registerRunner('speaker-identification', (payload, report, signal) =>
    runSpeakerIdentification(ctx, {
      projectId: String(payload.projectId),
      onEvent: (stage, progress, message) => report(stage, progress, message),
      signal
    })
  )
  tasks.registerRunner('analyze', (payload, report, signal) =>
    runAnalysis(ctx, {
      projectId: String(payload.projectId),
      providerId: payload.providerId as 'heuristic-local' | 'openai-compatible' | 'anthropic',
      onEvent: (stage, progress, message) => report(stage, progress, message),
      signal
    })
  )
  tasks.registerRunner('proxy', async (payload, report, signal) => {
    const project = projectWithMedia(ctx, String(payload.projectId))
    const result = await renderProxy(ctx, project, (pct) => report('transcoding', pct, 'Building preview proxy'), signal)
    return { proxyPath: result.proxyPath }
  })
  tasks.registerRunner('download', async (payload, report, signal) => {
    const projectId = String(payload.projectId)
    if (payload.kind === 'url') {
      report('downloading', null, 'Starting full video download')
      return importMediaUrl(ctx, projectId, String(payload.url), signal, report)
    }
    if (payload.kind === 'audio-url') {
      report('downloading', null, 'Downloading audio only for local discovery')
      return importMediaUrlAudio(ctx, projectId, String(payload.url), signal, report)
    }
    if (payload.kind === 'url-section') {
      report('downloading', null, 'Downloading only the selected video section')
      return importMediaUrlSection(ctx, projectId, String(payload.url), Number(payload.startTime), Number(payload.endTime), signal, report)
    }
    if (payload.kind === 'moment-section') {
      report('section-download', null, 'Preparing the selected moment video section')
      const result = await createRemoteSectionClip(ctx, String(payload.candidateId), signal, report)
      return { kind: 'moment-section', ...result }
    }
    report('copying', null, 'Importing file')
    return importMediaFile(ctx, projectId, String(payload.filePath), report)
  })
  tasks.registerRunner('asset-import', (payload, report) =>
    importProjectAssets(ctx, String(payload.projectId), payload.filePaths as string[], report)
  )

  // ------------------------------------------------------------- handlers ---
  const handlers: Record<string, (payload: never) => unknown> = {
    'app.getInfo': (): AppInfo => ({
      version: ctx.appVersion,
      platform: process.platform,
      isElectron: ctx.isElectron,
      workspaceRoot: ctx.workspaceRoot
    }),
    'app.diagnostics': () => buildDiagnostics(ctx),
    'app.checkDependencies': () => checkDependencies(ctx),

    'projects.list': (): ProjectSummary[] => listProjects(ctx),
    'projects.create': (p: { name: string }) => createProject(ctx, p.name),
    'projects.get': (p: { id: string }) => getProject(ctx, p.id),
    'projects.document': (p: { id: string }) => getProjectDocument(ctx, p.id),
    'projects.rename': (p: { id: string; name: string }) => renameProject(ctx, p.id, p.name),
    'projects.delete': (p: { id: string; confirm: boolean }) => deleteProject(ctx, p.id, p.confirm),
    'projects.storage': (p: { id: string }) => projectStorage(ctx, p.id),
    'storage.cleanup.scan': () => scanStorageCleanup(ctx),
    'storage.cleanup.run': (p: { categories: StorageCleanupCategoryId[]; scanToken: string }) =>
      runStorageCleanup(ctx, p.categories, p.scanToken),
    'projects.updateSettings': (p: { id: string; settings: { durationPreset?: 'short' | 'medium' | 'long' | 'mixed'; maxCandidates?: number } }) =>
      updateProjectSettings(ctx, p.id, p.settings),

    'media.importFile': async (p: { projectId: string; filePath?: string }): Promise<{ taskId: string }> => {
      let filePath: string | null | undefined = p.filePath
      if (!filePath) {
        if (!host) throw new AppError('UNSUPPORTED_IN_PREVIEW', 'File picking is unavailable in the browser preview.', 'Use the upload control instead.')
        filePath = await host.pickFile(MEDIA_FILTERS)
        if (!filePath) throw new AppError('CANCELLED', 'No file was selected.')
      }
      const task = tasks.create('download', p.projectId, { kind: 'file', projectId: p.projectId, filePath })
      runTask(task.id, (report) => {
        report('copying', null, 'Importing file')
        return importMediaFile(ctx, p.projectId, filePath as string, report)
      })
      return { taskId: task.id }
    },
    'media.importUrl': (p: { projectId: string; url: string }): { taskId: string } => {
      // Fail fast: if no provider can handle this URL, throw before creating
      // a task, so the UI can clean up the placeholder project immediately.
      const check = checkUrlProviders(p.url)
      if (!check.ok) {
        throw new AppError('URL_PROVIDER_UNAVAILABLE', check.reason ?? 'This URL cannot be imported.', check.hint ?? undefined)
      }
      const task = tasks.create('download', p.projectId, { kind: 'url', projectId: p.projectId, url: p.url })
      runTask(task.id, async (report, signal) => {
        report('downloading', null, 'Starting full video download')
        await importMediaUrl(ctx, p.projectId, p.url, signal, report)
      })
      return { taskId: task.id }
    },
    'media.importUrlAudio': (p: { projectId: string; url: string }): { taskId: string } => {
      parseUrlSafe(p.url)
      if (!getYtDlpProvider()) {
        throw new AppError('YTDLP_MISSING', 'Audio-first URL discovery needs yt-dlp.', 'Install yt-dlp and make sure it is on your PATH. This mode will not download the full video as a fallback.')
      }
      const project = getProject(ctx, p.projectId)
      if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
      if (project.sourcePath) throw new AppError('SOURCE_ALREADY_IMPORTED', 'This project already has source media.', 'Create a new project for audio-first URL discovery.')
      const task = tasks.create('download', p.projectId, { kind: 'audio-url', projectId: p.projectId, url: p.url })
      runTask(task.id, (report, signal) => importMediaUrlAudio(ctx, p.projectId, p.url, signal, report))
      return { taskId: task.id }
    },
    'media.importUrlSection': (p: { projectId: string; url: string; startTime: number; endTime: number }): { taskId: string } => {
      parseUrlSafe(p.url)
      if (!getYtDlpProvider()) {
        throw new AppError('YTDLP_MISSING', 'Time-range URL downloads need yt-dlp.', 'Install yt-dlp and make sure it is on your PATH. This mode will not download the full video as a fallback.')
      }
      const project = getProject(ctx, p.projectId)
      if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
      if (project.sourcePath) throw new AppError('SOURCE_ALREADY_IMPORTED', 'This project already has source media.', 'Create a new project to download a separate section.')
      if (p.endTime <= p.startTime) throw new AppError('SECTION_RANGE_INVALID', 'Choose an end time later than the start time.')
      const task = tasks.create('download', p.projectId, { kind: 'url-section', projectId: p.projectId, url: p.url, startTime: p.startTime, endTime: p.endTime })
      runTask(task.id, (report, signal) => importMediaUrlSection(ctx, p.projectId, p.url, p.startTime, p.endTime, signal, report))
      return { taskId: task.id }
    },
    'media.assets.list': (p: { projectId: string }) => listProjectAssets(ctx, p.projectId),
    'media.assets.import': (p: { projectId: string; filePaths: string[] }): { taskId: string } => {
      const task = tasks.create('asset-import', p.projectId, { projectId: p.projectId, filePaths: p.filePaths })
      runTask(task.id, (report) => importProjectAssets(ctx, p.projectId, p.filePaths, report))
      return { taskId: task.id }
    },
    'media.assets.rename': (p: { assetId: string; name: string }) => renameProjectAsset(ctx, p.assetId, p.name),
    'media.assets.relink': async (p: { assetId: string; filePath?: string }) => {
      let filePath = p.filePath
      if (!filePath) {
        if (!host) throw new AppError('UNSUPPORTED_IN_PREVIEW', 'Relinking media requires the desktop file picker.')
        filePath = await host.pickFile(MEDIA_FILTERS) ?? undefined
      }
      if (!filePath) throw new AppError('CANCELLED', 'No replacement file was selected.')
      return relinkProjectAsset(ctx, p.assetId, filePath)
    },
    'media.assets.remove': (p: { assetId: string }) => removeProjectAsset(ctx, p.assetId),
    'media.assets.waveform': (p: { assetId: string; buckets?: number }) => buildAssetWaveform(ctx, p.assetId, p.buckets ?? 1200),
    'media.assets.pickFiles': async (): Promise<{ filePaths: string[] }> => {
      if (!host?.pickFiles) throw new AppError('UNSUPPORTED_IN_PREVIEW', 'The multi-file picker is unavailable here.', 'Drag files into the editor or use the browser file upload.')
      return { filePaths: await host.pickFiles(MEDIA_FILTERS) }
    },
    'timeline.get': (p: { clipId: string }) => getClipTimeline(ctx, p.clipId),
    'timeline.save': (p: { clipId: string; timeline: import('@shared/types').ClipTimeline }) => saveClipTimeline(ctx, p.clipId, p.timeline),
    'media.checkUrl': (p: { url: string }): { ok: boolean; provider: string | null; label: string | null; reason: string | null; hint: string | null } =>
      checkUrlProviders(p.url),

    'media.checkPlayback': (p: { projectId: string }) => proxyStatus(ctx, projectWithMedia(ctx, p.projectId)),
    'media.renderProxy': (p: { projectId: string; force?: boolean }): { taskId: string } => {
      const project = projectWithMedia(ctx, p.projectId)
      const status = proxyStatus(ctx, project)
      if (status.verdict === 'native' && !p.force) {
        throw new AppError('PROXY_NOT_NEEDED', 'This file already plays directly — no proxy is required.')
      }
      const task = tasks.create('proxy', p.projectId, { projectId: p.projectId })
      runTask(task.id, async (report, signal) => {
        report('transcoding', 0, 'Building preview proxy')
        const r = await renderProxy(ctx, project, (pct) => report('transcoding', pct, 'Building preview proxy'), signal)
        return { proxyPath: r.proxyPath }
      })
      return { taskId: task.id }
    },

    'media.filmstrip': (p: { projectId: string; count?: number }) =>
      buildFilmstrip(ctx, projectForVisuals(ctx, p.projectId), p.count ?? 24),
    'media.waveform': (p: { projectId: string; buckets?: number }) =>
      buildWaveform(ctx, projectForVisuals(ctx, p.projectId), p.buckets ?? 1200),

    'media.pickSourceFile': async (): Promise<{ filePath: string | null }> => {
      if (!host) throw new AppError('UNSUPPORTED_IN_PREVIEW', 'File picking is unavailable in the browser preview.', 'Use the upload control instead.')
      return { filePath: await host.pickFile(MEDIA_FILTERS) }
    },
    'media.pickTranscriptFile': async (): Promise<{ filePath: string | null }> => {
      if (!host) throw new AppError('UNSUPPORTED_IN_PREVIEW', 'File picking is unavailable in the browser preview.', 'Use the upload control instead.')
      return { filePath: await host.pickFile(TRANSCRIPT_FILTERS) }
    },

    'transcript.get': (p: { projectId: string }) => getTranscript(ctx, p.projectId),
    'transcript.start': (p: { projectId: string; providerId: 'faster-whisper-local' | 'openai-compatible' }): { taskId: string } => {
      const task = tasks.create('transcribe', p.projectId, { projectId: p.projectId, providerId: p.providerId })
      runTask(task.id, (report, signal) =>
        runTranscription(ctx, {
          projectId: p.projectId,
          providerId: p.providerId,
          onEvent: (stage, progress, message) => report(stage, progress, message),
          signal
        })
      )
      return { taskId: task.id }
    },
    'transcript.import': (p: { projectId: string; filePath?: string }): { segments: number } => {
      if (!p.filePath) throw new AppError('FILE_NOT_FOUND', 'No transcript file was provided.')
      return importTranscript(ctx, p.projectId, p.filePath)
    },
    'transcript.speakers': (p: { projectId: string }) => speakersRepo.listForProject(ctx.db, p.projectId),
    'transcript.identifySpeakers': (p: { projectId: string }): { taskId: string } => {
      const task = tasks.create('speaker-identification', p.projectId, { projectId: p.projectId })
      runTask(task.id, (report, signal) => runSpeakerIdentification(ctx, {
        projectId: p.projectId,
        onEvent: (stage, progress, message) => report(stage, progress, message),
        signal
      }))
      return { taskId: task.id }
    },
    'transcript.updateSpeaker': (p: { projectId: string; segmentId: number; speakerLabel: string | null }) =>
      updateTranscriptSpeaker(ctx, p.projectId, p.segmentId, p.speakerLabel),
    'transcript.renameSpeaker': (p: { projectId: string; speakerLabel: string; name: string }) =>
      renameProjectSpeaker(ctx, p.projectId, p.speakerLabel, p.name),
    'audio.previewRestoration': (p: { clipId: string }) => createAudioRestorationPreview(ctx, p.clipId),

    'analysis.providers': () => listAnalysisProviders(ctx),
    'analysis.start': (p: { projectId: string; providerId: 'heuristic-local' | 'openai-compatible' | 'anthropic' }): { taskId: string } => {
      const task = tasks.create('analyze', p.projectId, { projectId: p.projectId, providerId: p.providerId })
      runTask(task.id, (report, signal) =>
        runAnalysis(ctx, {
          projectId: p.projectId,
          providerId: p.providerId,
          onEvent: (stage, progress, message) => report(stage, progress, message),
          signal
        })
      )
      return { taskId: task.id }
    },
    'analysis.getCandidates': (p: { projectId: string }) => getCandidates(ctx, p.projectId),
    'analysis.updateCandidate': (p: { id: string; patch: { status?: 'discovered' | 'approved' | 'rejected' | 'converted' } }) =>
      updateCandidateStatus(ctx, p.id, p.patch.status ?? 'discovered'),

    'analysis.detectSilence': async (p: {
      clipId: string; mode: 'auto' | 'aggressive' | 'custom'
      minSilenceMs?: number; paddingMs?: number; maxCutSec?: number
    }) => {
      const clip = clipsRepo.get(ctx.db, p.clipId)
      if (!clip) throw new AppError('CLIP_NOT_FOUND', 'That clip no longer exists.')
      const project = projectWithMedia(ctx, clip.projectId)
      const opts = optionsForMode(p.mode, {
        minSilenceMs: p.minSilenceMs, paddingMs: p.paddingMs, maxCutSec: p.maxCutSec
      })
      const result = await detectSilence(ctx, project, { from: clip.startTime, to: clip.endTime }, opts)
      const updated = updateClip(ctx, p.clipId, { silenceCuts: result.cuts })
      return { ...result, clip: updated }
    },

    'clips.optimizeBoundaries': (p: { clipId: string }) => optimizeClipBoundaries(ctx, p.clipId),
    'clips.trackSubject': async (p: { clipId: string; templatePgm: string; selectedTime: number; centerX: number; centerY: number; frameWidth: number; frameHeight: number }) =>
      trackSubject(ctx, p.clipId, { templatePgm: p.templatePgm, selectedTime: p.selectedTime, centerX: p.centerX, centerY: p.centerY, frameWidth: p.frameWidth, frameHeight: p.frameHeight }),

    'clips.list': (p: { projectId: string }) => listClips(ctx, p.projectId),
    'clips.createFromCandidate': (p: { candidateId: string }) => createClipFromCandidate(ctx, p.candidateId),
    'clips.fetchCandidateSection': (p: { candidateId: string }): { taskId: string } => {
      const candidate = candidatesRepo.get(ctx.db, p.candidateId)
      if (!candidate) throw new AppError('CANDIDATE_NOT_FOUND', 'That clip candidate no longer exists.')
      const project = projectsRepo.get(ctx.db, candidate.projectId)
      if (!project || project.sourceMode !== 'audio-first') {
        throw new AppError('AUDIO_FIRST_REQUIRED', 'Selected-section fetching is only available for audio-first URL projects.')
      }
      const task = tasks.create('download', project.id, { kind: 'moment-section', projectId: project.id, candidateId: candidate.id })
      runTask(task.id, async (report, signal) => {
        report('section-download', null, 'Fetching the selected video section')
        const result = await createRemoteSectionClip(ctx, candidate.id, signal, report)
        return { kind: 'moment-section', ...result }
      })
      return { taskId: task.id }
    },
    'clips.update': (p: { id: string; patch: Record<string, unknown> }) => updateClip(ctx, p.id, p.patch),
    'clips.delete': (p: { id: string }) => deleteClip(ctx, p.id),
    'clips.restore': (p: { snapshot: ClipDeletionSnapshot }) => restoreClip(ctx, p.snapshot),
    'clips.generateMetadata': (p: { id: string }) => generateClipMetadata(ctx, p.id),

    'renders.queue': async (p: { clipId: string; preview?: boolean }): Promise<{ renderId: string }> =>
      ({ renderId: await renders.queueRender(p.clipId, p.preview ?? false) }),
    'renders.list': (p: { projectId?: string }): RenderJob[] => renders.list(p.projectId),
    'renders.cancel': async (p: { id: string }) => {
      await renders.cancel(p.id)
    },
    'renders.retry': (p: { id: string }) => renders.retry(p.id),

    'tasks.list': (p: { projectId?: string }) => tasks.list(p.projectId),
    'tasks.cancel': (p: { id: string }) => {
      const task = tasks.list().find((item) => item.id === p.id)
      const cancelled = tasks.cancel(p.id)
      const payload = task?.type === 'download' && task.projectId
        ? JSON.parse((ctx.db.get<{ payload: string }>('SELECT payload FROM tasks WHERE id = ?', [p.id])?.payload) ?? '{}') as Record<string, unknown>
        : null
      const urlImportCancelled = task?.type === 'download' && payload?.kind === 'url' && task.projectId
        ? cancelUrlImport(task.projectId)
        : false
      return { cancelled: cancelled || urlImportCancelled }
    },
    'tasks.resume': async (p: { id: string }) => {
      const all = tasks.list()
      const task = all.find((t) => t.id === p.id)
      if (!task) throw new AppError('TASK_NOT_FOUND', 'That task no longer exists.')
      if (task.type === 'render') {
        await renders.retry(p.id)
        return
      }
      await tasks.resume(p.id)
    },
    'tasks.discard': (p: { id: string }) => tasks.discard(p.id),

    'settings.get': () => getSettings(ctx),
    'settings.update': (p: { patch: Record<string, unknown> }) => updateSettings(ctx, p.patch),
    'settings.setSecret': (p: { key: string; value: string }) => ctx.secrets.set(p.key, p.value),
    'settings.deleteSecret': (p: { key: string }) => ctx.secrets.delete(p.key),
    'settings.secretHints': () => ctx.secrets.hints(),
    'settings.testAiProvider': (p: { providerId: 'openai-compatible' | 'anthropic'; baseUrl?: string; model?: string }) =>
      testAiProviderService(ctx, p),

    'storage.status': () => ctx.db.status(),
    'storage.flush': async () => {
      await flushDurability(ctx, 'change')
      return ctx.db.status()
    },

    'exports.run': (p: { clipIds: string[]; includeMetadata?: boolean }) => runExport(ctx, p.clipIds, p.includeMetadata ?? true),

    'system.revealPath': async (p: { path: string }): Promise<void> => {
      if (!host) return
      if (!host.isPathInsideWorkspace(p.path)) {
        throw new AppError('PATH_OUTSIDE_WORKSPACE', 'Only files inside the application workspace can be revealed.')
      }
      await host.revealPath(p.path)
    },
    'system.copyToClipboard': async (p: { text: string; html?: string }): Promise<void> => {
      if (!host) throw new AppError('UNSUPPORTED_IN_PREVIEW', 'Clipboard is handled by the browser in preview mode.')
      await host.copyToClipboard(p.text, p.html)
    },
    'system.saveFileAs': async (p: { sourcePath: string; suggestedName: string }): Promise<{ path: string } | null> => {
      if (!host?.saveFileAs) {
        throw new AppError('UNSUPPORTED_IN_PREVIEW', 'Saving a copy is only available in the desktop app.', 'Use the download button instead.')
      }
      if (!host.isPathInsideWorkspace(p.sourcePath)) {
        throw new AppError('PATH_NOT_ALLOWED', 'Only files inside the Clipwright workspace can be saved out.')
      }
      if (!fs.existsSync(p.sourcePath) || !fs.statSync(p.sourcePath).isFile()) {
        throw new AppError('FILE_NOT_FOUND', 'That render is no longer on disk.', 'Render the clip again to recreate it.')
      }
      // The suggested name is a name, not a path: separators, control characters
      // and traversal are stripped before it reaches the save dialog.
      const suggestedName =
        p.suggestedName
          .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
          .replace(/\.+$/g, '')
          .trim()
          .slice(0, 120) || 'clip.mp4'
      return host.saveFileAs({ sourcePath: p.sourcePath, suggestedName })
    },
    'system.openLogsFolder': async (): Promise<void> => {
      if (!host) throw new AppError('UNSUPPORTED_IN_PREVIEW', 'Opening folders is unavailable in the browser preview.')
      await host.openLogsFolder()
    },
    'system.exportDiagnostics': async () => exportDiagnostics(ctx, await buildDiagnostics(ctx)),
    'system.fontUrl': (p: { file: string }): { path: string } => {
      const fontPath = path.join(ctx.paths.fontsDir, path.basename(p.file))
      if (!fs.existsSync(fontPath)) throw new AppError('FONT_NOT_FOUND', `Font file ${p.file} is missing.`)
      return { path: fontPath }
    }
  }

  // ------------------------------------------------------------ dispatcher --

  async function invoke(method: string, payload: unknown): Promise<unknown> {
    const handler = handlers[method]
    if (!handler) throw new AppError('UNKNOWN_METHOD', `Unknown API method "${method}".`)
    const schema = (ipcPayloads as Record<string, unknown>)[method]
    let validatedPayload: unknown = payload ?? {}
    if (schema) {
      const parsed = (
        schema as { safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: { message: string } } }
      ).safeParse(payload ?? {})
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          `The request to "${method}" contained invalid data.`,
          'This is an application bug — the UI sent something the backend refused.',
          parsed.error?.message
        )
      }
      validatedPayload = parsed.data ?? {}
    }
    const result = await handler(validatedPayload as never)
    const durableAction = DURABLE_METHODS[method]
    if (durableAction) await flushDurability(ctx, durableAction)
    return result
  }

  // Startup recovery: mark interrupted work for the recovery UI (spec §88)
  const interruptedTasks = tasks.startupRecovery().length
  const interruptedRenders = renders.startupRecovery()
  if (interruptedTasks + interruptedRenders > 0) {
    ctx.logger.info('recovery', 'startup', `interrupted tasks=${interruptedTasks} renders=${interruptedRenders}`)
  }

  return { ctx, tasks, renders, host, invoke }
}
