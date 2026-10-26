/**
 * "Write everything you are still holding."
 *
 * The editor keeps edits inside a debounce window; the desktop close prompt
 * needs to be able to ask for them right now, before the window goes away. A
 * small registry keeps that question out of the shell: each screen that owns
 * pending writes registers one handler, and the desktop integration calls them
 * all and waits.
 *
 * Nothing here is a save path of its own: a handler must be the same routine the
 * screen already uses for leave/render/visibility flushes.
 */

type FlushHandler = () => Promise<boolean>

const handlers = new Set<FlushHandler>()

export function registerFlushHandler(handler: FlushHandler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/**
 * Runs every registered flush. Resolves true only when all of them report
 * success; a throw counts as failure rather than blocking the caller.
 */
export async function flushAllPending(): Promise<boolean> {
  const results = await Promise.all(
    [...handlers].map(async (handler) => {
      try {
        return await handler()
      } catch {
        return false
      }
    })
  )
  return results.every(Boolean)
}

export function hasFlushHandlers(): boolean {
  return handlers.size > 0
}
