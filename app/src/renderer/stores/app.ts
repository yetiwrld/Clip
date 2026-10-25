import { create } from 'zustand'
import type { AppInfo, AppSettings, DependencyStatus, ProviderAvailability, Project } from '@shared/types'
import type { PaletteMode } from '../commands/types'
import { api, errMessage } from '../api/client'

export type View = 'dashboard' | 'project' | 'editor' | 'queue' | 'settings'

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

interface AppStore {
  view: View
  projectId: string | null
  editorClipId: string | null
  navigate(view: View, opts?: { projectId?: string | null; clipId?: string | null }): void
  openProject(projectId: string): void
  openEditor(clipId: string, projectId: string): void
  goBack(): { view: View; projectId: string | null } | null

  /** Which project tab is open. Reset to Source when a project is opened. */
  projectTab: ProjectTab
  setProjectTab(tab: ProjectTab): void

  /** Which settings section is open. */
  settingsSection: SettingsSection
  setSettingsSection(section: SettingsSection): void

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
let lastView: { view: View; projectId: string | null } = { view: 'dashboard', projectId: null }

export const useAppStore = create<AppStore>((set, get) => ({
  view: 'dashboard',
  projectId: null,
  editorClipId: null,

  navigate(view, opts) {
    const current = { view: get().view, projectId: get().projectId }
    if (current.view !== view || current.projectId !== (opts?.projectId ?? null)) {
      lastView = current
    }
    set({ view, projectId: opts?.projectId ?? (view === 'project' || view === 'editor' ? get().projectId : null), editorClipId: view === 'editor' ? opts?.clipId ?? get().editorClipId : null })
  },
  openProject(projectId) {
    lastView = { view: get().view, projectId: get().projectId }
    set({ view: 'project', projectId, editorClipId: null, projectTab: 'source' })
  },

  projectTab: 'source',
  setProjectTab(projectTab) {
    set({ projectTab })
  },

  settingsSection: 'ai',
  setSettingsSection(settingsSection) {
    set({ settingsSection })
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
    lastView = { view: 'project', projectId }
    set({ view: 'editor', projectId, editorClipId: clipId })
  },
  goBack() {
    return lastView
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
