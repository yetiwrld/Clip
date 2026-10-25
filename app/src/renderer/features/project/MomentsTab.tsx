import React, { useMemo, useState } from 'react'
import { BarChart3, Scissors, ThumbsDown, ChevronRight, ScanSearch, Cpu } from 'lucide-react'
import { api, errMessage } from '../../api/client'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { EmptyState, ErrorBox, ScoreValue, Spinner, scoreColor } from '../../components/ui'
import { plural, providerLabel } from '../../copy/labels'
import type { ClipCandidate, ScoreBreakdown } from '@shared/types'
import { formatClock } from '@shared/utils/time'

const DIMENSION_LABELS: Record<keyof ScoreBreakdown, string> = {
  hook: 'Hook strength',
  contextCompleteness: 'Context completeness',
  clarity: 'Clarity',
  retention: 'Retention potential',
  emotionalImpact: 'Emotional impact',
  standaloneValue: 'Standalone value',
  shareability: 'Shareability',
  visualSuitability: 'Visual suitability'
}

export function MomentsTab() {
  const app = useAppStore()
  const data = useDataStore()
  const project = data.activeProject!
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [retryProvider, setRetryProvider] = useState<'heuristic-local' | 'openai-compatible' | 'anthropic'>('heuristic-local')
  const [sectionTaskId, setSectionTaskId] = useState<string | null>(null)

  const analyzeTask = data.tasks.find((t) => t.type === 'analyze' && t.projectId === project.id && (t.state === 'running' || t.state === 'queued'))
  const analyzing = project.status === 'analyzing' || Boolean(analyzeTask)
  const trackedSectionTask = data.tasks.find((task) => task.id === sectionTaskId)
  const activeSectionTask = trackedSectionTask && (trackedSectionTask.state === 'running' || trackedSectionTask.state === 'queued')
    ? trackedSectionTask
    : data.tasks.find((task) => task.type === 'download' && task.projectId === project.id && task.stage === 'section-download' && (task.state === 'running' || task.state === 'queued'))

  const aiProvider = app.settings?.ai.activeProvider ?? 'none'
  const canUseAi = aiProvider === 'openai-compatible' || aiProvider === 'anthropic'

  const moments = useMemo(() => {
    const groups = new Map<string, ClipCandidate[]>()
    for (const c of data.candidates) {
      if (c.status === 'rejected') continue
      const list = groups.get(c.momentKey) ?? []
      list.push(c)
      groups.set(c.momentKey, list)
    }
    return [...groups.values()].map((list) => list.sort((a, b) => a.rankInMoment - b.rankInMoment))
  }, [data.candidates])

  async function analyze(providerId: 'heuristic-local' | 'openai-compatible' | 'anthropic') {
    // Duplicate-submission guard: refuse while an analyze task is already in flight
    if (data.tasks.some((t) => t.type === 'analyze' && t.projectId === project.id && (t.state === 'running' || t.state === 'queued'))) {
      app.toast({ level: 'warn', message: 'An analysis is already running.', hint: 'Wait for it to finish, or cancel it in the render queue.' })
      return
    }
    setError(null)
    setRetryProvider(providerId)
    setBusy(true)
    try {
      await api['analysis.start']({ projectId: project.id, providerId })
      app.toast({
        level: 'info',
        message: providerId === 'heuristic-local'
          ? 'Analysis started. The offline analyzer runs on this computer.'
          : `Analysis started with ${providerLabel(providerId)}.`,
        hint: providerId === 'heuristic-local' ? undefined : 'Transcript text is sent to that endpoint. Audio and video are never sent.'
      })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function createClip(candidate: ClipCandidate) {
    try {
      if (project.sourceMode === 'audio-first') {
        const { taskId } = await api['clips.fetchCandidateSection']({ candidateId: candidate.id })
        setSectionTaskId(taskId)
        await data.loadTasks(project.id)
        app.toast({
          level: 'info',
          message: 'Downloading only this moment’s video section.',
          hint: 'The rest of the video is not downloaded.'
        })
        return
      }
      const clip = await api['clips.createFromCandidate']({ candidateId: candidate.id })
      await data.loadClips(project.id)
      await data.loadCandidates(project.id)
      app.openEditor(clip.id, project.id)
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function cancelSectionDownload() {
    if (!activeSectionTask) return
    try {
      await api['tasks.cancel']({ id: activeSectionTask.id })
      setSectionTaskId(null)
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  async function reject(candidate: ClipCandidate) {
    try {
      await api['analysis.updateCandidate']({ id: candidate.id, patch: { status: 'rejected' } })
      await data.loadCandidates(project.id)
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  if (data.transcript.length === 0) {
    return (
      <div className="empty">
        <BarChart3 size={28} className="empty-icon" />
        <div className="empty-title">A transcript is needed first</div>
        <div className="empty-copy">
          Transcribe the {project.sourceMode === 'audio-first' ? 'downloaded audio' : 'video'} or import a transcript. The analyzer
          reads transcript text only, never the video.
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="toolbar plain">
        <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--text-1)' }}>{plural(moments.length, 'moment')}</strong>
          {data.candidates.filter((c) => c.status !== 'rejected').length > moments.length && (
            <span style={{ color: 'var(--text-3)' }}>
              {' '}· {plural(data.candidates.filter((c) => c.status !== 'rejected').length, 'variation')}
            </span>
          )}
        </span>
        {project.sourceMode === 'audio-first' && (
          <span className="tiny" title="Only the audio was downloaded. Video is fetched after you choose a moment.">
            Audio-only source · downloads selected sections
          </span>
        )}
        {activeSectionTask && (
          <span className="row" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)', gap: 'var(--space-3)' }}>
            <Spinner size={12} /> {activeSectionTask.message ?? 'Fetching selected video section'}
            {activeSectionTask.progress != null && ` · ${Math.round(activeSectionTask.progress * 100)}%`}
            <button className="btn danger sm" onClick={() => void cancelSectionDownload()}>Cancel download</button>
          </span>
        )}
        {analyzeTask?.message && (
          <span className="row" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)', gap: 'var(--space-3)' }}>
            <Spinner size={12} /> {analyzeTask.message} {analyzeTask.progress != null && `· ${Math.round(analyzeTask.progress * 100)}%`}
          </span>
        )}
        <span className="spacer" />
        <button className="btn" onClick={() => void analyze('heuristic-local')} disabled={analyzing || busy}>
          <Cpu size={14} /> Analyze offline
        </button>
        {canUseAi && (
          <button className="btn primary" onClick={() => void analyze(aiProvider)} disabled={analyzing || busy}>
            <ScanSearch size={14} /> Analyze with {aiProvider === 'anthropic' ? 'Anthropic' : 'your AI endpoint'}
          </button>
        )}
        {canUseAi && (
          <span className="tiny">Sends transcript text only, never the video.</span>
        )}
      </div>

      {error ? <ErrorBox error={error} onRetry={() => void analyze(retryProvider)} retryLabel={`Retry ${retryProvider === 'heuristic-local' ? 'local' : 'AI'} analysis`} /> : null}

      {moments.length === 0 && !analyzing ? (
        <div className="empty">
          <BarChart3 size={28} className="empty-icon" />
          <div className="empty-title">No moments yet</div>
          <div className="empty-copy">
            Run the analysis to find clip moments. The offline analyzer needs no provider set up. A configured AI provider gives
            stronger results.
          </div>
        </div>
      ) : (
        <div className="moment-list">
          {moments.map((list, i) => (
            <MomentRow
              key={list[0].momentKey}
              index={i}
              candidates={list}
              onCreate={(c) => void createClip(c)}
              createLabel={project.sourceMode === 'audio-first' ? 'Download section and create clip' : 'Create clip'}
              sectionBusy={Boolean(activeSectionTask)}
              onReject={(c) => void reject(c)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MomentRow({
  index,
  candidates,
  onCreate,
  onReject,
  createLabel,
  sectionBusy
}: {
  index: number
  candidates: ClipCandidate[]
  onCreate: (c: ClipCandidate) => void
  onReject: (c: ClipCandidate) => void
  createLabel: string
  sectionBusy: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [variationIdx, setVariationIdx] = useState(0)
  const candidate = candidates[variationIdx] ?? candidates[0]
  const isHeuristic = candidate.provider === 'heuristic-local'
  const existingClip = useDataStore((s) => s.clips.find((c) => c.candidateId === candidate.id))

  return (
    <div className="moment-row">
      <div
        className="moment-head"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded(!expanded)
          }
        }}
        aria-expanded={expanded}
      >
        <span className="moment-index">Clip {String(index + 1).padStart(2, '0')}</span>
        <span className="moment-timecodes">
          {formatClock(candidate.startTime)} — {formatClock(candidate.endTime)}
          <span style={{ color: 'var(--text-3)' }}> · {Math.round(candidate.endTime - candidate.startTime)}s</span>
        </span>
        <span className="moment-title" title={candidate.title}>{candidate.title}</span>
        <span className="moment-audit">
          <ScoreValue score={candidate.overallScore} label={`Overall estimate: ${candidate.overallScore ?? '–'}/100`} />
        </span>
        <ChevronRight size={14} className={`muted moment-chev${expanded ? ' open' : ''}`} />
      </div>

      {expanded && (
        <div className="moment-body">
          <div className="row wrap" style={{ gap: 'var(--space-3)' }}>
            <span className="chip">{candidate.clipType.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())}</span>
            <span className="tiny" title={isHeuristic ? 'Produced by the offline heuristic analyzer, not an AI model' : `Produced by ${candidate.provider}`}>
              Source: {providerLabel(candidate.provider)}
            </span>
            {candidate.status === 'converted' && <span className="chip success">Clip created</span>}
            <span style={{ flex: 1 }} />
            {candidates.length > 1 && (
              <span className="row" style={{ gap: 'var(--space-3)' }}>
                <span className="tiny">Versions</span>
                <span className="segmented">
                  {candidates.map((c, i) => (
                    <button
                      key={c.id}
                      className={i === variationIdx ? 'active' : ''}
                      onClick={() => setVariationIdx(i)}
                      title={`${Math.round(c.endTime - c.startTime)}s · score ${c.overallScore ?? '–'}/100`}
                    >
                      {i === 0 ? 'Best' : `Alt ${i}`}
                    </button>
                  ))}
                </span>
              </span>
            )}
          </div>

          {candidate.hook && (
            <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-2)' }}>
              <span className="audit-label" style={{ marginRight: 'var(--space-3)' }}>Hook</span>
              <em>“{candidate.hook}”</em>
            </div>
          )}

          <div className="tiny" style={{ color: 'var(--text-2)', lineHeight: 1.55 }}>
            {candidate.reason}
          </div>

          {candidate.scores && (
            <ScoreBreakdownView scores={candidate.scores} explanation={candidate.scoreExplanation} provider={candidate.provider} />
          )}

          <div className="excerpt">
            “{candidate.transcriptExcerpt.slice(0, 460)}
            {candidate.transcriptExcerpt.length > 460 ? '…' : ''}”
          </div>

          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <button className="btn primary sm" onClick={() => onCreate(candidate)} disabled={existingClip != null || sectionBusy}>
              {sectionBusy ? <Spinner size={12} /> : <Scissors size={12} />} {existingClip ? 'Clip created' : createLabel}
            </button>
            {existingClip && (
              <button className="btn sm" onClick={() => useAppStore.getState().openEditor(existingClip.id, existingClip.projectId)}>
                Open in editor
              </button>
            )}
            <button className="btn ghost sm" onClick={() => onReject(candidate)} title="Reject this moment. It is hidden from the list but kept in the project.">
              <ThumbsDown size={12} /> Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ScoreBreakdownView({ scores, explanation, provider }: { scores: ScoreBreakdown; explanation: string | null; provider: string }) {
  return (
    <div className="stack sm">
      {(Object.keys(DIMENSION_LABELS) as Array<keyof ScoreBreakdown>).map((key) => (
        <div className="bar-row" key={key}>
          <span className="bar-label">{DIMENSION_LABELS[key]}</span>
          <div className="score-bar-track">
            <div className="score-bar-fill" style={{ width: `${scores[key]}%`, background: scoreColor(scores[key]) }} />
          </div>
          <span className="bar-value">{scores[key]}</span>
        </div>
      ))}
      {explanation && (
        <div className="tiny" style={{ lineHeight: 1.55, color: 'var(--text-2)', marginTop: 'var(--space-2)' }}>
          <strong>Why this score</strong> — {explanation}
        </div>
      )}
      <div className="tiny" style={{ color: 'var(--text-3)' }}>
        Performance Audit — estimated by <strong>{providerLabel(provider)}</strong> from transcript content. It is not a
        prediction of views.
      </div>
    </div>
  )
}
