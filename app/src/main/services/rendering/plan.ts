import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings, Clip, ClipTimeline, Project, ProjectAsset, TimelineItem } from '@shared/types'
import { AppError } from '@shared/errors'
import { getCaptionStyle, getQualityPreset, resolutionFor, type QualityPreset } from '@shared/constants'
import { buildCues, type CaptionCue } from '@shared/captions/segmentation'
import { buildCameraCropFilter, buildTrackedCropFilter, computeCrop } from '@shared/video/crop'
import { renderFingerprint } from './fingerprint'
import { keptSegments, keptDuration, remapCuesToKept } from '@shared/video/segments'
import { effectiveItemSpeed, mapTimelineRangeToSource, timelineItemDuration, timelineOverlayGeometry } from '@shared/video/time-map'
import { buildAssDocument } from '@shared/captions/ass'
import { buildTextLayersAssDocument } from '@shared/captions/text-ass'
import { escapeFilterPath } from '../media/ffmpeg'
import { sourceAudioFilterChain } from '@shared/audio/restoration'
import type { AppContext } from '../app-context'
import { assetsRepo, clipTimelineRepo, segmentsRepo } from '../database/repositories'

/**
 * Render plan construction: turns a clip configuration into the exact FFmpeg
 * invocation plus the ASS subtitle document. Pure planning — execution and
 * validation happen in queue.ts.
 *
 * Output geometry comes from clip.outputResolution (short-side tier) and the
 * aspect ratio; quality from clip.outputQuality. Silence cuts turn the render
 * into a multi-segment concat with caption times remapped onto the kept
 * timeline — the same math the editor preview uses (§62-63 parity).
 */

export interface RenderPlan {
  renderId: string
  clipId: string
  sourcePath: string
  assPath: string | null
  assPaths: string[]
  tmpPath: string
  finalPath: string
  /** Expected OUTPUT duration (after silence removal). */
  expectedDuration: number
  args: string[]
  hasCaptions: boolean
  hasAudio: boolean
  encoder: string
  target: { w: number; h: number }
  quality: QualityPreset
  fps: number
  segments: number
  fingerprint: string
}

type TimelineLayerPlan = { inputs: string[]; filters: string[]; videoLabel: string; audioLabels: string[] }

function atempoChain(speed: number): string {
  const factors: number[] = []
  let remaining = Math.max(0.25, Math.min(4, speed))
  while (remaining > 2) { factors.push(2); remaining /= 2 }
  while (remaining < 0.5) { factors.push(0.5); remaining /= 0.5 }
  factors.push(remaining)
  return factors.map((factor) => `atempo=${factor.toFixed(5)}`).join(',')
}

/** Build FFmpeg inputs and filters for project timeline items, remapping them
 * through silence removal so external media stays locked to source time. */
export function buildTimelineLayerPlan(opts: {
  timeline: ClipTimeline; assets: ProjectAsset[]; kept: Array<{ start: number; end: number }>
  target: { w: number; h: number }; firstInput: number; outputDuration: number
}): TimelineLayerPlan {
  const { timeline, assets, kept, target } = opts
  const tracks = new Map(timeline.tracks.map((track) => [track.id, track]))
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
  const inputs: string[] = []
  const filters: string[] = []
  const audioLabels: string[] = []
  const overlays: Array<{ label: string; item: TimelineItem; trackOrder: number; start: number; end: number; geometry: ReturnType<typeof timelineOverlayGeometry> }> = []
  let inputIndex = opts.firstInput
  let pieceIndex = 0
  let outputCursor = 0

  for (const segment of kept) {
    const segmentOutputStart = outputCursor
    for (const item of timeline.items) {
      const track = tracks.get(item.trackId)
      const asset = assetMap.get(item.assetId)
      if (!track || track.hidden || !asset) continue
      if (!fs.existsSync(asset.path)) throw new AppError('ASSET_MISSING', `Timeline media “${asset.name}” is missing.`, 'Relink it in the Media Library and render again.')
      const mapped = mapTimelineRangeToSource(item, segment.start, segment.end)
      if (!mapped) continue
      if (asset.mediaType === 'audio' && track.muted) continue
      const itemDuration = timelineItemDuration(item)
      const speed = effectiveItemSpeed(item.speed)
      const elapsed = mapped.timelineStart - item.startTime
      const sourceIn = mapped.sourceStart
      const sourceDuration = mapped.sourceEnd - mapped.sourceStart
      const pieceDuration = mapped.timelineEnd - mapped.timelineStart
      const outputStart = segmentOutputStart + mapped.timelineStart - segment.start
      const outputEnd = outputStart + pieceDuration
      const input = inputIndex++
      const label = `timeline_${pieceIndex++}`
      const geometry = asset.mediaType === 'audio' ? null : timelineOverlayGeometry(item)

      if (asset.mediaType === 'image') {
        inputs.push('-loop', '1', '-framerate', '30', '-t', pieceDuration.toFixed(3), '-i', asset.path)
        const boxW = Math.max(2, Math.round(target.w * geometry!.scale))
        const boxH = Math.max(2, Math.round(target.h * geometry!.scale))
        const rotation = Number.isFinite(item.rotation) && item.rotation !== 0 ? `,rotate=${(item.rotation * Math.PI / 180).toFixed(6)}:ow=rotw(iw):oh=roth(ih):c=black@0` : ''
        // Shift the still into its slot on the output timeline. Without this the
        // image stream ends (after `pieceDuration`) long before the overlay
        // window opens, and eof_action=pass keeps the frame free of it — the
        // picture overlay existed only in the editor preview.
        filters.push(`[${input}:v]scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease,pad=${boxW}:${boxH}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,colorchannelmixer=aa=${geometry!.opacity.toFixed(3)}${rotation},setpts=PTS-STARTPTS+${outputStart.toFixed(3)}/TB[${label}]`)
      } else {
        inputs.push('-ss', sourceIn.toFixed(3), '-t', sourceDuration.toFixed(3), '-i', asset.path)
        if (asset.mediaType === 'video') {
          const boxW = Math.max(2, Math.round(target.w * geometry!.scale))
          const boxH = Math.max(2, Math.round(target.h * geometry!.scale))
          const rotation = Number.isFinite(item.rotation) && item.rotation !== 0 ? `,rotate=${(item.rotation * Math.PI / 180).toFixed(6)}:ow=rotw(iw):oh=roth(ih):c=black@0` : ''
          filters.push(`[${input}:v]setpts=(PTS-STARTPTS)/${speed.toFixed(5)},scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease,pad=${boxW}:${boxH}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,colorchannelmixer=aa=${geometry!.opacity.toFixed(3)}${rotation},setpts=PTS+${outputStart.toFixed(3)}/TB[${label}]`)
        }
      }

      if (asset.mediaType !== 'audio' && track.type !== 'audio') {
        overlays.push({ label, item, trackOrder: track.order, start: outputStart, end: outputEnd, geometry: geometry! })
      }
      const hasTimelineAudio = asset.mediaType === 'audio' || (asset.mediaType === 'video' && (asset.audioChannels ?? 0) > 0)
      if (hasTimelineAudio && !item.muted && !track.muted) {
        const outputFilters = [`atrim=duration=${sourceDuration.toFixed(3)}`, 'asetpts=PTS-STARTPTS', atempoChain(speed), `volume=${Math.max(0, Math.min(1, item.volume)).toFixed(3)}`]
        // Fade values are timeline-time seconds (the post-atempo duration),
        // matching the editor preview. Dividing by speed made fast clips fade
        // too quickly and slow clips too slowly in the export.
        const fadeIn = item.fadeIn > 0 && elapsed < 0.02 ? Math.min(item.fadeIn, pieceDuration) : 0
        const itemRemaining = itemDuration - (elapsed + pieceDuration)
        const fadeOut = item.fadeOut > 0 && itemRemaining < 0.02 ? Math.min(item.fadeOut, pieceDuration) : 0
        if (fadeIn > 0) outputFilters.push(`afade=t=in:d=${fadeIn.toFixed(3)}`)
        if (fadeOut > 0) outputFilters.push(`afade=t=out:st=${Math.max(0, pieceDuration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`)
        // The bundled FFmpeg is older than builds with `adelay:all=1`. Supply
        // one delay per channel instead; this syntax works on the bundled
        // build and preserves stereo/surround alignment.
        const channels = Math.max(1, Math.min(32, Math.trunc(asset.audioChannels ?? 1)))
        const channelDelays = Array.from({ length: channels }, () => String(Math.round(outputStart * 1000))).join('|')
        outputFilters.push(`adelay=${channelDelays}`)
        filters.push(`[${input}:a]${outputFilters.join(',')}[${label}a]`)
        audioLabels.push(`[${label}a]`)
      }
    }
    outputCursor += segment.end - segment.start
  }

  overlays.sort((a, b) => a.trackOrder - b.trackOrder)
  let videoLabel = 'vbase'
  for (const [index, overlay] of overlays.entries()) {
    const out = `vlay${index}`
    const x = `(${overlay.geometry.centerX.toFixed(5)})*W-w/2`
    const y = `(${overlay.geometry.centerY.toFixed(5)})*H-h/2`
    // Editor visibility is half-open [start,end); `between()` is inclusive at
    // both ends and leaked one extra output frame compared with the preview.
    const enable = `gte(t,${overlay.start.toFixed(3)})*lt(t,${overlay.end.toFixed(3)})`
    filters.push(`[${videoLabel}][${overlay.label}]overlay=x='${x}':y='${y}':enable='${enable}':eof_action=pass:shortest=0:format=auto[${out}]`)
    videoLabel = out
  }
  return { inputs, filters, videoLabel, audioLabels }
}

export const HW_ENCODER_PREFERENCE = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox']

/** Build caption cues for a clip (absolute times; shared logic with preview). */
export function buildClipCues(ctx: AppContext, clip: Clip, transcript = segmentsRepo.listForProject(ctx.db, clip.projectId)): CaptionCue[] {
  if (clip.captionStyleId === 'none') return []
  const o = clip.captionOverrides
  const style = { ...getCaptionStyle(clip.captionStyleId), ...o, fontFile: o.fontFile ?? getCaptionStyle(clip.captionStyleId).fontFile }
  return buildCues(transcript, {
    maxWordsPerCue: o.maxWordsPerCue ?? style.maxWordsPerCue,
    maxCharsPerLine: o.maxCharsPerLine ?? style.maxCharsPerLine,
    maxLines: o.maxLines ?? style.maxLines,
    textEdits: clip.captionTextEdits,
    splits: clip.captionCueSplits,
    merges: clip.captionCueMerges,
    timingOffsets: clip.captionTimingOffsets,
    hiddenKeys: clip.captionCueHidden,
    duplicates: clip.captionCueDuplicates,
    fromTime: clip.startTime,
    toTime: clip.endTime
  })
}

/** Shift cues to a render-local timeline (input seeking resets t=0). */
export function shiftCues(cues: CaptionCue[], delta: number): CaptionCue[] {
  return cues.map((c) => ({
    ...c,
    startTime: Math.max(0, c.startTime + delta),
    endTime: Math.max(0.05, c.endTime + delta),
    words: c.words.map((w) => ({ ...w, start: Math.max(0, w.start + delta), end: Math.max(0, w.end + delta) }))
  }))
}

/**
 * Output frame rate. 'source' follows the project's measured fps and falls
 * back to 30 when unknown — a fixed fps filter also guarantees CFR output
 * for VFR sources (phone recordings, screen captures) (§57-58).
 */
export function effectiveFps(clip: Clip, project: Project): number {
  if (clip.outputFps !== 'source' && Number.isFinite(clip.outputFps)) {
    return Math.min(120, Math.max(1, clip.outputFps))
  }
  const src = project.fps
  if (src == null || !Number.isFinite(src) || src < 1 || src > 120) return 30
  return Math.round(src * 1000) / 1000
}

/** Bitrate for hardware encoders scales with output area × quality factor. */
export function hwBitrate(w: number, h: number, quality: QualityPreset): string {
  const mbps = Math.max(1, ((w * h) / (1920 * 1080)) * 8 * quality.hwBitrateFactor)
  return `${mbps.toFixed(1)}M`
}

export function buildRenderPlan(
  ctx: AppContext,
  opts: {
    renderId: string
    clip: Clip
    project: Project
    settings: AppSettings
    ffmpegPath: string
    encoder: string
    /** Fast low-quality preview render (draft, 720p). */
    preview?: boolean
  }
): RenderPlan {
  const { clip, project, encoder } = opts
  if (!project.sourcePath) {
    throw new AppError(
      'SOURCE_MISSING',
      'This project has no imported media to render from.',
      'Import a video first.'
    )
  }

  const resolutionTier = opts.preview ? '720p' : clip.outputResolution
  const target = resolutionFor(clip.aspectRatio, resolutionTier as Clip['outputResolution'], { w: clip.customAspectW ?? 16, h: clip.customAspectH ?? 9 })
  const quality = getQualityPreset(opts.preview ? 'draft' : clip.outputQuality)
  const fps = effectiveFps(clip, project)

  const rendersDir = path.join(ctx.projectDir(clip.projectId), 'renders')
  fs.mkdirSync(rendersDir, { recursive: true })

  const tmpPath = path.join(rendersDir, `${opts.renderId}.tmp.mp4`)
  const finalPath = path.join(rendersDir, `${opts.renderId}.mp4`)

  // ---- kept segments (silence removal) ----
  const kept = keptSegments(clip.startTime, clip.endTime, clip.silenceCuts ?? [])
  const multiSegment = kept.length > 1
  const outputDuration = Math.max(0.2, multiSegment ? keptDuration(kept) : clip.endTime - clip.startTime)
  const timeline = clipTimelineRepo.get(ctx.db, clip.id)
  const timelineAssets = timeline.items.length ? assetsRepo.list(ctx.db, clip.projectId) : []
  const transcript = segmentsRepo.listForProject(ctx.db, clip.projectId)
  const fingerprint = renderFingerprint(clip, project, opts.settings, timeline, timelineAssets, transcript)

  // ---- captions (shared cue construction; remapped for multi-segment) ----
  const cues = buildClipCues(ctx, clip, transcript)
  let assPath: string | null = null
  const assPaths: string[] = []
  const assFilters: string[] = []
  const fontsDir = ctx.paths.fontsDir
  const textTimeMap: Array<{ sourceStart: number; sourceEnd: number; outputStart: number }> = []
  let outputCursor = 0
  for (const segment of kept) {
    textTimeMap.push({ sourceStart: segment.start, sourceEnd: segment.end, outputStart: outputCursor })
    outputCursor += segment.end - segment.start
  }
  if (clip.textLayers?.length) {
    const textAss = buildTextLayersAssDocument(clip.textLayers, textTimeMap, target.w, target.h)
    if (textAss) {
      const textAssPath = path.join(rendersDir, `${opts.renderId}-text.ass`)
      fs.writeFileSync(textAssPath, textAss, 'utf-8')
      assPaths.push(textAssPath)
      assFilters.push(`subtitles='${escapeFilterPath(textAssPath)}':fontsdir='${escapeFilterPath(fontsDir)}'`)
    }
  }
  if (cues.length > 0 && clip.captionStyleId !== 'none') {
    const o = clip.captionOverrides
    const baseStyle = getCaptionStyle(clip.captionStyleId)
    const style = { ...baseStyle, ...o, fontFile: o.fontFile ?? baseStyle.fontFile }
    let renderCues = shiftCues(cues, -clip.startTime)
    if (multiSegment) {
      // Map source-time cues onto the kept timeline (§61)
      renderCues = remapCuesToKept(renderCues, kept.map((k) => ({ start: k.start - clip.startTime, end: k.end - clip.startTime })))
    }
    const ass = buildAssDocument(renderCues, {
      style,
      fontSizePct: o.fontSizePct,
      positionY: o.positionY,
      emphasis: o.emphasis,
      uppercase: o.uppercase,
      textColor: o.textColor,
      highlightColor: o.highlightColor,
      boxOpacity: o.boxOpacity,
      outlineWidth: o.outlineWidth,
      shadow: o.shadow,
      playResX: target.w,
      playResY: target.h
    })
    assPath = path.join(rendersDir, `${opts.renderId}.ass`)
    fs.writeFileSync(assPath, ass, 'utf-8')
    assPaths.push(assPath)
    assFilters.push(`subtitles='${escapeFilterPath(assPath)}':fontsdir='${escapeFilterPath(fontsDir)}'`)
  }

  // ---- reframe ----
  const crop = computeCrop(
    project.width ?? 1920,
    project.height ?? 1080,
    target.w,
    target.h,
    clip.cropMode,
    clip.cropX,
    clip.zoom,
    clip.cropY ?? clip.cropX
  )
  const perSegmentVf = (segmentStart: number) => {
    // Fit is an explicit framing choice: temporarily bypass animated camera
    // and tracking paths so the full source is visible at 1x.
    if (clip.fitMode === 'fit') {
      const sourceW = project.width ?? 1920
      const sourceH = project.height ?? 1080
      const fitScale = Math.min(target.w / sourceW, target.h / sourceH) * clip.zoom
      const fitW = Math.max(2, Math.round((sourceW * fitScale) / 2) * 2)
      const fitH = Math.max(2, Math.round((sourceH * fitScale) / 2) * 2)
      const canvasW = Math.max(target.w, fitW)
      const canvasH = Math.max(target.h, fitH)
      const fitCropX = Math.min(1, Math.max(0, clip.cropX)).toFixed(5)
      const fitCropY = Math.min(1, Math.max(0, clip.cropY ?? clip.cropX)).toFixed(5)
      const padX = fitW < target.w ? `(ow-iw)*${fitCropX}` : '0'
      const padY = fitH < target.h ? `(oh-ih)*${fitCropY}` : '0'
      const cropX = fitW > target.w ? `(iw-ow)*${fitCropX}` : '0'
      const cropY = fitH > target.h ? `(ih-oh)*${fitCropY}` : '0'
      return `fps=${fps},scale=${fitW}:${fitH}:flags=lanczos,pad=${canvasW}:${canvasH}:${padX}:${padY}:black,crop=${target.w}:${target.h}:${cropX}:${cropY}`
    }
    if (clip.cameraKeyframes?.length) {
      return `fps=${fps},${buildCameraCropFilter(project.width ?? 1920, project.height ?? 1080, target.w, target.h, clip.cameraKeyframes, segmentStart, fps)}`
    }
    return `fps=${fps},${buildTrackedCropFilter(crop, project.width ?? 1920, project.height ?? 1080, clip.trackingKeyframes ?? [], segmentStart)},scale=${target.w}:${target.h}:flags=lanczos`
  }

  // ---- audio ----
  const hasAudio = project.hasAudio
  const audioNormalize = opts.settings.video.audioNormalize
  const sourceAudioFilters = sourceAudioFilterChain(clip.audioRestoration ?? 'off', audioNormalize)

  // ---- encoder ----
  const isHw = encoder !== 'libx264'
  const encoderArgs = isHw
    ? ['-c:v', encoder, '-b:v', hwBitrate(target.w, target.h, quality)]
    : ['-c:v', 'libx264', '-crf', String(quality.crf), '-preset', quality.x264Preset]

  const commonTail = [
    ...encoderArgs,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    tmpPath
  ]

  let args: string[]
  if (!multiSegment) {
    // Simple path: single -ss/-t with a -vf chain.
    const segmentFilter = perSegmentVf(clip.startTime)
    const vf = [...[segmentFilter], ...assFilters].join(',')
    const layerPlan = buildTimelineLayerPlan({ timeline, assets: timelineAssets, kept, target, firstInput: 1, outputDuration })
    if (!timeline.items.length) {
      const audioArgs = hasAudio
        ? [
            ...(sourceAudioFilters.length ? ['-af', sourceAudioFilters.join(',')] : []),
            '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'
          ]
        : ['-an']
      args = ['-y', '-ss', clip.startTime.toFixed(3), '-i', project.sourcePath, '-t', outputDuration.toFixed(3), '-vf', vf, ...audioArgs, ...commonTail]
    } else {
      const chains = [`[0:v]${segmentFilter}[vbase]`, ...layerPlan.filters]
      let videoLabel = layerPlan.videoLabel
      if (assFilters.length) { chains.push(`[${videoLabel}]${assFilters.join(',')}[vout]`); videoLabel = 'vout' }
      const maps = ['-map', `[${videoLabel}]`]
      const audioParts: string[] = [...layerPlan.audioLabels]
      if (hasAudio) {
        const sourceAudioChain = ['aresample=48000:async=1:first_pts=0', ...sourceAudioFilters].join(',')
        chains.push(`[0:a]${sourceAudioChain}[basea]`)
        audioParts.unshift('[basea]')
      }
      if (audioParts.length > 1) {
        chains.push(`${audioParts.join('')}amix=inputs=${audioParts.length}:duration=longest:dropout_transition=0,atrim=duration=${outputDuration.toFixed(3)}[aout]`)
        maps.push('-map', '[aout]')
      } else if (audioParts.length === 1) maps.push('-map', audioParts[0])
      else maps.push('-an')
      if (audioParts.length) maps.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000')
      args = ['-y', '-ss', clip.startTime.toFixed(3), '-i', project.sourcePath, ...layerPlan.inputs,
        '-t', outputDuration.toFixed(3), '-filter_complex', chains.join(';'), ...maps, ...commonTail]
    }
  } else {
    // Multi-segment: one input per kept range, filter_complex concat.
    // Each input gets its own seek; all segments share the reframe chain.
    const inputs: string[] = []
    for (const k of kept) {
      inputs.push(
        '-ss', k.start.toFixed(3),
        '-t', (k.end - k.start).toFixed(3),
        '-i', project.sourcePath
      )
    }
    const layerPlan = buildTimelineLayerPlan({ timeline, assets: timelineAssets, kept, target, firstInput: kept.length, outputDuration })
    const n = kept.length
    const chains: string[] = []
    for (let i = 0; i < n; i++) {
      chains.push(`[${i}:v]${perSegmentVf(kept[i].start)}[v${i}]`)
    }
    chains.push(`${Array.from({ length: n }, (_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0[vc]`)
    chains.push('[vc]null[vbase]')
    // The layer overlay graph consumes [vbase], with timeline order controlling stacking.
    chains.push(...layerPlan.filters)
    let videoLabel = layerPlan.videoLabel
    if (assFilters.length) { chains.push(`[${videoLabel}]${assFilters.join(',')}[vout]`); videoLabel = 'vout' }
    const maps: string[] = ['-map', `[${videoLabel}]`]
    const audioParts: string[] = [...layerPlan.audioLabels]
    if (hasAudio) {
      for (let i = 0; i < n; i++) {
        chains.push(`[${i}:a]aresample=48000:async=1:first_pts=0[a${i}]`)
      }
      chains.push(`${Array.from({ length: n }, (_, i) => `[a${i}]`).join('')}concat=n=${n}:v=0:a=1[ac]`)
      const sourceAudioChain = sourceAudioFilters.length ? sourceAudioFilters.join(',') : 'anull'
      chains.push(`[ac]${sourceAudioChain}[basea]`)
      audioParts.unshift('[basea]')
    }
    if (audioParts.length > 1) {
      chains.push(`${audioParts.join('')}amix=inputs=${audioParts.length}:duration=longest:dropout_transition=0,atrim=duration=${outputDuration.toFixed(3)}[aout]`)
      maps.push('-map', '[aout]')
    } else if (audioParts.length === 1) maps.push('-map', audioParts[0])
    else maps.push('-an')
    if (audioParts.length) maps.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000')

    args = [
      '-y',
      ...inputs,
      ...layerPlan.inputs,
      '-filter_complex', chains.join(';'),
      ...maps,
      ...commonTail
    ]
  }

  return {
    renderId: opts.renderId,
    clipId: clip.id,
    sourcePath: project.sourcePath,
    assPath,
    assPaths,
    tmpPath,
    finalPath,
    expectedDuration: outputDuration,
    args,
    hasCaptions: cues.length > 0,
    hasAudio,
    encoder,
    target,
    quality,
    fps,
    segments: kept.length,
    fingerprint
  }
}

/** Effective hardware-encoding mode with legacy-setting migration. */
export function encoderMode(settings: AppSettings): 'auto' | 'cpu' | 'hardware' {
  if (settings.video.hardwareEncoding) return settings.video.hardwareEncoding
  return settings.video.useHardwareEncoder ? 'auto' : 'cpu'
}

/** Choose encoder based on settings + probed availability. */
export function pickEncoder(settings: AppSettings, availableEncoders: string[] | null): string {
  const mode = encoderMode(settings)
  if (mode === 'cpu') return 'libx264'
  if (availableEncoders) {
    for (const enc of HW_ENCODER_PREFERENCE) {
      if (availableEncoders.includes(enc)) return enc
    }
  }
  return 'libx264'
}

export async function probeEncoders(ffmpegPath: string, run: (bin: string, args: string[]) => Promise<{ stdout: string }>): Promise<string[]> {
  const { stdout } = await run(ffmpegPath, ['-hide_banner', '-encoders'])
  return stdout
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*[A-Z.]+\s+(\S+)\s+/)
      return m ? m[1] : null
    })
    .filter((x): x is string => x != null)
}
