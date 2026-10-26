import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'

import { useAppStore } from '../../stores/app'
import { availableSteps } from './tour'

/**
 * The guided tour.
 *
 * A spotlight over a real control and a card that explains it. Two rules keep
 * it out of the way: the overlay itself does not swallow pointer events, so the
 * app underneath stays usable, and every stop is skippable — Escape, Skip and
 * the close button all end it, and the stop is remembered as seen.
 *
 * If the target element is not on screen (a different view, a narrow window
 * that hides it), that stop is dropped rather than pointing at nothing.
 */

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const CARD_WIDTH = 320
const GAP = 12

function rectOf(target: string): Rect | null {
  const element = document.querySelector(`[data-tour="${target}"]`)
  if (!(element instanceof HTMLElement)) return null
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

export function TourOverlay(): React.ReactElement | null {
  const open = useAppStore((state) => state.tourOpen)
  const view = useAppStore((state) => state.view)
  const closeTour = useAppStore((state) => state.closeTour)

  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(
    () => (open ? availableSteps(view, (target) => rectOf(target) !== null) : []),
    [open, view]
  )
  const step = steps[Math.min(index, Math.max(0, steps.length - 1))]

  // Reset to the first stop each time the tour opens.
  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !step) {
      setRect(null)
      return
    }
    setRect(rectOf(step.target))
    const update = (): void => setRect(rectOf(step.target))
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, step, view])

  // Remember where focus came from once, and give it back when the tour closes.
  const restoreRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => restoreRef.current?.focus()
  }, [open])

  // Each stop puts focus on the card, so the tour can be driven from the
  // keyboard. The rest of the app stays clickable, so focus can move away again.
  useEffect(() => {
    if (open) cardRef.current?.focus()
  }, [open, index])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      // Escape always ends the tour. The arrows only belong to the tour while
      // its card has focus, so a slider or a timeline underneath keeps them.
      const onCard = cardRef.current?.contains(event.target as Node) ?? false
      if (event.key === 'Escape') {
        event.preventDefault()
        closeTour()
        return
      }
      if (!onCard) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((value) => Math.max(0, value - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, steps.length, index])

  if (!open) return null

  const finish = (): void => {
    closeTour()
    setIndex(0)
  }

  // Nothing on this screen to point at: do not show an empty card.
  if (steps.length === 0) {
    return (
      <div className="tour-layer" role="dialog" aria-label="Guided tour">
        <div className="tour-card" style={{ left: GAP, top: GAP }} ref={cardRef} tabIndex={-1}>
          <div className="tour-step-count">Guided tour</div>
          <div className="tour-title">Nothing to point at here</div>
          <p className="tour-body">This screen has no tour stops. Open Projects to start the tour.</p>
          <div className="tour-actions">
            <button className="btn ghost" onClick={finish}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  function goNext(): void {
    if (index >= steps.length - 1) finish()
    else setIndex(index + 1)
  }

  // Place the card under the target when there is room, otherwise above it, and
  // keep it inside the window either way.
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight
  const cardTop = rect
    ? rect.top + rect.height + GAP + 150 > viewportHeight
      ? Math.max(GAP, rect.top - 150 - GAP)
      : rect.top + rect.height + GAP
    : GAP
  const cardLeft = rect
    ? Math.min(Math.max(GAP, rect.left + rect.width / 2 - CARD_WIDTH / 2), viewportWidth - CARD_WIDTH - GAP)
    : GAP

  return (
    <div className="tour-layer" role="dialog" aria-label="Guided tour" aria-live="polite">
      {rect && (
        <div
          className="tour-spotlight"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden="true"
        />
      )}
      <div className="tour-card" style={{ top: cardTop, left: cardLeft }} ref={cardRef} tabIndex={-1}>
        <div className="tour-step-count">
          Step {Math.min(index + 1, steps.length)} of {steps.length}
        </div>
        <div className="tour-title">{step?.title}</div>
        <p className="tour-body">{step?.body}</p>
        <div className="tour-actions">
          <button className="btn ghost" onClick={finish} aria-label="Skip the tour" title="Skip the tour">
            <X size={14} /> Skip
          </button>
          <span className="header-spacer" />
          <button className="btn" onClick={() => setIndex(index - 1)} disabled={index === 0}>
            <ArrowLeft size={14} /> Back
          </button>
          <button className="btn primary" onClick={goNext}>
            {index === steps.length - 1 ? 'Finish' : 'Next'}
            {index === steps.length - 1 ? null : <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
