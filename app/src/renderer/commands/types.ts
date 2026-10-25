/**
 * Command palette and shortcut registry — types.
 *
 * One command object is the single source of truth for: what appears in the
 * palette, what a keyboard shortcut runs, and what the shortcut reference
 * lists. Nothing else attaches keyboard listeners.
 */

export type CommandCategory =
  | 'Navigate'
  | 'Projects'
  | 'Project'
  | 'Settings'
  | 'Playback'
  | 'Timeline'
  | 'Editing'
  | 'Help'

/** Category order in the palette and in the shortcut reference. */
export const CATEGORY_ORDER: CommandCategory[] = [
  'Navigate',
  'Projects',
  'Project',
  'Settings',
  'Playback',
  'Timeline',
  'Editing',
  'Help'
]

export interface ShortcutSpec {
  /**
   * `KeyboardEvent.key`, lower case for single characters.
   * Examples: 'k', 'arrowleft', 'delete', ' ', 'home', '/'.
   */
  key: string
  /** Ctrl on Windows and Linux, Cmd on macOS. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export interface Command {
  /** Stable id. Used for recents, tests and conflict reports. */
  id: string
  title: string
  category: CommandCategory
  /** Extra words the palette should match on (synonyms, old labels). */
  keywords?: string[]
  shortcut?: ShortcutSpec | ShortcutSpec[]
  /** A second line in the palette: what the command does to what. */
  hint?: string
  /** Available right now? Checked before running and before listing. */
  enabled?: () => boolean
  /** Runs while a text field, textarea or contenteditable has focus. */
  allowInInput?: boolean
  /** Runs while a modal dialog is open. */
  allowInModal?: boolean
  /** Hide from the palette result list (shortcut-only or duplicate). */
  hidden?: boolean
  run: () => void
}

export type PaletteMode = 'commands' | 'shortcuts'
