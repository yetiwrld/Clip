import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Render subscription discipline.
 *
 * `useAppStore()` and `useDataStore()` with no selector subscribe to the whole
 * store, so the component re-renders on *any* write — a background task
 * progress tick, a toast, a render job, an unrelated project. `App` wraps every
 * screen, so one of those there re-renders the open screen once a second on an
 * idle workspace.
 *
 * The remaining call sites are listed as a budget so new code uses selectors,
 * and the number can only go down.
 */

const rendererDir = path.join(process.cwd(), 'src', 'renderer')

function files(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(rendererDir)
  return out
}

const WHOLE_STORE = /use(?:App|Data)Store\(\s*\)/g

function wholeStoreSubscriptions(file: string): number {
  return (fs.readFileSync(file, 'utf8').match(WHOLE_STORE) ?? []).length
}

describe('render subscriptions', () => {
  it('never subscribes the app shell to a whole store', () => {
    expect(wholeStoreSubscriptions(path.join(rendererDir, 'App.tsx'))).toBe(0)
  })

  it('keeps whole-store subscriptions at or below the recorded debt', () => {
    // 34 screens and panels still take the whole store. Converting them is
    // mechanical but wide, so it is a budget: lower it, never raise it.
    const offenders = files()
      .map((file) => ({ file: path.relative(process.cwd(), file), count: wholeStoreSubscriptions(file) }))
      .filter((entry) => entry.count > 0)
    const total = offenders.reduce((sum, entry) => sum + entry.count, 0)
    expect(total, `Whole-store subscriptions:\n${offenders.map((o) => `${o.file}: ${o.count}`).join('\n')}`).toBeLessThanOrEqual(34)
  })

  it('polls task lists through the idle-aware hook', () => {
    const transcript = fs.readFileSync(path.join(rendererDir, 'features', 'project', 'TranscriptTab.tsx'), 'utf8')
    const queue = fs.readFileSync(path.join(rendererDir, 'features', 'render-queue', 'QueuePage.tsx'), 'utf8')
    for (const [name, source] of [['TranscriptTab', transcript], ['QueuePage', queue]] as const) {
      expect(source, `${name} must not poll loadTasks on a fixed interval`).not.toMatch(/setInterval\([^)]*loadTasks/)
      expect(source, `${name} must use usePoll`).toContain('usePoll(')
    }
  })
})
