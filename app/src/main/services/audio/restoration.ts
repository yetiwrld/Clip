import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '@shared/errors'
import { sourceAudioFilterChain } from '@shared/audio/restoration'
import type { AudioRestorationPreset } from '@shared/types'
import type { AppContext } from '../app-context'
import { clipsRepo, projectsRepo } from '../database/repositories'
import { resolveFfmpeg, runProcess } from '../media/ffmpeg'
import { getSettings } from '../settings'

const SAMPLE_SECONDS = 12

/** Create short, regenerable before/after WAVs for listening to a clip's current cleanup preset. */
export async function createAudioRestorationPreview(
  ctx: AppContext,
  clipId: string
): Promise<{ beforePath: string; afterPath: string; duration: number; preset: AudioRestorationPreset }> {
  const clip = clipsRepo.get(ctx.db, clipId)
  if (!clip) throw new AppError('CLIP_NOT_FOUND', 'That clip no longer exists.')
  if (clip.audioRestoration === 'off') {
    throw new AppError('AUDIO_RESTORATION_OFF', 'Choose a cleanup preset before generating an A/B sample.')
  }
  const project = projectsRepo.get(ctx.db, clip.projectId)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'The project for this clip no longer exists.')
  if (!project.hasAudio) throw new AppError('AUDIO_NOT_FOUND', 'This project has no audio track to preview.')
  if (!project.sourcePath || !fs.existsSync(project.sourcePath)) {
    throw new AppError('SOURCE_MISSING', 'The project source file is not available.', 'Relink the original media before previewing cleanup.')
  }

  const settings = getSettings(ctx)
  const ffmpeg = await resolveFfmpeg(settings.advanced.ffmpegPath)
  if (!ffmpeg) throw new AppError('FFMPEG_NOT_FOUND', 'FFmpeg was not found.', 'Configure FFmpeg in Settings → Advanced.')

  const duration = Math.min(SAMPLE_SECONDS, Math.max(0.2, clip.endTime - clip.startTime))
  const cacheDir = path.join(ctx.projectDir(clip.projectId), 'cache')
  await fs.promises.mkdir(cacheDir, { recursive: true })
  const prefix = `audio-restoration-${clip.id}-${clip.audioRestoration}`
  const beforePath = path.join(cacheDir, `${prefix}-before.tmp.wav`)
  const afterPath = path.join(cacheDir, `${prefix}-after.tmp.wav`)
  const normalize = settings.video.audioNormalize

  const renderSample = async (target: string, filters: string[]): Promise<void> => {
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', clip.startTime.toFixed(3), '-i', project.sourcePath as string,
      '-t', duration.toFixed(3), '-map', '0:a:0', '-vn',
      ...(filters.length ? ['-af', filters.join(',')] : []),
      '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', target
    ]
    const result = await runProcess(ffmpeg.path, args, { timeoutMs: 120_000 })
    if (result.code !== 0 || !fs.existsSync(target)) {
      throw new AppError(
        'AUDIO_PREVIEW_FAILED',
        'FFmpeg could not create the restoration sample.',
        'Check that the selected FFmpeg build includes the afftdn filter and that the source audio is readable.',
        result.stderr.slice(-3000)
      )
    }
  }

  try {
    await renderSample(beforePath, sourceAudioFilterChain('off', normalize))
    await renderSample(afterPath, sourceAudioFilterChain(clip.audioRestoration, normalize))
    return { beforePath, afterPath, duration, preset: clip.audioRestoration }
  } catch (error) {
    await Promise.all([
      fs.promises.rm(beforePath, { force: true }),
      fs.promises.rm(afterPath, { force: true })
    ])
    throw error
  }
}
