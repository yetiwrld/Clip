import type { AppSettings, AppInfo, AnalysisSummary, Clip, ClipCandidate, DependencyStatus,
  DiagnosticsReport, ExportResult, Project, ProjectDocument, ProjectStorage, ProjectSummary, RenderJob,
  ClipTimeline, ProjectAsset, StructuredError, TaskInfo, TranscriptSegment, Speaker, AudioRestorationPreset,
  StorageCleanupCategoryId, StorageCleanupReport, StorageCleanupResult, StorageStatus, ClipDeletionSnapshot } from './types'

/**
 * The typed API surface exposed to the renderer. Transports:
 *  - Electron: preload bridge → ipcRenderer.invoke('api:invoke', {method, payload})
 *  - Browser preview: POST /api/invoke  (+ SSE /api/events)
 * The main process validates every payload with the zod schemas in ./schemas.
 */
/** Where a notification or jump-list task should land. */
export type AppNavTarget = { view: 'queue' } | { view: 'project'; projectId: string } | { view: 'dashboard' }

export interface ClipwrightApi {
  // app / system
  'app.getInfo'(): Promise<AppInfo>
  'app.diagnostics'(): Promise<DiagnosticsReport>
  'app.checkDependencies'(): Promise<DependencyStatus[]>
  'system.revealPath'(p: { path: string }): Promise<void>
  /** Text plus optional rich-text markup for the same content. */
  'system.copyToClipboard'(p: { text: string; html?: string }): Promise<void>
  /** Native Save-As. Resolves with the chosen path, or null if cancelled. */
  'system.saveFileAs'(p: { sourcePath: string; suggestedName: string }): Promise<{ path: string } | null>
  'system.openLogsFolder'(): Promise<void>
  'system.exportDiagnostics'(): { path: string }
  'system.fontUrl'(p: { file: string }): { path: string }

  // projects
  'projects.list'(): Promise<ProjectSummary[]>
  'projects.create'(p: { name: string }): Promise<Project>
  'projects.get'(p: { id: string }): Promise<Project | null>
  /** Versioned read-only aggregate used to hydrate editor project state. */
  'projects.document'(p: { id: string }): Promise<ProjectDocument>
  'projects.rename'(p: { id: string; name: string }): Promise<Project>
  'projects.delete'(p: { id: string; confirm: boolean }): Promise<void>
  'projects.storage'(p: { id: string }): Promise<ProjectStorage>
  /** Review regenerable caches without exposing filesystem paths to the renderer. */
  'storage.cleanup.scan'(): Promise<StorageCleanupReport>
  /** Remove only explicitly selected, server-allowlisted cleanup categories. */
  'storage.cleanup.run'(p: { categories: StorageCleanupCategoryId[]; scanToken: string }): Promise<StorageCleanupResult>
  /** What is actually on disk right now. Read before claiming "Saved". */
  'storage.status'(): Promise<StorageStatus>
  /** Force a write and resolve only when it landed. Rejects on failure. */
  'storage.flush'(): Promise<StorageStatus>
  'projects.updateSettings'(p: {
    id: string
    settings: { durationPreset?: 'short' | 'medium' | 'long' | 'mixed'; maxCandidates?: number }
  }): Promise<Project>

  // media
  'media.importFile'(p: { projectId: string; filePath?: string }): Promise<{ taskId: string }>
  'media.importUrl'(p: { projectId: string; url: string }): Promise<{ taskId: string }>
  'media.importUrlAudio'(p: { projectId: string; url: string }): Promise<{ taskId: string }>
  'media.importUrlSection'(p: { projectId: string; url: string; startTime: number; endTime: number }): Promise<{ taskId: string }>
  'media.assets.list'(p: { projectId: string }): Promise<ProjectAsset[]>
  'media.assets.import'(p: { projectId: string; filePaths: string[] }): Promise<{ taskId: string }>
  'media.assets.rename'(p: { assetId: string; name: string }): Promise<ProjectAsset>
  'media.assets.relink'(p: { assetId: string; filePath?: string }): Promise<ProjectAsset>
  'media.assets.remove'(p: { assetId: string }): Promise<void>
  'media.assets.waveform'(p: { assetId: string; buckets?: number }): Promise<{ duration: number; peaks: number[]; silent: boolean }>
  'media.assets.pickFiles'(): Promise<{ filePaths: string[] }>
  'timeline.get'(p: { clipId: string }): Promise<ClipTimeline>
  'timeline.save'(p: { clipId: string; timeline: ClipTimeline }): Promise<ClipTimeline>
  /** Pre-flight URL check: which provider would handle this URL, and why not. No side effects. */
  'media.checkUrl'(p: { url: string }): Promise<{
    ok: boolean
    provider: string | null
    label: string | null
    reason: string | null
    hint: string | null
  }>

  'media.pickSourceFile'(): { filePath: string | null }
  'media.pickTranscriptFile'(): { filePath: string | null }

  /** Playback compatibility check + existing proxy status for the project source. */
  'media.checkPlayback'(p: { projectId: string }): Promise<{
    verdict: 'native' | 'proxy' | 'audio-only'
    reason: string
    proxyExists: boolean
    proxyPath: string | null
  }>
  /** Queue a preview-proxy transcode (task). */
  'media.renderProxy'(p: { projectId: string; force?: boolean }): { taskId: string }

  /** Filmstrip thumbnails for the timeline (generated + cached via FFmpeg). */
  'media.filmstrip'(p: { projectId: string; count?: number }): Promise<{
    frames: Array<{ t: number; path: string }>
    cached: boolean
  }>
  /** Audio waveform peaks for the timeline (generated + cached via FFmpeg). */
  'media.waveform'(p: { projectId: string; buckets?: number }): Promise<{
    duration: number
    peaks: number[]
    silent: boolean
  }>

  // transcript
  'transcript.get'(p: { projectId: string }): Promise<TranscriptSegment[]>
  'transcript.start'(p: { projectId: string; providerId: 'faster-whisper-local' | 'openai-compatible' }): { taskId: string }
  'transcript.import'(p: { projectId: string; filePath?: string }): { segments: number }
  'transcript.speakers'(p: { projectId: string }): Promise<Speaker[]>
  'transcript.identifySpeakers'(p: { projectId: string }): { taskId: string }
  'transcript.updateSpeaker'(p: { projectId: string; segmentId: number; speakerLabel: string | null }): Promise<TranscriptSegment>
  'transcript.renameSpeaker'(p: { projectId: string; speakerLabel: string; name: string }): Promise<Speaker>
  'audio.previewRestoration'(p: { clipId: string }): Promise<{
    beforePath: string
    afterPath: string
    duration: number
    preset: AudioRestorationPreset
  }>

  // analysis
  'analysis.providers'(): import('./types').ProviderAvailability[]
  'analysis.start'(p: {
    projectId: string
    providerId: 'heuristic-local' | 'openai-compatible' | 'anthropic'
  }): { taskId: string }
  'analysis.getCandidates'(p: { projectId: string }): Promise<ClipCandidate[]>
  'analysis.updateCandidate'(p: {
    id: string
    patch: { status?: 'discovered' | 'approved' | 'rejected' | 'converted' }
  }): Promise<ClipCandidate>

  /** Run FFmpeg silence detection over the clip window and store the cuts. */
  'analysis.detectSilence'(p: {
    clipId: string
    mode: 'auto' | 'aggressive' | 'custom'
    minSilenceMs?: number
    paddingMs?: number
    maxCutSec?: number
  }): Promise<{
    cuts: Array<{ start: number; end: number }>
    detected: Array<{ start: number; end: number }>
    savedSec: number
    clip: Clip
  }>

  /** Snap clip edges to sentence boundaries + add lead-in context. */
  'clips.optimizeBoundaries'(p: { clipId: string }): Promise<{
    clip: Clip
    adjusted: boolean
    startReason: string
    endReason: string
    leadIn: { applied: boolean; reason: string }
    quality: {
      before: { score: number; startReason: string; endReason: string }
      after: { score: number; startReason: string; endReason: string }
    }
  }>
  'clips.trackSubject'(p: {
    clipId: string
    templatePgm: string
    selectedTime: number
    centerX: number
    centerY: number
    frameWidth: number
    frameHeight: number
  }): Promise<{ keyframes: Clip['trackingKeyframes']; found: number }>

  // clips
  'clips.list'(p: { projectId: string }): Promise<Clip[]>
  'clips.createFromCandidate'(p: { candidateId: string }): Promise<Clip>
  'clips.fetchCandidateSection'(p: { candidateId: string }): Promise<{ taskId: string }>
  'clips.update'(p: { id: string; patch: Partial<Omit<Clip, 'id' | 'projectId' | 'candidateId' | 'status' | 'createdAt' | 'updatedAt'>> }): Promise<Clip>
  /** Removes the clip and returns the snapshot that `clips.restore` needs. */
  'clips.delete'(p: { id: string }): Promise<ClipDeletionSnapshot | null>
  /** Undo for a deletion made in this session. */
  'clips.restore'(p: { snapshot: ClipDeletionSnapshot }): Promise<Clip>
  'clips.generateMetadata'(p: { id: string }): Promise<Clip>

  // renders
  'renders.queue'(p: { clipId: string; preview?: boolean }): { renderId: string }
  'renders.list'(p: { projectId?: string }): Promise<RenderJob[]>
  'renders.cancel'(p: { id: string }): Promise<void>
  'renders.retry'(p: { id: string }): Promise<RenderJob>

  // tasks
  'tasks.list'(p: { projectId?: string }): Promise<TaskInfo[]>
  'tasks.cancel'(p: { id: string }): { cancelled: boolean }
  'tasks.resume'(p: { id: string }): Promise<void>
  'tasks.discard'(p: { id: string }): Promise<void>

  // settings
  'settings.get'(): Promise<AppSettings>
  'settings.update'(p: { patch: Record<string, unknown> }): Promise<AppSettings>
  'settings.setSecret'(p: { key: string; value: string }): Promise<void>
  'settings.deleteSecret'(p: { key: string }): Promise<void>
  'settings.secretHints'(): Promise<Record<string, string>>
  'settings.testAiProvider'(p: {
    providerId: 'openai-compatible' | 'anthropic'
    baseUrl?: string
    model?: string
  }): Promise<{ ok: boolean; message: string; endpoint: string; model: string; latencyMs: number | null }>

  // export
  'exports.run'(p: { clipIds: string[]; includeMetadata?: boolean }): Promise<ExportResult>
}

export type ApiMethod = keyof ClipwrightApi

/** Envelope for invoke responses over both transports. */
export type ApiEnvelope<T> = { ok: true; value: T } | { ok: false; error: StructuredError }

export interface AnalysisDonePayload {
  projectId: string
  summary: AnalysisSummary
}

/** Updates are published from signed, versioned GitHub Releases by electron-updater. */
export type AppUpdateStatus =
  | { state: 'idle' | 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

declare global {
  interface Window {
    clipwright?: {
      invoke(method: string, payload: unknown): Promise<ApiEnvelope<unknown>>
      onEvent(cb: (event: unknown) => void): () => void
      getPathForFile?(file: File): string
      checkForUpdates(): Promise<AppUpdateStatus>
      downloadUpdate(): Promise<void>
      installUpdate(): Promise<void>
      onUpdateStatus(cb: (status: AppUpdateStatus) => void): () => void

      // ---- desktop integration ------------------------------------------
      /**
       * Tell main the renderer is listening. The reply carries anything Windows
       * handed over before that moment (argv, Open with, SendTo).
       */
      rendererReady(): Promise<{ paths: string[]; projectId: string | null }>
      onOpenFiles(cb: (paths: string[]) => void): () => void
      /** A notification or jump-list task asked for a screen. */
      onNavigate(cb: (target: AppNavTarget) => void): () => void
      /** Taskbar progress for the render queue; null clears it. */
      setTaskbarProgress(progress: number | null): void
      /** Tell the window whether closing right now would lose work. */
      setCloseGuard(hasUnsavedWork: boolean): void
      /** Notifications follow the in-app preference. */
      setDesktopPreferences(preferences: { notificationsEnabled: boolean }): void
      /** The user answered "Save and quit" in the native prompt. */
      onFlushRequest(cb: () => void): () => void
      flushDone(saved: boolean): void
    }
  }
}
