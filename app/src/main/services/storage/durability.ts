import { AppError } from '@shared/errors'
import type { AppContext } from '../app-context'

/**
 * Flush the database to disk and turn a failed write into a real error.
 *
 * The database keeps changes in memory for a moment before writing (see
 * AppDatabase). That is fine for throughput, but it means a resolved API call
 * is not proof that anything reached the disk. Every call that changes user
 * data goes through here before it is reported as done, so "Saved" in the UI
 * means "written", not "queued".
 *
 * The write is not lost when this throws: AppDatabase keeps the change pending
 * and retries on the next write, flush or shutdown.
 */
export async function flushDurability(ctx: AppContext, action = 'change'): Promise<void> {
  try {
    await ctx.db.persistNow()
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    ctx.logger.error('storage', 'flush.failed', `${action}: ${detail}`)
    throw new AppError(
      'STORAGE_WRITE_FAILED',
      `Your ${action} is still in memory, but Clipwright could not write it to disk.`,
      'Keep the app open and try again. If it keeps failing, check that the workspace folder is writable and has free space (Settings → Storage shows where it lives).',
      detail
    )
  }
}
