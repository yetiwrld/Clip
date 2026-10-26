import React, { useState } from 'react'
import { ArrowRight, BookOpen, Compass, Download, FolderOpen, Keyboard, PlayCircle, RefreshCw, ScrollText, Stethoscope } from 'lucide-react'

import { api, errMessage, isPreview } from '../../api/client'
import { useAppStore } from '../../stores/app'

/**
 * The central help screen.
 *
 * Everything here is backed by something that exists: the dependency list comes
 * from the same probe Settings uses, the shortcut button opens the real command
 * palette in shortcuts mode, and the troubleshooting buttons call the real log
 * and diagnostics methods. There are no placeholder links.
 */
export function HelpPage() {
  const navigate = useAppStore((state) => state.navigate)
  const startTour = useAppStore((state) => state.startTour)
  const openPalette = useAppStore((state) => state.openPalette)
  const openSettings = useAppStore((state) => state.setSettingsSection)
  const refreshDependencies = useAppStore((state) => state.refreshDependencies)
  const toast = useAppStore((state) => state.toast)
  const dependencies = useAppStore((state) => state.dependencies)
  const appInfo = useAppStore((state) => state.appInfo)
  const [checking, setChecking] = useState(false)
  const missing = dependencies.filter((dependency) => !dependency.available)
  const version = appInfo?.version ?? '—'
  const workspace = appInfo?.workspaceRoot ?? '—'

  async function checkAgain(): Promise<void> {
    setChecking(true)
    try {
      await refreshDependencies()
    } finally {
      setChecking(false)
    }
  }

  async function revealWorkspace(): Promise<void> {
    try {
      await api['system.revealPath']({ path: workspace })
    } catch (err) {
      toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function openLogs(): Promise<void> {
    try {
      await api['system.openLogsFolder']()
    } catch (err) {
      toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function exportDiagnostics(): Promise<void> {
    try {
      const result = api['system.exportDiagnostics']()
      toast({
        level: 'success',
        message: 'Diagnostics report saved.',
        actionLabel: isPreview ? undefined : 'Show in folder',
        action: isPreview ? undefined : () => void api['system.revealPath']({ path: result.path })
      })
    } catch (err) {
      toast({ level: 'error', ...errMessage(err) })
    }
  }

  return (
    <div className="page" data-density="compact">
      <div className="page-header">
        <div className="page-heading">
          <div className="page-title">Help</div>
          <div className="page-subtitle">
            Getting started, setup, shortcuts and troubleshooting. Everything here is optional — the app works without any of it.
          </div>
        </div>
      </div>

      <div className="stack">
        <section className="panel">
          <div className="section-title">
            <Compass size={14} /> Start here
          </div>
          <ol className="help-steps">
            <li>
              <strong>Import one long video.</strong> A file, or a link you have the right to use. It becomes the project’s source.
            </li>
            <li>
              <strong>Read the transcript, pick a moment.</strong> Transcription can run on this computer. Analysis is local by default and
              an AI key is optional.
            </li>
            <li>
              <strong>Edit the clip, then render.</strong> Crop, captions, silence cuts and text layers, then export a finished file.
            </li>
          </ol>
          <div className="row wrap help-actions">
            <button className="btn primary" onClick={() => navigate('dashboard')}>
              Go to Projects <ArrowRight size={14} />
            </button>
            <button className="btn" onClick={startTour}>
              <PlayCircle size={14} /> Take the guided tour
            </button>
            <button className="btn ghost" onClick={() => openPalette('shortcuts')}>
              <Keyboard size={14} /> Keyboard shortcuts
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="section-title">
            <Stethoscope size={14} /> Setup check
          </div>
          <p className="tiny help-lead">
            These are the tools the app looks for on this computer. Nothing here needs an account; cloud providers are separate and
            optional.
          </p>
          {dependencies.length === 0 ? (
            <div className="tiny">No probe has run yet.</div>
          ) : (
            <div>
              {dependencies.map((dependency) => (
                <div className="dep-row" key={dependency.id}>
                  <span className={`status ${dependency.available ? 'success' : 'danger'}`}>
                    <span className="dot" />
                  </span>
                  <span className="dep-name">
                    {dependency.label}
                    {dependency.version ? <span className="tiny mono"> v{dependency.version}</span> : null}
                  </span>
                  <span className="dep-msg">{dependency.message}</span>
                  {!dependency.available && dependency.fixHint ? <span className="chip warn">{dependency.fixHint}</span> : null}
                </div>
              ))}
            </div>
          )}
          <div className="row wrap help-actions">
            <button className="btn" onClick={() => void checkAgain()} disabled={checking}>
              <RefreshCw size={14} /> {checking ? 'Checking…' : 'Check again'}
            </button>
            <button className="btn ghost" onClick={() => openSettings('advanced')}>
              FFmpeg path in Settings → Advanced
            </button>
          </div>
          {missing.length > 0 && (
            <p className="tiny help-note">
              Missing tools only disable the features that need them. Importing, trimming and captioning keep working.
            </p>
          )}
        </section>

        <section className="panel">
          <div className="section-title">
            <BookOpen size={14} /> Common questions
          </div>
          <details className="help-faq">
            <summary>Does my video leave this computer?</summary>
            <p>
              No, not unless you choose it. Importing, transcription with the local engine, analysis with the local heuristic and rendering
              all run here. Cloud transcription and cloud AI run only after you add a key and pick that provider.
            </p>
          </details>
          <details className="help-faq">
            <summary>Do I need an AI subscription?</summary>
            <p>
              No. Moment finding works offline with the built-in heuristic. An OpenAI-compatible or Anthropic key adds better suggestions;
              it is never required to make a clip.
            </p>
          </details>
          <details className="help-faq">
            <summary>Where are my files kept?</summary>
            <p>
              In the workspace folder shown below. Each project has its own folder with the source, transcript and renders. Exported files
              stay in the exports folder even if you delete the project.
            </p>
          </details>
          <details className="help-faq">
            <summary>Why does rendering need FFmpeg?</summary>
            <p>
              The app drives FFmpeg for every encode, thumbnail and audio operation. If it is not found you can point Settings → Advanced at
              your own copy, then run the setup check again.
            </p>
          </details>
        </section>

        <section className="panel">
          <div className="section-title">
            <ScrollText size={14} /> Troubleshooting
          </div>
          <p className="tiny help-lead">
            If something fails, the log has the reason. Exporting diagnostics writes a file you can read or send on — it contains versions and
            the recent log, not your media.
          </p>
          <div className="row wrap help-actions">
            <button className="btn" onClick={() => void openLogs()} disabled={isPreview}>
              <FolderOpen size={14} /> Open logs folder
            </button>
            <button className="btn" onClick={() => void exportDiagnostics()}>
              <Download size={14} /> Export diagnostics
            </button>
            <button className="btn ghost" onClick={() => void revealWorkspace()}>
              Show workspace folder
            </button>
          </div>
          {isPreview && <p className="tiny help-note">The browser preview cannot open folders on this computer. The desktop app can.</p>}
        </section>

        <section className="panel">
          <div className="section-title">About</div>
          <div className="help-about">
            <div>
              <span className="tiny">Version</span>
              <div className="mono">{version}</div>
            </div>
            <div>
              <span className="tiny">Platform</span>
              <div className="mono">{appInfo?.platform ?? '—'}</div>
            </div>
            <div className="help-about-wide">
              <span className="tiny">Workspace</span>
              <div className="mono">{workspace}</div>
            </div>
          </div>
          <p className="tiny help-note">
            Full install and troubleshooting steps for developers are in README.md next to the application source.
          </p>
        </section>
      </div>
    </div>
  )
}
