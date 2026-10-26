import React from 'react'

import { sparklinePoints } from '../../lib/motion'

/**
 * The measured history of a long job, drawn as it arrives.
 *
 * Every point is a progress value the backend actually reported, in order. There
 * is no smoothing and no invented data: if a render stalls, the line goes flat,
 * which is exactly what is happening.
 *
 * The graph is decoration on top of text. The percentage, stage and elapsed time
 * next to it carry the meaning, so this is hidden from assistive technology.
 */
export function ActivitySparkline(props: { samples: readonly number[]; width?: number; height?: number }) {
  const width = props.width ?? 120
  const height = props.height ?? 20
  if (props.samples.length < 2) return null
  const points = sparklinePoints(props.samples, width, height)
  const last = props.samples[props.samples.length - 1] ?? 0
  const lastX = width - 1
  const lastY = 1 + (height - 2) * (1 - Math.min(1, Math.max(0, last)))

  return (
    <svg className="activity-graph" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <line className="activity-graph-base" x1="1" y1={height - 1} x2={width - 1} y2={height - 1} />
      <polyline className="activity-graph-line" points={points} />
      <circle className="activity-graph-head" cx={lastX} cy={lastY} r="1.6" />
    </svg>
  )
}
