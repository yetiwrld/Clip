/**
 * Commands owned by a screen.
 *
 * The editor and the timeline register these while they are mounted and drop
 * them on unmount, so a shortcut can never fire while its screen is gone. The
 * handlers come from the component, which keeps the keys next to the behaviour
 * they trigger.
 */

import type { Command } from './types'

export interface EditorHandlers {
  hasClip(): boolean
  playPause(): void
  rewind(): void
  pause(): void
  playForward(): void
  stepFrame(direction: 1 | -1): void
  seekBy(seconds: number): void
  markStart(): void
  markEnd(): void
  goToStart(): void
  goToEnd(): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  exportClip(): void
  optimizeBoundaries(): void
  toggleInspector(): void
  inspectorEnabled(): boolean
  closeInspector(): void
  inspectorOpen(): boolean
}

export function editorCommands(get: () => EditorHandlers): Command[] {
  const available = () => Boolean(get()?.hasClip())
  return [
    {
      id: 'editor.playPause',
      title: 'Play or pause',
      category: 'Playback',
      keywords: ['space', 'transport', 'preview'],
      shortcut: { key: ' ' },
      enabled: available,
      run: () => get().playPause()
    },
    {
      id: 'editor.rewind',
      title: 'Rewind',
      category: 'Playback',
      keywords: ['back', 'j'],
      shortcut: { key: 'j' },
      enabled: available,
      run: () => get().rewind()
    },
    {
      id: 'editor.pause',
      title: 'Pause',
      category: 'Playback',
      keywords: ['stop', 'k'],
      shortcut: { key: 'k' },
      enabled: available,
      run: () => get().pause()
    },
    {
      id: 'editor.playForward',
      title: 'Play forward',
      category: 'Playback',
      keywords: ['l', 'fast'],
      shortcut: { key: 'l' },
      enabled: available,
      run: () => get().playForward()
    },
    {
      id: 'editor.frameBack',
      title: 'Step back one frame',
      category: 'Playback',
      keywords: ['previous frame', 'nudge'],
      shortcut: { key: ',' },
      enabled: available,
      run: () => get().stepFrame(-1)
    },
    {
      id: 'editor.frameForward',
      title: 'Step forward one frame',
      category: 'Playback',
      keywords: ['next frame', 'nudge'],
      shortcut: { key: '.' },
      enabled: available,
      run: () => get().stepFrame(1)
    },
    {
      id: 'editor.stepBack',
      title: 'Playhead back one frame',
      category: 'Playback',
      keywords: ['arrow', 'scrub', 'previous frame'],
      shortcut: { key: 'arrowleft' },
      enabled: available,
      run: () => get().stepFrame(-1)
    },
    {
      id: 'editor.stepForward',
      title: 'Playhead forward one frame',
      category: 'Playback',
      keywords: ['arrow', 'scrub', 'next frame'],
      shortcut: { key: 'arrowright' },
      enabled: available,
      run: () => get().stepFrame(1)
    },
    {
      id: 'editor.seekBack',
      title: 'Playhead back one second',
      category: 'Playback',
      keywords: ['shift arrow', 'scrub'],
      shortcut: { key: 'arrowleft', shift: true },
      hidden: true,
      enabled: available,
      run: () => get().seekBy(-1)
    },
    {
      id: 'editor.seekForward',
      title: 'Playhead forward one second',
      category: 'Playback',
      keywords: ['shift arrow', 'scrub'],
      shortcut: { key: 'arrowright', shift: true },
      hidden: true,
      enabled: available,
      run: () => get().seekBy(1)
    },
    {
      id: 'editor.goToStart',
      title: 'Go to clip start',
      category: 'Editing',
      keywords: ['home'],
      shortcut: { key: 'home' },
      enabled: available,
      run: () => get().goToStart()
    },
    {
      id: 'editor.goToEnd',
      title: 'Go to clip end',
      category: 'Editing',
      keywords: ['end'],
      shortcut: { key: 'end' },
      enabled: available,
      run: () => get().goToEnd()
    },
    {
      id: 'editor.markStart',
      title: 'Set clip start at playhead',
      category: 'Editing',
      keywords: ['trim', 'in point'],
      shortcut: { key: 'i' },
      enabled: available,
      run: () => get().markStart()
    },
    {
      id: 'editor.markEnd',
      title: 'Set clip end at playhead',
      category: 'Editing',
      keywords: ['trim', 'out point'],
      shortcut: { key: 'o' },
      enabled: available,
      run: () => get().markEnd()
    },
    {
      id: 'editor.undo',
      title: 'Undo',
      category: 'Editing',
      keywords: ['revert', 'back'],
      shortcut: { key: 'z', mod: true },
      enabled: () => Boolean(get()?.hasClip()) && Boolean(get()?.canUndo()),
      run: () => get().undo()
    },
    {
      id: 'editor.redo',
      title: 'Redo',
      category: 'Editing',
      keywords: ['repeat', 'forward'],
      shortcut: [{ key: 'z', mod: true, shift: true }, { key: 'y', mod: true }],
      enabled: () => Boolean(get()?.hasClip()) && Boolean(get()?.canRedo()),
      run: () => get().redo()
    },
    {
      id: 'editor.exportClip',
      title: 'Render clip',
      category: 'Editing',
      keywords: ['export', 'queue', 'mp4'],
      hint: 'Queue this clip for rendering',
      enabled: available,
      run: () => get().exportClip()
    },
    {
      id: 'editor.optimizeBoundaries',
      title: 'Optimize clip boundaries',
      category: 'Editing',
      keywords: ['snap', 'sentences', 'trim'],
      hint: 'Move the clip edges to sentence boundaries',
      enabled: available,
      run: () => get().optimizeBoundaries()
    },
    {
      id: 'editor.closeInspector',
      title: 'Close properties',
      category: 'Editing',
      keywords: ['escape', 'inspector', 'dismiss panel'],
      shortcut: { key: 'escape' },
      hidden: true,
      allowInInput: true,
      enabled: () => Boolean(get()?.inspectorOpen()),
      run: () => get().closeInspector()
    },
    {
      id: 'editor.toggleInspector',
      title: 'Toggle properties',
      category: 'Editing',
      keywords: ['inspector', 'panel', 'sidebar'],
      enabled: () => Boolean(get()?.hasClip()) && Boolean(get().inspectorEnabled()),
      run: () => get().toggleInspector()
    }
  ]
}

export interface TimelineHandlers {
  hasSelection(): boolean
  deleteSelected(): void
  rippleDeleteSelected(): void
  duplicateSelected(): void
  cutSelected(): void
  copySelected(): void
  pasteSelected(): void
  hasClipboard(): boolean
  splitSelected(): void
  canSplit(): boolean
  selectAll(): void
  clearSelection(): void
  toggleSnap(): void
}

/**
 * Timeline editing commands.
 *
 * These are the real operations: each handler mutates the `ClipTimeline` the
 * editor renders and stores, then persists it through the normal save path, so
 * a shortcut, a menu row and a toolbar button do exactly the same thing.
 * Copy and paste use the editor's own clip clipboard, never the system one, and
 * every command stays out of text fields (the registry checks that first).
 */
export function timelineCommands(get: () => TimelineHandlers): Command[] {
  return [
    {
      id: 'timeline.cut',
      title: 'Cut',
      category: 'Timeline',
      keywords: ['clipboard', 'remove', 'move'],
      hint: 'Selection to the clip clipboard',
      shortcut: { key: 'x', mod: true },
      enabled: () => Boolean(get()?.hasSelection()),
      run: () => get().cutSelected()
    },
    {
      id: 'timeline.copy',
      title: 'Copy',
      category: 'Timeline',
      keywords: ['clipboard', 'duplicate'],
      hint: 'Selection to the clip clipboard',
      shortcut: { key: 'c', mod: true },
      enabled: () => Boolean(get()?.hasSelection()),
      run: () => get().copySelected()
    },
    {
      id: 'timeline.paste',
      title: 'Paste at playhead',
      category: 'Timeline',
      keywords: ['clipboard', 'insert'],
      hint: 'Clips from the clip clipboard, relative timing kept',
      shortcut: { key: 'v', mod: true },
      enabled: () => Boolean(get()?.hasClipboard()),
      run: () => get().pasteSelected()
    },
    {
      id: 'timeline.duplicate',
      title: 'Duplicate selection',
      category: 'Timeline',
      keywords: ['copy', 'clone'],
      shortcut: { key: 'd', mod: true },
      enabled: () => Boolean(get()?.hasSelection()),
      run: () => get().duplicateSelected()
    },
    {
      id: 'timeline.split',
      title: 'Split at playhead',
      category: 'Timeline',
      keywords: ['razor', 'cut', 'slice'],
      shortcut: { key: 'b', mod: true },
      enabled: () => Boolean(get()?.canSplit()),
      run: () => get().splitSelected()
    },
    {
      id: 'timeline.delete',
      title: 'Delete selection',
      category: 'Timeline',
      keywords: ['remove', 'clear', 'backspace'],
      hint: 'Leaves a gap',
      shortcut: [{ key: 'delete' }, { key: 'backspace' }],
      enabled: () => Boolean(get()?.hasSelection()),
      run: () => get().deleteSelected()
    },
    {
      id: 'timeline.rippleDelete',
      title: 'Ripple delete',
      category: 'Timeline',
      keywords: ['remove', 'close gap', 'shift delete'],
      hint: 'Removes the selection and closes the gap',
      shortcut: { key: 'delete', shift: true },
      enabled: () => Boolean(get()?.hasSelection()),
      run: () => get().rippleDeleteSelected()
    },
    {
      id: 'timeline.selectAll',
      title: 'Select all clips',
      category: 'Timeline',
      keywords: ['everything', 'selection'],
      shortcut: { key: 'a', mod: true },
      run: () => get().selectAll()
    },
    {
      id: 'timeline.clearSelection',
      title: 'Clear timeline selection',
      category: 'Timeline',
      keywords: ['escape', 'deselect'],
      shortcut: { key: 'escape' },
      hidden: true,
      enabled: () => Boolean(get()?.hasSelection()),
      run: () => get().clearSelection()
    },
    {
      id: 'timeline.snap',
      title: 'Toggle magnetic snapping',
      category: 'Timeline',
      keywords: ['magnet', 'align'],
      shortcut: { key: 's', shift: true },
      run: () => get().toggleSnap()
    }
  ]
}
