import React, { useEffect } from 'react'
import { RotateCcw, History, Trash2, X, ArrowLeft, Clapperboard } from 'lucide-react'
import { api, errMessage } from '../../api/client'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { RenderList } from '../project/RendersTab'
import { renderStageLabel, taskStateLabel, taskTypeLabel } from '../../copy/labels'
import { EmptyState } from '../../components/ui'
import { usePoll } from '../../hooks/usePoll'

/**
 * Global queue view: renders across projects + the task/recovery list.
 * Interrupted work from an unclean shutdown surfaces here with
 * Resume / Discard options (spec §88) — never silent auto-restart.
 */
export function QueuePage() {
  const app = useAppStore()
  const data = useDataStore()
  const canGoBack = useAppStore((state) => state.history.length > 0)

  useEffect(() => {
    void data.loadTasks()
    void data.loadRenders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fast poll only while something is running; an idle queue leans on events.
  const hasLiveWork = data.tasks.some((task) => task.state === 'running' || task.state === 'queued')
  usePoll(() => data.loadTasks(), hasLiveWork ? 4000 : 15000)

  const interrupted = data.tasks.filter((t) => t.state === 'interrupted')
  const running = data.tasks.filter((t) => t.state === 'running' || t.state === 'queued')
  const history = data.tasks.filter((t) => ['completed', 'failed', 'cancelled'].includes(t.state)).slice(0, 25)

  async function resume(id: string) {
    try {
      await api['tasks.resume']({ id })
      await data.loadTasks()
      app.toast({ level: 'success', message: 'Job restarted.', hint: 'It is running again from the beginning.' })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function discard(id: string) {
    try {
      await api['tasks.discard']({ id })
      await data.loadTasks()
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function cancel(id: string) {
    try {
      await api['tasks.cancel']({ id })
      await data.loadTasks()
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  const projectById = new Map(data.projects.map((p) => [p.id, p.name]))

  return (
    <div className="page" data-density="compact">
      <div className="page-header">
        {canGoBack && (
          <button className="btn ghost" onClick={() => app.back()} aria-label="Back" title="Back to the previous screen">
            <ArrowLeft size={14} />
          </button>
        )}
        <div className="page-heading">
          <div className="page-title">Render queue</div>
          <div className="page-subtitle">
            Renders and other jobs run locally with FFmpeg. Set how many run at once in{' '}
            <button
              className="text-link"
              onClick={() => {
                app.setSettingsSection('video')
                app.navigate('settings')
              }}
            >
              Settings → Video &amp; rendering
            </button>
            .
          </div>
        </div>
      </div>

      {interrupted.length === 0 && running.length === 0 && history.length === 0 && (
        <EmptyState
          icon={<Clapperboard size={28} />}
          title="Nothing queued"
          hint="Renders you start from a clip appear here, along with transcription and analysis jobs. You can leave this screen while they run."
          action={
            <button className="btn" onClick={() => app.navigate('dashboard')}>
              Go to Projects
            </button>
          }
        />
      )}

      {interrupted.length > 0 && (
        <div className="queue-group">
          <div className="queue-group-title" style={{ color: 'var(--warn)' }}>
            <History size={12} /> Interrupted jobs · {interrupted.length}
          </div>
          <div className="tiny queue-note">
            These jobs were still running when the app last closed. Nothing was corrupted. Run them again, or discard them to
            clear the list.
          </div>
          {interrupted.map((t) => (
            <div className="queue-row" key={t.id}>
              <div className="q-main">
                <div className="q-title">{projectById.get(t.projectId ?? '') ?? t.projectId?.slice(0, 8) ?? '—'}</div>
                <div className="tiny">{taskTypeLabel(t.type)}</div>
              </div>
              <div className="q-meta tiny">{t.message ?? ''}</div>
              <div />
              <div className="q-actions">
                <button className="btn sm primary" onClick={() => void resume(t.id)}>
                  <RotateCcw size={12} /> Run again
                </button>
                <button className="btn sm" onClick={() => void discard(t.id)}>
                  <Trash2 size={12} /> Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {running.length > 0 && (
        <div className="queue-group">
          <div className="queue-group-title">Active now</div>
          {running.map((t) => (
            <div className="queue-row" key={t.id}>
              <div className="q-main">
                <div className="q-title">{taskTypeLabel(t.type)}</div>
                <div className="tiny">{projectById.get(t.projectId ?? '') ?? '—'}</div>
              </div>
              <div className="q-meta tiny">
                <span className="status working"><span className="dot" /> {t.message ?? (renderStageLabel(t.stage) || 'Working…')}</span>
              </div>
              <div className="q-value tiny">
                {t.progress != null ? `${Math.round(t.progress * 100)}%` : ''}
              </div>
              <div className="q-actions">
                <button className="btn sm" onClick={() => void cancel(t.id)}>
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="queue-section">
        <RenderList />
      </div>

      {history.length > 0 && (
        <div className="queue-group">
          <div className="queue-group-title">Recent jobs</div>
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Project</th>
                <th>Status</th>
                <th>Details</th>
                <th>Finished</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => (
                <tr key={t.id}>
                  <td>{taskTypeLabel(t.type)}</td>
                  <td>{projectById.get(t.projectId ?? '') ?? '—'}</td>
                  <td>
                    <span className={`status ${t.state === 'completed' ? 'success' : t.state === 'failed' ? 'danger' : 'warn'}`}>
                      <span className="dot" /> {taskStateLabel(t.state)}
                    </span>
                  </td>
                  <td className="tiny truncate">
                    {t.error?.message ?? t.message ?? '—'}
                  </td>
                  <td className="tiny nowrap">{new Date(t.updatedAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
