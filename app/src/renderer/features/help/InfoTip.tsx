import React, { useEffect, useId, useRef, useState } from 'react'
import { Info, Lightbulb, X } from 'lucide-react'

import { useAppStore } from '../../stores/app'

/**
 * Contextual help, two forms.
 *
 * `InfoTip` is opened on demand only: a small round button next to a label that
 * unfolds one short explanation. It never opens by itself, so it cannot nag.
 *
 * `TipNote` is a one-line note for a feature the user is looking at. Closing it
 * stores the id in `settings.help.dismissedTips`, so it stays closed for good —
 * including after a restart.
 */

export function InfoTip(props: { label: string; children: React.ReactNode; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <span className={`info-tip${props.align === 'end' ? ' info-tip-end' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="info-tip-button"
        aria-label={`About ${props.label}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={`About ${props.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Info size={12} />
      </button>
      {open && (
        <span className="info-tip-pop" id={id} role="note">
          {props.children}
        </span>
      )}
    </span>
  )
}

export function TipNote(props: { id: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const dismissed = useAppStore((state) => state.isTipDismissed(props.id))
  const dismissTip = useAppStore((state) => state.dismissTip)

  if (dismissed) return null

  return (
    <div className={`tip-note${props.className ? ` ${props.className}` : ''}`}>
      {props.icon ?? <Lightbulb size={12} />}
      <span className="tip-note-text">{props.children}</span>
      <button
        type="button"
        className="tip-note-close"
        aria-label="Dismiss this tip"
        title="Dismiss this tip"
        onClick={() => void dismissTip(props.id)}
      >
        <X size={12} />
      </button>
    </div>
  )
}
