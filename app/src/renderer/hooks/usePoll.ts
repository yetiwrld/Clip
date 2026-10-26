import { useEffect, useRef } from 'react'

/**
 * Run a callback on a delay, and let the delay change while it runs.
 *
 * The task lists are polled only as a fallback next to the backend event
 * stream. Polling at full speed while nothing is running is wasted work, so
 * screens pass a fast delay while work is live and a slow one when idle. The
 * callback is kept in a ref so a new closure does not restart the timer.
 */
export function usePoll(callback: () => void | Promise<void>, delayMs: number): void {
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = (): void => {
      timer = setTimeout(() => {
        if (cancelled) return
        Promise.resolve()
          .then(() => latest.current())
          .catch(() => undefined)
          .finally(() => {
            if (!cancelled) tick()
          })
      }, delayMs)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [delayMs])
}
