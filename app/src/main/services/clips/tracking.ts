import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '@shared/errors'
import type { TrackingKeyframe } from '@shared/video/crop'
import type { AppContext } from '../app-context'
import { clipsRepo, projectsRepo } from '../database/repositories'
import { getSettings } from '../settings'
import { escapeFilterPath, resolveFfmpeg, runProcess } from '../media/ffmpeg'

/** Track a user-selected image patch through the clip using FFmpeg find_rect. */
export async function trackSubject(
  ctx: AppContext,
  clipId: string,
  input: { templatePgm: string; selectedTime: number; centerX: number; centerY: number; frameWidth: number; frameHeight: number }
): Promise<{ keyframes: TrackingKeyframe[]; found: number }> {
  const clip = clipsRepo.get(ctx.db, clipId)
  if (!clip) throw new AppError('CLIP_NOT_FOUND', 'That clip no longer exists.')
  const project = projectsRepo.get(ctx.db, clip.projectId)
  if (!project?.sourcePath) throw new AppError('SOURCE_MISSING', 'This project has no source media.')
  if (!Number.isFinite(input.selectedTime) || input.selectedTime < clip.startTime || input.selectedTime >= clip.endTime) {
    throw new AppError('TRACK_TARGET_TIME_INVALID', 'Select a visible frame inside the clip before tracking.')
  }
  if (!Number.isFinite(input.centerX) || input.centerX < 0 || input.centerX > 1 || !Number.isFinite(input.centerY) || input.centerY < 0 || input.centerY > 1) {
    throw new AppError('TRACK_TARGET_INVALID', 'The selected subject position is invalid.')
  }
  if (!Number.isInteger(input.frameWidth) || input.frameWidth < 16 || input.frameWidth > 8192 || !Number.isInteger(input.frameHeight) || input.frameHeight < 16 || input.frameHeight > 8192) {
    throw new AppError('TRACK_FRAME_SIZE_INVALID', 'Could not read the preview frame size. Reload the clip and try again.')
  }

  const pgm = Buffer.from(input.templatePgm, 'base64')
  if (pgm.length < 16 || pgm.length > 1_500_000 || pgm.subarray(0, 2).toString() !== 'P5') {
    throw new AppError('TRACK_TEMPLATE_INVALID', 'Could not read the selected target. Draw a slightly larger selection and try again.')
  }
  const ffmpeg = await resolveFfmpeg(getSettings(ctx).advanced.ffmpegPath || undefined)
  if (!ffmpeg) throw new AppError('FFMPEG_NOT_FOUND', 'FFmpeg is required for subject tracking.')

  const cacheDir = path.join(ctx.projectDir(clip.projectId), 'cache', 'tracking')
  fs.mkdirSync(cacheDir, { recursive: true })
  const stem = crypto.randomUUID()
  const objectPath = path.join(cacheDir, `${stem}.pgm`)
  const metadataPath = path.join(cacheDir, `${stem}.txt`)
  fs.writeFileSync(objectPath, pgm)

  try {
    const duration = clip.endTime - input.selectedTime
    // The filtergraph has its own option separators. Quote filenames as well
    // as escaping Windows drive colons, or FFmpeg parses `C:` as another
    // option and exits before tracking starts.
    // The editor may show a low-resolution preview proxy. Search at the exact
    // same dimensions used to capture the template so find_rect compares like
    // sized pixels instead of comparing a proxy-sized patch to 1080p/4K frames.
    const filter = `scale=${input.frameWidth}:${input.frameHeight}:flags=area,fps=2,find_rect=object='${escapeFilterPath(objectPath)}':threshold=0.65:mipmaps=5,metadata=mode=print:file='${escapeFilterPath(metadataPath)}'`
    const result = await runProcess(ffmpeg.path, [
      '-hide_banner', '-loglevel', 'error',
      '-ss', input.selectedTime.toFixed(3), '-t', duration.toFixed(3),
      '-i', project.sourcePath,
      '-vf', filter,
      '-an', '-f', 'null', '-'
    ], { timeoutMs: 300_000 })

    if (result.code !== 0) {
      ctx.logger.error('tracking', 'ffmpeg.failed', `clip=${clipId} code=${result.code}`, result.stderr.slice(-3000))
      throw new AppError('TRACK_FAILED', 'FFmpeg could not track the selected subject.', 'The tracking command failed. Try again, or choose a clearer patch.', result.stderr.slice(-1200))
    }
    const printed = fs.existsSync(metadataPath) ? fs.readFileSync(metadataPath, 'utf8') : ''
    const matched = parseRectMetadata(printed, input.selectedTime, input.frameWidth, input.frameHeight)
      .filter((frame) => frame.time > input.selectedTime + 0.1)
    if (matched.length < 2) {
      throw new AppError('TRACK_LOST', 'The selected target was not found reliably after this frame.', 'Choose a larger or more distinctive region and track again.')
    }

    const smoothed = matched.map((frame, i) => {
      const neighbors = matched.slice(Math.max(0, i - 2), Math.min(matched.length, i + 3))
      return {
        time: frame.time,
        x: neighbors.reduce((sum, p) => sum + p.x, 0) / neighbors.length,
        y: neighbors.reduce((sum, p) => sum + p.y, 0) / neighbors.length,
        score: frame.score
      }
    })
    const keyframes: TrackingKeyframe[] = [
      { time: input.selectedTime, x: input.centerX, y: input.centerY, score: 1 },
      ...smoothed
    ]
    return { keyframes, found: matched.length }
  } finally {
    for (const p of [objectPath, metadataPath]) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* best-effort temporary-file cleanup */ }
    }
  }
}

function parseRectMetadata(text: string, offset: number, width: number, height: number): TrackingKeyframe[] {
  const out: TrackingKeyframe[] = []
  let ptsTime: number | null = null
  let rect: Record<string, number> = {}
  const flush = (): void => {
    if (ptsTime === null || rect.x === undefined || rect.y === undefined) return
    out.push({
      time: offset + ptsTime,
      x: Math.min(1, Math.max(0, (rect.x + (rect.w ?? 0) / 2) / width)),
      y: Math.min(1, Math.max(0, (rect.y + (rect.h ?? 0) / 2) / height)),
      score: Math.min(1, Math.max(0, rect.score ?? 0.5))
    })
  }
  for (const line of text.split(/\r?\n/)) {
    const frame = /frame:\d+\s+pts:-?\d+\s+pts_time:([\d.]+)/.exec(line)
    if (frame) {
      flush()
      ptsTime = Number(frame[1])
      rect = {}
      continue
    }
    const value = /^lavfi\.rect\.(x|y|w|h|score)=(-?[\d.]+)$/.exec(line.trim())
    if (value) rect[value[1]] = Number(value[2])
  }
  flush()
  return out.sort((a, b) => a.time - b.time)
}
