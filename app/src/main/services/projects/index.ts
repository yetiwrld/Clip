import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '@shared/errors'
import type { Project, ProjectSettings, ProjectStorage, ProjectSummary, WordTiming } from '@shared/types'
import type { AppContext } from '../app-context'
import { candidatesRepo, projectsRepo, projectSummaries, segmentsRepo, speakersRepo, resolveDurationPreset } from '../database/repositories'
import { getBinaries, inspectMedia, isSupportedMediaFile } from '../media/inspect'
import { generateThumbnail } from '../media/thumbnails'
import { getSourceProviders, getYtDlpProvider, fetchUrlMeta, parseUrlSafe, type DownloadEvents } from '../media/url-providers'

/**
 * Project lifecycle: create/list/get/rename/delete, media import (file or
 * URL), storage stats. All on-disk state lives under the project directory;
 * originals are copied in and never modified (spec §50).
 */

function streamCopy(from: string, to: string, onProgress?: (copied: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const total = fs.statSync(from).size
    fs.mkdirSync(path.dirname(to), { recursive: true })
    const read = fs.createReadStream(from)
    const write = fs.createWriteStream(to)
    let copied = 0
    let last = 0
    read.on('data', (chunk) => {
      copied += chunk.length
      const now = Date.now()
      if (now - last > 150) {
        last = now
        onProgress?.(copied, total)
      }
    })
    read.on('error', reject)
    write.on('error', reject)
    write.on('finish', () => {
      onProgress?.(total, total)
      resolve()
    })
    read.pipe(write)
  })
}

function ensureProjectDirs(ctx: AppContext, projectId: string): void {
  const base = ctx.projectDir(projectId)
  for (const sub of ['source', 'transcription', 'analysis', 'clips', 'renders', 'thumbnails', 'cache', 'logs']) {
    fs.mkdirSync(path.join(base, sub), { recursive: true })
  }
}

export function createProject(ctx: AppContext, name: string): Project {
  const trimmed = name.trim() || 'Untitled project'
  const id = crypto.randomUUID()
  ensureProjectDirs(ctx, id)
  const settings: ProjectSettings = { durationPreset: 'medium', maxCandidates: 8 }
  const project = projectsRepo.create(ctx.db, id, trimmed, settings)
  projectsRepo.writeProjectJson(ctx, project)
  ctx.events.publish({ type: 'project:update', project })
  ctx.logger.info('projects', 'create', `id=${id} name="${trimmed}"`)
  return project
}

export function listProjects(ctx: AppContext): ProjectSummary[] {
  const projects = projectsRepo.list(ctx.db)
  const summaries = projectSummaries(ctx.db, projects)
  return summaries.map((s) => {
    const thumb = path.join(ctx.projectDir(s.id), 'thumbnails', 'source.jpg')
    return { ...s, thumbnail: fs.existsSync(thumb) ? thumb : null }
  })
}

export function getProject(ctx: AppContext, id: string): Project | null {
  return projectsRepo.get(ctx.db, id)
}

export function renameProject(ctx: AppContext, id: string, name: string): Project {
  const project = projectsRepo.get(ctx.db, id)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
  projectsRepo.update(ctx.db, id, { name: name.trim() || project.name })
  const updated = projectsRepo.get(ctx.db, id) as Project
  projectsRepo.writeProjectJson(ctx, updated)
  ctx.events.publish({ type: 'project:update', project: updated })
  return updated
}

export function deleteProject(ctx: AppContext, id: string, confirm: boolean): void {
  const project = projectsRepo.get(ctx.db, id)
  if (!project) return
  if (!confirm) {
    throw new AppError(
      'CONFIRMATION_REQUIRED',
      `Deleting "${project.name}" permanently removes its imported source, transcripts, clips and renders from this workspace.`,
      'Confirm the deletion to continue. Exported files in the exports folder are kept.'
    )
  }
  ctx.db.transaction(() => {
    projectsRepo.delete(ctx.db, id)
  })
  try {
    // maxRetries/retryDelay: on Windows, antivirus/indexers can hold brief
    // handles on freshly-written renders (EPERM); retrying absorbs that.
    fs.rmSync(ctx.projectDir(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch (err) {
    ctx.logger.warn('projects', 'delete', `could not remove directory for ${id}`, String(err))
  }
  ctx.logger.info('projects', 'delete', `id=${id}`)
}

export function updateProjectSettings(ctx: AppContext, id: string, patch: Partial<ProjectSettings>): Project {
  const project = projectsRepo.get(ctx.db, id)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
  const settings: ProjectSettings = {
    durationPreset: resolveDurationPreset(patch.durationPreset ?? project.settings.durationPreset),
    maxCandidates: Math.min(40, Math.max(1, patch.maxCandidates ?? project.settings.maxCandidates))
  }
  projectsRepo.update(ctx.db, id, { settings: JSON.stringify(settings) })
  const updated = projectsRepo.get(ctx.db, id) as Project
  projectsRepo.writeProjectJson(ctx, updated)
  return updated
}

// ------------------------------------------------------------------ import --

export interface ImportProgress {
  (stage: string, progress: number | null, message: string): void
}

export async function importMediaFile(ctx: AppContext, projectId: string, filePath: string, onProgress?: ImportProgress): Promise<Project> {
  const project = projectsRepo.get(ctx.db, projectId)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')

  if (!fs.existsSync(filePath)) {
    projectsRepo.setStatus(ctx.db, projectId, 'import_failed', 'File not found')
    throw new AppError('FILE_NOT_FOUND', `The file "${path.basename(filePath)}" does not exist.`, 'Check the location and try again.')
  }
  if (!isSupportedMediaFile(filePath)) {
    const ext = path.extname(filePath) || '(no extension)'
    projectsRepo.setStatus(ctx.db, projectId, 'import_failed', `Unsupported file type ${ext}`)
    throw new AppError(
      'UNSUPPORTED_FORMAT',
      `".${ext.replace('.', '')}" files are not supported.`,
      'Supported: MP4, MOV, MKV, WebM, AVI, M4V, MPG, WMV plus common audio formats.'
    )
  }

  projectsRepo.setStatus(ctx.db, projectId, 'importing', 'Copying media into the project')
  ctx.events.publish({ type: 'project:update', project: { ...project, status: 'importing' } })

  try {
    const { ffmpeg, ffprobe } = await getBinaries(ctx)

    // Inspect BEFORE copying so bad files fail fast
    const info = await inspectMedia(ffprobe.path, filePath)
    if (!info.hasAudio) {
      ctx.logger.warn('projects', 'import', 'no audio track detected')
    }

    const ext = path.extname(filePath).toLowerCase() || '.mp4'
    const dest = path.join(ctx.projectDir(projectId), 'source', `source${ext}`)
    await streamCopy(filePath, dest, (copied, total) => {
      onProgress?.('copying', total > 0 ? copied / total : null, 'Copying media into the project')
    })

    // Re-inspect the stored copy (authoritative)
    const storedInfo = await inspectMedia(ffprobe.path, dest)

    projectsRepo.update(ctx.db, projectId, {
      source_type: 'file',
      source_mode: 'full',
      source_path: dest,
      source_filename: path.basename(filePath),
      source_url: null,
      duration: storedInfo.duration,
      width: storedInfo.width,
      height: storedInfo.height,
      fps: storedInfo.fps,
      has_audio: storedInfo.hasAudio ? 1 : 0,
      video_codec: storedInfo.videoCodec,
      audio_codec: storedInfo.audioCodec,
      size_bytes: storedInfo.sizeBytes,
      rotation: storedInfo.rotation,
      status: 'ready',
      status_message: storedInfo.hasAudio ? null : 'No audio track — transcription needs audio. Import a transcript file to continue.'
    })

    // Poster thumbnail
    try {
      await generateThumbnail(ffmpeg.path, dest, path.join(ctx.projectDir(projectId), 'thumbnails', 'source.jpg'), {
        at: Math.min(storedInfo.duration * 0.25, 60)
      })
    } catch (err) {
      ctx.logger.warn('projects', 'import', 'thumbnail generation failed', String(err))
    }

    const updated = projectsRepo.get(ctx.db, projectId)
    if (!updated) {
      // The project was deleted while the import was running (B-008).
      throw new AppError('PROJECT_DELETED', 'This project was deleted during import.', 'Nothing was corrupted — the import was discarded.')
    }
    projectsRepo.writeProjectJson(ctx, updated)
    ctx.events.publish({ type: 'project:update', project: updated })
    ctx.logger.info('projects', 'import.file', `id=${projectId} file=${path.basename(filePath)} dur=${storedInfo.duration.toFixed(1)}s`)
    return updated
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed'
    projectsRepo.setStatus(ctx.db, projectId, 'import_failed', message)
    ctx.logger.error('projects', 'import.file', `id=${projectId} failed`, String(err))
    throw err
  }
}

export async function importMediaUrl(
  ctx: AppContext,
  projectId: string,
  url: string,
  taskSignal?: AbortSignal,
  onProgress?: ImportProgress
): Promise<Project> {
  const project = projectsRepo.get(ctx.db, projectId)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
  const parsed = parseUrlSafe(url)

  const providers = getSourceProviders()
  const provider = providers.find((p) => p.canHandle(url))
  if (!provider) {
    const ytdlp = providers.find((p) => p.id === 'yt-dlp') as { isInstalled(): boolean } | undefined
    throw new AppError(
      'URL_PROVIDER_UNAVAILABLE',
      'This URL cannot be imported with the current download providers.',
      ytdlp && !ytdlp.isInstalled()
        ? 'For video sites (YouTube, etc.), install yt-dlp on your system and make sure it is on your PATH. You are responsible for having the right to download the content. Direct links to .mp4/.webm files work without yt-dlp.'
        : 'Use a direct link to a media file (.mp4, .webm, …) or install yt-dlp.'
    )
  }

  projectsRepo.setStatus(ctx.db, projectId, 'importing', `Downloading via ${provider.label}`)
  const controller = new AbortController()
  if (taskSignal?.aborted) controller.abort()
  else taskSignal?.addEventListener('abort', () => controller.abort(), { once: true })
  activeUrlImports.set(projectId, controller)

  try {
    const { ffmpeg, ffprobe } = await getBinaries(ctx)
    const dest = path.join(ctx.projectDir(projectId), 'source', 'source.mp4')

    await provider.download(url, dest, {
      signal: controller.signal,
      ffmpegPath: ffmpeg.path,
      onProgress: (downloaded, total) => {
        const downloadedMb = (downloaded / 1_000_000).toFixed(2)
        const totalMb = total && total > 0 ? (total / 1_000_000).toFixed(2) : null
        onProgress?.(
          'downloading',
          total && total > 0 ? Math.min(0.99, downloaded / total) : null,
          totalMb ? `Downloading ${downloadedMb} / ${totalMb} MB` : `Downloading ${downloadedMb} MB`
        )
      }
    })

    const info = await inspectMedia(ffprobe.path, dest)
    const meta = await fetchUrlMeta(url).catch(() => null)

    projectsRepo.update(ctx.db, projectId, {
      source_type: 'url',
      source_mode: 'full',
      source_path: dest,
      source_url: url,
      source_filename: meta?.title ?? (path.basename(parsed.pathname) || 'download.mp4'),
      duration: info.duration,
      width: info.width,
      height: info.height,
      fps: info.fps,
      has_audio: info.hasAudio ? 1 : 0,
      video_codec: info.videoCodec,
      audio_codec: info.audioCodec,
      size_bytes: info.sizeBytes,
      rotation: info.rotation,
      status: 'ready',
      status_message: info.hasAudio ? null : 'No audio track — transcription needs audio. Import a transcript file to continue.'
    })

    try {
      await generateThumbnail(ffmpeg.path, dest, path.join(ctx.projectDir(projectId), 'thumbnails', 'source.jpg'), {
        at: Math.min(info.duration * 0.25, 60)
      })
    } catch {
      /* non-fatal */
    }

    const updated = projectsRepo.get(ctx.db, projectId)
    if (!updated) {
      // The project was deleted while the download was running (B-008).
      throw new AppError('PROJECT_DELETED', 'This project was deleted during import.', 'Nothing was corrupted — the import was discarded.')
    }
    projectsRepo.writeProjectJson(ctx, updated)
    ctx.events.publish({ type: 'project:update', project: updated })
    ctx.logger.info('projects', 'import.url', `id=${projectId} provider=${provider.id}`)
    return updated
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed'
    projectsRepo.setStatus(ctx.db, projectId, 'import_failed', message)
    ctx.logger.error('projects', 'import.url', `id=${projectId} failed`, String(err))
    throw err
  } finally {
    activeUrlImports.delete(projectId)
  }
}


/**
 * Audio-first URL import. It stores one audio-only stream so transcription and
 * moment discovery can happen locally without downloading the video track.
 */
export async function importMediaUrlAudio(
  ctx: AppContext,
  projectId: string,
  url: string,
  taskSignal?: AbortSignal,
  onProgress?: ImportProgress
): Promise<Project> {
  const project = projectsRepo.get(ctx.db, projectId)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
  if (project.sourcePath) {
    throw new AppError('SOURCE_ALREADY_IMPORTED', 'This project already has source media.', 'Create a new project to keep the current source and run audio-first discovery separately.')
  }
  parseUrlSafe(url)
  const provider = getYtDlpProvider()
  if (!provider) {
    throw new AppError(
      'YTDLP_MISSING',
      'Audio-first URL discovery needs yt-dlp.',
      'Install yt-dlp and make sure it is on your PATH. This mode does not download the full video as a fallback.'
    )
  }

  projectsRepo.setStatus(ctx.db, projectId, 'importing', 'Downloading audio only for local discovery')
  ctx.events.publish({ type: 'project:update', project: { ...project, status: 'importing', statusMessage: 'Downloading audio only for local discovery' } })
  let audioPath: string | null = null
  try {
    const { ffprobe } = await getBinaries(ctx)
    const meta = await provider.fetchMeta(url, taskSignal).catch(() => null)
    const audioBase = path.join(ctx.projectDir(projectId), 'source', `audio-source-${crypto.randomUUID()}.m4a`)
    const events: DownloadEvents = {
      signal: taskSignal,
      onProgress: (downloaded, total) => reportDownloadProgress(onProgress, downloaded, total, 'Downloading audio only', 'audio-download')
    }
    audioPath = await provider.downloadAudio(url, audioBase, events)
    const info = await inspectMedia(ffprobe.path, audioPath, { allowAudioOnly: true })
    if (info.hasVideo || !info.hasAudio) {
      throw new AppError('AUDIO_ONLY_EXPECTED', 'The low-data audio download did not produce an audio-only source.')
    }
    const urlPath = parseUrlSafe(url).pathname
    const updatedFields = {
      source_type: 'url',
      source_mode: 'audio-first',
      source_path: audioPath,
      source_filename: meta?.title ?? (path.basename(urlPath) || 'Audio-only URL source'),
      source_url: url,
      duration: info.duration,
      width: null,
      height: null,
      fps: null,
      has_audio: 1,
      video_codec: null,
      audio_codec: info.audioCodec,
      size_bytes: info.sizeBytes,
      rotation: 0,
      status: 'ready' as const,
      status_message: null
    }
    projectsRepo.update(ctx.db, projectId, updatedFields)
    const updated = projectsRepo.get(ctx.db, projectId)
    if (!updated) throw new AppError('PROJECT_DELETED', 'This project was deleted during the audio download.')
    projectsRepo.writeProjectJson(ctx, updated)
    ctx.events.publish({ type: 'project:update', project: updated })
    ctx.logger.info('projects', 'import.url.audio-first', `id=${projectId} provider=${provider.id} bytes=${info.sizeBytes}`)
    return updated
  } catch (err) {
    if (audioPath && fs.existsSync(audioPath)) {
      try { fs.unlinkSync(audioPath) } catch { /* best effort */ }
    }
    const message = err instanceof Error ? err.message : 'Audio-only download failed'
    projectsRepo.setStatus(ctx.db, projectId, 'import_failed', message)
    const updated = projectsRepo.get(ctx.db, projectId)
    if (updated) ctx.events.publish({ type: 'project:update', project: updated })
    ctx.logger.error('projects', 'import.url.audio-first', `id=${projectId} failed`, String(err))
    throw err
  }
}

/** Import a manually selected URL time range, and never fetch the whole source. */
export async function importMediaUrlSection(
  ctx: AppContext,
  projectId: string,
  url: string,
  startTime: number,
  endTime: number,
  taskSignal?: AbortSignal,
  onProgress?: ImportProgress
): Promise<Project> {
  const project = projectsRepo.get(ctx.db, projectId)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
  if (project.sourcePath) {
    throw new AppError('SOURCE_ALREADY_IMPORTED', 'This project already has source media.', 'Create a new project to download a different time range.')
  }
  parseUrlSafe(url)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime) {
    throw new AppError('SECTION_RANGE_INVALID', 'The selected download range is invalid.', 'Choose an end time later than the start time.')
  }
  const provider = getYtDlpProvider()
  if (!provider) {
    throw new AppError(
      'YTDLP_MISSING',
      'Time-range URL downloads need yt-dlp.',
      'Install yt-dlp and make sure it is on your PATH. Clipwright will not download the full video as a fallback.'
    )
  }

  projectsRepo.setStatus(ctx.db, projectId, 'importing', 'Downloading only the selected video section')
  ctx.events.publish({ type: 'project:update', project: { ...project, status: 'importing', statusMessage: 'Downloading only the selected video section' } })
  const destBase = path.join(ctx.projectDir(projectId), 'source', `section-${crypto.randomUUID()}.mp4`)
  let dest: string | null = null
  try {
    const { ffmpeg, ffprobe } = await getBinaries(ctx)
    const events: DownloadEvents = {
      signal: taskSignal,
      ffmpegPath: ffmpeg.path,
      onProgress: (downloaded, total) => reportDownloadProgress(onProgress, downloaded, total, 'Downloading selected section', 'section-download')
    }
    dest = await provider.downloadSection(url, startTime, endTime, destBase, events)
    const info = await inspectMedia(ffprobe.path, dest)
    if (!info.hasVideo) throw new AppError('SECTION_NO_VIDEO', 'The selected URL section did not contain a video track.')
    const meta = await provider.fetchMeta(url, taskSignal).catch(() => null)
    projectsRepo.update(ctx.db, projectId, {
      source_type: 'url',
      source_mode: 'section',
      source_path: dest,
      source_filename: meta?.title ?? (path.basename(parseUrlSafe(url).pathname) || 'URL section'),
      source_url: url,
      duration: info.duration,
      width: info.width,
      height: info.height,
      fps: info.fps,
      has_audio: info.hasAudio ? 1 : 0,
      video_codec: info.videoCodec,
      audio_codec: info.audioCodec,
      size_bytes: info.sizeBytes,
      rotation: info.rotation,
      status: 'ready',
      status_message: null
    })
    try {
      await generateThumbnail(ffmpeg.path, dest, path.join(ctx.projectDir(projectId), 'thumbnails', 'source.jpg'), {
        at: Math.min(info.duration * 0.25, 60)
      })
    } catch (err) {
      ctx.logger.warn('projects', 'import.url.section', 'thumbnail generation failed', String(err))
    }
    const updated = projectsRepo.get(ctx.db, projectId)
    if (!updated) throw new AppError('PROJECT_DELETED', 'This project was deleted during the section download.')
    projectsRepo.writeProjectJson(ctx, updated)
    ctx.events.publish({ type: 'project:update', project: updated })
    ctx.logger.info('projects', 'import.url.section', `id=${projectId} range=${startTime.toFixed(2)}-${endTime.toFixed(2)} bytes=${info.sizeBytes}`)
    return updated
  } catch (err) {
    try { if (dest && fs.existsSync(dest)) fs.unlinkSync(dest) } catch { /* best effort */ }
    const message = err instanceof Error ? err.message : 'Section download failed'
    projectsRepo.setStatus(ctx.db, projectId, 'import_failed', message)
    const updated = projectsRepo.get(ctx.db, projectId)
    if (updated) ctx.events.publish({ type: 'project:update', project: updated })
    ctx.logger.error('projects', 'import.url.section', `id=${projectId} failed`, String(err))
    throw err
  }
}

/**
 * Download a selected moment into its own normal video project so the editor,
 * preview and renderer keep using the existing local-file workflow.
 */
export async function createProjectFromUrlCandidateSection(
  ctx: AppContext,
  candidateId: string,
  taskSignal?: AbortSignal,
  onProgress?: ImportProgress
): Promise<{ projectId: string; candidateId: string }> {
  const candidate = candidatesRepo.get(ctx.db, candidateId)
  if (!candidate) throw new AppError('CANDIDATE_NOT_FOUND', 'That clip candidate no longer exists.')
  const parent = projectsRepo.get(ctx.db, candidate.projectId)
  if (!parent) throw new AppError('PROJECT_NOT_FOUND', 'The source project no longer exists.')
  if (parent.sourceMode !== 'audio-first' || !parent.sourceUrl) {
    throw new AppError('AUDIO_FIRST_REQUIRED', 'This moment is not from an audio-first URL project.')
  }
  const provider = getYtDlpProvider()
  if (!provider) {
    throw new AppError('YTDLP_MISSING', 'Fetching a video section needs yt-dlp.', 'Install yt-dlp. Clipwright will not download the full video as a fallback.')
  }
  if (!Number.isFinite(candidate.startTime) || !Number.isFinite(candidate.endTime) || candidate.endTime <= candidate.startTime) {
    throw new AppError('SECTION_RANGE_INVALID', 'This candidate has an invalid time range.')
  }
  const sourceDuration = parent.duration ?? candidate.endTime
  const padding = 4
  const sectionStart = Math.max(0, candidate.startTime - padding)
  const sectionEnd = Math.min(sourceDuration, candidate.endTime + padding)
  if (sectionEnd <= sectionStart) throw new AppError('SECTION_RANGE_INVALID', 'This candidate is outside the source duration.')

  const projectName = `${parent.name} — ${candidate.title}`.slice(0, 120)
  const child = createProject(ctx, projectName)
  projectsRepo.setStatus(ctx.db, child.id, 'importing', 'Fetching the selected video section')
  const destBase = path.join(ctx.projectDir(child.id), 'source', `section-${crypto.randomUUID()}.mp4`)
  try {
    const { ffmpeg, ffprobe } = await getBinaries(ctx)
    const events: DownloadEvents = {
      signal: taskSignal,
      ffmpegPath: ffmpeg.path,
      onProgress: (downloaded, total) => reportDownloadProgress(onProgress, downloaded, total, 'Fetching selected video section', 'section-download')
    }
    const dest = await provider.downloadSection(parent.sourceUrl, sectionStart, sectionEnd, destBase, events)
    const info = await inspectMedia(ffprobe.path, dest)
    if (!info.hasVideo) throw new AppError('SECTION_NO_VIDEO', 'The selected URL section did not contain a video track.')

    const sourceSegments = segmentsRepo.listForProject(ctx.db, parent.id)
    const childSegments = sourceSegments
      .filter((segment) => segment.endTime > sectionStart && segment.startTime < sectionEnd)
      .map((segment) => {
        const words: WordTiming[] | null = segment.words
          ? segment.words
              .filter((word) => word.end > sectionStart && word.start < sectionEnd)
              .map((word) => ({
                word: word.word,
                start: Math.max(0, word.start - sectionStart),
                end: Math.max(0, Math.min(sectionEnd, word.end) - sectionStart)
              }))
          : null
        return {
          startTime: Math.max(0, segment.startTime - sectionStart),
          endTime: Math.min(info.duration, segment.endTime - sectionStart),
          text: words?.length ? words.map((word) => word.word).join(' ').trim() : segment.text,
          speaker: segment.speaker,
          confidence: segment.confidence,
          words
        }
      })
      .filter((segment) => segment.endTime > segment.startTime)
    segmentsRepo.replaceForProject(ctx.db, child.id, childSegments)
    const mappedSegments = segmentsRepo.listForProject(ctx.db, child.id)

    const localStart = Math.max(0, Math.min(info.duration, candidate.startTime - sectionStart))
    const localEnd = Math.max(localStart, Math.min(info.duration, candidate.endTime - sectionStart))
    if (localEnd <= localStart) {
      throw new AppError('SECTION_RANGE_UNAVAILABLE', 'The downloaded section did not include the selected moment.', 'This source may not support accurate section seeking. The full video was not downloaded.')
    }
    const matchingSegments = mappedSegments.filter((segment) => segment.endTime > localStart && segment.startTime < localEnd)
    const childCandidates = candidatesRepo.replaceForProject(ctx.db, child.id, [{
      projectId: child.id,
      startTime: localStart,
      endTime: localEnd,
      startSegmentId: matchingSegments[0]?.id ?? mappedSegments[0]?.id ?? 0,
      endSegmentId: matchingSegments.at(-1)?.id ?? mappedSegments.at(-1)?.id ?? 0,
      title: candidate.title,
      hook: candidate.hook,
      transcriptExcerpt: candidate.transcriptExcerpt,
      reason: candidate.reason,
      clipType: candidate.clipType,
      scores: candidate.scores,
      overallScore: candidate.overallScore,
      scoreExplanation: candidate.scoreExplanation,
      provider: candidate.provider,
      momentKey: candidate.momentKey,
      rankInMoment: candidate.rankInMoment,
      status: 'discovered'
    }])

    const speakerLabels = [...new Set(childSegments.map((segment) => segment.speaker).filter((label): label is string => Boolean(label)))]
    speakersRepo.ensureLabels(ctx.db, child.id, speakerLabels)
    for (const sourceSpeaker of speakersRepo.listForProject(ctx.db, parent.id)) {
      if (speakerLabels.includes(sourceSpeaker.label) && sourceSpeaker.name) {
        speakersRepo.rename(ctx.db, child.id, sourceSpeaker.label, sourceSpeaker.name)
      }
    }

    projectsRepo.update(ctx.db, child.id, {
      source_type: 'url',
      source_mode: 'section',
      source_path: dest,
      source_filename: `${parent.sourceFilename ?? 'URL source'} — ${candidate.title}`.slice(0, 180),
      source_url: parent.sourceUrl,
      duration: info.duration,
      width: info.width,
      height: info.height,
      fps: info.fps,
      has_audio: info.hasAudio ? 1 : 0,
      video_codec: info.videoCodec,
      audio_codec: info.audioCodec,
      size_bytes: info.sizeBytes,
      rotation: info.rotation,
      status: 'analyzed',
      status_message: null
    })
    try {
      await generateThumbnail(ffmpeg.path, dest, path.join(ctx.projectDir(child.id), 'thumbnails', 'source.jpg'), {
        at: Math.min(info.duration * 0.25, 30)
      })
    } catch (err) {
      ctx.logger.warn('projects', 'import.url.moment-section', 'thumbnail generation failed', String(err))
    }
    const updated = projectsRepo.get(ctx.db, child.id)
    if (!updated) throw new AppError('PROJECT_DELETED', 'The selected section project was deleted during download.')
    projectsRepo.writeProjectJson(ctx, updated)
    ctx.events.publish({ type: 'project:update', project: updated })
    ctx.logger.info('projects', 'import.url.moment-section', `parent=${parent.id} child=${child.id} candidate=${candidate.id}`)
    return { projectId: child.id, candidateId: childCandidates[0].id }
  } catch (err) {
    projectsRepo.delete(ctx.db, child.id)
    try { fs.rmSync(ctx.projectDir(child.id), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* best effort */ }
    ctx.logger.error('projects', 'import.url.moment-section', `candidate=${candidate.id} failed`, String(err))
    throw err
  }
}

function reportDownloadProgress(onProgress: ImportProgress | undefined, downloaded: number, total: number | null, action: string, stage = 'downloading'): void {
  const downloadedMb = (downloaded / 1_000_000).toFixed(2)
  const totalMb = total && total > 0 ? (total / 1_000_000).toFixed(2) : null
  onProgress?.(
    stage,
    total && total > 0 ? Math.min(0.99, downloaded / total) : null,
    totalMb ? `${action}: ${downloadedMb} / ${totalMb} MB` : `${action}: ${downloadedMb} MB`
  )
}

const activeUrlImports = new Map<string, AbortController>()

export function cancelUrlImport(projectId: string): boolean {
  const controller = activeUrlImports.get(projectId)
  if (controller) {
    controller.abort()
    return true
  }
  return false
}

// ----------------------------------------------------------------- storage --

function dirSize(dir: string): number {
  let total = 0
  if (!fs.existsSync(dir)) return 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSize(p)
    else {
      try {
        total += fs.statSync(p).size
      } catch { /* race */ }
    }
  }
  return total
}

export function projectStorage(ctx: AppContext, projectId: string): ProjectStorage {
  const base = ctx.projectDir(projectId)
  const source = dirSize(path.join(base, 'source'))
  const assets = dirSize(path.join(base, 'assets'))
  const renders = dirSize(path.join(base, 'renders'))
  const thumbnails = dirSize(path.join(base, 'thumbnails'))
  const cache = dirSize(path.join(base, 'cache'))
  return { source, assets, renders, thumbnails, cache, total: source + assets + renders + thumbnails + cache }
}

export function workspaceStorage(ctx: AppContext): { projects: number; exports: number; total: number; free: number } {
  const projects = dirSize(ctx.paths.projectsDir)
  const exports_ = dirSize(ctx.paths.exportsDir)
  let free = 0
  try {
    const stat = fs.statfsSync(ctx.workspaceRoot)
    free = Number(stat.bsize) * Number(stat.bavail)
  } catch {
    /* not available */
  }
  return { projects, exports: exports_, total: projects + exports_, free }
}

/** Startup recovery: mark in-flight tasks as interrupted (spec §88). */
export function hasTranscript(ctx: AppContext, projectId: string): boolean {
  return segmentsRepo.countForProject(ctx.db, projectId) > 0
}
