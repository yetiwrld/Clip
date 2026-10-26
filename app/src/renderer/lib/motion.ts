/**
 * Live motion: the shared rules, kept out of React so they can be tested.
 *
 * Two kinds of motion exist in the app and they have different jobs:
 *
 *  - **functional** — a spinner, a progress bar, a pulsing dot next to the word
 *    "Rendering". These explain what the app is doing and must never stop, even
 *    when the user asks for less motion.
 *  - **ambient** — the welcome backdrop, the activity graph, the status pulse.
 *    These are decoration on top of a status that is also written in words, so
 *    they can be switched off without losing information.
 *
 * `resolveMotionMode` is the single place that decides which of the two is
 * allowed: the system's reduced-motion preference always wins, then the user's
 * setting in Settings → Advanced.
 */

export type MotionMode = 'full' | 'reduced'

export interface MotionPreferences {
  /** Settings → Advanced → Ambient visual effects. */
  ambientEffects: boolean
  /** `(prefers-reduced-motion: reduce)`. */
  systemReducedMotion: boolean
}

export function resolveMotionMode(preferences: MotionPreferences): MotionMode {
  return preferences.ambientEffects && !preferences.systemReducedMotion ? 'full' : 'reduced'
}

export function ambientAllowed(preferences: MotionPreferences): boolean {
  return resolveMotionMode(preferences) === 'full'
}

/** How many measured progress samples the activity graph keeps per job. */
export const ACTIVITY_SAMPLE_LIMIT = 48

/**
 * A progress value the UI may trust, or `null` when the backend has not
 * reported one. `0` is a real measurement and stays `0`.
 */
export function clampProgress(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
}

export type ProgressKind = 'determinate' | 'indeterminate'

/**
 * Determinate means the backend gave a number: draw a bar that fills. Anything
 * else means "working, no estimate": draw a moving sliver instead of a bar that
 * pretends to be at 0 %.
 */
export function progressKind(value: number | null | undefined): ProgressKind {
  return clampProgress(value) == null ? 'indeterminate' : 'determinate'
}

/** Rounded percentage for text, or `null` when there is nothing to show. */
export function progressPercent(value: number | null | undefined): number | null {
  const clamped = clampProgress(value)
  return clamped == null ? null : Math.round(clamped * 100)
}

/**
 * Append one measured sample to a job's history.
 *
 * Returns the same array reference when there is nothing to add, so the store
 * can skip the write (and therefore the re-render) entirely. Progress that does
 * not move produces no new samples, which keeps an idle bar flat and cheap.
 */
export function pushActivity(previous: readonly number[], value: number | null | undefined): readonly number[] {
  const next = clampProgress(value)
  if (next == null) return previous
  const last = previous[previous.length - 1]
  if (last === next) return previous
  const appended = [...previous, next]
  return appended.length > ACTIVITY_SAMPLE_LIMIT ? appended.slice(appended.length - ACTIVITY_SAMPLE_LIMIT) : appended
}

/** Store helper: record a sample for one job id, without copying when unchanged. */
export function recordActivity(
  activity: Readonly<Record<string, readonly number[]>>,
  id: string,
  value: number | null | undefined
): Readonly<Record<string, readonly number[]>> {
  const previous = activity[id] ?? []
  const next = pushActivity(previous, value)
  if (next === previous) return activity
  return { ...activity, [id]: next }
}

/** Store helper: drop history for jobs that are no longer running. */
export function pruneActivity(
  activity: Readonly<Record<string, readonly number[]>>,
  keep: Iterable<string>
): Readonly<Record<string, readonly number[]>> {
  const keepSet = new Set(keep)
  const keys = Object.keys(activity)
  if (keys.every((key) => keepSet.has(key))) return activity
  const next: Record<string, readonly number[]> = {}
  for (const key of keys) if (keepSet.has(key)) next[key] = activity[key]
  return next
}

/**
 * Elapsed time for a running job, in the shortest readable form. Real clock
 * time only — nothing is estimated from progress.
 */
export function formatElapsed(startedAt: string | number | null | undefined, now: number): string {
  if (startedAt == null) return '0s'
  const start = typeof startedAt === 'number' ? startedAt : Date.parse(startedAt)
  if (!Number.isFinite(start) || !Number.isFinite(now)) return '0s'
  const seconds = Math.max(0, Math.floor((now - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

/**
 * Points for the activity graph: `value` 0…1 mapped into a box `width × height`
 * with a one-pixel inset so the line never touches the border.
 */
export function sparklinePoints(samples: readonly number[], width: number, height: number): string {
  if (samples.length === 0) return ''
  const inset = 1
  const usableWidth = Math.max(1, width - inset * 2)
  const usableHeight = Math.max(1, height - inset * 2)
  const step = samples.length > 1 ? usableWidth / (samples.length - 1) : 0
  return samples
    .map((sample, index) => {
      const x = inset + step * index
      const y = inset + usableHeight * (1 - Math.min(1, Math.max(0, sample)))
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
