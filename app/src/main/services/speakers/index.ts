import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '@shared/errors'
import type { Speaker, TranscriptSegment } from '@shared/types'
import type { AppContext } from '../app-context'
import { projectsRepo, segmentsRepo, speakersRepo } from '../database/repositories'
import { resolveFfmpeg, runProcess, whichSync } from '../media/ffmpeg'
import { getSettings } from '../settings'

const RESULT_PREFIX = 'CLIPWRIGHT_DIARIZATION_RESULT:'
const PROGRESS_PREFIX = 'CLIPWRIGHT_DIARIZATION_PROGRESS:'

export interface SpeakerDiarizationAvailability {
  python: string | null
  installed: boolean
  message: string
}

function pythonCandidates(): string[] {
  return process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']
}

/** Detect an optional, local-only speaker-embedding package in each Python interpreter on PATH. */
export async function detectLocalSpeakerDiarization(): Promise<SpeakerDiarizationAvailability> {
  const found: Array<{ command: string; binary: string }> = []
  for (const command of pythonCandidates()) {
    const binary = whichSync(command)
    if (!binary || found.some((entry) => entry.binary === binary)) continue
    found.push({ command, binary })
    try {
      const result = await runProcess(
        binary,
        ['-c', 'import resemblyzer; import numpy; import soundfile; import scipy; print("CLIPWRIGHT_RESEMBLYZER_OK")'],
        { timeoutMs: 20_000 }
      )
      if (result.code === 0 && result.stdout.includes('CLIPWRIGHT_RESEMBLYZER_OK')) {
        return {
          python: binary,
          installed: true,
          message: `Local speaker identification is available (${binary}).`
        }
      }
    } catch {
      // Keep trying: Windows systems often have multiple Python installations.
    }
  }

  if (found.length === 0) {
    return {
      python: null,
      installed: false,
      message: 'Python was not found. Install Python 3.9+ from python.org, add it to PATH, then install resemblyzer.'
    }
  }
  const first = found[0]
  const other = found.length > 1
    ? ` Other interpreters were found too: ${found.slice(1).map((entry) => entry.binary).join(', ')}.`
    : ''
  return {
    python: first.binary,
    installed: false,
    message: `Resemblyzer is not installed for this Python. Run: "${first.binary}" -m pip install resemblyzer.${other}`
  }
}

export interface DiarizationOptions {
  projectId: string
  onEvent: (stage: string, progress: number | null, message: string) => void
  signal: AbortSignal
}

interface WorkerAssignment {
  segmentId: number
  speaker: number | null
}

interface WorkerResult {
  assignments: WorkerAssignment[]
  speakerCount: number
}

/** Run local voice-similarity clustering over the existing transcript, preserving the transcript text/timing. */
export async function runSpeakerIdentification(
  ctx: AppContext,
  opts: DiarizationOptions
): Promise<{ assignedSegments: number; speakers: Speaker[] }> {
  const project = projectsRepo.get(ctx.db, opts.projectId)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
  if (!project.hasAudio || !project.sourcePath) {
    throw new AppError('AUDIO_NOT_FOUND', 'This project has no source audio to analyze.')
  }
  if (!fs.existsSync(project.sourcePath)) {
    throw new AppError('SOURCE_MISSING', 'The project source file is not available.', 'Relink the original media before identifying speakers.')
  }

  const segments = segmentsRepo.listForProject(ctx.db, opts.projectId)
  if (segments.length === 0) {
    throw new AppError('TRANSCRIPT_MISSING', 'Add or import a transcript before identifying speakers.')
  }
  if (segments.length < 2) {
    throw new AppError('TRANSCRIPT_TOO_SHORT', 'At least two transcript segments are needed to compare voices.')
  }

  opts.onEvent('checking-local-model', 0.01, 'Checking local speaker model')
  const local = await detectLocalSpeakerDiarization()
  if (!local.installed || !local.python) {
    throw new AppError('DIARIZATION_UNAVAILABLE', local.message, 'Speaker identification stays on this device. Install the optional resemblyzer package, then try again.')
  }
  const settings = getSettings(ctx)
  const ffmpeg = await resolveFfmpeg(settings.advanced.ffmpegPath)
  if (!ffmpeg) throw new AppError('FFMPEG_NOT_FOUND', 'FFmpeg was not found.', 'Configure FFmpeg in Settings → Advanced.')

  const ordered = [...segments].sort((a, b) => a.startTime - b.startTime)
  const firstTime = Math.max(0, ordered[0].startTime)
  const lastTime = Math.max(firstTime + 0.2, ordered[ordered.length - 1].endTime)
  const sourceDuration = project.duration && project.duration > 0 ? project.duration : lastTime
  const audioStart = Math.min(firstTime, Math.max(0, sourceDuration - 0.2))
  const audioEnd = Math.min(sourceDuration, Math.max(audioStart + 0.2, lastTime))
  const audioDuration = Math.max(0.2, audioEnd - audioStart)
  const scratchDir = path.join(ctx.projectDir(opts.projectId), 'cache')
  await fs.promises.mkdir(scratchDir, { recursive: true })
  const runId = crypto.randomUUID()
  const audioPath = path.join(scratchDir, `speaker-id-${runId}.tmp.wav`)
  const segmentsPath = path.join(scratchDir, `speaker-id-${runId}.tmp.json`)

  try {
    opts.onEvent('extracting-audio', 0.03, 'Preparing a local voice-analysis copy')
    let ffmpegPending = ''
    const extraction = await runProcess(ffmpeg.path, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', audioStart.toFixed(3), '-i', project.sourcePath,
      '-t', audioDuration.toFixed(3), '-map', '0:a:0', '-vn',
      '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
      '-progress', 'pipe:1', '-nostats', audioPath
    ], {
      signal: opts.signal,
      timeoutMs: 60 * 60 * 1000,
      onStdout: (chunk) => {
        ffmpegPending += chunk
        const lines = ffmpegPending.split(/\r?\n/)
        ffmpegPending = lines.pop() ?? ''
        for (const line of lines) {
          const match = line.match(/^out_time_ms=(\d+)/)
          if (!match) continue
          const progress = Math.min(0.18, 0.03 + (Number(match[1]) / 1_000_000 / audioDuration) * 0.15)
          opts.onEvent('extracting-audio', progress, 'Preparing a local voice-analysis copy')
        }
      }
    })
    if (extraction.code !== 0 || !fs.existsSync(audioPath)) {
      throw new AppError('AUDIO_EXTRACTION_FAILED', 'FFmpeg could not prepare the audio for speaker analysis.', 'Check that the source has a readable audio stream.', extraction.stderr.slice(-2500))
    }

    const workerSegments = ordered.map((segment) => ({
      id: segment.id,
      start: Math.max(0, segment.startTime - audioStart),
      end: Math.max(0, segment.endTime - audioStart)
    }))
    await fs.promises.writeFile(segmentsPath, JSON.stringify(workerSegments), 'utf-8')
    const scriptName = 'diarize_resemblyzer.py'
    const scriptCandidates = [
      path.join(ctx.resourcesDir, 'python', scriptName),
      path.resolve(ctx.resourcesDir, '..', 'scripts', 'python', scriptName)
    ]
    const scriptPath = scriptCandidates.find((candidate) => fs.existsSync(candidate))
    if (!scriptPath) {
      throw new AppError('SCRIPT_MISSING', 'The local speaker-identification script is missing from the application resources.', `Checked: ${scriptCandidates.join(', ')}`)
    }

    opts.onEvent('loading-local-model', 0.2, 'Loading the local voice model (first use may download its weights)')
    let stderrBuffer = ''
    const worker = await runProcess(local.python, ['-u', scriptPath, '--audio', audioPath, '--segments', segmentsPath], {
      signal: opts.signal,
      timeoutMs: 60 * 60 * 1000,
      onStderr: (chunk) => {
        stderrBuffer = (stderrBuffer + chunk).slice(-8000)
        const lines = stderrBuffer.split(/\r?\n/)
        stderrBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith(PROGRESS_PREFIX)) continue
          try {
            const event = JSON.parse(line.slice(PROGRESS_PREFIX.length)) as { progress?: number; message?: string }
            if (typeof event.progress === 'number') {
              const progress = Math.max(0.2, Math.min(0.93, 0.2 + event.progress * 0.73))
              opts.onEvent('clustering-voices', progress, event.message || 'Comparing local voice embeddings')
            }
          } catch {
            // Ignore malformed progress records; the final result is validated below.
          }
        }
      }
    })
    if (worker.code !== 0) {
      const detail = `${worker.stdout.slice(-3000)}\n${worker.stderr.slice(-3000)}`.trim()
      throw new AppError('DIARIZATION_FAILED', 'Local speaker identification did not finish.', 'Check the optional Python model installation and try again.', detail)
    }
    const resultLine = worker.stdout.split(/\r?\n/).reverse().find((line) => line.startsWith(RESULT_PREFIX))
    if (!resultLine) {
      throw new AppError('DIARIZATION_FAILED', 'The local speaker model returned no result.', 'Check the Python console output and try again.', worker.stdout.slice(-3000))
    }
    let result: WorkerResult
    try {
      result = JSON.parse(resultLine.slice(RESULT_PREFIX.length)) as WorkerResult
    } catch {
      throw new AppError('DIARIZATION_FAILED', 'The local speaker model returned an unreadable result.', undefined, resultLine.slice(-3000))
    }

    if (!result || !Array.isArray(result.assignments) || result.assignments.length === 0 || result.assignments.some((entry) =>
      !Number.isInteger(entry.segmentId) || (entry.speaker !== null && !Number.isInteger(entry.speaker))
    )) {
      throw new AppError('DIARIZATION_FAILED', 'The local speaker model returned invalid segment assignments.', 'Check the local Python model installation and try again.')
    }

    const clusterOrder: number[] = []
    for (const assignment of result.assignments) {
      if (typeof assignment.speaker === 'number' && !clusterOrder.includes(assignment.speaker)) clusterOrder.push(assignment.speaker)
    }
    clusterOrder.sort((a, b) => {
      const firstA = result.assignments.findIndex((entry) => entry.speaker === a)
      const firstB = result.assignments.findIndex((entry) => entry.speaker === b)
      return firstA - firstB
    })
    const labelForCluster = new Map(clusterOrder.map((cluster, index) => [cluster, `speaker-${index + 1}`]))
    const resultById = new Map(result.assignments.map((entry) => [entry.segmentId, entry]))
    const allAssignments = segments.map((segment) => {
      const speaker = resultById.get(segment.id)?.speaker
      return { segmentId: segment.id, speaker: typeof speaker === 'number' ? labelForCluster.get(speaker) ?? null : null }
    })
    const labels = [...new Set(allAssignments.map((assignment) => assignment.speaker).filter((label): label is string => label !== null))]

    opts.onEvent('saving-labels', 0.96, 'Saving editable speaker labels')
    speakersRepo.ensureLabels(ctx.db, opts.projectId, labels)
    segmentsRepo.updateSpeakersForProject(ctx.db, opts.projectId, allAssignments)
    const speakers = speakersRepo.listForProject(ctx.db, opts.projectId)
    ctx.logger.info('speakers', 'identify', `project=${opts.projectId} segments=${allAssignments.length} speakers=${labels.length}`)
    opts.onEvent('complete', 1, `Assigned ${allAssignments.filter((assignment) => assignment.speaker).length} transcript segments to ${labels.length} speaker${labels.length === 1 ? '' : 's'}`)
    return {
      assignedSegments: allAssignments.filter((assignment) => assignment.speaker !== null).length,
      speakers
    }
  } finally {
    await Promise.all([
      fs.promises.rm(audioPath, { force: true }),
      fs.promises.rm(segmentsPath, { force: true })
    ])
  }
}

/** Update one segment's speaker assignment after explicit user correction. */
export function updateTranscriptSpeaker(
  ctx: AppContext,
  projectId: string,
  segmentId: number,
  speakerLabel: string | null
): TranscriptSegment {
  if (speakerLabel !== null) speakersRepo.ensureLabels(ctx.db, projectId, [speakerLabel])
  const updated = segmentsRepo.updateSpeakerForSegment(ctx.db, projectId, segmentId, speakerLabel)
  if (!updated) throw new AppError('TRANSCRIPT_SEGMENT_NOT_FOUND', 'That transcript segment no longer exists.')
  const segment = segmentsRepo.listForProject(ctx.db, projectId).find((entry) => entry.id === segmentId)
  if (!segment) throw new AppError('TRANSCRIPT_SEGMENT_NOT_FOUND', 'That transcript segment no longer exists.')
  return segment
}

/** Rename a local speaker group; this changes only its display name, not the transcript or source audio. */
export function renameProjectSpeaker(ctx: AppContext, projectId: string, label: string, name: string): Speaker {
  if (!projectsRepo.get(ctx.db, projectId)) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
  const speaker = speakersRepo.rename(ctx.db, projectId, label, name)
  if (!speaker) throw new AppError('SPEAKER_NOT_FOUND', 'That speaker label no longer exists.')
  return speaker
}
