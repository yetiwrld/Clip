import { create } from 'zustand'
import type { AppInfo, AppSettings, DependencyStatus, ProviderAvailability, Project } from '@shared/types'
import type { PaletteMode } from '../commands/types'
import { api, errMessage } from '../api/client'

export type View = 'dashboard' | 'project' | 'editor' | 'queue' | 'settings' | 'help'

/** Tabs on the project screen. Kept in the store so commands can switch them. */
export type ProjectTab = 'source' | 'transcript' | 'moments' | 'clips' | 'renders'

/** Sections on the settings screen, for the same reason. */
export type SettingsSection = 'ai' | 'transcription' | 'video' | 'captions' | 'export' | 'storage' | 'advanced'

export type { PaletteMode }

export interface Toast {
  id: number
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
  hint?: string
  code?: string
  actionLabel?: string
  action?: () => void
  /** How long the toast stays. Longer for messages that carry an Undo. */
  timeoutMs?: number
}

/** What a screen showed last time: search text, follow mode, scroll offset. */
export interface TranscriptUi {
  query: string
  follow: boolean
  scroll: number
}

/** A place the user has been, complete enough to return to it. */
export interface NavTarget {
  view: View
  projectId: string | null
  clipId: string | null
  projectTab: ProjectTab
  settingsSection: SettingsSection
}

interface AppStore {
  view: View
  projectId: string | null
  editorClipId: string | null
  navigate(view: View, opts?: { projectId?: string | null; clipId?: string | null }): void
  openProject(projectId: string): void
  openEditor(clipId: string, projectId: string): void

  /** Back/forward over the screens that were actually visited. */
  history: NavTarget[]
  future: NavTarget[]
  back(): void
  forward(): void
  canGoBack(): boolean
  canGoForward(): boolean

  /** Which project tab is open, and what each project was last showing. */
  projectTab: ProjectTab
  projectTabs: Record<string, ProjectTab>
  setProjectTab(tab: ProjectTab): void

  /**
   * Per-project screen state, so switching tab or screen and coming back puts
   * the search text, the follow switch and the scroll position where they were.
   * Written on unmount, not on every keystroke: a write re-renders the shell.
   */
  transcriptUi: Record<string, TranscriptUi>
  setTranscriptUi(projectId: string, patch: Partial<TranscriptUi>): void

  /** Which settings section is open. */
  settingsSection: SettingsSection
  setSettingsSection(section: SettingsSection): void

  /** The guided tour is a single overlay owned by the app shell. */
  tourOpen: boolean
  startTour(): void
  closeTour(): void
  /** Help state lives in settings so it survives a restart. */
  dismissTip(id: string): Promise<void>
  isTipDismissed(id: string): boolean

  /** The command palette is a single overlay owned by the app shell. */
  paletteOpen: boolean
  paletteMode: PaletteMode
  openPalette(mode?: PaletteMode): void
  closePalette(): void

  appInfo: AppInfo | null
  settings: AppSettings | null
  /** Settings write through one switch, so the header can show the truth. */
  settingsSaveState: 'idle' | 'saving' | 'saved' | 'error'
  dependencies: DependencyStatus[]
  refreshDependencies(): Promise<void>
  providers: ProviderAvailability[]
  bootstrapped: boolean
  bootstrap(): Promise<void>
  saveSettings(patch: Record<string, unknown>): Promise<boolean>

  toasts: Toast[]
  toast(t: Omit<Toast, 'id'>): void
  dismissToast(id: number): void

  projectUpdated: Project | null
  notifyProjectUpdate(p: Project): void
}

let toastSeq = 1

/** Bounded so a long session cannot grow the stack without limit. */
const MAX_HISTORY = 25

function targetFrom(state: Pick<AppStore, 'view' | 'projectId' | 'editorClipId' | 'projectTab' | 'settingsSection'>): NavTarget {
  return {
    view: state.view,
    projectId: state.projectId,
    clipId: state.editorClipId,
    projectTab: state.projectTab,
    settingsSection: state.settingsSection
  }
}

function samePlace(a: NavTarget, b: NavTarget): boolean {
  return a.view === b.view && a.projectId === b.projectId && a.clipId === b.clipId
}

export const useAppStore = create<AppStore>((set, get) => ({
  view: 'dashboard',
  projectId: null,
  editorClipId: null,

  navigate(view, opts) {
    const state = get()
    const projectId = opts?.projectId ?? (view === 'project' || view === 'editor' ? state.projectId : null)
    const clipId = view === 'editor' ? opts?.clipId ?? state.editorClipId : null
    const next = { ...targetFrom(state), view, projectId, clipId }
    // Selecting the screen you are already on is not a navigation step.
    if (samePlace(targetFrom(state), next)) {
      set({ view, projectId, editorClipId: clipId })
      return
    }
    set({
      view,
      projectId,
      editorClipId: clipId,
      history: [...state.history, targetFrom(state)].slice(-MAX_HISTORY),
      future: []
    })
  },
  openProject(projectId) {
    const state = get()
    const from = targetFrom(state)
    // Returning to a project puts you back on the tab you left it on.
    const tab = state.projectTabs[projectId] ?? 'source'
    const next: NavTarget = { ...from, view: 'project', projectId, clipId: null, projectTab: tab }
    set({
      view: 'project',
      projectId,
      editorClipId: null,
      projectTab: tab,
      history: samePlace(from, next) ? state.history : [...state.history, from].slice(-MAX_HISTORY),
      future: []
    })
  },

  history: [],
  future: [],
  back() {
    const state = get()
    const previous = state.history[state.history.length - 1]
    if (!previous) return
    set({
      view: previous.view,
      projectId: previous.projectId,
      editorClipId: previous.clipId,
      projectTab: previous.projectTab,
      settingsSection: previous.settingsSection,
      history: state.history.slice(0, -1),
      future: [...state.future, targetFrom(state)].slice(-MAX_HISTORY)
    })
  },
  forward() {
    const state = get()
    const next = state.future[state.future.length - 1]
    if (!next) return
    set({
      view: next.view,
      projectId: next.projectId,
      editorClipId: next.clipId,
      projectTab: next.projectTab,
      settingsSection: next.settingsSection,
      history: [...state.history, targetFrom(state)].slice(-MAX_HISTORY),
      future: state.future.slice(0, -1)
    })
  },
  canGoBack() {
    return get().history.length > 0
  },
  canGoForward() {
    return get().future.length > 0
  },

  projectTab: 'source',
  projectTabs: {},
  setProjectTab(projectTab) {
    const state = get()
    set({
      projectTab,
      projectTabs: state.projectId ? { ...state.projectTabs, [state.projectId]: projectTab } : state.projectTabs
    })
  },

  transcriptUi: {},
  setTranscriptUi(projectId, patch) {
    const current = get().transcriptUi[projectId] ?? { query: '', follow: true, scroll: 0 }
    const next = { ...current, ...patch }
    if (next.query === current.query && next.follow === current.follow && next.scroll === current.scroll) return
    set({ transcriptUi: { ...get().transcriptUi, [projectId]: next } })
  },

  settingsSection: 'ai',
  setSettingsSection(settingsSection) {
    set({ settingsSection })
  },

  tourOpen: false,
  startTour() {
    set({ tourOpen: true })
  },
  closeTour() {
    set({ tourOpen: false })
    // Finishing and skipping are the same thing for the user: do not ask again.
    void get().saveSettings({ help: { tourCompleted: true } })
  },
  isTipDismissed(id) {
    return (get().settings?.help.dismissedTips ?? []).includes(id)
  },
  async dismissTip(id) {
    const dismissed = get().settings?.help.dismissedTips ?? []
    if (dismissed.includes(id)) return
    await get().saveSettings({ help: { dismissedTips: [...dismissed, id] } })
  },

  paletteOpen: false,
  paletteMode: 'commands',
  openPalette(mode = 'commands') {
    set({ paletteOpen: true, paletteMode: mode })
  },
  closePalette() {
    set({ paletteOpen: false })
  },
  openEditor(clipId, projectId) {
    const state = get()
    set({
      view: 'editor',
      projectId,
      editorClipId: clipId,
      history: [...state.history, targetFrom(state)].slice(-MAX_HISTORY),
      future: []
    })
  },

  appInfo: null,
  settings: null,
  settingsSaveState: 'idle',
  dependencies: [],
  providers: [],
  bootstrapped: false,

  /** Re-run the dependency probes (e.g. after installing faster-whisper). */
  async refreshDependencies(): Promise<void> {
    try {
      const [dependencies, providers] = await Promise.all([
        api['app.checkDependencies'](),
        api['analysis.providers']()
      ])
      set({ dependencies, providers })
    } catch {
      /* keep the last known state */
    }
  },

  async bootstrap() {
    try {
      const [appInfo, settings, dependencies, providers, storage] = await Promise.all([
        api['app.getInfo'](),
        api['settings.get'](),
        api['app.checkDependencies'](),
        api['analysis.providers'](),
        api['storage.status']()
      ])
      set({ appInfo, settings, dependencies, providers, bootstrapped: true })
      if (storage.recoveredFromCorrupt) {
        const kept = storage.corruptBackupPath?.split(/[\\/]/).pop() ?? 'app.db.corrupt'
        get().toast({
          level: 'warn',
          message: 'Clipwright could not read your workspace database, so it started a new one.',
          hint: `Nothing was deleted: the unreadable file was kept as “${kept}” next to it. Projects it listed are hidden until that file is repaired.`,
          timeoutMs: 20000
        })
      }
    } catch (err) {
      const { message, hint } = errMessage(err)
      get().toast({ level: 'error', message: `Startup check failed: ${message}`, hint })
      set({ bootstrapped: true })
    }
  },

  async saveSettings(patch) {
    set({ settingsSaveState: 'saving' })
    try {
      const settings = await api['settings.update']({ patch })
      set({ settings, settingsSaveState: 'saved' })
      return true
    } catch (err) {
      const { message, hint } = errMessage(err)
      set({ settingsSaveState: 'error' })
      get().toast({ level: 'error', message, hint })
      return false
    }
  },

  toasts: [],
  toast(t) {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    const timeout = t.timeoutMs ?? (t.level === 'error' ? 9000 : 5000)
    setTimeout(() => get().dismissToast(id), timeout)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  projectUpdated: null,
  notifyProjectUpdate(project) {
    set({ projectUpdated: project })
  }
}))
