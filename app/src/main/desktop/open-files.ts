/**
 * Files Windows hands to the app before the window exists.
 *
 * Three routes arrive here and they all look the same: a file dropped onto the
 * executable, "Open with…" from Explorer, and a SendTo shortcut. Windows passes
 * them as arguments, so the work is to tell a file from a flag and from
 * Electron's own arguments (`.` in development, `--inspect`, `--user-data-dir`).
 *
 * Only extensions this product can actually import count. An argument that is
 * not media or a transcript is ignored rather than reported: by the time the
 * window opens, a message about a stray flag would be noise.
 */

import path from 'node:path'
import { classifyPath } from '@shared/platform/files'

export interface OpenPathsOptions {
  cwd?: string
  /** Injected for tests; defaults to "assume it exists". */
  exists?: (candidate: string) => boolean
  limit?: number
}

export function openablePaths(argv: string[], options: OpenPathsOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd()
  const exists = options.exists ?? (() => true)
  const limit = options.limit ?? 20
  const found: string[] = []
  const seen = new Set<string>()

  // argv[0] is the executable (or Electron in development).
  for (const raw of argv.slice(1)) {
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (!value || value.startsWith('-')) continue
    // Electron passes the app directory in development; it has no extension and
    // would be classified as unsupported anyway, but skip it explicitly.
    if (value === '.' || value === '..') continue
    const resolved = path.resolve(cwd, value)
    if (classifyPath(resolved, 'asset') === 'unsupported') continue
    if (seen.has(resolved)) continue
    if (!exists(resolved)) continue
    seen.add(resolved)
    found.push(resolved)
    if (found.length >= limit) break
  }
  return found
}
