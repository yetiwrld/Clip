import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  TASK_TYPE_LABELS,
  clipStatusLabel,
  plural,
  providerLabel,
  renderStageLabel,
  renderStatusLabel,
  taskStateLabel,
  taskTypeLabel
} from '../../src/renderer/copy/labels'

/**
 * Copy consistency audit.
 *
 * The interface text is not a single file, so these tests read the components
 * the same way the app does — a TypeScript syntax tree — and check the rules
 * written down in COPY_GUIDE.md. They fail on new violations, not on style
 * opinions: each rule maps to a decision a reader would notice.
 */

const rendererRoot = resolve(process.cwd(), 'src/renderer')

type Record_ = { file: string; line: number; where: string; text: string }

function forEachComponent(visit: (source: ts.SourceFile, file: string) => void): void {
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && path.endsWith('.tsx')) {
        visit(
          ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
          relative(process.cwd(), path)
        )
      }
    }
  }
  walk(rendererRoot)
}

function position(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
}

/** Every attribute string a person can read or hear. */
const HUMAN_ATTRIBUTES = new Set(['placeholder', 'title', 'aria-label', 'alt', 'aria-description'])

function collectHumanStrings(): Record_[] {
  const found: Record_[] = []
  forEachComponent((source, file) => {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxText(node)) {
        const text = node.text.replace(/\s+/g, ' ').trim()
        if (text) found.push({ file, line: position(source, node), where: 'text', text })
      }
      if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
        const name = node.name.getText(source)
        if (HUMAN_ATTRIBUTES.has(name) && node.initializer.text.trim()) {
          found.push({ file, line: position(source, node), where: name, text: node.initializer.text })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  })
  return found
}

type ButtonRecord = { file: string; line: number; labels: string[]; iconOnly: boolean; ariaLabel: boolean; title: boolean }

function jsxElementName(node: ts.JsxElement): string {
  const tag = node.openingElement.tagName
  return ts.isIdentifier(tag) ? tag.text : tag.getText()
}

/** Button labels: literal text plus the strings a conditional would render. */
function collectButtons(): ButtonRecord[] {
  const found: ButtonRecord[] = []
  forEachComponent((source, file) => {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxElement(node) && jsxElementName(node) === 'button') {
        const labels: string[] = []
        // Icon-only is a narrow claim: nothing readable in the button except
        // icon components (capitalised tags). Text from a call such as
        // formatClock() is content, so that button is not icon-only.
        let onlyIcons = true
        const read = (child: ts.Node): void => {
          if (ts.isJsxText(child)) {
            const text = child.text.replace(/\s+/g, ' ').trim()
            if (text) labels.push(text)
            return
          }
          if (ts.isJsxExpression(child)) {
            if (child.expression) onlyIcons = false
            if (!child.expression) return
            const gather = (inner: ts.Node): void => {
              if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) labels.push(inner.text)
              ts.forEachChild(inner, gather)
            }
            gather(child.expression)
            return
          }
          if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
            const tag = ts.isJsxElement(child) ? child.openingElement.tagName : child.tagName
            const name = ts.isIdentifier(tag) ? tag.text : tag.getText()
            if (!/^[A-Z]/.test(name)) onlyIcons = false
          }
        }
        for (const child of node.children) read(child)
        const names = node.openingElement.attributes.properties.flatMap((attribute) =>
          ts.isJsxAttribute(attribute) ? [attribute.name.getText(source)] : []
        )
        found.push({
          file,
          line: position(source, node),
          labels,
          iconOnly: labels.join('').trim().length === 0 && onlyIcons,
          ariaLabel: names.includes('aria-label'),
          title: names.includes('title')
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  })
  return found
}

type FieldRecord = { file: string; line: number; placeholder: string; labelled: boolean }

/** Placeholders are a hint, never the only label. */
function collectPlaceholders(): FieldRecord[] {
  const found: FieldRecord[] = []
  forEachComponent((source, file) => {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = ts.isIdentifier(node.tagName) ? node.tagName.text : node.tagName.getText(source)
        if (['input', 'textarea', 'select'].includes(tag)) {
          const attributes = node.attributes.properties
          const placeholder = attributes.find(
            (attribute): attribute is ts.JsxAttribute =>
              ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'placeholder'
          )
          if (placeholder) {
            const names = attributes.flatMap((attribute) => (ts.isJsxAttribute(attribute) ? [attribute.name.getText(source)] : []))
            let parent: ts.Node | undefined = node.parent
            let inField = false
            while (parent) {
              if (ts.isJsxElement(parent) && jsxElementName(parent) === 'Field') inField = true
              if (ts.isJsxElement(parent) && jsxElementName(parent) === 'label') inField = true
              parent = parent.parent
            }
            found.push({
              file,
              line: position(source, node),
              placeholder: ts.isStringLiteral(placeholder.initializer!) ? placeholder.initializer.text : '(dynamic)',
              labelled: names.includes('aria-label') || names.includes('id') || names.includes('aria-labelledby') || inField
            })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  })
  return found
}

const human = collectHumanStrings()
const buttons = collectButtons()
const placeholders = collectPlaceholders()

describe('interface copy', () => {
  it('reads every component, so the checks are not vacuous', () => {
    expect(human.length).toBeGreaterThan(500)
    expect(buttons.length).toBeGreaterThan(100)
  })

  it('uses a real ellipsis, never three full stops', () => {
    const offenders = human.filter((entry) => entry.text.includes('...'))
    expect(offenders).toEqual([])
  })

  it('does not fall back on vague system words', () => {
    const banned = [
      'click here',
      'something went wrong',
      'an error occurred',
      'error occurred',
      'oops',
      'unexpected error',
      'invalid input',
      'please try again later',
      'no data'
    ]
    const offenders = human.filter((entry) => banned.some((phrase) => entry.text.toLowerCase().includes(phrase)))
    expect(offenders).toEqual([])
  })

  it('avoids bare OK, Submit, Yes and No as actions', () => {
    const offenders = buttons.filter((button) =>
      button.labels.some((label) => ['ok', 'okay', 'submit', 'yes', 'no', 'done'].includes(label.trim().toLowerCase()))
    )
    expect(offenders).toEqual([])
  })

  it('keeps button labels in sentence case', () => {
    const properNouns = new Set(['URL', 'AI', 'FFmpeg', 'Whisper', 'Anthropic', 'TikTok', 'Instagram', 'YouTube', 'Reels', 'I', 'O'])
    const offenders: Array<{ file: string; line: number; label: string }> = []
    for (const button of buttons) {
      for (const label of button.labels) {
        if (!/[A-Za-z]{2}/.test(label)) continue
        const words = label.replace(/…/g, '').trim().split(/\s+/).filter((word) => /[A-Za-z]/.test(word))
        if (words.length < 2) continue
        const allCapitalised = words.every(
          (word) => properNouns.has(word.replace(/[^A-Za-z]/g, '')) || /^[A-Z]/.test(word)
        )
        const allLowerOrNumber = words.every((word) => !/^[A-Z]/.test(word))
        if (allCapitalised && !allLowerOrNumber) offenders.push({ file: button.file, line: button.line, label })
      }
    }
    expect(offenders).toEqual([])
  })

  it('never ends a button label with a full stop', () => {
    const offenders = buttons.filter((button) =>
      button.labels.some((label) => /[A-Za-z]/.test(label) && label.trim().endsWith('.'))
    )
    expect(offenders).toEqual([])
  })

  it('labels every icon-only control for screen readers', () => {
    const iconOnly = buttons.filter((button) => button.iconOnly)
    const offenders = iconOnly.filter((button) => !button.ariaLabel)
    expect(iconOnly.length).toBeGreaterThan(20)
    expect(offenders).toEqual([])
  })

  it('keeps tooltips to one short line', () => {
    const offenders = human.filter((entry) => entry.where === 'title' && entry.text.length > 90)
    expect(offenders).toEqual([])
  })

  it('never leaves a placeholder as the only label', () => {
    const offenders = placeholders.filter((entry) => !entry.labelled)
    expect(offenders).toEqual([])
  })

  it('does not put double spaces inside interface strings', () => {
    const offenders = human.filter((entry) => entry.where !== 'text' && /\s{2,}/.test(entry.text))
    expect(offenders).toEqual([])
  })
})

describe('shared labels', () => {
  it('turns stored job types into readable names', () => {
    expect(taskTypeLabel('speaker-identification')).toBe('Voice grouping')
    expect(taskTypeLabel('download')).toBe('Media import')
    expect(taskTypeLabel('something-new')).toBe('something-new')
    expect(Object.keys(TASK_TYPE_LABELS)).toHaveLength(8)
  })

  it('describes render stages and states in words', () => {
    expect(renderStageLabel('encoding')).toBe('Encoding')
    expect(renderStageLabel(null)).toBe('')
    expect(renderStageLabel('unknown-stage')).toBe('unknown-stage')
    expect(renderStatusLabel('queued')).toBe('Waiting')
    expect(taskStateLabel('interrupted')).toBe('Interrupted')
  })

  it('never shows a raw clip status', () => {
    expect(clipStatusLabel('draft')).toBe('Draft')
    expect(clipStatusLabel('rendered')).toBe('Rendered')
  })

  it('tells readers when a score came from rules, not an AI model', () => {
    expect(providerLabel('heuristic-local')).toContain('not an AI model')
    expect(providerLabel('anthropic')).toBe('Anthropic (Claude)')
    expect(providerLabel(null)).toContain('heuristic')
  })

  it('never writes "1 clips"', () => {
    expect(plural(1, 'clip')).toBe('1 clip')
    expect(plural(2, 'clip')).toBe('2 clips')
    expect(plural(0, 'file')).toBe('0 files')
    expect(plural(1, 'rendered clip')).toBe('1 rendered clip')
  })
})
