import React, { useState } from 'react'
import { ArrowLeft, ArrowRight, Cpu, HardDrive, KeyRound, Video } from 'lucide-react'
import { useAppStore } from '../../stores/app'

/** Lightweight first-run guide for users opening the desktop app for the first time. */
export function FirstRunModal() {
  const app = useAppStore()
  const [page, setPage] = useState<'welcome' | 'environment'>('welcome')

  async function finish() {
    await app.saveSettings({ general: { firstRunCompleted: true } })
  }

  const deps = app.dependencies
  const missing = deps.filter((dependency) =>
    !dependency.available && (dependency.id === 'ffmpeg' || dependency.id === 'ffprobe')
  )

  return (
    <div className="modal-backdrop">
      <div className="modal wide" data-density="spacious" role="dialog" aria-modal="true" aria-label="Welcome to Clipwright Studio">
        {page === 'welcome' ? (
          <>
            <div className="modal-head welcome-head">
              <img className="welcome-logo" src="./clipwright-studio-logo.png" alt="Clipwright Studio logo" />
              <div>
                <div className="welcome-eyebrow">WELCOME TO CLIPWRIGHT STUDIO</div>
                <div className="welcome-title">Long video in. Shareable clips out.</div>
                <div className="welcome-subtitle">Make polished short videos in three steps.</div>
              </div>
            </div>
            <div className="modal-body welcome-body">
              <div className="welcome-steps">
                <section className="welcome-step">
                  <span className="welcome-step-number">01</span>
                  <strong>Import a video</strong>
                  <p>Start with a podcast, interview, lecture or other long recording.</p>
                </section>
                <section className="welcome-step">
                  <span className="welcome-step-number">02</span>
                  <strong>Find the moments</strong>
                  <p>Review the transcript and the moments found for you. An AI provider is optional.</p>
                </section>
                <section className="welcome-step">
                  <span className="welcome-step-number">03</span>
                  <strong>Edit and render</strong>
                  <p>Trim, crop, style captions, then render and export clips that are ready to share.</p>
                </section>
              </div>
              <div className="welcome-privacy">
                <HardDrive size={14} />
                <span>Your videos stay on this computer by default. Cloud features are used only when you choose them.</span>
              </div>
            </div>
            <div className="modal-foot welcome-foot">
              <button className="btn ghost" onClick={() => void finish()}>Skip intro</button>
              <span className="header-spacer" />
              <button className="btn ghost" onClick={() => setPage('environment')}>Check setup</button>
              <button className="btn primary" onClick={() => void finish()}>
                Start creating <ArrowRight size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-head">
              <div className="modal-title">Before you start</div>
            </div>
            <div className="modal-body">
              {deps.length > 0 ? deps.map((dependency) => (
                <div className="dep-row" key={dependency.id}>
                  <span className={`status ${dependency.available ? 'success' : 'danger'}`}><span className="dot" /></span>
                  <span className="dep-name">{dependency.label}</span>
                  <span className="dep-msg">{dependency.message}</span>
                </div>
              )) : (
                <div className="row"><Cpu size={16} /><span className="tiny">Checking the app setup…</span></div>
              )}
              {missing.length > 0 && (
                <div className="error-box">
                  <div className="error-title">FFmpeg is missing</div>
                  <div className="error-hint">Rendering and media analysis need FFmpeg. Install it, or set a custom path in Settings → Advanced, then check the setup again.</div>
                </div>
              )}
              <div className="welcome-privacy">
                <Video size={14} />
                <span>Importing, editing, captions and rendering all run on this computer. Analysis can run offline too.</span>
              </div>
              <div className="tiny">Workspace: <span className="mono">{app.appInfo?.workspaceRoot}</span></div>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setPage('welcome')}>
                <ArrowLeft size={14} /> Back
              </button>
              <span className="header-spacer" />
              <button className="btn primary" onClick={() => void finish()}>
                <KeyRound size={14} /> Start creating
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
