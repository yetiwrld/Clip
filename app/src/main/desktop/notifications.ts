/**
 * When the app is allowed to tap you on the shoulder.
 *
 * A long job — an import, a transcription, an analysis, a render — can run for
 * minutes while the window is behind a browser. Windows notifications exist for
 * exactly that, and for nothing else: every state change that is already
 * visible in the window stays in the window.
 *
 * The decision is a pure function so the rules can be tested without an OS, and
 * the notifier around it only knows how to show, focus and deduplicate.
 */

import type { AppEvent } from '@shared/types'
import type { AppNavTarget } from '@shared/ipc'

export interface NotificationCopy {
  /** Stable key: the same job never notifies twice. */
  key: string
  title: string
  body: string
  target: AppNavTarget
}

export interface NotificationContext {
  /** False when the window is focused and in front: the user can already see it. */
  windowInBackground: boolean
  /** Settings → Interface → Desktop notifications. */
  enabled: boolean
  /** Windows lets the user turn notifications off for the whole app. */
  supported: boolean
}

/** Jobs short enough that a notification would just be noise. */
const QUIET_TASK_TYPES = new Set(['thumbnail', 'proxy', 'asset-import'])

const TASK_TITLES: Record<string, { done: string; doneBody: string; failed: string }> = {
  transcribe: {
    done: 'Transcription finished',
    doneBody: 'The transcript is ready to review.',
    failed: 'Transcription failed'
  },
  analyze: {
    done: 'Moments found',
    doneBody: 'The strongest moments are ready to review.',
    failed: 'Moment analysis failed'
  },
  download: {
    done: 'Download finished',
    doneBody: 'The media is in the project and ready to work on.',
    failed: 'Download failed'
  },
  'speaker-identification': {
    done: 'Speakers identified',
    doneBody: 'Speaker labels are ready to review in the transcript.',
    failed: 'Speaker identification failed'
  }
}

function targetFor(projectId: string | null | undefined): AppNavTarget {
  return projectId ? { view: 'project', projectId } : { view: 'dashboard' }
}

function clip(text: string, limit = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean
}

/**
 * Decide whether one backend event deserves a notification.
 * Returns null for anything the window already shows, anything the user turned
 * off, and anything too quick to matter.
 */
export function notificationForEvent(event: AppEvent, context: NotificationContext): NotificationCopy | null {
  if (!context.enabled || !context.supported || !context.windowInBackground) return null

  if (event.type === 'task:update') {
    const task = event.task
    if (QUIET_TASK_TYPES.has(task.type)) return null
    // Renders are reported through render:state, which knows the clip and the
    // file. Notifying here too would double up on the same finished job.
    if (task.type === 'render') return null
    const copy = TASK_TITLES[task.type]
    if (!copy) return null
    if (task.state === 'completed') {
      return { key: `task:${task.id}:done`, title: copy.done, body: copy.doneBody, target: targetFor(task.projectId) }
    }
    if (task.state === 'failed') {
      const reason = task.error?.message ?? task.message
      return {
        key: `task:${task.id}:failed`,
        title: copy.failed,
        body: reason ? clip(reason) : 'Open the project to see what happened.',
        target: targetFor(task.projectId)
      }
    }
    return null
  }

  if (event.type === 'render:state') {
    const render = event.render
    if (render.status === 'completed') {
      return {
        key: `render:${render.id}:done`,
        title: 'Render finished',
        body: 'Your clip is ready in the render queue.',
        target: { view: 'queue' }
      }
    }
    if (render.status === 'failed') {
      const reason = render.error?.message ?? 'The render could not be completed.'
      return {
        key: `render:${render.id}:failed`,
        title: 'Render failed',
        body: clip(reason),
        target: { view: 'queue' }
      }
    }
    return null
  }

  return null
}

export interface NotifierHost {
  isSupported(): boolean
  show(options: { title: string; body: string; onClick: () => void }): void
}

/**
 * Shows each decision once. The seen-set is bounded because the app can run for
 * days and a finished job that is re-published by a reload must still notify
 * the first time only.
 */
export class DesktopNotifier {
  private seen = new Set<string>()
  private readonly limit = 200

  constructor(private host: NotifierHost) {}

  get supported(): boolean {
    try {
      return this.host.isSupported()
    } catch {
      return false
    }
  }

  /** Returns true when a notification was actually shown. */
  notify(copy: NotificationCopy | null, onActivate: (target: AppNavTarget) => void): boolean {
    if (!copy) return false
    if (this.seen.has(copy.key)) return false
    this.seen.add(copy.key)
    if (this.seen.size > this.limit) {
      // Drop the oldest half; the set is only a guard against duplicates.
      this.seen = new Set([...this.seen].slice(-Math.floor(this.limit / 2)))
    }
    try {
      this.host.show({
        title: copy.title,
        body: copy.body,
        onClick: () => onActivate(copy.target)
      })
      return true
    } catch {
      // A notification failure is never worth interrupting the job.
      return false
    }
  }

  /** Tests and the settings screen can ask whether this job already pinged. */
  hasNotified(key: string): boolean {
    return this.seen.has(key)
  }
}
