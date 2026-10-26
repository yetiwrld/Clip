import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Store write discipline.
 *
 * Both polled lists (tasks, renders) are refreshed by a timer as a fallback for
 * the event stream. If a poll writes its result back unconditionally, every
 * screen subscribed to the store re-renders — even though nothing changed. On an
 * idle workspace that used to happen 40 times a minute in the transcript tab
 * (1.5 s poll) and 15 times a minute in the queue (4 s poll).
 *
 * These tests pin the fix: an identical list must not touch the store at all.
 */

const tasksList = vi.fn()
const rendersList = vi.fn()

vi.mock('../../src/renderer/api/client', () => ({
  api: {
    'tasks.list': (...args: unknown[]) => tasksList(...args),
    'renders.list': (...args: unknown[]) => rendersList(...args)
  }
}))

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  type: 'transcribe',
  projectId: 'p1',
  state: 'running',
  stage: 'transcribing',
  progress: 0.4,
  message: 'Working',
  error: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:10.000Z',
  ...overrides
})

const render = (overrides: Record<string, unknown> = {}) => ({
  id: 'render-1',
  clipId: 'clip-1',
  projectId: 'p1',
  status: 'rendering',
  progress: 0.5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:10.000Z',
  ...overrides
})

async function loadStore() {
  const module = await import('../../src/renderer/stores/data')
  return module.useDataStore
}

describe('polled lists do not write unchanged data', () => {
  beforeEach(() => {
    tasksList.mockReset()
    rendersList.mockReset()
  })

  it('writes tasks once, then stays silent while the result is identical', async () => {
    const store = await loadStore()
    store.setState({ tasks: [] })
    tasksList.mockResolvedValue([task()])

    let writes = 0
    const unsubscribe = store.subscribe(() => {
      writes += 1
    })

    await store.getState().loadTasks('p1')
    expect(writes).toBe(1)

    // 20 further polls, all identical: the old implementation wrote 20 times.
    for (let i = 0; i < 20; i += 1) await store.getState().loadTasks('p1')
    expect(writes).toBe(1)

    unsubscribe()
  })

  it('writes again when a task actually moves', async () => {
    const store = await loadStore()
    store.setState({ tasks: [task()] })
    tasksList.mockResolvedValue([task({ progress: 0.75, updatedAt: '2026-01-01T00:00:20.000Z' })])

    let writes = 0
    const unsubscribe = store.subscribe(() => {
      writes += 1
    })
    await store.getState().loadTasks('p1')
    expect(writes).toBe(1)
    expect(store.getState().tasks[0].progress).toBe(0.75)

    unsubscribe()
  })

  it('applies the same rule to renders', async () => {
    const store = await loadStore()
    store.setState({ renders: [render()], rendersLoaded: true })
    rendersList.mockResolvedValue([render()])

    let writes = 0
    const unsubscribe = store.subscribe(() => {
      writes += 1
    })
    await store.getState().loadRenders('p1')
    await store.getState().loadRenders('p1')
    expect(writes).toBe(0)

    rendersList.mockResolvedValue([render({ status: 'completed', progress: 1, updatedAt: '2026-01-01T00:01:00.000Z' })])
    await store.getState().loadRenders('p1')
    expect(writes).toBe(1)

    unsubscribe()
  })

  it('shares one in-flight request instead of asking twice', async () => {
    const store = await loadStore()
    store.setState({ tasks: [] })

    let resolveFirst: (value: unknown) => void = () => undefined
    tasksList.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )

    const first = store.getState().loadTasks('p1')
    const second = store.getState().loadTasks('p1')
    expect(tasksList).toHaveBeenCalledTimes(1)

    resolveFirst([task()])
    await Promise.all([first, second])
    expect(store.getState().tasks).toHaveLength(1)

    // The key is released, so a later refresh really does ask again.
    tasksList.mockResolvedValue([task({ state: 'completed', progress: 1, updatedAt: '2026-01-01T00:01:00.000Z' })])
    await store.getState().loadTasks('p1')
    expect(tasksList).toHaveBeenCalledTimes(2)
  })

  it('still replaces the list when an item disappears', async () => {
    const store = await loadStore()
    store.setState({ tasks: [task(), task({ id: 'task-2' })] })
    tasksList.mockResolvedValue([task()])

    await store.getState().loadTasks('p1')
    expect(store.getState().tasks).toHaveLength(1)
  })
})
