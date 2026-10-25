import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '@shared/errors'
import type { ClipTimeline, MediaAssetType, ProjectAsset } from '@shared/types'
import type { AppContext } from '../app-context'
import { assetsRepo, clipTimelineRepo, clipsRepo, projectsRepo } from '../database/repositories'
import { getBinaries } from './inspect'
import { runProcess } from './ffmpeg'
import { generateThumbnail } from './thumbnails'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.mpg', '.mpeg', '.wmv', '.flv'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus', '.aiff'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

function mediaTypeFor(filePath: string): MediaAssetType | null {
  const ext = path.extname(filePath).toLowerCase()
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return null
}

export function listProjectAssets(ctx: AppContext, projectId: string): ProjectAsset[] {
  if (!projectsRepo.get(ctx.db, projectId)) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
  return assetsRepo.list(ctx.db, projectId)
}

export async function importProjectAssets(
  ctx: AppContext,
  projectId: string,
  filePaths: string[],
  report: (stage: string, progress: number | null, message: string) => void
): Promise<ProjectAsset[]> {
  if (!projectsRepo.get(ctx.db, projectId)) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')
  const { ffmpeg, ffprobe } = await getBinaries(ctx)
  const imported: ProjectAsset[] = []
  const dir = path.join(ctx.projectDir(projectId), 'assets')
  fs.mkdirSync(dir, { recursive: true })

  for (const [index, filePath] of filePaths.entries()) {
    const name = path.basename(filePath)
    const pct = index / filePaths.length
    report('inspecting', pct, `Inspecting ${name} (${index + 1}/${filePaths.length})`)
    const mediaType = mediaTypeFor(filePath)
    if (!mediaType) throw new AppError('UNSUPPORTED_FORMAT', `“${name}” is not a supported media format.`, 'Supported: common MP4/MOV/MKV/WebM videos, MP3/WAV/M4A/AAC/OGG/FLAC audio, and PNG/JPG/WebP/GIF images.')
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new AppError('FILE_NOT_FOUND', `“${name}” could not be found.`, 'Check that the file still exists and try again.')
    }
    const stat = fs.statSync(filePath)
    if (stat.size === 0) throw new AppError('EMPTY_FILE', `“${name}” is empty.`)

    const probe = await runProcess(ffprobe.path, [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath
    ], { timeoutMs: 60_000 })
    if (probe.code !== 0) throw new AppError('MEDIA_PROBE_FAILED', `“${name}” could not be read as ${mediaType}.`, 'The file may be corrupt or use a codec that FFmpeg cannot decode.', probe.stderr.slice(-1000))
    let metadata: { streams?: Array<{ codec_type?: string; width?: number; height?: number; channels?: number }>; format?: { duration?: string } }
    try { metadata = JSON.parse(probe.stdout) as typeof metadata } catch { throw new AppError('MEDIA_PROBE_FAILED', `Could not read media information for “${name}”.`) }
    const streams = metadata.streams ?? []
    const video = streams.find((stream) => stream.codec_type === 'video')
    const audio = streams.find((stream) => stream.codec_type === 'audio')
    if (mediaType === 'video' && !video) throw new AppError('MEDIA_STREAM_MISSING', `“${name}” has no video stream.`)
    if (mediaType === 'audio' && !audio) throw new AppError('MEDIA_STREAM_MISSING', `“${name}” has no audio stream.`)
    if (mediaType === 'image' && !video) throw new AppError('MEDIA_STREAM_MISSING', `“${name}” is not a readable image.`)

    const id = crypto.randomUUID()
    const ext = path.extname(filePath).toLowerCase()
    const storedPath = path.join(dir, `${id}${ext}`)
    const thumbnailPath = mediaType === 'audio' ? null : path.join(ctx.projectDir(projectId), 'thumbnails', 'assets', `${id}.jpg`)
    report('copying', pct, `Copying ${name} (${index + 1}/${filePaths.length})`)
    await fs.promises.copyFile(filePath, storedPath)

    if (thumbnailPath && mediaType !== 'image') {
      try { await generateThumbnail(ffmpeg.path, storedPath, thumbnailPath, { at: 0, height: 180 }) }
      catch (err) { ctx.logger.warn('media.assets', 'thumbnail', `asset=${id}`, String(err)) }
    }
    const duration = mediaType === 'image' ? null : Number(metadata.format?.duration) || null
    imported.push(assetsRepo.create(ctx.db, {
      id, projectId, name, originalName: name, mediaType, path: storedPath,
      thumbnailPath: mediaType === 'image' ? storedPath : thumbnailPath,
      duration, width: video?.width ?? null, height: video?.height ?? null,
      audioChannels: audio?.channels ?? null, sizeBytes: stat.size, createdAt: new Date().toISOString()
    }))
    report('ready', (index + 1) / filePaths.length, `Ready: ${name}`)
  }
  return imported
}

export function renameProjectAsset(ctx: AppContext, assetId: string, name: string): ProjectAsset {
  const asset = assetsRepo.rename(ctx.db, assetId, name)
  if (!asset) throw new AppError('ASSET_NOT_FOUND', 'That project asset no longer exists.')
  return asset
}

export async function relinkProjectAsset(ctx: AppContext, assetId: string, filePath: string): Promise<ProjectAsset> {
  const asset = assetsRepo.get(ctx.db, assetId)
  if (!asset) throw new AppError('ASSET_NOT_FOUND', 'That project asset no longer exists.')
  const mediaType = mediaTypeFor(filePath)
  if (mediaType !== asset.mediaType) throw new AppError('ASSET_TYPE_MISMATCH', `Choose a ${asset.mediaType} file to relink this asset.`)
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new AppError('FILE_NOT_FOUND', 'The selected replacement media file could not be found.')
  const { ffmpeg, ffprobe } = await getBinaries(ctx)
  const probe = await runProcess(ffprobe.path, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath], { timeoutMs: 60_000 })
  if (probe.code !== 0) throw new AppError('MEDIA_PROBE_FAILED', 'The replacement file could not be read as media.', undefined, probe.stderr.slice(-1000))
  const metadata = JSON.parse(probe.stdout) as { streams?: Array<{ codec_type?: string; width?: number; height?: number; channels?: number }>; format?: { duration?: string } }
  const video = metadata.streams?.find((stream) => stream.codec_type === 'video')
  const audio = metadata.streams?.find((stream) => stream.codec_type === 'audio')
  if ((asset.mediaType === 'video' || asset.mediaType === 'image') && !video) throw new AppError('MEDIA_STREAM_MISSING', 'The replacement file has no readable video/image stream.')
  if (asset.mediaType === 'audio' && !audio) throw new AppError('MEDIA_STREAM_MISSING', 'The replacement file has no audio stream.')
  const id = crypto.randomUUID()
  const ext = path.extname(filePath).toLowerCase()
  const newPath = path.join(ctx.projectDir(asset.projectId), 'assets', `${id}${ext}`)
  await fs.promises.copyFile(filePath, newPath)
  const thumb = asset.mediaType === 'audio'
    ? null
    : asset.mediaType === 'image'
      ? newPath
      : path.join(ctx.projectDir(asset.projectId), 'thumbnails', 'assets', `${id}.jpg`)
  if (asset.mediaType === 'video' && thumb) {
    try { await generateThumbnail(ffmpeg.path, newPath, thumb, { at: 0, height: 180 }) }
    catch (error) { ctx.logger.warn('media.assets', 'relink.thumbnail', `asset=${asset.id}`, String(error)) }
  }
  const updated = assetsRepo.updateMedia(ctx.db, asset.id, {
    originalName: path.basename(filePath), path: newPath, thumbnailPath: thumb,
    duration: asset.mediaType === 'image' ? null : Number(metadata.format?.duration) || null,
    width: video?.width ?? null, height: video?.height ?? null, audioChannels: audio?.channels ?? null,
    sizeBytes: fs.statSync(newPath).size
  })
  if (!updated) {
    // Preserve the original media if the row disappeared while relinking, and
    // clean the replacement copy rather than leaving an orphan behind.
    for (const candidate of new Set([newPath, thumb].filter((value): value is string => !!value))) {
      try { fs.rmSync(candidate, { force: true }) } catch { /* best effort cleanup */ }
    }
    throw new AppError('ASSET_NOT_FOUND', 'The project asset disappeared while it was being relinked.')
  }
  // The database now points at the replacement, so the previous copy is safe
  // to remove. Use a unique thumbnail path so a failed update cannot overwrite
  // the thumbnail that still belongs to the original asset.
  for (const previous of new Set([asset.path, asset.thumbnailPath].filter((value): value is string => !!value))) {
    if (previous === newPath || previous === thumb) continue
    try { fs.rmSync(previous, { force: true }) } catch { /* obsolete project copy can be cleaned later */ }
  }
  return updated
}

export function removeProjectAsset(ctx: AppContext, assetId: string): void {
  const asset = assetsRepo.get(ctx.db, assetId)
  if (!asset) return
  // Search the JSON timeline documents structurally. A SQL LIKE substring
  // match can falsely treat unrelated ids/labels as asset references.
  const used = ctx.db.all<{ document: string }>('SELECT document FROM clip_timelines').some(({ document }) => {
    try {
      const timeline = JSON.parse(document) as { items?: unknown }
      return Array.isArray(timeline.items) && timeline.items.some((item) =>
        typeof item === 'object' && item !== null && 'assetId' in item && item.assetId === assetId
      )
    } catch {
      return false
    }
  })
  if (used) throw new AppError('ASSET_IN_USE', 'This asset is used on a clip timeline.', 'Remove its timeline instances first.')
  assetsRepo.delete(ctx.db, assetId)
  try { fs.rmSync(asset.path, { force: true }) } catch { /* project database removal still succeeds */ }
  if (asset.thumbnailPath && asset.thumbnailPath !== asset.path) {
    try { fs.rmSync(asset.thumbnailPath, { force: true }) } catch { /* cached preview may be cleaned later */ }
  }
}

export function getClipTimeline(ctx: AppContext, clipId: string): ClipTimeline {
  if (!clipsRepo.get(ctx.db, clipId)) throw new AppError('CLIP_NOT_FOUND', 'That clip no longer exists.')
  return clipTimelineRepo.get(ctx.db, clipId)
}

export function saveClipTimeline(ctx: AppContext, clipId: string, timeline: ClipTimeline): ClipTimeline {
  const clip = clipsRepo.get(ctx.db, clipId)
  if (!clip) throw new AppError('CLIP_NOT_FOUND', 'That clip no longer exists.')
  const assets = new Map(assetsRepo.list(ctx.db, clip.projectId).map((asset) => [asset.id, asset]))
  const tracks = new Map(timeline.tracks.map((track) => [track.id, track]))
  for (const item of timeline.items) {
    const asset = assets.get(item.assetId)
    if (!asset || asset.missing) throw new AppError('ASSET_MISSING', 'A timeline item refers to media that is missing.')
    const track = tracks.get(item.trackId)
    if (!track || track.type !== asset.mediaType) throw new AppError('TIMELINE_TRACK_TYPE', 'A timeline item is assigned to an incompatible track.')
  }
  return clipTimelineRepo.save(ctx.db, clipId, timeline)
}
