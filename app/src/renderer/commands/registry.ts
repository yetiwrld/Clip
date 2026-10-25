/**
 * The shortcut registry.
 *
 * Every keyboard shortcut in the renderer lives here. Navigation commands are
 * registered once by useAppCommands; screen-specific commands (editor
 * transport, timeline editing) are registered by the screen that owns the
 * behaviour and removed when it unmounts. One window listener dispatches them.
 */

import { create } from 'zustand'
import type { Command } from './types'
import { formatShortcut, matchesShortcut, shortcutSignature } from './keys'

interface RegistryState {
  commands: Command[]
  register(commands: Command[]): void
  unregister(ids: string[]): void
}

export const useCommandRegistry = create<RegistryState>((set, get) => ({
  commands: [],

  register(commands) {
    if (commands.length === 0) return
    const next = new Map(get().commands.map((command) => [command.id, command]))
    for (const command of commands) next.set(command.id, command)
    set({ commands: [...next.values()] })
  },

  unregister(ids) {
    if (ids.length === 0) return
    const remove = new Set(ids)
    set({ commands: get().commands.filter((command) => !remove.has(command.id)) })
  }
}))

/** Register a list and get an unregister function back, for useEffect. */
export function registerCommands(commands: Command[]): () => void {
  useCommandRegistry.getState().register(commands)
  return () => useCommandRegistry.getState().unregister(commands.map((command) => command.id))
}

/**
 * Duplicate shortcut signatures. Two commands may share a key only when they
 * cannot be available at the same time; the app-level set is checked in the
 * unit tests so an accidental duplicate fails the build rather than silently
 * shadowing a command.
 */
export function findShortcutConflicts(commands: Command[]): Array<{ signature: string; ids: string[] }> {
  const bySignature = new Map<string, string[]>()
  for (const command of commands) {
    if (!command.shortcut) continue
    const specs = Array.isArray(command.shortcut) ? command.shortcut : [command.shortcut]
    for (const spec of specs) {
      const signature = shortcutSignature(spec)
      bySignature.set(signature, [...(bySignature.get(signature) ?? []), command.id])
    }
  }
  return [...bySignature.entries()]
    .filter(([, ids]) => new Set(ids).size > 1)
    .map(([signature, ids]) => ({ signature, ids: [...new Set(ids)] }))
}

export interface DispatchContext {
  /** Focus is in an input, textarea, select or contenteditable host. */
  inEditable: boolean
  /** A modal dialog is open. */
  inModal: boolean
  /** The command palette owns the keyboard right now. */
  paletteOpen: boolean
}

/**
 * Which command should run for this key press.
 *
 * Later registrations win, so a screen's command beats a global one with the
 * same key while that screen is mounted. Text fields swallow plain and
 * modified keys unless the command opts in, and modal dialogs swallow
 * everything except the commands that explicitly opt in.
 */
export function pickCommand(
  commands: Command[],
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  context: DispatchContext
): Command | null {
  if (context.paletteOpen) return null
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index]
    if (!command.shortcut) continue
    if (command.enabled && !command.enabled()) continue
    if (context.inEditable && !command.allowInInput) continue
    if (context.inModal && !command.allowInModal) continue
    const specs = Array.isArray(command.shortcut) ? command.shortcut : [command.shortcut]
    if (specs.some((spec) => matchesShortcut(spec, event))) return command
  }
  return null
}

/** The first shortcut of a command, formatted for a tooltip or a menu. */
export function shortcutLabel(command: Command | undefined, mac?: boolean): string {
  if (!command?.shortcut) return ''
  const spec = Array.isArray(command.shortcut) ? command.shortcut[0] : command.shortcut
  return formatShortcut(spec, mac)
}

/** Look up a command's shortcut by id, for menus and tooltips. */
export function shortcutLabelFor(id: string): string {
  return shortcutLabel(useCommandRegistry.getState().commands.find((command) => command.id === id))
}
