/**
 * Core domain types shared by the main process, the renderer and tests.
 * Runtime validation of all external data (IPC, AI output, files) happens
 * through the zod schemas in `src/shared/schemas`.
 */

// ---------------------------------------------------------------- projects ---

export type ProjectStatus =
  | 'created'
  | 'importing'
  | 'import_failed'
  | 'ready'
  | 'transcribing'
  | 'transcription_failed'
  | 'transcribed'
  | 'analyzing'
  | 'analysis_failed'
  | 'analyzed'

export interface ProjectSettings {
  /** Duration window preset used by discovery */
  durationPreset: DurationPresetId
  /** Max candidates to discover */
  maxCandidates: number
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  sourceType: 'file' | 'url'
  /** How much remote media was fetched: complete source, audio-only discovery, or a selected video section. */
  sourceMode: 'full' | 'audio-first' | 'section'
  sourcePath: string | null
  sourceUrl: string | null
  sourceFilename: string | null
  duration: number | null
  width: number | null
  height: number | null
  fps: number | null
  hasAudio: boolean
  videoCodec: string | null
  audioCodec: string | null
  sizeBytes: number | null
  rotation: number
  status: ProjectStatus
  statusMessage: string | null
  settings: ProjectSettings
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  status: ProjectStatus
  statusMessage: string | null
  duration: number | null
  sourceFilename: string | null
  sourceType: 'file' | 'url'
  hasAudio: boolean
  candidateCount: number
  clipCount: number
  renderCount: number
  thumbnail: string | null
}

export interface ProjectStorage {
  source: number
  assets: number
  renders: number
  thumbnails: number
  cache: number
  total: number
}

export type StorageCleanupCategoryId =
  | 'preview-proxies'
  | 'filmstrips'
  | 'waveforms'
  | 'transcription-audio'
  | 'stale-temporary-files'
  | 'old-logs'

export interface StorageCleanupCategoryReport {
  id: StorageCleanupCategoryId
  label: string
  description: string
  fileCount: number
  bytes: number
  /** First few workspace-relative paths shown in the pre-delete review; never absolute paths. */
  examples: string[]
  additionalFileCount: number
}

export interface StorageCleanupReport {
  scannedAt: string
  /** Fingerprint of the reviewed candidate set; cleanup aborts if it has changed. */
  scanToken: string
  categories: StorageCleanupCategoryReport[]
  reclaimableBytes: number
  /** Projects with active jobs are excluded from the cache scan. */
  skippedActiveProjects: number
}

export interface StorageCleanupResult {
  removedFiles: number
  removedBytes: number
  skippedFiles: number
  skippedActiveProjects: number
  report: StorageCleanupReport
}

// ------------------------------------------------------- media library ---

export type MediaAssetType = 'video' | 'audio' | 'image'
export interface ProjectAsset {
  id: string
  projectId: string
  name: string
  originalName: string
  mediaType: MediaAssetType
  path: string
  thumbnailPath: string | null
  duration: number | null
  width: number | null
  height: number | null
  audioChannels: number | null
  sizeBytes: number
  missing: boolean
  createdAt: string
}

export type TimelineTrackType = 'video' | 'audio' | 'image'
export interface TimelineTrack {
  id: string
  name: string
  type: TimelineTrackType
  order: number
  muted: boolean
  hidden: boolean
  locked: boolean
}
export interface TimelineItem {
  id: string
  assetId: string
  trackId: string
  startTime: number
  sourceIn: number
  sourceOut: number
  volume: number
  muted: boolean
  fadeIn: number
  fadeOut: number
  speed: number
  loop: boolean
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
}
export interface ClipTimeline {
  tracks: TimelineTrack[]
  items: TimelineItem[]
  snapEnabled: boolean
}

// ------------------------------------------------------------- transcript ---

export interface WordTiming {
  word: string
  start: number
  end: number
}

export interface TranscriptSegment {
  id: number
  startTime: number
  endTime: number
  text: string
  /** Stable project speaker label; speaker names remain user-editable metadata. */
  speaker: string | null
  confidence: number | null
  words: WordTiming[] | null
}

export interface Speaker {
  id: number
  projectId: string
  /** Stable machine label stored on transcript segments (for example `speaker-1`). */
  label: string
  /** Optional user-supplied display name; never inferred as a real-world identity. */
  name: string | null
  color: string | null
}

export interface TranscriptResult {
  language: string | null
  segments: Array<{
    start: number
    end: number
    text: string
    speaker?: string | null
    confidence?: number | null
    words?: WordTiming[] | null
  }>
}

// -------------------------------------------------------------- analysis ---

export interface ScoreBreakdown {
  hook: number
  contextCompleteness: number
  clarity: number
  retention: number
  emotionalImpact: number
  standaloneValue: number
  shareability: number
  visualSuitability: number
}

export type CandidateStatus = 'discovered' | 'approved' | 'rejected' | 'converted'

export interface ClipCandidate {
  id: string
  projectId: string
  startTime: number
  endTime: number
  startSegmentId: number
  endSegmentId: number
  title: string
  hook: string
  transcriptExcerpt: string
  reason: string
  clipType: string
  scores: ScoreBreakdown | null
  overallScore: number | null
  scoreExplanation: string | null
  /** Which provider produced this candidate, e.g. `heuristic-local` */
  provider: string
  momentKey: string
  rankInMoment: number
  status: CandidateStatus
  createdAt: string
  updatedAt: string
}

export interface AnalysisSummary {
  foundMoments: number
  keptCandidates: number
  variationsGrouped: number
  rejected: number
  provider: string
}

// ----------------------------------------------------------------- clips ---

export type CropMode = 'center' | 'top' | 'bottom' | 'manual'
export type FitMode = 'fill' | 'fit'
export type AspectRatioId = '9:16' | '1:1' | '4:5' | '16:9' | '4:3' | '21:9' | 'custom'

export type OutputResolutionId = '720p' | '1080p' | '1440p' | '2160p'
export type OutputQualityId = 'draft' | 'standard' | 'high' | 'maximum'
export type OutputFps = 'source' | 24 | 25 | 30 | 50 | 60

export interface CaptionOverrides {
  fontFile?: string
  fontFamily?: string
  fontWeight?: number
  animationIn?: 'none' | 'fade' | 'rise' | 'pop' | 'slide'
  animationOut?: 'none' | 'fade' | 'slide'
  wordAnimation?: 'none' | 'pop' | 'bounce' | 'typewriter' | 'highlight'
  emphasisBehavior?: 'all' | 'keywords' | 'none'
  capitalization?: 'original' | 'uppercase' | 'lowercase' | 'sentence'
  letterSpacing?: number
  lineSpacing?: number
  alignment?: 'center' | 'left' | 'right'
  strokeOpacity?: number
  shadowOpacity?: number
  outlineColor?: string
  boxColor?: string
  cornerRadius?: number
  maxCharsPerLine?: number
  maxLines?: number
  emojiBehavior?: 'off' | 'manual' | 'auto'
  safeAreaPosition?: 'top' | 'upper-center' | 'center' | 'lower-center' | 'bottom' | 'custom'
  fontSizePct?: number
  positionY?: number
  emphasis?: boolean
  uppercase?: boolean
  maxWordsPerCue?: number
  /** Optional color customizations — applied on top of the template. */
  textColor?: string
  highlightColor?: string
  /** 0..1; overrides the template's box opacity (0 disables the box). */
  boxOpacity?: number
  outlineWidth?: number
  shadow?: number
}

export type CameraEasing = 'cut' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold'

/** Source-time virtual-camera control point. x/y are normalized source-space centers. */
export interface CameraKeyframe {
  time: number
  x: number
  y: number
  scale: number
  rotation: number
  easing: CameraEasing
}

export type TextAnimationIn = 'none' | 'fade' | 'rise' | 'pop' | 'slide'
export type TextAnimationOut = 'none' | 'fade' | 'slide'
export interface TextLayerKeyframe {
  time: number
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
}
/** Independent editable text/graphic overlay, stored in source-time coordinates. */
export interface TextLayer {
  id: string
  text: string
  startTime: number
  endTime: number
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  fontFamily: string
  fontWeight: number
  fontSize: number
  color: string
  backgroundColor: string
  backgroundOpacity: number
  animationIn: TextAnimationIn
  animationOut: TextAnimationOut
  keyframes: TextLayerKeyframe[]
}

/** User-created caption block, independent of transcript-generated cues. */
export interface CaptionCueDuplicate {
  key: string
  startTime: number
  endTime: number
  text: string
}

export type AudioRestorationPreset = 'off' | 'light' | 'standard' | 'strong'

export interface Clip {
  id: string
  candidateId: string | null
  projectId: string
  startTime: number
  endTime: number
  aspectRatio: AspectRatioId
  cropMode: CropMode
  cropX: number
  /** Normalized vertical crop offset (legacy clips fall back to cropX). */
  cropY?: number
  zoom: number
  /** Width/height ratio when aspectRatio is `custom`. */
  customAspectW?: number
  customAspectH?: number
  fitMode?: FitMode
  captionStyleId: string
  captionOverrides: CaptionOverrides
  captionTextEdits: Record<string, string>
  /** Split cue (by key) after N words. */
  captionCueSplits: Record<string, number>
  /** Merge cue (by key) with the following cue. */
  captionCueMerges: Record<string, boolean>
  /** Per-cue timing shift in seconds (±5s max). */
  captionTimingOffsets: Record<string, number>
  /** Generated or duplicated caption blocks hidden by the user. */
  captionCueHidden: string[]
  /** User-created caption blocks. */
  captionCueDuplicates: CaptionCueDuplicate[]
  /** Editable silence decisions in source time; kept detections remain available for restore. */
  silenceCuts: Array<{
    start: number
    end: number
    detectedStart?: number
    detectedEnd?: number
    status?: 'removed' | 'kept'
  }>
  /** Source-time virtual-camera positions from template/object tracking. */
  trackingKeyframes: Array<{ time: number; x: number; y: number; score: number }>
  /** Editable source-time virtual-camera position, scale and rotation. */
  cameraKeyframes: CameraKeyframe[]
  textLayers: TextLayer[]
  /** Non-destructive FFmpeg voice-noise cleanup applied to the source track at render time. */
  audioRestoration: AudioRestorationPreset
  /** Output resolution tier (short side). */
  outputResolution: OutputResolutionId
  /** Encoder quality tier. */
  outputQuality: OutputQualityId
  /** Output frame rate; 'source' preserves the input fps. */
  outputFps: OutputFps
  title: string
  description: string
  hashtags: string[]
  cta: string
  metadataProvider: string | null
  status: 'draft' | 'rendered'
  createdAt: string
  updatedAt: string
}

// --------------------------------------------------------------- renders ---

export type RenderStatus = 'queued' | 'preparing' | 'rendering' | 'completed' | 'failed' | 'cancelled'

export interface StructuredError {
  code: string
  message: string
  hint?: string
  details?: string
}

/**
 * Everything needed to put a deleted clip back: the row, its timeline document
 * and the render records that were cascaded away with it. Captured by
 * `clips.delete` and handed back to `clips.restore` by the Undo action.
 */
export interface ClipDeletionSnapshot {
  clip: Clip
  timeline: ClipTimeline
  renders: Array<{ job: RenderJob; settings: Record<string, unknown> }>
}

export interface RenderJob {
  id: string
  clipId: string
  projectId: string
  outputPath: string | null
  status: RenderStatus
  progress: number
  /** True for fast low-quality preview renders (draft/720p). */
  preview: boolean
  stage: string | null
  error: StructuredError | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  /** Calculated by the main process; false when edits no longer match this render. */
  isCurrent?: boolean
}

// ---------------------------------------------------------------- tasks ----

export type TaskType = 'download' | 'transcribe' | 'analyze' | 'speaker-identification' | 'render' | 'thumbnail' | 'proxy' | 'asset-import'
export type TaskState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

export interface TaskInfo {
  id: string
  type: TaskType
  projectId: string | null
  state: TaskState
  stage: string | null
  progress: number | null
  message: string | null
  error: StructuredError | null
  createdAt: string
  updatedAt: string
  /** Compact completion payload for audio-first selected-section downloads. */
  result?: { kind: 'moment-section'; clipId: string; projectId: string } | null
}

// -------------------------------------------------------------- settings ---

export type DurationPresetId = 'short' | 'medium' | 'long' | 'mixed'
export type PlatformPresetId = 'tiktok' | 'reels' | 'shorts' | 'generic'

export type AiAuthStyle = 'bearer' | 'x-api-key' | 'both'

export interface AiProviderRuntimeConfig {
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  /** Ask the endpoint for JSON response_format (some proxies reject it) */
  jsonMode: boolean
  /** Endpoint also accepts audio transcription uploads */
  supportsAudio: boolean
  /**
   * How the API key is sent. `bearer` (Authorization: Bearer …) is the
   * OpenAI-compatible default and works with OpenAI, OpenRouter, Groq,
   * Together and GonkaRouter. Gateways that require the `x-api-key` header
   * instead can select it without affecting other providers.
   */
  authStyle?: AiAuthStyle
}

export type AnalysisProviderId = 'heuristic-local' | 'openai-compatible' | 'anthropic' | 'none'

export interface AiSettings {
  activeProvider: AnalysisProviderId
  openai: AiProviderRuntimeConfig
  anthropic: AiProviderRuntimeConfig
}

export interface TranscriptionSettings {
  providerId: 'import-file' | 'faster-whisper-local' | 'openai-compatible'
  language: string
  whisperModel: 'tiny' | 'base' | 'small' | 'medium'
  whisperCompute: 'auto' | 'int8' | 'float16'
  whisperBeamSize: 1 | 3 | 5
}

export interface GeneralSettings {
  firstRunCompleted: boolean
}

/**
 * Onboarding and help state. Kept in settings (the document the app already
 * validates and writes durably) so a returning user is not shown the welcome
 * screen or a dismissed tip again.
 */
export interface HelpSettings {
  /** The guided tour was finished or skipped. */
  tourCompleted: boolean
  /** Ids of the inline tips the user dismissed. Order is not important. */
  dismissedTips: string[]
}

export interface VideoSettings {
  targetDurationPreset: DurationPresetId
  renderPreset: 'ultrafast' | 'veryfast' | 'medium' | 'slow'
  crf: number
  useHardwareEncoder: boolean
  audioNormalize: boolean
  defaultResolution: OutputResolutionId
  defaultQuality: OutputQualityId
  hardwareEncoding: 'auto' | 'cpu' | 'hardware'
  silence: {
    mode: 'off' | 'auto' | 'aggressive' | 'custom'
    minSilenceMs: number
    paddingMs: number
    maxCutSec: number
  }
}

export interface CaptionDefaultsSettings {
  defaultStyleId: string
}

export interface ExportSettings {
  preset: PlatformPresetId
  includeMetadataFiles: boolean
  filenameTemplate: string
}

export interface AdvancedSettings {
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  renderConcurrency: number
  ffmpegPath: string
  ffprobePath: string
}

/**
 * Motion preferences for interface effects.
 *
 * Ambient effects are the decorative, continuous ones: the welcome backdrop,
 * live status pulses, activity graphs. Turning them off leaves every functional
 * signal in place — progress bars, spinners and status text never stop.
 */
export interface AppearanceSettings {
  ambientEffects: boolean
}

/**
 * Remembered shape of the workspace: panel sizes, which panels are hidden and
 * which inspector sections the user left open.
 *
 * Sizes are pixels and every one of them has a bounded range in the schema, so
 * a stale or hand-edited value can never produce an unusable window. The
 * renderer still clamps per field when it reads, so one odd number degrades to
 * that panel's limit instead of throwing the whole layout away.
 */
export interface WorkspaceSettings {
  sidebarWidth: number
  sidebarCollapsed: boolean
  editorToolPanelWidth: number
  editorToolPanelCollapsed: boolean
  editorInspectorWidth: number
  editorInspectorCollapsed: boolean
  /** `null` means "fit the window", which adapts to the screen it opens on. */
  editorTimelineHeight: number | null
  /** Ids of the inspector sections that are open. */
  openInspectorSections: string[]
}

export interface AppSettings {
  general: GeneralSettings
  help: HelpSettings
  appearance: AppearanceSettings
  workspace: WorkspaceSettings
  ai: AiSettings
  transcription: TranscriptionSettings
  video: VideoSettings
  captions: CaptionDefaultsSettings
  export: ExportSettings
  advanced: AdvancedSettings
}

/**
 * Versioned editor-facing aggregate for a project. The database remains the
 * normalized persistence layer; this document is the canonical hydration
 * boundary so preview/editor consumers read one internally consistent state.
 * Tasks and other transient UI state intentionally stay outside the document.
 */
export interface ProjectDocumentV1 {
  format: 'clipwright-project'
  schemaVersion: 1
  project: Project
  assets: ProjectAsset[]
  transcript: TranscriptSegment[]
  candidates: ClipCandidate[]
  clips: Array<{ clip: Clip; timeline: ClipTimeline }>
  renders: RenderJob[]
}

export type ProjectDocument = ProjectDocumentV1

// ------------------------------------------------------------ providers ----

export interface ProviderAvailability {
  id: string
  label: string
  kind: 'transcription' | 'analysis' | 'tool' | 'system'
  available: boolean
  configured: boolean
  message: string
  /** Where the user can fix it */
  fixHint?: string
}

export interface DependencyStatus extends ProviderAvailability {
  kind: 'tool' | 'system'
  version?: string
}

// --------------------------------------------------------------- events ----

export type AppEvent =
  | { type: 'task:update'; task: TaskInfo }
  | { type: 'render:progress'; renderId: string; clipId: string; projectId: string; progress: number; stage: string }
  | { type: 'render:state'; render: RenderJob }
  | { type: 'project:update'; project: Project }

// ------------------------------------------------------------- diagnostics -

export interface DiagnosticsReport {
  appVersion: string
  platform: string
  electron: string | null
  node: string
  workspaceRoot: string
  schemaVersion: number
  ffmpeg: { path: string; source: string; version: string | null } | null
  ffprobe: { path: string; source: string; version: string | null } | null
  providers: ProviderAvailability[]
  disk: { freeBytes: number; totalBytes: number } | null
  recentErrors: Array<{ time: string; code: string; message: string }>
  settingsSummary: Record<string, unknown>
}

export interface AppInfo {
  version: string
  platform: string
  isElectron: boolean
  workspaceRoot: string
}

/**
 * Truthful state of the on-disk database. The renderer reads this before it
 * claims anything is saved: `dirty` means at least one write has not reached
 * the file yet, and `lastError` means the last attempt failed.
 */
export interface StorageStatus {
  dirty: boolean
  lastPersistedAt: string | null
  lastError: string | null
  /** The database file was unreadable at startup and was moved aside. */
  recoveredFromCorrupt: boolean
  /** Where the unreadable file was moved, so the user can inspect it. */
  corruptBackupPath: string | null
}

export interface ExportResult {
  dir: string
  files: string[]
}
