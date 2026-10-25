import React, { useState } from 'react'
import { Scissors, Pencil, Play, Package, Trash2, Copy, FolderOpen, Film, MoreHorizontal } from 'lucide-react'
import { api, errMessage, mediaUrl, copyText } from '../../api/client'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { ErrorBox, Modal, ProgressBar, Spinner } from '../../components/ui'
import { clipStatusLabel, plural } from '../../copy/labels'
import type { ClipDeletionSnapshot } from '@shared/types'
import { getCaptionStyle } from '@shared/constants'
import { formatClock } from '@shared/utils/time'

export function ClipsTab() {
  const app = useAppStore()
  const data = useDataStore()
  const project = data.activeProject!
  const [busyClipId, setBusyClipId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function render(clipId: string) {
    setBusyClipId(clipId)
    setError(null)
    try {
      await api['renders.queue']({ clipId })
      await data.loadRenders(project.id)
      app.toast({
        level: 'info',
        message: 'Render queued.',
        hint: 'Progress appears in the Render queue. Export the finished file from this tab.',
        actionLabel: 'Open queue',
        action: () => app.navigate('queue')
      })
    } catch (err) {
      setError(err)
    } finally {
      setBusyClipId(null)
    }
  }

  async function remove(clipId: string) {
    try {
      // The backend hands back everything the delete removed, so the Undo
      // action in the toast can put the clip back exactly as it was.
      const snapshot = await api['clips.delete']({ id: clipId })
      await data.loadClips(project.id)
      await data.loadRenders(project.id)
      if (!snapshot) return
      app.toast({
        level: 'success',
        message: `Deleted “${snapshot.clip.title || 'Untitled clip'}”.`,
        hint: 'Its edits and render records were removed too. Renders already on disk were kept.',
        actionLabel: 'Undo',
        action: () => void undoRemove(snapshot),
        timeoutMs: 12000
      })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function undoRemove(snapshot: ClipDeletionSnapshot) {
    try {
      await api['clips.restore']({ snapshot })
      await data.loadClips(project.id)
      await data.loadRenders(project.id)
      app.toast({ level: 'success', message: 'Clip restored with its edits and render records.' })
    } catch (err) {
      const { message, hint } = errMessage(err)
      app.toast({
        level: 'error',
        message,
        hint: hint ?? 'The clip could not be put back. Nothing else was changed.'
      })
    }
  }

  async function exportClips(clipIds: string[]) {
    if (exporting) return
    setExporting(true)
    try {
      const result = await api['exports.run']({ clipIds, includeMetadata: true })
      app.toast({
        level: 'success',
        message: `Exported ${plural(clipIds.length, 'clip')} to the exports folder.`,
        hint: 'A .txt and .json metadata file sits next to each video.',
        actionLabel: 'Show in folder',
        action: () => void api['system.revealPath']({ path: result.dir }).catch(() => undefined)
      })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    } finally {
      setExporting(false)
    }
  }

  if (data.clips.length === 0) {
    return (
      <div className="empty">
        <Scissors size={28} className="empty-icon" />
        <div className="empty-title">No clips yet</div>
        <div className="empty-copy">
          Create a clip from a moment in the Moments tab, then trim, caption and render it here.
        </div>
      </div>
    )
  }

  const renderable = data.clips.filter((c) => {
    const latest = data.renders.find((r) => r.clipId === c.id && r.isCurrent)
    return latest != null
  })

  return (
    <div className="stack">
      {error ? <ErrorBox error={error} /> : null}
      {renderable.length > 0 && (
        <div className="row export-bar">
          <span className="tiny">{plural(renderable.length, 'rendered clip')} ready to export</span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => void exportClips(renderable.map((c) => c.id))} disabled={exporting}>
            {exporting ? <Spinner size={12} /> : <Package size={12} />} {exporting ? 'Exporting…' : 'Export all rendered clips'}
          </button>
        </div>
      )}
      <div className="clip-list">
        {data.clips.map((clip) => (
          <ClipRow
            key={clip.id}
            clip={clip}
            busy={busyClipId === clip.id}
            exporting={exporting}
            renders={data.renders.filter((r) => r.clipId === clip.id)}
            onRender={() => void render(clip.id)}
            onEdit={() => app.openEditor(clip.id, clip.projectId)}
            onDelete={() => void remove(clip.id)}
            onExport={() => void exportClips([clip.id])}
          />
        ))}
      </div>
    </div>
  )
}

function ClipRow({
  clip,
  busy,
  exporting,
  renders,
  onRender,
  onEdit,
  onDelete,
  onExport
}: {
  clip: import('@shared/types').Clip
  busy: boolean
  exporting: boolean
  renders: import('@shared/types').RenderJob[]
  onRender: () => void
  onEdit: () => void
  onDelete: () => void
  onExport: () => void
}) {
  const app = useAppStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const activeRender = renders.find((r) => r.status === 'rendering' || r.status === 'preparing' || r.status === 'queued')
  const doneRender = renders.find((r) => r.isCurrent)
  const failedRender = renders.find((r) => r.status === 'failed')
  const style = getCaptionStyle(clip.captionStyleId)

  async function copyDescription() {
    const text = [clip.title, '', clip.description, clip.cta ? `\n${clip.cta}` : '', '', clip.hashtags.join(' ')].join('\n').trim()
    const ok = await copyText(text)
    app.toast(ok
      ? { level: 'success', message: 'Copied the title, description and hashtags.' }
      : { level: 'warn', message: 'Could not copy to the clipboard.', hint: 'Your browser may block clipboard access. Select the text and copy it by hand.' })
  }

  return (
    <div className="clip-row">
      <div className="clip-thumb">
        {doneRender?.outputPath ? (
          <video src={mediaUrl(doneRender.outputPath)} muted preload="metadata" />
        ) : (
          <Film size={16} />
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="clip-title">{clip.title || <span className="muted">Untitled clip</span>}</div>
        <div className="row wrap mono" style={{ marginTop: 'var(--space-2)', gap: 'var(--space-3)', fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
          <span>{formatClock(clip.startTime)} → {formatClock(clip.endTime)}</span>
          <span>{`${Math.round(clip.endTime - clip.startTime)}s`}</span>
          <span title={`Caption style: ${style.label}`}>{style.label}</span>
          <span className={`status ${clip.status === 'rendered' ? 'success' : ''}`}>
            <span className="dot" /> {clipStatusLabel(clip.status)}
          </span>
        </div>
        <div className="clip-desc">
          {clip.description
            ? clip.description.slice(0, 130) + (clip.description.length > 130 ? '…' : '')
            : <span style={{ color: 'var(--text-3)' }}>No description yet — generate or write one in the editor.</span>}
        </div>
        {activeRender && (
          <div style={{ marginTop: 'var(--space-3)', maxWidth: 320 }}>
            <ProgressBar value={activeRender.progress} />
            <div className="tiny" style={{ marginTop: 'var(--space-2)' }}>Rendering · {Math.round(activeRender.progress * 100)}% complete</div>
          </div>
        )}
        {failedRender && !activeRender && !doneRender && failedRender.error && (
          <div style={{ marginTop: 'var(--space-3)', maxWidth: 520 }}>
            <ErrorBox
              error={{ message: failedRender.error.message, hint: failedRender.error.hint, code: failedRender.error.code, details: failedRender.error.details }}
              onRetry={() => void api['renders.retry']({ id: failedRender.id })}
              retryLabel="Retry render"
            />
          </div>
        )}
      </div>

      <div className="clip-actions">
        <button className="btn sm" onClick={onEdit} title="Edit this clip">
          <Pencil size={12} /> Edit
        </button>
        <button className="btn primary sm" onClick={onRender} disabled={busy || Boolean(activeRender)} title="Render this clip">
          {busy || activeRender ? <Spinner size={12} /> : <Play size={12} />} Render
        </button>
        {doneRender && (
          <button className="btn sm" onClick={onExport} disabled={exporting} title="Export this rendered file">
            <Package size={12} /> Export
          </button>
        )}
        <div
          className="menu-wrap"
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setMenuOpen(false) } }}
        >
          <button
            className="btn ghost sm icon"
            aria-label="More clip actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="More actions"
            onClick={(event) => { event.stopPropagation(); setMenuOpen(!menuOpen) }}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="menu-scrim" onClick={(event) => { event.stopPropagation(); setMenuOpen(false) }} />
              <div className="menu" role="menu" onClick={(event) => event.stopPropagation()}>
                {doneRender?.outputPath && (
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void api['system.revealPath']({ path: doneRender.outputPath! }).catch((e) => app.toast({ level: 'warn', ...errMessage(e) })) }}>
                    <FolderOpen size={14} /> Show in folder
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void copyDescription() }}>
                  <Copy size={14} /> Copy title, description and hashtags
                </button>
                <div className="menu-sep" />
                <button type="button" role="menuitem" className="danger" onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}>
                  <Trash2 size={14} /> Delete clip…
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirmDelete && (
        <Modal
          title="Delete clip?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn danger" onClick={() => { setConfirmDelete(false); onDelete() }}>
                <Trash2 size={14} /> Delete clip
              </button>
            </>
          }
        >
          <div className="text-body">
            “{clip.title || 'Untitled clip'}” and its edits and captions will be removed. Renders you already made stay in the
            workspace. You can undo this from the message that appears.
          </div>
        </Modal>
      )}
    </div>
  )
}
