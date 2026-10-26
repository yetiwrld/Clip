/**
 * The renderer half of the desktop integration.
 *
 * Everything Windows can ask the app to do while the window is open lands here
 * in one place: files handed over from Explorer, a notification click, the
 * taskbar progress for a running render, and the "save before quitting" request.
 *
 * In the browser preview every one of these is a no-op, because the helpers in
 * `bridge.ts` check for the preload bridge first.
 */

import { useEffect } from 'react'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { flushStorage } from '../../persistence/durability'
import { flushAllPending } from '../../persistence/flush-bus'
import { importDroppedPaths } from '../import/importFiles'
import {
  announceRendererReady,
  answerFlush,
  onFlushRequest,
  onNavigate,
  onOpenFiles,
  setCloseGuard,
  setDesktopPreferences,
  setTaskbarProgress
} from './bridge'
import type { AppNavTarget } from '@shared/ipc'

/** Long jobs that are worth the taskbar's indeterminate state. */
const LONG_TASKS = new Set(['transcribe', 'analyze', 'download', 'render'])

export function useDesktopIntegration(): void {
  const unsavedWork = useAppStore((state) => state.unsavedWork)
  const notificationsEnabled = useAppStore((state) => state.settings?.appearance.desktopNotifications ?? true)
  const renders = useDataStore((state) => state.renders)
  const tasks = useDataStore((state) => state.tasks)

  // Files Windows opened before the window existed, plus the first "ready" ping.
  useEffect(() => {
    let cancelled = false
    void announceRendererReady().then(({ paths, projectId }) => {
      if (cancelled) return
      if (projectId) useAppStore.getState().openProject(projectId)
      if (paths.length > 0) void importDroppedPaths(paths)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => onOpenFiles((paths) => void importDroppedPaths(paths)), [])

  useEffect(() => onNavigate((target: AppNavTarget) => {
    const app = useAppStore.getState()
    if (target.view === 'queue') app.navigate('queue')
    else if (target.view === 'project') app.openProject(target.projectId)
    else app.navigate('dashboard')
  }), [])

  // The window asks nothing about unsaved work until we have told it the truth.
  useEffect(() => {
    setCloseGuard(unsavedWork)
  }, [unsavedWork])

  useEffect(() => {
    setDesktopPreferences({ notificationsEnabled })
  }, [notificationsEnabled])

  /**
   * Taskbar progress. A real fraction while renders run, indeterminate while a
   * long job without a usable percentage runs, and cleared when nothing is
   * working — the taskbar should never keep a bar after the queue is empty.
   */
  useEffect(() => {
    const active = renders.filter((render) => render.status === 'queued' || render.status === 'preparing' || render.status === 'rendering')
    if (active.length > 0) {
      const done = active.reduce((sum, render) => {
        if (render.status === 'preparing') return sum + 0.05
        return sum + Math.min(1, Math.max(0, render.progress ?? 0))
      }, 0)
      setTaskbarProgress(Math.min(0.99, done / active.length))
      return
    }
    const longTaskRunning = tasks.some((task) => task.state === 'running' && LONG_TASKS.has(task.type))
    // Electron shows an indeterminate bar for values above 1 on Windows.
    setTaskbarProgress(longTaskRunning ? 2 : null)
  }, [renders, tasks])

  // "Save and quit" in the native close prompt, or a window that is going away.
  useEffect(() => onFlushRequest(() => {
    void (async () => {
      const held = await flushAllPending()
      if (!held) {
        answerFlush(false)
        return
      }
      try {
        await flushStorage()
        answerFlush(true)
      } catch {
        answerFlush(false)
      }
    })()
  }), [])
}
