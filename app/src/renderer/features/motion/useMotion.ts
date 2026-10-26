import { useSyncExternalStore } from 'react'

import { useAppStore } from '../../stores/app'
import { ambientAllowed, resolveMotionMode, type MotionMode } from '../../lib/motion'

/**
 * Hooks for live motion.
 *
 * Two principles keep this cheap:
 *
 *  - **No per-frame React.** Nothing here re-renders on an animation frame. The
 *    continuous effects are CSS, and the only timer is a one-second clock that
 *    exists solely for elapsed-time readouts while a job is running.
 *  - **One clock for the whole app.** Every component that needs "now" shares a
 *    single interval, which starts when the first component subscribes and
 *    stops when the last one leaves. While the window is hidden it does not
 *    tick at all.
 */

// --------------------------------------------------------------- media query --

function mediaQuery(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query)
}

function subscribeMedia(query: string, onChange: () => void): () => void {
  const list = mediaQuery(query)
  if (!list) return () => undefined
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/** True when the operating system asks for less motion. */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeMedia(REDUCED_QUERY, onChange),
    () => mediaQuery(REDUCED_QUERY)?.matches ?? false,
    () => false
  )
}

/**
 * The motion mode for the app: `reduced` when the system asks for it or the
 * user turned ambient effects off, `full` otherwise.
 */
export function useMotionMode(): MotionMode {
  const systemReducedMotion = useSystemReducedMotion()
  const ambientEffects = useAppStore((state) => state.settings?.appearance.ambientEffects ?? true)
  return resolveMotionMode({ ambientEffects, systemReducedMotion })
}

/** True when decorative motion is allowed right now. */
export function useAmbientMotion(): boolean {
  return useMotionMode() === 'full'
}

/** Ambient motion as a plain function, for the one place that writes it to the DOM. */
export function ambientMotionNow(systemReducedMotion: boolean): boolean {
  const settings = useAppStore.getState().settings
  return ambientAllowed({ ambientEffects: settings?.appearance.ambientEffects ?? true, systemReducedMotion })
}

// -------------------------------------------------------------- shared clock --

const CLOCK_INTERVAL_MS = 1000
const clockListeners = new Set<() => void>()
let clockValue = 0
let clockTimer: ReturnType<typeof setInterval> | null = null
let clockVisibilityBound = false

function clockTick(): void {
  if (typeof document !== 'undefined' && document.hidden) return
  clockValue = Date.now()
  for (const listener of clockListeners) listener()
}

function subscribeClock(onChange: () => void): () => void {
  // A newly activated clock starts from a real reading, not from the last value
  // handed out before it went quiet.
  if (clockListeners.size === 0) clockValue = Date.now()
  clockListeners.add(onChange)
  if (clockTimer == null) clockTimer = setInterval(clockTick, CLOCK_INTERVAL_MS)
  if (!clockVisibilityBound && typeof document !== 'undefined') {
    // Coming back to a hidden window must not show a stale elapsed time.
    document.addEventListener('visibilitychange', clockTick)
    clockVisibilityBound = true
  }
  return () => {
    clockListeners.delete(onChange)
    if (clockListeners.size === 0 && clockTimer != null) {
      clearInterval(clockTimer)
      clockTimer = null
    }
  }
}

const neverSubscribe = (): (() => void) => () => undefined

/**
 * Wall-clock "now", updated once a second — but only while `active` is true.
 * Inactive callers subscribe to nothing, so an idle screen costs no timers.
 */
export function useNow(active: boolean): number {
  return useSyncExternalStore(
    active ? subscribeClock : neverSubscribe,
    () => clockValue,
    () => 0
  )
}

// ------------------------------------------------------------ page visibility --

function subscribeVisibility(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

/** True while the window is hidden. Ambient animation is paused meanwhile. */
export function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => (typeof document === 'undefined' ? false : document.hidden),
    () => false
  )
}
