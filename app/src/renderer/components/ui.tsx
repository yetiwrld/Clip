import React from 'react'
import { X, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { errMessage } from '../api/client'
import { progressPercent } from '../lib/motion'

/** Small shared UI primitives — thin, accessible wrappers over the CSS. */

export function Modal(props: {
  title: string
  onClose?: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && props.onClose) props.onClose()
      }}
    >
      <div className={`modal ${props.wide ? 'wide' : ''}`} role="dialog" aria-label={props.title}>
        <div className="modal-head">
          <div className="modal-title">{props.title}</div>
          <div className="header-spacer" />
          {props.onClose && (
            <button className="btn ghost sm icon" onClick={props.onClose} aria-label="Close dialog" title="Close">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  )
}

/**
 * Confirmation for a consequential action.
 *
 * `danger` styles the confirm button; `confirmPhrase` makes the user type the
 * exact name of what they are about to destroy, so a stray Enter cannot delete
 * a finished project. Only use the phrase for permanent actions — reversible
 * ones should offer Undo instead.
 */
export function ConfirmDialog(props: {
  title: string
  children: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  confirmPhrase?: string
  busy?: boolean
  onConfirm(): void
  onCancel(): void
}) {
  const [typed, setTyped] = React.useState('')
  const inputId = React.useId()
  const ready = !props.confirmPhrase || typed.trim() === props.confirmPhrase
  return (
    <Modal
      title={props.title}
      onClose={props.onCancel}
      footer={
        <>
          <button className="btn" onClick={props.onCancel}>{props.cancelLabel ?? 'Cancel'}</button>
          <button
            className={props.danger ? 'btn danger' : 'btn primary'}
            onClick={props.onConfirm}
            disabled={!ready || props.busy}
          >
            {props.busy && <Spinner size={12} />}
            {props.confirmLabel}
          </button>
        </>
      }
    >
      {props.children}
      {props.confirmPhrase && (
        <div className="confirm-phrase">
          <label className="field-label" htmlFor={inputId}>Type “{props.confirmPhrase}” to confirm</label>
          <input
            id={inputId}
            className="input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
    </Modal>
  )
}

/**
 * A bar that never lies about what it knows.
 *
 * A number from the backend fills the bar. No number at all — the job is alive
 * but has not reported an estimate — draws the indeterminate sliver instead, so
 * "we don't know yet" cannot be mistaken for "0 %" or for a bar that is stuck.
 * The two shapes differ (solid fill vs. a short travelling segment) and the
 * indeterminate one is announced as busy with its own text.
 */
export function ProgressBar(props: { value: number | null | undefined; success?: boolean; danger?: boolean }) {
  const pct = progressPercent(props.value)
  const tone = `${props.success ? 'success' : ''} ${props.danger ? 'danger' : ''}`
  if (pct == null) {
    return (
      <div className="progress-track indeterminate" role="progressbar" aria-busy="true" aria-valuetext="Working, length unknown">
        <div className={`progress-fill ${tone}`} />
      </div>
    )
  }
  return (
    <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ErrorBox(props: { error: unknown; onRetry?: () => void; retryLabel?: string }) {
  const { message, hint, code, details } = errMessage(props.error) as { message: string; hint?: string; code?: string; details?: string }
  return (
    <div className="error-box" role="alert">
      <div className="error-title">
        <AlertTriangle size={12} style={{ verticalAlign: -1, marginRight: 'var(--space-2)' }} />
        {message}
      </div>
      {hint && <div className="error-hint">{hint}</div>}
      {details && (
        <details className="error-details">
          <summary>Technical details</summary>
          <pre>{details}</pre>
        </details>
      )}
      {props.onRetry && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <button className="btn sm" onClick={props.onRetry}>
            {props.retryLabel ?? 'Retry'}
          </button>
        </div>
      )}
      {code && <div className="tiny" style={{ marginTop: 'var(--space-3)' }}>Code: {code}</div>}
    </div>
  )
}

/**
 * Score color: mostly neutral. Strong scores use the accent; weak ones get
 * semantic warnings. Mid-range stays deliberately quiet.
 */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'var(--text-3)'
  if (score >= 75) return 'var(--accent)'
  if (score >= 35) return 'var(--text-2)'
  return 'var(--danger)'
}

/** Compact analytical score value — "86 / 100" — no ring, no gauge. */
export function ScoreValue(props: { score: number | null; size?: 'sm' | 'lg'; label?: string }) {
  const s = props.score
  return (
    <span
      className="audit-value"
      style={{
        fontSize: props.size === 'lg' ? 22 : 15,
        color: scoreColor(s),
        fontWeight: 600
      }}
      title={props.label ?? (s != null ? `Overall estimate: ${s}/100` : 'Not scored yet')}
    >
      {s != null ? s : '–'}
      <span className="audit-max">/100</span>
    </span>
  )
}

/** Legacy name kept so existing imports resolve; renders the analytical value. */
export function ScoreRing(props: { score: number | null; size?: number; label?: string }) {
  return <ScoreValue score={props.score} label={props.label} />
}

export function EmptyState(props: {
  icon: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
  /** Adds the slow ambient wash. Off by default; empty screens that greet a new user opt in. */
  ambient?: boolean
}) {
  return (
    <div className={props.ambient ? 'empty ambient' : 'empty'}>
      {props.ambient && <div className="ambient-field" aria-hidden="true" />}
      <div className="empty-icon">{props.icon}</div>
      <div className="empty-title">{props.title}</div>
      {props.hint && <div className="muted text-body" style={{ maxWidth: 400 }}>{props.hint}</div>}
      {props.action}
    </div>
  )
}

const LABELABLE = new Set(['input', 'select', 'textarea'])

/**
 * A label, a control and an optional hint.
 *
 * When the child is a single native control the label is bound to it, so
 * clicking the label focuses the field and a screen reader announces both. A
 * composite child (a row of buttons, a custom picker) is left alone rather than
 * getting a label that points at nothing.
 */
export function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  const generatedId = React.useId()
  const hintId = `${generatedId}-hint`
  const child = React.isValidElement(props.children) ? (props.children as React.ReactElement<Record<string, unknown>>) : null
  const labelable = child && typeof child.type === 'string' && LABELABLE.has(child.type)
  const controlId = labelable
    ? typeof child.props.id === 'string' && child.props.id.length > 0
      ? child.props.id
      : generatedId
    : undefined

  const describedBy = labelable
    ? [child.props['aria-describedby'], props.hint ? hintId : undefined].filter(Boolean).join(' ') || undefined
    : undefined

  const control = labelable
    ? React.cloneElement(child, { id: controlId, 'aria-describedby': describedBy })
    : props.children

  return (
    <div className="field">
      <label className="field-label" htmlFor={controlId}>{props.label}</label>
      {control}
      {props.hint && <div className="field-hint" id={labelable ? hintId : undefined}>{props.hint}</div>}
    </div>
  )
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <div className="switch-row">
      <div>
        <div className="text-body" style={{ fontWeight: 'var(--fw-medium)' }}>{props.label}</div>
        {props.hint && <div className="field-hint">{props.hint}</div>}
      </div>
      <button
        className={`switch ${props.checked ? 'on' : ''}`}
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
      />
    </div>
  )
}

export function ToastIcon({ level }: { level: 'info' | 'success' | 'warn' | 'error' }) {
  if (level === 'success') return <CheckCircle2 size={14} color="var(--success)" />
  if (level === 'error') return <XCircle size={14} color="var(--danger)" />
  if (level === 'warn') return <AlertTriangle size={14} color="var(--warn)" />
  return <Info size={14} color="var(--accent)" />
}

export function Spinner({ size = 13 }: { size?: number }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** "2h ago" / "3d ago" — for compact last-modified display. */
export function formatRelative(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return new Date(t).toLocaleDateString()
}
