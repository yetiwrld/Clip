import type { Clip } from '../types'
import type { CameraEasing, CameraKeyframe } from '../types'

export interface TrackingKeyframe {
  time: number
  x: number
  y: number
  score: number
}

/**
 * Crop-window math shared by the FFmpeg render pipeline and the editor's
 * live preview — the preview shows exactly the region that will be rendered
 * (ADR-009). All values are in source pixel coordinates.
 */

export function computeCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetW: number,
  targetH: number,
  cropMode: Clip['cropMode'],
  cropX: number,
  zoom: number,
  cropY = cropX
): { w: number; h: number; x: number; y: number } {
  const z = Math.min(3, Math.max(1, zoom))
  const sourceAR = sourceWidth / sourceHeight
  const targetAR = targetW / targetH

  let w: number
  let h: number
  if (sourceAR > targetAR) {
    // Landscape source → vertical slice
    h = sourceHeight
    w = sourceHeight * targetAR
  } else {
    // Portrait/square source → horizontal slice (crop height)
    w = sourceWidth
    h = sourceWidth / targetAR
  }
  w = Math.min(sourceWidth, w / z)
  h = Math.min(sourceHeight, h / z)

  // Keep YUV420 dimensions even while minimizing ratio error. Reducing only
  // width after an odd-size rounding can subtly distort the source on scale.
  w = Math.max(2, Math.floor(w / 2) * 2)
  h = Math.max(2, Math.floor(h / 2) * 2)
  if (w / h > targetAR) w = Math.max(2, Math.floor((h * targetAR) / 2) * 2)
  else if (w / h < targetAR) h = Math.max(2, Math.floor((w / targetAR) / 2) * 2)

  let x = cropMode === 'manual'
    ? Math.round(Math.min(1, Math.max(0, cropX)) * (sourceWidth - w))
    : Math.round((sourceWidth - w) / 2)
  let y = cropMode === 'top'
    ? 0
    : cropMode === 'bottom'
      ? sourceHeight - h
      : cropMode === 'manual'
        ? Math.round(Math.min(1, Math.max(0, cropY)) * (sourceHeight - h))
        : Math.round((sourceHeight - h) / 2)
  x = Math.max(0, Math.min(sourceWidth - w, x))
  y = Math.max(0, Math.min(sourceHeight - h, y))
  return { w, h, x, y }
}

export type CameraState = Pick<CameraKeyframe, 'x' | 'y' | 'scale' | 'rotation' | 'easing'>

export function cameraStateAt(keys: CameraKeyframe[], time: number): CameraState | null {
  if (keys.length === 0) return null
  const ordered = [...keys].sort((a, b) => a.time - b.time)
  if (time <= ordered[0].time) return { ...ordered[0] }
  const last = ordered[ordered.length - 1]
  if (time >= last.time) return { ...last }
  const rightIndex = ordered.findIndex((key) => key.time >= time)
  const left = ordered[rightIndex - 1]
  const right = ordered[rightIndex]
  const t = Math.min(1, Math.max(0, (time - left.time) / Math.max(0.001, right.time - left.time)))
  const u = easeCameraProgress(t, left.easing)
  return {
    x: left.x + (right.x - left.x) * u,
    y: left.y + (right.y - left.y) * u,
    scale: left.scale + (right.scale - left.scale) * u,
    rotation: left.rotation + (right.rotation - left.rotation) * u,
    easing: left.easing
  }
}

export function easeCameraProgress(t: number, easing: CameraEasing): number {
  switch (easing) {
    case 'cut': return 1
    case 'linear': return t
    case 'ease-in': return t * t
    case 'ease-out': return 1 - (1 - t) * (1 - t)
    case 'hold': return 0
    case 'ease-in-out':
    default: return t * t * (3 - 2 * t)
  }
}

/** Build a source-space crop from an interpolated virtual-camera state. */
export function computeCameraCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetW: number,
  targetH: number,
  camera: Pick<CameraKeyframe, 'x' | 'y' | 'scale'>
): { w: number; h: number; x: number; y: number } {
  const base = computeCrop(sourceWidth, sourceHeight, targetW, targetH, 'center', 0.5, camera.scale)
  const maxX = Math.max(0, sourceWidth - base.w)
  const maxY = Math.max(0, sourceHeight - base.h)
  const x = Math.round(Math.min(maxX, Math.max(0, camera.x * sourceWidth - base.w / 2)))
  const y = Math.round(Math.min(maxY, Math.max(0, camera.y * sourceHeight - base.h / 2)))
  return { ...base, x, y }
}

/** FFmpeg crop with per-frame source-space camera position and zoom. */
export function buildCameraCropFilter(
  sourceWidth: number,
  sourceHeight: number,
  targetW: number,
  targetH: number,
  keys: CameraKeyframe[],
  segmentStart: number,
  fps = 30
): string {
  if (keys.length === 0) return ''
  const base = computeCrop(sourceWidth, sourceHeight, targetW, targetH, 'center', 0.5, 1)
  const state = cameraStateAt(keys, segmentStart) ?? { x: 0.5, y: 0.5, scale: 1, rotation: 0, easing: 'ease-in-out' as const }
  const ordered: CameraKeyframe[] = [
    { time: segmentStart, ...state },
    ...[...keys].filter((key) => key.time > segmentStart).sort((a, b) => a.time - b.time)
  ]
  const expression = (field: 'x' | 'y' | 'scale' | 'rotation', clock = 't'): string => {
    let expr = ordered[ordered.length - 1][field].toFixed(6)
    for (let i = ordered.length - 2; i >= 0; i--) {
      const a = ordered[i]
      const b = ordered[i + 1]
      const t0 = Math.max(0, a.time - segmentStart)
      const t1 = Math.max(t0 + 0.001, b.time - segmentStart)
      const u = `((${clock})-${t0.toFixed(3)})/${(t1 - t0).toFixed(3)}`
      const eased = easingExpression(u, a.easing)
      const p0 = a[field].toFixed(6)
      const p1 = b[field].toFixed(6)
      expr = `if(lt((${clock})\\,${t1.toFixed(3)})\\,(${p0}+(${p1}-${p0})*(${eased}))\\,${expr})`
    }
    return expr
  }
  // Pan the source inside zoompan itself. Zooming a centered viewport first
  // loses pixels at the source edges, so a later crop cannot pan to them.
  // The same source-time clock drives scale and position for preview parity.
  const clock = `(on/${fps})`
  const zoom = expression('scale', clock)
  const cameraX = expression('x', clock)
  const cameraY = expression('y', clock)
  // Place the zoompan input window so the desired output crop begins at its
  // left/top edge where possible. Near the source's far edge, clamp that
  // window and move the fixed crop within it. This retains edge pixels while
  // allowing the full camera range even when the crop is much smaller than
  // the zoompan frame.
  const panX = `min(iw-iw/zoom\\,max(0\\,(${cameraX})*iw-${base.w}/zoom/2))`
  const panY = `min(ih-ih/zoom\\,max(0\\,(${cameraY})*ih-${base.h}/zoom/2))`
  const cameraXAtTime = expression('x')
  const cameraYAtTime = expression('y')
  const scaleAtTime = expression('scale')
  const desiredLeft = `min(iw-${base.w}/(${scaleAtTime})\\,max(0\\,(${cameraXAtTime})*iw-${base.w}/(${scaleAtTime})/2))`
  const desiredTop = `min(ih-${base.h}/(${scaleAtTime})\\,max(0\\,(${cameraYAtTime})*ih-${base.h}/(${scaleAtTime})/2))`
  const viewportLeft = `min(iw-iw/(${scaleAtTime})\\,max(0\\,${desiredLeft}))`
  const viewportTop = `min(ih-ih/(${scaleAtTime})\\,max(0\\,${desiredTop}))`
  const cropX = `((${desiredLeft})-(${viewportLeft}))*(${scaleAtTime})`
  const cropY = `((${desiredTop})-(${viewportTop}))*(${scaleAtTime})`
  const rotation = expression('rotation')
  const rotate = keys.some((key) => Math.abs(key.rotation) > 0.001)
    ? `,rotate='(${rotation})*PI/180':ow=iw:oh=ih:fillcolor=black`
    : ''
  return `zoompan=z='${zoom}':x='${panX}':y='${panY}':d=1:s=${sourceWidth}x${sourceHeight}:fps=${fps},crop=${base.w}:${base.h}:x='${cropX}':y='${cropY}',scale=${targetW}:${targetH}:flags=lanczos${rotate}`
}

function easingExpression(u: string, easing: CameraEasing): string {
  if (easing === 'cut') return '1'
  if (easing === 'linear') return u
  if (easing === 'ease-in') return `((${u})*(${u}))`
  if (easing === 'ease-out') return `(1-(1-(${u}))*(1-(${u})))`
  if (easing === 'hold') return '0'
  return `((${u})*(${u})*(3-2*(${u})))`
}

/** Interpolate a smoothed source-space target position at a timestamp. */
export function trackingPositionAt(keys: TrackingKeyframe[], time: number): { x: number; y: number } | null {
  if (keys.length === 0) return null
  const ordered = [...keys].sort((a, b) => a.time - b.time)
  if (time <= ordered[0].time) return { x: ordered[0].x, y: ordered[0].y }
  const last = ordered[ordered.length - 1]
  if (time >= last.time) return { x: last.x, y: last.y }
  const rightIndex = ordered.findIndex((key) => key.time >= time)
  const left = ordered[rightIndex - 1]
  const right = ordered[rightIndex]
  const span = Math.max(0.001, right.time - left.time)
  const t = (time - left.time) / span
  // Smoothstep prevents the sparse tracker samples from making the camera jerk.
  const eased = t * t * (3 - 2 * t)
  return { x: left.x + (right.x - left.x) * eased, y: left.y + (right.y - left.y) * eased }
}

/** Apply a source-space subject position to a fixed virtual-camera window. */
export function applyTrackingToCrop(
  crop: { w: number; h: number; x: number; y: number },
  sourceWidth: number,
  sourceHeight: number,
  keys: TrackingKeyframe[],
  time: number
): { w: number; h: number; x: number; y: number } {
  const target = trackingPositionAt(keys, time)
  if (!target) return crop
  const maxX = Math.max(0, sourceWidth - crop.w)
  const maxY = Math.max(0, sourceHeight - crop.h)
  // Leave a little headroom by positioning a subject's center just below frame center.
  const baseBiasX = crop.x - maxX * 0.5
  const baseBiasY = crop.y - maxY * 0.5
  const x = Math.round(Math.min(maxX, Math.max(0, target.x * sourceWidth - crop.w * 0.5 + baseBiasX)))
  const y = Math.round(Math.min(maxY, Math.max(0, target.y * sourceHeight - crop.h * 0.44 + baseBiasY)))
  return { ...crop, x, y }
}

/** Build a crop filter whose virtual-camera position follows saved keyframes. */
export function buildTrackedCropFilter(
  crop: { w: number; h: number; x: number; y: number },
  sourceWidth: number,
  sourceHeight: number,
  keys: TrackingKeyframe[],
  segmentStart: number
): string {
  if (keys.length === 0) return `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`
  const ordered = [...keys].sort((a, b) => a.time - b.time)
  const biasX = crop.x - Math.max(0, sourceWidth - crop.w) * 0.5
  const biasY = crop.y - Math.max(0, sourceHeight - crop.h) * 0.5
  const makePosition = (axis: 'x' | 'y', bias: number): string => {
    const sourceVar = axis === 'x' ? 'iw' : 'ih'
    const windowSize = axis === 'x' ? crop.w : crop.h
    const centerValue = (key: TrackingKeyframe) => `(${key[axis].toFixed(6)}*${sourceVar}-${windowSize}*${axis === 'y' ? '0.44' : '0.5'}+(${bias.toFixed(3)}))`
    let expr = centerValue(ordered[ordered.length - 1])
    for (let i = ordered.length - 2; i >= 0; i--) {
      const a = ordered[i]
      const b = ordered[i + 1]
      const t0 = Math.max(0, a.time - segmentStart)
      const t1 = Math.max(t0 + 0.001, b.time - segmentStart)
      const u = `(t-${t0.toFixed(3)})/${(t1 - t0).toFixed(3)}`
      const smooth = `((${u})*(${u})*(3-2*(${u})))`
      const p0 = centerValue(a)
      const p1 = centerValue(b)
      const interpolated = `(${p0}+(${p1}-${p0})*${smooth})`
      expr = `if(lt(t\\,${t1.toFixed(3)})\\,${interpolated}\\,${expr})`
    }
    const firstTime = Math.max(0, ordered[0].time - segmentStart)
    expr = `if(lt(t\\,${firstTime.toFixed(3)})\\,${centerValue(ordered[0])}\\,${expr})`
    return `min(${sourceVar}-${windowSize}\\,max(0\\,${expr}))`
  }
  return `crop=${crop.w}:${crop.h}:${makePosition('x', biasX)}:${makePosition('y', biasY)}`
}
