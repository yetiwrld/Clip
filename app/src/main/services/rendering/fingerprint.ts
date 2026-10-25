import crypto from 'node:crypto'
import fs from 'node:fs'
import type { AppSettings, Clip, ClipTimeline, Project, ProjectAsset, TranscriptSegment } from '@shared/types'

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
  }
  return value
}

function fileStamp(filePath: string | null | undefined): { size: number; mtimeMs: number } | null {
  if (!filePath) return null
  try {
    const stat = fs.statSync(filePath)
    return { size: stat.size, mtimeMs: stat.mtimeMs }
  } catch {
    return null
  }
}

/** Fingerprint every persisted input that can change the rendered pixels or audio. */
export function renderFingerprint(
  clip: Clip,
  project: Project,
  settings: AppSettings,
  timeline: ClipTimeline,
  assets: ProjectAsset[],
  transcript: TranscriptSegment[]
): string {
  const ignoredClipFields = new Set([
    'id', 'projectId', 'candidateId', 'status', 'createdAt', 'updatedAt',
    'title', 'description', 'hashtags', 'cta', 'metadataProvider'
  ])
  const renderClip = Object.fromEntries(Object.entries(clip).filter(([key]) => !ignoredClipFields.has(key)))
  const usedAssets = new Set(timeline.items.map((item) => item.assetId))
  const renderAssets = assets.filter((asset) => usedAssets.has(asset.id)).map((asset) => ({
    id: asset.id,
    path: asset.path,
    mediaType: asset.mediaType,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    sizeBytes: asset.sizeBytes,
    modified: fileStamp(asset.path)
  }))
  const input = {
    clip: renderClip,
    project: {
      sourcePath: project.sourcePath,
      source: fileStamp(project.sourcePath),
      duration: project.duration,
      width: project.width,
      height: project.height,
      fps: project.fps,
      rotation: project.rotation,
      hasAudio: project.hasAudio
    },
    settings: { audioNormalize: settings.video.audioNormalize },
    timeline,
    assets: renderAssets,
    transcript
  }
  return crypto.createHash('sha256').update(JSON.stringify(stable(input))).digest('hex')
}
