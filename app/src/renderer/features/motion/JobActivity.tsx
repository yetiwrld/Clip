import React from 'react'

import { ProgressBar } from '../../components/ui'
import { formatElapsed, progressPercent } from '../../lib/motion'
import { useNow } from './useMotion'
import { ActivitySparkline } from './ActivitySparkline'

/**
 * One running job, shown honestly.
 *
 * Three states, three visuals, never mixed up:
 *
 *  - **queued** — no bar at all, because nothing is happening yet;
 *  - **working, no estimate** — the indeterminate sliver, which means "alive,
 *    length unknown";
 *  - **working, with an estimate** — a bar that fills to the reported number.
 *
 * The status word, the percentage and the elapsed time are always text, so the
 * meaning survives with animation switched off or reduced.
 */
export function JobActivity(props: {
  state: 'working' | 'queued'
  statusLabel: string
  /** Backend progress, 0…1, or null when none has been reported. */
  progress: number | null | undefined
  /** Measured samples for the graph; omitted when there is no history. */
  samples?: readonly number[]
  /** ISO timestamp of when the job started, for the elapsed readout. */
  startedAt?: string | null
  /** Drives the one-second clock. Off means a static "now". */
  ticking?: boolean
}) {
  const now = useNow(props.ticking ?? true)
  const percent = progressPercent(props.progress)
  const elapsed = props.state === 'working' && props.startedAt ? formatElapsed(props.startedAt, now) : null

  return (
    <div className="job-activity">
      <div className="job-activity-head">
        <span className={`status ${props.state === 'queued' ? 'queued' : 'working'}`}>
          <span className="dot" /> {props.statusLabel}
        </span>
        <span className="job-activity-metrics tiny mono">
          {props.state === 'queued' ? 'Waiting' : percent != null ? `${percent}%` : 'Working'}
          {elapsed ? ` · ${elapsed}` : ''}
        </span>
      </div>
      {props.state === 'working' && <ProgressBar value={props.progress} />}
      {props.samples && props.state === 'working' ? <ActivitySparkline samples={props.samples} /> : null}
    </div>
  )
}
