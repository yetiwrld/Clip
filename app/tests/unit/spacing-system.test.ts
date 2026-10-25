import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Spacing system guard.
 *
 * Spacing is expressed through the --space-* scale and the density roles
 * (--pad-panel, --pad-card, --pad-dialog, --gap-control, --gap-field,
 * --gap-section, --gap-page). This test exists so the scale stays the single
 * source of truth: it fails when a margin, padding or gap is written as an
 * arbitrary pixel value again.
 *
 * Documented exceptions, both allowed:
 *   1px  hairlines and one-pixel optical nudges
 *   raw px inside calc(...)  layout arithmetic against a fixed measurement
 *                            (track label widths, column widths)
 */

const root = process.cwd()
const rendererDir = path.join(root, 'src', 'renderer')
const cssPath = path.join(rendererDir, 'styles', 'global.css')

const SCALE: Record<string, string> = {
  '--space-0': '0px',
  '--space-1': '2px',
  '--space-2': '4px',
  '--space-3': '8px',
  '--space-4': '12px',
  '--space-5': '16px',
  '--space-6': '20px',
  '--space-7': '24px',
  '--space-8': '32px',
  '--space-9': '40px',
  '--space-10': '48px',
  '--space-11': '64px',
  '--space-12': '80px'
}

const ROLE_TOKENS = ['--pad-panel', '--pad-card', '--pad-dialog', '--gap-control', '--gap-field', '--gap-section', '--gap-page']

const SPACING_PROP = /^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left))?$/
const DECLARATION = /([a-zA-Z-]+)\s*:\s*([^;{}]+);/g

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, ext, out)
    else if (entry.name.endsWith(ext)) out.push(full)
  }
  return out
}

/** Remove every balanced calc(...) so arithmetic constants stay allowed. */
function stripCalc(value: string): string {
  let out = ''
  let index = 0
  while (index < value.length) {
    if (value.startsWith('calc(', index)) {
      let depth = 0
      let cursor = index + 4
      for (; cursor < value.length; cursor += 1) {
        if (value[cursor] === '(') depth += 1
        else if (value[cursor] === ')') {
          depth -= 1
          if (depth === 0) break
        }
      }
      index = cursor + 1
      continue
    }
    out += value[index]
    index += 1
  }
  return out
}

/** Raw pixel values are only allowed for hairlines and inside calc(). */
function rawPixels(value: string): string[] {
  const found = stripCalc(value).match(/(?<![\w.])\d+(?:\.\d+)?px/g) ?? []
  return found.filter((token) => token !== '1px')
}

const css = fs.readFileSync(cssPath, 'utf8')

describe('spacing scale', () => {
  it('declares every step with the agreed value', () => {
    for (const [token, value] of Object.entries(SCALE)) {
      expect(css, `${token} should be ${value}`).toMatch(new RegExp(`${token}:\\s*${value.replace('.', '\\.')};`))
    }
  })

  it('declares the density roles for standard, compact and spacious', () => {
    for (const token of ROLE_TOKENS) {
      expect(css, `${token} missing from :root`).toMatch(new RegExp(`${token}:\\s*var\\(--space-\\d+\\);`))
    }
    expect(css).toMatch(/\[data-density='compact'\]\s*\{[^}]*--pad-panel/)
    expect(css).toMatch(/\[data-density='spacious'\]\s*\{[^}]*--pad-panel/)
  })
})

describe('stylesheet spacing', () => {
  it('never hard-codes a spacing value that a token can express', () => {
    const violations: string[] = []
    for (const match of css.matchAll(DECLARATION)) {
      const [, prop, value] = match
      if (!SPACING_PROP.test(prop)) continue
      const offenders = rawPixels(value)
      if (offenders.length) violations.push(`${prop}: ${value.trim()} (${offenders.join(', ')})`)
    }
    expect(violations).toEqual([])
  })
})

describe('inline component spacing', () => {
  const files = walk(rendererDir, '.tsx')

  it('uses tokens instead of pixel strings in spacing styles', () => {
    const violations: string[] = []
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      // only a spacing property whose value starts with a quoted literal
      const quoted = /\b(gap|rowGap|columnGap|margin|marginTop|marginBottom|marginLeft|marginRight|padding|paddingTop|paddingBottom|paddingLeft|paddingRight)\s*:\s*(['"])([^'"\n]*)\2/g
      for (const match of source.matchAll(quoted)) {
        const offenders = rawPixels(match[3])
        if (offenders.length) violations.push(`${path.relative(root, file)}: ${match[1]}: "${match[3]}" (${offenders.join(', ')})`)
      }
    }
    expect(violations).toEqual([])
  })

  it('never passes a raw spacing number where a token belongs', () => {
    const violations: string[] = []
    const numeric = /\b(gap|rowGap|columnGap|margin|marginTop|marginBottom|marginLeft|marginRight|padding|paddingTop|paddingBottom|paddingLeft|paddingRight)\s*:\s*(-?\d+(?:\.\d+)?)(?=\s*[,}])/g
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(numeric)) {
        if (Number(match[2]) === 0) continue
        violations.push(`${path.relative(root, file)}: ${match[1]}: ${match[2]}`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('density coverage', () => {
  it('applies a density to every dense workspace', () => {
    const editor = fs.readFileSync(path.join(rendererDir, 'features', 'editor', 'EditorPage.tsx'), 'utf8')
    expect(editor).toContain('data-density="compact"')
    const onboarding = fs.readFileSync(path.join(rendererDir, 'features', 'onboarding', 'FirstRunModal.tsx'), 'utf8')
    expect(onboarding).toContain('data-density="spacious"')
  })
})
