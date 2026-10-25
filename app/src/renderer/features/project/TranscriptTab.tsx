import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Upload, Cpu, Cloud, Search, Copy, Play, X, Users } from 'lucide-react'
import { api, errMessage, isElectron, copyText, mediaUrl } from '../../api/client'
import { pickUpload } from '../../api/upload'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { ErrorBox, ProgressBar, Spinner } from '../../components/ui'
import { formatClock } from '@shared/utils/time'

/**
 * Synchronized transcript viewer (spec §13): timestamps, click-to-seek,
 * follow-playback highlighting, search, copy.
 */
export function TranscriptTab() {
  const app = useAppStore()
  const data = useDataStore()
  const project = data.activeProject!
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [follow, setFollow] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [startedTranscribeTaskId, setStartedTranscribeTaskId] = useState<string | null>(null)
  const [transcribeProviderId, setTranscribeProviderId] = useState<'faster-whisper-local' | 'openai-compatible' | null>(null)
  const [transcriptionStarting, setTranscriptionStarting] = useState(false)
  const [startedSpeakerTaskId, setStartedSpeakerTaskId] = useState<string | null>(null)
  const [speakerStarting, setSpeakerStarting] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeRowRef = useRef<HTMLDivElement>(null)

  const transcribeTask = data.tasks.find(
    (t) => t.type === 'transcribe' && t.projectId === project.id && (t.state === 'running' || t.state === 'queued')
  )
  const startedTask = data.tasks.find((t) => t.id === startedTranscribeTaskId)
  const activeTask = transcribeTask ?? (
    startedTask?.projectId === project.id && (startedTask.state === 'running' || startedTask.state === 'queued')
      ? startedTask
      : null
  )
  const speakerTask = data.tasks.find(
    (t) => t.type === 'speaker-identification' && t.projectId === project.id && (t.state === 'running' || t.state === 'queued')
  )
  const startedSpeakerTask = data.tasks.find((t) => t.id === startedSpeakerTaskId)
  const activeSpeakerTask = speakerTask ?? (
    startedSpeakerTask?.projectId === project.id && (startedSpeakerTask.state === 'running' || startedSpeakerTask.state === 'queued')
      ? startedSpeakerTask
      : null
  )
  const speakerBusy = Boolean(activeSpeakerTask) || speakerStarting
  const transcribing = project.status === 'transcribing' || Boolean(activeTask) || transcriptionStarting
  const localTranscription =
    transcribeProviderId === 'faster-whisper-local' ||
    activeTask?.progress != null ||
    activeTask?.stage === 'loading-model' ||
    activeTask?.stage === 'transcribing'

  useEffect(() => {
    setStartedTranscribeTaskId(null)
    setTranscribeProviderId(null)
    setTranscriptionStarting(false)
    setStartedSpeakerTaskId(null)
    setSpeakerStarting(false)
  }, [project.id])

  useEffect(() => {
    void data.loadTasks(project.id)
    const id = setInterval(() => void data.loadTasks(project.id), 1500)
    return () => clearInterval(id)
  }, [data.loadTasks, project.id])

  useEffect(() => {
    if (!startedSpeakerTask) return
    if (startedSpeakerTask.state === 'completed') {
      app.toast({ level: 'success', message: 'Speaker groups assigned. Review and correct any turns below; no real-world identities are inferred.' })
      setStartedSpeakerTaskId(null)
    } else if (startedSpeakerTask.state === 'failed' || startedSpeakerTask.state === 'cancelled' || startedSpeakerTask.state === 'interrupted') {
      setStartedSpeakerTaskId(null)
    }
  }, [startedSpeakerTask?.state, app.toast])

  // app.checkDependencies() exposes this dependency as `faster-whisper`, while
  // the transcription job/provider itself is named `faster-whisper-local`.
  // Accept both IDs so the UI availability state matches the backend probe.
  const localDependency = app.dependencies.find((d) => d.id === 'faster-whisper' || d.id === 'faster-whisper-local')
  const providers = app.dependencies.filter((d) => d.id === 'openai-compatible')
  const localAvailable = localDependency?.available ?? false
  const cloudAvailable = providers.find((p) => p.id === 'openai-compatible')?.available ?? false
  const speakerDependency = app.dependencies.find((d) => d.id === 'speaker-diarization')
  const speakerAvailable = speakerDependency?.available ?? false
  const speakerOptions = useMemo(() => {
    const byLabel = new Map<string, import('@shared/types').Speaker>()
    for (const speaker of data.speakers) byLabel.set(speaker.label, speaker)
    for (const segment of data.transcript) {
      if (!segment.speaker || byLabel.has(segment.speaker)) continue
      byLabel.set(segment.speaker, { id: 0, projectId: project.id, label: segment.speaker, name: null, color: null })
    }
    return [...byLabel.values()].sort((a, b) => a.id - b.id || a.label.localeCompare(b.label))
  }, [data.speakers, data.transcript, project.id])

  // keep currentTime fresh but re-render friendly (~4x/s)
  useEffect(() => {
    const id = setInterval(() => {
      const player = project.sourceMode === 'audio-first' ? audioRef.current : videoRef.current
      if (player) setCurrentTime(player.currentTime)
    }, 250)
    return () => clearInterval(id)
  }, [project.sourceMode])

  // follow-playback auto-scroll
  useEffect(() => {
    if (!follow || !activeRowRef.current || !listRef.current) return
    const row = activeRowRef.current
    const list = listRef.current
    const rowTop = row.offsetTop - list.offsetTop
    if (rowTop < list.scrollTop + 40 || rowTop > list.scrollTop + list.clientHeight - 80) {
      list.scrollTo({ top: Math.max(0, rowTop - list.clientHeight / 2.6), behavior: 'smooth' })
    }
  }, [currentTime, follow])

  async function transcribe(providerId: 'faster-whisper-local' | 'openai-compatible') {
    setError(null)
    setTranscribeProviderId(providerId)
    setTranscriptionStarting(true)
    setBusy(true)
    try {
      const { taskId } = await api['transcript.start']({ projectId: project.id, providerId })
      setStartedTranscribeTaskId(taskId)
      void data.loadTasks(project.id)
      app.toast({
        level: 'info',
        message:
          providerId === 'faster-whisper-local'
            ? 'Local transcription started — it runs fully offline on this machine.'
            : 'Cloud transcription started — the extracted audio track is being sent to your configured endpoint.'
      })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
      setTranscriptionStarting(false)
    }
  }

  async function cancelTranscription() {
    if (!activeTask) return
    setError(null)
    try {
      const result = await api['tasks.cancel']({ id: activeTask.id })
      if (!result.cancelled) throw new Error('The transcription task is no longer running.')
    } catch (err) {
      setError(err)
    }
  }

  async function identifySpeakers() {
    if (speakerBusy || transcribing || data.transcript.length === 0) return
    setError(null)
    setSpeakerStarting(true)
    try {
      const { taskId } = await api['transcript.identifySpeakers']({ projectId: project.id })
      setStartedSpeakerTaskId(taskId)
      void data.loadTasks(project.id)
      app.toast({ level: 'info', message: 'Local speaker grouping started. Audio is analyzed on this device; the model may download weights the first time.' })
    } catch (err) {
      setError(err)
    } finally {
      setSpeakerStarting(false)
    }
  }

  async function cancelSpeakerIdentification() {
    if (!activeSpeakerTask) return
    setError(null)
    try {
      const result = await api['tasks.cancel']({ id: activeSpeakerTask.id })
      if (!result.cancelled) throw new Error('The speaker-identification task is no longer running.')
    } catch (err) {
      setError(err)
    }
  }

  async function changeSpeaker(segmentId: number, speakerLabel: string | null) {
    setError(null)
    try {
      await api['transcript.updateSpeaker']({ projectId: project.id, segmentId, speakerLabel })
      await Promise.all([data.loadTranscript(project.id), data.loadSpeakers(project.id)])
    } catch (err) {
      setError(err)
    }
  }

  async function renameSpeaker(speakerLabel: string, name: string) {
    setError(null)
    try {
      await api['transcript.renameSpeaker']({ projectId: project.id, speakerLabel, name })
      await data.loadSpeakers(project.id)
      app.toast({ level: 'success', message: 'Speaker display name saved.' })
    } catch (err) {
      setError(err)
    }
  }

  async function importTranscript() {
    if (busy || transcribing || speakerBusy) return
    setBusy(true)
    setError(null)
    try {
      let filePath: string | null = null
      if (isElectron) {
        const picked = await api['media.pickTranscriptFile']()
        filePath = picked.filePath
      } else {
        filePath = await pickUpload(['.srt', '.vtt', '.json', '.txt'])
      }
      if (!filePath) return
      const result = await api['transcript.import']({ projectId: project.id, filePath })
      await data.loadTranscript(project.id)
      await data.loadProject(project.id)
      app.toast({ level: 'success', message: `Imported ${result.segments} transcript segments.` })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return data.transcript
    const q = query.toLowerCase()
    return data.transcript.filter((s) => s.text.toLowerCase().includes(q))
  }, [data.transcript, query])

  const activeSegmentId = useMemo(() => {
    for (const seg of data.transcript) {
      if (currentTime >= seg.startTime && currentTime <= seg.endTime) return seg.id
    }
    return null
  }, [currentTime, data.transcript])

  async function copyAll() {
    const names = new Map(speakerOptions.map((speaker) => [speaker.label, displaySpeakerName(speaker)]))
    const text = data.transcript.map((s) => `[${formatClock(s.startTime)}] ${s.speaker ? `[${names.get(s.speaker) ?? s.speaker}] ` : ''}${s.text}`).join('\n')
    const ok = await copyText(text)
    app.toast(ok ? { level: 'success', message: 'Transcript copied to clipboard.' } : { level: 'warn', message: 'Copy failed.' })
  }

  return (
    <div className="stack">
      <div className="toolbar" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 10 }}>
        <div className="row wrap">
          <div className="row" style={{ flex: 1, minWidth: 200 }}>
            <Search size={14} className="muted" />
            <input
              className="input"
              placeholder="Search transcript…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={data.transcript.length === 0}
            />
          </div>
          <button className="btn" onClick={() => void transcribe('faster-whisper-local')} disabled={transcribing || speakerBusy || busy || !localAvailable}
            title={localAvailable ? 'Run local Whisper — fully offline' : (localDependency?.message ?? 'faster-whisper is unavailable on this machine')}>
            <Cpu size={14} /> {transcribing ? 'Transcribing…' : 'Transcribe locally'}
          </button>
          <button className="btn" onClick={() => void transcribe('openai-compatible')} disabled={transcribing || speakerBusy || busy || !cloudAvailable}
            title={cloudAvailable ? 'Send the audio track to your configured endpoint' : 'Configure an audio-capable provider in Settings → AI'}>
            <Cloud size={14} /> Via cloud
          </button>
          <button className="btn" onClick={() => void identifySpeakers()} disabled={transcribing || speakerBusy || busy || data.transcript.length === 0 || !speakerAvailable}
            title={speakerAvailable ? 'Group transcript turns by local voice similarity; this does not identify real people' : (speakerDependency?.fixHint ?? speakerDependency?.message ?? 'Install the optional local speaker model')}>
            {speakerBusy ? <Spinner size={14} /> : <Users size={14} />} {speakerBusy ? 'Identifying…' : 'Identify speakers'}
          </button>
          <button className="btn" onClick={() => void importTranscript()} disabled={transcribing || speakerBusy || busy}>
            <Upload size={14} /> Import file…
          </button>
          <button className="btn ghost" onClick={() => void copyAll()} disabled={data.transcript.length === 0} title="Copy full transcript">
            <Copy size={14} />
          </button>
        </div>
        {transcribing && !localTranscription && (
          <div className="row" style={{ marginTop: 10 }}>
            <Spinner />
            <span className="muted" style={{ fontSize: 12.5 }}>
              {activeTask?.message ?? 'Starting transcription…'}
            </span>
            {activeTask && <button className="btn danger" onClick={() => void cancelTranscription()} style={{ marginLeft: 'auto' }}>
              <X size={14} /> Cancel transcription
            </button>}
          </div>
        )}
        {!localAvailable && !transcribing && (
          <div className="tiny" style={{ marginTop: 8 }}>
            Local Whisper unavailable here — {localDependency?.message ?? 'check Python and faster-whisper in Settings → Transcription'}, or import an
            existing SRT/VTT/JSON transcript.
          </div>
        )}
        {speakerBusy && (
          <div className="speaker-task-status" role="status" aria-live="polite">
            <div className="row" style={{ gap: 8 }}>
              <Spinner size={13} />
              <strong>{activeSpeakerTask?.message ?? 'Preparing local speaker analysis…'}</strong>
              <span className="tiny" style={{ marginLeft: 'auto' }}>{Math.round((activeSpeakerTask?.progress ?? 0) * 100)}%</span>
              {activeSpeakerTask && <button className="btn danger sm" onClick={() => void cancelSpeakerIdentification()}><X size={12} /> Cancel</button>}
            </div>
            <ProgressBar value={activeSpeakerTask?.progress ?? 0} />
            <div className="tiny">Audio stays on this device. Voice groups are suggestions, not real-world identity recognition.</div>
          </div>
        )}
        {data.transcript.length > 0 && !speakerAvailable && (
          <div className="tiny" style={{ marginTop: 8 }}>
            Local speaker grouping unavailable — {speakerDependency?.fixHint ?? speakerDependency?.message ?? 'install the optional resemblyzer package'}.
            You can still assign and rename any existing transcript speaker labels.
          </div>
        )}
      </div>

      {error ? <ErrorBox error={error} onRetry={() => setError(null)} retryLabel="Dismiss" /> : null}

      {transcribing && localTranscription && (
        <TranscriptionProgress
          task={activeTask ?? null}
          hasTranscript={data.transcript.length > 0}
          onCancel={cancelTranscription}
        />
      )}

      {data.transcript.length > 0 && speakerOptions.length > 0 && (
        <SpeakerRoster speakers={speakerOptions} onRename={(label, name) => void renameSpeaker(label, name)} />
      )}

      {data.transcript.length === 0 && !transcribing ? (
        <div className="empty" style={{ padding: '72px 20px' }}>
          <FileText size={28} className="empty-icon" />
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{project.hasAudio ? 'No transcript yet' : 'This video has no audio track'}</div>
          <div className="muted" style={{ maxWidth: 420, fontSize: 12.5, lineHeight: 1.55 }}>
            {project.hasAudio
              ? `Transcribe the ${project.sourceMode === 'audio-first' ? 'downloaded audio' : 'video'} (locally with Whisper, or via your explicitly selected cloud provider), or import an existing SRT/VTT/JSON transcript. Moment discovery, captions and editing all work from this transcript.`
              : 'Speech transcription needs audio. You can still import an existing transcript file to continue the workflow.'}
          </div>
        </div>
      ) : data.transcript.length === 0 && localTranscription ? null : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(260px, 380px) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="panel" style={{ padding: 10, position: 'sticky', top: 0 }}>
            {project.sourceMode === 'audio-first' ? (
              <audio
                ref={audioRef}
                src={project.sourcePath ? mediaUrl(project.sourcePath) : undefined}
                controls
                style={{ width: '100%', marginTop: 16 }}
                preload="metadata"
              />
            ) : (
              <video
                ref={videoRef}
                src={project.sourcePath ? mediaUrl(project.sourcePath) : undefined}
                controls
                style={{ width: '100%', borderRadius: 8, background: '#000', aspectRatio: '16/9' }}
                preload="metadata"
              />
            )}
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, padding: '0 2px' }}>
              <span className="tiny">{formatClock(currentTime)}</span>
              <label className="row tiny" style={{ gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow playback
              </label>
            </div>
          </div>

          <div className="panel" ref={listRef} style={{ maxHeight: '64vh', overflowY: 'auto', padding: '10px 6px' }}>
            <div className="transcript-list">
              {filtered.map((seg) => (
                <TranscriptRow
                  key={seg.id}
                  segment={seg}
                  query={query}
                  active={seg.id === activeSegmentId}
                  rowRef={seg.id === activeSegmentId ? activeRowRef : undefined}
                  speakers={speakerOptions}
                  onSpeakerChange={(label) => void changeSpeaker(seg.id, label)}
                  onSeek={(t) => {
                    const player = project.sourceMode === 'audio-first' ? audioRef.current : videoRef.current
                    if (player) {
                      player.currentTime = t
                      void player.play()
                    }
                  }}
                />
              ))}
              {filtered.length === 0 && (
                <div className="muted" style={{ padding: 20, textAlign: 'center' }}>No matches for “{query}”.</div>
              )}
            </div>
            {filtered.length > 0 && (
              <div className="row" style={{ justifyContent: 'center', paddingTop: 8 }}>
                <span className="tiny">
                  {filtered.length} segment{filtered.length === 1 ? '' : 's'}
                  {query && ` of ${data.transcript.length}`} · click a line to play from there
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TranscriptionProgress({
  task,
  hasTranscript,
  onCancel
}: {
  task: import('@shared/types').TaskInfo | null
  hasTranscript: boolean
  onCancel: () => Promise<void>
}) {
  const progress = typeof task?.progress === 'number' && Number.isFinite(task.progress)
    ? Math.min(1, Math.max(0, task.progress))
    : 0
  const percent = Math.round(progress * 100)
  const preparingModel = task?.stage === 'loading-model' || progress === 0

  return (
    <section
      className={`transcription-progress-card ${hasTranscript ? 'has-transcript' : 'is-empty'}`}
      role="status"
      aria-live="polite"
      aria-label={`Local transcription ${percent}% complete`}
    >
      <div className="transcription-progress-top">
        <div className="transcription-progress-icon" aria-hidden="true">
          <Spinner size={25} />
        </div>
        <div className="transcription-progress-copy">
          <div className="transcription-progress-eyebrow"><Cpu size={12} /> Local Whisper</div>
          <h2>Transcribing locally</h2>
          <p>Whisper is processing your audio on this device. Your media stays local.</p>
        </div>
        <div className="transcription-progress-percent" aria-label={`${percent}% complete`}>
          <strong>{percent}<span>%</span></strong>
          <small>complete</small>
        </div>
      </div>
      <ProgressBar value={progress} />
      <div className="transcription-progress-details">
        <div className="transcription-progress-message">
          <div className="transcription-progress-stage">{task?.message ?? 'Starting local transcription…'}</div>
          <div className="transcription-progress-note">
            {preparingModel
              ? 'Model setup may take a little longer on first use. Progress advances as the audio is processed.'
              : 'Progress is based on the audio duration processed so far.'}
          </div>
        </div>
        {task && <button className="btn danger" onClick={() => void onCancel()}>
          <X size={14} /> Cancel transcription
        </button>}
      </div>
    </section>
  )
}

function displaySpeakerName(speaker: import('@shared/types').Speaker): string {
  if (speaker.name?.trim()) return speaker.name.trim()
  const match = speaker.label.match(/^speaker[-_ ]?(\d+)$/i)
  return match ? `Speaker ${match[1]}` : speaker.label
}

function SpeakerRoster({
  speakers,
  onRename
}: {
  speakers: import('@shared/types').Speaker[]
  onRename: (label: string, name: string) => void
}) {
  return (
    <section className="panel speaker-roster" aria-label="Speaker groups">
      <div className="speaker-roster-heading">
        <div className="row"><Users size={14} /><strong>Speaker groups</strong></div>
        <span className="tiny">Rename groups, then use each transcript row’s menu to correct assignments.</span>
      </div>
      <div className="speaker-roster-list">
        {speakers.map((speaker) => (
          <SpeakerNameField key={`${speaker.label}:${speaker.name ?? ''}`} speaker={speaker} onRename={onRename} />
        ))}
      </div>
      <div className="tiny">Groups are based on local voice similarity. They do not identify real-world people.</div>
    </section>
  )
}

function SpeakerNameField({
  speaker,
  onRename
}: {
  speaker: import('@shared/types').Speaker
  onRename: (label: string, name: string) => void
}) {
  const fallback = displaySpeakerName(speaker)
  const [name, setName] = useState(speaker.name ?? fallback)
  useEffect(() => setName(speaker.name ?? fallback), [speaker.name, fallback])

  return (
    <label className="speaker-roster-item">
      <span className="speaker-color-dot" style={{ background: speaker.color ?? 'var(--accent)' }} />
      <input
        className="input"
        aria-label={`Display name for ${fallback}`}
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          const next = name.trim()
          if (next && next !== (speaker.name ?? fallback)) onRename(speaker.label, next)
          else if (!next) setName(speaker.name ?? fallback)
        }}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
    </label>
  )
}

function TranscriptRow({
  segment,
  query,
  active,
  onSeek,
  rowRef,
  speakers,
  onSpeakerChange
}: {
  segment: import('@shared/types').TranscriptSegment
  query: string
  active: boolean
  onSeek: (t: number) => void
  rowRef?: React.RefObject<HTMLDivElement | null>
  speakers: import('@shared/types').Speaker[]
  onSpeakerChange: (label: string | null) => void
}) {
  const [copied, setCopied] = useState(false)
  const text = segment.text
  const marked = query.trim()
    ? text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
      )
    : text
  const currentSpeaker = speakers.find((speaker) => speaker.label === segment.speaker)

  return (
    <div
      className={`transcript-row ${active ? 'active' : ''}`}
      ref={rowRef}
      onClick={() => onSeek(segment.startTime)}
      title="Play from this timestamp"
    >
      <span className="ts">
        <Play size={8} style={{ verticalAlign: 1, marginRight: 3, opacity: active ? 1 : 0.35 }} />
        {formatClock(segment.startTime)}
      </span>
      <span
        className="seg-text"
        onClick={async (e) => {
          if (window.getSelection()?.toString()) return
          e.stopPropagation()
          const ok = await copyText(`[${formatClock(segment.startTime)}] ${text}`)
          setCopied(ok)
          setTimeout(() => setCopied(false), 1200)
        }}
        title="Click line: play · click text: copy"
      >
        {copied ? <span style={{ color: 'var(--success)' }}>copied · </span> : null}
        {marked}
      </span>
      {speakers.length > 0 && (
        <select
          className="speaker-assignment-select"
          value={segment.speaker ?? ''}
          aria-label={`Speaker for transcript segment at ${formatClock(segment.startTime)}`}
          title="Correct this segment’s speaker assignment"
          style={{ borderColor: currentSpeaker?.color ?? undefined }}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onSpeakerChange(event.currentTarget.value || null)}
        >
          <option value="">Unassigned</option>
          {speakers.map((speaker) => (
            <option key={speaker.label} value={speaker.label}>{displaySpeakerName(speaker)}</option>
          ))}
        </select>
      )}
    </div>
  )
}
