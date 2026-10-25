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
      id: 'editor.seekBack',
      title: 'Back one second',
      category: 'Playback',
      keywords: ['scrub'],
      shortcut: { key: 'arrowleft' },
      enabled: available,
      run: () => get().seekBy(-1)
    },
    {
      id: 'editor.seekForward',
      title: 'Forward one second',
      category: 'Playback',
      keywords: ['scrub'],
      shortcut: { key: 'arrowright' },
      enabled: available,
      run: () => get().seekBy(1)
    },
    {
      id: 'editor.seekBackFive',
      title: 'Back five seconds',
      category: 'Playback',
      shortcut: { key: 'arrowleft', shift: true },
      hidden: true,
      enabled: available,
      run: () => get().seekBy(-5)
    },
    {
      id: 'editor.seekForwardFive',
      title: 'Forward five seconds',
      category: 'Playback',
      shortcut: { key: 'arrowright', shift: true },
      hidden: true,
      enabled: available,
      run: () => get().seekBy(5)
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
      enabled: available,
      run: () => get().undo()
    },
    {
      id: 'editor.redo',
      title: 'Redo',
      category: 'Editing',
      keywords: ['repeat', 'forward'],
      shortcut: [{ key: 'z', mod: true, shift: true }, { key: 'y', mod: true }],
      enabled: available,
      run: () => get().redo()
    },
    {
      id: 'editor.exportClip',
      title: 'Export clip',
      category: 'Editing',
      keywords: ['render', 'queue', 'mp4'],
      hint: 'Queue this clip for rendering',
      enabled: available,
      run: () => get().exportClip()
    },
    {
      id: 'editor.optimizeBoundaries',
      title: 'Optimize clip boundaries',
      category: 'Editing',
      keywords: ['snap', 'sentences', 'trim'],
      hint: 'Snap edges to sentence boundaries',
      enabled: available,
      run: () => get().optimizeBoundaries()
    },
    {
      id: 'editor.closeInspector',
      title: 'Close inspector',
      category: 'Editing',
      keywords: ['escape', 'dismiss panel'],
      shortcut: { key: 'escape' },
      hidden: true,
      allowInInput: true,
      enabled: () => Boolean(get()?.inspectorOpen()),
      run: () => get().closeInspector()
    },
    {
      id: 'editor.toggleInspector',
      title: 'Toggle inspector',
      category: 'Editing',
      keywords: ['properties', 'panel', 'sidebar'],
      enabled: () => Boolean(get()?.hasClip()) && Boolean(get().inspectorEnabled()),
      run: () => get().toggleInspector()
    }
  ]
}

export interface TimelineHandlers {
  hasSelection(): boolean
  deleteSelected(): void
  duplicateSelected(): void
  splitSelected(): void
  toggleSnap(): void
}

export function timelineCommands(get: () => TimelineHandlers): Command[] {
  return [
    {
      id: 'timeline.delete',
      title: 'Delete selected timeline item',
      category: 'Timeline',
      keywords: ['remove', 'cut'],
      hint: 'Selected clip, caption block or text layer',
      shortcut: { key: 'delete' },
      enabled: () => Boolean(get()?.hasSelection()),
      run: () => get().deleteSelected()
    },
    {
      id: 'timeline.duplicate',
      title: 'Duplicate timeline item',
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
      keywords: ['razor', 'cut'],
      shortcut: { key: 'b', mod: true },
      enabled: () => Boolean(get()?.hasSelection()),
      run: () => get().splitSelected()
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
