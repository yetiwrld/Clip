import React, { useEffect, useState } from 'react'
import type { AppUpdateStatus } from '@shared/ipc'
import { errMessage, isElectron } from '../../api/client'
import { Modal, ProgressBar } from '../../components/ui'
import { useAppStore } from '../../stores/app'

export function UpdatePrompt({ enabled }: { enabled: boolean }) {
  const toast = useAppStore((state) => state.toast)
  const [status, setStatus] = useState<AppUpdateStatus>({ state: 'idle' })
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const bridge = window.clipwright
    if (!enabled || !isElectron || !bridge) return

    const acceptStatus = (next: AppUpdateStatus) => {
      setStatus(next)
      if (next.state === 'available' || next.state === 'downloaded' || next.state === 'error') {
        setHidden(false)
      }
    }
    const unsubscribe = bridge.onUpdateStatus(acceptStatus)
    // Let the main window finish its initial render before checking. This is a
    // no-op in development and in the browser preview.
    const timer = window.setTimeout(() => {
      void bridge.checkForUpdates().then((next) => {
        if (next.state !== 'error') acceptStatus(next)
      }).catch(() => undefined)
    }, 4000)

    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [enabled])

  async function downloadUpdate() {
    const bridge = window.clipwright
    if (!bridge) return
    setBusy(true)
    try {
      await bridge.downloadUpdate()
    } catch (error) {
      setStatus({ state: 'error', message: errMessage(error).message })
    } finally {
      setBusy(false)
    }
  }

  async function checkAgain() {
    const bridge = window.clipwright
    if (!bridge) return
    setBusy(true)
    try {
      const next = await bridge.checkForUpdates()
      setStatus(next)
      setHidden(next.state === 'idle' || next.state === 'checking')
      if (next.state === 'idle') toast({ level: 'success', message: 'Clipwright Studio is up to date.' })
    } catch (error) {
      toast({ level: 'warn', message: `Could not check for updates: ${errMessage(error).message}` })
      setHidden(true)
    } finally {
      setBusy(false)
    }
  }

  if (!isElectron || hidden || status.state === 'idle' || status.state === 'checking') return null

  const close = () => setHidden(true)
  const version = 'version' in status ? status.version : ''
  const title = status.state === 'available'
    ? 'Update available'
    : status.state === 'downloading'
      ? 'Downloading update'
      : status.state === 'downloaded'
        ? 'Ready to install'
        : 'Update could not be downloaded'

  return (
    <Modal
      title={title}
      onClose={close}
      footer={(
        <>
          {status.state === 'available' && (
            <>
              <button className="btn" onClick={close}>Later</button>
              <button className="btn primary" onClick={() => void downloadUpdate()} disabled={busy}>
                {busy ? 'Starting download…' : 'Download update'}
              </button>
            </>
          )}
          {status.state === 'downloading' && (
            <button className="btn" onClick={close}>Continue in background</button>
          )}
          {status.state === 'downloaded' && (
            <>
              <button className="btn" onClick={close}>Later</button>
              <button className="btn primary" onClick={() => void window.clipwright?.installUpdate()}>
                Restart and install
              </button>
            </>
          )}
          {status.state === 'error' && (
            <>
              <button className="btn" onClick={close}>Close</button>
              <button className="btn primary" onClick={() => void checkAgain()} disabled={busy}>
                {busy ? 'Checking…' : 'Check again'}
              </button>
            </>
          )}
        </>
      )}
    >
      {status.state === 'available' && (
        <div className="update-prompt-copy">
          <p>Clipwright Studio <strong>v{version}</strong> is available.</p>
          <p>Download it now? Clipwright Studio asks before restarting to install.</p>
        </div>
      )}
      {status.state === 'downloading' && (
        <div className="update-prompt-copy">
          <p>Downloading Clipwright Studio <strong>v{version}</strong>. You can keep working while it downloads.</p>
          <ProgressBar value={status.percent / 100} />
          <div className="update-progress-label">{status.percent}% downloaded</div>
        </div>
      )}
      {status.state === 'downloaded' && (
        <div className="update-prompt-copy">
          <p>Clipwright Studio <strong>v{version}</strong> is downloaded and ready.</p>
          <p>Restart now to finish installing, or choose Later and keep working.</p>
        </div>
      )}
      {status.state === 'error' && (
        <div className="update-prompt-copy" role="alert">
          <p>{status.message}</p>
          <p>Keep working as usual. You can check for the update again later.</p>
        </div>
      )}
    </Modal>
  )
}
