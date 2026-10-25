import React from 'react'
import type { CaptionCue } from '@shared/captions/segmentation'
import { cueAt, wordIndexAt } from '@shared/captions/segmentation'
import type { CaptionStylePreset } from '@shared/constants'
import { isCaptionKeyword, transformCaptionText, transformCaptionWord } from '@shared/captions/textCase'

/**
 * DOM caption overlay that mirrors the ASS renderer's segmentation, timing,
 * emphasis and layout parameters (ADR-009). Rasterization differs slightly
 * from libass; text/timing/highlight behavior is identical.
 *
 * Supports the clip-level style overrides (colors, box opacity, outline,
 * shadow) and an optional platform safe-area guide — both shared with the
 * render path so what you see is what FFmpeg burns in (§26, §29).
 */
export function CaptionPreview(props: {
  cues: CaptionCue[]
  style: CaptionStylePreset
  fontSizePct?: number
  positionY?: number
  emphasis?: boolean
  uppercase?: boolean
  /** Clip-level style overrides. */
  textColor?: string
  highlightColor?: string
  boxOpacity?: number
  outlineWidth?: number
  shadow?: number
  currentTime: number
  selectedCueKey?: string | null
  onSelectCue?: (cue: CaptionCue) => void
  onEditCue?: (cue: CaptionCue) => void
  /** px height of the preview container */
  containerHeight: number
  /** Show the platform safe-area guide (editor only, never rendered). */
  showSafeArea?: boolean
}) {
  const cue = cueAt(props.cues, props.currentTime)
  if (!cue || props.style.id === 'none') return null

  const textColor = props.textColor ?? props.style.textColor
  const highlightColor = props.highlightColor ?? props.style.highlightColor
  const boxOpacity = props.boxOpacity !== undefined ? props.boxOpacity : props.style.boxOpacity
  const outlineWidthBase = props.outlineWidth !== undefined ? props.outlineWidth : props.style.outlineWidth
  const shadowBase = props.shadow !== undefined ? props.shadow : props.style.shadow

  const fontSize = ((props.fontSizePct ?? props.style.fontSizePct) / 100) * props.containerHeight
  const outlineWidth = outlineWidthBase * (fontSize / 70)
  const emphasis = props.emphasis ?? props.style.emphasis
  const uppercase = props.uppercase ?? props.style.uppercase
  const activeIdx = emphasis ? wordIndexAt(cue, props.currentTime) : -1
  const inProgress = Math.min(1, Math.max(0, (props.currentTime - cue.startTime) / 0.14))
  const outProgress = Math.min(1, Math.max(0, (cue.endTime - props.currentTime) / 0.14))
  const style = props.style
  const entranceOpacity = style.animationIn === 'fade' ? inProgress * (style.animationOut === 'fade' ? outProgress : 1) : style.animationOut === 'fade' ? outProgress : 1
  const alignment = style.alignment ?? 'center'
  const entranceTransform = style.animationIn === 'rise' ? `translateY(${(1 - inProgress) * 20}px)`
    : style.animationIn === 'slide' ? `translateX(${(1 - inProgress) * -24}px)`
      : style.animationIn === 'pop' ? `scale(${0.88 + inProgress * 0.12})` : ''

  const wordStyle = (isActive: boolean, index: number): React.CSSProperties => ({
    color: style.emphasisBehavior === 'none' ? textColor : style.emphasisBehavior === 'keywords' ? (isCaptionKeyword(cue.words[index]?.text ?? '', index) ? highlightColor : textColor) : isActive ? highlightColor : textColor,
    transform: (style.wordAnimation === 'pop' || style.wordAnimation === 'bounce') && isActive ? 'scale(1.12)' : undefined,
    display: 'inline-block',
    opacity: style.wordAnimation === 'typewriter' ? Math.min(1, Math.max(0, ((props.currentTime - (cue.words[index]?.start ?? props.currentTime)) / 0.08))) : 1,
    transition: 'color 90ms linear, transform 90ms ease-out'
  })

  const boxStyle: React.CSSProperties = {
    position: 'absolute',
    left: alignment === 'left' ? '6%' : alignment === 'right' ? '94%' : '50%',
    top: `${((props.positionY ?? props.style.positionY) * 100).toFixed(1)}%`,
    width: '86%',
    textAlign: style.alignment ?? 'center',
    fontFamily: `'${props.style.fontFamily ?? 'Inter'}', 'Segoe UI', system-ui, sans-serif`,
    fontWeight: props.style.fontWeight ?? (props.style.fontFile.includes('900') ? 900 : props.style.fontFile.includes('800') ? 800 : props.style.fontFile.includes('700') ? 700 : props.style.fontFile.includes('600') ? 600 : 400),
    fontSize: `${fontSize}px`,
    lineHeight: style.lineSpacing ?? 1.25,
    letterSpacing: `${style.letterSpacing ?? 0}px`,
    textTransform: style.capitalization === 'lowercase' ? 'lowercase' : style.capitalization === 'uppercase' || uppercase ? 'uppercase' : 'none',
    opacity: entranceOpacity,
    transform: `${alignment === 'center' ? 'translateX(-50%)' : alignment === 'right' ? 'translateX(-100%)' : ''} ${entranceTransform} ${style.animationOut === 'slide' ? `translateX(${(1 - outProgress) * 24}px)` : ''}`.trim() || undefined,
    WebkitTextStroke: outlineWidth > 0 ? `${outlineWidth.toFixed(1)}px ${hexToRgba(props.style.outlineColor, props.style.strokeOpacity ?? 1)}` : undefined,
    paintOrder: 'stroke fill',
    textShadow: shadowBase > 0 ? `0 ${shadowBase}px ${shadowBase * 2}px rgba(0,0,0,${props.style.shadowOpacity ?? 0.75})` : undefined,
    background: boxOpacity > 0 ? hexToRgba(props.style.boxColor, boxOpacity) : undefined,
    padding: boxOpacity > 0 ? `${fontSize * 0.18}px ${fontSize * 0.42}px` : undefined,
    borderRadius: boxOpacity > 0 ? `${props.style.cornerRadius ?? fontSize * 0.22}px` : undefined,
    pointerEvents: props.onSelectCue ? 'auto' : 'none',
    cursor: props.onSelectCue ? 'text' : undefined,
    outline: props.selectedCueKey === cue.key ? '1px solid rgba(105, 170, 255, 0.9)' : undefined,
    outlineOffset: 4,
    whiteSpace: 'pre-wrap'
  }

  return (
    <>
      {props.showSafeArea && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: '12% 6%',
            border: '1px dashed rgba(255,255,255,0.4)',
            borderRadius: 'var(--radius)',
            pointerEvents: 'none',
            zIndex: 4
          }}
          title="Platform safe area"
        />
      )}
      <div
        style={boxStyle}
        role={props.onSelectCue ? 'button' : undefined}
        tabIndex={props.onSelectCue ? 0 : undefined}
        aria-label={props.onSelectCue ? `Caption: ${cue.text}. Double-click to edit.` : undefined}
        onClick={() => props.onSelectCue?.(cue)}
        onDoubleClick={() => props.onEditCue?.(cue)}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && props.onSelectCue) {
            event.preventDefault()
            props.onEditCue?.(cue)
          }
        }}
      >
          {emphasis && cue.words.length > 0
            ? cue.words.filter((w) => style.wordAnimation !== 'typewriter' || props.currentTime >= w.start).map((w) => {
                const i = cue.words.indexOf(w)
                return (
                <React.Fragment key={i}>
                  <span style={wordStyle(i === activeIdx, i)}>{transformCaptionWord(w.text, style.capitalization ?? 'original', i, cue.words[i - 1]?.text ?? '', uppercase)}</span>
                  {i < cue.words.filter((word) => style.wordAnimation !== 'typewriter' || props.currentTime >= word.start).length - 1 ? ' ' : ''}
                </React.Fragment>
                )
              })
            : cue.lines.map((line) => transformCaptionText(line, style.capitalization, uppercase)).join('\n')}
      </div>
    </>
  )
}

function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${opacity})`
}
