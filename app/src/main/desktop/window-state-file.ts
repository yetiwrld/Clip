/**
 * The tiny file layer behind `window-state.ts`.
 *
 * Kept separate so the geometry rules stay pure and testable, and so a write
 * failure (read-only profile, antivirus lock) can never stop the app from
 * closing: this module reports problems and nothing else.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { StoredWindowState } from './window-state'

export function readWindowState(file: string): unknown {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    if (raw.length > 4096) return null
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function writeWindowState(file: string, state: StoredWindowState): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Write beside the target and rename: a crash mid-write leaves the old
    // file intact instead of a half-written one that parses to nothing.
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(state), 'utf8')
    fs.renameSync(temporary, file)
  } catch {
    /* a window position is not worth failing a quit over */
  }
}
