import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Design-token guard.
 *
 * The interface has one type scale, one weight set, one line-height set, one
 * radius set and one icon rhythm. This test fails when a component invents a
 * value instead of using a token, so the system cannot drift back into
 * nineteen font sizes and thirteen corner radii.
 *
 * Documented exceptions:
 *   - fontSize 64 in the caption default (that is caption text, not UI chrome)
 *   - line-height in px where an element needs a fixed line box
 *   - border-radius 0 / 50% / inherit (geometry, not a corner style)
 */

const root = process.cwd()
const rendererDir = path.join(root, 'src', 'renderer')
const css = fs.readFileSync(path.join(rendererDir, 'styles', 'global.css'), 'utf8')

const TYPE_SCALE: Record<string, string> = {
  '--fs-micro': '10px',
  '--fs-xs': '11px',
  '--fs-sm': '12px',
  '--fs-base': '13px',
  '--fs-md': '15px',
  '--fs-lg': '18px',
  '--fs-xl': '22px',
  '--fs-2xl': '28px'
}

const ICON_SCALE = [12, 14, 16, 20, 28]

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, ext, out)
    else if (entry.name.endsWith(ext)) out.push(full)
  }
  return out
}

const tsxFiles = walk(rendererDir, '.tsx')

describe('design tokens', () => {
  it('declares the type scale with the agreed values', () => {
    for (const [token, value] of Object.entries(TYPE_SCALE)) {
      expect(css, `${token} should be ${value}`).toMatch(new RegExp(`${token}:\\s*${value.replace('.', '\\.')};`))
    }
  })

  it('declares one weight set, one line-height set and one radius set', () => {
    for (const token of ['--fw-regular', '--fw-medium', '--fw-bold']) expect(css).toContain(token + ':')
    for (const token of ['--lh-none', '--lh-tight', '--lh-snug', '--lh-normal', '--lh-loose']) expect(css).toContain(token + ':')
    for (const token of ['--radius-xs', '--radius-control', '--radius-md', '--radius-lg']) expect(css).toContain(token + ':')
    for (const token of ['--icon-xs', '--icon-sm', '--icon-md', '--icon-lg', '--icon-xl']) expect(css).toContain(token + ':')
  })
})

describe('stylesheet typography', () => {
  it('never hard-codes a font size', () => {
    const offenders = css.match(/font-size:\s*\d+(?:\.\d+)?px/g) ?? []
    expect(offenders).toEqual([])
  })

  it('never hard-codes a font weight', () => {
    const offenders = css.match(/font-weight:\s*\d+/g) ?? []
    expect(offenders).toEqual([])
  })

  it('never hard-codes a unitless line height', () => {
    const offenders = css.match(/line-height:\s*\d+(?:\.\d+)?(?=\s*;)/g) ?? []
    expect(offenders).toEqual([])
  })

  it('only uses radius tokens for corners', () => {
    const offenders = (css.match(/border-radius:\s*[^;]+/g) ?? [])
      .filter((decl) => !decl.includes('var('))
      .filter((decl) => {
        const value = decl.replace(/^border-radius:\s*/, '').trim()
        return !(value === '0' || value === '50%' || value === 'inherit')
      })
    expect(offenders).toEqual([])
  })
})

describe('component typography and icons', () => {
  it('passes font sizes as tokens, except the caption default', () => {
    const offenders: string[] = []
    for (const file of tsxFiles) {
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
        if (Number(match[1]) >= 40) continue
        offenders.push(`${path.relative(root, file)}: ${match[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('uses the icon scale for every icon size', () => {
    const offenders: string[] = []
    for (const file of tsxFiles) {
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(/size=\{(\d+)\}/g)) {
        if (!ICON_SCALE.includes(Number(match[1]))) offenders.push(`${path.relative(root, file)}: ${match[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

/** Read a JSX opening tag, ignoring '>' inside expressions and strings. */
function readTag(source: string, from: number): string {
  let depth = 0
  let quote: string | null = null
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
    } else if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    else if (ch === '>' && depth === 0) return source.slice(from, i + 1)
  }
  return source.slice(from)
}

describe('motion', () => {
  it('declares three durations and the easing curves', () => {
    for (const token of ['--dur-fast: 120ms', '--dur-base: 180ms', '--dur-slow: 240ms']) expect(css).toContain(token)
    for (const token of ['--ease:', '--ease-out:', '--ease-in:']) expect(css).toContain(token)
  })

  it('never hard-codes a transition duration', () => {
    const offenders = (css.match(/transition:[^;]+/g) ?? []).filter((decl) => /\d+m?s\b/.test(decl) && !decl.includes('var('))
    expect(offenders).toEqual([])
  })

  it('reserves infinite animation for the loading spinner', () => {
    const infinite = (css.match(/animation:[^;]+infinite[^;]*/g) ?? []).filter((decl) => !decl.includes('spin'))
    expect(infinite).toEqual([])
  })

  it('respects the system reduced-motion preference', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toContain('transition-duration: 0.01ms !important')
    expect(block).toContain('animation-duration: 0.01ms !important')
  })
})

describe('icon system', () => {
  it('keeps one stroke source: LucideProvider sets it, call sites do not', () => {
    const offenders: string[] = []
    for (const file of tsxFiles) {
      const source = fs.readFileSync(file, 'utf8')
      for (const line of source.split('\n')) {
        if (!/strokeWidth=\{[\d.]/.test(line)) continue
        if (line.includes('LucideProvider')) continue
        offenders.push(`${path.relative(root, file)}: ${line.trim().slice(0, 70)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('declares the stroke ramp per size', () => {
    for (const size of ['12', '14', '16', '20', '28']) {
      expect(css).toContain(`.lucide[width='${size}']`)
    }
  })

  it('labels every icon-only button for screen readers', () => {
    const offenders: string[] = []
    for (const file of tsxFiles) {
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(/<button\b/g)) {
        const tag = readTag(source, match.index!)
        if (!tag.includes('icon')) continue
        if (!tag.includes('aria-label')) offenders.push(`${path.relative(root, file)}: ${tag.slice(0, 70)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('interaction states', () => {
  it('declares one focus ring, press and disabled treatment', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--focus-ring\)/)
    expect(css).toMatch(/button:disabled\s*\{[^}]*cursor:\s*not-allowed/)
    expect(css).toMatch(/\.nav-item:active\s*\{/)
    expect(css).toMatch(/\.input:disabled[\s\S]{0,200}cursor:\s*not-allowed/)
  })
})
