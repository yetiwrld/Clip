import type { TextLayer, TextLayerKeyframe } from '../types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Resolve stored text transform keyframes using the editor's source-time linear interpolation. */
export function textLayerStateAt(layer: TextLayer, time: number): TextLayerKeyframe {
  const base: TextLayerKeyframe = { time: layer.startTime, x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation, opacity: layer.opacity }
  const frames = [...layer.keyframes].sort((a, b) => a.time - b.time)
  const points = [base, ...frames].filter((point, index, list) => index === 0 || Math.abs(point.time - list[index - 1].time) > 0.0001)
  if (time <= points[0].time) return { ...points[0], time }
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]
    const b = points[index]
    if (time <= b.time) {
      const t = clamp((time - a.time) / Math.max(0.001, b.time - a.time), 0, 1)
      return { time, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
        scale: a.scale + (b.scale - a.scale) * t, rotation: a.rotation + (b.rotation - a.rotation) * t,
        opacity: a.opacity + (b.opacity - a.opacity) * t }
    }
  }
  return { ...points[points.length - 1], time }
}

/** Fully resolve preview/export transform and entrance/exit animation at source time. */
export function textLayerAppearanceAt(layer: TextLayer, time: number): TextLayerKeyframe {
  const state = textLayerStateAt(layer, time)
  const inProgress = clamp((time - layer.startTime) / 0.35, 0, 1)
  const outProgress = clamp((layer.endTime - time) / 0.25, 0, 1)
  let x = state.x
  let y = state.y
  let scale = state.scale
  let opacity = state.opacity
  if (layer.animationIn === 'fade') opacity *= inProgress
  if (layer.animationOut === 'fade') opacity *= outProgress
  if (layer.animationIn === 'rise') y += (1 - inProgress) * 0.012
  if (layer.animationIn === 'slide') x -= (1 - inProgress) * 0.02
  if (layer.animationOut === 'slide') x += (1 - outProgress) * 0.02
  if (layer.animationIn === 'pop') scale *= 0.85 + inProgress * 0.15
  return { time, x, y, scale, rotation: state.rotation, opacity }
}
