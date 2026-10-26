import React from 'react'
import { RotateCcw, X, FolderOpen, ListVideo, Download } from 'lucide-react'
import { api, errMessage, isPreview, mediaUrl } from '../../api/client'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { EmptyState, ErrorBox } from '../../components/ui'
import { JobActivity } from '../motion/JobActivity'
import { renderStageLabel, renderStatusLabel } from '../../copy/labels'
import type { RenderJob } from '@shared/types'

export function RendersTab() {
  return <RenderList scopedToProject />
}

/**
 * Render jobs grouped by state — Rendering / Queued / Completed / Failed —
 * so the queue reads like a production task monitor, not a card feed.
 */
export function RenderList({ scopedToProject }: { scopedToProject?: boolean }) {
  const app = useAppStore()
  const data = useDataStore()
  const projectId = scopedToProject ? app.projectId : undefined
  const renders = projectId ? data.renders.filter((r) => r.projectId === projectId) : data.renders
  const clipsById = new Map(data.clips.map((c) => [c.id, c]))
  const projectsById = new Map(data.projects.map((p) => [p.id, p.name]))

  async function cancel(id: string) {
    try {
      await api['renders.cancel']({ id })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function retry(id: string) {
    try {
      await api['renders.retry']({ id })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  if (renders.length === 0) {
    return (
      <div className="empty">
        <ListVideo size={28} className="empty-icon" />
        <div className="empty-title">No renders yet</div>
        <div className="empty-copy">
          Render a clip to produce a vertical MP4 with burned-in captions. Renders run locally with FFmpeg, so you can queue
          several and keep working.
        </div>
      </div>
    )
  }

  const order = (a: RenderJob, b: RenderJob) => b.createdAt.localeCompare(a.createdAt)
  const rendering = renders.filter((r) => r.status === 'rendering' || r.status === 'preparing').sort(order)
  const queued = renders.filter((r) => r.status === 'queued').sort(order)
  const completed = renders.filter((r) => r.status === 'completed').sort(order)
  const failed = renders.filter((r) => r.status === 'failed' || r.status === 'cancelled').sort(order)

  return (
    <div>
      {rendering.length > 0 && (
        <div className="queue-group">
          <div className="queue-group-title">Rendering</div>
          {rendering.map((r) => (
            <RenderRow key={r.id} render={r} clipTitle={clipsById.get(r.clipId)?.title} projectName={projectId ? undefined : projectsById.get(r.projectId)} activity={data.activity[r.id]} onCancel={() => void cancel(r.id)} />
          ))}
        </div>
      )}

      {queued.length > 0 && (
        <div className="queue-group">
          <div className="queue-group-title">Queued</div>
          {queued.map((r) => (
            <RenderRow key={r.id} render={r} clipTitle={clipsById.get(r.clipId)?.title} projectName={projectId ? undefined : projectsById.get(r.projectId)} activity={data.activity[r.id]} onCancel={() => void cancel(r.id)} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="queue-group">
          <div className="queue-group-title">Completed · {completed.length}</div>
          {completed.map((r) => (
            <RenderRow key={r.id} render={r} clipTitle={clipsById.get(r.clipId)?.title} projectName={projectId ? undefined : projectsById.get(r.projectId)} activity={data.activity[r.id]} onRetry={() => void retry(r.id)} />
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <div className="queue-group">
          <div className="queue-group-title" style={{ color: 'var(--danger)' }}>Failed · {failed.length}</div>
          {failed.map((r) => (
            <RenderRow key={r.id} render={r} clipTitle={clipsById.get(r.clipId)?.title} projectName={projectId ? undefined : projectsById.get(r.projectId)} activity={data.activity[r.id]} onRetry={() => void retry(r.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Save a copy wherever you like, through the OS save dialog: it starts in
 * Videos, suggests the clip's own name and asks before replacing anything.
 */
async function saveCopy(render: RenderJob, clipTitle: string | undefined, toast: ReturnType<typeof useAppStore.getState>['toast']) {
  if (!render.outputPath) return
  const base = (clipTitle ?? 'clip').replace(/[^\w\- ]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'clip'
  const name = `${base}.mp4`
  if (isPreview) {
    // The browser has no save dialog here: a normal download is the fallback.
    const link = document.createElement('a')
    link.href = mediaUrl(render.outputPath)
    link.download = name
    link.click()
    return
  }
  try {
    const result = await api['system.saveFileAs']({ sourcePath: render.outputPath, suggestedName: name })
    if (result) toast({ level: 'success', message: 'Saved a copy.', hint: result.path })
  } catch (err) {
    toast({ level: 'error', ...errMessage(err) })
  }
}

function RenderRow({
  render,
  clipTitle,
  projectName,
  activity,
  onCancel,
  onRetry
}: {
  render: RenderJob
  clipTitle?: string
  projectName?: string
  activity?: readonly number[]
  onCancel?: () => void
  onRetry?: () => void
}) {
  const app = useAppStore()
  const busy = render.status === 'rendering' || render.status === 'preparing' || render.status === 'queued'
  const isCompleted = render.status === 'completed'

  return (
    <div className="queue-row">
      <div className="q-main">
        <div className="q-title">
          {clipTitle || 'Clip'}
          {render.preview && <span className="tl-badge preview" style={{ marginLeft: 'var(--space-3)' }}>Preview</span>}
        </div>
        {projectName && <div className="tiny" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName}</div>}
      </div>

      <div className="q-meta">
        {busy ? (
          <div className="q-progress">
            <JobActivity
              state={render.status === 'queued' ? 'queued' : 'working'}
              statusLabel={renderStageLabel(render.stage) || (render.status === 'queued' ? 'Queued' : 'Working')}
              progress={render.status === 'queued' ? null : render.progress}
              samples={activity}
              startedAt={render.status === 'queued' ? null : render.startedAt}
            />
          </div>
        ) : render.status === 'failed' && render.error ? (
          <div className="tiny" style={{ color: 'var(--danger)' }}>
            {render.error.message}
            {render.error.hint && <span style={{ color: 'var(--text-3)' }}> — {render.error.hint}</span>}
          </div>
        ) : (
          <span>
            <span className={`status ${isCompleted ? 'success' : render.status === 'cancelled' ? 'warn' : 'danger'}`}>
              <span className="dot" /> {renderStatusLabel(render.status)}
            </span>
            <span className="tiny" style={{ marginLeft: 'var(--space-3)' }}>{new Date(render.createdAt).toLocaleString()}</span>
          </span>
        )}
      </div>

      <div className="q-value">
        {isCompleted && render.outputPath && (
          <video className="render-thumb" src={mediaUrl(render.outputPath)} muted preload="metadata" title="Rendered preview" />
        )}
      </div>

      <div className="q-actions">
        {onCancel && busy && (
          <button className="btn sm" onClick={onCancel}>
            <X size={12} /> Cancel
          </button>
        )}
        {onRetry && !busy && (
          <button className="btn sm" onClick={onRetry}>
            <RotateCcw size={12} /> Retry
          </button>
        )}
        {isCompleted && render.outputPath && (
          <>
            <button
              className="btn ghost sm icon"
              title="Save a copy…"
              aria-label="Save a copy"
              onClick={() => void saveCopy(render, clipTitle, app.toast)}
            >
              <Download size={14} />
            </button>
            <button
              className="btn ghost sm icon"
              title="Show in folder"
              aria-label="Show in folder"
              onClick={() => void api['system.revealPath']({ path: render.outputPath! }).catch((e) => app.toast({ level: 'warn', ...errMessage(e) }))}
            >
              <FolderOpen size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
