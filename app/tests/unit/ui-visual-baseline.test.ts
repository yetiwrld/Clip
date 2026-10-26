import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ResizeHandle } from '../../src/renderer/features/workspace/ResizeHandle'
import {
  ConfirmDialog,
  EmptyState,
  ErrorBox,
  Field,
  Modal,
  ProgressBar,
  Spinner,
  Switch
} from '../../src/renderer/components/ui'

/**
 * Visual regression baseline.
 *
 * The project has no screenshot runner and adding one is a dependency decision,
 * so the baseline works on the two things a screenshot would otherwise protect:
 *
 * 1. The markup of the shared primitives, including their empty, error,
 *    loading, selected and disabled states.
 * 2. The resolved visual contract of every chrome component in the stylesheet —
 *    its box, spacing, type, colour, radius, elevation and stacking.
 *
 * Both are plain snapshot files, so a change is a diff a human approves with
 * `npm run test:visual:update` — not a silent drift. Nothing here depends on
 * timing, fonts, images or data, so harmless rendering differences cannot fail
 * it: the same input always produces the same string.
 */

const appRoot = process.cwd()
const cssPath = path.join(appRoot, 'src', 'renderer', 'styles', 'global.css')
const css = fs.readFileSync(cssPath, 'utf8')

interface Rule {
  selector: string
  body: string
  context: string
}

function parseRules(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
  const rules: Rule[] = []
  const walk = (start: number, end: number, context: string): void => {
    let index = start
    while (index < end) {
      const open = text.indexOf('{', index)
      if (open === -1 || open >= end) return
      let depth = 1
      let close = open + 1
      while (close < end && depth > 0) {
        if (text[close] === '{') depth += 1
        else if (text[close] === '}') depth -= 1
        close += 1
      }
      const prelude = text.slice(index, open).trim()
      if (prelude.startsWith('@media')) walk(open + 1, close - 1, prelude.replace(/\s+/g, ' '))
      else if (prelude && !prelude.startsWith('@')) rules.push({ selector: prelude.replace(/\s+/g, ' '), body: text.slice(open + 1, close - 1), context })
      index = close
    }
  }
  walk(0, text.length, '(base)')
  return rules
}

const rules = parseRules(css)

function declarations(body: string): Array<{ prop: string; value: string }> {
  return body
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf(':')
      return { prop: entry.slice(0, at).trim(), value: entry.slice(at + 1).trim() }
    })
    .filter((entry) => entry.prop.length > 0)
}

/** Only properties that change how a component looks. */
const VISUAL_PROPERTIES = new Set([
  'display', 'position', 'inset', 'top', 'right', 'bottom', 'left',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-self', 'justify-content', 'place-items', 'place-content',
  'grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-column', 'grid-row',
  'gap', 'row-gap', 'column-gap',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'padding', 'padding-block', 'padding-inline', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius',
  'background', 'background-color', 'color', 'box-shadow', 'outline', 'outline-offset',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align',
  'text-transform', 'text-overflow', 'white-space', 'overflow', 'overflow-x', 'overflow-y',
  'opacity', 'z-index', 'cursor', 'transition', 'visibility'
])

/** Chrome components: changing one of these is a visual change to the app. */
const BASELINED_SELECTORS = [
  '.btn',
  '.btn.primary',
  '.btn.danger',
  '.btn.ghost',
  '.btn.sm',
  '.btn.icon',
  '.btn:disabled',
  '.input',
  '.select',
  '.chip',
  '.nav-item',
  '.nav-item.active',
  '.nav-item .nav-badge',
  '.text-link',
  '.editor-project-link',
  '.menu',
  '.menu button',
  '.modal',
  '.modal-head',
  '.modal-title',
  '.modal-body',
  '.modal-foot',
  '.toasts',
  '.toast',
  '.palette',
  '.palette-search',
  '.palette-foot',
  '.card',
  '.panel',
  '.empty',
  '.empty-title',
  '.empty-icon',
  '.field',
  '.field-label',
  '.field-hint',
  '.switch',
  '.switch.on',
  '.progress-track',
  '.progress-fill',
  '.error-box',
  '.modal-backdrop',
  '.toast-msg',
  '.progress-fill.success',
  '.progress-fill.danger',
  '.kbd',
  '.section-title',
  '.text-body',
  '.section-hint',
  '.create-bar',
  // Desktop integration: the window-wide drop hint.
  '.drop-overlay',
  '.drop-overlay-card',
  '.drop-overlay-note',
  // Workspace layout: the remembered panel frame and its dividers.
  '.pane-resizer',
  '.sidebar-resizer',
  '.stage-resizer',
  '.sidebar-toggle',
  '.inspector-toolbar',
  '.inspector-show-toggle',
  '.editor-panel-toggle',
  '.app-shell[data-sidebar="collapsed"]',
  '.editor-shell[data-tools="collapsed"] .editor-body',
  // Help and onboarding: the welcome screen, the tour and contextual help.
  '.welcome-paths',
  '.help-steps',
  '.help-faq',
  '.help-about',
  '.info-tip-button',
  '.info-tip-pop',
  '.tip-note',
  // Live motion: the ambient wash, the job activity block, the played ruler.
  '.ambient-field',
  '.job-activity',
  '.job-activity-head',
  '.activity-graph',
  '.progress-track.indeterminate .progress-fill',
  'html[data-motion="full"] .status.working .dot',
  '.status.queued',
  '.multi-track-played',
  '.tour-layer',
  '.tour-spotlight',
  '.tour-card',
  '.tour-title',
  '.tour-body',
  '.tour-actions',
  // Screen frames: the proportions of the app itself.
  '.app-shell',
  '.sidebar',
  '.page',
  '.editor-topbar',
  '.editor-body',
  '.editor-stage',
  '.editor-inspector',
  '.timeline',
  '.editor-tool-panel'
]

/**
 * Resolve a class the way the browser does: every rule that lists it, in source
 * order, last declaration wins. A rule that groups selectors
 * (`.input, .select, …`) counts for each member; a contextual rule
 * (`.panel .btn`) does not, so a component's contract stays its own.
 */
function contractFor(selector: string): string {
  const contexts = new Map<string, Map<string, string>>()
  let found = false
  for (const rule of rules) {
    const members = rule.selector.split(',').map((entry) => entry.trim())
    if (!members.includes(selector)) continue
    found = true
    const props = contexts.get(rule.context) ?? new Map<string, string>()
    for (const { prop, value } of declarations(rule.body)) {
      if (VISUAL_PROPERTIES.has(prop)) props.set(prop, value)
    }
    contexts.set(rule.context, props)
  }
  if (!found) return 'MISSING'
  return [...contexts]
    .map(([context, props]) => {
      const lines = [...props].sort(([a], [b]) => (a < b ? -1 : 1)).map(([prop, value]) => `  ${prop}: ${value}`)
      return `${context}\n${lines.join('\n')}`
    })
    .join('\n')
}

describe('visual baseline: component contract', () => {
  const missing = BASELINED_SELECTORS.filter((selector) => contractFor(selector) === 'MISSING')
  it('still declares every baselined component class', () => {
    expect(missing, 'A baselined component selector disappeared; update BASELINED_SELECTORS only for a rename').toEqual([])
  })

  it('keeps the documented box, type and colour of the chrome', () => {
    const contract = Object.fromEntries(BASELINED_SELECTORS.map((selector) => [selector, contractFor(selector)]))
    expect(contract).toMatchSnapshot()
  })
})

describe('visual baseline: component markup', () => {
  const element = React.createElement
  const html = (node: React.ReactElement) => renderToStaticMarkup(node)

  it('renders the empty state', () => {
    expect(
      html(
        element(EmptyState, {
          icon: element('svg', { width: 28, height: 28, 'aria-hidden': true }),
          title: 'No clips yet',
          hint: 'Pick a moment and the clip appears here.',
          action: element('button', { className: 'btn primary' }, 'Find moments')
        })
      )
    ).toMatchSnapshot()
  })

  it('renders the error state, with and without retry', () => {
    expect(html(element(ErrorBox, { error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' }, onRetry: () => {} }))).toMatchSnapshot()
    expect(html(element(ErrorBox, { error: { code: 'UNKNOWN', message: 'Something went wrong' } }))).toMatchSnapshot()
  })

  it('renders every progress state', () => {
    for (const value of [0, 0.42, 1]) {
      expect(html(element(ProgressBar, { value }))).toMatchSnapshot(`progress-${value}`)
    }
    expect(html(element(ProgressBar, { value: 1, success: true }))).toMatchSnapshot('progress-success')
    expect(html(element(ProgressBar, { value: 0.3, danger: true }))).toMatchSnapshot('progress-danger')
  })

  it('renders the loading spinner', () => {
    expect(html(element(Spinner, {}))).toMatchSnapshot()
    expect(html(element(Spinner, { size: 20 }))).toMatchSnapshot('spinner-large')
  })

  it('renders a labelled field', () => {
    expect(
      html(
        element(
          Field,
          { label: 'Whisper model', hint: 'Bigger models are slower but more accurate.' },
          element('select', { className: 'select', defaultValue: 'base' }, element('option', { value: 'base' }, 'base'))
        )
      )
    ).toMatchSnapshot()
  })

  it('renders the switch in both states, including disabled', () => {
    for (const [name, props] of [
      ['off', { checked: false }],
      ['on', { checked: true }],
      ['disabled', { checked: true, disabled: true }]
    ] as const) {
      expect(
        html(element(Switch, { ...props, label: 'Auto-save proxy', hint: 'Renders use the small file.', onChange: () => {} }))
      ).toMatchSnapshot(`switch-${name}`)
    }
  })

  it('renders the dialog chrome', () => {
    expect(
      html(
        element(
          Modal,
          {
            title: 'Export clip',
            onClose: () => {},
            footer: element('button', { className: 'btn primary' }, 'Start export')
          },
          element('div', { className: 'text-body' }, 'The export runs in the background.')
        )
      )
    ).toMatchSnapshot()
  })

  it('renders the destructive confirmation dialog', () => {
    expect(
      html(
        element(
          ConfirmDialog,
          {
            title: 'Delete project',
            confirmLabel: 'Delete project',
            danger: true,
            confirmPhrase: 'Episode 42',
            onConfirm: () => {},
            onCancel: () => {}
          },
          element('div', { className: 'text-body' }, 'This removes the project from the workspace.')
        )
      )
    ).toMatchSnapshot()
  })
})

describe('workspace controls', () => {
  const divider = renderToStaticMarkup(
    React.createElement(ResizeHandle, {
      orientation: 'vertical',
      label: 'Resize sidebar',
      value: 198,
      min: 180,
      max: 380,
      defaultValue: 198,
      onChange: () => {},
      onCommit: () => {}
    })
  )

  it('exposes a divider as a keyboard window splitter', () => {
    expect(divider).toContain('role="separator"')
    expect(divider).toContain('aria-orientation="vertical"')
    expect(divider).toContain('aria-valuenow="198"')
    expect(divider).toContain('aria-valuemin="180"')
    expect(divider).toContain('aria-valuemax="380"')
    expect(divider).toContain('tabindex="0"')
    expect(divider).toContain('aria-label="Resize sidebar"')
  })

  it('keeps the divider markup stable', () => {
    expect(divider).toMatchSnapshot()
  })
})
