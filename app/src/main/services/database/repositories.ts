import fs from 'node:fs'
import path from 'node:path'
import type {
  AppSettings, Clip, ClipCandidate, ClipTimeline, Project, ProjectAsset, ProjectSettings, ProjectStatus,
  RenderJob, RenderStatus, ScoreBreakdown, StructuredError, TaskInfo, TaskState,
  TaskType, TranscriptSegment, WordTiming, Speaker, AudioRestorationPreset
} from '@shared/types'
import { appSettingsSchema } from '@shared/schemas'
import { DEFAULT_CAPTION_STYLE_ID, DURATION_RANGES } from '@shared/constants'
import type { AppDatabase } from './db'
import type { AppContext } from '../app-context'

/**
 * Typed data access. All JSON columns round-trip through safe parsing;
 * all rows map to domain types before leaving this module.
 */

function now(): string {
  return new Date().toISOString()
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function bool(v: unknown): boolean {
  return v === 1 || v === true
}

// ---------------------------------------------------------------- projects --

export interface ProjectRow {
  id: string; name: string; created_at: string; updated_at: string
  source_type: string; source_mode: string; source_path: string | null; source_url: string | null
  source_filename: string | null; duration: number | null; width: number | null
  height: number | null; fps: number | null; has_audio: number
  video_codec: string | null; audio_codec: string | null; size_bytes: number | null
  rotation: number; status: string; status_message: string | null; settings: string
}

function defaultProjectSettings(): ProjectSettings {
  return { durationPreset: 'medium', maxCandidates: 8 }
}

export function mapProject(row: ProjectRow): Project {
  const settings = { ...defaultProjectSettings(), ...parseJson<Partial<ProjectSettings>>(row.settings, {}) }
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceType: row.source_type === 'url' ? 'url' : 'file',
    sourceMode: row.source_mode === 'audio-first' || row.source_mode === 'section' ? row.source_mode : 'full',
    sourcePath: row.source_path,
    sourceUrl: row.source_url,
    sourceFilename: row.source_filename,
    duration: row.duration,
    width: row.width,
    height: row.height,
    fps: row.fps,
    hasAudio: bool(row.has_audio),
    videoCodec: row.video_codec,
    audioCodec: row.audio_codec,
    sizeBytes: row.size_bytes,
    rotation: row.rotation ?? 0,
    status: row.status as ProjectStatus,
    statusMessage: row.status_message,
    settings: { durationPreset: settings.durationPreset, maxCandidates: settings.maxCandidates }
  }
}

export const projectsRepo = {
  create(db: AppDatabase, id: string, name: string, settings: ProjectSettings): Project {
    const ts = now()
    db.run(
      `INSERT INTO projects (id, name, created_at, updated_at, status, settings)
       VALUES (?, ?, ?, ?, 'created', ?)`,
      [id, name, ts, ts, JSON.stringify(settings)]
    )
    return mapProject(
      db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]) as ProjectRow
    )
  },

  get(db: AppDatabase, id: string): Project | null {
    const row = db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id])
    return row ? mapProject(row) : null
  },

  list(db: AppDatabase): Project[] {
    return db.all<ProjectRow>('SELECT * FROM projects ORDER BY updated_at DESC').map(mapProject)
  },

  update(db: AppDatabase, id: string, fields: Partial<ProjectRow>): void {
    const keys = Object.keys(fields).filter((k) => fields[k as keyof ProjectRow] !== undefined)
    if (keys.length === 0) return
    const sets = keys.map((k) => `${k} = ?`).join(', ')
    db.run(`UPDATE projects SET ${sets}, updated_at = ? WHERE id = ?`, [
      ...keys.map((k) => fields[k as keyof ProjectRow]),
      now(),
      id
    ])
  },

  setStatus(db: AppDatabase, id: string, status: ProjectStatus, message: string | null = null): void {
    db.run('UPDATE projects SET status = ?, status_message = ?, updated_at = ? WHERE id = ?', [status, message, now(), id])
  },

  delete(db: AppDatabase, id: string): void {
    db.run('DELETE FROM projects WHERE id = ?', [id])
  },

  writeProjectJson(ctx: AppContext, project: Project): void {
    const dir = ctx.projectDir(project.id)
    fs.mkdirSync(dir, { recursive: true })
    const tmp = path.join(dir, 'project.json.tmp')
    fs.writeFileSync(tmp, JSON.stringify(project, null, 2), 'utf-8')
    fs.renameSync(tmp, path.join(dir, 'project.json'))
  }
}

// --------------------------------------------------------------- transcript --

interface SegmentRow {
  id: number; project_id: string; start_time: number; end_time: number
  text: string; speaker: string | null; confidence: number | null; words: string | null
}

function mapSegment(row: SegmentRow): TranscriptSegment {
  const words = parseJson<WordTiming[] | null>(row.words, null)
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    text: row.text,
    speaker: row.speaker,
    confidence: row.confidence,
    words: words && words.length ? words : null
  }
}

export const segmentsRepo = {
  listForProject(db: AppDatabase, projectId: string): TranscriptSegment[] {
    return db
      .all<SegmentRow>('SELECT * FROM transcript_segments WHERE project_id = ? ORDER BY start_time', [projectId])
      .map(mapSegment)
  },

  countForProject(db: AppDatabase, projectId: string): number {
    return db.get<{ n: number }>('SELECT COUNT(*) as n FROM transcript_segments WHERE project_id = ?', [projectId])?.n ?? 0
  },

  updateSpeakerForSegment(db: AppDatabase, projectId: string, segmentId: number, speaker: string | null): boolean {
    return db.run(
      'UPDATE transcript_segments SET speaker = ? WHERE project_id = ? AND id = ?',
      [speaker, projectId, segmentId]
    ).changes > 0
  },

  updateSpeakersForProject(
    db: AppDatabase,
    projectId: string,
    assignments: Array<{ segmentId: number; speaker: string | null }>
  ): number {
    return db.transaction(() => {
      let updated = 0
      for (const assignment of assignments) {
        updated += db.run(
          'UPDATE transcript_segments SET speaker = ? WHERE project_id = ? AND id = ?',
          [assignment.speaker, projectId, assignment.segmentId]
        ).changes
      }
      return updated
    })
  },

  replaceForProject(
    db: AppDatabase,
    projectId: string,
    segments: Array<{
      startTime: number; endTime: number; text: string
      speaker?: string | null; confidence?: number | null; words?: WordTiming[] | null
    }>
  ): number {
    return db.transaction(() => {
      db.run('DELETE FROM transcript_segments WHERE project_id = ?', [projectId])
      for (const s of segments) {
        db.run(
          `INSERT INTO transcript_segments (project_id, start_time, end_time, text, speaker, confidence, words)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            projectId,
            s.startTime,
            s.endTime,
            s.text,
            s.speaker ?? null,
            s.confidence ?? null,
            s.words && s.words.length ? JSON.stringify(s.words) : null
          ]
        )
      }
      return segments.length
    })
  }
}

// --------------------------------------------------------------- speakers --

interface SpeakerRow {
  id: number
  project_id: string
  label: string
  name: string | null
  color: string | null
}

function mapSpeaker(row: SpeakerRow): Speaker {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    name: row.name,
    color: row.color
  }
}

const SPEAKER_COLORS = ['#54a9ff', '#c18aff', '#46c7a5', '#f2a65a', '#ef7188', '#9aa6b2']

export const speakersRepo = {
  listForProject(db: AppDatabase, projectId: string): Speaker[] {
    return db
      .all<SpeakerRow>('SELECT * FROM speakers WHERE project_id = ? ORDER BY id', [projectId])
      .map(mapSpeaker)
  },

  ensureLabels(db: AppDatabase, projectId: string, labels: string[]): void {
    db.transaction(() => {
      for (const label of [...new Set(labels.map((value) => value.trim()).filter(Boolean))]) {
        const exists = db.get<{ id: number }>(
          'SELECT id FROM speakers WHERE project_id = ? AND label = ? LIMIT 1',
          [projectId, label]
        )
        if (exists) continue
        const match = label.match(/^speaker-(\d+)$/i)
        const index = match ? Math.max(0, Number(match[1]) - 1) : label.length
        db.run(
          'INSERT INTO speakers (project_id, label, name, color) VALUES (?, ?, NULL, ?)',
          [projectId, label, SPEAKER_COLORS[index % SPEAKER_COLORS.length]]
        )
      }
    })
  },

  rename(db: AppDatabase, projectId: string, label: string, name: string): Speaker | null {
    speakersRepo.ensureLabels(db, projectId, [label])
    db.run(
      'UPDATE speakers SET name = ? WHERE project_id = ? AND label = ?',
      [name.trim(), projectId, label]
    )
    const row = db.get<SpeakerRow>(
      'SELECT * FROM speakers WHERE project_id = ? AND label = ? ORDER BY id LIMIT 1',
      [projectId, label]
    )
    return row ? mapSpeaker(row) : null
  }
}

// -------------------------------------------------------------- candidates --

interface CandidateRow {
  id: string; project_id: string; start_time: number; end_time: number
  start_segment_id: number; end_segment_id: number; title: string; hook: string
  transcript_excerpt: string; reason: string; clip_type: string; scores: string | null
  overall_score: number | null; score_explanation: string | null; provider: string
  moment_key: string; rank_in_moment: number; status: string; created_at: string; updated_at: string
}

function mapCandidate(row: CandidateRow): ClipCandidate {
  return {
    id: row.id,
    projectId: row.project_id,
    startTime: row.start_time,
    endTime: row.end_time,
    startSegmentId: row.start_segment_id,
    endSegmentId: row.end_segment_id,
    title: row.title,
    hook: row.hook,
    transcriptExcerpt: row.transcript_excerpt,
    reason: row.reason,
    clipType: row.clip_type,
    scores: parseJson<ScoreBreakdown | null>(row.scores, null),
    overallScore: row.overall_score,
    scoreExplanation: row.score_explanation,
    provider: row.provider,
    momentKey: row.moment_key,
    rankInMoment: row.rank_in_moment,
    status: row.status as ClipCandidate['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const candidatesRepo = {
  replaceForProject(db: AppDatabase, projectId: string, candidates: Array<Omit<ClipCandidate, 'id' | 'createdAt' | 'updatedAt'>>): ClipCandidate[] {
    const ts = now()
    return db.transaction(() => {
      db.run(`DELETE FROM clip_candidates WHERE project_id = ? AND status = 'discovered'`, [projectId])
      const out: ClipCandidate[] = []
      for (const c of candidates) {
        const id = crypto.randomUUID()
        db.run(
          `INSERT INTO clip_candidates
           (id, project_id, start_time, end_time, start_segment_id, end_segment_id, title, hook,
            transcript_excerpt, reason, clip_type, scores, overall_score, score_explanation, provider,
            moment_key, rank_in_moment, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, projectId, c.startTime, c.endTime, c.startSegmentId, c.endSegmentId,
            c.title, c.hook, c.transcriptExcerpt, c.reason, c.clipType,
            c.scores ? JSON.stringify(c.scores) : null, c.overallScore, c.scoreExplanation,
            c.provider, c.momentKey, c.rankInMoment, c.status, ts, ts
          ]
        )
        out.push({ ...c, id, createdAt: ts, updatedAt: ts })
      }
      return out
    })
  },

  listForProject(db: AppDatabase, projectId: string): ClipCandidate[] {
    return db
      .all<CandidateRow>(
        `SELECT * FROM clip_candidates WHERE project_id = ?
         ORDER BY rank_in_moment ASC, overall_score DESC`,
        [projectId]
      )
      .map(mapCandidate)
  },

  get(db: AppDatabase, id: string): ClipCandidate | null {
    const row = db.get<CandidateRow>('SELECT * FROM clip_candidates WHERE id = ?', [id])
    return row ? mapCandidate(row) : null
  },

  updateStatus(db: AppDatabase, id: string, status: ClipCandidate['status']): ClipCandidate | null {
    db.run('UPDATE clip_candidates SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id])
    return candidatesRepo.get(db, id)
  },

  countForProject(db: AppDatabase, projectId: string): number {
    return db.get<{ n: number }>('SELECT COUNT(*) as n FROM clip_candidates WHERE project_id = ?', [projectId])?.n ?? 0
  }
}

// ------------------------------------------------------------------- clips --

interface ClipRow {
  id: string; candidate_id: string | null; project_id: string; start_time: number
  end_time: number; aspect_ratio: string; crop_mode: string; crop_x: number; crop_y: number | null
  custom_aspect_w: number | null; custom_aspect_h: number | null
  fit_mode: string
  zoom: number; caption_style_id: string; caption_overrides: string
  caption_text_edits: string; caption_cue_splits: string; caption_cue_merges: string
  caption_timing_offsets: string; caption_cue_hidden: string; caption_cue_duplicates: string
  silence_cuts: string; tracking_keyframes: string; camera_keyframes: string; text_layers: string; title: string; description: string; hashtags: string
  cta: string; metadata_provider: string | null; status: string
  output_resolution: string; output_quality: string; output_fps: string; audio_restoration: string
  created_at: string; updated_at: string
}

function mapClip(row: ClipRow): Clip {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    projectId: row.project_id,
    startTime: row.start_time,
    endTime: row.end_time,
    aspectRatio: row.aspect_ratio as Clip['aspectRatio'],
    cropMode: row.crop_mode as Clip['cropMode'],
    cropX: row.crop_x,
    ...(row.crop_y != null ? { cropY: row.crop_y } : {}),
    zoom: row.zoom,
    ...(row.custom_aspect_w != null ? { customAspectW: row.custom_aspect_w } : {}),
    ...(row.custom_aspect_h != null ? { customAspectH: row.custom_aspect_h } : {}),
    fitMode: row.fit_mode === 'fit' ? 'fit' : 'fill',
    audioRestoration: (['light', 'standard', 'strong'].includes(row.audio_restoration) ? row.audio_restoration : 'off') as AudioRestorationPreset,
    captionStyleId: row.caption_style_id,
    captionOverrides: parseJson<Clip['captionOverrides']>(row.caption_overrides, {}),
    captionTextEdits: parseJson<Record<string, string>>(row.caption_text_edits, {}),
    captionCueSplits: parseJson<Record<string, number>>(row.caption_cue_splits, {}),
    captionCueMerges: parseJson<Record<string, boolean>>(row.caption_cue_merges, {}),
    captionTimingOffsets: parseJson<Record<string, number>>(row.caption_timing_offsets, {}),
    captionCueHidden: parseJson<string[]>(row.caption_cue_hidden, []),
    captionCueDuplicates: parseJson<Clip['captionCueDuplicates']>(row.caption_cue_duplicates, []),
    silenceCuts: parseJson<Clip['silenceCuts']>(row.silence_cuts, []),
    trackingKeyframes: parseJson<Clip['trackingKeyframes']>(row.tracking_keyframes, []),
    cameraKeyframes: parseJson<Clip['cameraKeyframes']>(row.camera_keyframes, []),
    textLayers: parseJson<Clip['textLayers']>(row.text_layers, []),
    outputResolution: row.output_resolution as Clip['outputResolution'],
    outputQuality: row.output_quality as Clip['outputQuality'],
    outputFps: (row.output_fps === 'source' ? 'source' : Number(row.output_fps)) as Clip['outputFps'],
    title: row.title,
    description: row.description,
    hashtags: parseJson<string[]>(row.hashtags, []),
    cta: row.cta,
    metadataProvider: row.metadata_provider,
    status: row.status as Clip['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const clipsRepo = {
  create(db: AppDatabase, clip: Omit<Clip, 'createdAt' | 'updatedAt'>): Clip {
    const ts = now()
    db.run(
      `INSERT INTO clips (id, candidate_id, project_id, start_time, end_time, aspect_ratio, crop_mode,
        crop_x, zoom, caption_style_id, caption_overrides, caption_text_edits, caption_cue_splits,
        caption_cue_merges, caption_timing_offsets, caption_cue_hidden, caption_cue_duplicates,
        silence_cuts, tracking_keyframes, camera_keyframes, text_layers, output_resolution, output_quality,
        output_fps, title, description, hashtags, cta, metadata_provider, status, created_at, updated_at,
        crop_y, custom_aspect_w, custom_aspect_h, fit_mode, audio_restoration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clip.id, clip.candidateId, clip.projectId, clip.startTime, clip.endTime,
        clip.aspectRatio, clip.cropMode, clip.cropX, clip.zoom, clip.captionStyleId,
        JSON.stringify(clip.captionOverrides), JSON.stringify(clip.captionTextEdits),
        JSON.stringify(clip.captionCueSplits ?? {}), JSON.stringify(clip.captionCueMerges ?? {}),
        JSON.stringify(clip.captionTimingOffsets ?? {}), JSON.stringify(clip.captionCueHidden ?? []),
        JSON.stringify(clip.captionCueDuplicates ?? []), JSON.stringify(clip.silenceCuts ?? []),
        JSON.stringify(clip.trackingKeyframes ?? []),
        JSON.stringify(clip.cameraKeyframes ?? []),
        JSON.stringify(clip.textLayers ?? []),
        clip.outputResolution ?? '1080p', clip.outputQuality ?? 'standard',
        String(clip.outputFps ?? 'source'),
        clip.title, clip.description, JSON.stringify(clip.hashtags), clip.cta,
        clip.metadataProvider, clip.status, ts, ts,
        clip.cropY ?? null, clip.customAspectW ?? null, clip.customAspectH ?? null, clip.fitMode ?? 'fill',
        clip.audioRestoration ?? 'off'
      ]
    )
    return { ...clip, audioRestoration: clip.audioRestoration ?? 'off', createdAt: ts, updatedAt: ts }
  },

  get(db: AppDatabase, id: string): Clip | null {
    const row = db.get<ClipRow>('SELECT * FROM clips WHERE id = ?', [id])
    return row ? mapClip(row) : null
  },

  listForProject(db: AppDatabase, projectId: string): Clip[] {
    return db.all<ClipRow>('SELECT * FROM clips WHERE project_id = ? ORDER BY created_at', [projectId]).map(mapClip)
  },

  update(db: AppDatabase, id: string, patch: Record<string, unknown>): Clip | null {
    const columnMap: Record<string, string> = {
      startTime: 'start_time', endTime: 'end_time', aspectRatio: 'aspect_ratio',
      cropMode: 'crop_mode', cropX: 'crop_x', cropY: 'crop_y', zoom: 'zoom',
      customAspectW: 'custom_aspect_w', customAspectH: 'custom_aspect_h',
      fitMode: 'fit_mode', audioRestoration: 'audio_restoration',
      captionStyleId: 'caption_style_id', captionOverrides: 'caption_overrides',
      captionTextEdits: 'caption_text_edits', title: 'title', description: 'description',
      hashtags: 'hashtags', cta: 'cta', metadataProvider: 'metadata_provider', status: 'status',
      captionCueSplits: 'caption_cue_splits', captionCueMerges: 'caption_cue_merges',
      captionTimingOffsets: 'caption_timing_offsets', captionCueHidden: 'caption_cue_hidden',
      captionCueDuplicates: 'caption_cue_duplicates', silenceCuts: 'silence_cuts',
      trackingKeyframes: 'tracking_keyframes',
      cameraKeyframes: 'camera_keyframes',
      textLayers: 'text_layers',
      outputResolution: 'output_resolution', outputQuality: 'output_quality', outputFps: 'output_fps'
    }
    const CLIP_JSON_FIELDS = new Set([
      'hashtags', 'captionOverrides', 'captionTextEdits', 'captionCueSplits',
      'captionCueMerges', 'captionTimingOffsets', 'captionCueHidden', 'captionCueDuplicates',
      'silenceCuts', 'trackingKeyframes', 'cameraKeyframes', 'textLayers'
    ])
    const sets: string[] = []
    const values: unknown[] = []
    for (const [field, column] of Object.entries(columnMap)) {
      if (field in patch) {
        let value = patch[field]
        if (CLIP_JSON_FIELDS.has(field)) {
          value = JSON.stringify(value ?? (field === 'hashtags' || field === 'silenceCuts' || field === 'trackingKeyframes' || field === 'cameraKeyframes' || field === 'textLayers' || field === 'captionCueHidden' || field === 'captionCueDuplicates' ? [] : {}))
        }
        if (field === 'outputFps') value = String(value)
        sets.push(`${column} = ?`)
        values.push(value)
      }
    }
    if (sets.length === 0) return clipsRepo.get(db, id)
    db.run(`UPDATE clips SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...values, now(), id])
    return clipsRepo.get(db, id)
  },

  delete(db: AppDatabase, id: string): void {
    db.run('DELETE FROM clips WHERE id = ?', [id])
  },

  countForProject(db: AppDatabase, projectId: string): number {
    return db.get<{ n: number }>('SELECT COUNT(*) as n FROM clips WHERE project_id = ?', [projectId])?.n ?? 0
  }
}

// ----------------------------------------------------------------- renders --

interface RenderRow {
  id: string; clip_id: string; project_id: string; output_path: string | null
  status: string; progress: number; stage: string | null; error: string | null
  settings: string; preview: number; started_at: string | null; completed_at: string | null
  created_at: string; updated_at: string
}

function mapRender(row: RenderRow): RenderJob {
  return {
    id: row.id,
    clipId: row.clip_id,
    projectId: row.project_id,
    outputPath: row.output_path,
    status: row.status as RenderStatus,
    progress: row.progress,
    preview: row.preview === 1,
    stage: row.stage,
    error: parseJson<StructuredError | null>(row.error, null),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const rendersRepo = {
  create(db: AppDatabase, id: string, clipId: string, projectId: string, settings: unknown, preview = false): RenderJob {
    const ts = now()
    db.run(
      `INSERT INTO renders (id, clip_id, project_id, status, settings, preview, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)`,
      [id, clipId, projectId, JSON.stringify(settings ?? {}), preview ? 1 : 0, ts, ts]
    )
    return mapRender(db.get<RenderRow>('SELECT * FROM renders WHERE id = ?', [id]) as RenderRow)
  },

  get(db: AppDatabase, id: string): RenderJob | null {
    const row = db.get<RenderRow>('SELECT * FROM renders WHERE id = ?', [id])
    return row ? mapRender(row) : null
  },

  /** Put a render record back after an undo, with its original timestamps. */
  restore(db: AppDatabase, job: RenderJob, settings: Record<string, unknown>): void {
    db.run(
      `INSERT INTO renders (id, clip_id, project_id, output_path, status, progress, stage, error,
        settings, preview, started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id, job.clipId, job.projectId, job.outputPath, job.status, job.progress, job.stage,
        job.error ? JSON.stringify(job.error) : null, JSON.stringify(settings ?? {}),
        job.preview ? 1 : 0, job.startedAt, job.completedAt, job.createdAt, job.updatedAt
      ]
    )
  },

  getSettings(db: AppDatabase, id: string): Record<string, unknown> {
    const row = db.get<RenderRow>('SELECT * FROM renders WHERE id = ?', [id])
    return row ? parseJson<Record<string, unknown>>(row.settings, {}) : {}
  },

  updateSettings(db: AppDatabase, id: string, settings: Record<string, unknown>): void {
    db.run('UPDATE renders SET settings = ?, updated_at = ? WHERE id = ?', [JSON.stringify(settings), now(), id])
  },

  list(db: AppDatabase, projectId?: string): RenderJob[] {
    const rows = projectId
      ? db.all<RenderRow>('SELECT * FROM renders WHERE project_id = ? ORDER BY created_at DESC', [projectId])
      : db.all<RenderRow>('SELECT * FROM renders ORDER BY created_at DESC')
    return rows.map(mapRender)
  },

  update(db: AppDatabase, id: string, patch: Partial<{
    status: string; progress: number; stage: string | null; error: unknown
    outputPath: string | null; startedAt: string | null; completedAt: string | null
  }>): void {
    const columnMap: Record<string, string> = {
      status: 'status', progress: 'progress', stage: 'stage', error: 'error',
      outputPath: 'output_path', startedAt: 'started_at', completedAt: 'completed_at'
    }
    const sets: string[] = []
    const values: unknown[] = []
    const record = patch as Record<string, unknown>
    for (const [field, column] of Object.entries(columnMap)) {
      if (field in record) {
        let value = record[field]
        if (field === 'error' && value != null && typeof value !== 'string') value = JSON.stringify(value)
        sets.push(`${column} = ?`)
        values.push(value)
      }
    }
    if (sets.length === 0) return
    db.run(`UPDATE renders SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...values, now(), id])
  },

  countForProject(db: AppDatabase, projectId: string): number {
    return db.get<{ n: number }>('SELECT COUNT(*) as n FROM renders WHERE project_id = ?', [projectId])?.n ?? 0
  },

  activeCount(db: AppDatabase): number {
    return (
      db.get<{ n: number }>(`SELECT COUNT(*) as n FROM renders WHERE status IN ('queued','preparing','rendering')`)?.n ?? 0
    )
  },

  findInterrupted(db: AppDatabase): RenderJob[] {
    return db
      .all<RenderRow>(`SELECT * FROM renders WHERE status IN ('queued','preparing','rendering')`)
      .map(mapRender)
  }
}

// ------------------------------------------------------------------- tasks --

interface TaskRow {
  id: string; type: string; project_id: string | null; state: string
  stage: string | null; progress: number | null; message: string | null
  error: string | null; payload: string; result: string | null
  created_at: string; updated_at: string
}

function mapTask(row: TaskRow): TaskInfo {
  return {
    id: row.id,
    type: row.type as TaskType,
    projectId: row.project_id,
    state: row.state as TaskState,
    stage: row.stage,
    progress: row.progress,
    message: row.message,
    error: parseJson<StructuredError | null>(row.error, null),
    result: parseJson<{ kind: 'moment-section'; clipId: string; projectId: string } | null>(row.result, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const tasksRepo = {
  create(db: AppDatabase, task: { id: string; type: TaskType; projectId: string | null; payload?: unknown }): TaskInfo {
    const ts = now()
    db.run(
      `INSERT INTO tasks (id, type, project_id, state, payload, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
      [task.id, task.type, task.projectId, JSON.stringify(task.payload ?? {}), ts, ts]
    )
    return mapTask(db.get<TaskRow>('SELECT * FROM tasks WHERE id = ?', [task.id]) as TaskRow)
  },

  get(db: AppDatabase, id: string): TaskInfo | null {
    const row = db.get<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id])
    return row ? mapTask(row) : null
  },

  list(db: AppDatabase, projectId?: string): TaskInfo[] {
    const rows = projectId
      ? db.all<TaskRow>('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC LIMIT 100', [projectId])
      : db.all<TaskRow>('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 200')
    return rows.map(mapTask)
  },

  update(db: AppDatabase, id: string, patch: Record<string, unknown>): void {
    const columnMap: Record<string, string> = {
      state: 'state', stage: 'stage', progress: 'progress', message: 'message',
      error: 'error', result: 'result', project_id: 'project_id'
    }
    const sets: string[] = []
    const values: unknown[] = []
    for (const [field, column] of Object.entries(columnMap)) {
      if (field in patch) {
        let value = patch[field]
        if ((field === 'error' || field === 'result') && value != null && typeof value !== 'string') {
          value = JSON.stringify(value)
        }
        sets.push(`${column} = ?`)
        values.push(value)
      }
    }
    if (sets.length === 0) return
    db.run(`UPDATE tasks SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...values, now(), id])
  },

  markInterruptedOnLaunch(db: AppDatabase): TaskInfo[] {
    const interrupted = db
      .all<TaskRow>(`SELECT * FROM tasks WHERE state IN ('queued','running')`)
      .map(mapTask)
    for (const task of interrupted) {
      tasksRepo.update(db, task.id, { state: 'interrupted', message: 'Interrupted by application shutdown' })
    }
    // tasks are re-mapped to pick up the new state
    return interrupted.map((t) => tasksRepo.get(db, t.id) ?? t)
  }
}

// ---------------------------------------------------------------- settings --

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMergeSettings(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return patch === undefined ? base : patch
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = key in base ? deepMergeSettings(base[key], value) : value
  }
  return merged
}

export const settingsRepo = {
  defaults(): AppSettings {
    return {
      general: { firstRunCompleted: false },
      help: { tourCompleted: false, dismissedTips: [] },
      ai: {
        activeProvider: 'none',
        openai: { baseUrl: 'https://api.openai.com/v1', model: '', temperature: 0.4, maxTokens: 4096, jsonMode: false, supportsAudio: false, authStyle: 'bearer' },
        anthropic: { baseUrl: 'https://api.anthropic.com', model: '', temperature: 0.4, maxTokens: 4096, jsonMode: false, supportsAudio: false, authStyle: 'bearer' }
      },
      transcription: { providerId: 'import-file', language: 'auto', whisperModel: 'base', whisperCompute: 'int8', whisperBeamSize: 1 },
      video: {
        targetDurationPreset: 'medium',
        renderPreset: 'veryfast',
        crf: 18,
        useHardwareEncoder: false,
        audioNormalize: true,
        defaultResolution: '1080p',
        defaultQuality: 'standard',
        hardwareEncoding: 'auto',
        silence: { mode: 'auto', minSilenceMs: 700, paddingMs: 130, maxCutSec: 8 }
      },
      captions: { defaultStyleId: DEFAULT_CAPTION_STYLE_ID },
      export: { preset: 'generic', includeMetadataFiles: true, filenameTemplate: '{index}_{slug}' },
      advanced: { logLevel: 'info', renderConcurrency: 1, ffmpegPath: '', ffprobePath: '' }
    }
  },

  load(db: AppDatabase): AppSettings {
    const row = db.get<{ value: string }>(`SELECT value FROM app_settings WHERE key = 'app'`)
    const defaults = settingsRepo.defaults()
    if (!row) return defaults
    const rawStored = parseJson<unknown>(row.value, {})
    const stored = isRecord(rawStored) ? rawStored : {}
    const merged: Record<string, unknown> = {}
    for (const key of Object.keys(defaults) as Array<keyof AppSettings>) {
      const candidate = deepMergeSettings(defaults[key], stored[key])
      // One stale/bad section should not erase valid settings from every other
      // section. Validate each merged section independently, then validate the
      // final document as a guard against future schema changes.
      const parsedSection = appSettingsSchema.shape[key].safeParse(candidate)
      merged[key] = parsedSection.success ? parsedSection.data : defaults[key]
    }
    const parsed = appSettingsSchema.safeParse(merged)
    return parsed.success ? parsed.data : defaults
  },

  save(db: AppDatabase, settings: AppSettings): void {
    db.run(
      `INSERT INTO app_settings (key, value) VALUES ('app', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [JSON.stringify(settings)]
    )
  }
}

// ---------------------------------------------------------------- helpers ---

/**
 * Counts for every project in three queries instead of three per project.
 *
 * The dashboard asks for this list on load and after every project event, so
 * the version with a query per project per table turned a 26-project workspace
 * into 78 round trips (measured at 13.9 ms; the grouped version is ~1 ms).
 */
function countsByProject(db: AppDatabase, table: 'clip_candidates' | 'clips' | 'renders'): Map<string, number> {
  const rows = db.all<{ project_id: string; n: number }>(`SELECT project_id, COUNT(*) as n FROM ${table} GROUP BY project_id`)
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.project_id, row.n)
  return counts
}

export function projectSummaries(db: AppDatabase, projects: Project[]): import('@shared/types').ProjectSummary[] {
  if (projects.length === 0) return []
  const candidateCounts = countsByProject(db, 'clip_candidates')
  const clipCounts = countsByProject(db, 'clips')
  const renderCounts = countsByProject(db, 'renders')
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    status: p.status,
    statusMessage: p.statusMessage,
    duration: p.duration,
    sourceFilename: p.sourceFilename,
    sourceType: p.sourceType,
    hasAudio: p.hasAudio,
    candidateCount: candidateCounts.get(p.id) ?? 0,
    clipCount: clipCounts.get(p.id) ?? 0,
    renderCount: renderCounts.get(p.id) ?? 0,
    thumbnail: null
  }))
}

export function defaultClipCaptionStyle(settings: AppSettings): string {
  return settings.captions.defaultStyleId || DEFAULT_CAPTION_STYLE_ID
}

export function resolveDurationPreset(preset: string | undefined): ProjectSettings['durationPreset'] {
  const found = DURATION_RANGES.find((r) => r.id === preset)
  return (found?.id as ProjectSettings['durationPreset']) ?? 'medium'
}

// -------------------------------------------------------- media assets ---

interface AssetRow {
  id: string; project_id: string; name: string; original_name: string; media_type: string
  media_path: string; thumbnail_path: string | null; duration: number | null; width: number | null
  height: number | null; audio_channels: number | null; size_bytes: number; created_at: string
}

function mapAsset(row: AssetRow): ProjectAsset {
  return {
    id: row.id, projectId: row.project_id, name: row.name, originalName: row.original_name,
    mediaType: row.media_type as ProjectAsset['mediaType'], path: row.media_path,
    thumbnailPath: row.thumbnail_path, duration: row.duration, width: row.width, height: row.height,
    audioChannels: row.audio_channels, sizeBytes: row.size_bytes, missing: !fs.existsSync(row.media_path),
    createdAt: row.created_at
  }
}

export const assetsRepo = {
  create(db: AppDatabase, asset: Omit<ProjectAsset, 'missing'>): ProjectAsset {
    db.run(
      `INSERT INTO project_assets (id, project_id, name, original_name, media_type, media_path, thumbnail_path,
        duration, width, height, audio_channels, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [asset.id, asset.projectId, asset.name, asset.originalName, asset.mediaType, asset.path, asset.thumbnailPath,
        asset.duration, asset.width, asset.height, asset.audioChannels, asset.sizeBytes, asset.createdAt]
    )
    return { ...asset, missing: false }
  },
  get(db: AppDatabase, id: string): ProjectAsset | null {
    const row = db.get<AssetRow>('SELECT * FROM project_assets WHERE id = ?', [id])
    return row ? mapAsset(row) : null
  },
  list(db: AppDatabase, projectId: string): ProjectAsset[] {
    return db.all<AssetRow>('SELECT * FROM project_assets WHERE project_id = ? ORDER BY created_at, name', [projectId]).map(mapAsset)
  },
  rename(db: AppDatabase, id: string, name: string): ProjectAsset | null {
    db.run('UPDATE project_assets SET name = ? WHERE id = ?', [name.trim(), id])
    return this.get(db, id)
  },
  updateMedia(db: AppDatabase, id: string, values: { originalName: string; path: string; thumbnailPath: string | null; duration: number | null; width: number | null; height: number | null; audioChannels: number | null; sizeBytes: number }): ProjectAsset | null {
    db.run('UPDATE project_assets SET original_name = ?, media_path = ?, thumbnail_path = ?, duration = ?, width = ?, height = ?, audio_channels = ?, size_bytes = ? WHERE id = ?',
      [values.originalName, values.path, values.thumbnailPath, values.duration, values.width, values.height, values.audioChannels, values.sizeBytes, id])
    return this.get(db, id)
  },
  delete(db: AppDatabase, id: string): ProjectAsset | null {
    const asset = this.get(db, id)
    if (asset) db.run('DELETE FROM project_assets WHERE id = ?', [id])
    return asset
  }
}

const emptyTimeline: ClipTimeline = { tracks: [], items: [], snapEnabled: true }
export const clipTimelineRepo = {
  get(db: AppDatabase, clipId: string): ClipTimeline {
    const row = db.get<{ document: string }>('SELECT document FROM clip_timelines WHERE clip_id = ?', [clipId])
    return row ? parseJson<ClipTimeline>(row.document, emptyTimeline) : emptyTimeline
  },
  save(db: AppDatabase, clipId: string, document: ClipTimeline): ClipTimeline {
    db.run(
      `INSERT INTO clip_timelines (clip_id, document, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(clip_id) DO UPDATE SET document = excluded.document, updated_at = excluded.updated_at`,
      [clipId, JSON.stringify(document), now()]
    )
    return document
  }
}
