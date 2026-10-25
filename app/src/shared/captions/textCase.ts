export type CaptionCapitalization = 'original' | 'uppercase' | 'lowercase' | 'sentence'

export function transformCaptionText(text: string, mode: CaptionCapitalization = 'original', uppercase = false): string {
  if (uppercase || mode === 'uppercase') return text.toLocaleUpperCase()
  if (mode === 'lowercase') return text.toLocaleLowerCase()
  if (mode === 'sentence') return text.replace(/(^|[.!?]\s+)([\p{L}])/gu, (_match, boundary: string, letter: string) => boundary + letter.toLocaleUpperCase())
  return text
}

export function transformCaptionWord(text: string, mode: CaptionCapitalization, index: number, previousWord = '', uppercase = false): string {
  if (uppercase || mode === 'uppercase') return text.toLocaleUpperCase()
  if (mode === 'lowercase') return text.toLocaleLowerCase()
  if (mode === 'sentence' && (index === 0 || /[.!?]["')\]]?$/.test(previousWord.trim()))) return text.replace(/[\p{L}]/u, (letter) => letter.toLocaleUpperCase())
  return text
}

const EMPHASIS_WORDS = new Set('important never always change money free best worst new secret proven actually because opportunity guarantee must need love hate stop start win lose success fail'.split(' '))

/** Lightweight local heuristic: numeric values, proper-name casing, and chosen semantic emphasis terms. */
export function isCaptionKeyword(word: string, index: number): boolean {
  const clean = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  if (!clean) return false
  return /\d/.test(clean) || /^[A-Z]{2,}$/.test(clean) || (index > 0 && /^\p{Lu}[\p{L}'’-]+$/u.test(clean)) || EMPHASIS_WORDS.has(clean.toLocaleLowerCase())
}
