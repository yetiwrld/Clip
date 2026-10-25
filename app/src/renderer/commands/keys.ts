/**
 * Key matching, shortcut formatting and fuzzy scoring.
 *
 * Pure functions only: no DOM, no React, no store. That keeps them testable in
 * a node environment and keeps the registry free of side effects.
 */

import type { ShortcutSpec } from './types'

/** macOS gets ⌘ symbols; everything else gets Ctrl/Alt wording. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const source = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`
  return /Mac|iPhone|iPad/.test(source)
}

/** Normalise a KeyboardEvent.key for comparison. */
export function normalizeKey(key: string): string {
  if (key === ' ' || key === 'Spacebar') return ' '
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase()
}

export function matchesShortcut(spec: ShortcutSpec, event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  const mod = Boolean(spec.mod)
  const eventMod = event.ctrlKey || event.metaKey
  if (mod !== eventMod) return false
  if (Boolean(spec.shift) !== event.shiftKey) return false
  if (Boolean(spec.alt) !== event.altKey) return false
  return normalizeKey(event.key) === normalizeKey(spec.key)
}

/** A comparable string for one shortcut, used to detect conflicts. */
export function shortcutSignature(spec: ShortcutSpec): string {
  return [spec.mod ? 'mod' : '', spec.alt ? 'alt' : '', spec.shift ? 'shift' : '', normalizeKey(spec.key)]
    .filter(Boolean)
    .join('+')
}

const KEY_LABELS_MAC: Record<string, string> = {
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: '↵',
  escape: 'Esc',
  delete: '⌫',
  backspace: '⌫',
  home: '↖',
  end: '↘',
  '/': '/',
  ',': ',',
  '.': '.'
}

const KEY_LABELS_OTHER: Record<string, string> = {
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: 'Enter',
  escape: 'Esc',
  delete: 'Del',
  backspace: 'Backspace',
  home: 'Home',
  end: 'End',
  '/': '/',
  ',': ',',
  '.': '.'
}

function keyLabel(key: string, mac: boolean): string {
  const normalized = normalizeKey(key)
  const table = mac ? KEY_LABELS_MAC : KEY_LABELS_OTHER
  if (table[normalized]) return table[normalized]
  if (normalized.length === 1) return normalized.toUpperCase()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

/** Human-readable shortcut: "Ctrl+K" on Windows/Linux, "⌘K" on macOS. */
export function formatShortcut(spec: ShortcutSpec, mac = isMacPlatform()): string {
  const key = keyLabel(spec.key, mac)
  if (mac) {
    return `${spec.mod ? '⌘' : ''}${spec.alt ? '⌥' : ''}${spec.shift ? '⇧' : ''}${key}`
  }
  return [spec.mod ? 'Ctrl' : '', spec.alt ? 'Alt' : '', spec.shift ? 'Shift' : '', key].filter(Boolean).join('+')
}

/**
 * Fuzzy match, ranked.
 *
 * A contiguous substring always beats a scattered subsequence, and matches at
 * a word start score above matches in the middle of a word. Returns null when
 * the query cannot be found at all, so "no results" is honest.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 0
  if (!t) return null

  const direct = t.indexOf(q)
  if (direct >= 0) {
    let score = 1000 - direct
    if (direct === 0) score += 200
    else if (t[direct - 1] === ' ' || t[direct - 1] === '-' || t[direct - 1] === '/') score += 120
    return score
  }

  let score = 0
  let cursor = 0
  let streak = 0
  for (const ch of q) {
    const found = t.indexOf(ch, cursor)
    if (found === -1) return null
    if (found === cursor) streak += 1
    else streak = 0
    score += 10 + streak * 6
    if (found === 0 || t[found - 1] === ' ' || t[found - 1] === '-' || t[found - 1] === '/') score += 8
    cursor = found + 1
  }
  // Shorter titles are usually the better answer.
  return score - Math.min(20, Math.floor(t.length / 4))
}

/** Best score across a command title and its keywords. */
export function scoreCommand(query: string, title: string, keywords: string[] = []): number | null {
  const scores = [fuzzyScore(query, title), ...keywords.map((keyword) => fuzzyScore(query, keyword))]
    .filter((value): value is number => value != null)
  if (scores.length === 0) return null
  return Math.max(...scores)
}
