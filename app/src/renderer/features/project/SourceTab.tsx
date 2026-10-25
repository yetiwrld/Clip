import React, { useEffect, useRef, useState } from 'react'
import { Film, Link2, HardDrive, FolderOpen, Trash2, X } from 'lucide-react'
import { api, errMessage, isElectron, mediaUrl } from '../../api/client'
import { pickUpload } from '../../api/upload'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { Field, formatBytes, Modal, ProgressBar, Spinner } from '../../components/ui'
import { DURATION_RANGES } from '@shared/constants'

export function SourceTab() {
  const app = useAppStore()
  const data = useDataStore()
  const project = data.activeProject!
  const [url, setUrl] = useState('')
  const [rangeStart, setRangeStart] = useState('00:00')
  const [rangeEnd, setRangeEnd] = useState('00:30')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [playback, setPlayback] = useState<Awaited<ReturnType<typeof api['media.checkPlayback']>> | null>(null)
  const [useProxy, setUseProxy] = useState(false)
  const [proxyTaskId, setProxyTaskId] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [mediaState, setMediaState] = useState({ currentTime: 0, duration: 0, readyState: 0, paused: true, seeking: false })
  const importTask = data.tasks.find((t) => t.type === 'download' && t.projectId === project.id && (t.state === 'running' || t.state === 'queued'))
  const importing = project.status === 'importing' || Boolean(importTask)

  useEffect(() => {
    let live = true
    setPlayback(null)
    setUseProxy(false)
    setMediaError(null)
    if (project.sourcePath && project.status !== 'importing') {
      void api['media.checkPlayback']({ projectId: project.id })
        .then((result) => {
          if (!live) return
          setPlayback(result)
          if (result.verdict === 'proxy') {
            if (result.proxyExists) setUseProxy(true)
            else void createPreviewCopy()
          }
        })
        .catch((err) => { if (live) setMediaError(errMessage(err).message) })
    }
    return () => { live = false }
  }, [project.id, project.sourcePath, project.status])

  useEffect(() => {
    if (!proxyTaskId) return
    const task = data.tasks.find((item) => item.id === proxyTaskId)
    if (task?.state === 'completed') {
      setUseProxy(true)
      setProxyTaskId(null)
      setPlayback((current) => current ? { ...current, proxyExists: true } : current)
      setMediaError(null)
    } else if (task?.state === 'failed') {
      setMediaError(task.error?.message ?? 'The preview copy could not be created.')
      setProxyTaskId(null)
    }
  }, [data.tasks, proxyTaskId])

  async function createPreviewCopy(force = false) {
    try {
      if (proxyTaskId || (useProxy && force)) return
      const task = await api['media.renderProxy']({ projectId: project.id, force })
      setProxyTaskId(task.taskId)
      setMediaError(null)
    } catch (err) {
      setMediaError(errMessage(err).message)
    }
  }

  async function importFile() {
    try {
      if (isElectron) {
        const picked = await api['media.pickSourceFile']()
        if (!picked.filePath) return
        await api['media.importFile']({ projectId: project.id, filePath: picked.filePath })
      } else {
        const uploaded = await pickUpload(['video/*', 'audio/*', '.mkv', '.webm'])
        if (!uploaded) return
        await api['media.importFile']({ projectId: project.id, filePath: uploaded })
      }
      await data.loadProject(project.id)
      await data.refreshProjects()
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
      await data.loadProject(project.id)
    }
  }

  async function importUrl() {
    if (!url.trim()) return
    try {
      await api['media.importUrl']({ projectId: project.id, url: url.trim() })
      await data.loadProject(project.id)
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
      await data.loadProject(project.id)
    }
  }

  async function importUrlAudio() {
    if (!url.trim()) return
    try {
      await api['media.importUrlAudio']({ projectId: project.id, url: url.trim() })
      await data.loadProject(project.id)
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
      await data.loadProject(project.id)
    }
  }

  async function importUrlSection() {
    if (!url.trim()) return
    const startTime = parseTimecode(rangeStart)
    const endTime = parseTimecode(rangeEnd)
    if (startTime == null || endTime == null || endTime <= startTime) {
      app.toast({ level: 'warn', message: 'Enter a valid start and end time, with the end after the start.', hint: 'Use seconds, MM:SS, or HH:MM:SS.' })
      return
    }
    try {
      await api['media.importUrlSection']({ projectId: project.id, url: url.trim(), startTime, endTime })
      await data.loadProject(project.id)
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
      await data.loadProject(project.id)
    }
  }

  async function cancelImport() {
    if (!importTask) return
    try {
      await api['tasks.cancel']({ id: importTask.id })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function deleteProject() {
    try {
      await api['projects.delete']({ id: project.id, confirm: true })
      await data.refreshProjects()
      app.navigate('dashboard')
      app.toast({ level: 'info', message: `Project “${project.name}” deleted.` })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.7fr) minmax(280px, 1fr)', alignItems: 'start' }}>
      <div className="stack">
        {project.sourceMode === 'audio-first' && (
          <div className="panel" style={{ borderColor: 'var(--accent)', lineHeight: 1.55 }}>
            <strong>Audio-first URL project</strong>
            <div className="tiny" style={{ marginTop: 'var(--space-2)' }}>
              Only an audio stream was downloaded. Transcription and local moment discovery can run on this audio; choosing a moment fetches only its video section. Audio still uses data, and some sources may require keyframe padding or refuse section downloads. No full-video fallback is used.
            </div>
          </div>
        )}
        <div className="panel flush source-player">
          {project.sourcePath && project.status !== 'importing' ? (
            project.sourceMode === 'audio-first' ? (
              <div style={{ aspectRatio: '16/9', display: 'grid', placeItems: 'center', background: 'var(--bg-2)', padding: 'var(--space-6)' }}>
                <audio
                  key={project.sourcePath}
                  src={mediaUrl(project.sourcePath)}
                  controls
                  style={{ width: '100%', maxWidth: 620 }}
                  preload="metadata"
                  onLoadStart={() => setMediaError(null)}
                  onLoadedMetadata={(event) => setMediaState((s) => ({ ...s, duration: event.currentTarget.duration }))}
                  onTimeUpdate={(event) => setMediaState((s) => ({ ...s, currentTime: event.currentTarget.currentTime }))}
                  onPlay={() => setMediaState((s) => ({ ...s, paused: false }))}
                  onPause={() => setMediaState((s) => ({ ...s, paused: true }))}
                  onSeeking={() => setMediaState((s) => ({ ...s, seeking: true }))}
                  onSeeked={(event) => setMediaState((s) => ({ ...s, seeking: false, currentTime: event.currentTarget.currentTime }))}
                  onCanPlay={(event) => setMediaState((s) => ({ ...s, readyState: event.currentTarget.readyState }))}
                  onError={() => setMediaError('The downloaded audio could not be played.')}
                />
              </div>
            ) : (
              <video
                key={`${project.sourcePath}:${useProxy ? 'proxy' : 'source'}`}
                src={mediaUrl(project.sourcePath, { proxy: useProxy })}
                controls
                style={{ width: '100%', aspectRatio: '16/9', background: '#000', display: 'block' }}
                preload="metadata"
                playsInline
                onLoadStart={() => setMediaError(null)}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration
                  setMediaState((s) => ({ ...s, duration }))
                }}
                onTimeUpdate={(event) => {
                  const currentTime = event.currentTarget.currentTime
                  setMediaState((s) => ({ ...s, currentTime }))
                }}
                onPlay={() => setMediaState((s) => ({ ...s, paused: false }))}
                onPlaying={(event) => {
                  if (!useProxy && event.currentTarget.videoWidth === 0) {
                    setMediaError('The video stream started without a decoded picture. Building a compatible preview copy…')
                    void createPreviewCopy(true)
                  }
                }}
                onPause={() => setMediaState((s) => ({ ...s, paused: true }))}
                onSeeking={() => setMediaState((s) => ({ ...s, seeking: true }))}
                onSeeked={(event) => {
                  const currentTime = event.currentTarget.currentTime
                  setMediaState((s) => ({ ...s, seeking: false, currentTime }))
                }}
                onCanPlay={(event) => {
                  const readyState = event.currentTarget.readyState
                  setMediaState((s) => ({ ...s, readyState }))
                }}
                onError={(event) => {
                  const mediaError = event.currentTarget.error
                  const causes: Record<number, string> = { 1: 'Playback was aborted.', 2: 'The media could not be read (file unavailable or interrupted).', 3: 'Chromium could not decode this media codec.', 4: 'This media format or source URL is unsupported.' }
                  setMediaError(causes[mediaError?.code ?? 0] ?? 'The source could not be played.')
                  if (!useProxy) void createPreviewCopy(true)
                }}
              />
            )
          ) : (
            <div style={{ aspectRatio: '16/9', display: 'grid', placeItems: 'center', background: 'var(--bg-2)' }}>
              {importing ? (
                <div style={{ width: '70%' }}>
                  <div className="muted" style={{ textAlign: 'center', marginBottom: 'var(--space-4)', fontSize: 13 }}>
                    {importTask?.message ?? 'Importing media…'}
                  </div>
                  {importTask?.progress != null && <ProgressBar value={importTask.progress} />}
                  {importTask && (
                    <button className="btn sm" style={{ display: 'flex', margin: 'var(--space-4) auto 0' }} onClick={() => void cancelImport()}>
                      <X size={12} /> Cancel download
                    </button>
                  )}
                </div>
              ) : (
                <div className="empty" style={{ padding: 'var(--space-8)' }}>
                  <Film size={36} className="empty-icon" />
                  <div className="muted" style={{ fontSize: 13 }}>No media imported yet</div>
                </div>
              )}
            </div>
          )}
          {project.sourcePath && mediaError && (
            <div className="playback-error" role="alert">
              <div>
                <strong>Unable to play this {project.sourceMode === 'audio-first' ? 'audio' : 'video'}</strong>
                <p>{mediaError}</p>
                {playback?.verdict === 'proxy' && !playback.proxyExists && (
                  <button className="btn primary sm" onClick={() => void createPreviewCopy()} disabled={Boolean(proxyTaskId)}>
                    {proxyTaskId ? <Spinner size={11} /> : <Film size={12} />}
                    {proxyTaskId ? 'Creating preview copy…' : 'Create preview copy'}
                  </button>
                )}
                {playback?.verdict === 'proxy' && playback.proxyExists && !useProxy && (
                  <button className="btn primary sm" onClick={() => { setUseProxy(true); setMediaError(null) }}>Play preview copy</button>
                )}
                <details style={{ marginTop: 'var(--space-3)' }}>
                  <summary className="tiny">View playback diagnostics</summary>
                  <div className="tiny" style={{ marginTop: 'var(--space-2)' }}>
                    Codec: {project.videoCodec ?? 'unknown'} / {project.audioCodec ?? 'no audio'} · Duration: {Number.isFinite(mediaState.duration) ? `${mediaState.duration.toFixed(2)}s` : 'unknown'} · Ready state: {mediaState.readyState}
                    <br />{playback?.reason ?? 'Compatibility check pending'}
                  </div>
                </details>
              </div>
            </div>
          )}
          {project.sourcePath && !mediaError && (
            <div className="tiny muted" style={{ padding: 'var(--space-3) var(--space-4)' }} aria-live="polite">
              {mediaState.currentTime.toFixed(1)}s / {(mediaState.duration || project.duration || 0).toFixed(1)}s{mediaState.seeking ? ' · seeking' : ''}{useProxy ? ' · preview copy' : ''}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="section-title">Import media</div>
          <div className="row wrap">
            <button className="btn" onClick={() => void importFile()} disabled={importing}>
              <Film size={15} /> From file…
            </button>
            <span className="tiny">MP4 · MOV · MKV · WebM · AVI · common audio</span>
          </div>
          <div className="divider" />
          <div className="row wrap">
            <Link2 size={15} className="muted" />
            <input
              className="input"
              style={{ flex: 1, minWidth: 200 }}
              placeholder="Media page or direct URL you are authorized to use"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button className="btn" onClick={() => void importUrl()} disabled={importing || !url.trim() || Boolean(project.sourcePath)}>
              Download full video
            </button>
          </div>
          <div className="divider" />
          <div className="section-title">Low-data: download a time range</div>
          <div className="tiny" style={{ lineHeight: 1.55, marginBottom: 'var(--space-3)' }}>
            Fetch only a chosen video interval from compatible URLs. Requires yt-dlp and FFmpeg; the source may include nearby keyframes. It will not fall back to a full download.
          </div>
          <div className="row wrap">
            <label className="tiny" style={{ display: 'grid', gap: 'var(--space-2)' }}>
              Start
              <input className="input" style={{ width: 118 }} value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} placeholder="00:01:20" />
            </label>
            <label className="tiny" style={{ display: 'grid', gap: 'var(--space-2)' }}>
              End
              <input className="input" style={{ width: 118 }} value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} placeholder="00:01:50" />
            </label>
            <button className="btn" style={{ alignSelf: 'end' }} onClick={() => void importUrlSection()} disabled={importing || !url.trim() || Boolean(project.sourcePath)}>
              Download selected section
            </button>
          </div>
          <div className="divider" />
          <div className="section-title">Low-data: audio-first discovery</div>
          <div className="tiny" style={{ lineHeight: 1.55, marginBottom: 'var(--space-3)' }}>
            Downloads an audio-only stream first. Transcription runs locally unless you explicitly choose a cloud provider; select a discovered moment to fetch only that video section. Audio still transfers, and URL support varies.
          </div>
          <button className="btn primary" onClick={() => void importUrlAudio()} disabled={importing || !url.trim() || Boolean(project.sourcePath)}>
            <Link2 size={14} /> Download audio only
          </button>
          {project.sourcePath && (
            <div className="tiny" style={{ color: 'var(--text-3)', marginTop: 'var(--space-3)' }}>
              This project already has source media. Create a new project to use another URL or time range without replacing it.
            </div>
          )}
          <div className="tiny" style={{ color: 'var(--text-3)', marginTop: 'var(--space-3)' }}>Only download content you have the right to use.</div>
        </div>
      </div>

      <div className="stack" style={{ gap: 0 }}>
        <div className="section">
          <div className="section-title">Source information</div>
          {project.status === 'created' ? (
            <div className="muted" style={{ fontSize: 13 }}>Import media to see duration, resolution, codecs and audio status.</div>
          ) : (
            <table className="table">
              <tbody>
                <MetaRow k="File" v={project.sourceFilename ?? '—'} />
                <MetaRow k="Duration" v={project.duration != null ? formatDuration(project.duration) : '—'} />
                <MetaRow k="Resolution" v={project.width && project.height ? `${project.width} × ${project.height}` : '—'} />
                <MetaRow k="Frame rate" v={project.fps != null ? `${project.fps} fps` : '—'} />
                <MetaRow k="Video codec" v={project.videoCodec ?? '—'} />
                <MetaRow k="Audio" v={project.hasAudio ? `${project.audioCodec ?? 'yes'}` : 'No audio track'} warn={!project.hasAudio} />
                <MetaRow k="Size" v={project.sizeBytes ? formatBytes(project.sizeBytes) : '—'} />
                <MetaRow k="Imported via" v={project.sourceType === 'url' ? (project.sourceMode === 'audio-first' ? 'URL · audio only' : project.sourceMode === 'section' ? 'URL · selected section' : 'URL · full source') : 'Local file'} />
              </tbody>
            </table>
          )}
        </div>

        <div className="section">
          <div className="section-title">Discovery settings</div>
          <Field label="Target clip duration" hint="Applied when analyzing. Candidates outside the window (±35%) are rejected.">
            <select
              className="select"
              value={project.settings.durationPreset}
              onChange={(e) => void updateProjectSettings(e.target.value as 'short' | 'medium' | 'long' | 'mixed')}
            >
              {DURATION_RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Field label="Max candidates" hint="How many moments the analyzer may propose.">
              <input
                className="input"
                type="number"
                min={1}
                max={40}
                value={project.settings.maxCandidates}
                onChange={(e) => void updateProjectSettings(undefined, parseInt(e.target.value, 10))}
              />
            </Field>
          </div>
        </div>

        {data.storage && (
          <div className="section">
            <div className="section-title">
              <span className="row">
                <HardDrive size={13} /> Project storage
              </span>
            </div>
            <table className="table">
              <tbody>
                <MetaRow k="Source media" v={formatBytes(data.storage.source)} />
                <MetaRow k="Media assets" v={formatBytes(data.storage.assets)} />
                <MetaRow k="Renders" v={formatBytes(data.storage.renders)} />
                <MetaRow k="Thumbnails" v={formatBytes(data.storage.thumbnails)} />
                <MetaRow k="Cache" v={formatBytes(data.storage.cache)} />
              </tbody>
            </table>
            {project.sourcePath && (
              <button
                className="btn sm"
                style={{ marginTop: 'var(--space-4)' }}
                onClick={() => void api['system.revealPath']({ path: data.activeProject!.sourcePath! }).catch((e) => app.toast({ level: 'warn', ...errMessage(e) }))}
              >
                <FolderOpen size={13} /> Reveal source file
              </button>
            )}
          </div>
        )}

        <div className="section">
          <button className="btn danger sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} /> Delete project…
          </button>
        </div>
      </div>

      {confirmDelete && (
        <Modal
          title="Delete project?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn danger" onClick={() => void deleteProject()}>
                <Trash2 size={14} /> Delete permanently
              </button>
            </>
          }
        >
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <strong>“{project.name}”</strong> and all of its imported media, transcripts, clips and renders will be removed from
            the workspace. Files already exported to the exports folder are kept.
          </div>
          <div className="field-hint">This cannot be undone.</div>
        </Modal>
      )}
    </div>
  )

  async function updateProjectSettings(durationPreset?: 'short' | 'medium' | 'long' | 'mixed', maxCandidates?: number) {
    try {
      const updated = await api['projects.updateSettings']({
        id: project.id,
        settings: { durationPreset, maxCandidates }
      })
      useDataStore.setState((s) => ({ activeProject: updated }))
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }
}

function MetaRow({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <tr>
      <td style={{ color: 'var(--text-3)', width: '42%' }}>{k}</td>
      <td style={{ wordBreak: 'break-all', color: warn ? 'var(--warn)' : undefined }}>{v}</td>
    </tr>
  )
}


function parseTimecode(raw: string): number | null {
  const value = raw.trim()
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const seconds = Number(value)
    return Number.isFinite(seconds) && seconds <= 86400 ? seconds : null
  }
  const parts = value.split(':')
  if (parts.length !== 2 && parts.length !== 3) return null
  if (!parts.slice(0, -1).every((part) => /^\d+$/.test(part)) || !/^\d+(?:\.\d+)?$/.test(parts.at(-1) ?? '')) return null
  const nums = parts.map(Number)
  const seconds = nums[nums.length - 1]
  const minutes = nums[nums.length - 2]
  if (seconds >= 60 || (parts.length === 3 && minutes >= 60)) return null
  const total = parts.length === 3 ? nums[0] * 3600 + minutes * 60 + seconds : minutes * 60 + seconds
  return Number.isFinite(total) && total <= 86400 ? total : null
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return `${m}m ${s}s`
}
