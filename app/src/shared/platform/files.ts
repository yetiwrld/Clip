/**
 * What a dropped, opened or pasted path is.
 *
 * Windows hands these to us from four different places — a drag from Explorer,
 * `argv` when a file is dropped on the executable, "Open with", and SendTo — so
 * the classification lives in one pure function that main and renderer share
 * instead of three extension lists drifting apart.
 *
 * Two modes, because a file can be right for one job and wrong for another:
 *   - `source`: the main media of a project. Video and audio only; an image
 *     cannot be transcribed, so importing one would create a dead project.
 *   - `asset`: media added to an existing project. Video, audio and images.
 */

export type DroppedFileKind = 'media' | 'transcript' | 'unsupported'

export const SOURCE_MEDIA_EXTENSIONS = [
  'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv',
  'mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'
] as const

export const ASSET_MEDIA_EXTENSIONS = [...SOURCE_MEDIA_EXTENSIONS, 'opus', 'aiff', 'png', 'jpg', 'jpeg', 'webp', 'gif'] as const

export const TRANSCRIPT_EXTENSIONS = ['srt', 'vtt', 'json', 'txt'] as const

/** Lucide-free, human list used in error copy. */
export const SUPPORTED_COPY = 'MP4, MOV, MKV, WebM, AVI, M4V, MPG, WMV, MP3, M4A, WAV, AAC, OGG or FLAC'

export function extensionOf(pathOrName: string): string {
  const name = pathOrName.split(/[\\/]/).pop() ?? pathOrName
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function baseNameOf(pathOrName: string, fallback = 'Imported media'): string {
  const name = pathOrName.split(/[\\/]/).pop() ?? ''
  const withoutExtension = name.replace(/\.[^.]+$/, '')
  return (withoutExtension || fallback).slice(0, 80)
}

export function isSupportedSourceMedia(pathOrName: string): boolean {
  return (SOURCE_MEDIA_EXTENSIONS as readonly string[]).includes(extensionOf(pathOrName))
}

export function classifyPath(pathOrName: string, mode: 'source' | 'asset' = 'asset'): DroppedFileKind {
  const ext = extensionOf(pathOrName)
  if (!ext) return 'unsupported'
  const media = mode === 'source' ? (SOURCE_MEDIA_EXTENSIONS as readonly string[]) : (ASSET_MEDIA_EXTENSIONS as readonly string[])
  if (media.includes(ext)) return 'media'
  if ((TRANSCRIPT_EXTENSIONS as readonly string[]).includes(ext)) return 'transcript'
  return 'unsupported'
}

export interface ClassifiedPaths {
  media: string[]
  transcripts: string[]
  unsupported: string[]
}

/** Splits a drop/hand-off into what can be imported and what has to be explained. */
export function classifyPaths(paths: string[], mode: 'source' | 'asset' = 'asset'): ClassifiedPaths {
  const result: ClassifiedPaths = { media: [], transcripts: [], unsupported: [] }
  const seen = new Set<string>()
  for (const path of paths) {
    if (typeof path !== 'string' || !path.trim() || seen.has(path)) continue
    seen.add(path)
    const kind = classifyPath(path, mode)
    if (kind === 'media') result.media.push(path)
    else if (kind === 'transcript') result.transcripts.push(path)
    else result.unsupported.push(path)
  }
  return result
}

/** One sentence for the toast when something could not be imported. */
export function unsupportedNotice(paths: string[], limit = 3): string {
  if (paths.length === 0) return ''
  const names = paths.slice(0, limit).map((path) => baseNameOf(path, path))
  const listed = names.join(', ')
  const rest = paths.length > limit ? ` and ${paths.length - limit} more` : ''
  return paths.length === 1
    ? `“${listed}” is not a supported media file.`
    : `${listed}${rest} are not supported media files.`
}
