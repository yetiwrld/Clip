import { describe, it, expect } from 'vitest'
import { buildCues, cueAt, wordIndexAt, segmentToWords } from '@shared/captions/segmentation'
import { buildAssDocument } from '@shared/captions/ass'
import { buildSrtDocument } from '@shared/captions/srt'
import { CAPTION_FONTS, CAPTION_STYLES, getCaptionStyle } from '@shared/constants'
import type { CaptionCue } from '@shared/captions/segmentation'
import { buildTextLayersAssDocument } from '@shared/captions/text-ass'
import { textLayerAppearanceAt } from '@shared/video/textLayers'
import type { TextLayer } from '@shared/types'

// TranscriptSegment.words uses WordTiming {word, start, end}
const seg = (id: number, start: number, end: number, text: string) => ({
  id, startTime: start, endTime: end, text,
  words: text.split(' ').map((w, i, arr) => ({
    word: w,
    start: start + ((end - start) * i) / arr.length,
    end: start + ((end - start) * (i + 1)) / arr.length
  }))
})

const SEGMENTS = [
  seg(0, 0, 2.0, 'welcome back everyone'),
  seg(1, 2.0, 4.5, 'today we do something different')
]

function boxedStyle() {
  return CAPTION_STYLES.find((s) => s.boxOpacity > 0) ?? CAPTION_STYLES[0]
}

describe('caption segmentation', () => {
  it('segmentToWords uses word timings when present', () => {
    const words = segmentToWords(SEGMENTS[0])
    expect(words).toHaveLength(3)
    expect(words[0].text).toBe('welcome')
    expect(words[0].start).toBe(0)
    expect(words[2].end).toBeCloseTo(2.0, 5)
  })

  it('segmentToWords synthesizes even timings when a segment has no words', () => {
    const bare = { ...SEGMENTS[0], words: [] }
    const words = segmentToWords(bare)
    expect(words).toHaveLength(3)
    expect(words[1].start).toBeGreaterThan(0)
  })

  it('segmentToWords falls back to segment bounds on malformed word timings', () => {
    const broken = { ...SEGMENTS[0], words: [{ word: 'welcome' }, { word: 'back' }] as never[] }
    const words = segmentToWords(broken)
    expect(words).toHaveLength(3)
    for (const w of words) {
      expect(w.start).toBeGreaterThanOrEqual(SEGMENTS[0].startTime)
      expect(w.end).toBeLessThanOrEqual(SEGMENTS[0].endTime + 0.001)
    }
  })

  it('buildCues groups up to maxWordsPerCue words', () => {
    const cues = buildCues(SEGMENTS, { maxWordsPerCue: 2, maxCharsPerLine: 30, maxLines: 2 })
    expect(cues.length).toBeGreaterThanOrEqual(3)
    for (const cue of cues) {
      expect(cue.words.length).toBeLessThanOrEqual(2)
      expect(cue.endTime).toBeGreaterThan(cue.startTime)
    }
  })

  it('buildCues clamps to a trim window', () => {
    const cues = buildCues(SEGMENTS, { maxWordsPerCue: 1, maxCharsPerLine: 30, maxLines: 1, fromTime: 2.0, toTime: 4.5 })
    expect(cues.length).toBeGreaterThan(0)
    for (const cue of cues) {
      // a word overlapping the from-boundary is kept whole (no mid-word cuts)
      expect(cue.startTime).toBeGreaterThanOrEqual(1.3)
      expect(cue.endTime).toBeLessThanOrEqual(4.5 + 0.05)
    }
  })

  it('applies user text edits keyed by cue key', () => {
    const cues = buildCues(SEGMENTS, { maxWordsPerCue: 2, maxCharsPerLine: 40, maxLines: 2 })
    const key = cues[0].key
    const edited = buildCues(SEGMENTS, {
      maxWordsPerCue: 2, maxCharsPerLine: 40, maxLines: 2,
      textEdits: { [key]: 'WELCOME BACK!' }
    })
    expect(edited[0].text).toBe('WELCOME BACK!')
    expect(edited[0].lines.join(' ')).toBe('WELCOME BACK!')
    expect(edited[0].words.map((word) => word.text)).toEqual(['WELCOME', 'BACK!'])
    expect(edited[0].words.at(-1)?.end).toBeCloseTo(edited[0].endTime, 4)
  })

  it('keeps separately edited split child text in the resulting caption blocks', () => {
    const base = buildCues(SEGMENTS, { maxWordsPerCue: 2, maxCharsPerLine: 40, maxLines: 2 })
    const key = base[0].key
    const edited = buildCues(SEGMENTS, {
      maxWordsPerCue: 2, maxCharsPerLine: 40, maxLines: 2,
      splits: { [key]: 1 },
      textEdits: { [`${key}/a`]: 'Welcome!', [`${key}/b`]: 'back, folks' }
    })
    expect(edited.find((cue) => cue.key === `${key}/a`)?.text).toBe('Welcome!')
    expect(edited.find((cue) => cue.key === `${key}/b`)?.words.map((word) => word.text)).toEqual(['back,', 'folks'])
  })

  it('hides deleted blocks and adds persistent user-created caption blocks', () => {
    const base = buildCues(SEGMENTS, { maxWordsPerCue: 2, maxCharsPerLine: 40, maxLines: 2 })
    const cues = buildCues(SEGMENTS, {
      maxWordsPerCue: 2, maxCharsPerLine: 40, maxLines: 2,
      hiddenKeys: [base[0].key],
      duplicates: [{ key: 'manual:1', startTime: 4.6, endTime: 5.1, text: 'Custom caption' }]
    })
    expect(cues.find((cue) => cue.key === base[0].key)).toBeUndefined()
    expect(cues.find((cue) => cue.key === 'manual:1')?.text).toBe('Custom caption')
  })

  it('cueAt finds the active cue and null outside ranges', () => {
    const cues: CaptionCue[] = [
      { key: 'c0', startTime: 1, endTime: 2, text: 'a', words: [], lines: ['a'] },
      { key: 'c1', startTime: 3, endTime: 4, text: 'b', words: [], lines: ['b'] }
    ]
    expect(cueAt(cues, 1.5)?.key).toBe('c0')
    expect(cueAt(cues, 3.999)?.key).toBe('c1')
    expect(cueAt(cues, 2.5)).toBeNull()
    expect(cueAt(cues, 0)).toBeNull()
  })

  it('wordIndexAt tracks karaoke position inside a cue', () => {
    const cue: CaptionCue = {
      key: 'c', startTime: 0, endTime: 3, text: 'one two three', lines: [],
      words: [
        { text: 'one', start: 0, end: 1 },
        { text: 'two', start: 1, end: 2 },
        { text: 'three', start: 2, end: 3 }
      ]
    }
    expect(wordIndexAt(cue, 0.2)).toBe(0)
    expect(wordIndexAt(cue, 1.5)).toBe(1)
    expect(wordIndexAt(cue, 2.9)).toBe(2)
    expect(wordIndexAt(cue, 9)).toBe(2) // clamped
  })
})

describe('ASS document builder', () => {
  const cues: CaptionCue[] = [
    {
      key: 'c0', startTime: 0.5, endTime: 2.5, text: 'hello world', lines: ['hello world'],
      words: [
        { text: 'hello', start: 0.5, end: 1.5 },
        { text: 'world', start: 1.5, end: 2.5 }
      ]
    }
  ]

  it('emits script info with default 1080x1920 play res', () => {
    const doc = buildAssDocument(cues, { style: getCaptionStyle('classic') })
    expect(doc).toContain('PlayResX: 1080')
    expect(doc).toContain('PlayResY: 1920')
    expect(doc).toContain('[Events]')
    expect(doc).toContain('WrapStyle: 2')
  })

  it('uses karaoke tags when emphasis is on', () => {
    const doc = buildAssDocument(cues, { style: getCaptionStyle('classic'), emphasis: true })
    expect(doc).toContain('\\kf')
  })

  it('plain (non-emphasis) dialogue has no karaoke tags', () => {
    const doc = buildAssDocument(cues, { style: getCaptionStyle('classic'), emphasis: false })
    expect(doc).not.toContain('\\kf')
  })

  it('uses BorderStyle 3 (box) only for box styles, else 1 (outline)', () => {
    const boxed = buildAssDocument(cues, { style: boxedStyle() })
    expect(boxed).toMatch(/BorderStyle: 3|,3,/)

    const outlined = buildAssDocument(cues, { style: { ...getCaptionStyle('classic'), boxOpacity: 0 } })
    expect(outlined).toMatch(/,1,/)
  })

  it('encodes colors as ASS &HAABBGGRR (BGR order)', () => {
    const doc = buildAssDocument(cues, {
      style: { ...getCaptionStyle('classic'), textColor: '#FF0000', boxOpacity: 0 }
    })
    // #FF0000 (pure red) → BBGGRR = 0000FF
    expect(doc).toMatch(/&H[0-9A-F]{2}0000FF/i)
  })

  it('uppercases text when requested', () => {
    const doc = buildAssDocument(cues, { style: getCaptionStyle('classic'), uppercase: true, emphasis: false })
    expect(doc).toContain('HELLO WORLD')
  })

  it('times dialogue lines in ASS format and positions them', () => {
    const doc = buildAssDocument(cues, { style: getCaptionStyle('classic') })
    expect(doc).toMatch(/Dialogue: 0,0:00:00\.50,0:00:02\.50,Main/)
    expect(doc).toContain('{\\pos(540,')
  })

  it('scales font size from % of play height', () => {
    const doc = buildAssDocument(cues, { style: { ...getCaptionStyle('classic'), fontSizePct: 5 } })
    // 5% of 1920 = 96
    expect(doc).toMatch(/Main,Inter[^,]*,96,/)
  })
})

describe('SRT document builder', () => {
  it('renders numbered blocks with comma timestamps', () => {
    const cues: CaptionCue[] = [
      { key: 'c0', startTime: 0, endTime: 1.5, text: 'first', words: [], lines: ['first'] },
      { key: 'c1', startTime: 2, endTime: 3.25, text: 'second', words: [], lines: ['second'] }
    ]
    const doc = buildSrtDocument(cues)
    expect(doc).toContain('1\n00:00:00,000 --> 00:00:01,500\nfirst')
    expect(doc).toContain('2\n00:00:02,000 --> 00:00:03,250\nsecond')
  })
})

describe('caption style catalog', () => {
  it('exposes exactly fifty distinct original presets across all ten categories', () => {
    expect(CAPTION_STYLES.length).toBe(50)
    const ids = new Set(CAPTION_STYLES.map((s) => s.id))
    expect(ids.size).toBe(50)
    const categories = new Set(CAPTION_STYLES.map((s) => s.category))
    expect(categories.size).toBe(10)
    const styleFingerprints = new Set(CAPTION_STYLES.map((s) => JSON.stringify([s.fontFamily, s.fontWeight, s.fontSizePct, s.textColor, s.highlightColor, s.outlineWidth, s.shadow, s.boxColor, s.boxOpacity, s.maxWordsPerCue, s.maxCharsPerLine, s.positionY, s.animationIn, s.wordAnimation, s.capitalization, s.alignment, s.letterSpacing])))
    expect(styleFingerprints.size).toBe(50)
    expect(CAPTION_STYLES.every((s) => s.animationIn && s.animationOut && s.wordAnimation && s.emphasisBehavior && s.capitalization && s.safeAreaPosition)).toBe(true)
  })

  it('getCaptionStyle falls back for unknown ids', () => {
    const style = getCaptionStyle('does-not-exist')
    expect(style).toBeDefined()
    expect(CAPTION_STYLES.some((s) => s.id === style.id)).toBe(true)
  })

  it('lists licensed bundled font faces with existing assets and real supported weights', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    for (const face of CAPTION_FONTS) {
      expect(face.license).toContain('Open Font License')
      expect(fs.existsSync(`resources/fonts/${face.file}`), face.file).toBe(true)
    }
    expect(CAPTION_FONTS.some((face) => face.family === 'IBM Plex Sans Condensed' && face.weight === 600)).toBe(true)
    expect(CAPTION_FONTS.some((face) => face.family === 'Source Serif 4' && face.weight === 700)).toBe(true)
  })

  it('uses the selected font family and weight for exported captions', () => {
    const cue: CaptionCue = { key: 'font-check', startTime: 0, endTime: 1, text: 'A caption', words: [], lines: ['A caption'] }
    const doc = buildAssDocument([cue], { style: { ...getCaptionStyle('classic'), fontFile: 'IBMPlexSansCondensed-SemiBold.ttf', fontFamily: 'IBM Plex Sans Condensed', fontWeight: 600 } })
    expect(doc).toContain('Style: Main,IBM Plex Sans Condensed,')
    expect(doc).toContain(',-1,0,0,0,100,100')
  })

  it('builds valid caption documents for every preset at 9:16, 16:9, 1:1, and 4:5 output geometry', () => {
    const cue: CaptionCue = { key: 'matrix', startTime: 0, endTime: 1.5, text: 'A quick important test', words: [
      { text: 'A', start: 0, end: 0.2 }, { text: 'quick', start: 0.2, end: 0.55 },
      { text: 'important', start: 0.55, end: 1 }, { text: 'test', start: 1, end: 1.5 }
    ], lines: ['A quick important test'] }
    const geometries = [[720, 1280], [1280, 720], [720, 720], [864, 1080]]
    const scales = [1, 1.5, 2, 3]
    let documents = 0
    for (const preset of CAPTION_STYLES) for (let geometry = 0; geometry < geometries.length; geometry++) for (const scale of scales) {
      const [w, h] = geometries[geometry].map((side) => Math.round(side * scale))
      const ass = buildAssDocument([cue], { style: preset, playResX: w, playResY: h })
      expect(ass).toContain(`PlayResX: ${w}`)
      expect(ass).toContain(`PlayResY: ${h}`)
      expect(ass).toContain('Dialogue:')
      expect(ass).not.toMatch(/NaN|undefined/)
      documents++
    }
    expect(documents).toBe(800)
  })
})

describe('text layer preview and render parity', () => {
  const layer: TextLayer = {
    id: 'title', text: 'Phase eight title', startTime: 2, endTime: 6, x: 0.2, y: 0.3,
    scale: 1, rotation: 0, opacity: 1, fontFamily: 'Inter', fontWeight: 700, fontSize: 64,
    color: '#FFFFFF', backgroundColor: '#102030', backgroundOpacity: 0.5,
    animationIn: 'rise', animationOut: 'fade',
    keyframes: [{ time: 4, x: 0.8, y: 0.7, scale: 1.4, rotation: 12, opacity: 0.8 }]
  }

  it('resolves animated keyframes on the same source-time clock as the editor', () => {
    const atMidpoint = textLayerAppearanceAt(layer, 3)
    expect(atMidpoint.x).toBeCloseTo(0.5)
    expect(atMidpoint.y).toBeGreaterThan(0.48)
    expect(atMidpoint.scale).toBeGreaterThan(1)
    expect(atMidpoint.rotation).toBeCloseTo(6)
    expect(textLayerAppearanceAt(layer, 6).opacity).toBe(0)
  })

  it('generates styled animated ASS events on remapped kept-media time', () => {
    const ass = buildTextLayersAssDocument([layer], [
      { sourceStart: 0, sourceEnd: 3.5, outputStart: 0 },
      { sourceStart: 4, sourceEnd: 8, outputStart: 3.5 }
    ], 720, 1280)
    expect(ass).toContain('Inter,76,')
    expect(ass).toContain('Phase eight title')
    expect(ass).toContain('\\move(')
    expect(ass).toContain('\\t(')
    expect(ass).toContain('0:00:03.50')
    expect(ass).not.toContain('0:00:04.00')
  })
})
