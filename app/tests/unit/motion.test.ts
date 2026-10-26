import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ACTIVITY_SAMPLE_LIMIT,
  clampProgress,
  formatElapsed,
  progressKind,
  progressPercent,
  pushActivity,
  pruneActivity,
  recordActivity,
  resolveMotionMode,
  sparklinePoints
} from '../../src/renderer/lib/motion'

/**
 * Live motion contract.
 *
 * The rules that keep animation honest and cheap:
 *  - the system's reduce-motion preference wins over the setting, and the
 *    setting can only ever remove effects, never add them;
 *  - a bar fills only for a number the backend actually reported;
 *  - progress history grows only when progress moves, so an idle workspace costs
 *    no store writes and no re-renders;
 *  - history disappears when the job does.
 */

vi.mock('../../src/renderer/api/client', () => ({
  api: {
    'tasks.list': async () => [],
    'renders.list': async () => [],
    'renders.listForProject': async () => []
  },
  errMessage: (error: unknown) => ({ message: String(error) })
}))

const { useDataStore } = await import('../../src/renderer/stores/data')
const { ProgressBar } = await import('../../src/renderer/components/ui')
const { JobActivity } = await import('../../src/renderer/features/motion/JobActivity')

describe('motion mode', () => {
  it('lets the system preference win over the setting', () => {
    expect(resolveMotionMode({ ambientEffects: true, systemReducedMotion: false })).toBe('full')
    expect(resolveMotionMode({ ambientEffects: true, systemReducedMotion: true })).toBe('reduced')
    expect(resolveMotionMode({ ambientEffects: false, systemReducedMotion: false })).toBe('reduced')
    expect(resolveMotionMode({ ambientEffects: false, systemReducedMotion: true })).toBe('reduced')
  })
})

describe('progress truth', () => {
  it('treats a missing number as unknown, not as zero', () => {
    expect(clampProgress(null)).toBeNull()
    expect(clampProgress(undefined)).toBeNull()
    expect(clampProgress(Number.NaN)).toBeNull()
    expect(clampProgress(0)).toBe(0)
    expect(progressKind(0)).toBe('determinate')
    expect(progressKind(null)).toBe('indeterminate')
  })

  it('clamps out-of-range values instead of drawing outside the bar', () => {
    expect(clampProgress(-0.4)).toBe(0)
    expect(clampProgress(1.7)).toBe(1)
    expect(progressPercent(0.4242)).toBe(42)
    expect(progressPercent(undefined)).toBeNull()
  })
})

describe('activity history', () => {
  it('adds a sample only when the number moves', () => {
    const a = pushActivity([], 0.1)
    expect(a).toEqual([0.1])
    const b = pushActivity(a, 0.1)
    expect(b).toBe(a)
    expect(pushActivity(a, null)).toBe(a)
    expect(pushActivity(a, 0.2)).toEqual([0.1, 0.2])
  })

  it('keeps the newest samples and forgets the oldest', () => {
    let samples: readonly number[] = []
    for (let i = 0; i < ACTIVITY_SAMPLE_LIMIT + 10; i += 1) samples = pushActivity(samples, i / 100)
    expect(samples).toHaveLength(ACTIVITY_SAMPLE_LIMIT)
    expect(samples[samples.length - 1]).toBeCloseTo((ACTIVITY_SAMPLE_LIMIT + 9) / 100)
  })

  it('does not copy the map when nothing changed', () => {
    const activity = recordActivity({}, 'job-1', 0.3)
    expect(recordActivity(activity, 'job-1', 0.3)).toBe(activity)
    expect(recordActivity(activity, 'job-2', null)).toBe(activity)
  })

  it('drops history for jobs that are no longer running', () => {
    const activity = recordActivity(recordActivity({}, 'job-1', 0.3), 'job-2', 0.4)
    expect(pruneActivity(activity, ['job-1'])).toEqual({ 'job-1': [0.3] })
    expect(pruneActivity(activity, ['job-1', 'job-2'])).toBe(activity)
  })
})

describe('elapsed time', () => {
  const start = '2026-01-01T10:00:00.000Z'
  const at = (seconds: number): number => Date.parse(start) + seconds * 1000

  it('reads as seconds, then minutes, then hours', () => {
    expect(formatElapsed(start, at(0))).toBe('0s')
    expect(formatElapsed(start, at(9))).toBe('9s')
    expect(formatElapsed(start, at(64))).toBe('1m 04s')
    expect(formatElapsed(start, at(3723))).toBe('1h 02m')
  })

  it('never shows a negative or invalid duration', () => {
    expect(formatElapsed(start, Date.parse(start) - 5000)).toBe('0s')
    expect(formatElapsed(null, at(30))).toBe('0s')
    expect(formatElapsed('not a date', at(30))).toBe('0s')
  })
})

describe('activity graph geometry', () => {
  it('maps values into the box, low values near the bottom', () => {
    expect(sparklinePoints([], 100, 10)).toBe('')
    expect(sparklinePoints([0.5], 100, 10)).toBe('1.0,5.0')
    const points = sparklinePoints([0, 1], 100, 10).split(' ')
    expect(points[0]).toBe('1.0,9.0')
    expect(points[1]).toBe('99.0,1.0')
  })
})

describe('the bar distinguishes measurable from unknown', () => {
  const render = (value: number | null | undefined): string => renderToStaticMarkup(React.createElement(ProgressBar, { value }))

  it('fills for a real number and announces it', () => {
    const html = render(0.42)
    expect(html).toContain('aria-valuenow="42"')
    expect(html).toContain('width:42%')
    expect(html).not.toContain('aria-busy')
  })

  it('travels for an unknown length and says so', () => {
    const html = render(null)
    expect(html).toContain('progress-track indeterminate')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('aria-valuetext="Working, length unknown"')
    // No number, so nothing that could read as a measurement.
    expect(html).not.toContain('aria-valuenow')
    expect(html).not.toContain('width:')
  })
})

describe('a running job shows three honest readings', () => {
  const render = (props: Parameters<typeof JobActivity>[0]): string =>
    renderToStaticMarkup(React.createElement(JobActivity, props))

  it('shows no bar and says Waiting while queued', () => {
    const html = render({ state: 'queued', statusLabel: 'Queued', progress: 0 })
    expect(html).toContain('Waiting')
    expect(html).not.toContain('progress-track')
    expect(html).not.toContain('0%')
  })

  it('shows the indeterminate bar when the backend gave no estimate', () => {
    const html = render({ state: 'working', statusLabel: 'Rendering', progress: null })
    expect(html).toContain('Working')
    expect(html).toContain('progress-track indeterminate')
    expect(html).not.toContain('%')
  })

  it('shows the real percentage and the graph when there is data', () => {
    const html = render({
      state: 'working',
      statusLabel: 'Rendering',
      progress: 0.42,
      samples: [0.2, 0.3, 0.42],
      startedAt: '2026-01-01T10:00:00.000Z'
    })
    expect(html).toContain('42%')
    expect(html).toContain('activity-graph')
    expect(html).toContain('aria-hidden="true"')
  })

  it('shows no clock when the backend recorded no start time', () => {
    const html = render({ state: 'working', statusLabel: 'Transcribing', progress: 0.3 })
    expect(html).toContain('30%')
    // No elapsed readout: counting from "created" would not be a real duration.
    expect(html).not.toMatch(/· \d+[smh]/)
  })
})

describe('the data store records real measurements only', () => {
  const task = (overrides: Record<string, unknown> = {}) => ({
    id: 'task-1',
    type: 'render',
    projectId: 'p1',
    state: 'running',
    stage: 'encoding',
    progress: 0.1,
    message: 'Encoding',
    error: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:01.000Z',
    ...overrides
  })

  beforeEach(() => {
    useDataStore.setState({ activity: {}, tasks: [], renders: [] })
  })

  it('appends a sample per reported value', () => {
    const store = useDataStore.getState()
    store.handleEvent({ type: 'task:update', task: task({ progress: 0.2 }) } as never)
    store.handleEvent({ type: 'task:update', task: task({ progress: 0.5 }) } as never)
    expect(useDataStore.getState().activity['task-1']).toEqual([0.2, 0.5])
  })

  it('does not grow when the number repeats', () => {
    const store = useDataStore.getState()
    store.handleEvent({ type: 'task:update', task: task({ progress: 0.3 }) } as never)
    const first = useDataStore.getState().activity
    store.handleEvent({ type: 'task:update', task: task({ progress: 0.3, message: 'Encoding, still' }) } as never)
    expect(useDataStore.getState().activity).toBe(first)
  })

  it('forgets a job once it finishes', () => {
    const store = useDataStore.getState()
    store.handleEvent({ type: 'task:update', task: task({ progress: 0.9 }) } as never)
    store.handleEvent({ type: 'task:update', task: task({ state: 'completed', progress: null }) } as never)
    expect(useDataStore.getState().activity['task-1']).toBeUndefined()
  })

  it('records render progress and prunes it when the render stops', () => {
    const store = useDataStore.getState()
    store.handleEvent({ type: 'render:progress', renderId: 'r1', clipId: 'c1', projectId: 'p1', progress: 0.25, stage: 'encoding' } as never)
    store.handleEvent({ type: 'render:progress', renderId: 'r1', clipId: 'c1', projectId: 'p1', progress: 0.6, stage: 'encoding' } as never)
    expect(useDataStore.getState().activity.r1).toEqual([0.25, 0.6])

    const render = {
      id: 'r1',
      clipId: 'c1',
      projectId: 'p1',
      outputPath: '/out.mp4',
      status: 'completed',
      progress: 1,
      preview: false,
      stage: null,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:01:00.000Z'
    }
    store.handleEvent({ type: 'render:state', render } as never)
    expect(useDataStore.getState().activity.r1).toBeUndefined()
  })
})
