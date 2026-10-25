import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, ChevronDown, Copy, Eye, EyeOff, Film, Image as ImageIcon, Lock, Magnet, Maximize2, Plus, Scissors, Trash2, Type, Unlock, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react'
import type { CameraKeyframe, ClipTimeline, ProjectAsset, TextLayer, TimelineItem, TimelineTrack } from '@shared/types'
import { formatClock } from '@shared/utils/time'
import { effectiveItemSpeed, sourceDeltaForTimelineDelta, timelineItemDuration, timelineItemEnd } from '@shared/video/time-map'
import { frameDuration, frameTimeTolerance } from '@shared/video/frame-rate'
import { deleteTimelineItem, duplicateTimelineItem, fitTimelineZoom, splitTimelineItemAt, TIMELINE_ZOOM_MAX, TIMELINE_ZOOM_MIN, timelineZoomFromSlider, timelineZoomSliderValue } from '@shared/editor/timeline-editing'
import { droppedFilePath, mediaUrl } from '../../api/client'

type DragState = { id: string; mode: 'move' | 'left' | 'right'; startX: number; initial: TimelineItem }
type EditDragState =
  | { mode: 'source-left' | 'source-right'; startX: number; start: number; end: number }
  | { mode: 'silence-left' | 'silence-right'; startX: number; index: number; start: number; end: number; min: number; max: number }
  | { mode: 'caption' | 'caption-left' | 'caption-right'; startX: number; key: string; start: number; offset: number }
  | { mode: 'camera'; startX: number; time: number }
  | { mode: 'text' | 'text-left' | 'text-right'; startX: number; layer: TextLayer }

export function MultiTrackTimeline(props: {
  timeline: ClipTimeline
  assets: ProjectAsset[]
  waveforms: Record<string, { peaks: number[]; duration: number }>
  duration: number
  sourceClip?: { name: string; startTime: number; endTime: number; filmstrip?: Array<{ t: number; path: string }> }
  sourceWaveform?: { peaks: number[]; duration: number } | null
  fps?: number | null
  captions?: Array<{ key: string; startTime: number; endTime: number; text: string }>
  textLayers?: TextLayer[]
  captionOffsets?: Record<string, number>
  trackingKeyframes?: Array<{ time: number; x: number; y: number; score: number }>
  cameraKeyframes?: CameraKeyframe[]
  silenceCuts?: Array<{ start: number; end: number; detectedStart?: number; detectedEnd?: number; status?: 'removed' | 'kept' }>
  onChangeSourceRange?: (start: number, end: number) => void
  onChangeSilence?: (index: number, start: number, end: number) => void
  onSetCaptionOffset?: (key: string, offset: number, edge: 'move' | 'start' | 'end') => void
  onSelectTextLayer?: (layer: TextLayer) => void
  onChangeTextLayer?: (id: string, patch: Partial<TextLayer>) => void
  onMoveCameraKeyframe?: (oldTime: number, time: number) => void
  selectedSource?: boolean
  selectedItemId?: string | null
  selectedCaptionKey?: string | null
  selectedSilenceIndex?: number | null
  selectedTextLayerId?: string | null
  selectedCameraKeyframeTime?: number | null
  playing: boolean
  getPlaybackTime: () => number
  onSelectCaption?: (key: string) => void
  onSelectCameraKeyframe?: (time: number) => void
  onSelectTrackingKeyframe?: (keyframe: { time: number; x: number; y: number; score: number }) => void
  onSelectSilence?: (index: number) => void
  onSelectSource?: () => void
  currentTime: number
  onSeek: (time: number) => void
  onChange: (timeline: ClipTimeline) => void
  onNotice?: (message: string) => void
  snapTargets?: number[]
  onSelectItem?: (item: TimelineItem | null) => void
  onDropFiles: (paths: string[], time: number, track: TimelineTrack) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackMenuRef = useRef<HTMLDetailsElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const editDragRef = useRef<EditDragState | null>(null)
  const cursorDragCleanupRef = useRef<(() => void) | null>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const cursorLabelRef = useRef<HTMLSpanElement>(null)
  const pinnedTimeRef = useRef<number | null>(null)
  const cursorDraggingRef = useRef(false)
  const dragSeekFrameRef = useRef<number | null>(null)
  const pendingDragSeekRef = useRef<number | null>(null)
  const lastDragSeekAtRef = useRef(0)
  const lastManualScrollRef = useRef(0)
  const pixelsPerSecondRef = useRef(40)
  const dragScrollStartRef = useRef(0)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(40)
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(1100)
  const [dragTarget, setDragTarget] = useState<string | null>(null)
  const [dropTime, setDropTime] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTrackingTime, setSelectedTrackingTime] = useState<number | null>(null)
  const span = Math.max(30, props.duration || 30)
  pixelsPerSecondRef.current = pixelsPerSecond
  const labelWidthFallback = 160
  const width = Math.max(timelineViewportWidth, labelWidthFallback + span * pixelsPerSecond)
  const gridStep = pixelsPerSecond > 100 ? 1 : pixelsPerSecond > 45 ? 5 : pixelsPerSecond > 15 ? 10 : 60
  const assetById = useMemo(() => new Map(props.assets.map((asset) => [asset.id, asset])), [props.assets])
  const selected = props.timeline.items.find((item) => item.id === selectedId) ?? null
  const selectedTrack = selected ? props.timeline.tracks.find((track) => track.id === selected.trackId) : undefined
  const selectedLocked = Boolean(selected && (!selectedTrack || selectedTrack.locked))
  const canSplit = Boolean(selected && !selectedLocked && props.currentTime > selected.startTime + 0.05 && props.currentTime < timelineItemEnd(selected) - 0.05)
  const sourceFilmstripFrames = useMemo(() => {
    const frames = props.sourceClip?.filmstrip ?? []
    if (!frames.length || !props.sourceClip) return []
    const start = props.sourceClip.startTime
    const end = props.sourceClip.endTime
    const inRange = frames.filter((frame) => frame.t >= start && frame.t <= end)
    if (inRange.length) return inRange
    const middle = (start + end) / 2
    const nearest = frames.reduce((best, frame) => Math.abs(frame.t - middle) < Math.abs(best.t - middle) ? frame : best)
    return [nearest]
  }, [props.sourceClip])
  const ticks = useMemo(() => Array.from({ length: Math.floor(span / gridStep) + 1 }, (_, i) => i * gridStep), [gridStep, span])

  function getTrackLabelWidth() {
    return scrollRef.current?.querySelector<HTMLElement>('.multi-track-label')?.getBoundingClientRect().width || labelWidthFallback
  }

  useEffect(() => () => {
    cursorDragCleanupRef.current?.()
    if (dragSeekFrameRef.current !== null) cancelAnimationFrame(dragSeekFrameRef.current)
  }, [])

  useEffect(() => {
    if (props.selectedItemId !== undefined) setSelectedId(props.selectedItemId)
  }, [props.selectedItemId])

  useEffect(() => {
    const viewport = scrollRef.current
    if (!viewport) return
    const measure = () => setTimelineViewportWidth(Math.max(1, viewport.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  // Keep the playhead visible after a seek — and only after a seek. While the
  // clip is playing the animation loop follows it frame by frame; moving the
  // viewport here as well used to yank the timeline on every timeupdate, which
  // is what made scrolling feel broken.
  useEffect(() => {
    if (props.playing) return
    const viewport = scrollRef.current
    if (!viewport) return
    const labelWidth = getTrackLabelWidth()
    const usableWidth = Math.max(1, viewport.clientWidth - labelWidth)
    const playheadX = Math.max(0, props.currentTime) * pixelsPerSecondRef.current
    const visibleStart = viewport.scrollLeft + labelWidth
    const visibleEnd = viewport.scrollLeft + viewport.clientWidth
    // already on screen: leave the scroll position exactly where the user put it
    if (playheadX >= visibleStart + 16 && playheadX <= visibleEnd - 16) return
    viewport.scrollLeft = Math.max(0, playheadX - labelWidth - usableWidth * 0.25)
  }, [props.currentTime, props.playing])

  useEffect(() => {
    if (!props.playing) {
      pinnedTimeRef.current = props.currentTime
      positionCursor(props.currentTime, false)
      return
    }
    let frame = 0
    const followPlayback = () => {
      const time = props.getPlaybackTime()
      positionCursor(time, false)
      const viewport = scrollRef.current
      // Follow at 70% of the usable width, one frame at a time, and only when
      // the user has not just scrolled by hand.
      if (viewport && performance.now() - lastManualScrollRef.current > 1200) {
        const labelWidth = getTrackLabelWidth()
        const usableWidth = Math.max(1, viewport.clientWidth - labelWidth)
        const desired = Math.max(0, time * pixelsPerSecond - usableWidth * 0.7)
        if (desired > viewport.scrollLeft + 1) viewport.scrollLeft = desired
      }
      frame = requestAnimationFrame(followPlayback)
    }
    frame = requestAnimationFrame(followPlayback)
    return () => cancelAnimationFrame(frame)
  }, [props.playing, props.currentTime, props.getPlaybackTime, pixelsPerSecond])

  /**
   * Horizontal delta of a drag in seconds. The viewport can move under the
   * pointer (wheel, edge autoscroll, playback follow), so the scroll offset
   * has to be part of the maths or the item drifts away from the cursor.
   */
  function dragDeltaSeconds(clientX: number, startX: number) {
    const viewport = scrollRef.current
    const scrolled = viewport ? viewport.scrollLeft - dragScrollStartRef.current : 0
    return (clientX - startX + scrolled) / pixelsPerSecond
  }

  /** Scroll the timeline while a drag is held near either edge. */
  function autoScrollDuringDrag(clientX: number) {
    const viewport = scrollRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const edge = 56
    const left = rect.left + edge
    const right = rect.right - edge
    if (clientX < left) viewport.scrollLeft = Math.max(0, viewport.scrollLeft - (left - clientX) * 0.6)
    else if (clientX > right) viewport.scrollLeft += (clientX - right) * 0.6
  }

  function positionCursor(time: number, hovering: boolean) {
    const cursor = cursorRef.current
    if (!cursor) return
    cursor.style.setProperty('--cursor-x', `${getTrackLabelWidth() + time * pixelsPerSecond}px`)
    cursor.classList.toggle('hovering', hovering)
    if (cursorLabelRef.current) cursorLabelRef.current.textContent = formatClock(time, true)
  }

  function replaceItem(id: string, patch: Partial<TimelineItem>) {
    const updated = props.timeline.items.find((item) => item.id === id)
    if (updated && selectedId === id) props.onSelectItem?.({ ...updated, ...patch })
    props.onChange({ ...props.timeline, items: props.timeline.items.map((item) => item.id === id ? { ...item, ...patch } : item) })
  }
  function beginEditDrag(event: React.PointerEvent, state: EditDragState) {
    event.stopPropagation()
    event.preventDefault()
    editDragRef.current = state
    dragScrollStartRef.current = scrollRef.current?.scrollLeft ?? 0
    const move = (pointer: PointerEvent) => {
      const drag = editDragRef.current
      if (!drag) return
      autoScrollDuringDrag(pointer.clientX)
      const delta = dragDeltaSeconds(pointer.clientX, drag.startX)
      if (drag.mode === 'source-left') {
        props.onChangeSourceRange?.(Math.max(0, Math.min(drag.start + delta, drag.end - frameDuration(props.fps))), drag.end)
      } else if (drag.mode === 'source-right') {
        props.onChangeSourceRange?.(drag.start, Math.min(span, Math.max(drag.start + frameDuration(props.fps), drag.end + delta)))
      } else if (drag.mode === 'silence-left') {
        props.onChangeSilence?.(drag.index, Math.max(drag.min, Math.min(drag.start + delta, drag.end - 0.04)), drag.end)
      } else if (drag.mode === 'silence-right') {
        props.onChangeSilence?.(drag.index, drag.start, Math.min(drag.max, Math.max(drag.start + 0.04, drag.end + delta)))
      } else if (drag.mode === 'caption' || drag.mode === 'caption-left' || drag.mode === 'caption-right') {
        const edge = drag.mode === 'caption-left' ? 'start' : drag.mode === 'caption-right' ? 'end' : 'move'
        props.onSetCaptionOffset?.(drag.key, drag.offset + delta, edge)
      } else if (drag.mode === 'camera') {
        const next = Math.max(props.sourceClip?.startTime ?? 0, Math.min(props.sourceClip?.endTime ?? span, drag.time + delta))
        props.onMoveCameraKeyframe?.(drag.time, next)
      } else if (drag.mode === 'text') {
        const duration = drag.layer.endTime - drag.layer.startTime
        const startTime = Math.max(0, Math.min(span - duration, drag.layer.startTime + delta))
        props.onChangeTextLayer?.(drag.layer.id, { startTime, endTime: startTime + duration })
        drag.layer = { ...drag.layer, startTime, endTime: startTime + duration }
        drag.startX = pointer.clientX
        dragScrollStartRef.current = scrollRef.current?.scrollLeft ?? 0
      } else if (drag.mode === 'text-left') {
        const startTime = Math.max(0, Math.min(drag.layer.startTime + delta, drag.layer.endTime - 0.1))
        props.onChangeTextLayer?.(drag.layer.id, { startTime })
        drag.layer = { ...drag.layer, startTime }
        drag.startX = pointer.clientX
        dragScrollStartRef.current = scrollRef.current?.scrollLeft ?? 0
      } else if (drag.mode === 'text-right') {
        const endTime = Math.max(drag.layer.startTime + 0.1, Math.min(span, drag.layer.endTime + delta))
        props.onChangeTextLayer?.(drag.layer.id, { endTime })
        drag.layer = { ...drag.layer, endTime }
        drag.startX = pointer.clientX
        dragScrollStartRef.current = scrollRef.current?.scrollLeft ?? 0
      }
    }
    const up = () => {
      editDragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }
  function seekTo(time: number) {
    const next = Math.max(0, Math.min(span, time))
    pinnedTimeRef.current = next
    positionCursor(next, false)
    props.onSeek(next)
  }
  function seekDuringDrag(time: number) {
    pinnedTimeRef.current = time
    positionCursor(time, false)
    pendingDragSeekRef.current = time
    if (dragSeekFrameRef.current !== null) return
    dragSeekFrameRef.current = requestAnimationFrame((now) => {
      dragSeekFrameRef.current = null
      if (now - lastDragSeekAtRef.current < 50 || pendingDragSeekRef.current === null) return
      const pending = pendingDragSeekRef.current
      pendingDragSeekRef.current = null
      lastDragSeekAtRef.current = now
      props.onSeek(pending)
    })
  }
  function flushDragSeek() {
    if (dragSeekFrameRef.current !== null) cancelAnimationFrame(dragSeekFrameRef.current)
    dragSeekFrameRef.current = null
    if (pendingDragSeekRef.current !== null) {
      props.onSeek(pendingDragSeekRef.current)
      pendingDragSeekRef.current = null
      lastDragSeekAtRef.current = performance.now()
    }
    positionCursor(pinnedTimeRef.current ?? props.currentTime, false)
  }
  function adjustSourceRangeByKey(event: React.KeyboardEvent<HTMLSpanElement>, edge: 'start' | 'end') {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    props.onSelectSource?.()
    const frame = frameDuration(props.fps)
    const delta = (event.shiftKey ? 1 : frame) * (event.key === 'ArrowLeft' ? -1 : 1)
    const start = props.sourceClip?.startTime ?? 0
    const end = props.sourceClip?.endTime ?? span
    if (edge === 'start') props.onChangeSourceRange?.(Math.max(0, Math.min(end - frame, start + delta)), end)
    else props.onChangeSourceRange?.(start, Math.min(span, Math.max(start + frame, end + delta)))
  }
  function updateHoverCursor(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = scrollRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const x = event.clientX - rect.left
    const labelWidth = getTrackLabelWidth()
    if (x < labelWidth || x > viewport.clientWidth) {
      if (!cursorDraggingRef.current) positionCursor(pinnedTimeRef.current ?? props.currentTime, false)
      return
    }
    const time = Math.max(0, Math.min(span, (viewport.scrollLeft + x - labelWidth) / pixelsPerSecond))
    if (pinnedTimeRef.current === null) positionCursor(time, true)
  }
  function beginCursorDrag(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (event.button !== 0 || target?.closest('.multi-track-label, .multi-track-item, .source-track-clip, .source-cut-region, .timeline-caption-block, .timeline-text-block, .timeline-tracking-marker, .timeline-keyframe-marker, .timeline-trim, .source-trim-handle, .source-cut-handle, .caption-trim-handle, .text-trim-handle, button, input')) return
    const viewport = scrollRef.current
    if (!viewport) return
    const labelWidth = getTrackLabelWidth()
    cursorDraggingRef.current = true
    cursorDragCleanupRef.current?.()
    const update = (clientX: number) => {
      const rect = viewport.getBoundingClientRect()
      const x = Math.max(labelWidth, Math.min(viewport.clientWidth, clientX - rect.left))
      const time = Math.max(0, Math.min(span, (viewport.scrollLeft + x - labelWidth) / pixelsPerSecond))
      seekDuringDrag(time)
    }
    update(event.clientX)
    const move = (pointer: PointerEvent) => update(pointer.clientX)
    const stop = () => {
      flushDragSeek()
      cursorDraggingRef.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      cursorDragCleanupRef.current = null
    }
    cursorDragCleanupRef.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
    window.addEventListener('pointercancel', stop, { once: true })
  }
  /** Zoom while keeping the time under the pointer in the same place. */
  function zoomAroundPointer(nextZoom: number, clientX: number) {
    const viewport = scrollRef.current
    if (!viewport) return
    const labelWidth = getTrackLabelWidth()
    const rect = viewport.getBoundingClientRect()
    const pointerX = Math.max(labelWidth, Math.min(viewport.clientWidth, clientX - rect.left))
    const timelineTime = (viewport.scrollLeft + pointerX - labelWidth) / pixelsPerSecond
    setPixelsPerSecond(nextZoom)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, labelWidth + timelineTime * nextZoom - pointerX)
    }))
  }
  /** Zoom while keeping the middle of the view on the same moment. */
  function zoomAroundCentre(nextZoom: number) {
    const viewport = scrollRef.current
    if (!viewport) {
      setPixelsPerSecond(nextZoom)
      return
    }
    const labelWidth = getTrackLabelWidth()
    const usableWidth = Math.max(1, viewport.clientWidth - labelWidth)
    const centreTime = (viewport.scrollLeft + usableWidth / 2) / pixelsPerSecond
    setPixelsPerSecond(nextZoom)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, centreTime * nextZoom - usableWidth / 2)
    }))
  }
  function setZoomFromSlider(value: number) {
    zoomAroundCentre(timelineZoomFromSlider(value))
  }
  function fitTimeline() {
    setPixelsPerSecond(fitTimelineZoom(timelineViewportWidth, getTrackLabelWidth(), span))
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollLeft = 0 })
  }

  // Wheel behaviour over the timeline:
  //   plain wheel        scroll the track list, then time once it is exhausted
  //   shift + wheel      always time (horizontal)
  //   ctrl / cmd + wheel  zoom around the pointer
  //   horizontal gesture  native, trackpads only
  // React registers onWheel as passive, so preventDefault there does nothing —
  // that is why ctrl+wheel used to zoom the whole window. This listener is real.
  useEffect(() => {
    const viewport = scrollRef.current
    if (!viewport) return
    function onWheel(event: WheelEvent) {
      const el = scrollRef.current
      if (!el) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1
      const dx = event.deltaX * unit
      const dy = event.deltaY * unit
      lastManualScrollRef.current = performance.now()

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const next = dy < 0 ? pixelsPerSecond * 1.12 : pixelsPerSecond / 1.12
        zoomAroundPointer(Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, next)), event.clientX)
        return
      }

      const canScrollY = el.scrollHeight > el.clientHeight + 1
      const canScrollX = el.scrollWidth > el.clientWidth + 1

      // shift + wheel is horizontal everywhere else in Chromium, so keep it
      // that way here: it always moves time, never the track list.
      if (event.shiftKey) {
        if (!canScrollX) return
        event.preventDefault()
        el.scrollLeft += dy || dx
        return
      }
      if (Math.abs(dx) > Math.abs(dy)) return

      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      if (canScrollY && !(dy < 0 ? atTop : atBottom)) return // native vertical
      if (!canScrollX) return
      event.preventDefault()
      el.scrollLeft += dy
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [pixelsPerSecond])
  function addTrack(type: TimelineTrack['type']) {
    const siblings = props.timeline.tracks.filter((track) => track.type === type)
    const id = crypto.randomUUID()
    const name = type === 'audio' ? `Audio ${siblings.length + 1}` : type === 'image' ? `Graphics ${siblings.length + 1}` : `Video ${siblings.length + 2}`
    const track: TimelineTrack = { id, name, type, order: props.timeline.tracks.length, muted: false, hidden: false, locked: false }
    props.onChange({ ...props.timeline, tracks: [...props.timeline.tracks, track] })
    if (trackMenuRef.current) trackMenuRef.current.open = false
  }
  function place(assetId: string, time: number, track: TimelineTrack) {
    if (track.locked) {
      props.onNotice?.('This track is locked. Unlock it before adding media.')
      return
    }
    const asset = assetById.get(assetId)
    if (!asset || asset.missing) return
    if (asset.mediaType !== track.type) {
      props.onNotice?.(`Drop ${asset.mediaType} media onto a ${track.type} track.`)
      return
    }
    const duration = asset.duration ?? 5
    const item: TimelineItem = {
      id: crypto.randomUUID(), assetId, trackId: track.id, startTime: Math.max(0, time), sourceIn: 0,
      sourceOut: duration, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false,
      x: 0, y: 0, scale: 1, rotation: 0, opacity: 1
    }
    props.onChange({ ...props.timeline, items: [...props.timeline.items, item] })
    setSelectedId(item.id)
    props.onSelectItem?.(item)
  }
  function timeFromEvent(event: React.DragEvent | React.PointerEvent, track: TimelineTrack): number {
    const lane = event.currentTarget instanceof HTMLElement ? event.currentTarget.querySelector('.multi-track-lane') : null
    const rect = lane?.getBoundingClientRect()
    if (!rect) return 0
    const x = event.clientX - rect.left
    let time = Math.max(0, x / pixelsPerSecond)
    if (props.timeline.snapEnabled) {
      const targets = [props.currentTime, ...(props.snapTargets ?? []), ...props.timeline.items.flatMap((item) => [item.startTime, timelineItemEnd(item)])]
      const nearest = targets.reduce((best, target) => Math.abs(target - time) < Math.abs(best - time) ? target : best, Number.NaN)
      if (Number.isFinite(nearest) && Math.abs(nearest - time) < 8 / pixelsPerSecond) time = nearest
      time = Math.round(time * 100) / 100
    }
    void track
    return time
  }
  function onDrop(event: React.DragEvent, track: TimelineTrack) {
    event.preventDefault(); setDragTarget(null); setDropTime(null)
    if (track.locked) {
      props.onNotice?.('This track is locked. Unlock it before adding media.')
      return
    }
    const time = timeFromEvent(event, track)
    const assetId = event.dataTransfer.getData('application/x-clipwright-asset') || event.dataTransfer.getData('text/plain')
    if (assetId && assetById.has(assetId)) { place(assetId, time, track); return }
    // Electron attaches the source path to File objects dropped from Explorer.
    const files = Array.from(event.dataTransfer.files)
    const paths = files.map(droppedFilePath).filter((value): value is string => Boolean(value))
    if (paths.length) props.onDropFiles(paths, time, track)
  }
  function beginDrag(event: React.PointerEvent, item: TimelineItem, mode: DragState['mode']) {
    const track = props.timeline.tracks.find((row) => row.id === item.trackId)
    if (track?.locked) return
    event.stopPropagation(); event.preventDefault(); setSelectedId(item.id); seekTo(item.startTime); props.onSelectItem?.(item)
    dragRef.current = { id: item.id, mode, startX: event.clientX, initial: item }
    dragScrollStartRef.current = scrollRef.current?.scrollLeft ?? 0
    const onMove = (move: PointerEvent) => {
      const state = dragRef.current
      if (!state) return
      autoScrollDuringDrag(move.clientX)
      const dt = dragDeltaSeconds(move.clientX, state.startX)
      const original = state.initial
      if (state.mode === 'move') {
        let startTime = Math.max(0, original.startTime + dt)
        if (props.timeline.snapEnabled) {
          const targets = [props.currentTime, ...(props.snapTargets ?? []), ...props.timeline.items.filter((item) => item.id !== original.id).flatMap((item) => [item.startTime, timelineItemEnd(item)])]
          const nearest = targets.reduce((best, target) => Math.abs(target - startTime) < Math.abs(best - startTime) ? target : best, Number.NaN)
          if (Number.isFinite(nearest) && Math.abs(nearest - startTime) < 8 / pixelsPerSecond) startTime = nearest
          else startTime = Math.round(startTime * 100) / 100
        }
        replaceItem(state.id, { startTime })
      } else if (state.mode === 'left') {
        const minimumDelta = Math.max(-original.startTime, -original.sourceIn / effectiveItemSpeed(original.speed))
        const delta = Math.max(minimumDelta, Math.min(dt, timelineItemDuration(original) - 0.05))
        replaceItem(state.id, { startTime: original.startTime + delta, sourceIn: Math.max(0, original.sourceIn + sourceDeltaForTimelineDelta(delta, original.speed)) })
      } else {
        const asset = assetById.get(original.assetId)
        const maximumSourceOut = asset?.mediaType === 'image' ? Number.POSITIVE_INFINITY : asset?.duration ?? Number.POSITIVE_INFINITY
        const sourceOut = Math.min(maximumSourceOut, Math.max(original.sourceIn + 0.05, original.sourceOut + sourceDeltaForTimelineDelta(dt, original.speed)))
        replaceItem(state.id, { sourceOut })
      }
    }
    const onUp = () => { dragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true })
  }
  function adjustItemByKey(event: React.KeyboardEvent<HTMLButtonElement>, item: TimelineItem, edge: 'left' | 'right') {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    if (selectedId !== item.id && props.selectedItemId !== item.id) { setSelectedId(item.id); props.onSelectItem?.(item) }
    const delta = (event.shiftKey ? 1 : frameDuration(props.fps)) * (event.key === 'ArrowLeft' ? -1 : 1)
    if (edge === 'left') {
      const minimumDelta = Math.max(-item.startTime, -item.sourceIn / effectiveItemSpeed(item.speed))
      const offset = Math.max(minimumDelta, Math.min(delta, timelineItemDuration(item) - 0.05))
      replaceItem(item.id, { startTime: item.startTime + offset, sourceIn: Math.max(0, item.sourceIn + sourceDeltaForTimelineDelta(offset, item.speed)) })
      return
    }
    const asset = assetById.get(item.assetId)
    const maximumSourceOut = asset?.mediaType === 'image' ? Number.POSITIVE_INFINITY : asset?.duration ?? Number.POSITIVE_INFINITY
    const sourceOut = Math.min(maximumSourceOut, Math.max(item.sourceIn + 0.05, item.sourceOut + sourceDeltaForTimelineDelta(delta, item.speed)))
    replaceItem(item.id, { sourceOut })
  }
  function adjustCaptionByKey(event: React.KeyboardEvent<HTMLButtonElement>, key: string, edge: 'move' | 'start' | 'end') {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    if (props.selectedCaptionKey !== key) props.onSelectCaption?.(key)
    const step = event.shiftKey ? 1 : frameDuration(props.fps)
    const delta = event.key === 'ArrowLeft' ? -step : step
    const mapKey = edge === 'move' ? key : `${key}/${edge}`
    const offset = props.captionOffsets?.[mapKey] ?? props.captionOffsets?.[key] ?? 0
    props.onSetCaptionOffset?.(key, offset + delta, edge)
  }
  function adjustTextLayerByKey(event: React.KeyboardEvent<HTMLButtonElement>, layer: TextLayer, edge: 'left' | 'right') {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    if (props.selectedTextLayerId !== layer.id) props.onSelectTextLayer?.(layer)
    const step = event.shiftKey ? 1 : frameDuration(props.fps)
    const delta = event.key === 'ArrowLeft' ? -step : step
    if (edge === 'left') props.onChangeTextLayer?.(layer.id, { startTime: Math.max(0, Math.min(layer.endTime - 0.1, layer.startTime + delta)) })
    else props.onChangeTextLayer?.(layer.id, { endTime: Math.max(layer.startTime + 0.1, Math.min(span, layer.endTime + delta)) })
  }
  function adjustSilenceByKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number, edge: 'left' | 'right', start: number, end: number, min: number, max: number) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    if (props.selectedSilenceIndex !== index) props.onSelectSilence?.(index)
    const step = event.shiftKey ? 1 : frameDuration(props.fps)
    const delta = event.key === 'ArrowLeft' ? -step : step
    if (edge === 'left') props.onChangeSilence?.(index, Math.max(min, Math.min(start + delta, end - 0.04)), end)
    else props.onChangeSilence?.(index, start, Math.min(max, Math.max(start + 0.04, end + delta)))
  }
  function updateTrack(id: string, patch: Partial<TimelineTrack>) {
    props.onChange({ ...props.timeline, tracks: props.timeline.tracks.map((track) => track.id === id ? { ...track, ...patch } : track) })
  }
  function splitSelected() {
    if (!selected) return
    const result = splitTimelineItemAt(props.timeline, selected.id, props.currentTime, crypto.randomUUID())
    if (!result) {
      props.onNotice?.('Move the playhead inside the selected clip to split it.')
      return
    }
    props.onChange(result.timeline)
    setSelectedId(result.selectedId)
    props.onSelectItem?.(result.timeline.items.find((item) => item.id === result.selectedId) ?? null)
  }
  function duplicateSelected() {
    if (!selected) return
    const result = duplicateTimelineItem(props.timeline, selected.id, crypto.randomUUID())
    if (!result) return
    props.onChange(result.timeline)
    setSelectedId(result.selectedId)
    props.onSelectItem?.(result.timeline.items.find((item) => item.id === result.selectedId) ?? null)
  }
  function deleteSelected() {
    if (!selected) return
    const result = deleteTimelineItem(props.timeline, selected.id)
    if (!result) return
    props.onChange(result.timeline)
    setSelectedId(null)
    props.onSelectItem?.(null)
  }
  function setSnap() { props.onChange({ ...props.timeline, snapEnabled: !props.timeline.snapEnabled }) }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!selected || selectedLocked) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        splitSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected, selectedLocked, props.timeline, props.currentTime])

  return <section className="multi-track-editor" aria-label="Multi-track timeline editor">
    <div className="multi-track-toolbar" title="Drag media here · Ctrl/⌘+B split · Ctrl/⌘+D duplicate · Delete remove">
      <div className="row timeline-toolbar-actions" role="toolbar" aria-label="Timeline editing tools">
        <button type="button" className={`btn sm timeline-snap${props.timeline.snapEnabled ? ' active' : ''}`} onClick={setSnap} title="Toggle magnetic snapping" aria-label={`Snapping ${props.timeline.snapEnabled ? 'on' : 'off'}`} aria-pressed={props.timeline.snapEnabled}>
          <Magnet size={12} /> Snap <span className="snap-state">{props.timeline.snapEnabled ? 'On' : 'Off'}</span>
        </button>
        <details className="timeline-add-track-menu" ref={trackMenuRef}>
          <summary className="btn sm timeline-add-track-summary" aria-label="Add timeline track" aria-haspopup="menu"><Plus size={14} /> Add track <ChevronDown size={12} /></summary>
          <div className="timeline-add-track-options" role="menu" aria-label="Track type">
            <button type="button" role="menuitem" onClick={() => addTrack('video')}><Film size={14} /> Video track</button>
            <button type="button" role="menuitem" onClick={() => addTrack('audio')}><AudioLines size={14} /> Audio track</button>
            <button type="button" role="menuitem" onClick={() => addTrack('image')}><ImageIcon size={14} /> Graphics track</button>
          </div>
        </details>
        <span className="timeline-toolbar-divider" aria-hidden="true" />
        <button type="button" className="btn ghost sm icon" onClick={splitSelected} disabled={!canSplit} title="Split selected clip at the playhead · Ctrl/⌘+B" aria-label="Split selected clip at playhead"><Scissors size={14} /></button>
        <button type="button" className="btn ghost sm icon" onClick={duplicateSelected} disabled={!selected || selectedLocked} title="Duplicate selected clip after itself · Ctrl/⌘+D" aria-label="Duplicate selected clip"><Copy size={14} /></button>
        <button type="button" className="btn ghost sm icon danger" onClick={deleteSelected} disabled={!selected || selectedLocked} title="Remove selected timeline item · Delete" aria-label="Delete selected timeline item"><Trash2 size={14} /></button>
      </div>
      <div className="timeline-toolbar-right">
        <label className="timeline-zoom-control">
          <ZoomOut size={12} aria-hidden="true" />
          <input type="range" aria-label="Timeline zoom" min="0" max="100" step="1" value={timelineZoomSliderValue(pixelsPerSecond)} onChange={(event) => setZoomFromSlider(Number(event.target.value))} />
          <ZoomIn size={12} aria-hidden="true" />
        </label>
        <button type="button" className="btn ghost sm icon" onClick={fitTimeline} title="Fit full project in the timeline" aria-label="Fit full project in timeline"><Maximize2 size={14} /></button>
      </div>
    </div>
    <div className="multi-track-scroll" ref={scrollRef} onPointerMove={updateHoverCursor} onPointerLeave={() => { if (!cursorDraggingRef.current) positionCursor(pinnedTimeRef.current ?? props.currentTime, false) }} onPointerDownCapture={beginCursorDrag}>
      <div className="multi-track-canvas" style={{ width, '--timeline-grid-size': `${pixelsPerSecond * gridStep}px` } as React.CSSProperties}>
        <div className="multi-track-ruler"><div className="multi-track-label">TRACKS</div><div className="multi-track-ruler-body">{ticks.map((time) => <button type="button" key={time} style={{ left: time * pixelsPerSecond }} aria-label={`Seek to ${formatClock(time, true)}`} title={`Seek to ${formatClock(time, true)}`} onClick={() => seekTo(time)}>{formatClock(time, true)}<i /></button>)}</div></div>
        {props.sourceClip && <div className="multi-track-row source-track-row">
          <div className="multi-track-label"><span className="track-title"><Film size={14} /> Main source</span><small>{props.sourceClip.name}</small></div>
          <div className="multi-track-lane">
            <button type="button" className={`source-track-clip${props.selectedSource ? ' selected' : ''}`} style={{ left: props.sourceClip.startTime * pixelsPerSecond, width: Math.max(18, (props.sourceClip.endTime - props.sourceClip.startTime) * pixelsPerSecond) }} aria-label={`Main source ${props.sourceClip.name} · ${formatClock(props.sourceClip.startTime, true)} to ${formatClock(props.sourceClip.endTime, true)}`} title="Main source clip · drag its edges to trim; click to select" onClick={() => { seekTo(props.sourceClip!.startTime); props.onSelectSource?.() }}>
              {props.sourceWaveform && <AudioWaveform peaks={props.sourceWaveform.peaks} duration={props.sourceWaveform.duration} sourceIn={props.sourceClip.startTime} sourceOut={props.sourceClip.endTime} />}
              {sourceFilmstripFrames.length > 0 && <span className="source-filmstrip" aria-hidden="true">{sourceFilmstripFrames.map((frame, index) => <img key={`${frame.t}-${index}`} src={mediaUrl(frame.path)} alt="" draggable={false} style={{ left: `${index / sourceFilmstripFrames.length * 100}%`, width: `${100 / sourceFilmstripFrames.length + 0.5}%` }} />)}</span>}
              <span className="source-clip-title">{props.sourceClip.name}</span><small>{formatClock(props.sourceClip.startTime, true)} – {formatClock(props.sourceClip.endTime, true)}</small>
              <span className="source-trim-handle left" role="slider" aria-orientation="horizontal" tabIndex={0} aria-label="Trim source start" aria-valuemin={0} aria-valuemax={Math.max(0, props.sourceClip.endTime - frameDuration(props.fps))} aria-valuenow={props.sourceClip.startTime} title="Drag to trim source start · arrow keys step one frame; Shift + arrow steps one second" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustSourceRangeByKey(event, 'start')} onPointerDown={(event) => { props.onSelectSource?.(); beginEditDrag(event, { mode: 'source-left', startX: event.clientX, start: props.sourceClip!.startTime, end: props.sourceClip!.endTime }) }} />
              <span className="source-trim-handle right" role="slider" aria-orientation="horizontal" tabIndex={0} aria-label="Trim source end" aria-valuemin={props.sourceClip.startTime + frameDuration(props.fps)} aria-valuemax={span} aria-valuenow={props.sourceClip.endTime} title="Drag to trim source end · arrow keys step one frame; Shift + arrow steps one second" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustSourceRangeByKey(event, 'end')} onPointerDown={(event) => { props.onSelectSource?.(); beginEditDrag(event, { mode: 'source-right', startX: event.clientX, start: props.sourceClip!.startTime, end: props.sourceClip!.endTime }) }} />
            </button>
            {props.silenceCuts?.map((cut, index) => {
              const start = cut.status === 'kept' ? (cut.detectedStart ?? cut.start) : cut.start
              const end = cut.status === 'kept' ? (cut.detectedEnd ?? cut.end) : cut.end
              return <div key={`${cut.detectedStart ?? cut.start}-${index}`} className={`source-cut-region${cut.status === 'kept' ? ' kept' : ''}${props.selectedSilenceIndex === index ? ' selected' : ''}`} style={{ left: start * pixelsPerSecond, width: Math.max(4, (end - start) * pixelsPerSecond) }} title={`${cut.status === 'kept' ? 'Kept' : 'Removed'} pause · drag either edge to adjust`} onClick={() => { seekTo(start); props.onSelectSilence?.(index) }}>
                {cut.status !== 'kept' && <>
                  <button type="button" role="slider" aria-orientation="horizontal" className="source-cut-handle left" aria-label={`Adjust pause ${index + 1} start`} aria-valuemin={cut.detectedStart ?? props.sourceClip!.startTime} aria-valuemax={cut.end - 0.04} aria-valuenow={cut.start} title="Drag or use arrow keys to adjust pause start" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustSilenceByKey(event, index, 'left', cut.start, cut.end, cut.detectedStart ?? props.sourceClip!.startTime, cut.detectedEnd ?? props.sourceClip!.endTime)} onPointerDown={(event) => { props.onSelectSilence?.(index); beginEditDrag(event, { mode: 'silence-left', startX: event.clientX, index, start: cut.start, end: cut.end, min: cut.detectedStart ?? props.sourceClip!.startTime, max: cut.detectedEnd ?? props.sourceClip!.endTime }) }} />
                  <button type="button" role="slider" aria-orientation="horizontal" className="source-cut-handle right" aria-label={`Adjust pause ${index + 1} end`} aria-valuemin={cut.start + 0.04} aria-valuemax={cut.detectedEnd ?? props.sourceClip!.endTime} aria-valuenow={cut.end} title="Drag or use arrow keys to adjust pause end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustSilenceByKey(event, index, 'right', cut.start, cut.end, cut.detectedStart ?? props.sourceClip!.startTime, cut.detectedEnd ?? props.sourceClip!.endTime)} onPointerDown={(event) => { props.onSelectSilence?.(index); beginEditDrag(event, { mode: 'silence-right', startX: event.clientX, index, start: cut.start, end: cut.end, min: cut.detectedStart ?? props.sourceClip!.startTime, max: cut.detectedEnd ?? props.sourceClip!.endTime }) }} />
                </>}
              </div>
            })}
          </div>
        </div>}
        {props.captions && props.captions.length > 0 ? (
          <div className="multi-track-row caption-track-row">
            <div className="multi-track-label"><span className="track-title"><Type size={14} /> Captions</span><small>{props.captions.length} blocks</small></div>
            <div className="multi-track-lane">
              {props.captions.map((caption) => (
                <div key={caption.key} role="group" className={`timeline-caption-block${props.selectedCaptionKey === caption.key ? ' selected' : ''}`}
                  style={{ left: caption.startTime * pixelsPerSecond, width: Math.max(20, (caption.endTime - caption.startTime) * pixelsPerSecond) }}>
                  <button type="button" className="timeline-caption-content" aria-label={`Caption at ${formatClock(caption.startTime, true)}: ${caption.text}`} title="Click to seek · drag to move" onPointerDown={(event) => {
                    props.onSelectCaption?.(caption.key)
                    beginEditDrag(event, { mode: 'caption', startX: event.clientX, key: caption.key, start: caption.startTime, offset: props.captionOffsets?.[caption.key] ?? 0 })
                  }} onClick={(event) => { if (event.detail !== 0) return; seekTo(caption.startTime); props.onSelectCaption?.(caption.key) }}>{caption.text}</button>
                  <button type="button" role="slider" aria-orientation="horizontal" className="caption-trim-handle left" aria-label={`Adjust start of caption at ${formatClock(caption.startTime, true)}`} aria-valuemin={0} aria-valuemax={caption.endTime - 0.15} aria-valuenow={caption.startTime} title="Drag or use arrow keys to adjust caption start" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustCaptionByKey(event, caption.key, 'start')} onPointerDown={(event) => {
                    event.stopPropagation()
                    props.onSelectCaption?.(caption.key)
                    const offset = props.captionOffsets?.[`${caption.key}/start`] ?? props.captionOffsets?.[caption.key] ?? 0
                    beginEditDrag(event, { mode: 'caption-left', startX: event.clientX, key: caption.key, start: caption.startTime, offset })
                  }} />
                  <button type="button" role="slider" aria-orientation="horizontal" className="caption-trim-handle right" aria-label={`Adjust end of caption at ${formatClock(caption.endTime, true)}`} aria-valuemin={caption.startTime + 0.15} aria-valuemax={span} aria-valuenow={caption.endTime} title="Drag or use arrow keys to adjust caption end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustCaptionByKey(event, caption.key, 'end')} onPointerDown={(event) => {
                    event.stopPropagation()
                    props.onSelectCaption?.(caption.key)
                    const offset = props.captionOffsets?.[`${caption.key}/end`] ?? props.captionOffsets?.[caption.key] ?? 0
                    beginEditDrag(event, { mode: 'caption-right', startX: event.clientX, key: caption.key, start: caption.startTime, offset })
                  }} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {props.textLayers && <div className="multi-track-row text-track-row">
          <div className="multi-track-label"><span className="track-title"><Type size={14} /> Text / graphics</span><small>{props.textLayers.length} layers</small></div>
          <div className="multi-track-lane">
            {props.textLayers.length === 0 && <span className="timeline-empty-track">Add a layer from Text to place it here.</span>}
            {props.textLayers.map((layer) => <div key={layer.id} role="group" className={`timeline-text-block${props.selectedTextLayerId === layer.id ? ' selected' : ''}`} style={{ left: layer.startTime * pixelsPerSecond, width: Math.max(24, (layer.endTime - layer.startTime) * pixelsPerSecond) }}>
              <button type="button" className="timeline-text-content" aria-label={`Text layer ${layer.text || 'untitled'} at ${formatClock(layer.startTime, true)}`} title="Click to select · drag to move" onClick={(event) => { if (event.detail !== 0) return; props.onSelectTextLayer?.(layer); seekTo(layer.startTime) }} onPointerDown={(event) => { props.onSelectTextLayer?.(layer); beginEditDrag(event, { mode: 'text', startX: event.clientX, layer }) }}>{layer.text || 'Text layer'}</button>
              <button type="button" role="slider" aria-orientation="horizontal" className="text-trim-handle left" aria-label={`Adjust start of text layer ${layer.text || 'untitled'}`} aria-valuemin={0} aria-valuemax={layer.endTime - 0.1} aria-valuenow={layer.startTime} title="Drag or use arrow keys to adjust text start" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustTextLayerByKey(event, layer, 'left')} onPointerDown={(event) => { event.stopPropagation(); props.onSelectTextLayer?.(layer); beginEditDrag(event, { mode: 'text-left', startX: event.clientX, layer }) }} />
              <button type="button" role="slider" aria-orientation="horizontal" className="text-trim-handle right" aria-label={`Adjust end of text layer ${layer.text || 'untitled'}`} aria-valuemin={layer.startTime + 0.1} aria-valuemax={span} aria-valuenow={layer.endTime} title="Drag or use arrow keys to adjust text end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustTextLayerByKey(event, layer, 'right')} onPointerDown={(event) => { event.stopPropagation(); props.onSelectTextLayer?.(layer); beginEditDrag(event, { mode: 'text-right', startX: event.clientX, layer }) }} />
            </div>)}
          </div>
        </div>}
        {(props.cameraKeyframes?.length || props.trackingKeyframes?.length) ? <div className="multi-track-row camera-track-row"><div className="multi-track-label"><span className="track-title"><Film size={14} /> Camera / tracking</span><small>{props.cameraKeyframes?.length ?? 0} keyframes</small></div><div className="multi-track-lane">{props.trackingKeyframes?.map((keyframe, index) => <button type="button" key={`track-${keyframe.time}-${index}`} className={`timeline-tracking-marker${selectedTrackingTime === keyframe.time ? ' selected' : ''}`} style={{ left: keyframe.time * pixelsPerSecond }} aria-label={`Tracking sample at ${formatClock(keyframe.time, true)}, ${Math.round(keyframe.score * 100)} percent confidence`} title={`Tracking sample · ${formatClock(keyframe.time, true)} · ${Math.round(keyframe.score * 100)}% confidence`} onClick={() => { setSelectedTrackingTime(keyframe.time); if (props.onSelectTrackingKeyframe) props.onSelectTrackingKeyframe(keyframe); else seekTo(keyframe.time) }}>•</button>)}{props.cameraKeyframes?.map((keyframe, index) => <button type="button" key={`${keyframe.time}-${index}`} className={`timeline-keyframe-marker${props.selectedCameraKeyframeTime !== null && Math.abs(keyframe.time - (props.selectedCameraKeyframeTime ?? -100)) < frameTimeTolerance(props.fps) ? ' selected' : ''}`} style={{ left: keyframe.time * pixelsPerSecond }} aria-label={`Camera keyframe at ${formatClock(keyframe.time, true)}`} title={`Camera keyframe ${formatClock(keyframe.time, true)} · ${keyframe.easing}`} onClick={(event) => { if (event.detail === 0) props.onSelectCameraKeyframe?.(keyframe.time) }} onPointerDown={(event) => { props.onSelectCameraKeyframe?.(keyframe.time); beginEditDrag(event, { mode: 'camera', startX: event.clientX, time: keyframe.time }) }}>◆</button>)}</div></div> : null}
        {[...props.timeline.tracks].sort((a, b) => a.order - b.order).map((track) => {
          const TrackIcon = track.type === 'audio' ? AudioLines : track.type === 'image' ? Eye : Volume2
          return <div className={`multi-track-row ${dragTarget === track.id ? 'drop-target' : ''} ${track.hidden ? 'track-hidden' : ''} ${track.locked ? 'track-locked' : ''}`} key={track.id}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = track.locked ? 'none' : 'copy'; setDragTarget(track.id); setDropTime(timeFromEvent(event, track)) }}
            onDragLeave={(event) => { if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return; setDragTarget(null); setDropTime(null) }}
            onDrop={(event) => onDrop(event, track)}>
            <div className="multi-track-label">
              <span className="track-title"><TrackIcon size={14} /> <input aria-label={`Name for ${track.name}`} value={track.name} onChange={(event) => updateTrack(track.id, { name: event.target.value })} /></span>
              <span className="track-tools">
                {(track.type === 'audio' || track.type === 'video') && <button type="button" aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${track.name}`} aria-pressed={track.muted} title={track.muted ? 'Unmute track' : 'Mute track'} onClick={() => updateTrack(track.id, { muted: !track.muted })}>{track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>}
                {(track.type === 'video' || track.type === 'image') && <button type="button" aria-label={`${track.hidden ? 'Show' : 'Hide'} ${track.name}`} aria-pressed={track.hidden} title={track.hidden ? 'Show track' : 'Hide track'} onClick={() => updateTrack(track.id, { hidden: !track.hidden })}>{track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>}
                <button type="button" aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.name}`} aria-pressed={track.locked} title={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => updateTrack(track.id, { locked: !track.locked })}>{track.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
              </span>
            </div>
            <div className="multi-track-lane">
              {dragTarget === track.id && dropTime != null && <div className="multi-track-drop-line" style={{ left: dropTime * pixelsPerSecond }} />}
              {props.timeline.items.filter((item) => item.trackId === track.id).map((item) => {
                const asset = assetById.get(item.assetId)
                const duration = timelineItemDuration(item)
                return <div key={item.id} className={`multi-track-item ${track.type} ${selectedId === item.id || props.selectedItemId === item.id ? 'selected' : ''} ${asset?.missing ? 'missing' : ''}`} style={{ left: item.startTime * pixelsPerSecond, width: Math.max(18, duration * pixelsPerSecond), opacity: track.hidden ? 0.45 : 1 }} title={`${asset?.name ?? 'Missing media'} · ${formatClock(item.startTime, true)} · ${formatClock(duration, true)}`} onContextMenu={(event) => { event.preventDefault(); setSelectedId(item.id); seekTo(item.startTime); props.onSelectItem?.(item) }}>
                  <button type="button" role="slider" aria-orientation="horizontal" aria-label={`Trim ${asset?.name ?? 'clip'} source start`} aria-valuemin={0} aria-valuemax={Math.max(0, item.sourceOut - 0.05)} aria-valuenow={item.sourceIn} title="Drag to trim · Arrow keys step one frame; Shift + arrow steps one second" className="timeline-trim left" disabled={track.locked} onKeyDown={(event) => adjustItemByKey(event, item, 'left')} onPointerDown={(event) => beginDrag(event, item, 'left')} />
                  <button type="button" role="slider" aria-orientation="horizontal" aria-label={`Trim ${asset?.name ?? 'clip'} source end`} aria-valuemin={item.sourceIn + 0.05} aria-valuemax={asset?.duration ?? item.sourceOut + span * 4} aria-valuenow={item.sourceOut} title="Drag to trim · Arrow keys step one frame; Shift + arrow steps one second" className="timeline-trim right" disabled={track.locked} onKeyDown={(event) => adjustItemByKey(event, item, 'right')} onPointerDown={(event) => beginDrag(event, item, 'right')} />
                  {asset && asset.mediaType !== 'audio' && asset.thumbnailPath && <img className="timeline-item-thumbnail" src={mediaUrl(asset.thumbnailPath)} alt="" draggable={false} />}
                  {asset?.mediaType === 'audio' && props.waveforms[asset.id] && <AudioWaveform peaks={props.waveforms[asset.id].peaks} duration={props.waveforms[asset.id].duration} sourceIn={item.sourceIn} sourceOut={item.sourceOut} />}
                  <button type="button" className="timeline-item-body" aria-label={`${asset?.name ?? 'Missing media'} clip · drag to move, double-click to seek`} onPointerDown={(event) => beginDrag(event, item, 'move')} onClick={(event) => { if (event.detail !== 0) return; setSelectedId(item.id); seekTo(item.startTime); props.onSelectItem?.(item) }} onDoubleClick={() => seekTo(item.startTime)}>{asset?.name ?? 'Media Missing'} <span>{formatClock(item.startTime, true)}</span></button>
                </div>
              })}
            </div>
          </div>
        })}
        <div ref={cursorRef} className="multi-track-cursor" aria-hidden="true"><span ref={cursorLabelRef} /></div>
      </div>
    </div>
  </section>
}

function AudioWaveform(props: { peaks: number[]; duration: number; sourceIn: number; sourceOut: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent || props.duration <= 0) return
    const draw = () => {
      const width = Math.max(1, parent.clientWidth)
      const height = Math.max(1, parent.clientHeight)
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      context.fillStyle = 'rgba(186, 224, 194, .8)'
      const start = Math.max(0, Math.floor(props.sourceIn / props.duration * props.peaks.length))
      const end = Math.min(props.peaks.length, Math.ceil(props.sourceOut / props.duration * props.peaks.length))
      const count = Math.max(1, end - start)
      for (let x = 0; x < width; x++) {
        const i = Math.min(end - 1, start + Math.floor(x / width * count))
        const amp = props.peaks[i] ?? 0
        const bar = Math.max(1, amp * (height - 8))
        context.fillRect(x, (height - bar) / 2, 1, bar)
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [props.peaks, props.duration, props.sourceIn, props.sourceOut])
  return <canvas className="timeline-wave-canvas" aria-label="Source audio waveform" />
}

export function TimelineInspector(props: { item: TimelineItem; asset?: ProjectAsset; onChange: (patch: Partial<TimelineItem>) => void }) {
  const duration = timelineItemDuration(props.item)
  const sourceOutMax = props.asset?.mediaType === 'image' ? Number.POSITIVE_INFINITY : props.asset?.duration ?? Number.POSITIVE_INFINITY
  const finiteValue = (event: React.ChangeEvent<HTMLInputElement>, fallback: number) => Number.isFinite(event.currentTarget.valueAsNumber) ? event.currentTarget.valueAsNumber : fallback
  const speedInput = (event: React.ChangeEvent<HTMLInputElement>) => props.onChange({ speed: Math.max(0.25, Math.min(4, finiteValue(event, props.item.speed))) })
  return <div className="timeline-inspector">
    <strong>{props.asset?.name ?? 'Missing media'}</strong>
    <label>Start <input type="number" min="0" step="0.01" value={props.item.startTime.toFixed(2)} onChange={(event) => props.onChange({ startTime: Math.max(0, finiteValue(event, props.item.startTime)) })} /></label>
    <label>Source in <input type="number" min="0" max={Math.max(0, props.item.sourceOut - 0.05)} step="0.01" value={props.item.sourceIn.toFixed(2)} onChange={(event) => props.onChange({ sourceIn: Math.max(0, Math.min(props.item.sourceOut - 0.05, finiteValue(event, props.item.sourceIn))) })} /></label>
    <label>Source out <input type="number" min={props.item.sourceIn + 0.05} max={Number.isFinite(sourceOutMax) ? sourceOutMax : undefined} step="0.01" value={props.item.sourceOut.toFixed(2)} onChange={(event) => props.onChange({ sourceOut: Math.min(sourceOutMax, Math.max(props.item.sourceIn + 0.05, finiteValue(event, props.item.sourceOut))) })} /></label>
    {props.asset?.mediaType !== 'image' && <label>Volume <input type="range" min="0" max="1" step="0.01" value={Math.min(1, Math.max(0, props.item.volume))} onChange={(event) => props.onChange({ volume: Math.min(1, Math.max(0, Number(event.target.value))) })} /><span>{Math.round(Math.min(1, Math.max(0, props.item.volume)) * 100)}%</span></label>}
    {props.asset?.mediaType === 'audio' && <>
      <label>Fade in <input type="number" min="0" max={duration} step="0.05" value={props.item.fadeIn} onChange={(event) => props.onChange({ fadeIn: Math.min(duration, Math.max(0, finiteValue(event, props.item.fadeIn))) })} /></label>
      <label>Fade out <input type="number" min="0" max={duration} step="0.05" value={props.item.fadeOut} onChange={(event) => props.onChange({ fadeOut: Math.min(duration, Math.max(0, finiteValue(event, props.item.fadeOut))) })} /></label>
      <label>Speed <input type="number" min="0.25" max="4" step="0.05" value={props.item.speed} onChange={speedInput} /></label>
      <label><input type="checkbox" checked={props.item.muted} onChange={(event) => props.onChange({ muted: event.target.checked })} /> Mute this clip</label>
      <label><input type="checkbox" checked={props.item.loop} onChange={(event) => props.onChange({ loop: event.target.checked })} /> Loop audio</label>
    </>}
    {props.asset?.mediaType === 'video' && <>
      <label>Speed <input type="number" min="0.25" max="4" step="0.05" value={props.item.speed} onChange={speedInput} /></label>
      <label><input type="checkbox" checked={props.item.muted} onChange={(event) => props.onChange({ muted: event.target.checked })} /> Mute clip audio</label>
    </>}
    {props.asset?.mediaType === 'image' && <>
      <label>Duration <input type="number" min="0.1" step="0.1" value={duration.toFixed(1)} onChange={(event) => props.onChange({ sourceIn: 0, sourceOut: Math.max(0.1, finiteValue(event, duration)) })} /></label>
      <label>Opacity <input type="range" min="0" max="1" step="0.01" value={Math.min(1, Math.max(0, props.item.opacity))} onChange={(event) => props.onChange({ opacity: Math.min(1, Math.max(0, Number(event.target.value))) })} /></label>
      <label>Scale <input type="number" min="0.1" max="5" step="0.05" value={props.item.scale} onChange={(event) => props.onChange({ scale: Math.max(0.1, Math.min(5, finiteValue(event, props.item.scale))) })} /></label>
    </>}
  </div>
}
