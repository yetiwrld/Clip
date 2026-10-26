/**
 * One draggable divider, used by every resizable edge in the app: the sidebar,
 * the editor tool panel, the properties panel and the timeline.
 *
 * It is a window splitter in ARIA terms: `role="separator"`, a value, a range
 * and arrow-key control. A mouse is the fast way to use it, not the only way.
 *
 * While a drag is live the value is reported on every move but never saved —
 * the owner decides what to persist, and does it on release.
 */

import { useEffect, useRef, type ReactNode } from 'react'

export interface ResizeHandleProps {
  orientation: 'vertical' | 'horizontal'
  /** Read aloud, e.g. "Resize sidebar". */
  label: string
  value: number
  min: number
  max: number
  /** Double-click or Enter returns to this value. */
  defaultValue?: number
  /** Arrow-key step in pixels. Shift is 1px, Page Up/Down is 48px. */
  step?: number
  /**
   * For a handle whose panel grows towards the left (the properties panel sits
   * to the right of the stage). Moving the divider right makes it narrower.
   */
  invert?: boolean
  onChange: (value: number) => void
  onCommit: (value: number) => void
  className?: string
  title?: string
  children?: ReactNode
}

const PAGE_STEP = 48

export function ResizeHandle({
  orientation,
  label,
  value,
  min,
  max,
  defaultValue,
  step = 8,
  invert = false,
  onChange,
  onCommit,
  className,
  title,
  children
}: ResizeHandleProps) {
  const cleanup = useRef<(() => void) | null>(null)
  // The pointer handlers are registered once per drag and would otherwise read
  // the value from the render they were created in.
  const latest = useRef(value)
  latest.current = value

  useEffect(() => () => {
    cleanup.current?.()
    delete document.body.dataset.resizing
  }, [])

  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)))

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    const vertical = orientation === 'vertical'
    const direction = invert ? -1 : 1
    const startPosition = vertical ? event.clientX : event.clientY
    const startValue = latest.current
    document.body.dataset.resizing = vertical ? 'col' : 'row'
    const move = (moveEvent: PointerEvent) => {
      const position = vertical ? moveEvent.clientX : moveEvent.clientY
      const delta = position - startPosition
      // Dragging the timeline's top edge upwards makes the panel taller.
      onChange(clamp(vertical ? startValue + delta * direction : startValue - delta))
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      delete document.body.dataset.resizing
      cleanup.current = null
      onCommit(latest.current)
    }
    cleanup.current?.()
    cleanup.current = finish
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const vertical = orientation === 'vertical'
    const direction = invert ? -1 : 1
    const grow = vertical ? 'ArrowRight' : 'ArrowUp'
    const shrink = vertical ? 'ArrowLeft' : 'ArrowDown'
    const small = (event.shiftKey ? 1 : step) * direction
    let next: number | null = null
    if (event.key === grow) next = value + small
    else if (event.key === shrink) next = value - small
    else if (event.key === 'PageUp') next = value + PAGE_STEP * direction
    else if (event.key === 'PageDown') next = value - PAGE_STEP * direction
    else if (event.key === 'Home') next = min
    else if (event.key === 'End') next = max
    else if (event.key === 'Enter' && defaultValue !== undefined) next = defaultValue
    if (next === null) return
    event.preventDefault()
    const clamped = clamp(next)
    onChange(clamped)
    onCommit(clamped)
  }

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-orientation={orientation}
      className={`pane-resizer${className ? ` ${className}` : ''}`}
      title={title ?? `${label}. Drag, or use the arrow keys.`}
      onPointerDown={beginDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => {
        if (defaultValue === undefined) return
        const reset = clamp(defaultValue)
        onChange(reset)
        onCommit(reset)
      }}
    >
      {children}
    </div>
  )
}
