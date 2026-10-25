import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ErrorBox, Field, Modal, ProgressBar, Spinner, Switch } from '../../src/renderer/components/ui'

/**
 * Accessibility contract for the shared primitives.
 *
 * These are the guarantees the rest of the app inherits: a label that is bound
 * to its control, a switch that announces its state, a dialog that is named, a
 * progress bar that reports a value, and an error that is announced as one.
 * Everything is checked on the rendered markup, so it cannot drift silently.
 */

const element = React.createElement
const html = (node: React.ReactElement) => renderToStaticMarkup(node)

describe('accessible primitives', () => {
  it('binds a field label to a native control', () => {
    const markup = html(
      element(
        Field,
        { label: 'Whisper model', hint: 'Bigger models are slower.' },
        element('select', { className: 'select', defaultValue: 'base' }, element('option', { value: 'base' }, 'base'))
      )
    )
    const labelFor = /<label[^>]*for="([^"]+)"/.exec(markup)?.[1]
    const controlId = /<select[^>]*id="([^"]+)"/.exec(markup)?.[1]
    expect(labelFor, 'the label must point at a control').toBeTruthy()
    expect(controlId).toBe(labelFor)
    expect(markup).toContain(`aria-describedby="${labelFor}-hint"`)
    expect(markup).toContain(`id="${labelFor}-hint"`)
  })

  it('does not invent a label target for a composite child', () => {
    const markup = html(
      element(Field, { label: 'Colour' }, element('div', { className: 'row' }, element('button', {}, 'Pick'), element('button', {}, 'Reset')))
    )
    expect(markup).not.toContain('<label class="field-label" for=')
  })

  it('announces switch state', () => {
    const on = html(element(Switch, { checked: true, label: 'Auto-save', onChange: () => {} }))
    const off = html(element(Switch, { checked: false, label: 'Auto-save', onChange: () => {} }))
    expect(on).toContain('role="switch"')
    expect(on).toContain('aria-checked="true"')
    expect(off).toContain('aria-checked="false"')
  })

  it('names a dialog and its close control', () => {
    const markup = html(element(Modal, { title: 'Export clip', onClose: () => {} }, element('div', {}, 'Body')))
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-label="Export clip"')
    expect(markup).toContain('aria-label="Close dialog"')
  })

  it('reports progress as a value', () => {
    expect(html(element(ProgressBar, { value: 0.42 }))).toContain('role="progressbar"')
    expect(html(element(ProgressBar, { value: 0.42 }))).toContain('aria-valuenow="42"')
    expect(html(element(ProgressBar, { value: 2 }))).toContain('aria-valuenow="100"')
  })

  it('announces errors as alerts', () => {
    expect(html(element(ErrorBox, { error: { code: 'X', message: 'Something went wrong' } }))).toContain('role="alert"')
  })

  it('gives the spinner an accessible name', () => {
    expect(html(element(Spinner, {}))).toContain('aria-label="Loading"')
  })
})
