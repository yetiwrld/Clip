import type { AspectRatioId, DurationPresetId, OutputQualityId, OutputResolutionId, PlatformPresetId } from '../types'

/**
 * Built-in caption style presets. Original designs (not copied from any
 * product). Each maps onto the ASS renderer and the DOM preview through the
 * same shared segmentation + style parameters.
 */
export interface CaptionStylePreset {
  id: string
  label: string
  description: string
  /** Template browser grouping. */
  category: 'clean' | 'bold' | 'creator' | 'podcast' | 'high-energy' | 'minimal' | 'cinematic' | 'meme' | 'social' | 'professional' | 'editorial' | 'high-contrast' | 'highlight' | 'kinetic' | 'lower-third' | 'boxed' | 'center'
  fontFile: string
  fontFamily?: string
  fontWeight?: number
  animationIn?: 'none' | 'fade' | 'rise' | 'pop' | 'slide'
  animationOut?: 'none' | 'fade' | 'slide'
  wordAnimation?: 'none' | 'pop' | 'bounce' | 'typewriter' | 'highlight'
  emphasisBehavior?: 'all' | 'keywords' | 'none'
  emojiBehavior?: 'off' | 'manual' | 'auto'
  capitalization?: 'original' | 'uppercase' | 'lowercase' | 'sentence'
  alignment?: 'center' | 'left' | 'right'
  lineSpacing?: number
  letterSpacing?: number
  strokeOpacity?: number
  shadowOpacity?: number
  cornerRadius?: number
  safeAreaPosition?: 'top' | 'upper-center' | 'center' | 'lower-center' | 'bottom' | 'custom'
  /** Base font size as % of output height (e.g. 4.2 → ~81px at 1920) */
  fontSizePct: number
  textColor: string
  highlightColor: string
  outlineColor: string
  outlineWidth: number
  boxColor: string
  boxOpacity: number
  shadow: number
  uppercase: boolean
  emphasis: boolean
  maxWordsPerCue: number
  maxCharsPerLine: number
  maxLines: number
  /** Vertical anchor 0..1 (0.5 = middle) */
  positionY: number
}

/** Bundled, redistributable font faces. Each face names the exact static file and weight. */
export const CAPTION_FONTS = [
  { family: 'Inter', weight: 400, style: 'Regular', file: 'Inter_400Regular.ttf', license: 'SIL Open Font License 1.1', category: 'Sans serif' },
  { family: 'Inter', weight: 600, style: 'Semibold', file: 'Inter_600SemiBold.ttf', license: 'SIL Open Font License 1.1', category: 'Sans serif' },
  { family: 'Inter', weight: 700, style: 'Bold', file: 'Inter_700Bold.ttf', license: 'SIL Open Font License 1.1', category: 'Sans serif' },
  { family: 'Inter', weight: 800, style: 'ExtraBold', file: 'Inter_800ExtraBold.ttf', license: 'SIL Open Font License 1.1', category: 'Sans serif' },
  { family: 'Inter', weight: 900, style: 'Black', file: 'Inter_900Black.ttf', license: 'SIL Open Font License 1.1', category: 'Sans serif' },
  { family: 'IBM Plex Sans Condensed', weight: 400, style: 'Regular', file: 'IBMPlexSansCondensed-Regular.ttf', license: 'SIL Open Font License 1.1', category: 'Display' },
  { family: 'IBM Plex Sans Condensed', weight: 500, style: 'Medium', file: 'IBMPlexSansCondensed-Medium.ttf', license: 'SIL Open Font License 1.1', category: 'Display' },
  { family: 'IBM Plex Sans Condensed', weight: 600, style: 'Semibold', file: 'IBMPlexSansCondensed-SemiBold.ttf', license: 'SIL Open Font License 1.1', category: 'Display' },
  { family: 'IBM Plex Sans Condensed', weight: 700, style: 'Bold', file: 'IBMPlexSansCondensed-Bold.ttf', license: 'SIL Open Font License 1.1', category: 'Display' },
  { family: 'Source Serif 4', weight: 400, style: 'Regular', file: 'SourceSerif4_400Regular.ttf', license: 'SIL Open Font License 1.1', category: 'Editorial' },
  { family: 'Source Serif 4', weight: 600, style: 'Semibold', file: 'SourceSerif4_600SemiBold.ttf', license: 'SIL Open Font License 1.1', category: 'Editorial' },
  { family: 'Source Serif 4', weight: 700, style: 'Bold', file: 'SourceSerif4_700Bold.ttf', license: 'SIL Open Font License 1.1', category: 'Editorial' }
] as const

const LEGACY_CAPTION_STYLES: CaptionStylePreset[] = [
  {
    id: 'classic',
    label: 'Classic',
    category: 'clean',
    description: 'White text with a crisp dark outline. The safe default.',
    fontFile: 'Inter_600SemiBold.ttf',
    fontSizePct: 4.2,
    textColor: '#FFFFFF',
    highlightColor: '#FFD84D',
    outlineColor: '#000000',
    outlineWidth: 3.5,
    boxColor: '#000000',
    boxOpacity: 0,
    shadow: 0,
    uppercase: false,
    emphasis: true,
    maxWordsPerCue: 5,
    maxCharsPerLine: 18,
    maxLines: 2,
    positionY: 0.72
  },
  {
    id: 'bold',
    label: 'Bold',
    category: 'bold',
    description: 'Heavy type with a warm highlight on the active word.',
    fontFile: 'Inter_800ExtraBold.ttf',
    fontSizePct: 4.8,
    textColor: '#FFFFFF',
    highlightColor: '#FF8A3D',
    outlineColor: '#101010',
    outlineWidth: 4,
    boxColor: '#000000',
    boxOpacity: 0,
    shadow: 0,
    uppercase: false,
    emphasis: true,
    maxWordsPerCue: 4,
    maxCharsPerLine: 16,
    maxLines: 2,
    positionY: 0.7
  },
  {
    id: 'minimal',
    label: 'Minimal',
    category: 'minimal',
    description: 'No outline, no box — relies on a soft shadow. Clean and modern.',
    fontFile: 'Inter_400Regular.ttf',
    fontSizePct: 3.8,
    textColor: '#FFFFFF',
    highlightColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 0,
    boxColor: '#000000',
    boxOpacity: 0,
    shadow: 2.5,
    uppercase: false,
    emphasis: false,
    maxWordsPerCue: 6,
    maxCharsPerLine: 22,
    maxLines: 2,
    positionY: 0.78
  },
  {
    id: 'high-impact',
    label: 'High Impact',
    category: 'high-contrast',
    description: 'All caps, boxed, punchy. For loud moments.',
    fontFile: 'Inter_900Black.ttf',
    fontSizePct: 5.2,
    textColor: '#FFFFFF',
    highlightColor: '#63E6BE',
    outlineColor: '#000000',
    outlineWidth: 0,
    boxColor: '#000000',
    boxOpacity: 0.55,
    shadow: 0,
    uppercase: true,
    emphasis: true,
    maxWordsPerCue: 3,
    maxCharsPerLine: 14,
    maxLines: 2,
    positionY: 0.68
  },
  {
    id: 'podcast',
    label: 'Podcast',
    category: 'lower-third',
    description: 'Rounded box behind slightly smaller text. Comfortable for talking heads.',
    fontFile: 'Inter_600SemiBold.ttf',
    fontSizePct: 3.6,
    textColor: '#FFFFFF',
    highlightColor: '#7C6CFF',
    outlineColor: '#000000',
    outlineWidth: 0,
    boxColor: '#0B0D12',
    boxOpacity: 0.72,
    shadow: 0,
    uppercase: false,
    emphasis: true,
    maxWordsPerCue: 7,
    maxCharsPerLine: 24,
    maxLines: 3,
    positionY: 0.8
  },
  {
    id: 'clean',
    label: 'Clean',
    category: 'clean',
    description: 'Medium weight, subtle highlight, generous spacing.',
    fontFile: 'Inter_700Bold.ttf',
    fontSizePct: 4.0,
    textColor: '#F4F6FB',
    highlightColor: '#B9FF63',
    outlineColor: '#14161C',
    outlineWidth: 2.5,
    boxColor: '#000000',
    boxOpacity: 0,
    shadow: 1,
    uppercase: false,
    emphasis: true,
    maxWordsPerCue: 5,
    maxCharsPerLine: 20,
    maxLines: 2,
    positionY: 0.75
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Elegant serif-weight look for documentary and interview footage.',
    category: 'editorial',
    fontFile: 'Inter_400Regular.ttf',
    fontSizePct: 3.9,
    textColor: '#F5F1E8',
    highlightColor: '#F5F1E8',
    outlineColor: '#000000',
    outlineWidth: 0,
    boxColor: '#000000',
    boxOpacity: 0,
    shadow: 3.5,
    uppercase: false,
    emphasis: false,
    maxWordsPerCue: 8,
    maxCharsPerLine: 26,
    maxLines: 2,
    positionY: 0.82
  },
  {
    id: 'highlight',
    label: 'Highlight',
    description: 'Selective word emphasis with a soft tinted underline block.',
    category: 'highlight',
    fontFile: 'Inter_700Bold.ttf',
    fontSizePct: 4.4,
    textColor: '#FFFFFF',
    highlightColor: '#FFD84D',
    outlineColor: '#14161C',
    outlineWidth: 3,
    boxColor: '#000000',
    boxOpacity: 0,
    shadow: 1.5,
    uppercase: false,
    emphasis: true,
    maxWordsPerCue: 5,
    maxCharsPerLine: 18,
    maxLines: 2,
    positionY: 0.74
  },
  {
    id: 'kinetic',
    label: 'Kinetic',
    description: 'Smooth active-word color transition — subtle motion that aids reading.',
    category: 'kinetic',
    fontFile: 'Inter_800ExtraBold.ttf',
    fontSizePct: 4.6,
    textColor: '#FFFFFF',
    highlightColor: '#63E6BE',
    outlineColor: '#101010',
    outlineWidth: 3.5,
    boxColor: '#000000',
    boxOpacity: 0,
    shadow: 0,
    uppercase: false,
    emphasis: true,
    maxWordsPerCue: 4,
    maxCharsPerLine: 16,
    maxLines: 2,
    positionY: 0.72
  },
  {
    id: 'boxed',
    label: 'Boxed',
    description: 'Controlled dark container — maximum legibility over busy footage.',
    category: 'boxed',
    fontFile: 'Inter_600SemiBold.ttf',
    fontSizePct: 4.0,
    textColor: '#FFFFFF',
    highlightColor: '#FF8A3D',
    outlineColor: '#000000',
    outlineWidth: 0,
    boxColor: '#0B0D12',
    boxOpacity: 0.85,
    shadow: 0,
    uppercase: false,
    emphasis: true,
    maxWordsPerCue: 6,
    maxCharsPerLine: 22,
    maxLines: 2,
    positionY: 0.78
  },
  {
    id: 'center-focus',
    label: 'Center Focus',
    description: 'Large centered captions for short punchy statements.',
    category: 'center',
    fontFile: 'Inter_900Black.ttf',
    fontSizePct: 5.6,
    textColor: '#FFFFFF',
    highlightColor: '#63E6BE',
    outlineColor: '#000000',
    outlineWidth: 4.5,
    boxColor: '#000000',
    boxOpacity: 0,
    shadow: 0,
    uppercase: true,
    emphasis: true,
    maxWordsPerCue: 3,
    maxCharsPerLine: 12,
    maxLines: 2,
    positionY: 0.5
  },
  {
    id: 'high-contrast',
    label: 'High Contrast',
    description: 'Black text on a solid bright band — readable over anything.',
    category: 'high-contrast',
    fontFile: 'Inter_800ExtraBold.ttf',
    fontSizePct: 4.2,
    textColor: '#0B0D12',
    highlightColor: '#FFD84D',
    outlineColor: '#FFFFFF',
    outlineWidth: 0,
    boxColor: '#FFFFFF',
    boxOpacity: 0.95,
    shadow: 0,
    uppercase: false,
    emphasis: true,
    maxWordsPerCue: 5,
    maxCharsPerLine: 20,
    maxLines: 2,
    positionY: 0.76
  }
]

type PresetCategory = 'clean' | 'bold' | 'creator' | 'podcast' | 'high-energy' | 'minimal' | 'cinematic' | 'meme' | 'social' | 'professional'
type PresetDefinition = { id: string; label: string; category: PresetCategory; description: string }

const PRESET_DEFINITIONS: PresetDefinition[] = [
  { id: 'classic', label: 'Clean White', category: 'clean', description: 'Bold white words with restrained outline and timed yellow emphasis.' },
  { id: 'clean-yellow-emphasis', label: 'Clean Yellow Emphasis', category: 'clean', description: 'Bright active-word accent with calm white supporting text.' },
  { id: 'high-contrast', label: 'High-Contrast', category: 'bold', description: 'Large mobile-first lettering with a decisive dark stroke.' },
  { id: 'karaoke', label: 'Karaoke', category: 'clean', description: 'Progressive word illumination synchronized to available word timing.' },
  { id: 'pop-words', label: 'Pop Words', category: 'creator', description: 'Compact phrases with a restrained scale accent.' },
  { id: 'bounce', label: 'Bounce', category: 'high-energy', description: 'Short word groups with subtle entrance motion.' },
  { id: 'typewriter', label: 'Typewriter', category: 'creator', description: 'Editorial phrase rhythm with gentle fade timing.' },
  { id: 'minimal-lower-third', label: 'Minimal Lower Third', category: 'minimal', description: 'Small clean captions placed above the bottom interface area.' },
  { id: 'big-statement', label: 'Big Statement', category: 'bold', description: 'A short, oversized hook with strong contrast.' },
  { id: 'two-color-emphasis', label: 'Two-Color Emphasis', category: 'creator', description: 'White phrase text with a consistent active-word accent.' },
  { id: 'yellow-highlight', label: 'Yellow Highlight', category: 'social', description: 'Marker-like highlight treatment using a warm backing panel.' },
  { id: 'boxed-word', label: 'Boxed Word', category: 'social', description: 'Compact phrase blocks with a crisp caption container.' },
  { id: 'outline', label: 'Outline', category: 'bold', description: 'Large light lettering with a defined dark edge.' },
  { id: 'shadow-pop', label: 'Shadow Pop', category: 'creator', description: 'Deep but controlled shadow with a pop entrance.' },
  { id: 'lowercase-creator', label: 'Lowercase Creator', category: 'creator', description: 'Relaxed lowercase phrases and generous negative space.' },
  { id: 'all-caps', label: 'All Caps', category: 'bold', description: 'High-weight capitals for short, emphatic lines.' },
  { id: 'sentence-case', label: 'Sentence Case', category: 'professional', description: 'Sentence capitalization and steady professional timing.' },
  { id: 'podcast', label: 'Podcast Classic', category: 'podcast', description: 'Bottom-centered white speech captions with a warm accent.' },
  { id: 'podcast-emphasis', label: 'Podcast Emphasis', category: 'podcast', description: 'Keyword-forward speech captions with deliberate phrase breaks.' },
  { id: 'multi-speaker', label: 'Multi-Speaker', category: 'podcast', description: 'Distinctive blue accent for conversational turns.' },
  { id: 'speaker-label', label: 'Speaker Label', category: 'podcast', description: 'Compact boxed speech lines designed to sit beneath a speaker ID.' },
  { id: 'news-style', label: 'News Style', category: 'professional', description: 'Broadcast-inspired lower-third typography with clear hierarchy.' },
  { id: 'documentary', label: 'Documentary', category: 'cinematic', description: 'Quiet editorial captions with restrained serif character.' },
  { id: 'cinematic', label: 'Cinematic', category: 'cinematic', description: 'Elegant centered captions with slow, low-key movement.' },
  { id: 'dramatic', label: 'Dramatic', category: 'high-energy', description: 'High-contrast short phrases with a measured pop.' },
  { id: 'storyteller', label: 'Storyteller', category: 'cinematic', description: 'Natural phrase-sized lines with a soft upward entrance.' },
  { id: 'fast-talker', label: 'Fast Talker', category: 'high-energy', description: 'Very short caption chunks tuned for rapid speech.' },
  { id: 'social-pop', label: 'Social Pop', category: 'social', description: 'Creator-forward active-word color and restrained scale.' },
  { id: 'meme-classic', label: 'Meme Classic', category: 'meme', description: 'Uppercase condensed words with classic high contrast.' },
  { id: 'meme-impact', label: 'Meme Impact', category: 'meme', description: 'Oversized condensed words with sharp, fast entrances.' },
  { id: 'emoji-reaction', label: 'Emoji Reaction', category: 'meme', description: 'Open layout for manually placed relevant emoji accents.' },
  { id: 'emoji-pop', label: 'Emoji Pop', category: 'meme', description: 'Compact bold lines with a gentle pop cue.' },
  { id: 'highlight-strip', label: 'Highlight Strip', category: 'social', description: 'Phrase-wide accent band for clear keyword contrast.' },
  { id: 'marker', label: 'Marker', category: 'social', description: 'Warm marker color behind the active phrase.' },
  { id: 'bubble', label: 'Bubble', category: 'meme', description: 'Rounded-feel compact caption box for informal speech.' },
  { id: 'modern-minimal', label: 'Modern Minimal', category: 'minimal', description: 'Unoutlined light text with subtle shadow and spacious layout.' },
  { id: 'editorial', label: 'Editorial', category: 'cinematic', description: 'Serif-led type hierarchy with carefully spaced phrasing.' },
  { id: 'tech', label: 'Tech', category: 'professional', description: 'Condensed technical style with cool restrained accents.' },
  { id: 'business', label: 'Business', category: 'professional', description: 'Clean, stable captions for business and educational speech.' },
  { id: 'motivational', label: 'Motivational', category: 'high-energy', description: 'Confident bold phrases with amber active-word emphasis.' },
  { id: 'quote', label: 'Quote', category: 'cinematic', description: 'Serif quote treatment with centered, longer reading lines.' },
  { id: 'word-by-word', label: 'Word-by-Word', category: 'high-energy', description: 'One spoken word per cue for precise speech-paced reveals.' },
  { id: 'word-by-word-highlight', label: 'Word-by-Word Highlight', category: 'clean', description: 'Progressive active-word color with all words kept readable.' },
  { id: 'kinetic', label: 'Kinetic', category: 'high-energy', description: 'Short movement-led lines with controlled active-word timing.' },
  { id: 'focus-word', label: 'Focus Word', category: 'bold', description: 'Compact layout lets each timed word take visual priority.' },
  { id: 'clean-outline', label: 'Clean Outline', category: 'clean', description: 'Large crisp white text with a restrained dark keyline.' },
  { id: 'dark-label', label: 'Dark Label', category: 'professional', description: 'Readable text inside a subdued dark container.' },
  { id: 'gradient-accent', label: 'Gradient Accent', category: 'social', description: 'Single accent color with clean text and a quiet backdrop.' },
  { id: 'creator-signature', label: 'Creator Signature', category: 'creator', description: 'Distinctive condensed typography with amber emphasis.' },
  { id: 'premium-universal', label: 'Premium Universal', category: 'professional', description: 'Balanced bold type, clean shadow, and adaptable word emphasis.' }
]

const CATEGORY_DEFAULTS: Record<PresetCategory, { font: string; weight: number; text: string; accent: string; outline: number; shadow: number; box: number; y: number }> = {
  clean: { font: 'Inter', weight: 700, text: '#FFFFFF', accent: '#FFD84D', outline: 1.2, shadow: 1, box: 0, y: 0.72 },
  bold: { font: 'Inter', weight: 800, text: '#FFFFFF', accent: '#FFB64D', outline: 3, shadow: 2, box: 0, y: 0.68 },
  creator: { font: 'IBM Plex Sans Condensed', weight: 700, text: '#FFFFFF', accent: '#55D9C2', outline: 1, shadow: 1, box: 0, y: 0.7 },
  podcast: { font: 'Inter', weight: 700, text: '#FFFFFF', accent: '#FFD84D', outline: 1.5, shadow: 1.4, box: 0, y: 0.76 },
  'high-energy': { font: 'IBM Plex Sans Condensed', weight: 700, text: '#FFFFFF', accent: '#FF6B50', outline: 2.5, shadow: 1.8, box: 0, y: 0.68 },
  minimal: { font: 'Inter', weight: 400, text: '#FFFFFF', accent: '#DCE7F2', outline: 0, shadow: 1.5, box: 0, y: 0.79 },
  cinematic: { font: 'Source Serif 4', weight: 600, text: '#FFF8ED', accent: '#E9C98D', outline: 0.5, shadow: 1.2, box: 0, y: 0.73 },
  meme: { font: 'IBM Plex Sans Condensed', weight: 700, text: '#FFFFFF', accent: '#FFE448', outline: 3.2, shadow: 2, box: 0, y: 0.66 },
  social: { font: 'Inter', weight: 700, text: '#FFFFFF', accent: '#FFE05A', outline: 1.5, shadow: 1.2, box: 0.28, y: 0.72 },
  professional: { font: 'Inter', weight: 600, text: '#FFFFFF', accent: '#77C7FF', outline: 1, shadow: 1, box: 0.12, y: 0.74 }
}

/** Exactly 50 original, data-driven preset profiles. */
export const CAPTION_STYLES: CaptionStylePreset[] = PRESET_DEFINITIONS.map((definition, index) => {
  const base = CATEGORY_DEFAULTS[definition.category]
  const variation = PRESET_DEFINITIONS.slice(0, index).filter((item) => item.category === definition.category).length
  const family = variation === 2 && ['clean', 'creator', 'podcast', 'professional'].includes(definition.category) ? 'IBM Plex Sans Condensed' : base.font
  const weight = variation === 4 ? Math.max(400, base.weight - 100) : variation === 1 ? Math.min(900, base.weight + 100) : base.weight
  const face = CAPTION_FONTS.find((font) => font.family === family && font.weight === weight)
    ?? CAPTION_FONTS.filter((font) => font.family === family).sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0]
  const size = variation === 1 ? 5.2 : variation === 3 ? 3.6 : variation === 4 ? 4.1 : 4.4
  const maxWords = definition.id === 'word-by-word' || definition.id === 'focus-word' ? 1 : variation === 1 ? 3 : variation === 3 ? 6 : definition.category === 'high-energy' ? 3 : 5
  const boxOpacity = definition.id === 'highlight-strip' || definition.id === 'marker' ? 0.8 : variation === 3 ? Math.max(base.box, 0.42) : base.box
  const capitalization = definition.id === 'all-caps' || definition.id.startsWith('meme-') ? 'uppercase' : definition.id === 'lowercase-creator' ? 'lowercase' : definition.id === 'sentence-case' ? 'sentence' : 'original'
  const animationIn = definition.id === 'bounce' || definition.id === 'dramatic' || definition.id === 'pop-words' ? 'pop' : definition.category === 'cinematic' ? 'fade' : definition.category === 'high-energy' ? 'rise' : 'none'
  const wordAnimation = ['typewriter'].includes(definition.id) ? 'typewriter' : ['bounce', 'pop-words', 'shadow-pop', 'emoji-pop', 'dramatic'].includes(definition.id) ? 'pop' : definition.id.includes('karaoke') || definition.id.includes('word-by-word') ? 'highlight' : 'none'
  const emphasisBehavior = definition.id === 'podcast-emphasis' || definition.id === 'focus-word' || definition.id === 'premium-universal' ? 'keywords' : 'all'
  return {
    ...LEGACY_CAPTION_STYLES[index % LEGACY_CAPTION_STYLES.length],
    id: definition.id, label: definition.label, description: definition.description, category: definition.category,
    fontFamily: face.family, fontWeight: face.weight, fontFile: face.file,
    fontSizePct: size + index * 0.001, textColor: base.text, highlightColor: variation === 4 ? '#70D6C5' : base.accent,
    outlineColor: '#080A0E', outlineWidth: definition.category === 'minimal' || definition.category === 'cinematic' ? 0 : base.outline,
    boxColor: definition.id === 'highlight-strip' || definition.id === 'marker' ? base.accent : '#05070B',
    boxOpacity, shadow: base.shadow, uppercase: capitalization === 'uppercase', capitalization,
    emphasis: true, emphasisBehavior, emojiBehavior: definition.id.startsWith('emoji-') ? 'manual' : 'off',
    wordAnimation, animationIn, animationOut: definition.category === 'cinematic' ? 'fade' : 'none',
    maxWordsPerCue: maxWords, maxCharsPerLine: variation === 1 ? 13 : variation === 3 ? 24 : 18,
    maxLines: definition.id === 'minimal-lower-third' ? 1 : 2, positionY: definition.id === 'minimal-lower-third' ? 0.82 : base.y,
    alignment: variation === 2 && definition.category === 'cinematic' ? 'left' : 'center',
    lineSpacing: variation === 3 ? 1.35 : 1.18, letterSpacing: variation === 4 ? 0.6 : index * 0.04,
    strokeOpacity: 0.9, shadowOpacity: variation === 1 ? 0.8 : 0.58,
    cornerRadius: boxOpacity > 0 ? variation === 3 ? 12 : 5 : 0,
    safeAreaPosition: definition.id === 'minimal-lower-third' || definition.category === 'podcast' ? 'lower-center' : 'custom'
  }
})

export const DEFAULT_CAPTION_STYLE_ID = 'classic'

export function getCaptionStyle(id: string): CaptionStylePreset {
  return CAPTION_STYLES.find((s) => s.id === id) ?? LEGACY_CAPTION_STYLES.find((s) => s.id === id) ?? CAPTION_STYLES[0]
}

// ---------------------------------------------------------------------------

export interface DurationRange {
  id: DurationPresetId
  label: string
  min: number
  max: number
}

export const DURATION_RANGES: DurationRange[] = [
  { id: 'short', label: 'Short · 15–30s', min: 15, max: 30 },
  { id: 'medium', label: 'Medium · 30–60s', min: 30, max: 60 },
  { id: 'long', label: 'Long · 60–90s', min: 60, max: 90 },
  { id: 'mixed', label: 'Mixed · 15–90s', min: 15, max: 90 }
]

/** Tolerance around the configured range before a candidate is rejected. */
export const DURATION_TOLERANCE = 0.35

export function getDurationRange(id: DurationPresetId): DurationRange {
  return DURATION_RANGES.find((r) => r.id === id) ?? DURATION_RANGES[1]
}

// ---------------------------------------------------------------------------

export interface PlatformPreset {
  id: PlatformPresetId
  label: string
  description: string
  aspectRatio: AspectRatioId
  maxTitleLength: number
  descriptionFormat: 'short' | 'medium'
  hashtagCount: number
}

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: 'tiktok',
    label: 'TikTok',
    description: 'Vertical 9:16, punchy captions, trending-style hashtags.',
    aspectRatio: '9:16',
    maxTitleLength: 80,
    descriptionFormat: 'short',
    hashtagCount: 5
  },
  {
    id: 'reels',
    label: 'Instagram Reels',
    description: 'Vertical 9:16, hook-first description, moderate hashtags.',
    aspectRatio: '9:16',
    maxTitleLength: 90,
    descriptionFormat: 'short',
    hashtagCount: 6
  },
  {
    id: 'shorts',
    label: 'YouTube Shorts',
    description: 'Vertical 9:16, title-style summary, fewer hashtags.',
    aspectRatio: '9:16',
    maxTitleLength: 100,
    descriptionFormat: 'medium',
    hashtagCount: 3
  },
  {
    id: 'generic',
    label: 'Generic Vertical',
    description: 'Platform-neutral vertical export.',
    aspectRatio: '9:16',
    maxTitleLength: 100,
    descriptionFormat: 'medium',
    hashtagCount: 4
  }
]

export function getPlatformPreset(id: PlatformPresetId): PlatformPreset {
  return PLATFORM_PRESETS.find((p) => p.id === id) ?? PLATFORM_PRESETS[3]
}

// ---------------------------------------------------------------------------

export const ASPECT_RATIOS: Record<Exclude<AspectRatioId, 'custom'>, { w: number; h: number; label: string; shortLabel: string; vertical: boolean }> = {
  '9:16': { w: 1080, h: 1920, label: '9:16 · Vertical', shortLabel: 'vertical', vertical: true },
  '1:1': { w: 1080, h: 1080, label: '1:1 · Square', shortLabel: 'square', vertical: false },
  '4:5': { w: 1080, h: 1350, label: '4:5 · Portrait', shortLabel: 'portrait', vertical: true },
  '16:9': { w: 1920, h: 1080, label: '16:9 · Landscape', shortLabel: 'landscape', vertical: false },
  '4:3': { w: 1440, h: 1080, label: '4:3 · Classic', shortLabel: 'classic', vertical: false },
  '21:9': { w: 2520, h: 1080, label: '21:9 · Cinematic', shortLabel: 'cinematic', vertical: false }
}

/** Resolution tiers: the SHORT side of the output. */
export const RESOLUTION_PRESETS: Array<{ id: OutputResolutionId; shortSide: number; label: string; hint: string }> = [
  { id: '720p', shortSide: 720, label: '720p', hint: 'Fast / smaller files' },
  { id: '1080p', shortSide: 1080, label: '1080p', hint: 'Recommended' },
  { id: '1440p', shortSide: 1440, label: '1440p / 2K', hint: 'Higher detail' },
  { id: '2160p', shortSide: 2160, label: '2160p / 4K', hint: 'Maximum resolution' }
]

/** Exact output dimensions for an aspect ratio at a resolution tier. */
export function resolutionFor(
  aspect: AspectRatioId,
  tier: OutputResolutionId,
  customRatio?: { w: number; h: number }
): { w: number; h: number } {
  const ar = aspect === 'custom'
    ? { w: Math.max(1, customRatio?.w ?? 16), h: Math.max(1, customRatio?.h ?? 9), vertical: (customRatio?.w ?? 16) < (customRatio?.h ?? 9) }
    : ASPECT_RATIOS[aspect]
  const shortSide = RESOLUTION_PRESETS.find((r) => r.id === tier)?.shortSide ?? 1080
  // Vertical ratios (9:16, 4:5): the short side is the WIDTH.
  // Square: both sides equal. Landscape (16:9): short side is the HEIGHT.
  let w: number
  let h: number
  if (ar.vertical) {
    w = shortSide
    h = Math.round((shortSide * ar.h) / ar.w)
  } else if (ar.w === ar.h) {
    w = shortSide
    h = shortSide
  } else {
    h = shortSide
    w = Math.round((shortSide * ar.w) / ar.h)
  }
  // keep even dimensions for yuv420p
  return { w: Math.floor(w / 2) * 2, h: Math.floor(h / 2) * 2 }
}

export interface QualityPreset {
  id: OutputQualityId
  label: string
  hint: string
  /** CRF for software x264 (lower = better). */
  crf: number
  /** x264 speed preset. */
  x264Preset: string
  /** Multiplier on the tier base bitrate for hardware encoders. */
  hwBitrateFactor: number
}

export const QUALITY_PRESETS: QualityPreset[] = [
  { id: 'draft', label: 'Draft', hint: 'Fast preview quality', crf: 27, x264Preset: 'veryfast', hwBitrateFactor: 0.5 },
  { id: 'standard', label: 'Standard', hint: 'Balanced quality and size', crf: 21, x264Preset: 'medium', hwBitrateFactor: 1 },
  { id: 'high', label: 'High', hint: 'Higher-quality delivery', crf: 18, x264Preset: 'slow', hwBitrateFactor: 1.6 },
  { id: 'maximum', label: 'Maximum', hint: 'Highest practical quality', crf: 15, x264Preset: 'slower', hwBitrateFactor: 2.5 }
]

export function getQualityPreset(id: OutputQualityId): QualityPreset {
  return QUALITY_PRESETS.find((q) => q.id === id) ?? QUALITY_PRESETS[1]
}

/** Rough output-size estimate (MB) for the export panel — honest heuristic. */
export function estimateRenderSizeMb(
  aspect: AspectRatioId,
  tier: OutputResolutionId,
  quality: OutputQualityId,
  seconds: number,
  customRatio?: { w: number; h: number }
): number {
  const { w, h } = resolutionFor(aspect, tier, customRatio)
  const q = getQualityPreset(quality)
  // Conservative bits-per-pixel model, calibrated against real x264 output.
  // The lower 0.028 estimate materially undercounted ordinary 1080p exports.
  const baseBpp = 0.12 * q.hwBitrateFactor
  const bitrateMbps = Math.max(0.6, (w * h * 30 * baseBpp) / 1_000_000)
  const videoMb = (bitrateMbps * seconds) / 8
  return Math.round(videoMb + (seconds * 0.192) / 8) // + audio 192 kbps
}

/** Words that hint at strong moments — used by the local heuristic analyzer. */
export const HOOK_CUE_PATTERNS: RegExp[] = [
  /\bthe (biggest|worst|best|craziest|weirdest|hardest|most)\b/i,
  /\b(never|always|nobody|everyone)\b/i,
  /\bi (learned|realized|discovered|failed|quit|lost|made)\b/i,
  /\b(secret|truth|mistake|lesson|problem|rule)\b/i,
  /\b(you (need|should|must|can't|won't))\b/i,
  /\b(here'?s (why|how|what))\b/i,
  /\b(million|billion|thousand|\d+%|\$\d+)\b/i,
  /\b(listen|look|imagine|trust me|honestly)\b/i
]

export const QUESTION_PATTERN = /\?\s*$/
export const NUMBER_PATTERN = /\b\d[\d,.]*\b/
