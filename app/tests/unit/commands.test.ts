import { describe, expect, it } from 'vitest'
import { formatShortcut, fuzzyScore, matchesShortcut, shortcutSignature, scoreCommand } from '../../src/renderer/commands/keys'
import { findShortcutConflicts, pickCommand, type DispatchContext } from '../../src/renderer/commands/registry'
import { editorCommands, timelineCommands } from '../../src/renderer/commands/screenCommands'
import { navigationCommands, projectCommands } from '../../src/renderer/commands/appCommands'
import type { Command } from '../../src/renderer/commands/types'

const key = (over: Partial<KeyboardEvent> = {}) =>
  ({ key: 'k', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over }) as KeyboardEvent

const context = (over: Partial<DispatchContext> = {}): DispatchContext => ({
  inEditable: false,
  inModal: false,
  paletteOpen: false,
  ...over
})

const noop = () => undefined

function stubEditorHandlers() {
  return {
    hasClip: () => true,
    playPause: noop,
    rewind: noop,
    pause: noop,
    playForward: noop,
    stepFrame: noop,
    seekBy: noop,
    markStart: noop,
    markEnd: noop,
    goToStart: noop,
    goToEnd: noop,
    undo: noop,
    redo: noop,
    canUndo: () => true,
    canRedo: () => true,
    exportClip: noop,
    optimizeBoundaries: noop,
    toggleInspector: noop,
    inspectorEnabled: () => true,
    closeInspector: noop,
    inspectorOpen: () => true
  }
}

function stubTimelineHandlers() {
  return {
    hasSelection: () => true,
    deleteSelected: noop,
    duplicateSelected: noop,
    cutSelected: noop,
    copySelected: noop,
    pasteSelected: noop,
    hasClipboard: () => true,
    splitSelected: noop,
    canSplit: () => true,
    selectAll: noop,
    clearSelection: noop,
    toggleSnap: noop
  }
}

describe('shortcut formatting', () => {
  it('uses Ctrl wording outside macOS and symbols inside it', () => {
    expect(formatShortcut({ key: 'k', mod: true }, false)).toBe('Ctrl+K')
    expect(formatShortcut({ key: 'k', mod: true }, true)).toBe('⌘K')
    expect(formatShortcut({ key: 'z', mod: true, shift: true }, true)).toBe('⌘⇧Z')
    expect(formatShortcut({ key: 'z', mod: true, shift: true }, false)).toBe('Ctrl+Shift+Z')
    expect(formatShortcut({ key: 'arrowleft', alt: true }, false)).toBe('Alt+←')
    expect(formatShortcut({ key: ' ', mod: true }, false)).toBe('Ctrl+Space')
  })

  it('matches modifiers exactly, so Shift is never implied', () => {
    expect(matchesShortcut({ key: 'k', mod: true }, key({ ctrlKey: true }))).toBe(true)
    expect(matchesShortcut({ key: 'k', mod: true }, key({ metaKey: true }))).toBe(true)
    expect(matchesShortcut({ key: 'k', mod: true }, key({}))).toBe(false)
    expect(matchesShortcut({ key: 'z', mod: true }, key({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(matchesShortcut({ key: 'z', mod: true, shift: true }, key({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(matchesShortcut({ key: 'k' }, key({ key: 'K' }))).toBe(true)
  })

  it('gives each shortcut a stable signature for conflict checks', () => {
    expect(shortcutSignature({ key: 'k', mod: true })).toBe('mod+k')
    expect(shortcutSignature({ key: 'arrowleft', shift: true })).toBe('shift+arrowleft')
    expect(shortcutSignature({ key: 'k', mod: true })).not.toBe(shortcutSignature({ key: 'k', mod: true, shift: true }))
  })
})

describe('fuzzy search', () => {
  it('finds a contiguous match and prefers the earlier one', () => {
    expect(fuzzyScore('proj', 'Go to Projects')).not.toBeNull()
    expect(fuzzyScore('go', 'Go to Projects')!).toBeGreaterThan(fuzzyScore('proj', 'Go to Projects')!)
  })

  it('finds a scattered match', () => {
    expect(fuzzyScore('gtp', 'Go to Projects')).not.toBeNull()
    expect(fuzzyScore('gtp', 'Go to Projects')!).toBeLessThan(fuzzyScore('proj', 'Go to Projects')!)
  })

  it('returns null when the query cannot be satisfied, so the empty state is honest', () => {
    expect(fuzzyScore('zzzz', 'Go to Projects')).toBeNull()
    expect(fuzzyScore('projects x', 'Go to Projects')).toBeNull()
  })

  it('matches keywords as well as titles', () => {
    expect(scoreCommand('render', 'Export clip', ['render', 'mp4'])).not.toBeNull()
    expect(scoreCommand('render', 'Play or pause', ['transport'])).toBeNull()
  })
})

describe('shortcut dispatch', () => {
  const commands: Command[] = [
    { id: 'a', title: 'Alpha', category: 'Navigate', shortcut: { key: 'k', mod: true }, run: noop },
    { id: 'b', title: 'Beta', category: 'Navigate', shortcut: { key: 'k' }, run: noop },
    {
      id: 'c',
      title: 'Charlie',
      category: 'Editing',
      shortcut: { key: 'x' },
      allowInInput: true,
      run: noop
    },
    { id: 'd', title: 'Delta', category: 'Editing', shortcut: { key: 'y' }, enabled: () => false, run: noop }
  ]

  it('runs a matching command', () => {
    expect(pickCommand(commands, key({ ctrlKey: true }), context())?.id).toBe('a')
  })

  it('never fires from inside a text field unless the command opts in', () => {
    // Beta is a plain key and does not opt in; Charlie does.
    expect(pickCommand(commands, key({ key: 'k' }), context({ inEditable: true }))).toBeNull()
    expect(pickCommand(commands, key({ key: 'x' }), context({ inEditable: true }))?.id).toBe('c')
  })

  it('lets a dialog keep the keyboard', () => {
    expect(pickCommand(commands, key({ key: 'x' }), context({ inModal: true }))).toBeNull()
  })

  it('stands aside while the palette is open', () => {
    expect(pickCommand(commands, key({ ctrlKey: true }), context({ paletteOpen: true }))).toBeNull()
  })

  it('skips commands that are not available right now', () => {
    expect(pickCommand(commands, key({ key: 'y' }), context())).toBeNull()
  })

  it('lets the most recently registered command win', () => {
    const override: Command = { id: 'a2', title: 'Alpha override', category: 'Navigate', shortcut: { key: 'k', mod: true }, run: noop }
    expect(pickCommand([...commands, override], key({ ctrlKey: true }), context())?.id).toBe('a2')
  })
})

describe('the shipped command set', () => {
  const all = [
    ...navigationCommands(),
    ...projectCommands([{ id: 'p1', name: 'Founder interview' }]),
    ...editorCommands(stubEditorHandlers),
    ...timelineCommands(stubTimelineHandlers)
  ]

  it('has no duplicate ids', () => {
    const ids = all.map((command) => command.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no conflicting shortcuts', () => {
    // The one deliberate pair: Escape closes the properties panel while it is
    // open and otherwise clears the timeline selection. They are never both
    // available, and the editor registers last so the panel wins when both are.
    const allowed = new Set(['editor.closeInspector|timeline.clearSelection'])
    const conflicts = findShortcutConflicts(all).filter((entry) => !allowed.has(entry.ids.slice().sort().join('|')))
    expect(conflicts).toEqual([])
    expect(findShortcutConflicts(all).map((entry) => entry.ids.slice().sort().join('|'))).toEqual([...allowed])
  })

  it('lets Escape close the properties panel, then clear the selection', () => {
    // The editor registers after the timeline, so it wins while it is enabled.
    const inspectorOpen = [
      ...timelineCommands(stubTimelineHandlers),
      ...editorCommands(() => ({ ...stubEditorHandlers(), inspectorOpen: () => true }))
    ]
    expect(pickCommand(inspectorOpen, key({ key: 'Escape' }), context())?.id).toBe('editor.closeInspector')
    const inspectorClosed = [
      ...timelineCommands(stubTimelineHandlers),
      ...editorCommands(() => ({ ...stubEditorHandlers(), inspectorOpen: () => false }))
    ]
    expect(pickCommand(inspectorClosed, key({ key: 'Escape' }), context())?.id).toBe('timeline.clearSelection')
  })

  it('gates copy, cut and paste on a real selection or clipboard', () => {
    const empty = timelineCommands(() => ({
      ...stubTimelineHandlers(),
      hasSelection: () => false,
      hasClipboard: () => false
    }))
    const byId = new Map(empty.map((command) => [command.id, command]))
    expect(byId.get('timeline.copy')?.enabled?.()).toBe(false)
    expect(byId.get('timeline.cut')?.enabled?.()).toBe(false)
    expect(byId.get('timeline.paste')?.enabled?.()).toBe(false)
    expect(byId.get('timeline.delete')?.enabled?.()).toBe(false)
  })

  it('keeps clip clipboard keys and text editing apart', () => {
    const editable = context({ inEditable: true })
    for (const spec of [{ key: 'x' }, { key: 'c' }, { key: 'v' }, { key: 'a' }]) {
      const event = key({ key: spec.key, ctrlKey: true })
      // With the editor mounted a shortcut exists, but a text field keeps its
      // own copy/paste/cut/select-all.
      expect(pickCommand(all, event, editable)).toBeNull()
      expect(pickCommand(all, event, context())?.id).toBe(`timeline.${spec.key === 'x' ? 'cut' : spec.key === 'c' ? 'copy' : spec.key === 'v' ? 'paste' : 'selectAll'}`)
    }
  })

  it('lists a shortcut reference with no orphans: every shortcut belongs to a command', () => {
    const withShortcut = all.filter((command) => command.shortcut)
    expect(withShortcut.length).toBeGreaterThan(15)
    for (const command of withShortcut) {
      expect(command.title.length).toBeGreaterThan(2)
      expect(typeof command.run).toBe('function')
    }
  })

  it('reserves Ctrl+K for the palette and Ctrl+/ for the reference', () => {
    const palette = all.find((command) => command.id === 'palette.open')
    const reference = all.find((command) => command.id === 'palette.shortcuts')
    expect(palette?.shortcut).toEqual({ key: 'k', mod: true })
    expect(reference?.shortcut).toEqual({ key: '/', mod: true })
    expect(matchesShortcut({ key: 'k', mod: true }, key({ ctrlKey: true }))).toBe(true)
  })

  it('behaves in text fields: typing never edits the clip, but Ctrl+K still opens the palette', () => {
    const editable = context({ inEditable: true })
    expect(pickCommand(all, key({ key: 'j' }), editable)).toBeNull()
    expect(pickCommand(all, key({ key: ' ' }), editable)).toBeNull()
    expect(pickCommand(all, key({ key: 'i' }), editable)).toBeNull()
    expect(pickCommand(all, key({ key: 'k', ctrlKey: true }), editable)?.id).toBe('palette.open')
  })

  it('lets a dialog keep every key, including the palette shortcut', () => {
    const inDialog = context({ inModal: true })
    expect(pickCommand(all, key({ key: 'k', ctrlKey: true }), inDialog)).toBeNull()
    expect(pickCommand(all, key({ key: 'Delete' }), inDialog)).toBeNull()
  })

  it('keeps viewer shortcuts on plain keys that typing cannot trigger', () => {
    const typing = all.filter((command) => {
      if (command.allowInInput) return false
      const specs = command.shortcut ? (Array.isArray(command.shortcut) ? command.shortcut : [command.shortcut]) : []
      return specs.some((spec) => !spec.mod && !spec.alt && ['j', 'k', 'l', 'i', 'o', ' ', ',', '.'].includes(spec.key))
    })
    expect(typing.every((command) => command.category === 'Playback' || command.category === 'Editing')).toBe(true)
  })
})
