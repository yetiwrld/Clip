import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines, ClipboardPaste, Copy, CopyPlus, Eye, EyeOff, Film, Image as ImageIcon,
  Lock, Magnet, Maximize2, MoreHorizontal, Plus, Redo2, Scissors, Slice, Trash2, Type, Undo2, Unlock,
  Volume2, VolumeX, ZoomIn, ZoomOut
} from 'lucide-react'
import type { CameraKeyframe, ClipTimeline, ProjectAsset, TextLayer, TimelineItem, TimelineTrack } from '@shared/types'
import { formatClock } from '@shared/utils/time'
import { effectiveItemSpeed, sourceDeltaForTimelineDelta, timelineItemDuration, timelineItemEnd } from '@shared/video/time-map'
import { frameDuration, frameTimeTolerance, snapTimeToFrame } from '@shared/video/frame-rate'
import {
  addAssetToTimeline, copyTimelineItems, cutTimelineItems, deleteTimelineItems, duplicateTimelineItems,
  fitTimelineZoom, hasTimelineOverlap, pasteTimelineItems, resolveTimelineOverlaps, selectTimelineRange, timelineTrackName,
  selectableTimelineIds, splitTimelineItemsAt, TIMELINE_ZOOM_MAX, TIMELINE_ZOOM_MIN, timelineZoomFromSlider,
  timelineZoomSliderValue
} from '@shared/editor/timeline-editing'
import { droppedFilePath, mediaUrl } from '../../api/client'
import { registerCommands, shortcutLabelFor, useCommandRegistry } from '../../commands/registry'
import { timelineCommands, type TimelineHandlers } from '../../commands/screenCommands'
import { useTimelineClipboard } from './timeline-clipboard'

/**
 * What a pointer gesture on a clip is doing.
 *
 * `moving` holds every clip the gesture carries (the whole selection for a move,
 * one clip for a trim), snapshotted at pointer-down so a re-render mid-drag
 * cannot feed partly-updated values back into the maths.
 */
type DragState = {
  id: string
  mode: 'move' | 'left' | 'right'
  startX: number
  initial: TimelineItem
  moving: TimelineItem[]
  moved: boolean
  /** One id for the whole gesture, so its values are one undo step. */
  gesture: string
}
type EditDragState =
  | { mode: 'caption' | 'caption-left' | 'caption-right'; startX: number; key: string; start: number; offset: number }
  | { mode: 'camera'; startX: number; time: number }
  | { mode: 'text' | 'text-left' | 'text-right'; startX: number; layer: TextLayer }

export function MultiTrackTimeline(props: {
  timeline: ClipTimeline
  assets: ProjectAsset[]
  waveforms: Record<string, { peaks: number[]; duration: number }>
  duration: number
  fps?: number | null
  captions?: Array<{ key: string; startTime: number; endTime: number; text: string }>
  textLayers?: TextLayer[]
  captionOffsets?: Record<string, number>
  trackingKeyframes?: Array<{ time: number; x: number; y: number; score: number }>
  cameraKeyframes?: CameraKeyframe[]
  onSetCaptionOffset?: (key: string, offset: number, edge: 'move' | 'start' | 'end') => void
  onSelectTextLayer?: (layer: TextLayer) => void
  onChangeTextLayer?: (id: string, patch: Partial<TextLayer>) => void
  onMoveCameraKeyframe?: (oldTime: number, time: number) => void
  selectedItemId?: string | null
  selectedCaptionKey?: string | null
  selectedTextLayerId?: string | null
  selectedCameraKeyframeTime?: number | null
  playing: boolean
  getPlaybackTime: () => number
  onSelectCaption?: (key: string) => void
  onSelectCameraKeyframe?: (time: number) => void
  onSelectTrackingKeyframe?: (keyframe: { time: number; x: number; y: number; score: number }) => void
  currentTime: number
  onSeek: (time: number) => void
  /**
   * Commit a new timeline value. `discrete` marks a one-shot command so it is
   * never folded into the undo step of a drag that happens around it.
   */
  onChange: (timeline: ClipTimeline, options?: { discrete?: boolean; gesture?: string }) => void
  onNotice?: (message: string) => void
  snapTargets?: number[]
  onSelectItem?: (item: TimelineItem | null) => void
  /** Undo and redo live in the editor; the timeline shows the same buttons. */
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onDropFiles: (paths: string[], time: number, track: TimelineTrack) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const playedRef = useRef<HTMLDivElement>(null)
  const trackMenuRef = useRef<HTMLDetailsElement>(null)
  const dragRef = useRef<DragState | null>(null)
  /** Latest timeline value, readable from a pointer handler that outlives renders. */
  const timelineRef = useRef(props.timeline)
  timelineRef.current = props.timeline
  const editDragRef = useRef<EditDragState | null>(null)
  const cursorDragCleanupRef = useRef<(() => void) | null>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const cursorLabelRef = useRef<HTMLSpanElement>(null)
  const playheadGripRef = useRef<HTMLButtonElement>(null)
  const playheadLineRef = useRef<HTMLDivElement>(null)
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
  /** Multi-selection; the last id is the primary clip the inspector shows. */
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedIdsRef = useRef<string[]>([])
  selectedIdsRef.current = selectedIds
  const selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null
  const selectionAnchorRef = useRef<string | null>(null)
  const [snapGuide, setSnapGuide] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  /** Short, non-blocking confirmation for copy/cut/paste and the like. */
  const [feedback, setFeedback] = useState<string | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const [selectedTrackingTime, setSelectedTrackingTime] = useState<number | null>(null)
  const span = Math.max(30, props.duration || 30)
  pixelsPerSecondRef.current = pixelsPerSecond
  const labelWidthFallback = 160
  const width = Math.max(timelineViewportWidth, labelWidthFallback + span * pixelsPerSecond)
  const gridStep = pixelsPerSecond > 100 ? 1 : pixelsPerSecond > 45 ? 5 : pixelsPerSecond > 15 ? 10 : 60
  const assetById = useMemo(() => new Map(props.assets.map((asset) => [asset.id, asset])), [props.assets])
  // Split acts on the selection when there is one, and on everything under the
  // playhead otherwise. The button must describe that same set: enabling it for
  // a clip the command will not touch was a dead control.
  const splitCandidates = props.timeline.items.filter((item) => selectedIds.length === 0 || selectedIds.includes(item.id))
  const splittableIds = splitCandidates
    .filter((item) => {
      const track = props.timeline.tracks.find((candidate) => candidate.id === item.trackId)
      if (!track || track.locked) return false
      return props.currentTime > item.startTime + 0.05 && props.currentTime < timelineItemEnd(item) - 0.05
    })
    .map((item) => item.id)
  const canSplit = splittableIds.length > 0
  /** Selected clips on a locked track can be seen but never edited. */
  const selectedItemList = props.timeline.items.filter((item) => selectedIds.includes(item.id))
  const selectionLocked = selectedItemList.length > 0 &&
    selectedItemList.every((item) => props.timeline.tracks.find((track) => track.id === item.trackId)?.locked)
  const ticks = useMemo(() => Array.from({ length: Math.floor(span / gridStep) + 1 }, (_, i) => i * gridStep), [gridStep, span])

  /** Ruler timecodes read 00:00 / 00:10 like the reference editor, not 0:00.0. */
  function rulerLabel(time: number): string {
    const total = Math.max(0, Math.round(time))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    const mm = String(minutes).padStart(2, '0')
    const ss = String(seconds).padStart(2, '0')
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
  }

  function getTrackLabelWidth() {
    return scrollRef.current?.querySelector<HTMLElement>('.multi-track-label')?.getBoundingClientRect().width || labelWidthFallback
  }

  useEffect(() => () => {
    cursorDragCleanupRef.current?.()
    if (dragSeekFrameRef.current !== null) cancelAnimationFrame(dragSeekFrameRef.current)
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current)
  }, [])

  // Drop selected clips that no longer exist (delete, undo, a paste that was
  // rolled back) so Copy never carries a stale id.
  useEffect(() => {
    const existing = new Set(props.timeline.items.map((item) => item.id))
    const current = selectedIdsRef.current
    const next = current.filter((id) => existing.has(id))
    if (next.length === current.length) return
    setSelectedIds(next)
    applySelection(next, next[next.length - 1] ?? null)
  }, [props.timeline.items])

  // The parent owns the primary clip (the inspector reads it). Only take its
  // value when it points at something the local selection does not contain, so
  // a multi-selection is not collapsed by its own echo coming back.
  useEffect(() => {
    const incoming = props.selectedItemId ?? null
    if (incoming === null) {
      if (selectedIdsRef.current.length > 0) {
        setSelectedIds([])
        selectionAnchorRef.current = null
      }
      return
    }
    if (!selectedIdsRef.current.includes(incoming)) {
      setSelectedIds([incoming])
      selectionAnchorRef.current = incoming
    }
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
      positionPlayhead(props.currentTime)
      positionCursor(props.currentTime, false)
      return
    }
    let frame = 0
    const followPlayback = () => {
      const time = props.getPlaybackTime()
      positionPlayhead(time)
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
    // The ruler's played strip rides along with the playhead. One custom
    // property, consumed by a transform, so playback stays compositor work.
    const played = playedRef.current
    if (played) {
      // The ruler spans `span` seconds (padded to 30), so the fraction already
      // played is simply time / span.
      const ratio = Math.min(1, Math.max(0, time / span))
      played.style.setProperty('--played-ratio', ratio.toFixed(4))
    }
    const cursor = cursorRef.current
    if (!cursor) return
    cursor.style.setProperty('--cursor-x', `${getTrackLabelWidth() + time * pixelsPerSecond}px`)
    cursor.classList.toggle('hovering', hovering)
    if (cursorLabelRef.current) cursorLabelRef.current.textContent = formatClock(time, true)
  }

  /**
   * Move the playhead itself. The hover line above is only a preview of where a
   * click would land; the playhead is the real position, so it has its own
   * updater and is never moved by hovering.
   */
  function positionPlayhead(time: number) {
    const x = `${time * pixelsPerSecond}px`
    playheadGripRef.current?.style.setProperty('--grip-x', x)
    playheadLineRef.current?.style.setProperty('--playhead-x', x)
  }

  // ---------------------------------------------------------- selection ---
  /**
   * Apply a selection and tell the parent which clip to show in the inspector.
   * `primaryId` is the clip the user just acted on, which is not always the
   * last one in the list (a range click keeps the clicked clip primary).
   */
  function applySelection(ids: string[], primaryId?: string | null) {
    // The ref is what a command reads at key-press time; keep it in step with
    // the state so Ctrl+C right after a click never acts on the old selection.
    selectedIdsRef.current = ids
    setSelectedIds(ids)
    const primary = primaryId ?? ids[ids.length - 1] ?? null
    const item = primary ? props.timeline.items.find((candidate) => candidate.id === primary) ?? null : null
    props.onSelectItem?.(item)
  }

  function selectOnly(id: string | null) {
    selectionAnchorRef.current = id
    applySelection(id ? [id] : [])
  }

  const selectedItems = useMemo(
    () => props.timeline.items.filter((item) => selectedIds.includes(item.id)),
    [props.timeline.items, selectedIds]
  )

  function replaceItem(id: string, patch: Partial<TimelineItem>, gesture?: string) {
    const updated = props.timeline.items.find((item) => item.id === id)
    if (updated && selectedId === id) props.onSelectItem?.({ ...updated, ...patch })
    props.onChange({ ...props.timeline, items: props.timeline.items.map((item) => item.id === id ? { ...item, ...patch } : item) }, { gesture })
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
      if (drag.mode === 'caption' || drag.mode === 'caption-left' || drag.mode === 'caption-right') {
        const edge = drag.mode === 'caption-left' ? 'start' : drag.mode === 'caption-right' ? 'end' : 'move'
        props.onSetCaptionOffset?.(drag.key, drag.offset + delta, edge)
      } else if (drag.mode === 'camera') {
        const next = Math.max(0, Math.min(span, drag.time + delta))
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
    // The playhead rests on a frame the render can actually cut at.
    const next = Math.max(0, Math.min(span, snapTimeToFrame(time, props.fps)))
    pinnedTimeRef.current = next
    positionPlayhead(next)
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
  function beginCursorDrag(event: React.PointerEvent, fromPlayheadGrip = false) {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (event.button !== 0) return
    if (!fromPlayheadGrip && target?.closest('.multi-track-label, .multi-track-item, .timeline-caption-block, .timeline-text-block, .timeline-tracking-marker, .timeline-keyframe-marker, .timeline-trim, .caption-trim-handle, .text-trim-handle, button, input')) return
    // A plain press on empty timeline space drops the selection, the way
    // clicking off a clip does in a desktop editor.
    if (!fromPlayheadGrip && !event.shiftKey && !event.ctrlKey && !event.metaKey && target?.closest('.multi-track-lane')) {
      selectionAnchorRef.current = null
      applySelection([])
    }
    const viewport = scrollRef.current
    if (!viewport) return
    const labelWidth = getTrackLabelWidth()
    cursorDraggingRef.current = true
    cursorDragCleanupRef.current?.()
    const update = (clientX: number) => {
      const rect = viewport.getBoundingClientRect()
      const x = Math.max(labelWidth, Math.min(viewport.clientWidth, clientX - rect.left))
      const time = Math.max(0, Math.min(span, (viewport.scrollLeft + x - labelWidth) / pixelsPerSecond))
      // Dragging the handle drags the playhead with the pointer; a click on the
      // ruler only moves it once the pointer is released.
      if (fromPlayheadGrip) positionPlayhead(time)
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
    const id = crypto.randomUUID()
    const name = timelineTrackName(props.timeline.tracks, type)
    const track: TimelineTrack = { id, name, type, order: props.timeline.tracks.length, muted: false, hidden: false, locked: false }
    props.onChange({ ...props.timeline, tracks: [...props.timeline.tracks, track] }, { discrete: true })
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
    const placed = addAssetToTimeline(props.timeline, asset, { at: time, trackId: track.id, newId: () => crypto.randomUUID() })
    if (!placed) return
    props.onChange(placed.timeline, { discrete: true })
    selectOnly(placed.item.id)
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
  /** Every time a drag or trim can snap to, in timeline seconds. */
  function snapTargetTimes(excludedIds: string[]): number[] {
    const excluded = new Set(excludedIds)
    const times = [0, props.currentTime, ...(props.snapTargets ?? [])]
    for (const item of props.timeline.items) {
      if (excluded.has(item.id)) continue
      times.push(item.startTime, timelineItemEnd(item))
    }
    return times
  }

  /** Nearest snap target within the pointer threshold, or null. */
  function snapValue(time: number, targets: number[], thresholdSeconds: number): number | null {
    let best: number | null = null
    for (const target of targets) {
      if (!Number.isFinite(target)) continue
      if (Math.abs(target - time) >= thresholdSeconds) continue
      if (best === null || Math.abs(target - time) < Math.abs(best - time)) best = target
    }
    return best
  }

  /** Which unlocked, compatible track sits under the pointer. */
  function trackAtPointer(clientX: number, clientY: number, item: TimelineItem): TimelineTrack | null {
    const element = document.elementFromPoint(clientX, clientY)
    const row = element instanceof Element ? element.closest<HTMLElement>('[data-track-id]') : null
    const trackId = row?.dataset.trackId
    if (!trackId) return null
    const track = props.timeline.tracks.find((candidate) => candidate.id === trackId)
    if (!track || track.locked || track.id === item.trackId) return null
    const asset = assetById.get(item.assetId)
    // A video clip cannot live on an audio track; the model would render
    // nothing and the save would look successful while the clip vanished.
    if (!asset || asset.mediaType !== track.type) return null
    return track
  }

  function beginDrag(event: React.PointerEvent, item: TimelineItem, mode: DragState['mode']) {
    if (event.button !== 0) return
    const track = props.timeline.tracks.find((row) => row.id === item.trackId)
    if (track?.locked) return
    event.stopPropagation(); event.preventDefault()

    // Selection is decided at pointer-down, the way a desktop editor does it:
    // plain click selects, Ctrl/Cmd toggles, Shift extends along the track, and
    // dragging a clip that is already part of a selection moves the whole
    // selection together.
    const current = selectedIdsRef.current
    let next: string[] = current
    if (mode !== 'move') {
      next = [item.id]
      selectionAnchorRef.current = item.id
    } else if (event.shiftKey) {
      next = selectTimelineRange(props.timeline, selectionAnchorRef.current ?? item.id, item.id)
      if (next.length === 0) next = [item.id]
    } else if (event.ctrlKey || event.metaKey) {
      next = current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
      selectionAnchorRef.current = item.id
    } else if (!current.includes(item.id)) {
      next = [item.id]
      selectionAnchorRef.current = item.id
    }
    applySelection(next, next.includes(item.id) ? item.id : next[next.length - 1] ?? null)
    if (!next.includes(item.id)) return

    // A trim is always a single-clip gesture; moving can carry the selection.
    // A locked track never moves, even when its clip is part of a multi-select.
    const movingIds = mode === 'move' ? next : [item.id]
    const moving = props.timeline.items.filter((candidate) => {
      if (!movingIds.includes(candidate.id)) return false
      return !props.timeline.tracks.find((row) => row.id === candidate.trackId)?.locked
    })
    if (moving.length === 0) return
    const gesture = crypto.randomUUID()
    dragRef.current = { id: item.id, mode, startX: event.clientX, initial: item, moving, moved: false, gesture }
    setDraggingId(item.id)
    dragScrollStartRef.current = scrollRef.current?.scrollLeft ?? 0
    // Selecting is not seeking. Tapping a clip used to put the playhead on its
    // first frame, which made a preview that was already playing restart.
    const onMove = (move: PointerEvent) => {
      const state = dragRef.current
      if (!state) return
      autoScrollDuringDrag(move.clientX)
      const dt = dragDeltaSeconds(move.clientX, state.startX)
      const original = state.initial
      const frame = frameDuration(props.fps)
      const threshold = 8 / pixelsPerSecond
      if (state.mode === 'move') {
        // Cross-track: only a single clip can change track, and only onto a
        // track that takes its media type.
        const target = state.moving.length === 1 ? trackAtPointer(move.clientX, move.clientY, original) : null
        setDragTarget(target?.id ?? null)

        const groupStart = Math.min(...state.moving.map((entry) => entry.startTime))
        let delta = Math.max(-groupStart, dt)
        let guide: number | null = null
        if (props.timeline.snapEnabled) {
          const targets = snapTargetTimes(state.moving.map((entry) => entry.id))
          const startEdge = original.startTime + delta
          const endEdge = startEdge + timelineItemDuration(original)
          const snappedStart = snapValue(startEdge, targets, threshold)
          const snappedEnd = snapValue(endEdge, targets, threshold)
          if (snappedStart !== null) {
            delta = snappedStart - original.startTime
            guide = snappedStart
          } else if (snappedEnd !== null) {
            delta = snappedEnd - timelineItemDuration(original) - original.startTime
            guide = snappedEnd
          }
        }
        if (guide === null) delta = snapTimeToFrame(original.startTime + delta, props.fps) - original.startTime
        // A line in the target lane says exactly where the clip will land.
        setDropTime(target ? Math.max(0, original.startTime + delta) : null)
        const movingSet = new Set(state.moving.map((entry) => entry.id))
        const items = props.timeline.items.map((entry) => {
          if (!movingSet.has(entry.id)) return entry
          const origin = state.moving.find((candidate) => candidate.id === entry.id) ?? entry
          return {
            ...entry,
            startTime: Math.max(0, snapTimeToFrame(origin.startTime + delta, props.fps)),
            trackId: entry.id === original.id && target ? target.id : entry.trackId
          }
        })
        state.moved = Math.abs(delta) > 1e-6 || Boolean(target)
        setSnapGuide(guide)
        props.onChange({ ...props.timeline, items }, { gesture })
        return
      }
      if (state.mode === 'left') {
        const minimumDelta = Math.max(-original.startTime, -original.sourceIn / effectiveItemSpeed(original.speed))
        let delta = Math.max(minimumDelta, Math.min(dt, timelineItemDuration(original) - 0.05))
        let guide: number | null = null
        if (props.timeline.snapEnabled) {
          const snapped = snapValue(original.startTime + delta, snapTargetTimes([original.id]), threshold)
          if (snapped !== null && snapped - original.startTime >= minimumDelta && snapped - original.startTime <= timelineItemDuration(original) - 0.05) {
            delta = snapped - original.startTime
            guide = snapped
          }
        }
        const nextStart = snapTimeToFrame(original.startTime + delta, props.fps)
        const frameDelta = nextStart - original.startTime
        setSnapGuide(guide)
        replaceItem(state.id, { startTime: nextStart, sourceIn: Math.max(0, original.sourceIn + sourceDeltaForTimelineDelta(frameDelta, original.speed)) }, gesture)
        return
      }
      const asset = assetById.get(original.assetId)
      const maximumSourceOut = asset?.mediaType === 'image' ? Number.POSITIVE_INFINITY : asset?.duration ?? Number.POSITIVE_INFINITY
      let sourceOut = Math.max(original.sourceIn + frame, original.sourceOut + sourceDeltaForTimelineDelta(dt, original.speed))
      let guide: number | null = null
      if (props.timeline.snapEnabled) {
        const endEdge = timelineItemEnd(original) + dt
        const snapped = snapValue(endEdge, snapTargetTimes([original.id]), threshold)
        if (snapped !== null) {
          guide = snapped
          sourceOut = original.sourceOut + sourceDeltaForTimelineDelta(snapped - timelineItemEnd(original), original.speed)
        }
      }
      setSnapGuide(guide)
      replaceItem(state.id, { sourceOut: Math.min(maximumSourceOut, Math.max(original.sourceIn + frame, sourceOut)) }, gesture)
    }
    const onUp = () => {
      const state = dragRef.current
      dragRef.current = null
      setDraggingId(null)
      setSnapGuide(null)
      setDragTarget(null)
      setDropTime(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (!state || state.mode !== 'move' || !state.moved) return
      // The drag itself is free-form; on release the clips it covers give way,
      // so a clip dropped on top of another replaces the covered part instead
      // of stacking two clips in the same space.
      const ids = state.moving.map((entry) => entry.id)
      const latest = timelineRef.current
      if (hasTimelineOverlap(latest, ids)) props.onChange(resolveTimelineOverlaps(latest, ids, () => crypto.randomUUID()), { gesture: state.gesture })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('pointercancel', onUp, { once: true })
  }
  function adjustItemByKey(event: React.KeyboardEvent<HTMLButtonElement>, item: TimelineItem, edge: 'left' | 'right') {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    if (!selectedIdsRef.current.includes(item.id)) selectOnly(item.id)
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
  /** Track controls are one-shot edits; renaming is typed and coalesces. */
  function updateTrack(id: string, patch: Partial<TimelineTrack>, discrete = true) {
    props.onChange(
      { ...props.timeline, tracks: props.timeline.tracks.map((track) => track.id === id ? { ...track, ...patch } : track) },
      { discrete }
    )
  }
  const orderedTracks = [...props.timeline.tracks].sort((a, b) => a.order - b.order)
  const trackHasClips = (id: string) => props.timeline.items.some((item) => item.trackId === id)

  /**
   * Move a track one slot up or down. Order is what decides who covers whom, so
   * this is a real edit of the project rather than a display setting.
   */
  function moveTrack(id: string, direction: -1 | 1) {
    const ordered = [...props.timeline.tracks].sort((a, b) => a.order - b.order)
    const index = ordered.findIndex((track) => track.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ordered.length) return
    const next = [...ordered]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    props.onChange(
      { ...props.timeline, tracks: next.map((track, position) => ({ ...track, order: position })) },
      { discrete: true }
    )
  }

  /** A track is only removable once it holds nothing, so no clip is lost. */
  function removeTrack(id: string) {
    if (props.timeline.items.some((item) => item.trackId === id)) return
    const next = props.timeline.tracks.filter((track) => track.id !== id)
      .sort((a, b) => a.order - b.order)
      .map((track, position) => ({ ...track, order: position }))
    props.onChange({ ...props.timeline, tracks: next }, { discrete: true })
  }

  // ------------------------------------------------------- edit commands ---
  // One implementation per command, shared by the toolbar, the context menu
  // and the shortcut registry. Nothing here is a separate code path.

  /** A discrete edit is one undo step of its own, never merged with a drag. */
  function commit(next: ClipTimeline) {
    props.onChange(next, { discrete: true })
  }

  /**
   * Short, in-place confirmation. It sits in the toolbar's status slot instead
   * of raising a toast, so a copy or a paste never interrupts the next action.
   */
  function showFeedback(message: string) {
    setFeedback(message)
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => {
      feedbackTimerRef.current = null
      setFeedback(null)
    }, 2400)
  }

  const clipCount = (count: number) => `${count} clip${count === 1 ? '' : 's'}`

  function splitAtPlayhead() {
    // With a selection, split what the playhead crosses in it; with none, split
    // everything the playhead crosses, which is what Ctrl/Cmd+B means in an
    // editor where the playhead is the razor.
    const ids = selectedItems.length > 0
      ? selectedItems.map((item) => item.id)
      : props.timeline.items
        .filter((item) => {
          const track = props.timeline.tracks.find((candidate) => candidate.id === item.trackId)
          return Boolean(track && !track.locked)
        })
        .map((item) => item.id)
    // Cut on a frame boundary: a split at an arbitrary float leaves a segment
    // that starts between two frames, which the renderer cannot produce.
    const at = snapTimeToFrame(props.currentTime, props.fps)
    const result = splitTimelineItemsAt(props.timeline, ids, at, () => crypto.randomUUID())
    if (!result) {
      props.onNotice?.('Move the playhead inside a selected clip to split it.')
      return
    }
    commit(result.timeline)
    applySelection(result.ids, result.ids[0])
  }

  function copySelected() {
    const clipboard = copyTimelineItems(props.timeline, selectedIdsRef.current)
    if (!clipboard) return false
    useTimelineClipboard.getState().setClipboard(clipboard)
    showFeedback(`Copied ${clipCount(clipboard.entries.length)}. Paste at the playhead.`)
    closeMenus()
    return true
  }

  function cutSelected() {
    if (selectionLocked) {
      props.onNotice?.('The selected clips are on a locked track. Unlock the track to edit them.')
      return false
    }
    const result = cutTimelineItems(props.timeline, selectedIdsRef.current)
    if (!result) return false
    useTimelineClipboard.getState().setClipboard(result.clipboard)
    commit(result.timeline)
    applySelection([])
    showFeedback(`Cut ${clipCount(result.clipboard.entries.length)}.`)
    closeMenus()
    return true
  }

  function pasteCopied() {
    const store = useTimelineClipboard.getState()
    if (!store.clipboard) return false
    const at = store.pasteTarget(props.currentTime)
    const result = pasteTimelineItems(props.timeline, store.clipboard, {
      at,
      newId: () => crypto.randomUUID(),
      // Media that is missing from disk cannot be pasted back into the project.
      existingAssetIds: new Set(props.assets.filter((asset) => !asset.missing).map((asset) => asset.id))
    })
    if (!result || result.ids.length === 0) {
      props.onNotice?.('There is no compatible unlocked track to paste onto.')
      return false
    }
    commit(result.timeline)
    applySelection(result.ids, result.ids[0])
    store.rememberPaste(at, store.clipboard.span)
    showFeedback(result.skipped > 0
      ? `Pasted ${result.ids.length} of ${result.ids.length + result.skipped} clips — the rest had no compatible track.`
      : `Pasted ${clipCount(result.ids.length)} at ${formatClock(at, true)}.`)
    closeMenus()
    return true
  }

  function duplicateSelected() {
    if (selectionLocked) {
      props.onNotice?.('The selected clips are on a locked track. Unlock the track to edit them.')
      return
    }
    const result = duplicateTimelineItems(props.timeline, selectedIdsRef.current, () => crypto.randomUUID())
    if (!result) return
    commit(result.timeline)
    applySelection(result.ids, result.ids[0])
    showFeedback(`Duplicated ${clipCount(result.ids.length)}.`)
    closeMenus()
  }

  function deleteSelected() {
    if (selectionLocked) {
      props.onNotice?.('The selected clips are on a locked track. Unlock the track to edit them.')
      return
    }
    const result = deleteTimelineItems(props.timeline, selectedIdsRef.current)
    if (!result) return
    commit(result.timeline)
    applySelection([])
    showFeedback(`Deleted ${clipCount(result.removedIds.length)}.`)
    closeMenus()
  }

  function selectAllClips() {
    const ids = selectableTimelineIds(props.timeline)
    applySelection(ids, ids[ids.length - 1] ?? null)
    closeMenus()
  }

  function clearSelection() {
    selectionAnchorRef.current = null
    applySelection([])
    closeMenus()
  }

  function setSnap() { commit({ ...props.timeline, snapEnabled: !props.timeline.snapEnabled }) }


  function closeMenus() {
    setContextMenu(null)
  }

  const hasSelection = selectedIds.length > 0
  // Why an edit command cannot run right now. The source clip is a real
  // selection, so telling the user to select a clip they already selected is
  // the wrong answer; say what is actually true.
  const editDisabledHint = selectionLocked
    ? 'the selection is locked'
    : 'select a timeline clip first'

  // These subscriptions repaint the menus when the clipboard changes or the
  // commands finish registering (they register in an effect, after first paint).
  // The values themselves are read live so the render always matches the store.
  // Subscribe so the browser repaints when the clipboard changes, but read the
  // value live: a server render (the wiring test) has no subscription, and the
  // live read is also what the command handlers see at key-press time.
  useTimelineClipboard((state) => state.clipboard)
  useCommandRegistry((state) => state.commands)
  const hasClipboard = useTimelineClipboard.getState().clipboard !== null
  const menuShortcut = (id: string) => {
    const label = shortcutLabelFor(id)
    return label ? <span className="menu-shortcut">{label}</span> : null
  }

  // Timeline keys live in the shared registry too; this component supplies the
  // actions and removes them when the timeline unmounts.
  const commandHandlers = useRef<TimelineHandlers | null>(null)

  useEffect(() => {
    commandHandlers.current = {
      hasSelection: () => selectedIdsRef.current.length > 0,
      deleteSelected,
      duplicateSelected,
      cutSelected: () => void cutSelected(),
      copySelected: () => void copySelected(),
      pasteSelected: () => void pasteCopied(),
      hasClipboard: () => useTimelineClipboard.getState().clipboard !== null,
      splitSelected: splitAtPlayhead,
      canSplit: () => splittableIds.length > 0,
      selectAll: selectAllClips,
      clearSelection,
      toggleSnap: setSnap
    }
  })

  useEffect(() => registerCommands(timelineCommands(() => commandHandlers.current as TimelineHandlers)), [])

  return <section className="multi-track-editor" aria-label="Multi-track timeline editor">
    <div className="multi-track-toolbar">
      <div className="row timeline-toolbar-actions" role="toolbar" aria-label="Timeline editing tools">
        <TimelineAction commandId="timeline.cut" description="Cut selected clips" disabledHint={editDisabledHint} icon={<Scissors size={20} />} onClick={() => void cutSelected()} disabled={!hasSelection || selectionLocked} />
        <TimelineAction commandId="timeline.copy" description="Copy selected clips" icon={<Copy size={20} />} onClick={() => void copySelected()} disabled={!hasSelection} />
        <TimelineAction commandId="timeline.paste" description="Paste clips at the playhead" disabledHint="copy a clip first" icon={<ClipboardPaste size={20} />} onClick={() => void pasteCopied()} disabled={!hasClipboard} />
        <span className="timeline-toolbar-divider" aria-hidden="true" />
        <TimelineAction commandId="timeline.split" description="Split clips at playhead" disabledHint="move the playhead inside a clip first" icon={<Slice size={20} />} onClick={splitAtPlayhead} disabled={!canSplit} />
        <TimelineAction commandId="timeline.duplicate" description="Duplicate selected clips" disabledHint={editDisabledHint} icon={<CopyPlus size={20} />} onClick={duplicateSelected} disabled={!hasSelection || selectionLocked} />
        <span className="timeline-toolbar-divider" aria-hidden="true" />
        <TimelineAction commandId="timeline.delete" description="Delete selected clips" disabledHint={editDisabledHint} icon={<Trash2 size={20} />} onClick={deleteSelected} disabled={!hasSelection || selectionLocked} />
        <span className="timeline-toolbar-divider" aria-hidden="true" />
        <button type="button" className={`btn sm icon timeline-snap${props.timeline.snapEnabled ? ' active' : ''}`} onClick={setSnap} title={`Magnetic snapping ${props.timeline.snapEnabled ? 'on' : 'off'} — clips snap to the playhead and to each other · Shift+S`} aria-label={`Magnetic snapping ${props.timeline.snapEnabled ? 'on' : 'off'}`} aria-pressed={props.timeline.snapEnabled}>
          <Magnet size={16} />
        </button>
        <details className="timeline-add-track-menu" ref={trackMenuRef}>
          <summary className="btn sm icon timeline-add-track-summary" aria-label="Add timeline track" aria-haspopup="menu" title="Add a track — video, audio or graphics"><Plus size={16} /></summary>
          <div className="timeline-add-track-options" role="menu" aria-label="Track type">
            <button type="button" role="menuitem" onClick={() => addTrack('video')}><Film size={14} /> Video track</button>
            <button type="button" role="menuitem" onClick={() => addTrack('audio')}><AudioLines size={14} /> Audio track</button>
            <button type="button" role="menuitem" onClick={() => addTrack('image')}><ImageIcon size={14} /> Graphics track</button>
          </div>
        </details>
        <span className="timeline-toolbar-divider" aria-hidden="true" />
        <button type="button" className="btn ghost sm icon" onClick={props.onUndo} disabled={!props.canUndo} title={`Undo${shortcutLabelFor('editor.undo') ? ` · ${shortcutLabelFor('editor.undo')}` : ''}`} aria-label="Undo timeline edit"><Undo2 size={14} /></button>
        <button type="button" className="btn ghost sm icon" onClick={props.onRedo} disabled={!props.canRedo} title={`Redo${shortcutLabelFor('editor.redo') ? ` · ${shortcutLabelFor('editor.redo')}` : ''}`} aria-label="Redo timeline edit"><Redo2 size={14} /></button>
      </div>
      <div className="timeline-toolbar-right">
        <span
          className={`timeline-selection-status${feedback ? ' is-feedback' : ''}${selectionLocked ? ' is-locked' : ''}`}
          role={feedback ? 'status' : undefined}
          aria-live={feedback ? 'polite' : 'off'}
        >
          {feedback ?? (selectionLocked
              ? 'Selected clips are locked'
              : hasSelection
                ? (canSplit ? `${clipCount(selectedIds.length)} selected` : `${clipCount(selectedIds.length)} selected · move the playhead to split`)
                : 'Select a clip to edit')}
        </span>
        <label className="timeline-zoom-control" title="Timeline zoom">
          <ZoomOut size={12} aria-hidden="true" />
          <input type="range" aria-label="Timeline zoom" title="Timeline zoom" min="0" max="100" step="1" value={timelineZoomSliderValue(pixelsPerSecond)} onChange={(event) => setZoomFromSlider(Number(event.target.value))} />
          <ZoomIn size={12} aria-hidden="true" />
        </label>
        <button type="button" className="btn ghost sm icon" onClick={fitTimeline} title="Fit full project in the timeline" aria-label="Fit full project in timeline"><Maximize2 size={14} /></button>
      </div>
    </div>
    <div className="multi-track-scroll" ref={scrollRef} onPointerMove={updateHoverCursor} onPointerLeave={() => { if (!cursorDraggingRef.current) positionCursor(pinnedTimeRef.current ?? props.currentTime, false) }} onPointerDownCapture={beginCursorDrag}>
      <div className="multi-track-canvas" style={{ width, '--timeline-grid-size': `${pixelsPerSecond * gridStep}px` } as React.CSSProperties}>
        <div className="multi-track-ruler"><div className="multi-track-label"><span className="ruler-heading">TRACKS</span></div><div className="multi-track-ruler-body"><div className="multi-track-played" ref={playedRef} aria-hidden="true" />{ticks.map((time) => <button type="button" key={time} style={{ left: time * pixelsPerSecond }} aria-label={`Seek to ${formatClock(time, true)}`} title={`Seek to ${formatClock(time, true)}`} onClick={() => seekTo(time)}>{rulerLabel(time)}<i /></button>)}<button type="button" ref={playheadGripRef} className="timeline-playhead-grip" aria-label={`Playhead at ${formatClock(props.currentTime, true)} — drag to move`} title={`Playhead ${formatClock(props.currentTime, true)} · drag to move · arrow keys step one frame`} onPointerDown={(event) => { event.stopPropagation(); beginCursorDrag(event, true) }} /></div></div>
        {props.captions && props.captions.length > 0 ? (
          <div className="multi-track-row caption-track-row">
            <div className="multi-track-label"><span className="track-title"><Type size={14} /> Captions</span><small>{props.captions.length === 1 ? '1 block' : `${props.captions.length} blocks`}</small></div>
            <div className="multi-track-lane">
              {props.captions.map((caption) => (
                <div key={caption.key} role="group" className={`timeline-caption-block${props.selectedCaptionKey === caption.key ? ' selected' : ''}`}
                  style={{ left: caption.startTime * pixelsPerSecond, width: Math.max(20, (caption.endTime - caption.startTime) * pixelsPerSecond) }}>
                  <button type="button" className="timeline-caption-content" aria-label={`Caption at ${formatClock(caption.startTime, true)}: ${caption.text}`} title="Click to select · drag to move · double-click to move the playhead" onDoubleClick={() => seekTo(caption.startTime)} onPointerDown={(event) => {
                    props.onSelectCaption?.(caption.key)
                    beginEditDrag(event, { mode: 'caption', startX: event.clientX, key: caption.key, start: caption.startTime, offset: props.captionOffsets?.[caption.key] ?? 0 })
                  }} onClick={(event) => { if (event.detail !== 0) return; props.onSelectCaption?.(caption.key) }}>{caption.text}</button>
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
          <div className="multi-track-label"><span className="track-title"><Type size={14} /> Text / graphics</span><small>{props.textLayers.length === 1 ? '1 layer' : `${props.textLayers.length} layers`}</small></div>
          <div className="multi-track-lane">
            {props.textLayers.length === 0 && <span className="timeline-empty-track">Add a text layer in Text / graphics to place it here.</span>}
            {props.textLayers.map((layer) => <div key={layer.id} role="group" className={`timeline-text-block${props.selectedTextLayerId === layer.id ? ' selected' : ''}`} style={{ left: layer.startTime * pixelsPerSecond, width: Math.max(24, (layer.endTime - layer.startTime) * pixelsPerSecond) }}>
              <button type="button" className="timeline-text-content" aria-label={`Text layer ${layer.text || 'untitled'} at ${formatClock(layer.startTime, true)}`} title="Click to select · drag to move · double-click to move the playhead" onDoubleClick={() => seekTo(layer.startTime)} onClick={(event) => { if (event.detail !== 0) return; props.onSelectTextLayer?.(layer) }} onPointerDown={(event) => { props.onSelectTextLayer?.(layer); beginEditDrag(event, { mode: 'text', startX: event.clientX, layer }) }}>{layer.text || 'Text layer'}</button>
              <button type="button" role="slider" aria-orientation="horizontal" className="text-trim-handle left" aria-label={`Adjust start of text layer ${layer.text || 'untitled'}`} aria-valuemin={0} aria-valuemax={layer.endTime - 0.1} aria-valuenow={layer.startTime} title="Drag or use arrow keys to adjust text start" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustTextLayerByKey(event, layer, 'left')} onPointerDown={(event) => { event.stopPropagation(); props.onSelectTextLayer?.(layer); beginEditDrag(event, { mode: 'text-left', startX: event.clientX, layer }) }} />
              <button type="button" role="slider" aria-orientation="horizontal" className="text-trim-handle right" aria-label={`Adjust end of text layer ${layer.text || 'untitled'}`} aria-valuemin={layer.startTime + 0.1} aria-valuemax={span} aria-valuenow={layer.endTime} title="Drag or use arrow keys to adjust text end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => adjustTextLayerByKey(event, layer, 'right')} onPointerDown={(event) => { event.stopPropagation(); props.onSelectTextLayer?.(layer); beginEditDrag(event, { mode: 'text-right', startX: event.clientX, layer }) }} />
            </div>)}
          </div>
        </div>}
        {(props.cameraKeyframes?.length || props.trackingKeyframes?.length) ? <div className="multi-track-row camera-track-row"><div className="multi-track-label"><span className="track-title"><Film size={14} /> Camera / tracking</span><small>{props.cameraKeyframes?.length ?? 0} keyframes</small></div><div className="multi-track-lane">{props.trackingKeyframes?.map((keyframe, index) => <button type="button" key={`track-${keyframe.time}-${index}`} className={`timeline-tracking-marker${selectedTrackingTime === keyframe.time ? ' selected' : ''}`} style={{ left: keyframe.time * pixelsPerSecond }} aria-label={`Tracking sample at ${formatClock(keyframe.time, true)}, ${Math.round(keyframe.score * 100)} percent confidence`} title={`Tracking sample · ${formatClock(keyframe.time, true)} · ${Math.round(keyframe.score * 100)}% confidence`} onClick={() => { setSelectedTrackingTime(keyframe.time); if (props.onSelectTrackingKeyframe) props.onSelectTrackingKeyframe(keyframe); else seekTo(keyframe.time) }}>•</button>)}{props.cameraKeyframes?.map((keyframe, index) => <button type="button" key={`${keyframe.time}-${index}`} className={`timeline-keyframe-marker${props.selectedCameraKeyframeTime !== null && Math.abs(keyframe.time - (props.selectedCameraKeyframeTime ?? -100)) < frameTimeTolerance(props.fps) ? ' selected' : ''}`} style={{ left: keyframe.time * pixelsPerSecond }} aria-label={`Camera keyframe at ${formatClock(keyframe.time, true)}`} title={`Camera keyframe ${formatClock(keyframe.time, true)} · ${keyframe.easing}`} onClick={(event) => { if (event.detail === 0) props.onSelectCameraKeyframe?.(keyframe.time) }} onPointerDown={(event) => { props.onSelectCameraKeyframe?.(keyframe.time); beginEditDrag(event, { mode: 'camera', startX: event.clientX, time: keyframe.time }) }}>◆</button>)}</div></div> : null}
        {orderedTracks.map((track, trackIndex) => {
          const TrackIcon = track.type === 'audio' ? AudioLines : track.type === 'image' ? Eye : Volume2
          return <div className={`multi-track-row ${dragTarget === track.id ? 'drop-target' : ''} ${track.hidden ? 'track-hidden' : ''} ${track.locked ? 'track-locked' : ''}`} key={track.id} data-track-id={track.id}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = track.locked ? 'none' : 'copy'; setDragTarget(track.id); setDropTime(timeFromEvent(event, track)) }}
            onDragLeave={(event) => { if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return; setDragTarget(null); setDropTime(null) }}
            onDrop={(event) => onDrop(event, track)}>
            <div className={`multi-track-label kind-${track.type}`}>
              <span className="track-title"><TrackIcon size={14} aria-hidden="true" /> <input aria-label={`Name for ${track.name}`} value={track.name} onChange={(event) => updateTrack(track.id, { name: event.target.value }, false)} /></span>
              <span className="track-tools">
                {(track.type === 'audio' || track.type === 'video') && <button type="button" aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${track.name}`} aria-pressed={track.muted} title={track.muted ? 'Unmute track' : 'Mute track'} onClick={() => updateTrack(track.id, { muted: !track.muted })}>{track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>}
                {(track.type === 'video' || track.type === 'image') && <button type="button" aria-label={`${track.hidden ? 'Show' : 'Hide'} ${track.name}`} aria-pressed={track.hidden} title={track.hidden ? 'Show track' : 'Hide track'} onClick={() => updateTrack(track.id, { hidden: !track.hidden })}>{track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>}
                <button type="button" aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.name}`} aria-pressed={track.locked} title={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => updateTrack(track.id, { locked: !track.locked })}>{track.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
                <details className={`track-menu${trackIndex >= orderedTracks.length / 2 ? ' opens-up' : ''}`}>
                  <summary aria-label={`More options for ${track.name}`} title="Track options"><MoreHorizontal size={12} /></summary>
                  <div className="track-menu-options" role="menu" aria-label={`${track.name} options`}>
                    <button type="button" role="menuitem" disabled={trackIndex === 0} title={trackIndex === 0 ? 'This is already the top track' : 'Move this track above the one before it'} onClick={(event) => { const menu = event.currentTarget.closest('details'); if (menu) menu.open = false; moveTrack(track.id, -1) }}>Move up</button>
                    <button type="button" role="menuitem" disabled={trackIndex === orderedTracks.length - 1} title={trackIndex === orderedTracks.length - 1 ? 'This is already the bottom track' : 'Move this track below the one after it'} onClick={(event) => { const menu = event.currentTarget.closest('details'); if (menu) menu.open = false; moveTrack(track.id, 1) }}>Move down</button>
                    <button type="button" role="menuitem" disabled={trackHasClips(track.id)} title={trackHasClips(track.id) ? 'Remove or move its clips first' : 'Remove this empty track'} onClick={(event) => { const menu = event.currentTarget.closest('details'); if (menu) menu.open = false; removeTrack(track.id) }}>Delete track</button>
                  </div>
                </details>
              </span>
            </div>
            <div className="multi-track-lane" onContextMenu={(event) => {
              // A right-click on empty timeline space offers the commands that
              // need no selection: paste, select all, snapping.
              if ((event.target as Element).closest('.multi-track-item')) return
              event.preventDefault()
              setContextMenu({ x: event.clientX, y: event.clientY })
            }}>
              {trackIndex === 0 && props.timeline.items.length === 0 && <span className="multi-track-empty-hint">Drag media here, or press + in the Media panel</span>}
              {dragTarget === track.id && dropTime != null && <div className="multi-track-drop-line" style={{ left: dropTime * pixelsPerSecond }} />}
              {snapGuide !== null && <div className="timeline-snap-guide" style={{ left: snapGuide * pixelsPerSecond }} aria-hidden="true" />}
              {props.timeline.items.filter((item) => item.trackId === track.id).map((item) => {
                const asset = assetById.get(item.assetId)
                const duration = timelineItemDuration(item)
                const isSelected = selectedIds.includes(item.id)
                const isDragging = draggingId === item.id
                return <div key={item.id} className={`multi-track-item ${track.type} ${isSelected ? 'selected' : ''} ${asset?.missing ? 'missing' : ''} ${isDragging ? 'dragging' : ''}`} style={{ left: item.startTime * pixelsPerSecond, width: Math.max(18, duration * pixelsPerSecond), opacity: track.hidden ? 0.45 : 1 }} title={`${asset?.name ?? 'Missing media'} · ${formatClock(item.startTime, true)} · ${formatClock(duration, true)}`} onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  // Right-clicking outside the selection selects the clip first,
                  // so the menu always acts on something visible.
                  // Selecting with the right button must not move the playhead:
                  // paste and split use it, so it stays where the user put it.
                  if (!selectedIdsRef.current.includes(item.id)) selectOnly(item.id)
                  setContextMenu({ x: event.clientX, y: event.clientY })
                }}>
                  <button type="button" role="slider" aria-orientation="horizontal" aria-label={`Trim ${asset?.name ?? 'clip'} source start`} aria-valuemin={0} aria-valuemax={Math.max(0, item.sourceOut - 0.05)} aria-valuenow={item.sourceIn} title="Drag to trim · Arrow keys step one frame; Shift + arrow steps one second" className="timeline-trim left" disabled={track.locked} onKeyDown={(event) => adjustItemByKey(event, item, 'left')} onPointerDown={(event) => beginDrag(event, item, 'left')} />
                  <button type="button" role="slider" aria-orientation="horizontal" aria-label={`Trim ${asset?.name ?? 'clip'} source end`} aria-valuemin={item.sourceIn + 0.05} aria-valuemax={asset?.duration ?? item.sourceOut + span * 4} aria-valuenow={item.sourceOut} title="Drag to trim · Arrow keys step one frame; Shift + arrow steps one second" className="timeline-trim right" disabled={track.locked} onKeyDown={(event) => adjustItemByKey(event, item, 'right')} onPointerDown={(event) => beginDrag(event, item, 'right')} />
                  {asset && asset.mediaType !== 'audio' && asset.thumbnailPath && <span className="timeline-item-filmstrip" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(mediaUrl(asset.thumbnailPath))})` }} />}
                  {asset && asset.mediaType !== 'image' && props.waveforms[asset.id] && <AudioWaveform variant={asset.mediaType === 'audio' ? 'full' : 'strip'} peaks={props.waveforms[asset.id].peaks} duration={props.waveforms[asset.id].duration} sourceIn={item.sourceIn} sourceOut={item.sourceOut} />}
                  <button type="button" className="timeline-item-body" aria-label={`${asset?.name ?? 'Missing media'} clip · click to select, drag to move`} title={`${asset?.name ?? 'Missing media'} · ${formatClock(item.startTime, true)} to ${formatClock(timelineItemEnd(item), true)} · click to select, drag to move`} onPointerDown={(event) => beginDrag(event, item, 'move')} onClick={(event) => { if (event.detail !== 0) return; selectOnly(item.id) }}><span className="timeline-item-name">{asset?.name ?? 'Missing media'}</span><span className="timeline-item-duration">{formatClock(duration, true)}</span></button>
                </div>
              })}
            </div>
          </div>
        })}
        <div ref={playheadLineRef} className="timeline-playhead" aria-hidden="true" />
        <div ref={cursorRef} className="multi-track-cursor" aria-hidden="true"><span ref={cursorLabelRef} /></div>
      </div>
    </div>
    {contextMenu && (
      <>
        <div
          className="menu-scrim"
          onClick={() => setContextMenu(null)}
          onContextMenu={(event) => { event.preventDefault(); setContextMenu(null) }}
        />
        <div
          className="menu timeline-context-menu"
          role="menu"
          aria-label="Timeline actions"
          onKeyDown={(event) => { if (event.key === 'Escape') setContextMenu(null) }}
          style={{ position: 'fixed', right: 'auto', left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 240)), top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 340)) }}
        >
          <button type="button" role="menuitem" className="timeline-menu-item" disabled={!hasSelection || selectionLocked} onClick={() => void cutSelected()}>Cut{menuShortcut('timeline.cut')}</button>
          <button type="button" role="menuitem" className="timeline-menu-item" disabled={!hasSelection} onClick={() => void copySelected()}>Copy{menuShortcut('timeline.copy')}</button>
          <button type="button" role="menuitem" className="timeline-menu-item" disabled={!hasClipboard} onClick={() => void pasteCopied()}>Paste at playhead{menuShortcut('timeline.paste')}</button>
          <button type="button" role="menuitem" className="timeline-menu-item" disabled={!hasSelection || selectionLocked} onClick={duplicateSelected}>Duplicate{menuShortcut('timeline.duplicate')}</button>
          <span className="menu-sep" aria-hidden="true" />
          <button type="button" role="menuitem" className="timeline-menu-item" disabled={!canSplit} onClick={splitAtPlayhead}>Split at playhead{menuShortcut('timeline.split')}</button>
          <button type="button" role="menuitem" className="timeline-menu-item" disabled={!hasSelection || selectionLocked} onClick={deleteSelected}>Delete{menuShortcut('timeline.delete')}</button>
          <span className="menu-sep" aria-hidden="true" />
          <button type="button" role="menuitem" className="timeline-menu-item" onClick={selectAllClips}>Select all clips{menuShortcut('timeline.selectAll')}</button>
          <button type="button" role="menuitem" className="timeline-menu-item" onClick={setSnap}>Snapping {props.timeline.snapEnabled ? 'on' : 'off'}</button>
        </div>
      </>
    )}
  </section>
}

/**
 * Sound drawn on a clip. An audio clip is the sound, so the waveform fills it;
 * a video clip only needs to show that it has sound, so it gets a slim strip
 * along the bottom the way a desktop editor draws it.
 */
function AudioWaveform(props: { peaks: number[]; duration: number; sourceIn: number; sourceOut: number; variant?: 'full' | 'strip' }) {
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
        context.fillRect(x, props.variant === 'strip' ? height - bar : (height - bar) / 2, 1, bar)
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [props.peaks, props.duration, props.sourceIn, props.sourceOut, props.variant])
  return <canvas className={`timeline-wave-canvas${props.variant === 'strip' ? ' is-strip' : ''}`} aria-label="Audio waveform" />
}

export function TimelineInspector(props: { item: TimelineItem; asset?: ProjectAsset; onChange: (patch: Partial<TimelineItem>) => void }) {
  const duration = timelineItemDuration(props.item)
  const sourceOutMax = props.asset?.mediaType === 'image' ? Number.POSITIVE_INFINITY : props.asset?.duration ?? Number.POSITIVE_INFINITY
  const finiteValue = (event: React.ChangeEvent<HTMLInputElement>, fallback: number) => Number.isFinite(event.currentTarget.valueAsNumber) ? event.currentTarget.valueAsNumber : fallback
  const speedInput = (event: React.ChangeEvent<HTMLInputElement>) => props.onChange({ speed: Math.max(0.25, Math.min(4, finiteValue(event, props.item.speed))) })
  return <div className="timeline-inspector">
    <strong>{props.asset?.name ?? 'Missing media'}</strong>
    <label>Start (s) <input type="number" min="0" step="0.01" value={props.item.startTime.toFixed(2)} onChange={(event) => props.onChange({ startTime: Math.max(0, finiteValue(event, props.item.startTime)) })} /></label>
    <label>Source in (s) <input type="number" min="0" max={Math.max(0, props.item.sourceOut - 0.05)} step="0.01" value={props.item.sourceIn.toFixed(2)} onChange={(event) => props.onChange({ sourceIn: Math.max(0, Math.min(props.item.sourceOut - 0.05, finiteValue(event, props.item.sourceIn))) })} /></label>
    <label>Source out (s) <input type="number" min={props.item.sourceIn + 0.05} max={Number.isFinite(sourceOutMax) ? sourceOutMax : undefined} step="0.01" value={props.item.sourceOut.toFixed(2)} onChange={(event) => props.onChange({ sourceOut: Math.min(sourceOutMax, Math.max(props.item.sourceIn + 0.05, finiteValue(event, props.item.sourceOut))) })} /></label>
    {props.asset?.mediaType !== 'image' && <label>Volume <input type="range" min="0" max="1" step="0.01" value={Math.min(1, Math.max(0, props.item.volume))} onChange={(event) => props.onChange({ volume: Math.min(1, Math.max(0, Number(event.target.value))) })} /><span>{Math.round(Math.min(1, Math.max(0, props.item.volume)) * 100)}%</span></label>}
    {props.asset?.mediaType === 'audio' && <>
      <label>Fade in (s) <input type="number" min="0" max={duration} step="0.05" value={props.item.fadeIn} onChange={(event) => props.onChange({ fadeIn: Math.min(duration, Math.max(0, finiteValue(event, props.item.fadeIn))) })} /></label>
      <label>Fade out (s) <input type="number" min="0" max={duration} step="0.05" value={props.item.fadeOut} onChange={(event) => props.onChange({ fadeOut: Math.min(duration, Math.max(0, finiteValue(event, props.item.fadeOut))) })} /></label>
      <label>Speed <input type="number" min="0.25" max="4" step="0.05" value={props.item.speed} onChange={speedInput} /></label>
      <label><input type="checkbox" checked={props.item.muted} onChange={(event) => props.onChange({ muted: event.target.checked })} /> Mute this clip</label>
      <label><input type="checkbox" checked={props.item.loop} onChange={(event) => props.onChange({ loop: event.target.checked })} /> Loop audio</label>
    </>}
    {props.asset?.mediaType === 'video' && <>
      <label>Speed <input type="number" min="0.25" max="4" step="0.05" value={props.item.speed} onChange={speedInput} /></label>
      <label><input type="checkbox" checked={props.item.muted} onChange={(event) => props.onChange({ muted: event.target.checked })} /> Mute clip audio</label>
    </>}
    {props.asset?.mediaType === 'image' && <>
      <label>Duration (s) <input type="number" min="0.1" step="0.1" value={duration.toFixed(1)} onChange={(event) => props.onChange({ sourceIn: 0, sourceOut: Math.max(0.1, finiteValue(event, duration)) })} /></label>
      <label>Opacity <input type="range" min="0" max="1" step="0.01" value={Math.min(1, Math.max(0, props.item.opacity))} onChange={(event) => props.onChange({ opacity: Math.min(1, Math.max(0, Number(event.target.value))) })} /></label>
      <label>Scale <input type="number" min="0.1" max="5" step="0.05" value={props.item.scale} onChange={(event) => props.onChange({ scale: Math.max(0.1, Math.min(5, finiteValue(event, props.item.scale))) })} /></label>
    </>}
  </div>
}

/**
 * One toolbar button for one registry command.
 *
 * The tooltip's shortcut is read from the command registry rather than typed
 * out again, and the button is disabled from the very state the command checks,
 * so a visible control and its keyboard shortcut cannot disagree.
 */
function TimelineAction(props: {
  commandId: string
  description: string
  /** Why the button is unavailable, shown in the tooltip while it is. */
  disabledHint?: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  const shortcut = shortcutLabelFor(props.commandId)
  const title = [props.description, props.disabled ? props.disabledHint : null, shortcut]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  // The title sits on the wrapper as well: a disabled button does not receive
  // hover events in every browser, and the hint must still be readable.
  return (
    <span className={`timeline-action-wrap${props.disabled ? ' is-disabled' : ''}`} title={title}>
      <button
        type="button"
        className={`btn sm icon timeline-action${props.danger ? ' danger' : ''}`}
        onClick={props.onClick}
        disabled={props.disabled}
        title={title}
        aria-label={props.description}
      >
        {props.icon}
      </button>
    </span>
  )
}
