import React, { useState } from 'react'
import { Scissors, Pencil, Play, Package, Trash2, Copy, FolderOpen, Film, MoreHorizontal } from 'lucide-react'
import { api, errMessage, mediaUrl, copyText } from '../../api/client'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { ErrorBox, Modal, ProgressBar, Spinner } from '../../components/ui'
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
      app.toast({ level: 'info', message: 'Render queued — watch progress in the Render queue.' })
    } catch (err) {
      setError(err)
    } finally {
      setBusyClipId(null)
    }
  }

  async function remove(clipId: string) {
    try {
      await api['clips.delete']({ id: clipId })
      await data.loadClips(project.id)
      await data.loadRenders(project.id)
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function exportClips(clipIds: string[]) {
    if (exporting) return
    setExporting(true)
    try {
      const result = await api['exports.run']({ clipIds, includeMetadata: true })
      app.toast({
        level: 'success',
        message: `Exported ${clipIds.length} clip${clipIds.length === 1 ? '' : 's'} with metadata.`,
        actionLabel: 'Reveal folder',
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
      <div className="empty" style={{ padding: 'calc(var(--space-11) + var(--space-3)) var(--space-6)' }}>
        <Scissors size={28} className="empty-icon" />
        <div style={{ fontWeight: 600, fontSize: 'var(--fs-base)' }}>No clips yet</div>
        <div className="muted" style={{ maxWidth: 400, fontSize: 'var(--fs-base)', lineHeight: 1.55 }}>
          Create a clip from a discovered moment in the Moments tab, then trim, caption and render it here.
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
        <div className="row" style={{ padding: '0 var(--space-3) var(--space-3)' }}>
          <span className="tiny">{renderable.length} rendered clip{renderable.length === 1 ? '' : 's'} ready to export</span>
          <span style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => void exportClips(renderable.map((c) => c.id))} disabled={exporting}>
            {exporting ? <Spinner size={12} /> : <Package size={12} />} {exporting ? 'Exporting…' : 'Export all rendered'}
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
    app.toast(ok ? { level: 'success', message: 'Description + hashtags copied.' } : { level: 'warn', message: 'Copy failed.' })
  }

  return (
    <div className="clip-row">
      <div className="clip-thumb">
        {doneRender?.outputPath ? (
          <video src={mediaUrl(doneRender.outputPath)} muted preload="metadata" />
        ) : (
          <Film size={16} strokeWidth={1.5} />
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="clip-title">{clip.title || <span className="muted">Untitled clip</span>}</div>
        <div className="row wrap mono" style={{ marginTop: 'var(--space-2)', gap: 'var(--space-3)', fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
          <span>{formatClock(clip.startTime)} → {formatClock(clip.endTime)}</span>
          <span>{`${Math.round(clip.endTime - clip.startTime)}s`}</span>
          <span title={`Caption style: ${style.label}`}>{style.label}</span>
          <span className={`status ${clip.status === 'rendered' ? 'success' : ''}`}>
            <span className="dot" /> {clip.status}
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
            <div className="tiny" style={{ marginTop: 'var(--space-2)' }}>Rendering · {Math.round(activeRender.progress * 100)}%</div>
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
        <button className="btn sm" onClick={onEdit} title="Open this clip in the editor">
          <Pencil size={12} /> Edit
        </button>
        <button className="btn primary sm" onClick={onRender} disabled={busy || Boolean(activeRender)} title="Queue a render for this clip">
          {busy || activeRender ? <Spinner size={12} /> : <Play size={12} />} Render
        </button>
        {doneRender && (
          <button className="btn sm" onClick={onExport} disabled={exporting} title="Export the finished file">
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
              <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={(event) => { event.stopPropagation(); setMenuOpen(false) }} />
              <div className="menu" role="menu" onClick={(event) => event.stopPropagation()}>
                {doneRender?.outputPath && (
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void api['system.revealPath']({ path: doneRender.outputPath! }).catch((e) => app.toast({ level: 'warn', ...errMessage(e) })) }}>
                    <FolderOpen size={14} /> Open folder
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void copyDescription() }}>
                  <Copy size={14} /> Copy title, description
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
          <div style={{ fontSize: 'var(--fs-base)', lineHeight: 1.6 }}>
            “{clip.title || 'Untitled clip'}” and its edits, captions and renders will be removed. This cannot be undone.
          </div>
        </Modal>
      )}
    </div>
  )
}
