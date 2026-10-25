import type { TextLayer } from '../types'
import { textLayerAppearanceAt } from '../video/textLayers'
import { formatAssTime } from '../utils/time'

export interface TextLayerTimeMap {
  sourceStart: number
  sourceEnd: number
  outputStart: number
}

function color(hex: string, opacity: number): string {
  const value = hex.replace('#', '')
  const alpha = Math.round(255 * (1 - Math.min(1, Math.max(0, opacity)))).toString(16).padStart(2, '0')
  return `&H${alpha}${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`.toUpperCase()
}

function safeText(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\\/g, ' ').replace(/\r?\n/g, '\\N')
}

function assName(index: number): string { return `TextLayer${index}` }

/** Build FFmpeg/libass overlays from the same source-time state evaluator used in the editor. */
export function buildTextLayersAssDocument(layers: TextLayer[], timeMap: TextLayerTimeMap[], width: number, height: number): string {
  const active = layers.filter((layer) => layer.text.trim() && layer.endTime > layer.startTime)
  if (!active.length || !timeMap.length) return ''
  const header = [
    '[Script Info]', '; Clipwright Studio text layers', 'ScriptType: v4.00+',
    `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding'
  ]
  const styles = active.map((layer, index) => {
    const bg = color(layer.backgroundColor, layer.backgroundOpacity)
    const face = layer.fontFamily.replace(/[,\r\n]/g, '')
    const size = Math.max(6, Math.round(layer.fontSize * height / 1080))
    const bold = layer.fontWeight >= 600 ? -1 : 0
    const borderStyle = layer.backgroundOpacity > 0 ? 3 : 1
    const outline = layer.backgroundOpacity > 0 ? Math.max(1, size * 0.12) : 0
    return `Style: ${assName(index)},${face},${size},${color(layer.color, 1)},${color(layer.color, 1)},${color(layer.color, 1)},${bg},${bold},0,0,0,100,100,0,0,${borderStyle},${outline.toFixed(1)},${Math.max(0.5, size * 0.025).toFixed(1)},5,36,36,0,1`
  })
  const events = ['[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
  active.forEach((layer, index) => {
    const points = new Set<number>([
      layer.startTime, layer.endTime,
      ...(layer.keyframes ?? []).map((keyframe) => keyframe.time),
      layer.startTime + 0.35, layer.endTime - 0.25
    ])
    const sortedPoints = [...points].filter((time) => time >= layer.startTime && time <= layer.endTime).sort((a, b) => a - b)
    if (sortedPoints[0] !== layer.startTime) sortedPoints.unshift(layer.startTime)
    if (sortedPoints[sortedPoints.length - 1] !== layer.endTime) sortedPoints.push(layer.endTime)
    const sourcePieces: Array<{ start: number; end: number; outputStart: number }> = []
    for (const map of timeMap) {
      const start = Math.max(layer.startTime, map.sourceStart)
      const end = Math.min(layer.endTime, map.sourceEnd)
      if (end > start) sourcePieces.push({ start, end, outputStart: map.outputStart + start - map.sourceStart })
    }
    for (const piece of sourcePieces) {
      const cuts = [piece.start, ...sortedPoints.filter((time) => time > piece.start && time < piece.end), piece.end]
      for (let i = 0; i < cuts.length - 1; i++) {
        const sourceA = cuts[i]
        const sourceB = cuts[i + 1]
        if (sourceB - sourceA < 0.005) continue
        const a = textLayerAppearanceAt(layer, sourceA)
        const b = textLayerAppearanceAt(layer, sourceB)
        const duration = Math.round((sourceB - sourceA) * 1000)
        const x1 = Math.round(a.x * width); const y1 = Math.round(a.y * height)
        const x2 = Math.round(b.x * width); const y2 = Math.round(b.y * height)
        const opacityA = Math.round(255 * (1 - Math.min(1, Math.max(0, a.opacity))))
        const opacityB = Math.round(255 * (1 - Math.min(1, Math.max(0, b.opacity))))
        const tags = [x1 === x2 && y1 === y2 ? `\\pos(${x1},${y1})` : `\\move(${x1},${y1},${x2},${y2},0,${duration})`,
          `\\fscx${Math.round(a.scale * 100)}\\fscy${Math.round(a.scale * 100)}\\frz${a.rotation.toFixed(2)}\\alpha&H${opacityA.toString(16).padStart(2, '0').toUpperCase()}&`]
        if (Math.abs(a.scale - b.scale) > 0.001 || Math.abs(a.rotation - b.rotation) > 0.05 || opacityA !== opacityB) {
          tags.push(`\\t(0,${duration},\\fscx${Math.round(b.scale * 100)}\\fscy${Math.round(b.scale * 100)}\\frz${b.rotation.toFixed(2)}\\alpha&H${opacityB.toString(16).padStart(2, '0').toUpperCase()}&)`)
        }
        const outputA = piece.outputStart + sourceA - piece.start
        const outputB = piece.outputStart + sourceB - piece.start
        events.push(`Dialogue: 0,${formatAssTime(outputA)},${formatAssTime(outputB)},${assName(index)},,0,0,0,,{${tags.join('')}}${safeText(layer.text)}`)
      }
    }
  })
  return [...header, ...styles, '', ...events].join('\n') + '\n'
}
