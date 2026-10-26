import React, { useEffect, useState, type CSSProperties } from 'react'
import { FolderOpen, ListVideo, Settings as SettingsIcon, X, TriangleAlert, Keyboard, CircleHelp, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAppStore } from './stores/app'
import { useDataStore } from './stores/data'
import { subscribeEvents, isPreview, mediaUrl, api } from './api/client'
import { ToastIcon } from './components/ui'
import { CAPTION_FONTS } from '@shared/constants'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ProjectPage } from './features/project/ProjectPage'
import { EditorPage } from './features/editor/EditorPage'
import { QueuePage } from './features/render-queue/QueuePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { HelpPage } from './features/help/HelpPage'
import { TourOverlay } from './features/help/TourOverlay'
import { FirstRunModal } from './features/onboarding/FirstRunModal'
import { UpdatePrompt } from './features/updates/UpdatePrompt'
import { CommandPalette } from './components/CommandPalette'
import { registerCommands } from './commands/registry'
import { navigationCommands, projectCommands } from './commands/appCommands'
import { formatShortcut } from './commands/keys'
import { useGlobalShortcuts } from './commands/useGlobalShortcuts'
import { useDocumentHidden, useMotionMode } from './features/motion/useMotion'
import { ResizeHandle } from './features/workspace/ResizeHandle'
import { SIDEBAR_LIMIT } from './features/workspace/layout'
import { useWorkspaceLayout } from './features/workspace/useWorkspaceLayout'

export function App() {
  // Narrow subscriptions on purpose: this component wraps every screen, so a
  // whole-store subscription here would re-render the open screen every time a
  // background task, render or toast changed.
  const view = useAppStore((s) => s.view)
  const navigate = useAppStore((s) => s.navigate)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const bootstrapped = useAppStore((s) => s.bootstrapped)
  const settings = useAppStore((s) => s.settings)
  const toasts = useAppStore((s) => s.toasts)
  const toast = useAppStore((s) => s.toast)
  const dismissToast = useAppStore((s) => s.dismissToast)
  const openPalette = useAppStore((s) => s.openPalette)
  const projects = useDataStore((s) => s.projects)
  const activeRenders = useDataStore(
    (s) => s.renders.filter((r) => r.status === 'rendering' || r.status === 'preparing' || r.status === 'queued').length
  )
  const interruptedCount = useDataStore((s) => s.tasks.filter((t) => t.state === 'interrupted').length)
  const refreshProjects = useDataStore((s) => s.refreshProjects)
  const loadRenders = useDataStore((s) => s.loadRenders)
  const loadTasks = useDataStore((s) => s.loadTasks)

  /**
   * The sidebar remembers its width and whether it is collapsed. Dragging keeps
   * the width in local state (one render per pointer move, no writes) and only
   * saves when the pointer is released.
   */
  const { layout, update: updateLayout } = useWorkspaceLayout()
  const [sidebarWidth, setSidebarWidth] = useState(layout.sidebarWidth)
  useEffect(() => setSidebarWidth(layout.sidebarWidth), [layout.sidebarWidth])
  const sidebarCollapsed = layout.sidebarCollapsed

  /**
   * One place decides whether decorative motion runs, and it is written to the
   * document so CSS can gate on it: `html[data-motion="full"]` enables the
   * ambient effects, `html[data-hidden="true"]` pauses them while the window is
   * not visible. Functional motion (spinners, bars) never consults this.
   */
  const motionMode = useMotionMode()
  const ambientEffects = useAppStore((s) => s.settings?.appearance.ambientEffects ?? true)
  const documentHidden = useDocumentHidden()
  useEffect(() => {
    document.documentElement.dataset.ambient = ambientEffects ? 'on' : 'off'
  }, [ambientEffects])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.motion = motionMode
    return () => {
      delete root.dataset.motion
    }
  }, [motionMode])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.hidden = documentHidden ? 'true' : 'false'
  }, [documentHidden])

  // One listener for the whole renderer, and the two command sets that never
  // change with the screen. Screen-specific commands register themselves.
  useGlobalShortcuts()
  useEffect(() => registerCommands(navigationCommands()), [])
  useEffect(
    () => registerCommands(projectCommands(projects.map((project) => ({ id: project.id, name: project.name })))),
    [projects]
  )

  useEffect(() => {
    void bootstrap()
    void refreshProjects()
    void loadRenders()
    void loadTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Load bundled caption fonts through the media protocol so the editor
    // preview matches the rendered output exactly (ADR-009).
    void (async () => {
      try {
        // Use the shared font manifest for both the caption picker and the
        // browser preview; this prevents the editor silently loading a face
        // that differs from the one selected for export.
        for (const { family, file, weight } of CAPTION_FONTS) {
          const { path } = await api['system.fontUrl']({ file })
          const face = new FontFace(family, `url(${mediaUrl(path)})`, { weight: String(weight) })
          await face.load()
          document.fonts.add(face)
        }
      } catch {
        /* preview falls back to system fonts */
      }
    })()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeEvents((event) => {
      useDataStore.getState().handleEvent(event)
    })
    return unsubscribe
  }, [])

  // Notify when a project finishes processing (import/transcribe/analyze)
  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prev) => {
      const project = state.projectUpdated
      if (project && project !== prev.projectUpdated) {
        if (project.status === 'ready' && prev.projectUpdated?.status === 'importing') {
          toast({ level: 'success', message: `Media imported: ${project.sourceFilename ?? project.name}` })
        }
      }
    })
    return unsub
  }, [toast])

  const interrupted = interruptedCount

  return (
    <div
      className="app-shell"
      data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}
      style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
    >
      <aside className="sidebar" id="app-sidebar" aria-label="Sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src="./clipwright-studio-logo.png" alt="" aria-hidden="true" />
          </div>
          <div className="brand-text">
            <div className="brand-name">Clipwright</div>
            <div className="brand-sub">Studio</div>
          </div>
          <button
            className="btn ghost sm icon sidebar-toggle"
            onClick={() => updateLayout({ sidebarCollapsed: !sidebarCollapsed })}
            aria-expanded={!sidebarCollapsed}
            aria-controls="app-sidebar"
            aria-label={sidebarCollapsed ? 'Show the sidebar' : 'Hide the sidebar'}
            title={sidebarCollapsed ? 'Show the sidebar' : 'Hide the sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <div className="nav-group-label">Workspace</div>
        <button
          className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => navigate('dashboard')}
          aria-current={view === 'dashboard' ? 'page' : undefined}
          title={sidebarCollapsed ? 'Projects' : undefined}
          data-tour="projects"
        >
          <FolderOpen size={16} /> <span className="nav-label">Projects</span>
        </button>
        <button
          className={`nav-item ${view === 'queue' ? 'active' : ''}`}
          onClick={() => navigate('queue')}
          aria-current={view === 'queue' ? 'page' : undefined}
          data-tour="queue"
          title={
            interrupted > 0
              ? `Renders and other jobs. ${interrupted} interrupted job${interrupted === 1 ? '' : 's'} can be resumed or discarded here.`
              : 'Renders and other background jobs'
          }
        >
          <ListVideo size={16} /> <span className="nav-label">Render queue</span>
          {activeRenders > 0 && <span className="nav-badge active-count">{activeRenders}</span>}
          {/* The interrupted count used to be its own nav row, which duplicated
              this destination. It is an alert about this screen, so it badges
              this screen instead. */}
          {interrupted > 0 && (
            <span className="nav-badge warn-count" aria-label={`${interrupted} interrupted job${interrupted === 1 ? '' : 's'}`}>
              <TriangleAlert size={12} aria-hidden="true" />
              {interrupted}
            </span>
          )}
        </button>

        {/* Settings and the build footer are one bottom block: a single owner
            of the free space, so Settings always sits directly above the
            version/workspace/preview lines instead of floating mid-gap. */}
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => openPalette('shortcuts')}
            title="Searchable keyboard shortcut reference"
            data-tour="shortcuts"
          >
            <Keyboard size={16} /> <span className="nav-label">Shortcuts</span>
            <kbd className="nav-kbd">{formatShortcut({ key: '/', mod: true })}</kbd>
          </button>
          <button
            className={`nav-item ${view === 'help' ? 'active' : ''}`}
            onClick={() => navigate('help')}
            aria-current={view === 'help' ? 'page' : undefined}
            title="Getting started, shortcuts, setup check and troubleshooting"
            data-tour="help"
          >
            <CircleHelp size={16} /> <span className="nav-label">Help</span>
          </button>
          <button
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
            aria-current={view === 'settings' ? 'page' : undefined}
            title={sidebarCollapsed ? 'Settings' : undefined}
            data-tour="settings"
          >
            <SettingsIcon size={16} /> <span className="nav-label">Settings</span>
          </button>

          <div className="sidebar-footer">
            {isPreview && <div style={{ color: 'var(--warn)', marginBottom: 'var(--space-2)' }}>Browser preview · full app runs on the desktop</div>}
            <div>v{useAppStore.getState().appInfo?.version ?? '…'}</div>
            <div>{useAppStore.getState().appInfo?.workspaceRoot}</div>
            <div className="developer-credit">Developed by yetiwrld</div>
          </div>
        </div>
        {!sidebarCollapsed && (
          <ResizeHandle
            orientation="vertical"
            label="Resize sidebar"
            value={sidebarWidth}
            min={SIDEBAR_LIMIT.min}
            max={SIDEBAR_LIMIT.max}
            defaultValue={198}
            onChange={setSidebarWidth}
            onCommit={(width) => updateLayout({ sidebarWidth: width })}
            className="sidebar-resizer"
          />
        )}
      </aside>

      <main className="main-area">
        {view === 'dashboard' && <DashboardPage />}
        {view === 'project' && <ProjectPage />}
        {view === 'editor' && <EditorPage />}
        {view === 'queue' && <QueuePage />}
        {view === 'settings' && <SettingsPage />}
        {view === 'help' && <HelpPage />}
      </main>

      <CommandPalette />
      <TourOverlay />

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.level}`} role="status">
            <ToastIcon level={t.level} />
            <div className="toast-msg">
              {t.message}
              {t.hint && <div className="toast-hint">{t.hint}</div>}
            </div>
            {t.action && (
              <button
                className="btn sm"
                onClick={() => {
                  t.action?.()
                  dismissToast(t.id)
                }}
              >
                {t.actionLabel}
              </button>
            )}
            <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification" title="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <UpdatePrompt enabled={Boolean(bootstrapped && settings?.general.firstRunCompleted)} />
      {bootstrapped && settings && !settings.general.firstRunCompleted && <FirstRunModal />}
    </div>
  )
}
