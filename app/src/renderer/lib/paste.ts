/**
 * Pasting into a single-line field.
 *
 * A URL is short. If the clipboard holds a whole document — a script, a
 * transcript, a page copied from a browser — pasting it into the link field
 * would put hundreds of kilobytes into React state, a URL validator and a
 * backend payload. This trims the paste at the field instead, says what it did,
 * and leaves every other shortcut (copy, cut, select all, undo) untouched.
 */

import type React from 'react'

/** No honest media URL is longer than this. */
export const URL_PASTE_LIMIT = 2048

/**
 * Handle a paste in a URL field: collapse whitespace, cap the length, and
 * report when something was dropped. Returns the value to apply, or null when
 * the event should take its normal course.
 */
export function pastedUrl(event: React.ClipboardEvent<HTMLInputElement>, limit = URL_PASTE_LIMIT): { value: string; trimmed: boolean } | null {
  const raw = event.clipboardData?.getData('text') ?? ''
  if (!raw) return null
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= limit) return { value: collapsed, trimmed: collapsed !== raw }
  return { value: collapsed.slice(0, limit), trimmed: true }
}

/** Copy shown in the toast when a paste had to be cut down. */
export const PASTE_TRIMMED_NOTICE = 'The pasted text was longer than a link can be, so only the start was kept.'
