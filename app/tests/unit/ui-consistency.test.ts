import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UI consistency guard.
 *
 * The design system lives in one stylesheet and one token block. This file
 * checks the rules that a screenshot cannot check reliably: that values come
 * from the scale, that shared components keep their states, that dialogs and
 * menus are contained, and that no new competing definition is added next to an
 * existing one.
 *
 * Where a literal is legitimate — media-layer colours that have to stay
 * distinguishable from the chrome, overlay rings drawn over video — the area is
 * named and budgeted instead of being silently allowed.
 */

const root = process.cwd()
const rendererDir = path.join(root, 'src', 'renderer')
const cssPath = path.join(rendererDir, 'styles', 'global.css')
const css = fs.readFileSync(cssPath, 'utf8')

const rel = (file: string) => path.relative(root, file)

interface Rule {
  selector: string
  body: string
  line: number
  context: string
}

/** Parse top-level rules and `@media` blocks, keeping a line number for each. */
function parseRules(source: string): Rule[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
  const rules: Rule[] = []

  const walk = (start: number, end: number, context: string): void => {
    let index = start
    while (index < end) {
      const open = withoutComments.indexOf('{', index)
      if (open === -1 || open >= end) return
      let depth = 1
      let close = open + 1
      while (close < end && depth > 0) {
        if (withoutComments[close] === '{') depth += 1
        else if (withoutComments[close] === '}') depth -= 1
        close += 1
      }
      const prelude = withoutComments.slice(index, open).trim()
      const body = withoutComments.slice(open + 1, close - 1)
      if (prelude.startsWith('@media')) {
        walk(open + 1, close - 1, prelude.replace(/\s+/g, ' '))
      } else if (prelude && !prelude.startsWith('@')) {
        const line = withoutComments.slice(0, open).split('\n').length
        rules.push({ selector: prelude.replace(/\s+/g, ' '), body, line, context })
      }
      index = close
    }
  }

  walk(0, withoutComments.length, '(base)')
  return rules
}

const rules = parseRules(css)
const rootBlock = (/:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
const tokens = new Map<string, string>()
for (const declaration of rootBlock.split(';')) {
  const [name, ...rest] = declaration.split(':')
  if (!name?.trim().startsWith('--')) continue
  tokens.set(name.trim(), rest.join(':').trim())
}

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

/**
 * Areas where a literal colour is deliberate: they draw media identity and
 * on-video overlays, must stay distinguishable from the graphite chrome, and
 * are reviewed as a set. Everything else uses a token.
 */
const MEDIA_LAYER_PREFIXES = [
  '.multi-track',
  '.timeline-',
  '.tl-',
  '.camera-',
  '.subject-',
  '.cap-',
  '.caption-',
  '.text-',
  '.editor-text-layer',
  '.editor-frame',
  '.playback-error',
  '.stage-canvas',
  '.track-title',
  '.asset-waveform' // audio shape, not chrome
]

/**
 * Frozen budget: 87 literals still live in the media layer (clip colours, trim
 * grips, waveform, on-stage rings). Lower it when they are tokenised; never
 * raise it casually.
 */
const MEDIA_LAYER_LITERAL_BUDGET = 87

function inMediaLayer(selector: string): boolean {
  return MEDIA_LAYER_PREFIXES.some((prefix) => selector.startsWith(prefix) || selector.includes(` ${prefix}`))
}

const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g

describe('design-system compliance', () => {
  it('keeps colour literals out of the chrome', () => {
    const offenders: string[] = []
    let mediaLiterals = 0
    for (const rule of rules) {
      if (rule.selector.startsWith(':root')) continue
      for (const { prop, value } of declarations(rule.body)) {
        if (!COLOUR.test(value)) continue
        COLOUR.lastIndex = 0
        if (prop === 'background-image' || prop === 'background') {
          // Gradients over media are geometry, not palette.
          if (inMediaLayer(rule.selector)) mediaLiterals += 1
          else offenders.push(`${rel(cssPath)}:${rule.line} ${rule.selector} ${prop}: ${value}`)
          continue
        }
        if (inMediaLayer(rule.selector)) mediaLiterals += 1
        else offenders.push(`${rel(cssPath)}:${rule.line} ${rule.selector} ${prop}: ${value}`)
      }
    }
    expect(offenders, `Use a token, or add the area to MEDIA_LAYER_PREFIXES with a reason:\n${offenders.join('\n')}`).toEqual([])
    expect(mediaLiterals, 'Media-layer colour budget changed — tokenise or review the new literal').toBeLessThanOrEqual(MEDIA_LAYER_LITERAL_BUDGET)
  })

  it('never uses the font shorthand, which bypasses the type scale', () => {
    const offenders = rules
      .filter((rule) => declarations(rule.body).some((entry) => entry.prop === 'font'))
      .map((rule) => `${rel(cssPath)}:${rule.line} ${rule.selector}`)
    expect(offenders).toEqual([])
  })

  it('stacks with the z-index ladder only', () => {
    const offenders: string[] = []
    for (const rule of rules) {
      for (const { prop, value } of declarations(rule.body)) {
        if (prop !== 'z-index') continue
        if (value === '0' || value === 'auto' || value.startsWith('var(--z-')) continue
        offenders.push(`${rel(cssPath)}:${rule.line} ${rule.selector} z-index: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps corners and elevation on the scale', () => {
    const radiusOffenders: string[] = []
    const shadowOffenders: string[] = []
    for (const rule of rules) {
      for (const { prop, value } of declarations(rule.body)) {
        if (prop === 'border-radius') {
          const rest = value.replace(/var\([^)]*\)/g, '').replace(/[0-9.]+(px|%)/g, '').replace(/\b(0|inherit)\b/g, '').replace(/[\s/]/g, '')
          if (rest.length > 0) radiusOffenders.push(`${rel(cssPath)}:${rule.line} ${rule.selector} ${value}`)
        }
        if (prop === 'box-shadow') {
          if (value.startsWith('var(--shadow') || value === 'none') continue
          // Rings and HUD outlines are drawn over media, not chrome elevation.
          if (inMediaLayer(rule.selector) || rule.selector.includes('focus') || rule.selector.includes('camera')) continue
          // The tour spotlight dims everything except one rectangle; only a
          // shadow with a huge spread can cut that hole out of a fixed layer.
          if (rule.selector.includes('tour-spotlight')) continue
          shadowOffenders.push(`${rel(cssPath)}:${rule.line} ${rule.selector} ${value}`)
        }
      }
    }
    expect(radiusOffenders).toEqual([])
    expect(shadowOffenders).toEqual([])
  })

  it('truncates text only where the rule can actually truncate', () => {
    const offenders: string[] = []
    for (const rule of rules) {
      const props = declarations(rule.body)
      const has = (name: string) => props.some((entry) => entry.prop === name)
      if (!has('text-overflow')) continue
      const multiLineClamp = props.some((entry) => entry.prop === '-webkit-line-clamp' || entry.prop === 'line-clamp')
      if (multiLineClamp) continue
      if (!has('overflow') && !has('overflow-x')) offenders.push(`${rel(cssPath)}:${rule.line} ${rule.selector}`)
      // A single-line input or select never wraps, so it truncates on its own.
      const isSingleLineControl = /(^|[\s>])(input|select)\b/.test(rule.selector)
      if (!isSingleLineControl && !props.some((entry) => entry.value.includes('nowrap'))) {
        offenders.push(`${rel(cssPath)}:${rule.line} ${rule.selector} (no nowrap)`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps dialogs, menus and toasts inside the window', () => {
    const ruleFor = (selector: string) => rules.filter((rule) => rule.selector === selector).map((rule) => rule.body).join(';')
    const has = (selector: string, pattern: RegExp) => pattern.test(ruleFor(selector))

    expect(has('.modal', /max-height:/), '.modal needs a max-height').toBe(true)
    expect(has('.modal-body', /overflow-y:\s*auto/), '.modal-body must scroll').toBe(true)
    expect(has('.modal-foot', /flex-wrap:\s*wrap/), '.modal-foot must wrap long button rows').toBe(true)
    expect(has('.menu', /max-height:/), '.menu needs a max-height').toBe(true)
    expect(has('.menu', /overflow-y:\s*auto/), '.menu must scroll when long').toBe(true)
    expect(has('.palette', /max-height:/), '.palette needs a max-height').toBe(true)
    expect(has('.toasts', /width:\s*min\([^)]*100vw/), '.toasts must stay inside the viewport').toBe(true)
  })

  it('declares the states every interactive component needs', () => {
    const selectors = rules.flatMap((rule) => rule.selector.split(',').map((entry) => entry.trim()))
    const hasSelector = (pattern: RegExp) => selectors.some((selector) => pattern.test(selector))

    // One ring for the whole app, so a control cannot forget one.
    expect(css).toContain(':focus-visible { outline: var(--focus-ring) solid var(--accent)')

    expect(hasSelector(/^\.btn:hover/), '.btn needs a hover state').toBe(true)
    expect(hasSelector(/^\.btn:active|^\.btn\.primary:active/), '.btn needs a pressed state').toBe(true)
    expect(hasSelector(/^\.btn:disabled/), '.btn needs a disabled state').toBe(true)
    expect(hasSelector(/^\.input:focus|^\.input:focus-visible/), '.input needs a focus state').toBe(true)
    expect(hasSelector(/^\.select:focus|^\.select:focus-visible/), '.select needs a focus state').toBe(true)
    expect(hasSelector(/^\.nav-item:hover/), '.nav-item needs hover').toBe(true)
    expect(hasSelector(/^\.nav-item\.active|^\.nav-item\[aria-current/), '.nav-item needs a selected state').toBe(true)
    expect(hasSelector(/\.menu button:hover/), 'menu rows need hover').toBe(true)
    expect(hasSelector(/\.chip\.(success|warn|danger)/), 'chips need semantic variants').toBe(true)
  })

  it('keeps every semantic colour and its tints in the same family', () => {
    const parse = (value: string): [number, number, number] | null => {
      const hex = /^#([0-9a-f]{6})$/i.exec(value)
      if (hex) {
        const n = parseInt(hex[1], 16)
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      }
      const rgb = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(value)
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      return null
    }
    for (const family of ['accent', 'success', 'warn', 'danger']) {
      const base = parse(tokens.get(`--${family}`) ?? '')
      expect(base, `--${family} must be a colour`).not.toBeNull()
      for (const suffix of ['-soft', '-border']) {
        const tint = parse(tokens.get(`--${family}${suffix}`) ?? '')
        expect(tint, `--${family}${suffix} must be declared`).not.toBeNull()
        expect(tint, `--${family}${suffix} must be a tint of --${family}`).toEqual(base)
      }
    }
  })

  it('does not add a competing declaration for an existing selector', () => {
    // Properties declared twice for the same selector in the same context:
    // the later one silently wins, which is how two visual truths appear.
    const bySelector = new Map<string, Map<string, Set<string>>>()
    for (const rule of rules) {
      if (!rule.selector.startsWith('.')) continue
      const key = `${rule.context} ${rule.selector}`
      const entry = bySelector.get(key) ?? new Map<string, Set<string>>()
      for (const { prop, value } of declarations(rule.body)) {
        const values = entry.get(prop) ?? new Set<string>()
        values.add(value)
        entry.set(prop, values)
      }
      bySelector.set(key, entry)
    }
    const conflicts: string[] = []
    for (const [key, props] of bySelector) {
      for (const [prop, values] of props) {
        if (values.size > 1) conflicts.push(`${key} :: ${prop} = ${[...values].sort().join(' | ')}`)
      }
    }
    // Known pairs kept for review; each is a real "two implementations" case.
    // 27 -> 26 after the button motion token was unified.
    expect(conflicts.length, `Conflicting duplicate declarations:\n${conflicts.join('\n')}`).toBeLessThanOrEqual(26)
  })

  it('applies the type scale through inline styles too', () => {
    const offenders: string[] = []
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.tsx')) files.push(full)
      }
    }
    walk(rendererDir)

    /**
     * Only the inside of a `style={{ … }}` object is a style. A `fontSize` on a
     * project data object is content, and blocking it here would be wrong.
     */
    const styleBlocks = (source: string): Array<{ text: string; line: number }> => {
      const blocks: Array<{ text: string; line: number }> = []
      let searchFrom = 0
      for (;;) {
        const at = source.indexOf('style={{', searchFrom)
        if (at === -1) return blocks
        const start = at + 'style='.length
        let depth = 0
        let index = start
        for (; index < source.length; index += 1) {
          if (source[index] === '{') depth += 1
          else if (source[index] === '}') {
            depth -= 1
            if (depth === 0) break
          }
        }
        blocks.push({ text: source.slice(start, index + 1), line: source.slice(0, at).split('\n').length })
        searchFrom = index + 1
      }
    }

    /** Keep the report pointing at the real file line, not the block start. */
    const at = (file: string, block: { text: string; line: number }, offset: number) =>
      `${rel(file)}:${block.line + block.text.slice(0, offset).split('\n').length - 1}`

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      for (const block of styleBlocks(source)) {
        for (const match of block.text.matchAll(/fontSize:\s*(\d+)/g)) offenders.push(`${at(file, block, match.index!)} fontSize ${match[1]}`)
        for (const match of block.text.matchAll(/borderRadius:\s*(\d+)/g)) offenders.push(`${at(file, block, match.index!)} borderRadius ${match[1]}`)
        for (const match of block.text.matchAll(/fontWeight:\s*(?!var\()([0-9]+)/g)) {
          if (!['500', '600', '700'].includes(match[1])) offenders.push(`${at(file, block, match.index!)} fontWeight ${match[1]}`)
        }
        for (const match of block.text.matchAll(/lineHeight:\s*(?!['"]var\()([0-9.]+)/g)) {
          if (!['1', '1.25', '1.4', '1.5', '1.7'].includes(match[1])) offenders.push(`${at(file, block, match.index!)} lineHeight ${match[1]}`)
        }
        for (const match of block.text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
          if (match[0].toLowerCase() !== '#000') offenders.push(`${at(file, block, match.index!)} colour ${match[0]}`)
        }
      }
    }
    expect(offenders, `Inline styles must use tokens:\n${offenders.join('\n')}`).toEqual([])
  })
})
