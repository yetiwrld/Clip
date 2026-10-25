import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX, SkipBack, Type, Crop, Tags, Copy,
  ChevronRight, Scissors, Wand2, Save, Undo2, Redo2, AlertTriangle, ShieldCheck,
  Gauge, Film, AudioLines, Eraser, RotateCcw, Zap, Target, X, Trash2, Star, Headphones,
  Library, Music2, Captions, Sparkles, MoveVertical, Maximize2, Search, Hand, MousePointer2, ZoomIn, ZoomOut, SlidersHorizontal, Upload, X as CloseIcon
} from 'lucide-react'
import { api, errMessage, mediaUrl, copyText } from '../../api/client'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { ErrorBox, Field, Spinner, Switch } from '../../components/ui'
import { buildCues, cueAt } from '@shared/captions/segmentation'
import { AUDIO_RESTORATION_PRESETS } from '@shared/audio/restoration'
import { applyTrackingToCrop, cameraStateAt, computeCameraCrop, computeCrop } from '@shared/video/crop'
import { keptSegments, keptDuration } from '@shared/video/segments'
import { effectiveItemSpeed, sourceTimeAtTimelineTime, timelineItemDuration, timelineItemEnd, timelineOverlayGeometry } from '@shared/video/time-map'
import { frameDuration, frameTimeTolerance } from '@shared/video/frame-rate'
import { clampTimelineHeight, initialTimelineHeight } from '@shared/editor/timeline-editing'
import { emptyTimelineCommandHistory, executeClipCommand, executeTimelineCommand, recordTimelineCommand, redoTimelineCommand, undoTimelineCommand, type ClipEditCommand, type TimelineCommandHistory } from '@shared/editor/timeline-commands'
import { textLayerAppearanceAt, textLayerStateAt } from '@shared/video/textLayers'
import {
  ASPECT_RATIOS, CAPTION_FONTS, CAPTION_STYLES, RESOLUTION_PRESETS, QUALITY_PRESETS, estimateRenderSizeMb,
  getCaptionStyle, getDurationRange, getPlatformPreset, PLATFORM_PRESETS, resolutionFor
} from '@shared/constants'
import type { CameraKeyframe, CaptionOverrides, Clip, ClipCandidate, ClipTimeline, ProjectAsset, TextLayer, TextLayerKeyframe, TimelineItem, TimelineTrack, TranscriptSegment } from '@shared/types'
import { formatClock } from '@shared/utils/time'
import { CaptionPreview } from './CaptionPreview'
import { MediaLibrary } from './MediaLibrary'
import { MultiTrackTimeline, TimelineInspector } from './MultiTrackTimeline'

/**
 * Clip editor — professional workspace layout:
 * top bar (identity + undo/redo + render) / stage + inspector / timeline + transport.
 * Playback has explicit error states with a real FFmpeg proxy workflow (§4-8),
 * JKL + frame-accurate shortcuts (§9-10), silence-cut preview skipping (§40),
 * and per-clip output settings (§49-56).
 */

type PlaybackStatus = {
  verdict: 'native' | 'proxy' | 'audio-only'
  reason: string
  proxyExists: boolean
  proxyPath: string | null
} | null

const SNAPSHOT_EXCLUDE = new Set(['id', 'projectId', 'candidateId', 'status', 'createdAt', 'updatedAt'])
type ClipSnapshot = Partial<Clip>

type SourceRect = { x: number; y: number; w: number; h: number }

function sourceDisplayTransform(sourceW: number, sourceH: number, frameW: number, frameH: number) {
  const scale = Math.min(frameW / sourceW, frameH / sourceH)
  const width = sourceW * scale
  const height = sourceH * scale
  return { scale, left: (frameW - width) / 2, top: (frameH - height) / 2, width, height }
}

export function EditorPage() {
  const app = useAppStore()
  const data = useDataStore()
  const clipId = app.editorClipId
  const projectId = app.projectId
  const activeClipIdRef = useRef<string | null>(clipId)
  activeClipIdRef.current = clipId

  const [activeTool, setActiveTool] = useState<'media' | 'audio' | 'moments' | 'camera' | 'clip'>('media')
  const [previewTool, setPreviewTool] = useState<'select' | 'hand'>('select')
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<TimelineItem | null>(null)
  const [sourceClipSelected, setSourceClipSelected] = useState(false)
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null)
  const [timelineHeight, setTimelineHeight] = useState(() => {
    const stored = Number(localStorage.getItem('clipwright.editor.timelineHeight'))
    return initialTimelineHeight(window.innerHeight, stored)
  })
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const inspectorToggleRef = useRef<HTMLButtonElement>(null)
  const inspectorCloseRef = useRef<HTMLButtonElement>(null)
  const timelineResizeCleanup = useRef<(() => void) | null>(null)

  const [clip, setClip] = useState<Clip | null>(null)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [error, setError] = useState<unknown>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved')
  const [renderQueued, setRenderQueued] = useState(false)
  const [previewQueued, setPreviewQueued] = useState(false)
  const [selectedSilenceIndex, setSelectedSilenceIndex] = useState<number | null>(null)
  const [selectedCueKey, setSelectedCueKey] = useState<string | null>(null)
  const [selectingSubject, setSelectingSubject] = useState(false)
  const [subjectSelection, setSubjectSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [subjectDragStart, setSubjectDragStart] = useState<{ x: number; y: number } | null>(null)
  const [trackingBusy, setTrackingBusy] = useState(false)
  const [cameraEditing, setCameraEditing] = useState(false)
  const [baseCropEditing, setBaseCropEditing] = useState(false)
  const [showSafeAreaGuides, setShowSafeAreaGuides] = useState(false)
  const [selectedCameraKeyframeTime, setSelectedCameraKeyframeTime] = useState<number | null>(null)
  const [selectedTextLayerId, setSelectedTextLayerId] = useState<string | null>(null)

  // playback compatibility + proxy workflow
  const [playback, setPlayback] = useState<PlaybackStatus>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [proxyRunning, setProxyRunning] = useState(false)

  // timeline visuals (real, FFmpeg-generated)
  const [filmstrip, setFilmstrip] = useState<Array<{ t: number; path: string }> | null>(null)
  const [waveform, setWaveform] = useState<{ peaks: number[]; duration: number } | null>(null)
  const [assetWaveforms, setAssetWaveforms] = useState<Record<string, { peaks: number[]; duration: number }>>({})
  const waveformLoading = useRef(new Set<string>())
  const [clipTimeline, setClipTimeline] = useState<ClipTimeline>({ tracks: [], items: [], snapEnabled: true })
  const clipTimelineRef = useRef(clipTimeline)
  const [assetImporting, setAssetImporting] = useState(false)
  const pendingAssetDrop = useRef<{ taskId: string; existing: Set<string>; time: number; track: TimelineTrack } | null>(null)
  const handlingAssetDrop = useRef(false)
  const timelineSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTimelineClipId = useRef<string | null>(null)
  const timelineSaveQueue = useRef<Promise<void>>(Promise.resolve())
  const timelineSaveNowRef = useRef<(timeline: ClipTimeline, targetClipId?: string | null) => Promise<boolean>>(async () => false)
  const timelineHistoryRef = useRef<TimelineCommandHistory>(emptyTimelineCommandHistory())

  const videoRef = useRef<HTMLVideoElement>(null)
  const timelineMediaRefs = useRef(new Map<string, HTMLMediaElement>())
  const cropDragRef = useRef<{ pointerId: number; startX: number; startY: number; startCropX: number; startCropY: number; scaleX: number; scaleY: number; maxShiftX: number; maxShiftY: number; fit: boolean; fitDirectionX: number; fitDirectionY: number } | null>(null)
  const cameraDragRef = useRef<{ pointerId: number; startX: number; startY: number; keyframe: CameraKeyframe; crop: { w: number; h: number; x: number; y: number }; sourceMap: { width: number; height: number }; resizeHandle: string | null; mode: 'camera' | 'base' } | null>(null)
  const cameraClipboardRef = useRef<Pick<CameraKeyframe, 'x' | 'y' | 'scale' | 'rotation' | 'easing'> | null>(null)
  const [hasCameraClipboard, setHasCameraClipboard] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Edits made inside one debounce window are merged per clip before the
  // write. Keeping the target id alongside each patch prevents a fast clip
  // switch from applying the previous clip's pending edit to the next clip.
  const pendingClipPatches = useRef(new Map<string, Partial<Clip>>())
  const saveNowRef = useRef<(patch: Partial<Clip>, targetClipId?: string | null) => Promise<boolean>>(async () => false)
  const clipSaveQueue = useRef<Promise<void>>(Promise.resolve())
  const loadedRef = useRef<string | null>(null)
  const clipRef = useRef<Clip | null>(null)
  const historyRef = useRef<{ past: ClipSnapshot[]; future: ClipSnapshot[]; lastPush: number }>({
    past: [], future: [], lastPush: 0
  })
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const silencePreviewRef = useRef<{ end: number } | null>(null)

  useEffect(() => {
    clipRef.current = clip
  }, [clip])

  useEffect(() => {
    if (!inspectorOpen) return
    inspectorCloseRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setInspectorOpen(false)
      inspectorToggleRef.current?.focus()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [inspectorOpen])

  // ---------------------------------------------------------------- load ---
  useEffect(() => {
    if (!clipId || !projectId) {
      app.navigate('dashboard')
      return
    }
    if (loadedRef.current === clipId) return
    loadedRef.current = clipId
    setError(null)
    clipRef.current = null
    setClip(null)
    clipTimelineRef.current = { tracks: [], items: [], snapEnabled: true }
    setClipTimeline(clipTimelineRef.current)
    void (async () => {
      try {
        const document = await api['projects.document']({ id: projectId })
        if (loadedRef.current !== clipId) return
        const projectClip = document.clips.find((entry) => entry.clip.id === clipId)
        if (!projectClip) throw new Error('This clip no longer exists in this project.')
        const found = projectClip.clip
        const savedTimeline = projectClip.timeline
        clipRef.current = found
        setClip(found)
        setSelectedSilenceIndex(null)
        setSelectedCueKey(null)
        setSelectingSubject(false)
        setSubjectSelection(null)
        setCameraEditing(false)
        setBaseCropEditing(false)
        setSelectedCameraKeyframeTime(null)
        setSelectedTextLayerId(null)
        setSelectedTimelineItem(null)
        setSourceClipSelected(false)
        setSegments(document.transcript)
        const initialTracks: TimelineTrack[] = [
          { id: crypto.randomUUID(), name: 'Video 2', type: 'video', order: 0, muted: false, hidden: false, locked: false },
          { id: crypto.randomUUID(), name: 'Graphics', type: 'image', order: 1, muted: false, hidden: false, locked: false },
          { id: crypto.randomUUID(), name: 'Audio 1', type: 'audio', order: 2, muted: false, hidden: false, locked: false }
        ]
        const restoredTimeline = savedTimeline.tracks.length ? savedTimeline : { ...savedTimeline, tracks: initialTracks }
        clipTimelineRef.current = restoredTimeline
        setClipTimeline(restoredTimeline)
        timelineHistoryRef.current = emptyTimelineCommandHistory()
        if (!savedTimeline.tracks.length) void api['timeline.save']({ clipId, timeline: restoredTimeline })
        setCurrentTime(found.startTime)
        historyRef.current = { past: [], future: [], lastPush: 0 }
      } catch (err) {
        if (loadedRef.current === clipId) setError(err)
      }
    })()
    // Playback compatibility (§4-7): decide direct vs proxy before playback.
    void api['media.checkPlayback']({ projectId }).then((status) => {
      setPlayback(status)
      if (status.verdict === 'proxy' && !status.proxyExists) void createProxy()
    }).catch(() => setPlayback(null))
    // Timeline visuals — real FFmpeg output, loaded in the background.
    void api['media.filmstrip']({ projectId, count: 24 })
      .then((r) => setFilmstrip(r.frames))
      .catch(() => setFilmstrip(null))
    void api['media.waveform']({ projectId })
      .then((r) => (r.silent || r.peaks.length === 0 ? setWaveform(null) : setWaveform({ peaks: r.peaks, duration: r.duration })))
      .catch(() => setWaveform(null))
    void data.loadAssets(projectId)
    void data.loadCandidates(projectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, projectId])

  const assetImportTask = data.tasks.find((task) => task.type === 'asset-import' && task.projectId === projectId && ['queued', 'running'].includes(task.state))
  useEffect(() => {
    if (!projectId) return
    const pending = pendingAssetDrop.current
    if (!pending || handlingAssetDrop.current) return
    const task = data.tasks.find((item) => item.id === pending.taskId)
    if (!task || !['completed', 'failed', 'cancelled'].includes(task.state)) return
    if (task.state !== 'completed') { pendingAssetDrop.current = null; setAssetImporting(false); return }
    handlingAssetDrop.current = true
    void data.loadAssets(projectId).then(() => {
      const newAssets = useDataStore.getState().assets.filter((asset) => !pending.existing.has(asset.id))
      let next = clipTimelineRef.current
      for (const asset of newAssets) {
        let track = next.tracks.find((candidate) => candidate.type === asset.mediaType && candidate.id === pending.track.id)
          ?? next.tracks.find((candidate) => candidate.type === asset.mediaType)
        if (!track) {
          track = { id: crypto.randomUUID(), name: asset.mediaType === 'audio' ? `Audio ${next.tracks.filter((t) => t.type === 'audio').length + 1}` : asset.mediaType === 'image' ? 'Graphics' : `Video ${next.tracks.filter((t) => t.type === 'video').length + 2}`, type: asset.mediaType, order: next.tracks.length, muted: false, hidden: false, locked: false }
          next = { ...next, tracks: [...next.tracks, track] }
        }
        const assetDuration = asset.duration ?? 5
        const item: TimelineItem = { id: crypto.randomUUID(), assetId: asset.id, trackId: track.id, startTime: pending.time, sourceIn: 0, sourceOut: assetDuration, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }
        next = { ...next, items: [...next.items, item] }
      }
      if (newAssets.length) scheduleTimelineSave(next)
      pendingAssetDrop.current = null
      setAssetImporting(false)
      handlingAssetDrop.current = false
    }).catch(() => { handlingAssetDrop.current = false; pendingAssetDrop.current = null; setAssetImporting(false) })
  }, [data.tasks, data.assets, projectId])

  useEffect(() => {
    if (!assetImportTask && assetImporting && !pendingAssetDrop.current) setAssetImporting(false)
  }, [assetImportTask, assetImporting])

  function scheduleTimelineSave(next: ClipTimeline) {
    const targetClipId = activeClipIdRef.current
    if (!targetClipId) return
    const now = Date.now()
    const command = { type: 'timeline.replace' as const, timeline: next, issuedAt: now }
    const before = clipTimelineRef.current
    const executed = executeTimelineCommand(before, command)
    timelineHistoryRef.current = recordTimelineCommand(timelineHistoryRef.current, before, executed, now)
    clipTimelineRef.current = executed
    pendingTimelineClipId.current = targetClipId
    setClipTimeline(executed)
    if (timelineSaveTimer.current) clearTimeout(timelineSaveTimer.current)
    timelineSaveTimer.current = setTimeout(() => {
      timelineSaveTimer.current = null
      void flushSavesRef.current.timeline()
    }, 450)
  }
  function saveTimelineImmediately(next: ClipTimeline) {
    if (timelineSaveTimer.current) clearTimeout(timelineSaveTimer.current)
    timelineSaveTimer.current = null
    pendingTimelineClipId.current = activeClipIdRef.current
    void flushSavesRef.current.timeline()
  }
  function undoTimeline() {
    const result = undoTimelineCommand(timelineHistoryRef.current)
    if (!result.timeline) return
    timelineHistoryRef.current = result.history
    clipTimelineRef.current = result.timeline
    setClipTimeline(result.timeline)
    saveTimelineImmediately(result.timeline)
  }
  function redoTimeline() {
    const result = redoTimelineCommand(timelineHistoryRef.current)
    if (!result.timeline) return
    timelineHistoryRef.current = result.history
    clipTimelineRef.current = result.timeline
    setClipTimeline(result.timeline)
    saveTimelineImmediately(result.timeline)
  }
  async function saveTimelineNow(next: ClipTimeline, targetClipId: string | null = activeClipIdRef.current): Promise<boolean> {
    if (!targetClipId) return false
    let saved = false
    const write = timelineSaveQueue.current.catch(() => undefined).then(async () => {
      try {
        await api['timeline.save']({ clipId: targetClipId, timeline: next })
        saved = true
      } catch (err) {
        app.toast({ level: 'error', ...errMessage(err) })
      }
    })
    timelineSaveQueue.current = write
    await write
    return saved
  }
  timelineSaveNowRef.current = saveTimelineNow
  async function importAssets(filePaths?: string[], placement?: { time: number; track: TimelineTrack }) {
    if (!projectId) return
    if (assetImporting) return
    const selectedPaths = filePaths ?? (await api['media.assets.pickFiles']()).filePaths
    if (!selectedPaths.length) return
    setAssetImporting(true)
    try {
      const { taskId } = await api['media.assets.import']({ projectId, filePaths: selectedPaths })
      if (placement) pendingAssetDrop.current = { taskId, existing: new Set(data.assets.map((asset) => asset.id)), ...placement }
      app.toast({ level: 'info', message: `Importing ${selectedPaths.length} media file${selectedPaths.length === 1 ? '' : 's'} into the project.` })
    } catch (err) { setAssetImporting(false); app.toast({ level: 'error', ...errMessage(err) }) }
  }
  async function renameAsset(asset: ProjectAsset) {
    if (!projectId) return
    const name = window.prompt('Asset name', asset.name)
    if (!name?.trim()) return
    try { await api['media.assets.rename']({ assetId: asset.id, name: name.trim() }); await data.loadAssets(projectId) }
    catch (err) { app.toast({ level: 'error', ...errMessage(err) }) }
  }
  async function removeAsset(asset: ProjectAsset) {
    if (!projectId) return
    if (!window.confirm(`Remove “${asset.name}” from this project? Your original file will not be affected.`)) return
    try { await api['media.assets.remove']({ assetId: asset.id }); await data.loadAssets(projectId) }
    catch (err) { app.toast({ level: 'error', ...errMessage(err) }) }
  }
  async function relinkAsset(asset: ProjectAsset) {
    if (!projectId) return
    try { await api['media.assets.relink']({ assetId: asset.id }); await data.loadAssets(projectId) }
    catch (err) { app.toast({ level: 'error', ...errMessage(err) }) }
  }

  // ------------------------------------------------------------- autosave ---
  const snapshotOf = (c: Clip): ClipSnapshot => {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(c) as Array<keyof Clip>) {
      if (!SNAPSHOT_EXCLUDE.has(key)) out[key] = c[key]
    }
    return out as ClipSnapshot
  }

  const pushHistory = useCallback(() => {
    const prev = clipRef.current
    if (!prev) return
    const h = historyRef.current
    const now = Date.now()
    if (now - h.lastPush > 900 || h.past.length === 0) {
      h.past.push(snapshotOf(prev))
      if (h.past.length > 50) h.past.shift()
    }
    h.future = []
    h.lastPush = now
    setHistoryState({ canUndo: h.past.length > 0, canRedo: false })
  }, [clipId, projectId])

  const dispatchClipCommand = useCallback((command: ClipEditCommand) => {
    const current = clipRef.current
    if (!current) return
    const next = executeClipCommand(current, command)
    clipRef.current = next
    setClip(next)
  }, [])

  // Cancels the pending debounce and writes whatever is still unwritten.
  // Both helpers are reached through `flushSavesRef` from timers/listeners so
  // they always run with the current render's `saveNow`/`saveTimelineNow`
  // (a stale closure would write to the previously opened clip).
  async function flushClipPatch(): Promise<boolean> {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    const pending = [...pendingClipPatches.current.entries()]
    if (!pending.length) return true
    let allSaved = true
    for (const [targetClipId, patch] of pending) {
      pendingClipPatches.current.delete(targetClipId)
      const saved = await saveNowRef.current(patch, targetClipId)
      if (!saved) {
        // Preserve the failed write for the next explicit save/render attempt;
        // newer edits win if they arrived while the request was in flight.
        pendingClipPatches.current.set(targetClipId, {
          ...patch,
          ...(pendingClipPatches.current.get(targetClipId) ?? {})
        })
        allSaved = false
      }
    }
    return allSaved
  }
  async function flushTimelineSave(force = false): Promise<boolean> {
    if (timelineSaveTimer.current) { clearTimeout(timelineSaveTimer.current); timelineSaveTimer.current = null }
    const targetClipId = pendingTimelineClipId.current ?? activeClipIdRef.current
    const shouldSave = force || pendingTimelineClipId.current !== null
    if (!shouldSave || !targetClipId) return true
    const timeline = clipTimelineRef.current
    pendingTimelineClipId.current = null
    const saved = await timelineSaveNowRef.current(timeline, targetClipId)
    if (!saved && pendingTimelineClipId.current === null) pendingTimelineClipId.current = targetClipId
    return saved
  }
  const flushSavesRef = useRef({ clip: flushClipPatch, timeline: flushTimelineSave })
  flushSavesRef.current = { clip: flushClipPatch, timeline: flushTimelineSave }

  const updateClip = useCallback((patch: Partial<Clip>, immediate = false, history = true) => {
    if (history) pushHistory()
    dispatchClipCommand({ type: 'clip.patch', patch, issuedAt: Date.now() })
    setSaveState('dirty')
    const targetClipId = activeClipIdRef.current
    if (targetClipId) {
      const pending = pendingClipPatches.current.get(targetClipId) ?? {}
      pendingClipPatches.current.set(targetClipId, { ...pending, ...patch })
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(
      () => void flushSavesRef.current.clip(),
      immediate ? 0 : 700
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchClipCommand, pushHistory])

  // Leaving the editor (back to the project, another clip, closing the window)
  // must not drop edits that are still inside the debounce window.
  useEffect(() => {
    const flush = () => {
      void flushSavesRef.current.clip()
      void flushSavesRef.current.timeline()
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
  }, [clipId])

  // Keep additional video/audio source elements locked to the source-time
  // playhead. Only the selected clip instances participate in playback.
  useEffect(() => {
    const assets = new Map(data.assets.map((asset) => [asset.id, asset]))
    const tracks = new Map(clipTimeline.tracks.map((track) => [track.id, track]))
    const active = new Set<string>()
    for (const item of clipTimeline.items) {
      const asset = assets.get(item.assetId)
      const track = tracks.get(item.trackId)
      const media = timelineMediaRefs.current.get(item.id)
      if (!media || !asset || asset.mediaType === 'image' || !track) continue
      const duration = timelineItemDuration(item)
      const targetTime = track.hidden ? null : sourceTimeAtTimelineTime(item, currentTime)
      if (targetTime === null) { media.pause(); continue }
      active.add(item.id)
      if (Math.abs(media.currentTime - targetTime) > 0.18) {
        try { media.currentTime = Math.min(targetTime, Math.max(0, (asset.duration ?? targetTime) - 0.03)) } catch { /* wait for metadata */ }
      }
      // Keep layers locked to the source video's current rate (including J/L
      // preview scrubbing) while preserving each item's own speed adjustment.
      media.playbackRate = effectiveItemSpeed(item.speed) * (videoRef.current?.playbackRate ?? 1)
      const elapsed = item.loop && duration > 0 ? (currentTime - item.startTime) % duration : currentTime - item.startTime
      const fade = Math.min(item.fadeIn > 0 ? elapsed / item.fadeIn : 1, item.fadeOut > 0 ? (duration - elapsed) / item.fadeOut : 1)
      media.volume = Math.max(0, Math.min(1, item.volume * fade))
      media.muted = muted || item.muted || track.muted
      if (playing) void media.play().catch(() => undefined)
      else media.pause()
    }
    for (const [id, media] of timelineMediaRefs.current) if (!active.has(id)) media.pause()
  }, [clipTimeline, data.assets, currentTime, playing, muted])

  useEffect(() => {
    const audioIds = [...new Set(activeTool === 'audio'
      ? data.assets.filter((asset) => asset.mediaType === 'audio').map((asset) => asset.id)
      : clipTimeline.items.filter((item) => data.assets.find((asset) => asset.id === item.assetId)?.mediaType === 'audio').map((item) => item.assetId))]
    for (const assetId of audioIds) {
      if (assetWaveforms[assetId] || waveformLoading.current.has(assetId)) continue
      waveformLoading.current.add(assetId)
      void api['media.assets.waveform']({ assetId, buckets: 1600 }).then((result) => {
        if (!result.silent) setAssetWaveforms((current) => ({ ...current, [assetId]: { peaks: result.peaks, duration: result.duration } }))
      }).catch(() => undefined).finally(() => waveformLoading.current.delete(assetId))
    }
  }, [clipTimeline.items, data.assets, assetWaveforms, activeTool])

  async function saveNow(patch: Partial<Clip>, targetClipId: string | null = activeClipIdRef.current): Promise<boolean> {
    if (!targetClipId) return false
    let savedOk = false
    const write = clipSaveQueue.current.catch(() => undefined).then(async () => {
      if (activeClipIdRef.current === targetClipId) setSaveState('saving')
      try {
        const saved = await api['clips.update']({ id: targetClipId, patch: patch as Record<string, unknown> })
        if (activeClipIdRef.current === targetClipId) {
          const next = { ...(clipRef.current ?? saved), ...saved }
          clipRef.current = next
          setClip(next)
          setSaveState(pendingClipPatches.current.has(targetClipId) ? 'dirty' : 'saved')
        }
        void data.loadClips(saved.projectId)
        savedOk = true
      } catch (err) {
        if (activeClipIdRef.current === targetClipId) setSaveState('dirty')
        app.toast({ level: 'error', ...errMessage(err) })
      }
    })
    clipSaveQueue.current = write
    await write
    return savedOk
  }
  saveNowRef.current = saveNow

  // ------------------------------------------------------------ undo/redo ---
  const undo = useCallback(() => {
    const h = historyRef.current
    const prevSnap = h.past.pop()
    const cur = clipRef.current
    if (!prevSnap || !cur) return
    h.future.push(snapshotOf(cur))
    h.lastPush = 0
    setHistoryState({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 })
    dispatchClipCommand({ type: 'clip.restore', snapshot: prevSnap, issuedAt: Date.now() })
    setSaveState('dirty')
    // The restore supersedes pending patches for this clip, but not edits
    // queued for another clip during a rapid navigation.
    const targetClipId = activeClipIdRef.current
    if (targetClipId) pendingClipPatches.current.set(targetClipId, prevSnap)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flushSavesRef.current.clip(), 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchClipCommand])

  const redo = useCallback(() => {
    const h = historyRef.current
    const nextSnap = h.future.pop()
    const cur = clipRef.current
    if (!nextSnap || !cur) return
    h.past.push(snapshotOf(cur))
    h.lastPush = 0
    setHistoryState({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 })
    dispatchClipCommand({ type: 'clip.restore', snapshot: nextSnap, issuedAt: Date.now() })
    setSaveState('dirty')
    const targetClipId = activeClipIdRef.current
    if (targetClipId) pendingClipPatches.current.set(targetClipId, nextSnap)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flushSavesRef.current.clip(), 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchClipCommand])

  // ------------------------------------------------------------- playback ---
  useEffect(() => {
    const id = setInterval(() => {
      const video = videoRef.current
      // Before metadata loads Chromium reports 0 even when the editor has
      // already restored the playhead to the clip's in-point.
      if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA) setCurrentTime(video.currentTime)
    }, 120)
    return () => clearInterval(id)
  }, [])

  const useProxySrc = Boolean(playback?.proxyExists)
  const getPlaybackTime = useCallback(() => videoRef.current?.currentTime ?? 0, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v || !clip) return
    if (v.paused) {
      if (currentTime < clip.startTime || currentTime > clip.endTime) {
        v.currentTime = clip.startTime
        setCurrentTime(clip.startTime)
      }
      void v.play()
    } else {
      v.pause()
    }
  }, [clip, currentTime])

  /** J = rewind (Chromium can't play backwards; we step back at speed). */
  const rewind = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    const step = 0.34
    v.currentTime = Math.max(0, v.currentTime - step)
    setCurrentTime(v.currentTime)
  }, [])

  /** L = play; repeated presses speed up (1× → 1.5× → 2×). */
  const playForward = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.playbackRate = 1
      void v.play()
    } else if (v.playbackRate < 2) {
      v.playbackRate = v.playbackRate === 1 ? 1.5 : 2
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setPlaying(true)
    const onPause = () => {
      setPlaying(false)
      setCurrentTime(v.currentTime)
      v.playbackRate = 1
    }
    const onRate = () => {
      if (v.playbackRate === 1) return
    }
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ratechange', onRate)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ratechange', onRate)
    }
  }, [clip, useProxySrc])

  /** Seek that respects silence cuts: landing inside a removed range jumps to
   *  its start boundary, exactly like the rendered output behaves (§40). */
  const seekTo = useCallback((t: number) => {
    const v = videoRef.current
    const c = clipRef.current
    if (!v) return
    let target = t
    if (c) {
      const cut = (c.silenceCuts ?? []).find((x) => x.status !== 'kept' && t > x.start + 0.02 && t < x.end - 0.02)
      if (cut) target = cut.start
    }
    v.currentTime = Math.max(0, target)
    setCurrentTime(v.currentTime)
  }, [])

  // Preview during playback: skip removed silence, loop within the clip range.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !clip) return
    const onTime = () => {
      const silencePreview = silencePreviewRef.current
      if (silencePreview) {
        if (v.currentTime < silencePreview.end) return
        silencePreviewRef.current = null
        v.pause()
        return
      }
      const cuts = clip.silenceCuts ?? []
      const inCut = cuts.find((c) => c.status !== 'kept' && v.currentTime >= c.start && v.currentTime < c.end && c.end <= clip.endTime)
      if (inCut) {
        v.currentTime = inCut.end
        return
      }
      if (v.currentTime > clip.endTime) {
        if (playing) {
          v.currentTime = clip.startTime
        } else {
          v.pause()
        }
      }
    }
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [clip, playing])

  const previewSilenceRange = useCallback((from: number, to: number) => {
    const video = videoRef.current
    if (!video) return
    const start = Math.max(clipRef.current?.startTime ?? 0, from)
    const end = Math.min(clipRef.current?.endTime ?? to, Math.max(start + 0.15, to))
    silencePreviewRef.current = { end }
    video.pause()
    video.currentTime = start
    setCurrentTime(start)
    void video.play().catch(() => { silencePreviewRef.current = null })
  }, [])

  function sourcePoint(e: React.PointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null
    const rect = e.currentTarget.getBoundingClientRect()
    const map = sourceDisplayTransform(video.videoWidth, video.videoHeight, rect.width, rect.height)
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left - map.left) / map.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top - map.top) / map.height))
    }
  }

  function beginSubjectSelection() {
    videoRef.current?.pause()
    setBaseCropEditing(false)
    setCameraEditing(false)
    setSubjectSelection(null)
    setSubjectDragStart(null)
    setSelectingSubject(true)
  }

  function onSubjectPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!selectingSubject) return
    const point = sourcePoint(e)
    if (!point) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSubjectDragStart(point)
    setSubjectSelection({ x: point.x, y: point.y, w: 0, h: 0 })
  }

  function onSubjectPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!selectingSubject || !subjectDragStart) return
    const point = sourcePoint(e)
    if (!point) return
    setSubjectSelection({
      x: Math.min(subjectDragStart.x, point.x),
      y: Math.min(subjectDragStart.y, point.y),
      w: Math.abs(point.x - subjectDragStart.x),
      h: Math.abs(point.y - subjectDragStart.y)
    })
  }

  function onSubjectPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!selectingSubject || !subjectDragStart) return
    const point = sourcePoint(e)
    if (point) {
      let x = Math.min(subjectDragStart.x, point.x)
      let y = Math.min(subjectDragStart.y, point.y)
      let w = Math.abs(point.x - subjectDragStart.x)
      let h = Math.abs(point.y - subjectDragStart.y)
      // A short click is a face/object pick; a drag defines a tighter template.
      if (w < 0.025 || h < 0.025) {
        w = Math.min(0.12, 1 - x, subjectDragStart.x + 0.06)
        h = Math.min(0.14, 1 - y, subjectDragStart.y + 0.07)
        x = Math.max(0, Math.min(1 - w, subjectDragStart.x - w / 2))
        y = Math.max(0, Math.min(1 - h, subjectDragStart.y - h / 2))
      }
      setSubjectSelection({ x, y, w, h })
    }
    setSubjectDragStart(null)
  }

  function onCropPointerDown(e: React.PointerEvent<HTMLVideoElement>) {
    if (previewTool !== 'hand' || !clip || selectingSubject || subjectSelection || cameraEditing || baseCropEditing || !crop || !project?.width || !project?.height) return
    const frameElement = e.currentTarget.closest('.editor-frame')
    if (!(frameElement instanceof HTMLElement)) return
    const frameRect = frameElement.getBoundingClientRect()
    const fit = clip.fitMode === 'fit'
    const sourceAspect = project.width / project.height
    const frameAspect = target.w / target.h
    const fitWidth = Math.min(1, sourceAspect / frameAspect) * clip.zoom
    const fitHeight = Math.min(1, frameAspect / sourceAspect) * clip.zoom
    const maxShiftX = fit ? Math.abs(1 - fitWidth) * frameRect.width : project.width - crop.w
    const maxShiftY = fit ? Math.abs(1 - fitHeight) * frameRect.height : project.height - crop.h
    if (maxShiftX <= 0 && maxShiftY <= 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    if (fit) e.currentTarget.style.cursor = 'grabbing'
    pushHistory()
    if (!fit && clip.cropMode !== 'manual') updateClip({ cropMode: 'manual', fitMode: 'fill' }, false, false)
    cropDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startCropX: clip.cropX,
      startCropY: clip.cropY ?? clip.cropX,
      scaleX: fit ? maxShiftX : frameRect.width / crop.w,
      scaleY: fit ? maxShiftY : frameRect.height / crop.h,
      maxShiftX,
      maxShiftY,
      fit,
      fitDirectionX: Math.sign(1 - fitWidth),
      fitDirectionY: Math.sign(1 - fitHeight)
    }
  }

  function onCropPointerMove(e: React.PointerEvent<HTMLVideoElement>) {
    const drag = cropDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    e.preventDefault()
    const deltaX = e.clientX - drag.startX
    const deltaY = e.clientY - drag.startY
    if (drag.fit) {
      const cropX = drag.maxShiftX > 0 ? Math.min(1, Math.max(0, drag.startCropX + (deltaX / drag.maxShiftX) * drag.fitDirectionX)) : drag.startCropX
      const cropY = drag.maxShiftY > 0 ? Math.min(1, Math.max(0, drag.startCropY + (deltaY / drag.maxShiftY) * drag.fitDirectionY)) : drag.startCropY
      updateClip({ cropX, cropY }, false, false)
      return
    }
    const cropX = drag.maxShiftX > 0
      ? Math.min(1, Math.max(0, drag.startCropX - deltaX / (drag.scaleX * drag.maxShiftX)))
      : drag.startCropX
    const cropY = drag.maxShiftY > 0
      ? Math.min(1, Math.max(0, drag.startCropY - deltaY / (drag.scaleY * drag.maxShiftY)))
      : drag.startCropY
    updateClip({ cropX, cropY }, false, false)
  }

  function zoomFitPreview(delta: number) {
    if (!clip || clip.fitMode !== 'fit') return
    const zoom = Math.min(3, Math.max(1, Math.round((clip.zoom + delta) * 20) / 20))
    updateClip({ zoom, ...(zoom === 1 ? { cropX: 0.5, cropY: 0.5 } : {}) }, false, false)
  }

  function onFitPreviewWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!clip || clip.fitMode !== 'fit' || previewTool !== 'hand') return
    event.preventDefault()
    zoomFitPreview(event.deltaY < 0 ? 0.1 : -0.1)
  }

  function onCropPointerUp(e: React.PointerEvent<HTMLVideoElement>) {
    if (cropDragRef.current?.pointerId !== e.pointerId) return
    cropDragRef.current = null
    if (clip?.fitMode === 'fit' && previewTool === 'hand') e.currentTarget.style.cursor = 'grab'
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  async function trackSelectedSubject() {
    const box = subjectSelection
    const video = videoRef.current
    if (!clip || !project || !box || !video || !video.videoWidth || !video.videoHeight) return
    setTrackingBusy(true)
    try {
      const sx = Math.max(0, Math.min(video.videoWidth - 1, Math.round(box.x * video.videoWidth)))
      const sy = Math.max(0, Math.min(video.videoHeight - 1, Math.round(box.y * video.videoHeight)))
      const sw = Math.max(16, Math.min(video.videoWidth - sx, Math.round(box.w * video.videoWidth)))
      const sh = Math.max(16, Math.min(video.videoHeight - sy, Math.round(box.h * video.videoHeight)))
      const outW = Math.max(16, Math.min(128, sw))
      const outH = Math.max(16, Math.min(128, Math.round(sh * outW / sw)))
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Could not create a target image from the selected frame.')
      context.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)
      const rgba = context.getImageData(0, 0, outW, outH).data
      const header = new TextEncoder().encode(`P5\n${outW} ${outH}\n255\n`)
      const pgm = new Uint8Array(header.length + outW * outH)
      pgm.set(header)
      for (let i = 0; i < outW * outH; i++) {
        const p = i * 4
        pgm[header.length + i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8
      }
      let binary = ''
      for (let i = 0; i < pgm.length; i += 0x8000) {
        binary += String.fromCharCode(...pgm.subarray(i, Math.min(i + 0x8000, pgm.length)))
      }
      const result = await api['clips.trackSubject']({
        clipId: clip.id,
        templatePgm: btoa(binary),
        selectedTime: Math.max(clip.startTime, Math.min(currentTime, clip.endTime - 0.05)),
        centerX: box.x + box.w / 2,
        centerY: box.y + box.h / 2,
        frameWidth: video.videoWidth,
        frameHeight: video.videoHeight
      })
      const cameraKeys = result.keyframes.filter((keyframe, index, all) =>
        index === 0 || index === all.length - 1 || index % 3 === 0
      ).map((keyframe) => ({
        time: keyframe.time,
        x: keyframe.x,
        y: keyframe.y,
        scale: clip.zoom,
        rotation: 0,
        easing: 'ease-in-out' as const
      }))
      updateClip({
        trackingKeyframes: result.keyframes,
        cameraKeyframes: clip.cameraKeyframes.length > 0 ? clip.cameraKeyframes : cameraKeys
      }, true)
      setCameraEditing(false)
      setSelectingSubject(false)
      setSubjectSelection(null)
      app.toast({ level: 'success', message: `Tracked the selected subject across ${result.found} samples.` })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    } finally {
      setTrackingBusy(false)
    }
  }

  // ------------------------------------------------------ keyboard shortcuts --
  const frameStep = useCallback((dir: 1 | -1) => {
    const v = videoRef.current
    if (!v) return
    const fps = data.activeProject?.fps && data.activeProject.fps > 0 ? data.activeProject.fps : 25
    v.pause()
    seekTo(v.currentTime + dir * frameDuration(fps))
  }, [data.activeProject, seekTo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (!clip) return
      const v = videoRef.current
      const fps = data.activeProject?.fps && data.activeProject.fps > 0 ? data.activeProject.fps : 25
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        rewind()
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        v?.pause()
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        playForward()
      } else if (e.key === ',') {
        frameStep(-1)
      } else if (e.key === '.') {
        frameStep(1)
      } else if (e.key === 'i' || e.key === 'I') {
        updateClip({ startTime: Math.min(currentTime, clip.endTime - frameDuration(fps)) })
      } else if (e.key === 'o' || e.key === 'O') {
        updateClip({ endTime: Math.max(currentTime, clip.startTime + frameDuration(fps)) })
      } else if (e.key === 'Home') {
        e.preventDefault()
        seekTo(clip.startTime)
      } else if (e.key === 'End') {
        e.preventDefault()
        seekTo(clip.endTime - frameDuration(fps))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (v) seekTo(v.currentTime - (e.shiftKey ? 5 : 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (v) seekTo(v.currentTime + (e.shiftKey ? 5 : 1))
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        const timelineHistory = timelineHistoryRef.current
        const clipHistory = historyRef.current
        const timelineIsNewest = timelineHistory.lastActionAt >= clipHistory.lastPush
        if (e.shiftKey) {
          if (timelineIsNewest && timelineHistory.redo.length) redoTimeline()
          else if (clipHistory.future.length) redo()
          else redoTimeline()
        } else {
          if (timelineIsNewest && timelineHistory.undo.length) undoTimeline()
          else if (clipHistory.past.length) undo()
          else undoTimeline()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clip, currentTime, togglePlay, updateClip, rewind, playForward, frameStep, seekTo, undo, redo, undoTimeline, redoTimeline, data.activeProject])

  // ------------------------------------------------------------- captions ---
  const project = data.activeProject
  const baseCaptionStyle = getCaptionStyle(clip?.captionStyleId ?? 'classic')
  const style = clip ? { ...baseCaptionStyle, ...clip.captionOverrides, fontFile: clip.captionOverrides.fontFile ?? baseCaptionStyle.fontFile } : baseCaptionStyle
  const cues = useMemo(() => {
    if (!clip) return []
    return buildCues(segments, {
      maxWordsPerCue: clip.captionOverrides.maxWordsPerCue ?? style.maxWordsPerCue,
      maxCharsPerLine: style.maxCharsPerLine,
      maxLines: style.maxLines,
      textEdits: clip.captionTextEdits,
      splits: clip.captionCueSplits,
      merges: clip.captionCueMerges,
      timingOffsets: clip.captionTimingOffsets,
      hiddenKeys: clip.captionCueHidden,
      duplicates: clip.captionCueDuplicates,
      fromTime: clip.startTime,
      toTime: clip.endTime
    })
  }, [segments, clip, style])

  // Mirror of the render plan: crop toward the selected output target so the
  // preview shows exactly what FFmpeg produces (plan.ts buildRenderPlan).
  const customRatio = clip ? { w: clip.customAspectW ?? 16, h: clip.customAspectH ?? 9 } : undefined
  const target = clip ? resolutionFor(clip.aspectRatio, clip.outputResolution, customRatio) : { w: 1080, h: 1920 }
  const cameraState = clip ? cameraStateAt(clip.cameraKeyframes ?? [], currentTime) : null
  const crop = useMemo(() => {
    if (!clip || !project?.width || !project?.height) return null
    if (cameraState) return computeCameraCrop(project.width, project.height, target.w, target.h, cameraState)
    const base = computeCrop(project.width, project.height, target.w, target.h, clip.cropMode, clip.cropX, clip.zoom, clip.cropY ?? clip.cropX)
    return applyTrackingToCrop(base, project.width, project.height, clip.trackingKeyframes ?? [], currentTime)
  }, [clip, project, target, currentTime, cameraState])

  function makeCameraKeyframe(time: number): CameraKeyframe {
    if (!clip || !project?.width || !project?.height) {
      return { time, x: 0.5, y: 0.5, scale: 1, rotation: 0, easing: 'ease-in-out' }
    }
    const state = cameraStateAt(clip.cameraKeyframes ?? [], time)
    const visibleCrop = crop ?? computeCrop(project.width, project.height, target.w, target.h, clip.cropMode, clip.cropX, clip.zoom, clip.cropY ?? clip.cropX)
    return {
      time,
      x: state?.x ?? Math.min(1, Math.max(0, (visibleCrop.x + visibleCrop.w / 2) / project.width)),
      y: state?.y ?? Math.min(1, Math.max(0, (visibleCrop.y + visibleCrop.h / 2) / project.height)),
      scale: state?.scale ?? clip.zoom,
      rotation: state?.rotation ?? 0,
      easing: state?.easing ?? 'ease-in-out'
    }
  }

  function storeCameraKeyframe(keyframe: CameraKeyframe, addHistory = true) {
    if (!clip) return
    if (addHistory) pushHistory()
    const next = [...(clip.cameraKeyframes ?? [])]
    const existing = next.findIndex((item) => Math.abs(item.time - keyframe.time) < frameTimeTolerance(data.activeProject?.fps))
    if (existing >= 0) next[existing] = keyframe
    else next.push(keyframe)
    next.sort((a, b) => a.time - b.time)
    setSelectedCameraKeyframeTime(keyframe.time)
    updateClip({ cameraKeyframes: next }, false, false)
  }

  function addCameraKeyframe() {
    if (!clip) return
    setBaseCropEditing(false)
    storeCameraKeyframe(makeCameraKeyframe(currentTime))
  }

  function addTextLayer() {
    if (!clip) return
    const layer: TextLayer = {
      id: crypto.randomUUID(), text: 'Add your text', startTime: currentTime,
      endTime: Math.min(clip.endTime, currentTime + 3), x: 0.5, y: 0.32,
      scale: 1, rotation: 0, opacity: 1, fontFamily: 'Inter', fontWeight: 700,
      fontSize: 64, color: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0,
      animationIn: 'fade', animationOut: 'fade', keyframes: []
    }
    if (layer.endTime <= layer.startTime) layer.startTime = Math.max(clip.startTime, layer.endTime - 0.5)
    pushHistory()
    updateClip({ textLayers: [...clip.textLayers, layer] }, true, false)
    setSelectedTextLayerId(layer.id)
    setSelectedTimelineItem(null); setSelectedCueKey(null); setSelectedMomentId(null)
    seekTo(layer.startTime)
  }

  function updateTextLayer(id: string, patch: Partial<TextLayer>) {
    if (!clip) return
    const textLayers = clip.textLayers.map((layer) => {
      if (layer.id !== id) return layer
      const transformFields = ['x', 'y', 'scale', 'rotation', 'opacity'] as const
      const hasTransformEdit = !('keyframes' in patch) && transformFields.some((field) => field in patch)
      if (!hasTransformEdit || layer.keyframes.length === 0) return { ...layer, ...patch }
      const state = { ...textLayerStateAt(layer, currentTime), ...Object.fromEntries(transformFields.filter((field) => field in patch).map((field) => [field, patch[field]])) }
      const keyframes = [...layer.keyframes.filter((key) => Math.abs(key.time - currentTime) > frameTimeTolerance(data.activeProject?.fps)), { ...state, time: currentTime }].sort((a, b) => a.time - b.time)
      return { ...layer, ...patch, keyframes }
    })
    updateClip({ textLayers }, false, false)
  }

  function deleteSelectedTextLayer() {
    if (!clip || !selectedTextLayerId) return
    pushHistory()
    updateClip({ textLayers: clip.textLayers.filter((layer) => layer.id !== selectedTextLayerId) }, true, false)
    setSelectedTextLayerId(null)
  }

  function addTextKeyframe() {
    const layer = clip?.textLayers.find((item) => item.id === selectedTextLayerId)
    if (!layer) return
    const state = textLayerStateAt(layer, currentTime)
    const keyframe: TextLayerKeyframe = { time: currentTime, x: state.x, y: state.y, scale: state.scale, rotation: state.rotation, opacity: state.opacity }
    const keyframes = [...layer.keyframes.filter((item) => Math.abs(item.time - currentTime) > frameTimeTolerance(data.activeProject?.fps)), keyframe].sort((a, b) => a.time - b.time)
    pushHistory()
    updateTextLayer(layer.id, { keyframes })
  }

  function changeSelectedCameraKeyframe(patch: Partial<CameraKeyframe>) {
    if (!clip) return
    const selected = selectedCameraKeyframeTime === null
      ? undefined
      : clip.cameraKeyframes.find((item) => Math.abs(item.time - selectedCameraKeyframeTime) < frameTimeTolerance(data.activeProject?.fps))
    storeCameraKeyframe({ ...(selected ?? makeCameraKeyframe(currentTime)), ...patch })
  }

  function onCameraPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((!cameraEditing && !baseCropEditing) || !clip || !crop || !project?.width || !project?.height || selectingSubject) return
    e.preventDefault()
    const resizeHandle = (e.target as HTMLElement).closest('[data-camera-resize]')?.getAttribute('data-camera-resize') ?? null
    const mode = baseCropEditing ? 'base' : 'camera'
    const keyframe = makeCameraKeyframe(currentTime)
    pushHistory()
    if (mode === 'camera') storeCameraKeyframe(keyframe, false)
    e.currentTarget.setPointerCapture(e.pointerId)
    const video = videoRef.current
    const sourceMap = sourceDisplayTransform(video?.videoWidth || project.width, video?.videoHeight || project.height, frame.w || project.width, frame.h || project.height)
    cameraDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      keyframe,
      crop,
      sourceMap,
      resizeHandle,
      mode
    }
  }

  function onCameraPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = cameraDragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !project?.width || !project?.height) return
    e.preventDefault()
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (drag.resizeHandle) {
      const sx = drag.resizeHandle.includes('w') ? -1 : 1
      const sy = drag.resizeHandle.includes('n') ? -1 : 1
      const hasX = drag.resizeHandle.includes('e') || drag.resizeHandle.includes('w')
      const hasY = drag.resizeHandle.includes('n') || drag.resizeHandle.includes('s')
      const sourceDeltaX = hasX ? dx * sx * project.width / Math.max(1, drag.sourceMap.width) : 0
      const sourceDeltaY = hasY ? dy * sy * project.height / Math.max(1, drag.sourceMap.height) : 0
      const widthDelta = (sourceDeltaX + sourceDeltaY * drag.crop.w / drag.crop.h) / 2
      const nextWidth = Math.max(48, drag.crop.w + widthDelta)
      const scale = Math.min(3, Math.max(1, drag.keyframe.scale * drag.crop.w / nextWidth))
      if (drag.mode === 'base') updateClip({ zoom: scale, cropMode: 'manual', fitMode: 'fill' }, false, false)
      else storeCameraKeyframe({ ...drag.keyframe, scale }, false)
    } else {
      if (drag.mode === 'base') {
        const maxX = Math.max(0, project.width - drag.crop.w)
        const maxY = Math.max(0, project.height - drag.crop.h)
        const x = maxX > 0 ? Math.min(maxX, Math.max(0, drag.crop.x + dx * project.width / Math.max(1, drag.sourceMap.width))) / maxX : clip!.cropX
        const y = maxY > 0 ? Math.min(maxY, Math.max(0, drag.crop.y + dy * project.height / Math.max(1, drag.sourceMap.height))) / maxY : (clip!.cropY ?? clip!.cropX)
        updateClip({ cropX: x, cropY: y, cropMode: 'manual', fitMode: 'fill' }, false, false)
      } else {
        storeCameraKeyframe({
          ...drag.keyframe,
          x: Math.min(1, Math.max(0, drag.keyframe.x + dx / Math.max(1, drag.sourceMap.width))),
          y: Math.min(1, Math.max(0, drag.keyframe.y + dy / Math.max(1, drag.sourceMap.height)))
        }, false)
      }
    }
  }

  function onCameraPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (cameraDragRef.current?.pointerId !== e.pointerId) return
    cameraDragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function selectCameraKeyframe(keyframe: CameraKeyframe) {
    setSelectedCameraKeyframeTime(keyframe.time)
    seekTo(keyframe.time)
  }

  function deleteSelectedCameraKeyframe() {
    if (!clip || selectedCameraKeyframeTime === null) return
    pushHistory()
    const next = clip.cameraKeyframes.filter((item) => Math.abs(item.time - selectedCameraKeyframeTime) >= frameTimeTolerance(data.activeProject?.fps))
    updateClip({ cameraKeyframes: next }, true, false)
    setSelectedCameraKeyframeTime(null)
  }

  const selectedCameraKeyframe = clip?.cameraKeyframes.find((item) => selectedCameraKeyframeTime !== null && Math.abs(item.time - selectedCameraKeyframeTime) < frameTimeTolerance(data.activeProject?.fps)) ?? null

  // Measure the canvas (the area the picture is drawn into); the preview frame
  // is sized from it so it always fits and honors the output ratio exactly.
  // The canvas is measured rather than the whole stage because the stage also
  // holds the player header and the transport bar.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStageSize({ w: entry.contentRect.width, h: entry.contentRect.height })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [clip?.id])

  // --------------------------------------------------------- proxy actions ---
  async function createProxy(force = false) {
    if (!projectId) return
    if (proxyRunning) return
    setProxyRunning(true)
    try {
      await api['media.renderProxy']({ projectId, force })
      // Poll until the proxy file appears (the transcode runs as a task).
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        try {
          const status = await api['media.checkPlayback']({ projectId })
          setPlayback(status)
          if (status.proxyExists) {
            setVideoError(null)
            app.toast({
              level: 'success',
              message: 'Preview proxy ready — playback switched to the proxy copy.',
              hint: 'Renders still use the original file at full quality.'
            })
            return
          }
        } catch {
          /* keep polling */
        }
      }
      app.toast({ level: 'warn', message: 'The proxy is still transcoding. Playback will use it once finished.' })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    } finally {
      setProxyRunning(false)
    }
  }

  // ---------------------------------------------------------------- render ---
  async function queueRender(preview: boolean) {
    const exportClip = clipRef.current ?? clip
    if (!exportClip) return
    // Snapshot the exact editor state at the instant Export is clicked. Later
    // edits can continue autosaving without changing which state this job uses.
    const exportClipSnapshot = snapshotOf(exportClip)
    const exportTimeline = clipTimelineRef.current
    if (preview) setPreviewQueued(true)
    else setRenderQueued(true)
    try {
      // First flush pending clip patches (including edits from the same event
      // tick), then persist the full click-time snapshot used by the renderer.
      if (!await flushSavesRef.current.clip()) return
      if (!await saveNowRef.current(exportClipSnapshot, exportClip.id)) return
      // Cancel the timeline debounce only for this target clip and write the
      // exact click-time ref snapshot before queuing the background render.
      if (pendingTimelineClipId.current === exportClip.id) {
        if (timelineSaveTimer.current) clearTimeout(timelineSaveTimer.current)
        timelineSaveTimer.current = null
        pendingTimelineClipId.current = null
      }
      const timelineSaved = await timelineSaveNowRef.current(exportTimeline, exportClip.id)
      if (!timelineSaved) {
        if (pendingTimelineClipId.current === null) pendingTimelineClipId.current = exportClip.id
        return
      }
      await api['renders.queue']({ clipId: exportClip.id, preview })
      await data.loadRenders(exportClip.projectId)
      app.toast({
        level: 'success',
        message: preview
          ? 'Quick preview render queued (720p draft).'
          : 'Render queued. Progress appears in the Render queue.',
        actionLabel: 'Open queue',
        action: () => app.navigate('queue')
      })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    } finally {
      setRenderQueued(false)
      setPreviewQueued(false)
    }
  }

  async function openMoment(candidate: ClipCandidate) {
    if (!project) return
    try {
      let momentClip = data.clips.find((item) => item.candidateId === candidate.id)
      if (!momentClip) momentClip = await api['clips.createFromCandidate']({ candidateId: candidate.id })
      await data.loadClips(project.id)
      app.openEditor(momentClip.id, project.id)
    } catch (err) { app.toast({ level: 'error', ...errMessage(err) }) }
  }

  function beginTimelineResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const originY = event.clientY
    const originHeight = timelineHeight
    const onMove = (move: PointerEvent) => setTimelineHeight(clampTimelineHeight(originHeight + originY - move.clientY, window.innerHeight))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      timelineResizeCleanup.current = null
      setTimelineHeight((height) => { localStorage.setItem('clipwright.editor.timelineHeight', String(Math.round(height))); return height })
    }
    timelineResizeCleanup.current?.()
    timelineResizeCleanup.current = onUp
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function togglePreviewFullscreen() {
    const element = stageRef.current
    if (!element) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void element.requestFullscreen()
  }

  useEffect(() => {
    const update = () => setIsFullscreenPreview(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  // Hooks must run on every render of this component, so the ones below the
  // document-load effect live *above* the early returns. A hook placed after an
  // early return is skipped on the first (loading) render and then runs once the
  // clip arrives, which makes React throw "Rendered more hooks than during the
  // previous render" and unmount the whole editor — the blank-page bug.
  const selectedMoment = data.candidates.find((candidate) => candidate.id === selectedMomentId) ?? null

  useEffect(() => {
    if (window.matchMedia('(max-width: 680px)').matches && (selectedTimelineItem || selectedTextLayerId || selectedCueKey || selectedMoment)) {
      setInspectorOpen(true)
    }
  }, [selectedTimelineItem, selectedTextLayerId, selectedCueKey, selectedMoment])

  if (error) {
    return (
      <div className="page">
        <ErrorBox error={error} onRetry={() => app.navigate('project')} retryLabel="Back to project" />
      </div>
    )
  }

  if (!clip || !project) {
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center' }}>
        <Spinner size={20} />
      </div>
    )
  }

  const activeCue = cueAt(cues, currentTime)
  const selectedTimelineAsset = selectedTimelineItem ? data.assets.find((asset) => asset.id === selectedTimelineItem.assetId) : undefined
  const targetRange = getDurationRange(project.settings.durationPreset)
  const kept = keptSegments(clip.startTime, clip.endTime, clip.silenceCuts ?? [])
  const outputSeconds = keptDuration(kept)

  // Fit the output-ratio frame inside the stage (letterboxed, never distorted).
  const ratio = target.w / target.h
  const frame =
    stageSize.w > 0 && stageSize.h > 0
      ? (() => {
          // stageSize is the canvas content box, so its padding is excluded already.
          const w = Math.max(0, Math.min(stageSize.w, stageSize.h * ratio))
          return { w, h: w / ratio }
        })()
      : { w: 0, h: 0 }
  const fullSourcePreview = selectingSubject || (clip.fitMode !== 'fit' && (cameraEditing || baseCropEditing || (subjectSelection !== null && !trackingBusy)))
  const sourceVideoWidth = videoRef.current?.videoWidth || project.width || 1
  const sourceVideoHeight = videoRef.current?.videoHeight || project.height || 1
  const sourceMap = sourceDisplayTransform(sourceVideoWidth, sourceVideoHeight, frame.w || sourceVideoWidth, frame.h || sourceVideoHeight)
  const subjectBoxStyle = subjectSelection ? {
    left: sourceMap.left + subjectSelection.x * sourceMap.width,
    top: sourceMap.top + subjectSelection.y * sourceMap.height,
    width: subjectSelection.w * sourceMap.width,
    height: subjectSelection.h * sourceMap.height
  } : undefined
  const cameraFrameStyle = (cameraEditing || baseCropEditing) && crop && project.width && project.height ? {
    left: sourceMap.left + crop.x / project.width * sourceMap.width,
    top: sourceMap.top + crop.y / project.height * sourceMap.height,
    width: crop.w / project.width * sourceMap.width,
    height: crop.h / project.height * sourceMap.height,
    transform: `rotate(${cameraState?.rotation ?? 0}deg)`
  } : undefined

  return (
    <div className="editor-shell">
      {/* ------------------------------------------------------- top bar -- */}
      <div className="editor-topbar">
        <div className="topbar-left">
          <button className="btn ghost sm icon" onClick={() => app.openProject(project.id)} aria-label="Back to project" title="Back to project">
            <ArrowLeft size={15} />
          </button>
          <div className="topbar-title">
            <span className="editor-project-name" title={project.name}>{project.name}</span>
            <span className="topbar-crumb" aria-hidden="true">/</span>
            <input
              className="clip-title-input"
              value={clip.title}
              placeholder="Clip title"
              title="Clip title"
              onChange={(e) => updateClip({ title: e.target.value })}
            />
          </div>
          <span className={`save-state ${saveState === 'dirty' ? 'dirty' : ''}`}>
            {saveState === 'saving' && <Spinner size={11} />}
            {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Unsaved changes'}
          </span>
        </div>
        <div className="topbar-actions">
          <span className="editor-topbar-status" title="Playhead time / total duration">
            {formatClock(currentTime, true)} <span>/</span> {formatClock(outputSeconds, true)}
          </span>
          <span className="topbar-divider" aria-hidden="true" />
          <button className="btn ghost sm icon" onClick={undo} disabled={!historyState.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 size={14} />
          </button>
          <button className="btn ghost sm icon" onClick={redo} disabled={!historyState.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <Redo2 size={14} />
          </button>
          <span className="topbar-divider" aria-hidden="true" />
          <button className="btn primary topbar-export" onClick={() => void queueRender(false)} disabled={renderQueued}>
            {renderQueued ? <Spinner size={12} /> : <Upload size={13} />} Export
          </button>
          <button ref={inspectorToggleRef} className="btn ghost sm icon inspector-mobile-toggle" onClick={() => setInspectorOpen(true)} aria-label="Open inspector" title="Open inspector" aria-controls="editor-inspector" aria-expanded={inspectorOpen}>
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- stage + insp -- */}
      <div className="editor-body">
        <nav className="editor-tool-rail" aria-label="Editor tools">
          {([
            ['media', 'Media', <Library size={17} />], ['audio', 'Audio', <Music2 size={17} />],
            ['moments', 'Moments', <Sparkles size={17} />], ['camera', 'Camera', <Target size={17} />],
            ['clip', 'Clip', <Scissors size={17} />]
          ] as const).map(([tool, label, icon]) => <button key={tool} className={`editor-tool-button${activeTool === tool ? ' active' : ''}`}
            onClick={() => { setActiveTool(tool); setSourceClipSelected(tool === 'clip'); setSelectedTimelineItem(null); if (tool === 'clip') { setSelectedCueKey(null); setSelectedTextLayerId(null); setSelectedMomentId(null) } }} title={label} aria-label={label} aria-pressed={activeTool === tool}>{icon}<span>{label}</span></button>)}
        </nav>
        <aside className="editor-tool-panel" aria-label={`${activeTool} panel`}>
          <div className="editor-panel-heading"><strong>{activeTool === 'media' ? 'Media' : activeTool === 'audio' ? 'Audio' : activeTool === 'moments' ? 'AI moments' : activeTool === 'camera' ? 'Camera & reframe' : 'Clip source'}</strong>
            <span>{activeTool === 'media' ? 'Project assets' : activeTool === 'audio' ? 'Music, effects and voice' : ''}</span>
          </div>
          {(activeTool === 'media' || activeTool === 'audio') && <MediaLibrary assets={data.assets} importing={assetImporting || Boolean(assetImportTask)}
            sectionTitle={activeTool === 'audio' ? 'Project audio' : 'Project media'} importLabel={activeTool === 'audio' ? 'Import audio' : 'Import media'}
            waveforms={assetWaveforms} filterOverride={activeTool === 'audio' ? 'audio' : undefined}
            onImport={() => void importAssets()} onRename={(asset) => void renameAsset(asset)} onRemove={(asset) => void removeAsset(asset)}
            onRelink={(asset) => void relinkAsset(asset)} onDropFiles={(paths) => void importAssets(paths)} />}
          {activeTool === 'moments' && <div className="editor-moments-panel">
            {data.candidates.filter((candidate) => candidate.status !== 'rejected').length === 0
              ? <div className="editor-panel-empty"><Sparkles size={20} /><strong>No moments yet</strong><span>Analyze the project to find strong clip moments.</span><button className="btn sm" onClick={async () => { try { await api['analysis.start']({ projectId: project.id, providerId: 'heuristic-local' }); app.toast({ level: 'info', message: 'Moment analysis started.' }) } catch (err) { app.toast({ level: 'error', ...errMessage(err) }) } }}>Analyze video</button></div>
              : data.candidates.filter((candidate) => candidate.status !== 'rejected').map((candidate) => <div key={candidate.id} className={`editor-moment-card${selectedMomentId === candidate.id ? ' selected' : ''}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { setSelectedMomentId(candidate.id); setSourceClipSelected(false); seekTo(candidate.startTime) } }} onClick={() => { setSelectedMomentId(candidate.id); setSelectedTimelineItem(null); setSourceClipSelected(false); setSelectedTextLayerId(null); setSelectedCueKey(null); seekTo(candidate.startTime) }}>
                {filmstrip?.length ? <img className="editor-moment-thumb" src={mediaUrl(filmstrip.reduce((best, frame) => Math.abs(frame.t - candidate.startTime) < Math.abs(best.t - candidate.startTime) ? frame : best).path)} alt="" /> : null}
                <span className="editor-moment-time">{formatClock(candidate.startTime, true)} – {formatClock(candidate.endTime, true)}</span><strong>{candidate.title}</strong><span>{candidate.reason}</span><small>{Math.round(candidate.overallScore ?? 0)} score · {Math.round(candidate.endTime - candidate.startTime)} sec</small>
                <span className="editor-moment-actions" onClick={(event) => event.stopPropagation()}><button className="btn sm" onClick={() => void openMoment(candidate)}>{data.clips.some((item) => item.candidateId === candidate.id) ? 'Edit clip' : 'Create clip'}</button></span>
              </div>)}
          </div>}
          {activeTool === 'camera' && <div className="editor-camera-panel">
            <p className="muted">Select a keyframe to navigate. Add and edit framing in Properties → Camera keyframes; subject tracking is in Crop &amp; framing.</p>
            <div className="editor-keyframe-list">{[...clip.cameraKeyframes].sort((a, b) => a.time - b.time).map((keyframe, index) => <button key={`${keyframe.time}-${index}`} onClick={() => { selectCameraKeyframe(keyframe); seekTo(keyframe.time) }}><span>◆</span>{formatClock(keyframe.time, true)}<small>{keyframe.easing}</small></button>)}</div>
            {clip.cameraKeyframes.length === 0 && <div className="field-hint">No camera keyframes yet. Open Properties → Camera keyframes to add one at the current playhead.</div>}
          </div>}
          {activeTool === 'clip' && <div className="editor-source-panel"><p>Selected source range</p><strong className="mono">{formatClock(clip.startTime, true)} – {formatClock(clip.endTime, true)}</strong>
            <div className="field-hint">Drag the source strip below the playhead to trim. Use Properties → Trim and Silence removal for precise range and pause edits.</div>
          </div>}
        </aside>
        <div className="editor-stage" ref={stageRef}>
          <div className="stage-head">
            <div className="stage-head-title">
              <strong>Player</strong>
              <span>{target.w}×{target.h} · {clip.aspectRatio}</span>
              {useProxySrc && <span className="stage-chip">Proxy preview</span>}
            </div>
            <div className="stage-head-actions editor-preview-tools" role="toolbar" aria-label="Preview tools">
            <button className={`btn sm icon${previewTool === 'select' ? ' primary' : ''}`} onClick={() => setPreviewTool('select')} title="Select tool" aria-label="Select tool" aria-pressed={previewTool === 'select'}><MousePointer2 size={14} /></button>
            <button className={`btn sm icon${previewTool === 'hand' ? ' primary' : ''}`} onClick={() => setPreviewTool('hand')} title="Hand tool: drag to move, scroll to zoom" aria-label="Hand tool" aria-pressed={previewTool === 'hand'}><Hand size={14} /></button>
            {clip.fitMode === 'fit' && <>
              <span className="editor-preview-tools-divider" />
              <button className="btn sm icon" onClick={() => zoomFitPreview(-0.1)} disabled={clip.zoom <= 1} title="Zoom out" aria-label="Zoom out"><ZoomOut size={14} /></button>
              <span className="tiny mono editor-preview-zoom">{clip.zoom.toFixed(2)}×</span>
              <button className="btn sm icon" onClick={() => zoomFitPreview(0.1)} disabled={clip.zoom >= 3} title="Zoom in" aria-label="Zoom in"><ZoomIn size={14} /></button>
            </>}
            </div>
          </div>
          <div className="stage-canvas" ref={canvasRef}>
          <div
            className="editor-frame"
            style={{ width: frame.w || undefined, height: frame.h || undefined }}
            title={`Preview frame: ${target.w}×${target.h} (${clip.aspectRatio} @ ${clip.outputResolution})`}
            onWheel={onFitPreviewWheel}
          >
            <video
              ref={videoRef}
              key={useProxySrc ? 'proxy' : 'source'}
              crossOrigin="anonymous"
              src={project.sourcePath ? mediaUrl(project.sourcePath, { proxy: useProxySrc }) : undefined}
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
              muted={muted}
              onLoadedMetadata={(event) => {
                // The editor state is initialized to the clip's in-point, but
                // a newly mounted <video> (including a proxy handoff) starts
                // at source time zero. Restore the editor playhead so the
                // first frame shown is the selected clip, not a possibly
                // blank/black opening frame.
                const video = event.currentTarget
                const duration = Number.isFinite(video.duration) ? video.duration : currentTime
                const targetTime = Math.min(Math.max(0, currentTime), duration)
                if (Math.abs(video.currentTime - targetTime) > 0.05) video.currentTime = targetTime
              }}
              onError={(event) => {
                const error = event.currentTarget.error
                const mediaCauses: Record<number, string> = {
                  1: 'Playback was aborted.',
                  2: 'The media could not be read (file unavailable or interrupted).',
                  3: 'Chromium could not decode this video stream.',
                  4: 'This media format or source URL is unsupported.'
                }
                setVideoError(
                  playback?.verdict === 'proxy'
                    ? playback.reason
                    : mediaCauses[error?.code ?? 0] ?? 'The video could not be loaded. The file may be missing, or its format is not supported for direct playback.'
                )
                if (!useProxySrc) void createProxy(true)
              }}
              onPlaying={(event) => {
                if (!useProxySrc && event.currentTarget.videoWidth === 0) {
                  setVideoError('The video stream started without a decoded picture. Building a compatible preview copy…')
                  void createProxy(true)
                }
              }}
              onLoadedData={() => setVideoError(null)}
              style={
                fullSourcePreview
                  ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', cursor: selectingSubject ? 'crosshair' : undefined }
                  : clip.fitMode === 'fit'
                  ? {
                      position: 'absolute',
                      width: `${Math.min(1, (sourceVideoWidth / sourceVideoHeight) / (target.w / target.h)) * clip.zoom * 100}%`,
                      height: `${Math.min(1, (target.w / target.h) / (sourceVideoWidth / sourceVideoHeight)) * clip.zoom * 100}%`,
                      maxWidth: 'none', maxHeight: 'none',
                      left: `${(1 - Math.min(1, (sourceVideoWidth / sourceVideoHeight) / (target.w / target.h)) * clip.zoom) * clip.cropX * 100}%`,
                      top: `${(1 - Math.min(1, (target.w / target.h) / (sourceVideoWidth / sourceVideoHeight)) * clip.zoom) * (clip.cropY ?? clip.cropX) * 100}%`,
                      objectFit: 'fill', cursor: previewTool === 'hand' ? 'grab' : 'default'
                    }
                  : crop
                  ? {
                      position: 'absolute',
                      width: `${(project.width! / crop.w) * 100}%`,
                      height: `${(project.height! / crop.h) * 100}%`,
                      left: `${-(crop.x / crop.w) * 100}%`,
                      top: `${-(crop.y / crop.h) * 100}%`,
                      objectFit: 'fill',
                      cursor: project.width && project.height && project.width / project.height !== target.w / target.h ? 'grab' : undefined,
                      transform: cameraState?.rotation ? `rotate(${cameraState.rotation}deg)` : undefined,
                      transformOrigin: cameraState && project.width && project.height
                        ? `${((crop.x + crop.w / 2) / project.width) * 100}% ${((crop.y + crop.h / 2) / project.height) * 100}%`
                        : undefined
                    }
                  : { width: '100%', height: '100%', objectFit: 'contain' }
              }
              preload="metadata"
              playsInline
            />
            {clipTimeline.items.map((item) => {
              const asset = data.assets.find((candidate) => candidate.id === item.assetId)
              const track = clipTimeline.tracks.find((candidate) => candidate.id === item.trackId)
              if (!asset || asset.missing || !track) return null
              const itemDuration = timelineItemDuration(item)
              const geometry = timelineOverlayGeometry(item)
              const visible = currentTime >= item.startTime && currentTime < item.startTime + itemDuration
              const layerStyle: React.CSSProperties = {
                position: 'absolute', left: `${geometry.centerX * 100}%`, top: `${geometry.centerY * 100}%`,
                width: `${geometry.scale * 100}%`, height: `${geometry.scale * 100}%`,
                objectFit: 'contain', opacity: geometry.opacity, transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                zIndex: 3 + track.order, pointerEvents: 'none', display: visible && !track.hidden ? 'block' : 'none'
              }
              if (asset.mediaType === 'audio') return <audio key={item.id} ref={(node) => { if (node) timelineMediaRefs.current.set(item.id, node); else timelineMediaRefs.current.delete(item.id) }} src={mediaUrl(asset.path)} preload="metadata" />
              if (asset.mediaType === 'image') return <img key={item.id} src={mediaUrl(asset.path)} alt="" draggable={false} style={layerStyle} />
              return <video key={item.id} ref={(node) => { if (node) timelineMediaRefs.current.set(item.id, node); else timelineMediaRefs.current.delete(item.id) }} src={mediaUrl(asset.path)} preload="metadata" playsInline muted style={layerStyle} />
            })}
            {!fullSourcePreview && clip.textLayers.filter((layer) => currentTime >= layer.startTime && currentTime <= layer.endTime).map((layer) => {
              const state = textLayerAppearanceAt(layer, currentTime)
              const fontPx = (frame.h || 1080) * layer.fontSize / 1080
              return <div key={layer.id} className={`editor-text-layer ${selectedTextLayerId === layer.id ? 'selected' : ''}`}
                style={{ left: `${state.x * 100}%`, top: `${state.y * 100}%`, opacity: state.opacity,
                  transform: `translate(-50%, -50%) scale(${state.scale}) rotate(${state.rotation}deg)`,
                  color: layer.color, fontFamily: `'${layer.fontFamily}', sans-serif`, fontWeight: layer.fontWeight,
                  pointerEvents: previewTool === 'select' ? 'auto' : 'none',
                  fontSize: `${fontPx}px`, background: layer.backgroundOpacity > 0 ? `color-mix(in srgb, ${layer.backgroundColor} ${layer.backgroundOpacity * 100}%, transparent)` : undefined }}
                onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedTextLayerId(layer.id); setSelectedTimelineItem(null); setSelectedCueKey(null); setSelectedMomentId(null); event.currentTarget.setPointerCapture(event.pointerId) }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
                  const rect = event.currentTarget.closest('.editor-frame')?.getBoundingClientRect()
                  if (rect) updateTextLayer(layer.id, { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) })
                }}
                onDoubleClick={(event) => { event.stopPropagation(); const text = window.prompt('Edit text layer', layer.text); if (text !== null) updateTextLayer(layer.id, { text }) }}
                title="Drag to position · double-click to edit text">{layer.text}</div>
            })}
            {selectingSubject && (
              <div
                className="subject-select-layer"
                onPointerDown={onSubjectPointerDown}
                onPointerMove={onSubjectPointerMove}
                onPointerUp={onSubjectPointerUp}
                onPointerCancel={onSubjectPointerUp}
              >
                <span className="subject-select-hint">Drag around the person or object to track</span>
              </div>
            )}
            {subjectSelection && fullSourcePreview && subjectBoxStyle && (
              <div className="subject-selection-box" style={subjectBoxStyle} aria-label="Selected tracking target">
                <span>Tracking target</span>
              </div>
            )}
            {(cameraEditing || baseCropEditing) && !selectingSubject && cameraFrameStyle && (
              <div
                className="camera-frame-gizmo"
                style={cameraFrameStyle}
                onPointerDown={onCameraPointerDown}
                onPointerMove={onCameraPointerMove}
                onPointerUp={onCameraPointerUp}
                onPointerCancel={onCameraPointerUp}
                aria-label="Virtual camera frame; drag to reposition, use corner handle to zoom"
              >
                <span className="camera-frame-label">{clip.aspectRatio} {baseCropEditing ? 'crop window' : 'camera frame'}</span>
                <span className="camera-frame-center" />
                {showSafeAreaGuides && <>
                  <span className="camera-safe-zone camera-safe-zone-top" />
                  <span className="camera-safe-zone camera-safe-zone-bottom" />
                  <span className="camera-safe-zone camera-safe-zone-center" />
                </>}
                <span className="camera-frame-third camera-frame-third-v1" />
                <span className="camera-frame-third camera-frame-third-v2" />
                <span className="camera-frame-third camera-frame-third-h1" />
                <span className="camera-frame-third camera-frame-third-h2" />
                {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((handle) => <span key={handle} className={`camera-frame-handle camera-frame-handle-${handle}`} data-camera-resize={handle} />)}
              </div>
            )}
            {videoError && (
              <div className="playback-error">
                <div>
                  <AlertTriangle size={26} className="icon-big" />
                  <h4>Playback problem</h4>
                  <p>{videoError}</p>
                  {playback?.verdict === 'proxy' && !playback.proxyExists && (
                    <button className="btn primary sm" onClick={() => void createProxy()} disabled={proxyRunning}>
                      {proxyRunning ? <Spinner size={11} /> : <Zap size={12} />}
                      {proxyRunning ? 'Building proxy…' : 'Create preview proxy'}
                    </button>
                  )}
                  {playback?.verdict === 'proxy' && playback.proxyExists && (
                    <p style={{ marginTop: 8 }}>
                      A proxy exists — reloading the preview.
                      <br />
                      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setVideoError(null)}>
                        Retry playback
                      </button>
                    </p>
                  )}
                  {playback?.verdict === 'native' && (
                    <p style={{ marginTop: 8, color: 'var(--text-3)' }}>
                      Rendering and silence detection still work — only in-app preview playback is affected.
                    </p>
                  )}
                </div>
              </div>
            )}
            {!fullSourcePreview && clip.captionStyleId !== 'none' && (
              <CaptionPreview
                cues={cues}
                style={style}
                fontSizePct={clip.captionOverrides.fontSizePct}
                positionY={clip.captionOverrides.positionY}
                emphasis={clip.captionOverrides.emphasis}
                uppercase={clip.captionOverrides.uppercase}
                textColor={clip.captionOverrides.textColor}
                highlightColor={clip.captionOverrides.highlightColor}
                boxOpacity={clip.captionOverrides.boxOpacity}
                outlineWidth={clip.captionOverrides.outlineWidth}
                shadow={clip.captionOverrides.shadow}
                currentTime={currentTime}
                containerHeight={frame.h}
                selectedCueKey={selectedCueKey}
                onSelectCue={(cue) => { setSelectedCueKey(cue.key); setSelectedTimelineItem(null); setSelectedTextLayerId(null); setSelectedMomentId(null) }}
                onEditCue={(cue) => { setSelectedCueKey(cue.key); setSelectedTimelineItem(null); setSelectedTextLayerId(null); setSelectedMomentId(null); seekTo(cue.startTime) }}
              />
            )}
          </div>
          </div>

          <div className="transport" title="Space play/pause · J/K/L shuttle · , . frame step · I/O trim">
            <span className="timecode">
              {formatClock(currentTime, true)} <span className="total">/ {formatClock(project.duration ?? 0, true)}</span>
            </span>
            <span className="transport-gap" />
            <div className="transport-controls">
              <button className="btn ghost sm icon" onClick={() => seekTo(clip.startTime)} aria-label="Return to clip start" title="Go to clip start (Home)">
                <SkipBack size={14} />
              </button>
              <button className="btn transport-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button className="btn ghost sm icon" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>
            <span className="transport-gap" />
            {playing && videoRef.current && videoRef.current.playbackRate > 1 && (
              <span className="tl-badge preview">{videoRef.current.playbackRate}×</span>
            )}
            <button className="btn ghost sm icon" onClick={togglePreviewFullscreen} title={isFullscreenPreview ? 'Exit full screen preview' : 'Full screen preview'} aria-label={isFullscreenPreview ? 'Exit full screen preview' : 'Full screen preview'}>
              <Maximize2 size={14} />
            </button>
            <span className="tiny transport-meta">
              {cues.length} captions{activeCue ? ` · “${activeCue.text.slice(0, 34)}${activeCue.text.length > 34 ? '…' : ''}”` : ''}
            </span>
          </div>
        </div>

        {inspectorOpen && <button className="editor-inspector-backdrop" aria-label="Close inspector" onClick={() => { setInspectorOpen(false); inspectorToggleRef.current?.focus() }} />}
        <aside id="editor-inspector" className={`editor-inspector${inspectorOpen ? ' mobile-open' : ''}`} aria-label="Edit properties">
          <div className="inspector-mobile-heading"><strong>Properties</strong><button ref={inspectorCloseRef} className="btn ghost sm icon" onClick={() => { setInspectorOpen(false); inspectorToggleRef.current?.focus() }} aria-label="Close properties"><CloseIcon size={15} /></button></div>
          {selectedTimelineItem ? <>
            <div className="inspector-context-heading"><span>{selectedTimelineAsset?.mediaType ?? 'Media'} properties</span><strong>{selectedTimelineAsset?.name ?? 'Missing media'}</strong></div>
            <TimelineInspector item={selectedTimelineItem} asset={selectedTimelineAsset} onChange={(patch) => {
              const updated = { ...selectedTimelineItem, ...patch }
              setSelectedTimelineItem(updated)
              scheduleTimelineSave({ ...clipTimeline, items: clipTimeline.items.map((item) => item.id === updated.id ? updated : item) })
            }} />
          </> : selectedTextLayerId && clip.textLayers.some((layer) => layer.id === selectedTextLayerId) ? <>
            <div className="inspector-context-heading"><span>Text properties</span><strong>{clip.textLayers.find((layer) => layer.id === selectedTextLayerId)?.text || 'Text layer'}</strong></div>
            <TextLayerInspector layers={clip.textLayers} selectedId={selectedTextLayerId} currentTime={currentTime} onAdd={addTextLayer}
              onSelect={(layer) => { setSelectedTextLayerId(layer.id); seekTo(layer.startTime) }} onChange={updateTextLayer} onDelete={deleteSelectedTextLayer} onAddKeyframe={addTextKeyframe} onSeek={seekTo} />
          </> : selectedCueKey ? <>
            <div className="inspector-context-heading"><span>Caption properties</span><strong>{cues.find((cue) => cue.key === selectedCueKey)?.text ?? 'Caption'}</strong></div>
            <div className={`cap-panel${selectedCueKey ? ' has-cue' : ''}`}>
              <CaptionsPanel clip={clip} cues={cues} updateClip={updateClip} selectedCueKey={selectedCueKey} currentTime={currentTime}
                onSelectCue={(cue) => { setSelectedCueKey(cue.key); seekTo(cue.startTime) }} />
            </div>
          </> : selectedMoment ? <div className="inspector-moment-details"><div className="inspector-context-heading"><span>AI moment</span><strong>{selectedMoment.title}</strong></div>
            <p>{selectedMoment.reason}</p><p>{selectedMoment.transcriptExcerpt}</p><div className="inspector-moment-meta">{formatClock(selectedMoment.startTime, true)} – {formatClock(selectedMoment.endTime, true)} · Score {Math.round(selectedMoment.overallScore ?? 0)}</div>
          </div> : <div className="inspector-empty"><Film size={24} /><strong>Select a clip to edit</strong><span>Choose a media item, text, caption, or moment to see its controls here.</span></div>}
          <details className="inspector-advanced">
            <summary>Clip, camera &amp; export settings</summary>
            <div className="inspector-advanced-content">
          <details className="inspector-section" open>
            <summary>
              <Scissors size={12} /> Trim <ChevronRight size={13} className="chev" />
            </summary>
            <div className="inspector-body">
              <TrimPanel
                clip={clip}
                currentTime={currentTime}
                updateClip={updateClip}
                cues={cues}
                onSeek={seekTo}
                segments={segments}
                onOptimize={async () => {
                  try {
                    if (!await flushSavesRef.current.clip()) return
                    const latestClip = clipRef.current ?? clip
                    if (!await saveNowRef.current(snapshotOf(latestClip), latestClip.id)) return
                    const result = await api['clips.optimizeBoundaries']({ clipId: latestClip.id })
                    pushHistory()
                    dispatchClipCommand({ type: 'clip.restore', snapshot: snapshotOf(result.clip), issuedAt: Date.now() })
                    historyRef.current.lastPush = Date.now()
                    app.toast({
                      level: 'success',
                      message: result.adjusted
                        ? `Boundaries optimized (quality ${Math.round(result.quality.before.score * 100)}% → ${Math.round(result.quality.after.score * 100)}%).`
                        : 'Boundaries were already clean — nothing to change.',
                      hint: `${result.startReason}; ${result.endReason}`
                    })
                  } catch (err) {
                    app.toast({ level: 'error', ...errMessage(err) })
                  }
                }}
              />
            </div>
          </details>

          <details className="inspector-section" open>
            <summary>
              <Eraser size={12} /> Silence removal <ChevronRight size={13} className="chev" />
            </summary>
            <div className="inspector-body">
              <SilencePanel
                clip={clip}
                selectedIndex={selectedSilenceIndex}
                onSelect={setSelectedSilenceIndex}
                onPreviewRange={previewSilenceRange}
                onCutsChanged={(c) => updateClip({ silenceCuts: c })}
              />
            </div>
          </details>

          <details className="inspector-section" open>
            <summary>
              <Headphones size={12} /> Audio restoration <ChevronRight size={13} className="chev" />
            </summary>
            <div className="inspector-body">
              <AudioRestorationPanel clip={clip} hasAudio={project.hasAudio} updateClip={updateClip} />
            </div>
          </details>

          {!selectedCueKey && <details className="inspector-section" open>
            <summary>
              <Type size={12} /> Captions <ChevronRight size={13} className="chev" />
            </summary>
            <div className="inspector-body">
              <CaptionsPanel
                clip={clip}
                cues={cues}
                updateClip={updateClip}
                selectedCueKey={selectedCueKey}
                currentTime={currentTime}
                onSelectCue={(cue) => { setSelectedCueKey(cue.key); setSelectedTimelineItem(null); setSelectedTextLayerId(null); seekTo(cue.startTime) }}
              />
            </div>
          </details>}

          <details className="inspector-section">
            <summary>
              <Crop size={12} /> Crop &amp; framing <ChevronRight size={13} className="chev" />
            </summary>
            <div className="inspector-body">
              <CropPanel
                clip={clip}
                sourceSize={{ w: project.width ?? 1920, h: project.height ?? 1080 }}
                updateClip={updateClip}
                cropEditing={baseCropEditing}
                showSafeArea={showSafeAreaGuides}
                onToggleSafeArea={() => setShowSafeAreaGuides((value) => !value)}
                onToggleCropEditing={() => {
                  if (clip.cameraKeyframes.length || clip.trackingKeyframes.length) return
                  setCameraEditing(false)
                  setBaseCropEditing((value) => !value)
                }}
                selectingSubject={selectingSubject}
                hasSubjectSelection={subjectSelection !== null}
                trackingBusy={trackingBusy}
                onBeginSubjectSelection={beginSubjectSelection}
                onCancelSubjectSelection={() => { setSelectingSubject(false); setSubjectDragStart(null); setSubjectSelection(null) }}
                onTrackSubject={() => void trackSelectedSubject()}
                onClearTracking={() => { updateClip({ trackingKeyframes: [] }, true); setSubjectSelection(null) }}
              />
            </div>
          </details>

          <details className="inspector-section" open>
            <summary>
              <Target size={12} /> Camera keyframes <ChevronRight size={13} className="chev" />
            </summary>
            <div className="inspector-body">
              <CameraPanel
                clip={clip}
                currentTime={currentTime}
                cameraState={cameraState ? { ...cameraState, time: currentTime } : makeCameraKeyframe(currentTime)}
                selectedKeyframe={selectedCameraKeyframe}
                canPaste={hasCameraClipboard}
                editing={cameraEditing}
                onToggleEditing={() => { setBaseCropEditing(false); setCameraEditing((value) => !value) }}
                onAdd={addCameraKeyframe}
                onChange={changeSelectedCameraKeyframe}
                onDelete={deleteSelectedCameraKeyframe}
                onPrevious={() => {
                  const keys = [...clip.cameraKeyframes].sort((a, b) => a.time - b.time)
                  const previous = [...keys].reverse().find((key) => key.time < currentTime - frameTimeTolerance(data.activeProject?.fps))
                  if (previous) selectCameraKeyframe(previous)
                }}
                onNext={() => {
                  const next = [...clip.cameraKeyframes].sort((a, b) => a.time - b.time).find((key) => key.time > currentTime + frameTimeTolerance(data.activeProject?.fps))
                  if (next) selectCameraKeyframe(next)
                }}
                onDuplicate={() => {
                  const source = selectedCameraKeyframe ?? makeCameraKeyframe(currentTime)
                  const time = Math.min(clip.endTime - 0.02, Math.max(clip.startTime, source.time + 1))
                  storeCameraKeyframe({ ...source, time })
                  seekTo(time)
                }}
                onCopy={() => {
                  const source = selectedCameraKeyframe ?? makeCameraKeyframe(currentTime)
                  cameraClipboardRef.current = { x: source.x, y: source.y, scale: source.scale, rotation: source.rotation, easing: source.easing }
                  setHasCameraClipboard(true)
                }}
                onPaste={() => {
                  if (!cameraClipboardRef.current) return
                  changeSelectedCameraKeyframe(cameraClipboardRef.current)
                }}
                onReset={() => {
                  pushHistory()
                  updateClip({ cameraKeyframes: [], trackingKeyframes: [], cropMode: 'center', cropX: 0.5, zoom: 1 }, true, false)
                  setSelectedCameraKeyframeTime(null)
                  setCameraEditing(false)
                }}
                onChangeTime={(time) => {
                  if (!selectedCameraKeyframe) return
                  const clamped = Math.min(clip.endTime - 0.02, Math.max(clip.startTime, time))
                  const moved = clip.cameraKeyframes.filter((key) =>
                    Math.abs(key.time - selectedCameraKeyframe.time) >= frameTimeTolerance(data.activeProject?.fps) && Math.abs(key.time - clamped) >= frameTimeTolerance(data.activeProject?.fps)
                  )
                  moved.push({ ...selectedCameraKeyframe, time: clamped })
                  moved.sort((a, b) => a.time - b.time)
                  pushHistory()
                  updateClip({ cameraKeyframes: moved }, true, false)
                  setSelectedCameraKeyframeTime(clamped)
                  seekTo(clamped)
                }}
              />
            </div>
          </details>

          {!selectedTextLayerId && <details className="inspector-section" open>
            <summary><Type size={12} /> Text / graphics <ChevronRight size={13} className="chev" /></summary>
            <div className="inspector-body">
              <TextLayerInspector layers={clip.textLayers} selectedId={selectedTextLayerId} currentTime={currentTime}
                onAdd={addTextLayer} onSelect={(layer) => { setSelectedTextLayerId(layer.id); seekTo(layer.startTime) }}
                onChange={updateTextLayer} onDelete={deleteSelectedTextLayer} onAddKeyframe={addTextKeyframe} onSeek={seekTo} />
            </div>
          </details>}

          <details className="inspector-section" open>
            <summary>
              <Gauge size={12} /> Output &amp; quality <ChevronRight size={13} className="chev" />
            </summary>
            <div className="inspector-body">
              <OutputPanel
                clip={clip}
                project={project}
                outputSeconds={outputSeconds}
                updateClip={updateClip}
                onQuickPreview={() => void queueRender(true)}
                previewQueued={previewQueued}
              />
            </div>
          </details>

          <details className="inspector-section">
            <summary>
              <Tags size={12} /> Metadata <ChevronRight size={13} className="chev" />
            </summary>
            <div className="inspector-body">
              <MetadataPanel clip={clip} updateClip={updateClip} />
            </div>
          </details>
            </div>
          </details>
        </aside>
      </div>

      {/* -------------------------------------------------- timeline + tp -- */}
      <div className="editor-bottom" style={{ height: timelineHeight }}>
        <div className="timeline-resize-handle" role="separator" aria-label="Resize timeline panel" aria-orientation="horizontal" title="Drag to resize timeline" onPointerDown={beginTimelineResize}><MoveVertical size={13} /><span>Drag to resize workspace</span></div>

        <MultiTrackTimeline
          timeline={clipTimeline}
          assets={data.assets}
          waveforms={assetWaveforms}
          duration={Math.max(project.duration ?? 0, ...clipTimeline.items.map(timelineItemEnd), 1)}
          captions={cues.map((cue) => ({ key: cue.key, startTime: cue.startTime, endTime: cue.endTime, text: cue.text }))}
          captionOffsets={clip.captionTimingOffsets}
          textLayers={clip.textLayers}
          trackingKeyframes={clip.trackingKeyframes}
          cameraKeyframes={clip.cameraKeyframes}
          silenceCuts={clip.silenceCuts}
          sourceWaveform={waveform}
          fps={project.fps}
          selectedSource={sourceClipSelected}
          selectedItemId={selectedTimelineItem?.id ?? null}
          selectedCaptionKey={selectedCueKey}
          selectedSilenceIndex={selectedSilenceIndex}
          selectedTextLayerId={selectedTextLayerId}
          selectedCameraKeyframeTime={selectedCameraKeyframeTime}
          playing={playing}
          getPlaybackTime={getPlaybackTime}
          currentTime={currentTime}
          onSeek={seekTo}
          onChange={scheduleTimelineSave}
          onNotice={(message) => app.toast({ level: 'info', message })}
          snapTargets={[...(clip.silenceCuts ?? []).flatMap((cut) => [cut.start, cut.end]), ...(clip.cameraKeyframes ?? []).map((keyframe) => keyframe.time)]}
          onDropFiles={(paths, time, track) => void importAssets(paths, { time, track })}
          sourceClip={{ name: clip.title, startTime: clip.startTime, endTime: clip.endTime, filmstrip: filmstrip ?? [] }}
          onChangeSourceRange={(startTime, endTime) => updateClip({ startTime, endTime })}
          onChangeSilence={(index, start, end) => {
            const next = [...clip.silenceCuts]
            const region = next[index]
            if (!region) return
            next[index] = { ...region, start, end, status: 'removed' }
            updateClip({ silenceCuts: next })
          }}
          onSetCaptionOffset={(key, requestedOffset, edge) => {
            const cue = cues.find((item) => item.key === key)
            if (!cue) return
            const offsets = { ...clip.captionTimingOffsets }
            const mapKey = edge === 'move' ? key : `${key}/${edge}`
            const currentOffset = offsets[mapKey] ?? (edge === 'move' ? 0 : offsets[key] ?? 0)
            const baselineStart = cue.startTime - currentOffset
            const baselineEnd = cue.endTime - currentOffset
            const cueIndex = cues.findIndex((item) => item.key === key)
            const prev = cues[cueIndex - 1]
            const next = cues[cueIndex + 1]
            let allowedMin = -5
            let allowedMax = 5
            if (edge === 'start') {
              allowedMin = Math.max(allowedMin, clip.startTime - baselineStart)
              allowedMax = Math.min(allowedMax, cue.endTime - 0.15 - baselineStart)
              if (prev) allowedMin = Math.max(allowedMin, prev.endTime + 0.04 - baselineStart)
            } else if (edge === 'end') {
              allowedMin = Math.max(allowedMin, cue.startTime + 0.15 - baselineEnd)
              allowedMax = Math.min(allowedMax, clip.endTime - baselineEnd)
              if (next) allowedMax = Math.min(allowedMax, next.startTime - 0.04 - baselineEnd)
            } else {
              allowedMin = Math.max(allowedMin, clip.startTime - baselineStart)
              allowedMax = Math.min(allowedMax, clip.endTime - baselineEnd)
              if (prev) allowedMin = Math.max(allowedMin, prev.endTime + 0.04 - baselineStart)
              if (next) allowedMax = Math.min(allowedMax, next.startTime - 0.04 - baselineEnd)
            }
            const nextOffset = Math.max(allowedMin, Math.min(allowedMax, requestedOffset))
            if (Math.abs(nextOffset) < 0.001) delete offsets[mapKey]
            else offsets[mapKey] = nextOffset
            updateClip({ captionTimingOffsets: offsets })
          }}
          onSelectTextLayer={(layer) => { setSelectedTextLayerId(layer.id); setSelectedTimelineItem(null); setSelectedCueKey(null); setSelectedMomentId(null); seekTo(layer.startTime) }}
          onChangeTextLayer={updateTextLayer}
          onSelectItem={(item) => { setSelectedTimelineItem(item); setSourceClipSelected(false); if (item) { setSelectedCueKey(null); setSelectedTextLayerId(null); setSelectedMomentId(null) } }}
          onSelectCaption={(key) => { setSelectedCueKey(key); setSelectedTimelineItem(null); setSourceClipSelected(false); setSelectedTextLayerId(null); setSelectedMomentId(null) }}
          onSelectSource={() => { setActiveTool('clip'); setSelectedTimelineItem(null); setSourceClipSelected(true); setSelectedCueKey(null); setSelectedTextLayerId(null); setSelectedMomentId(null) }}
          onSelectSilence={(index) => { setSelectedSilenceIndex(index); setActiveTool('clip') }}
          onSelectCameraKeyframe={(time) => { const keyframe = clip.cameraKeyframes.find((item) => Math.abs(item.time - time) < frameTimeTolerance(data.activeProject?.fps)); if (keyframe) selectCameraKeyframe(keyframe); setActiveTool('camera') }}
          onMoveCameraKeyframe={(oldTime, requestedTime) => {
            const moving = clip.cameraKeyframes.find((key) => Math.abs(key.time - oldTime) < frameTimeTolerance(data.activeProject?.fps))
            if (!moving) return
            const time = Math.min(clip.endTime - 0.02, Math.max(clip.startTime, requestedTime))
            const next = clip.cameraKeyframes.filter((key) => Math.abs(key.time - oldTime) >= frameTimeTolerance(data.activeProject?.fps) && Math.abs(key.time - time) >= frameTimeTolerance(data.activeProject?.fps))
            next.push({ ...moving, time })
            next.sort((a, b) => a.time - b.time)
            pushHistory()
            updateClip({ cameraKeyframes: next }, false, false)
            setSelectedCameraKeyframeTime(time)
          }}
          onSelectTrackingKeyframe={(keyframe) => seekTo(keyframe.time)}
        />
      </div>
    </div>
  )
}

function TextLayerInspector(props: {
  layers: TextLayer[]; selectedId: string | null; currentTime: number
  onAdd: () => void; onSelect: (layer: TextLayer) => void
  onChange: (id: string, patch: Partial<TextLayer>) => void
  onDelete: () => void; onAddKeyframe: () => void; onSeek: (time: number) => void
}) {
  const layer = props.layers.find((item) => item.id === props.selectedId)
  return <div className="stack sm">
    <button className="btn primary sm" onClick={props.onAdd}><Type size={12} /> Add text layer</button>
    {props.layers.length > 0 && <div className="stack xs">{props.layers.map((item, index) => <button key={item.id} className={`btn sm ${item.id === props.selectedId ? 'primary' : ''}`} onClick={() => props.onSelect(item)}>{index + 1}. {item.text || 'Untitled text'} · {formatClock(item.startTime, true)}–{formatClock(item.endTime, true)}</button>)}</div>}
    {!layer ? <div className="field-hint">Add a text layer, then drag it in the preview. Double-click its preview text to edit it.</div> : <>
      <Field label="Text"><textarea className="textarea" rows={3} maxLength={2000} value={layer.text} onChange={(e) => props.onChange(layer.id, { text: e.target.value })} /></Field>
      <div className="row" style={{ gap: 8 }}>
        <Field label="Start (sec)"><input className="input" type="number" step="0.1" value={layer.startTime} onChange={(e) => props.onChange(layer.id, { startTime: Math.min(Number(e.target.value), layer.endTime - 0.1) })} /></Field>
        <Field label="End (sec)"><input className="input" type="number" step="0.1" value={layer.endTime} onChange={(e) => props.onChange(layer.id, { endTime: Math.max(Number(e.target.value), layer.startTime + 0.1) })} /></Field>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Field label={`X · ${Math.round(layer.x * 100)}%`}><input type="range" min="0" max="1" step="0.01" value={layer.x} onChange={(e) => props.onChange(layer.id, { x: Number(e.target.value) })} /></Field>
        <Field label={`Y · ${Math.round(layer.y * 100)}%`}><input type="range" min="0" max="1" step="0.01" value={layer.y} onChange={(e) => props.onChange(layer.id, { y: Number(e.target.value) })} /></Field>
      </div>
      <Field label={`Size · ${layer.fontSize}px`}><input type="range" min="16" max="160" step="1" value={layer.fontSize} onChange={(e) => props.onChange(layer.id, { fontSize: Number(e.target.value) })} /></Field>
      <div className="row" style={{ gap: 8 }}>
        <Field label="Font"><select className="select" value={layer.fontFamily} onChange={(e) => { const family = e.target.value; const first = CAPTION_FONTS.find((face) => face.family === family)!; props.onChange(layer.id, { fontFamily: family, fontWeight: first.weight }) }}>{[...new Set(CAPTION_FONTS.map((face) => face.family))].map((family) => <option key={family}>{family}</option>)}</select></Field>
        <Field label="Weight"><select className="select" value={layer.fontWeight} onChange={(e) => props.onChange(layer.id, { fontWeight: Number(e.target.value) })}>{CAPTION_FONTS.filter((face) => face.family === layer.fontFamily).map((face) => <option key={`${face.weight}-${face.file}`} value={face.weight}>{face.style} ({face.weight})</option>)}</select></Field>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <label className="tiny">Text color <input type="color" className="color-input" value={layer.color} onChange={(e) => props.onChange(layer.id, { color: e.target.value })} /></label>
        <label className="tiny">Box color <input type="color" className="color-input" value={layer.backgroundColor} onChange={(e) => props.onChange(layer.id, { backgroundColor: e.target.value })} /></label>
        <Field label={`Scale · ${layer.scale.toFixed(2)}×`}><input type="range" min="0.25" max="3" step="0.05" value={layer.scale} onChange={(e) => props.onChange(layer.id, { scale: Number(e.target.value) })} /></Field>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Field label={`Rotation · ${Math.round(layer.rotation)}°`}><input type="range" min="-180" max="180" step="1" value={layer.rotation} onChange={(e) => props.onChange(layer.id, { rotation: Number(e.target.value) })} /></Field>
        <Field label={`Opacity · ${Math.round(layer.opacity * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={layer.opacity} onChange={(e) => props.onChange(layer.id, { opacity: Number(e.target.value) })} /></Field>
      </div>
      <Field label={`Background · ${Math.round(layer.backgroundOpacity * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={layer.backgroundOpacity} onChange={(e) => props.onChange(layer.id, { backgroundOpacity: Number(e.target.value) })} /></Field>
      <div className="row" style={{ gap: 8 }}>
        <Field label="Animate in"><select className="select" value={layer.animationIn} onChange={(e) => props.onChange(layer.id, { animationIn: e.target.value as TextLayer['animationIn'] })}>{['none','fade','rise','pop','slide'].map((a) => <option key={a}>{a}</option>)}</select></Field>
        <Field label="Animate out"><select className="select" value={layer.animationOut} onChange={(e) => props.onChange(layer.id, { animationOut: e.target.value as TextLayer['animationOut'] })}>{['none','fade','slide'].map((a) => <option key={a}>{a}</option>)}</select></Field>
      </div>
      <div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={props.onAddKeyframe}>Add keyframe at {formatClock(props.currentTime, true)}</button><button className="btn danger sm" onClick={props.onDelete}><Trash2 size={12} /> Delete</button></div>
      <div className="field-hint">Keyframes animate position, scale, rotation, and opacity between saved points.</div>
      {layer.keyframes.map((keyframe) => <div key={keyframe.time} className="row" style={{ gap: 5 }}><button className="btn ghost sm" onClick={() => props.onSeek(keyframe.time)}>◆ {formatClock(keyframe.time, true)} · X {Math.round(keyframe.x * 100)}% · Y {Math.round(keyframe.y * 100)}% · {keyframe.scale.toFixed(2)}×</button><button className="btn ghost sm" aria-label="Delete text keyframe" onClick={() => props.onChange(layer.id, { keyframes: layer.keyframes.filter((item) => item.time !== keyframe.time) })}>×</button></div>)}
    </>}
  </div>
}

// ========================================================== camera panel ===

function CameraPanel(props: {
  clip: Clip
  currentTime: number
  cameraState: CameraKeyframe
  selectedKeyframe: CameraKeyframe | null
  canPaste: boolean
  editing: boolean
  onToggleEditing: () => void
  onAdd: () => void
  onChange: (patch: Partial<CameraKeyframe>) => void
  onChangeTime: (time: number) => void
  onDelete: () => void
  onPrevious: () => void
  onNext: () => void
  onDuplicate: () => void
  onCopy: () => void
  onPaste: () => void
  onReset: () => void
}) {
  const value = props.selectedKeyframe ?? { ...props.cameraState, time: props.currentTime }
  const hasKeys = props.clip.cameraKeyframes.length > 0
  return (
    <div className="stack sm">
      <div className="row" style={{ gap: 6 }}>
        <button className={`btn sm ${props.editing ? 'primary' : ''}`} onClick={props.onToggleEditing} style={{ flex: 1 }}>
          <Crop size={12} /> {props.editing ? 'Done framing' : 'Edit camera frame'}
        </button>
        <button className="btn sm primary" onClick={props.onAdd}>
          <Target size={12} /> Add Keyframe
        </button>
      </div>
      {props.editing && <div className="field-hint">Drag the outlined frame to position it. Drag its lower-right handle to change scale. These edits create or update a keyframe here.</div>}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn ghost sm" onClick={props.onPrevious} disabled={!hasKeys} title="Previous camera keyframe">Previous</button>
        <button className="btn ghost sm" onClick={props.onNext} disabled={!hasKeys} title="Next camera keyframe">Next</button>
        <span className="tiny mono" style={{ marginLeft: 'auto' }}>{hasKeys ? `${props.clip.cameraKeyframes.length} keys` : 'Static camera'}</span>
      </div>
      <div className="camera-value-grid">
        <Field label="X position (0–1)">
          <input className="input mono" type="number" min={0} max={1} step={0.01} value={value.x.toFixed(3)} onChange={(e) => props.onChange({ x: Math.max(0, Math.min(1, Number(e.target.value))) })} />
        </Field>
        <Field label="Y position (0–1)">
          <input className="input mono" type="number" min={0} max={1} step={0.01} value={value.y.toFixed(3)} onChange={(e) => props.onChange({ y: Math.max(0, Math.min(1, Number(e.target.value))) })} />
        </Field>
        <Field label={`Scale · ${value.scale.toFixed(2)}×`}>
          <input type="range" min={1} max={3} step={0.05} value={value.scale} onChange={(e) => props.onChange({ scale: Number(e.target.value) })} />
        </Field>
        <Field label={`Rotation · ${value.rotation.toFixed(0)}°`}>
          <input type="range" min={-45} max={45} step={1} value={value.rotation} onChange={(e) => props.onChange({ rotation: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <Field label="Keyframe time (source seconds)">
          <input className="input mono" type="number" min={props.clip.startTime} max={props.clip.endTime} step={0.01} value={(props.selectedKeyframe?.time ?? props.currentTime).toFixed(3)} disabled={!props.selectedKeyframe} onChange={(e) => props.onChangeTime(Number(e.target.value))} />
        </Field>
        <Field label="Transition to next">
          <select className="select" value={value.easing} onChange={(e) => props.onChange({ easing: e.target.value as CameraKeyframe['easing'] })}>
            <option value="cut">Cut at this keyframe</option>
            <option value="ease-in-out">Ease in/out</option>
            <option value="linear">Linear</option>
            <option value="ease-in">Ease in</option>
            <option value="ease-out">Ease out</option>
            <option value="hold">Hold previous framing until next keyframe</option>
          </select>
        </Field>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button className="btn ghost sm" onClick={props.onDuplicate} disabled={!hasKeys}>Duplicate</button>
        <button className="btn ghost sm" onClick={props.onCopy}><Copy size={11} /> Copy camera</button>
        <button className="btn ghost sm" onClick={props.onPaste} disabled={!props.canPaste} title={props.canPaste ? 'Paste copied camera position, scale, rotation and interpolation' : 'Copy a camera keyframe first'}>Paste camera</button>
        <button className="btn ghost sm" onClick={props.onDelete} disabled={!props.selectedKeyframe}><X size={11} /> Delete</button>
        <button className="btn ghost sm" onClick={props.onReset}><RotateCcw size={11} /> Reset camera</button>
      </div>
      <div className="field-hint">Camera keyframes use source time, so silence cuts remap them with the retained video segments. Tracking creates editable camera control points.</div>
    </div>
  )
}

// ==================================================== audio restoration ---

function AudioRestorationPanel(props: {
  clip: Clip
  hasAudio: boolean
  updateClip: (patch: Partial<Clip>, immediate?: boolean) => void
}) {
  const [preview, setPreview] = useState<{ beforePath: string; afterPath: string; duration: number } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<unknown>(null)
  const beforeRef = useRef<HTMLAudioElement>(null)
  const afterRef = useRef<HTMLAudioElement>(null)
  const preset = props.clip.audioRestoration ?? 'off'

  useEffect(() => {
    beforeRef.current?.pause()
    afterRef.current?.pause()
    setPreview(null)
    setPreviewError(null)
  }, [props.clip.id, props.clip.audioRestoration, props.clip.startTime, props.clip.endTime])

  async function makePreview() {
    setPreviewError(null)
    setPreviewing(true)
    try {
      const result = await api['audio.previewRestoration']({ clipId: props.clip.id })
      setPreview(result)
    } catch (error) {
      setPreviewError(error)
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="stack sm">
      <Field label="Noise reduction" hint="Non-destructive: the original file is never changed. The selected cleanup is applied when you render this clip.">
        <select
          className="select"
          value={preset}
          disabled={!props.hasAudio}
          onChange={(event) => props.updateClip({ audioRestoration: event.target.value as Clip['audioRestoration'] })}
        >
          {AUDIO_RESTORATION_PRESETS.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}
        </select>
      </Field>
      <div className="field-hint">Uses FFmpeg voice-band high-pass and adaptive noise reduction. Imported timeline music/effects are left untouched. Strong cleanup can soften quiet speech.</div>
      <button className="btn sm" onClick={() => void makePreview()} disabled={!props.hasAudio || preset === 'off' || previewing}>
        {previewing ? <Spinner size={12} /> : <Headphones size={12} />}
        {previewing ? 'Preparing A/B sample…' : `Compare before / after (${preset})`}
      </button>
      {previewError ? <ErrorBox error={previewError} onRetry={() => setPreviewError(null)} retryLabel="Dismiss" /> : null}
      {preview && (
        <div className="audio-restoration-preview">
          <div>
            <label>Before</label>
            <audio ref={beforeRef} controls preload="metadata" src={mediaUrl(preview.beforePath)} onPlay={() => afterRef.current?.pause()} />
          </div>
          <div>
            <label>After · {preset}</label>
            <audio ref={afterRef} controls preload="metadata" src={mediaUrl(preview.afterPath)} onPlay={() => beforeRef.current?.pause()} />
          </div>
          <span className="tiny">Both are {preview.duration.toFixed(1)} seconds from this clip’s start. Play one at a time to compare.</span>
        </div>
      )}
    </div>
  )
}

// ============================================================ trim panel ===

function TrimPanel(props: {
  clip: Clip
  currentTime: number
  updateClip: (patch: Partial<Clip>, immediate?: boolean) => void
  cues: import('@shared/captions/segmentation').CaptionCue[]
  onSeek: (t: number) => void
  segments: TranscriptSegment[]
  onOptimize: () => Promise<void>
}) {
  const [optimizing, setOptimizing] = useState(false)
  const { clip, currentTime } = props
  const nudge = (field: 'startTime' | 'endTime', delta: number) => {
    if (field === 'startTime') {
      props.updateClip({ startTime: Math.min(Math.max(0, clip.startTime + delta), clip.endTime - 0.5) }, true)
    } else {
      props.updateClip({ endTime: Math.max(clip.endTime + delta, clip.startTime + 0.5) }, true)
    }
  }
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <button
          className="btn sm"
          style={{ flex: 1 }}
          disabled={optimizing}
          onClick={async () => {
            setOptimizing(true)
            try {
              await props.onOptimize()
            } finally {
              setOptimizing(false)
            }
          }}
          title="Snap the clip edges to sentence boundaries and add lead-in context where the opener needs setup"
        >
          {optimizing ? <Spinner size={11} /> : <Wand2 size={12} />} Optimize boundaries
        </button>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Start (set with <span className="kbd">I</span>)</label>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn sm" onClick={() => nudge('startTime', -0.5)} aria-label="Nudge start earlier">−0.5s</button>
            <input
              className="input"
              type="number"
              step="0.1"
              value={clip.startTime.toFixed(1)}
              onChange={(e) => props.updateClip({ startTime: Math.max(0, parseFloat(e.target.value) || 0) }, true)}
            />
            <button className="btn sm" onClick={() => nudge('startTime', 0.5)} aria-label="Nudge start later">+0.5s</button>
          </div>
        </div>
        <button className="btn sm" style={{ alignSelf: 'flex-end' }} onClick={() => props.updateClip({ startTime: Math.min(currentTime, clip.endTime - 0.5) }, true)}>
          Set at playhead
        </button>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">End (set with <span className="kbd">O</span>)</label>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn sm" onClick={() => nudge('endTime', -0.5)} aria-label="Nudge end earlier">−0.5s</button>
            <input
              className="input"
              type="number"
              step="0.1"
              value={clip.endTime.toFixed(1)}
              onChange={(e) => props.updateClip({ endTime: Math.max(0.5, parseFloat(e.target.value) || 0) }, true)}
            />
            <button className="btn sm" onClick={() => nudge('endTime', 0.5)} aria-label="Nudge end later">+0.5s</button>
          </div>
        </div>
        <button className="btn sm" style={{ alignSelf: 'flex-end' }} onClick={() => props.updateClip({ endTime: Math.max(currentTime, clip.startTime + 0.5) }, true)}>
          Set at playhead
        </button>
      </div>

      <div className="divider" />
      <div className="section-title" style={{ marginBottom: 8 }}>Captions in range <span style={{ color: 'var(--text-3)', textTransform: 'none', letterSpacing: 0 }}>(click to seek)</span></div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }} className="stack sm">
        {props.cues.map((cue) => (
          <button
            key={cue.key}
            className="btn ghost"
            style={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: 12, padding: '4px 8px', height: 'auto' }}
            onClick={() => props.onSeek(cue.startTime + 0.05)}
            title="Seek to this caption"
          >
            <span className="mono tiny" style={{ width: 46, flexShrink: 0 }}>{formatClock(cue.startTime, true)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {props.clip.captionTextEdits[cue.key] ?? cue.words.map((w) => w.text).join(' ')}
            </span>
          </button>
        ))}
        {props.cues.length === 0 && <div className="tiny">No captions in this range — the transcript may not cover it.</div>}
      </div>
    </>
  )
}

// ======================================================== silence panel ===

function SilencePanel(props: {
  clip: Clip
  selectedIndex: number | null
  onCutsChanged: (cuts: Clip['silenceCuts']) => void
  onSelect: (index: number) => void
  onPreviewRange: (from: number, to: number) => void
}) {
  const app = useAppStore()
  const [detecting, setDetecting] = useState<string | null>(null)
  const clip = props.clip
  const cuts = clip.silenceCuts ?? []

  async function detect(mode: 'auto' | 'aggressive') {
    setDetecting(mode)
    try {
      const result = await api['analysis.detectSilence']({ clipId: clip.id, mode })
      const regions: Clip['silenceCuts'] = result.detected.map((detected) => {
        const cut = result.cuts.find((candidate) => candidate.start >= detected.start && candidate.end <= detected.end)
        return {
          start: cut?.start ?? detected.start,
          end: cut?.end ?? detected.end,
          detectedStart: detected.start,
          detectedEnd: detected.end,
          status: cut ? 'removed' : 'kept'
        }
      })
      props.onCutsChanged(regions)
      props.onSelect(regions.length ? 0 : -1)
      app.toast({
        level: 'success',
        message: regions.length === 0
          ? 'No removable silence found in this clip.'
          : `Found ${result.detected.length} pauses. Review and adjust each region on the timeline.`,
        hint: 'Changes are non-destructive; the original source is preserved.'
      })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    } finally {
      setDetecting(null)
    }
  }

  return (
    <>
      <div className="field-hint" style={{ marginBottom: 8 }}>
        Detected pauses stay editable. Drag a red timeline edge to adjust the cut; preview and render use the current boundaries.
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn sm" style={{ flex: 1 }} disabled={detecting !== null} onClick={() => void detect('auto')}>
          {detecting === 'auto' ? <Spinner size={11} /> : <AudioLines size={12} />} Detect (standard)
        </button>
        <button className="btn sm" style={{ flex: 1 }} disabled={detecting !== null} onClick={() => void detect('aggressive')} title="Lower thresholds - removes shorter pauses too">
          {detecting === 'aggressive' ? <Spinner size={11} /> : <AudioLines size={12} />} Aggressive
        </button>
      </div>
      {cuts.length > 0 ? (
        <>
          <div className="row tiny" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span><strong style={{ color: 'var(--text-2)' }}>{cuts.length}</strong> detected pauses ? <strong style={{ color: 'var(--danger)' }}>-{cuts.filter((c) => c.status !== 'kept').reduce((sum, c) => sum + (c.end - c.start), 0).toFixed(1)}s</strong> removed</span>
            <button className="btn ghost sm" onClick={() => props.onCutsChanged(cuts.map((c) => ({ ...c, status: 'kept' })))}><RotateCcw size={11} /> Restore all</button>
          </div>
          <div className="stack sm" style={{ maxHeight: 260, overflowY: 'auto' }}>
            {cuts.map((c, i) => {
              const detectedStart = c.detectedStart ?? c.start
              const detectedEnd = c.detectedEnd ?? c.end
              const isRemoved = c.status !== 'kept'
              const selected = props.selectedIndex === i
              return (
                <div key={`${detectedStart}-${i}`} className="panel" style={{ padding: 8, borderColor: selected ? 'var(--accent)' : undefined }}>
                  <button className="btn ghost sm" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => props.onSelect(i)}>
                    <span className="mono">Pause {formatClock(detectedStart, true)} - {formatClock(detectedEnd, true)}</span>
                    <span className="tiny" style={{ color: isRemoved ? 'var(--danger)' : 'var(--text-3)' }}>{isRemoved ? 'Removed' : 'Kept'}</span>
                  </button>
                  <div className="tiny muted" style={{ padding: '2px 5px 6px' }}>
                    Detected {(detectedEnd - detectedStart).toFixed(2)}s; removing {isRemoved ? (c.end - c.start).toFixed(2) : '0.00'}s; keeping {(detectedEnd - detectedStart - (isRemoved ? c.end - c.start : 0)).toFixed(2)}s
                  </div>
                  {selected && <>
                    <div className="row" style={{ marginBottom: 6 }}>
                      <button className="btn ghost sm" onClick={() => props.onPreviewRange(Math.max(clip.startTime, detectedStart - 0.7), detectedStart)}>Play before</button>
                      <button className="btn ghost sm" onClick={() => props.onPreviewRange(detectedStart, detectedEnd)}>Play pause</button>
                      <button className="btn ghost sm" onClick={() => props.onPreviewRange(detectedEnd, Math.min(clip.endTime, detectedEnd + 0.7))}>Play after</button>
                    </div>
                    {isRemoved && <div className="row">
                      <label className="field tiny" style={{ flex: 1 }}>Cut start
                        <input className="input" type="number" step="0.05" min={detectedStart} max={c.end - 0.08} value={c.start.toFixed(2)} onChange={(e) => {
                          const start = Math.max(detectedStart, Math.min(Number(e.target.value) || detectedStart, c.end - 0.08))
                          props.onCutsChanged(cuts.map((x, j) => j === i ? { ...x, start } : x))
                        }} />
                      </label>
                      <label className="field tiny" style={{ flex: 1 }}>Cut end
                        <input className="input" type="number" step="0.05" min={c.start + 0.08} max={detectedEnd} value={c.end.toFixed(2)} onChange={(e) => {
                          const end = Math.min(detectedEnd, Math.max(Number(e.target.value) || detectedEnd, c.start + 0.08))
                          props.onCutsChanged(cuts.map((x, j) => j === i ? { ...x, end } : x))
                        }} />
                      </label>
                    </div>}
                    <button className="btn sm" style={{ marginTop: 6, width: '100%' }} onClick={() => props.onCutsChanged(cuts.map((x, j) => j === i ? { ...x, status: isRemoved ? 'kept' : 'removed' } : x))}>
                      {isRemoved ? 'Restore this pause' : 'Remove pause'}
                    </button>
                  </>}
                </div>
              )
            })}
          </div>
        </>
      ) : <div className="tiny" style={{ color: 'var(--text-3)' }}>No silence detections on this clip.</div>}
    </>
  )
}

// ======================================================== captions panel ===

const CAPTION_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'clean', label: 'Clean' },
  { id: 'bold', label: 'Bold' },
  { id: 'creator', label: 'Creator' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'high-energy', label: 'High Energy' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'meme', label: 'Meme' },
  { id: 'social', label: 'Social' },
  { id: 'professional', label: 'Professional' }
]

function CaptionsPanel(props: {
  clip: Clip
  cues: import('@shared/captions/segmentation').CaptionCue[]
  updateClip: (patch: Partial<Clip>, immediate?: boolean) => void
  selectedCueKey: string | null
  currentTime: number
  onSelectCue: (cue: import('@shared/captions/segmentation').CaptionCue) => void
}) {
  const { clip } = props
  const [category, setCategory] = useState('all')
  const [showSafeArea, setShowSafeArea] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [fontSearch, setFontSearch] = useState('')
  const [presetFilter, setPresetFilter] = useState('all')
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('clipwright.captionFavorites') ?? '[]') } catch { return [] } })
  const [recentIds, setRecentIds] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('clipwright.captionRecent') ?? '[]') } catch { return [] } })
  const [canPasteStyle, setCanPasteStyle] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('clipwright.captionStyleClipboard') ?? 'null')
      return Boolean(saved && typeof saved.id === 'string' && saved.overrides && typeof saved.overrides === 'object')
    } catch { return false }
  })
  const [savedPresets, setSavedPresets] = useState<import('@shared/constants').CaptionStylePreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('clipwright.captionPresets') ?? '[]') } catch { return [] }
  })
  const selectedCueInput = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (!props.selectedCueKey) return
    selectedCueInput.current?.focus()
    selectedCueInput.current?.scrollIntoView({ block: 'nearest' })
  }, [props.selectedCueKey])
  const overrides: CaptionOverrides = clip.captionOverrides
  const baseStyle = getCaptionStyle(clip.captionStyleId)
  const style = { ...baseStyle, ...overrides, fontFile: overrides.fontFile ?? baseStyle.fontFile }

  const visibleStyles = useMemo(() => [...CAPTION_STYLES, ...savedPresets].filter((s) => {
    const categoryMatch = category === 'all' || (category === 'favorites' ? favoriteIds.includes(s.id) : category === 'recent' ? recentIds.includes(s.id) : s.category === category)
    const queryMatch = `${s.label} ${s.description} ${s.fontFamily ?? ''} ${s.animationIn ?? ''} ${s.wordAnimation ?? ''} ${s.emphasisBehavior ?? ''} ${s.category}`.toLowerCase().includes(templateSearch.toLowerCase())
    const filterMatch = presetFilter === 'all' || (presetFilter === 'animated' ? (s.animationIn ?? 'none') !== 'none' || (s.wordAnimation ?? 'none') !== 'none' : presetFilter === 'static' ? (s.animationIn ?? 'none') === 'none' && (s.wordAnimation ?? 'none') === 'none' : presetFilter === 'speaker' ? s.id.includes('speaker') || s.id === 'multi-speaker' : presetFilter === 'emoji' ? s.emojiBehavior !== 'off' : s.category === presetFilter)
    return categoryMatch && queryMatch && filterMatch
  }), [category, templateSearch, presetFilter, favoriteIds, recentIds, savedPresets])

  function applyTemplate(s: import('@shared/constants').CaptionStylePreset) {
    const face = CAPTION_FONTS.find((f) => f.file === s.fontFile) ?? CAPTION_FONTS.find((f) => f.family === (s.fontFamily ?? 'Inter') && f.weight === (s.fontWeight ?? 600))
    props.updateClip({ captionStyleId: CAPTION_STYLES.some((item) => item.id === s.id) ? s.id : 'classic', captionOverrides: {
      fontFile: s.fontFile, fontFamily: s.fontFamily ?? face?.family, fontWeight: s.fontWeight ?? face?.weight,
      fontSizePct: s.fontSizePct, positionY: s.positionY, emphasis: s.emphasis, uppercase: s.uppercase,
      maxWordsPerCue: s.maxWordsPerCue, textColor: s.textColor, highlightColor: s.highlightColor,
      boxOpacity: s.boxOpacity, outlineWidth: s.outlineWidth, shadow: s.shadow,
      outlineColor: s.outlineColor, boxColor: s.boxColor, cornerRadius: s.cornerRadius,
      maxCharsPerLine: s.maxCharsPerLine, maxLines: s.maxLines, emojiBehavior: s.emojiBehavior,
      safeAreaPosition: s.safeAreaPosition, animationIn: s.animationIn, animationOut: s.animationOut, wordAnimation: s.wordAnimation,
      emphasisBehavior: s.emphasisBehavior, capitalization: s.capitalization, letterSpacing: s.letterSpacing,
      lineSpacing: s.lineSpacing, alignment: s.alignment, strokeOpacity: s.strokeOpacity, shadowOpacity: s.shadowOpacity
    } })
    const recent = [s.id, ...recentIds.filter((id) => id !== s.id)].slice(0, 12)
    setRecentIds(recent)
    localStorage.setItem('clipwright.captionRecent', JSON.stringify(recent))
  }

  function toggleFavorite(id: string) {
    const next = favoriteIds.includes(id) ? favoriteIds.filter((item) => item !== id) : [...favoriteIds, id]
    setFavoriteIds(next)
    localStorage.setItem('clipwright.captionFavorites', JSON.stringify(next))
  }

  function savePreset() {
    const name = window.prompt('Name this caption preset')?.trim()
    if (!name) return
    const preset = { ...style, fontSizePct: overrides.fontSizePct ?? style.fontSizePct, positionY: overrides.positionY ?? style.positionY,
      emphasis: overrides.emphasis ?? style.emphasis, uppercase: overrides.uppercase ?? style.uppercase,
      maxWordsPerCue: overrides.maxWordsPerCue ?? style.maxWordsPerCue, textColor: overrides.textColor ?? style.textColor,
      highlightColor: overrides.highlightColor ?? style.highlightColor, boxOpacity: overrides.boxOpacity ?? style.boxOpacity,
      outlineWidth: overrides.outlineWidth ?? style.outlineWidth, shadow: overrides.shadow ?? style.shadow,
      outlineColor: overrides.outlineColor ?? style.outlineColor, boxColor: overrides.boxColor ?? style.boxColor,
      cornerRadius: overrides.cornerRadius ?? style.cornerRadius, maxCharsPerLine: overrides.maxCharsPerLine ?? style.maxCharsPerLine,
      maxLines: overrides.maxLines ?? style.maxLines, emojiBehavior: overrides.emojiBehavior ?? style.emojiBehavior,
      safeAreaPosition: overrides.safeAreaPosition ?? style.safeAreaPosition,
      animationIn: overrides.animationIn ?? style.animationIn, animationOut: overrides.animationOut ?? style.animationOut,
      wordAnimation: overrides.wordAnimation ?? style.wordAnimation, emphasisBehavior: overrides.emphasisBehavior ?? style.emphasisBehavior,
      capitalization: overrides.capitalization ?? style.capitalization, letterSpacing: overrides.letterSpacing ?? style.letterSpacing,
      lineSpacing: overrides.lineSpacing ?? style.lineSpacing, alignment: overrides.alignment ?? style.alignment,
      strokeOpacity: overrides.strokeOpacity ?? style.strokeOpacity, shadowOpacity: overrides.shadowOpacity ?? style.shadowOpacity,
      id: `custom-${Date.now()}`, label: name, description: 'Your saved caption preset', category: 'clean' as const }
    const next = [...savedPresets, preset]
    setSavedPresets(next)
    localStorage.setItem('clipwright.captionPresets', JSON.stringify(next))
  }

  function setOverride(patch: CaptionOverrides) {
    props.updateClip({ captionOverrides: { ...overrides, ...patch } })
  }

  const sampleCue = props.cues[0]
  const sampleText = (sampleCue?.words.slice(0, 3).map((w) => w.text).join(' ')) || 'Your captions here'

  return (
    <>
      <div className="cap-category-tabs" role="tablist" aria-label="Caption style categories">
        <button role="tab" aria-selected={category === 'favorites'} className={`cap-category-tab ${category === 'favorites' ? 'active' : ''}`} onClick={() => setCategory('favorites')}>Favorites</button>
        <button role="tab" aria-selected={category === 'recent'} className={`cap-category-tab ${category === 'recent' ? 'active' : ''}`} onClick={() => setCategory('recent')}>Recent</button>
        {CAPTION_CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`cap-category-tab ${category === c.id ? 'active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="row cap-search-row">
        <input className="input" value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} placeholder="Search styles" aria-label="Search caption styles" />
        <select className="select" value={presetFilter} onChange={(e) => setPresetFilter(e.target.value)} aria-label="Filter caption presets">
                  <option value="all">All types</option><option value="animated">Animated</option><option value="static">Static</option>
                  <option value="podcast">Podcast</option><option value="meme">Meme</option><option value="professional">Professional</option>
                  <option value="high-energy">High Energy</option><option value="minimal">Minimal</option><option value="speaker">Speaker</option><option value="emoji">Emoji</option>
                </select>
      </div>

      <div className="cap-gallery">
      <div className="cap-templates">
        {([
          ...visibleStyles,
          { id: 'none', label: 'Off', description: 'Render without captions' }
        ] as Array<{ id: string; label: string; description?: string }>).map((s) =>
          s.id === 'none' ? (
            <button
              key="none"
              className={`btn sm ${clip.captionStyleId === 'none' ? 'primary' : ''}`}
              style={{ flexDirection: 'column', padding: '6px 4px', height: 68, gap: 2 }}
              onClick={() => props.updateClip({ captionStyleId: 'none' })}
              title="Render without captions"
            >
              <Type size={12} />
              Off
            </button>
          ) : (
            <div key={s.id} className="cap-template-card">
              <button
                className={`btn sm ${clip.captionStyleId === s.id ? 'primary' : ''}`}
                style={{ flexDirection: 'column', padding: '3px', height: 68, gap: 2, alignItems: 'stretch' }}
                onClick={() => applyTemplate(s as import('@shared/constants').CaptionStylePreset)}
                title={s.description ?? ''}
              >
                <TemplatePreview style={s as import('@shared/constants').CaptionStylePreset} text={sampleText} safeArea={showSafeArea} active={clip.captionStyleId === s.id} />
                <span style={{ fontSize: 10 }}>{s.label}</span>
                <span className="cap-template-animation">{(s as import('@shared/constants').CaptionStylePreset).wordAnimation}</span>
              </button>
              <button className={`cap-template-favorite ${favoriteIds.includes(s.id) ? 'active' : ''}`} onClick={() => toggleFavorite(s.id)} aria-label={`${favoriteIds.includes(s.id) ? 'Remove' : 'Add'} ${s.label} ${favoriteIds.includes(s.id) ? 'from' : 'to'} favorites`} title="Favorite preset"><Star size={12} fill={favoriteIds.includes(s.id) ? 'currentColor' : 'none'} /></button>
            </div>
          )
        )}
      </div>
      </div>
      <div className="field-hint cap-style-hint">{style.description}</div>

      <details className="inspector-section">
        <summary>
          <Type size={12} /> Typeface <ChevronRight size={13} className="chev" />
        </summary>
        <div className="inspector-body">
        <input className="input" value={fontSearch} onChange={(e) => setFontSearch(e.target.value)} placeholder="Search fonts" aria-label="Search caption fonts" />
        <div className="row" style={{ gap: 8 }}>
          <label className="tiny">Font
            <select className="input" value={overrides.fontFamily ?? style.fontFamily ?? 'Inter'} onChange={(e) => {
              const family = e.target.value
              const face = CAPTION_FONTS.find((f) => f.family === family)!
              setOverride({ fontFamily: family, fontWeight: face.weight, fontFile: face.file })
            }}>
              {[...new Set(CAPTION_FONTS.map((f) => f.family))].filter((family) => family.toLowerCase().includes(fontSearch.toLowerCase())).map((family) => <option key={family}>{family}</option>)}
            </select>
          </label>
          <label className="tiny">Weight
            <select className="input" value={overrides.fontWeight ?? style.fontWeight ?? 600} onChange={(e) => {
              const weight = Number(e.target.value)
              const family = overrides.fontFamily ?? style.fontFamily ?? 'Inter'
              const face = CAPTION_FONTS.find((f) => f.family === family && f.weight === weight)!
              setOverride({ fontWeight: face.weight, fontFile: face.file, fontFamily: face.family })
            }}>
              {CAPTION_FONTS.filter((f) => f.family === (overrides.fontFamily ?? style.fontFamily ?? 'Inter')).map((f) => <option key={`${f.weight}-${f.file}`} value={f.weight}>{f.style} ({f.weight})</option>)}
            </select>
          </label>
          <button className="btn sm" onClick={savePreset}>Save as preset</button>
        </div>
<div className="field-hint">Fonts are bundled under the SIL Open Font License. The weight list only shows available font files.</div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => { localStorage.setItem('clipwright.captionStyleClipboard', JSON.stringify({ id: clip.captionStyleId, overrides })); setCanPasteStyle(true) }}>Copy style</button>
          <button className="btn sm" disabled={!canPasteStyle} title={canPasteStyle ? 'Paste the copied caption style' : 'Copy a caption style first'} onClick={() => {
            try {
              const saved = JSON.parse(localStorage.getItem('clipwright.captionStyleClipboard') ?? 'null') as { id: string; overrides: CaptionOverrides } | null
              if (saved && typeof saved.id === 'string' && saved.overrides && typeof saved.overrides === 'object') props.updateClip({ captionStyleId: saved.id, captionOverrides: saved.overrides })
              else setCanPasteStyle(false)
            } catch { setCanPasteStyle(false) }
          }}>Paste style</button>

        </div>
        </div>
      </details>

      {clip.captionStyleId !== 'none' && (
        <>
          <div className="cap-group">
          <div className="cap-group-head">Text, layout &amp; motion</div>
          <Switch
            label="Show platform safe area"
            hint="Editor guide only — never rendered into the output."
            checked={showSafeArea}
            onChange={setShowSafeArea}
          />
          <Field label={`Size — ${Math.round(overrides.fontSizePct ?? style.fontSizePct)}% of frame height`}>
            <input
              type="range"
              min={2}
              max={8}
              step={0.1}
              value={overrides.fontSizePct ?? style.fontSizePct}
              onChange={(e) => setOverride({ fontSizePct: parseFloat(e.target.value) })}
            />
          </Field>
          <Field label={`Vertical position — ${Math.round((overrides.positionY ?? style.positionY) * 100)}%`}>
            <input
              type="range"
              min={0.1}
              max={0.92}
              step={0.01}
              value={overrides.positionY ?? style.positionY}
              onChange={(e) => setOverride({ positionY: parseFloat(e.target.value) })}
            />
          </Field>
          <Field label={`Max words per caption — ${overrides.maxWordsPerCue ?? style.maxWordsPerCue}`}>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={overrides.maxWordsPerCue ?? style.maxWordsPerCue}
              onChange={(e) => setOverride({ maxWordsPerCue: parseInt(e.target.value, 10) })}
            />
          </Field>
          <Switch
            label="Word emphasis highlight"
            hint="Fills each word as it is spoken (uses word timing when available)."
            checked={overrides.emphasis ?? style.emphasis}
            onChange={(v) => setOverride({ emphasis: v })}
          />
          <Switch
            label="UPPERCASE"
            checked={overrides.uppercase ?? style.uppercase}
            onChange={(v) => setOverride({ uppercase: v })}
          />

          <div className="row" style={{ gap: 8 }}>
            <Field label="Capitalization"><select className="select" value={overrides.capitalization ?? style.capitalization ?? 'original'} onChange={(e) => setOverride({ capitalization: e.target.value as NonNullable<CaptionOverrides['capitalization']> })}>{['original','uppercase','lowercase','sentence'].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Word emphasis"><select className="select" value={overrides.emphasisBehavior ?? style.emphasisBehavior ?? 'all'} onChange={(e) => setOverride({ emphasisBehavior: e.target.value as NonNullable<CaptionOverrides['emphasisBehavior']> })}><option value="all">Spoken word</option><option value="keywords">Keywords</option><option value="none">Off</option></select></Field>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Field label="Animation in"><select className="select" value={overrides.animationIn ?? style.animationIn ?? 'none'} onChange={(e) => setOverride({ animationIn: e.target.value as NonNullable<CaptionOverrides['animationIn']> })}>{['none','fade','rise','pop','slide'].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Animation out"><select className="select" value={overrides.animationOut ?? style.animationOut ?? 'none'} onChange={(e) => setOverride({ animationOut: e.target.value as NonNullable<CaptionOverrides['animationOut']> })}>{['none','fade','slide'].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Word animation"><select className="select" value={overrides.wordAnimation ?? style.wordAnimation ?? 'none'} onChange={(e) => setOverride({ wordAnimation: e.target.value as NonNullable<CaptionOverrides['wordAnimation']> })}>{['none','highlight','pop','bounce','typewriter'].map((value) => <option key={value}>{value}</option>)}</select></Field>
          </div>
          <Field label={`Letter spacing · ${overrides.letterSpacing ?? style.letterSpacing ?? 0}px`}><input type="range" min="-2" max="8" step="0.2" value={overrides.letterSpacing ?? style.letterSpacing ?? 0} onChange={(e) => setOverride({ letterSpacing: Number(e.target.value) })} /></Field>

          </div>

          <details className="inspector-section">
            <summary>
              <Tags size={12} /> Colours, outline &amp; alignment <ChevronRight size={13} className="chev" />
            </summary>
            <div className="inspector-body cap-group">
          <div className="row" style={{ gap: 10 }}>
            <label className="tiny" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              Text
              <input
                type="color"
                className="color-input"
                value={overrides.textColor ?? style.textColor}
                onChange={(e) => setOverride({ textColor: e.target.value })}
              />
            </label>
            <label className="tiny" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              Highlight
              <input
                type="color"
                className="color-input"
                value={overrides.highlightColor ?? style.highlightColor}
                onChange={(e) => setOverride({ highlightColor: e.target.value })}
              />
            </label>
            <label className="tiny" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Stroke<input type="color" className="color-input" value={overrides.outlineColor ?? style.outlineColor} onChange={(e) => setOverride({ outlineColor: e.target.value })} /></label>
            <label className="tiny" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Box<input type="color" className="color-input" value={overrides.boxColor ?? style.boxColor} onChange={(e) => setOverride({ boxColor: e.target.value })} /></label>
            {(overrides.textColor !== undefined || overrides.highlightColor !== undefined) && (
              <button
                className="btn ghost sm"
                style={{ padding: '2px 6px' }}
                onClick={() => {
                  const next = { ...overrides }
                  delete next.textColor
                  delete next.highlightColor
                  props.updateClip({ captionOverrides: next })
                }}
              >
                Reset
              </button>
            )}
          </div>
          <Field label={`Box opacity — ${Math.round((overrides.boxOpacity ?? style.boxOpacity) * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={overrides.boxOpacity ?? style.boxOpacity}
              onChange={(e) => setOverride({ boxOpacity: parseFloat(e.target.value) })}
            />
          </Field>
          <Field label={`Stroke opacity · ${Math.round((overrides.strokeOpacity ?? style.strokeOpacity ?? 1) * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={overrides.strokeOpacity ?? style.strokeOpacity ?? 1} onChange={(e) => setOverride({ strokeOpacity: Number(e.target.value) })} /></Field>
          <Field label={`Shadow opacity · ${Math.round((overrides.shadowOpacity ?? style.shadowOpacity ?? 0.75) * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={overrides.shadowOpacity ?? style.shadowOpacity ?? 0.75} onChange={(e) => setOverride({ shadowOpacity: Number(e.target.value) })} /></Field>
          <Field label={`Background corner radius · ${overrides.cornerRadius ?? style.cornerRadius ?? 0}px`}><input type="range" min="0" max="32" step="1" value={overrides.cornerRadius ?? style.cornerRadius ?? 0} onChange={(e) => setOverride({ cornerRadius: Number(e.target.value) })} /></Field>
          <div className="row" style={{ gap: 8 }}>
            <Field label="Alignment"><select className="select" value={overrides.alignment ?? style.alignment ?? 'center'} onChange={(e) => setOverride({ alignment: e.target.value as NonNullable<CaptionOverrides['alignment']> })}>{['left','center','right'].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Safe position"><select className="select" value={overrides.safeAreaPosition ?? style.safeAreaPosition ?? 'custom'} onChange={(e) => { const position = e.target.value as NonNullable<CaptionOverrides['safeAreaPosition']>; const y = ({ top: 0.16, 'upper-center': 0.32, center: 0.5, 'lower-center': 0.74, bottom: 0.84, custom: overrides.positionY ?? style.positionY } as const)[position]; setOverride({ safeAreaPosition: position, positionY: y }) }}>{['top','upper-center','center','lower-center','bottom','custom'].map((value) => <option key={value}>{value}</option>)}</select></Field>
          </div>
          <Field label={`Outline width — ${(overrides.outlineWidth ?? style.outlineWidth).toFixed(1)}`}>
            <input
              type="range"
              min={0}
              max={8}
              step={0.5}
              value={overrides.outlineWidth ?? style.outlineWidth}
              onChange={(e) => setOverride({ outlineWidth: parseFloat(e.target.value) })}
            />
          </Field>
          <Field label={`Shadow — ${(overrides.shadow ?? style.shadow).toFixed(1)}`}>
            <input
              type="range"
              min={0}
              max={8}
              step={0.5}
              value={overrides.shadow ?? style.shadow}
              onChange={(e) => setOverride({ shadow: parseFloat(e.target.value) })}
            />
          </Field>

            </div>
          </details>

          <div className="cap-group cap-cue-group">
          <div className="cap-group-head">Caption text &amp; timing</div>
          <div className="field-hint">
            Edit text, split or merge cues, and nudge timing. Timing shifts apply to preview and render alike.
          </div>
          <div className="stack sm cap-cue-list">
            {props.cues.map((cue, idx) => {
              const next = props.cues[idx + 1]
              const split = clip.captionCueSplits?.[cue.key]
              const merged = clip.captionCueMerges?.[cue.key]
              const offset = clip.captionTimingOffsets?.[cue.key]
              const edited = clip.captionTextEdits[cue.key] !== undefined
              const rootKey = cue.key.replace(/\/[ab]$/, '')
              const rawText = cue.words.map((w) => w.text).join(' ')
              const splitAt = () => {
                const splitMap = { ...(clip.captionCueSplits ?? {}) }
                const splitIdx = Math.max(1, Math.min(cue.words.length - 1,
                  props.currentTime > cue.startTime && props.currentTime < cue.endTime
                    ? cue.words.filter((word) => (word.start + word.end) / 2 < props.currentTime).length
                    : Math.floor(cue.words.length / 2)))
                splitMap[cue.key] = splitIdx
                props.updateClip({ captionCueSplits: splitMap })
                props.onSelectCue({ ...cue, key: `${cue.key}/a` })
              }
              return (
                <div key={cue.key} className="field" style={{ marginBottom: 0 }}>
                  <div className="cue-row">
                    <label className="field-label mono" style={{ fontSize: 10, display: 'grid', gap: 2 }}>
                      {formatClock(cue.startTime, true)}
                      {offset !== undefined && <span style={{ color: 'var(--warn)' }}>{offset > 0 ? '+' : ''}{offset.toFixed(1)}s</span>}
                    </label>
                    <input
                      ref={props.selectedCueKey === cue.key ? selectedCueInput : undefined}
                      className="input"
                      style={{ borderColor: props.selectedCueKey === cue.key || edited ? 'var(--accent)' : undefined }}
                      value={clip.captionTextEdits[cue.key] ?? cue.text}
                      onFocus={() => props.onSelectCue(cue)}
                      onChange={(e) => {
                        const value = e.target.value
                        const edits = { ...clip.captionTextEdits }
                        if (value.trim() === rawText) delete edits[cue.key]
                        else edits[cue.key] = value
                        props.updateClip({ captionTextEdits: edits })
                      }}
                    />
                    <div className="cue-actions">
                      <button
                        className="btn ghost sm"
                        title={props.currentTime > cue.startTime && props.currentTime < cue.endTime ? 'Split at the playhead' : 'Split this caption in half'}
                        disabled={cue.words.length < 2 || split !== undefined}
                        onClick={splitAt}
                      >
                        <Scissors size={11} />
                      </button>
                      <button
                        className="btn ghost sm"
                        title="Merge with the next cue"
                        disabled={!next || merged}
                        onClick={() => {
                          const merges = { ...(clip.captionCueMerges ?? {}) }
                          merges[cue.key] = true
                          props.updateClip({ captionCueMerges: merges })
                        }}
                      >
                        <Copy size={11} style={{ transform: 'rotate(90deg)' }} />
                      </button>
                      <button
                        className="btn ghost sm"
                        title="Duplicate caption block"
                        onClick={() => {
                          const length = Math.max(0.15, cue.endTime - cue.startTime)
                          const after = cue.endTime + 0.04
                          const startTime = after + length <= clip.endTime
                            ? after
                            : Math.max(clip.startTime, cue.startTime - length - 0.04)
                          const duplicate = {
                            key: `manual:${crypto.randomUUID()}`,
                            startTime,
                            endTime: Math.min(clip.endTime, startTime + length),
                            text: cue.text
                          }
                          props.updateClip({ captionCueDuplicates: [...clip.captionCueDuplicates, duplicate] })
                          props.onSelectCue({ ...cue, ...duplicate, words: cue.words })
                        }}
                      >Dup</button>
                      <button
                        className="btn ghost sm"
                        title="Delete caption block (can be restored below)"
                        onClick={() => props.updateClip({ captionCueHidden: [...new Set([...clip.captionCueHidden, cue.key])] })}
                      >
                        <Trash2 size={11} />
                      </button>
                      <button
                        className="btn ghost sm"
                        title="Shift timing 0.1s earlier"
                        onClick={() => {
                          const offsets = { ...(clip.captionTimingOffsets ?? {}) }
                          const cur = offsets[cue.key] ?? 0
                          const nextVal = Math.round((cur - 0.1) * 10) / 10
                          if (nextVal === 0) delete offsets[cue.key]
                          else offsets[cue.key] = nextVal
                          props.updateClip({ captionTimingOffsets: offsets })
                        }}
                      >
                        −
                      </button>
                      <button
                        className="btn ghost sm"
                        title="Shift timing 0.1s later"
                        onClick={() => {
                          const offsets = { ...(clip.captionTimingOffsets ?? {}) }
                          const cur = offsets[cue.key] ?? 0
                          const nextVal = Math.round((cur + 0.1) * 10) / 10
                          if (nextVal === 0) delete offsets[cue.key]
                          else offsets[cue.key] = nextVal
                          props.updateClip({ captionTimingOffsets: offsets })
                        }}
                      >
                        +
                      </button>
                      <button
                        className="btn ghost sm"
                        title="Reset this cue (text, split, merge, timing)"
                        disabled={!edited && split === undefined && !merged && offset === undefined}
                        onClick={() => {
                          const edits = { ...clip.captionTextEdits }
                          const splits = { ...(clip.captionCueSplits ?? {}) }
                          const merges = { ...(clip.captionCueMerges ?? {}) }
                          const offsets = { ...(clip.captionTimingOffsets ?? {}) }
                          // split keys are `${key}/a` `${key}/b`
                          delete edits[cue.key]
                          delete edits[`${cue.key}/a`]
                          delete edits[`${cue.key}/b`]
                          delete splits[cue.key]
                          delete merges[cue.key]
                          delete offsets[cue.key]
                          delete offsets[`${cue.key}/start`]
                          delete offsets[`${cue.key}/end`]
                          props.updateClip({
                            captionTextEdits: edits,
                            captionCueSplits: splits,
                            captionCueMerges: merges,
                            captionTimingOffsets: offsets
                          })
                        }}
                      >
                        <RotateCcw size={11} />
                      </button>
                      <button
                        className="btn ghost sm"
                        title="Return this caption to automatic cue segmentation"
                        disabled={clip.captionCueSplits?.[rootKey] === undefined && clip.captionCueMerges?.[rootKey] === undefined}
                        onClick={() => {
                          const splits = { ...(clip.captionCueSplits ?? {}) }
                          const merges = { ...(clip.captionCueMerges ?? {}) }
                          delete splits[rootKey]
                          delete merges[rootKey]
                          props.updateClip({ captionCueSplits: splits, captionCueMerges: merges })
                        }}
                      >Auto</button>
                    </div>
                  </div>
                </div>
              )
            })}
            {props.cues.length === 0 && <div className="tiny">No cues in this clip's range.</div>}
          </div>
          {(Object.keys(clip.captionCueSplits ?? {}).length > 0 ||
            Object.keys(clip.captionCueMerges ?? {}).length > 0 ||
            Object.keys(clip.captionTimingOffsets ?? {}).length > 0) && (
            <button
              className="btn ghost sm"
              style={{ marginTop: 6 }}
              onClick={() =>
                props.updateClip({ captionCueSplits: {}, captionCueMerges: {}, captionTimingOffsets: {} })
              }
            >
              <RotateCcw size={11} /> Reset caption timing and segmentation
            </button>
          )}
          {clip.captionCueHidden.length > 0 && (
            <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => props.updateClip({ captionCueHidden: [] })}>
              <RotateCcw size={11} /> Restore {clip.captionCueHidden.length} deleted caption{clip.captionCueHidden.length === 1 ? '' : 's'}
            </button>
          )}
          {clip.captionCueDuplicates.length > 0 && (
            <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => {
              const hidden = new Set(clip.captionCueHidden)
              for (const cue of clip.captionCueDuplicates) hidden.add(cue.key)
              props.updateClip({ captionCueHidden: [...hidden] })
            }}>
              Hide duplicated caption blocks
            </button>
          )}
          </div>
        </>
      )}
    </>
  )
}

/** Live mini preview of a caption template (mirrors CaptionPreview styling).
 *  Memoised: the gallery holds ~50 of these and the editor re-renders on every
 *  playback tick, so they must not rebuild their style objects each frame. */
const TemplatePreview = React.memo(function TemplatePreview(props: {
  style: import('@shared/constants').CaptionStylePreset
  text: string
  safeArea: boolean
  active: boolean
}) {
  const s = props.style
  const fontSize = 11
  const boxOpacity = s.boxOpacity
  return (
    <div className="cap-preview" style={props.active ? { borderColor: 'var(--accent)' } : undefined}>
      {props.safeArea && <span className="safe-area" />}
      <span
        className="cap-preview-text"
        style={{
          color: s.textColor,
          fontFamily: `'${s.fontFamily ?? 'Inter'}', sans-serif`,
          fontWeight: s.fontWeight ?? (s.fontFile.includes('900') ? 900 : s.fontFile.includes('800') ? 800 : s.fontFile.includes('700') ? 700 : s.fontFile.includes('600') ? 600 : 400),
          fontSize,
          lineHeight: s.lineSpacing ?? 1.18,
          letterSpacing: `${s.letterSpacing ?? 0}px`,
          textAlign: s.alignment ?? 'center',
          textTransform: s.capitalization === 'lowercase' ? 'lowercase' : s.capitalization === 'uppercase' || s.uppercase ? 'uppercase' : 'none',
          WebkitTextStroke: s.outlineWidth > 0 ? `${Math.min(1.4, s.outlineWidth / 3)}px ${colorToRgba(s.outlineColor, s.strokeOpacity ?? 1)}` : undefined,
          paintOrder: 'stroke fill',
          textShadow: s.shadow > 0 ? `0 1px 3px rgba(0,0,0,${s.shadowOpacity ?? 0.8})` : undefined,
          background: boxOpacity > 0 ? `rgba(${parseInt(s.boxColor.slice(1, 3), 16)},${parseInt(s.boxColor.slice(3, 5), 16)},${parseInt(s.boxColor.slice(5, 7), 16)},${boxOpacity})` : undefined,
          padding: boxOpacity > 0 ? '2px 6px' : undefined,
          borderRadius: boxOpacity > 0 ? s.cornerRadius ?? 3 : undefined
        }}
      >
        {s.emphasis ? (
          <>
            <span style={{ color: s.highlightColor }}>{props.text.split(' ')[0]}</span> {props.text.split(' ').slice(1).join(' ')}
          </>
        ) : (
          props.text
        )}
      </span>
    </div>
  )
})

function colorToRgba(hex: string, opacity: number): string {
  const value = hex.replace('#', '')
  return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${opacity})`
}

// =========================================================== output panel ===

function OutputPanel(props: {
  clip: Clip
  project: import('@shared/types').Project
  outputSeconds: number
  updateClip: (patch: Partial<Clip>, immediate?: boolean) => void
  onQuickPreview: () => void
  previewQueued: boolean
}) {
  const { clip, project } = props
  const customRatio = { w: clip.customAspectW ?? 16, h: clip.customAspectH ?? 9 }
  const dims = resolutionFor(clip.aspectRatio, clip.outputResolution, customRatio)
  const sourceCrop = project.width && project.height
    ? computeCrop(project.width, project.height, dims.w, dims.h, clip.cropMode, clip.cropX, clip.zoom, clip.cropY ?? clip.cropX)
    : null
  const upscaling = sourceCrop !== null && (dims.w > sourceCrop.w + 2 || dims.h > sourceCrop.h + 2)
  const estimateMb = estimateRenderSizeMb(clip.aspectRatio, clip.outputResolution, clip.outputQuality, props.outputSeconds, customRatio)
  const quality = QUALITY_PRESETS.find((q) => q.id === clip.outputQuality)

  return (
    <>
      <Field label="Resolution">
        <select
          className="select"
          value={clip.outputResolution}
          onChange={(e) => props.updateClip({ outputResolution: e.target.value as Clip['outputResolution'] })}
        >
          {RESOLUTION_PRESETS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} — {resolutionFor(clip.aspectRatio, r.id, customRatio).w}×{resolutionFor(clip.aspectRatio, r.id, customRatio).h} ({r.hint})
            </option>
          ))}
        </select>
        {upscaling && (
          <div className="field-hint" style={{ color: 'var(--warn)', display: 'flex', gap: 5, alignItems: 'flex-start' }}>
            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            The selected source crop is {sourceCrop?.w}×{sourceCrop?.h}px; this output will be upscaled and cannot add real detail.
          </div>
        )}
      </Field>

      <Field label="Quality">
        <select
          className="select"
          value={clip.outputQuality}
          onChange={(e) => props.updateClip({ outputQuality: e.target.value as Clip['outputQuality'] })}
        >
          {QUALITY_PRESETS.map((q) => (
            <option key={q.id} value={q.id}>
              {q.label} — {q.hint}
            </option>
          ))}
        </select>
        {quality && (
          <div className="field-hint">
            {quality.id === 'draft' ? 'Fast but visible compression.' : quality.id === 'standard' ? 'Balanced delivery quality.' : quality.id === 'high' ? 'High-quality delivery.' : 'Maximum practical quality; larger files, slower renders.'}
          </div>
        )}
      </Field>

      <Field label="Frame rate">
        <select
          className="select"
          value={String(clip.outputFps)}
          onChange={(e) =>
            props.updateClip({
              outputFps: e.target.value === 'source' ? 'source' : (Number(e.target.value) as Clip['outputFps'])
            })
          }
        >
          <option value="source">Match source{project.fps ? ` (${project.fps.toFixed(2)} fps)` : ''}</option>
          <option value="24">24 fps — cinematic</option>
          <option value="25">25 fps — PAL</option>
          <option value="30">30 fps — standard</option>
          <option value="50">50 fps</option>
          <option value="60">60 fps — smooth</option>
        </select>
        <div className="field-hint">
          Output is always constant frame rate — variable-frame-rate sources are normalized automatically.
        </div>
      </Field>

      <div className="divider" />
      <div className="row tiny" style={{ justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-3)' }}>Output</span>
        <span className="mono">
          {dims.w}×{dims.h} · {props.outputSeconds.toFixed(1)}s · ~{estimateMb} MB
        </span>
      </div>
      <div className="row tiny" style={{ justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-3)' }}>Encoder</span>
        <span>H.264 + AAC 48 kHz</span>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" style={{ flex: 1 }} onClick={() => props.updateClip({ outputResolution: '1080p', outputQuality: 'standard', outputFps: 'source' })}>
          <RotateCcw size={11} /> Reset
        </button>
        <button
          className="btn sm"
          style={{ flex: 2 }}
          disabled={props.previewQueued}
          onClick={props.onQuickPreview}
          title="Render a fast 720p draft to check the cut, captions and framing"
        >
          {props.previewQueued ? <Spinner size={11} /> : <Zap size={11} />} Quick preview render
        </button>
      </div>
    </>
  )
}

// ============================================================ crop panel ===

function CropPanel(props: {
  clip: Clip
  sourceSize: { w: number; h: number }
  updateClip: (patch: Partial<Clip>, immediate?: boolean) => void
  cropEditing: boolean
  showSafeArea: boolean
  onToggleSafeArea: () => void
  onToggleCropEditing: () => void
  selectingSubject: boolean
  hasSubjectSelection: boolean
  trackingBusy: boolean
  onBeginSubjectSelection: () => void
  onCancelSubjectSelection: () => void
  onTrackSubject: () => void
  onClearTracking: () => void
}) {
  const { clip } = props
  const [customText, setCustomText] = useState(() => `${clip.customAspectW ?? 16}:${clip.customAspectH ?? 9}`)
  useEffect(() => {
    if (clip.aspectRatio === 'custom') setCustomText(`${clip.customAspectW ?? 16}:${clip.customAspectH ?? 9}`)
  }, [clip.aspectRatio, clip.customAspectW, clip.customAspectH])
  const setAspect = (id: Clip['aspectRatio']) => {
    const patch: Partial<Clip> = { aspectRatio: id }
    if (id !== 'custom') {
      const ratio = ASPECT_RATIOS[id]
      patch.customAspectW = ratio.w
      patch.customAspectH = ratio.h
    }
    props.updateClip(patch)
  }
  const applyCustomAspect = () => {
    const match = customText.trim().match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/i)
    if (!match) return
    const w = Number(match[1])
    const h = Number(match[2])
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w / h < 0.2 || w / h > 5) return
    props.updateClip({ aspectRatio: 'custom', customAspectW: w, customAspectH: h })
  }
  const setOriginalAspect = () => {
    props.updateClip({ aspectRatio: 'custom', customAspectW: props.sourceSize.w, customAspectH: props.sourceSize.h })
    setCustomText(`${props.sourceSize.w}:${props.sourceSize.h}`)
  }
  const cropPosition = (patch: Partial<Clip>) => props.updateClip({ cropMode: 'manual', ...patch })
  return (
    <>
      <Field label="Composition aspect ratio">
        <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
          {(['9:16', '16:9', '1:1', '4:5', '4:3', '21:9'] as const).map((id) => (
            <button key={id} className={`btn sm${clip.aspectRatio === id ? ' primary' : ''}`} onClick={() => setAspect(id)} aria-pressed={clip.aspectRatio === id}>{id}</button>
          ))}
          <button className={`btn sm${clip.aspectRatio === 'custom' ? ' primary' : ''}`} onClick={() => setAspect('custom')} aria-pressed={clip.aspectRatio === 'custom'}>Custom</button>
          <button className="btn sm" onClick={setOriginalAspect}>Original</button>
        </div>
        <div className="field-hint">The canvas changes shape; the source is scaled proportionally and cropped without distortion.</div>
        {clip.aspectRatio === 'custom' && <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <input className="input mono" aria-label="Custom aspect ratio" placeholder="e.g. 2.39:1 or 1080:1920" value={customText} onChange={(event) => setCustomText(event.target.value)} onBlur={applyCustomAspect} onKeyDown={(event) => { if (event.key === 'Enter') { applyCustomAspect(); event.currentTarget.blur() } }} />
          <button className="btn sm" onClick={applyCustomAspect}>Apply</button>
        </div>}
        {clip.aspectRatio === 'custom' && <div className="field-hint">Enter width:height, for example 2.39:1, 4:3, or 1080:1920.</div>}
      </Field>

      <Field label="Source fit">
        <div className="row" style={{ gap: 6 }}>
          <button className={`btn sm${clip.fitMode !== 'fit' ? ' primary' : ''}`} onClick={() => props.updateClip({ fitMode: 'fill' })}>Fill canvas</button>
          <button className={`btn sm${clip.fitMode === 'fit' ? ' primary' : ''}`} onClick={() => props.updateClip({ fitMode: 'fit', zoom: 1, cropX: 0.5, cropY: 0.5 })}>Fit entire source</button>
        </div>
        <div className="field-hint">Fill crops excess edges. Fit shows the whole source at 1×, even if camera keyframes or tracking are saved. Choose Crop to position a window manually.</div>
      </Field>

      {clip.fitMode === 'fit' && (
        <Field label={`Fit zoom - ${clip.zoom.toFixed(2)}x`}>
          <input type="range" min={1} max={3} step={0.05} value={clip.zoom} onChange={(event) => props.updateClip({ zoom: parseFloat(event.target.value) })} />
          <div className="field-hint">Zoom enlarges the fitted image inside the output frame. At 1× the entire source is visible.</div>
        </Field>
      )}

      <button className={`btn sm${props.showSafeArea ? ' active' : ''}`} onClick={props.onToggleSafeArea} style={{ marginBottom: 8 }} aria-pressed={props.showSafeArea}>
        {props.showSafeArea ? 'Hide social safe-area guides' : 'Show social safe-area guides'}
      </button>

      <Field label="Crop mode">
        <select className="select" value={clip.cropMode} onChange={(e) => props.updateClip({ cropMode: e.target.value as Clip['cropMode'], fitMode: 'fill' })}>
          <option value="center">Center crop - safe default</option>
          <option value="top">Top-biased crop (taller sources)</option>
          <option value="bottom">Bottom-biased crop (taller sources)</option>
          <option value="manual">Manual - drag the focus point</option>
        </select>
        <div className="field-hint">Manual crop is non-destructive. Drag the preview to move the crop window; framing and tracking remain separate from overlays and captions.</div>
      </Field>

      {clip.fitMode !== 'fit' && <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <button
          className={`btn sm${props.cropEditing ? ' primary' : ''}`}
          onClick={props.onToggleCropEditing}
          disabled={!props.cropEditing && (clip.cameraKeyframes.length > 0 || clip.trackingKeyframes.length > 0)}
          title={clip.cameraKeyframes.length || clip.trackingKeyframes.length ? 'Use Camera keyframes to adjust animated or tracked framing.' : 'Show the whole source and move or resize the saved base crop.'}
        >
          <Crop size={12} /> {props.cropEditing ? 'Done editing crop' : 'Edit crop window'}
        </button>
        {props.cropEditing && <span className="tiny muted">Drag inside to move; handles resize with the ratio locked.</span>}
      </div>}

      <div className="stack sm" style={{ marginBottom: 10 }}>
        <button className={`btn sm ${props.selectingSubject ? 'primary' : ''}`} onClick={props.selectingSubject ? props.onCancelSubjectSelection : props.onBeginSubjectSelection}>
          {props.selectingSubject ? <X size={12} /> : <Target size={12} />}
          {props.selectingSubject ? 'Cancel selection' : 'Select person or object'}
        </button>
        {props.selectingSubject && <div className="field-hint">The preview shows the full source. Drag a box around the target, or click it to make a face-sized selection.</div>}
        {props.hasSubjectSelection && <button className="btn primary sm" onClick={props.onTrackSubject} disabled={props.trackingBusy}>
          {props.trackingBusy ? <Spinner size={11} /> : <Target size={12} />}
          {props.trackingBusy ? 'Tracking subject...' : 'Track selected subject'}
        </button>}
        {clip.trackingKeyframes.length > 0 && <>
          <div className="tiny" style={{ color: 'var(--success)' }}>Subject path saved - {clip.trackingKeyframes.length} keyframes</div>
          <button className="btn ghost sm" onClick={props.onClearTracking}>Stop tracking and clear path</button>
        </>}
      </div>

      {clip.cropMode === 'manual' && clip.fitMode !== 'fit' && (
        <>
          <div className="field-hint" style={{ marginBottom: 8 }}>Drag the source in the preview or use these position controls. X and Y stay saved independently.</div>
          <Field label={`Position X · ${Math.round(clip.cropX * 100)}%`}>
            <input type="range" min={0} max={1} step={0.005} value={clip.cropX} onChange={(e) => cropPosition({ cropX: parseFloat(e.target.value) })} />
          </Field>
          <Field label={`Position Y · ${Math.round((clip.cropY ?? clip.cropX) * 100)}%`}>
            <input type="range" min={0} max={1} step={0.005} value={clip.cropY ?? clip.cropX} onChange={(e) => cropPosition({ cropY: parseFloat(e.target.value) })} />
          </Field>
          <Field label={`Zoom - ${clip.zoom.toFixed(2)}x`}>
            <input type="range" min={1} max={3} step={0.05} value={clip.zoom} onChange={(e) => cropPosition({ zoom: parseFloat(e.target.value) })} />
          </Field>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => props.updateClip({ cropMode: 'center', cropX: 0.5, cropY: 0.5, zoom: 1, fitMode: 'fill' })}><RotateCcw size={11} /> Reset crop</button>
            <button className="btn sm" onClick={() => props.updateClip({ cropX: 0.5, cropY: 0.5, zoom: 1, cameraKeyframes: [], trackingKeyframes: [], fitMode: 'fill' })}>Reset all framing</button>
          </div>
          <div className="field-hint">Tracking can guide the camera, and its generated path stays editable in Camera keyframes. Captions and timeline overlays remain in canvas space.</div>
        </>
      )}
    </>
  )
}

// ======================================================== metadata panel ===

function MetadataPanel(props: { clip: Clip; updateClip: (patch: Partial<Clip>, immediate?: boolean) => void }) {
  const app = useAppStore()
  const [generating, setGenerating] = useState(false)
  const { clip } = props
  const settings = app.settings
  const preset = getPlatformPreset(settings?.export.preset ?? 'generic')

  async function generate() {
    setGenerating(true)
    try {
      const updated = await api['clips.generateMetadata']({ id: clip.id })
      props.updateClip({ ...updated }, true)
      app.toast({
        level: 'success',
        message: `Metadata generated with ${updated.metadataProvider === 'heuristic-local' ? 'the local heuristic (configure an AI provider for better copy)' : updated.metadataProvider}.`,
        hint: 'Everything is editable — nothing is forced.'
      })
    } catch (err) {
      app.toast({ level: 'error', ...errMessage(err) })
    } finally {
      setGenerating(false)
    }
  }

  async function copyAll() {
    const text = [clip.title, '', clip.description, clip.cta ? `\n${clip.cta}` : '', '', clip.hashtags.join(' ')].join('\n').trim()
    const ok = await copyText(text)
    app.toast(ok ? { level: 'success', message: 'Copied title, description and hashtags.' } : { level: 'warn', message: 'Copy failed.' })
  }

  return (
    <>
      <div className="row">
        <span className="tiny">
          Target: <strong style={{ color: 'var(--text-2)' }}>{preset.label}</strong> — title ≤ {preset.maxTitleLength} chars, {preset.hashtagCount} hashtags
          {clip.metadataProvider && ` · last generated by ${clip.metadataProvider}`}
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => void copyAll()}>
          <Copy size={12} /> Copy all
        </button>
        <button className="btn primary sm" onClick={() => void generate()} disabled={generating}>
          {generating ? <Spinner size={11} /> : <Wand2 size={12} />} Generate
        </button>
      </div>

      <Field label="Title">
        <input className="input" value={clip.title} onChange={(e) => props.updateClip({ title: e.target.value })} maxLength={200} />
      </Field>
      <Field label="Description">
        <textarea className="textarea" rows={4} value={clip.description} onChange={(e) => props.updateClip({ description: e.target.value })} maxLength={4000} />
      </Field>
      <Field label="Hashtags (space separated)">
        <input
          className="input"
          value={clip.hashtags.join(' ')}
          onChange={(e) => props.updateClip({ hashtags: e.target.value.split(/\s+/).filter(Boolean).slice(0, 20) })}
        />
      </Field>
      <Field label="Call to action">
        <input className="input" value={clip.cta} onChange={(e) => props.updateClip({ cta: e.target.value })} maxLength={200} placeholder="e.g. Follow for more breakdowns like this." />
      </Field>
      <Field label="Platform preset (affects generation targets & exports)">
        <select
          className="select"
          value={settings?.export.preset ?? 'generic'}
          onChange={(e) => void app.saveSettings({ export: { preset: e.target.value as 'tiktok' | 'reels' | 'shorts' | 'generic' } })}
        >
          {PLATFORM_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label} — {p.description}</option>
          ))}
        </select>
      </Field>
    </>
  )
}
