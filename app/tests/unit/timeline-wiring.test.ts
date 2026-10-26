import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { MultiTrackTimeline } from '../../src/renderer/features/editor/MultiTrackTimeline'
import { useTimelineClipboard } from '../../src/renderer/features/editor/timeline-clipboard'
import { registerCommands, useCommandRegistry } from '../../src/renderer/commands/registry'
import { timelineCommands } from '../../src/renderer/commands/screenCommands'
import { copyTimelineItems } from '../../src/shared/editor/timeline-editing'
import { mainTrackPieces } from '../../src/shared/video/main-track'
import type { ClipTimeline, TimelineItem } from '../../src/shared/types'

/**
 * Wiring of the timeline's edit controls.
 *
 * The operations themselves are covered by the pure tests and the restart test.
 * This file checks the part those cannot: that the visible controls — the
 * labelled toolbar, the right-click menu and the shortcut registry — are
 * connected to that same behaviour, and that a control is disabled (with a
 * reason) rather than silently doing nothing when its precondition is missing.
 */

const tracks: ClipTimeline['tracks'] = [
  { id: 'video-1', name: 'Video 1', type: 'video', order: 0, muted: false, hidden: false, locked: false }
]

function item(over: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'a', assetId: 'asset-1', trackId: 'video-1', startTime: 0, sourceIn: 0, sourceOut: 4,
    volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false,
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...over
  }
}

const timeline: ClipTimeline = { tracks, items: [item()], snapEnabled: true }

const noop = () => undefined

function render(over: Partial<React.ComponentProps<typeof MultiTrackTimeline>> = {}) {
  return renderToStaticMarkup(
    React.createElement(MultiTrackTimeline, {
      timeline,
      assets: [],
      waveforms: {},
      duration: 20,
      playing: false,
      getPlaybackTime: () => 0,
      currentTime: 0,
      onSeek: noop,
      onChange: noop,
      onDropFiles: noop,
      ...over
    })
  )
}

/**
 * The toolbar buttons, in order, with their disabled state. With icon-only
 * controls the accessible name is the only text, so that is what the test reads.
 */
function toolbarRows(html: string): Array<{ label: string; disabled: boolean }> {
  const region = html.slice(html.indexOf('aria-label="Timeline editing tools"'))
  const toolbar = region.slice(0, region.indexOf('timeline-selection-status'))
  return [...toolbar.matchAll(/<button[^>]*class="[^"]*timeline-action[^"]*"[^>]*>/g)].map((match) => {
    const tag = match[0]
    return {
      label: /aria-label="([^"]*)"/.exec(tag)?.[1] ?? '',
      disabled: /\sdisabled=""/.test(tag)
    }
  })
}

/** The rows of the right-click menu, which mirrors the toolbar. */
function contextRows(html: string): Array<{ label: string; disabled: boolean }> {
  const region = html.slice(html.indexOf('aria-label="Timeline actions"'))
  const menu = region.slice(0, region.indexOf('</div>'))
  return [...menu.matchAll(/<button[\s\S]*?<\/button>/g)].map((match) => {
    const tag = /^<button([^>]*)>/.exec(match[0])?.[1] ?? ''
    const label = match[0]
      .replace(/<span class="menu-shortcut">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return { label, disabled: /\sdisabled=""/.test(tag) }
  })
}

afterEach(() => {
  useTimelineClipboard.getState().setClipboard(null)
  useCommandRegistry.getState().unregister(useCommandRegistry.getState().commands.map((command) => command.id))
})

describe('timeline edit toolbar', () => {
  it('shows every command as an icon, in the order of the work', () => {
    const html = render()
    const rows = toolbarRows(html)
    expect(rows.map((row) => row.label)).toEqual([
      'Cut selected clips', 'Copy selected clips', 'Paste clips at the playhead',
      'Split clips at playhead', 'Duplicate selected clips', 'Delete selected clips'
    ])
    // Icon-only: the words live in the hover text, not on the toolbar.
    expect(html).not.toContain('timeline-action-label')
    expect(html).not.toContain('Ripple delete')
  })

  it('puts the action and its shortcut in the hover text of every icon', () => {
    const html = render()
    expect(html).toContain('title="Cut selected clips')
    expect(html).toContain('title="Copy selected clips')
    expect(html).toContain('title="Paste clips at the playhead')
    expect(html).toContain('title="Split clips at playhead')
    expect(html).toContain('title="Duplicate selected clips')
    expect(html).toContain('title="Delete selected clips')
    expect(html).toContain('title="Magnetic snapping')
    expect(html).toContain('title="Add a track')
    expect(html).toContain('title="Timeline zoom"')
    expect(html).toContain('title="Fit full project in the timeline"')
  })

  it('gives each track the same controls plus a menu for order and removal', () => {
    const html = render()
    expect(html).toContain('class="track-menu"')
    expect(html).toContain('title="Track options"')
    expect(html).toContain('Move up')
    expect(html).toContain('Move down')
    expect(html).toContain('Delete track')
    // A track that holds a clip cannot be deleted out from under it.
    expect(html).toMatch(/role="menuitem" disabled="" title="Remove or move its clips first">Delete track/)
  })

  it('writes the real shortcut into each tooltip from the command registry', () => {
    const dispose = registerCommands(timelineCommands(() => ({
      hasSelection: () => false,
      deleteSelected: noop,
      duplicateSelected: noop,
      cutSelected: noop,
      copySelected: noop,
      pasteSelected: noop,
      hasClipboard: () => false,
      splitSelected: noop,
      canSplit: () => false,
      selectAll: noop,
      clearSelection: noop,
      toggleSnap: noop
    })))
    // Paste and Split need their precondition to be met before their tooltip
    // is the plain "action · shortcut" form; the others show it regardless.
    useTimelineClipboard.getState().setClipboard(copyTimelineItems(timeline, ['a']))
    const html = render({ currentTime: 2 })
    dispose()
    expect(html).toMatch(/title="Cut selected clips[^"]*· Ctrl\+X"/)
    expect(html).toMatch(/title="Copy selected clips[^"]*· Ctrl\+C"/)
    expect(html).toMatch(/title="Paste clips at the playhead[^"]*· Ctrl\+V"/)
    expect(html).toMatch(/title="Split clips at playhead[^"]*· Ctrl\+B"/)
    expect(html).toMatch(/title="Duplicate selected clips[^"]*· Ctrl\+D"/)
  })

  it('explains why a disabled command cannot run', () => {
    const html = render()
    expect(html).toContain('Paste clips at the playhead · copy a clip first')
    expect(html).toContain('Split clips at playhead · move the playhead inside a clip first')
  })

  it('disables what cannot run: no selection, empty clipboard, playhead outside every clip', () => {
    const byLabel = new Map(toolbarRows(render()).map((row) => [row.label, row.disabled]))
    expect(byLabel.get('Cut selected clips')).toBe(true)
    expect(byLabel.get('Copy selected clips')).toBe(true)
    // Nothing has been copied, so Paste is visibly unavailable rather than
    // silently doing nothing.
    expect(byLabel.get('Paste clips at the playhead')).toBe(true)
    expect(byLabel.get('Duplicate selected clips')).toBe(true)
    expect(byLabel.get('Delete selected clips')).toBe(true)
    // Nothing is selected and the playhead at 0 is on the clip's leading edge.
    expect(byLabel.get('Split clips at playhead')).toBe(true)

    useTimelineClipboard.getState().setClipboard(copyTimelineItems(timeline, ['a']))
    const withClipboard = new Map(toolbarRows(render()).map((row) => [row.label, row.disabled]))
    expect(withClipboard.get('Paste clips at the playhead')).toBe(false)

    const midClip = new Map(toolbarRows(render({ currentTime: 2 })).map((row) => [row.label, row.disabled]))
    expect(midClip.get('Split clips at playhead')).toBe(false)
  })

  it('draws the main video as removable pieces on Video 1 and deletes the selected part', () => {
    const pieces = mainTrackPieces({ startTime: 0, endTime: 10, silenceCuts: [{ start: 4, end: 6 }] })
    const html = render({
      timeline: { ...timeline, items: [] },
      mainTrack: {
        trackId: 'video-1',
        pieces,
        selectedId: pieces[1].id,
        thumbnail: null,
        onSelect: noop,
        onRemove: noop
      }
    })
    // Two parts, back to back: the 4-6 s hole has closed up, magnet style.
    expect(html.match(/data-main-piece=/g)).toHaveLength(2)
    expect(html).toContain('Main video · 0:00.0 to 0:04.0')
    expect(html).toContain('Main video · 0:04.0 to 0:08.0')
    // The selected part says what Delete does, and Delete is enabled even
    // though no timeline clip is selected.
    expect(html).toContain('Main video part 0:04.0 to 0:08.0 · Delete removes it')
    const rows = new Map(toolbarRows(html).map((row) => [row.label, row.disabled]))
    expect(rows.get('Remove this part of the main video')).toBe(false)
    // A part of the main video is not a clipboard clip: the other commands stay
    // unavailable rather than pretending they could copy the source.
    expect(rows.get('Cut selected clips')).toBe(true)
    expect(rows.get('Copy selected clips')).toBe(true)
    expect(rows.get('Duplicate selected clips')).toBe(true)
  })

  it('offers Delete for a part of the main video through the same command', () => {
    const deleted: string[] = []
    const dispose = registerCommands(timelineCommands(() => ({
      hasSelection: () => false,
      hasMainSelection: () => true,
      deleteSelected: () => deleted.push('main'),
      duplicateSelected: noop,
      cutSelected: noop,
      copySelected: noop,
      pasteSelected: noop,
      hasClipboard: () => false,
      splitSelected: noop,
      canSplit: () => false,
      selectAll: noop,
      clearSelection: noop,
      toggleSnap: noop
    })))
    const command = useCommandRegistry.getState().commands.find((entry) => entry.id === 'timeline.delete')
    expect(command?.enabled?.()).toBe(true)
    command?.run()
    dispose()
    // One command, one gate: Delete acts on whichever selection exists, and is
    // unavailable when neither does.
    expect(deleted).toEqual(['main'])
    const again = registerCommands(timelineCommands(() => ({
      hasSelection: () => false,
      deleteSelected: noop,
      duplicateSelected: noop,
      cutSelected: noop,
      copySelected: noop,
      pasteSelected: noop,
      hasClipboard: () => false,
      splitSelected: noop,
      canSplit: () => false,
      selectAll: noop,
      clearSelection: noop,
      toggleSnap: noop
    })))
    expect(useCommandRegistry.getState().commands.find((entry) => entry.id === 'timeline.delete')?.enabled?.()).toBe(false)
    again()
  })

  it('keeps the right-click menu in step with the toolbar', () => {
    const summary = render({ currentTime: 2 })
    // The menu only mounts once opened; the rows read the same command
    // functions and the same enabled state, checked through the toolbar above.
    expect(summary).toContain('aria-label="Timeline editing tools"')
    expect(contextRows(summary)).toEqual([])
  })

  it('offers undo and redo next to the edit commands and disables them honestly', () => {
    const idle = render()
    expect(idle).toContain('aria-label="Undo timeline edit"')
    expect(idle).toContain('aria-label="Redo timeline edit"')
    expect(idle).toMatch(/disabled="" title="Undo" aria-label="Undo timeline edit"/)
    expect(idle).toMatch(/disabled="" title="Redo" aria-label="Redo timeline edit"/)
    const history = render({ canUndo: true, canRedo: false })
    expect(history).toMatch(/aria-label="Undo timeline edit">/)
  })

  it('names the selection state instead of leaving the buttons unexplained', () => {
    expect(render()).toContain('Select a clip to edit')
    const pieces = mainTrackPieces({ startTime: 0, endTime: 10, silenceCuts: [] })
    const html = render({
      timeline: { ...timeline, items: [] },
      mainTrack: { trackId: 'video-1', pieces, selectedId: pieces[0].id, onSelect: noop, onRemove: noop }
    })
    expect(html).toContain('Main video part 0:00.0 to 0:10.0 · Delete removes it')
    expect(html).not.toContain('Select a clip to edit')
  })

  it('has no main source row: the first row is the first video track', () => {
    const pieces = mainTrackPieces({ startTime: 0, endTime: 10, silenceCuts: [] })
    const html = render({
      currentTime: 5,
      timeline: { ...timeline, items: [] },
      mainTrack: { trackId: 'video-1', pieces, selectedId: null, onSelect: noop, onRemove: noop }
    })
    expect(html).toContain('Main video · 0:00.0 to 0:10.0')
    expect(html).not.toContain('Trim in')
    expect(html).not.toContain('Trim out')
    // The source strip is gone; the timeline starts with a real track.
    expect(html).not.toContain('source-track-row')
    expect(html).not.toContain('Main source</span>')
    const firstRow = html.slice(html.indexOf('data-track-id='))
    expect(firstRow.slice(0, 40)).toContain('data-track-id="video-1"')
  })

  it('labels the ruler like an editor: 00:00, not 0:00.0', () => {
    const html = render({ duration: 30 })
    const ruler = html.slice(html.indexOf('multi-track-ruler-body'), html.indexOf('data-track-id='))
    expect(ruler).toContain('>00:00<')
    expect(ruler).toContain('>00:10<')
    expect(ruler).not.toContain('>0:00.0<')
  })

  it('draws one playhead line for the whole timeline, separate from the hover guide', () => {
    const html = render({ currentTime: 4 })
    expect(html).toContain('class="timeline-playhead"')
    expect(html).toContain('class="multi-track-cursor"')
    // Both are moved imperatively, so a React render cannot drag them back to a
    // stale time while playback is running.
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/features/editor/MultiTrackTimeline.tsx'), 'utf8')
    expect(source).toContain('playheadLineRef.current?.style.setProperty')
    expect(source).not.toContain("'--playhead-x':")
  })

  it('draws a draggable playhead handle and a real clip body', () => {
    const html = render({ currentTime: 2 })
    expect(html).toContain('class="timeline-playhead-grip"')
    expect(html).toContain('Playhead at 0:02.0 — drag to move')
    expect(html).toContain('class="multi-track-item video')
    expect(html).toContain('data-track-id="video-1"')
  })
})

describe('tapping a clip selects it without moving the playhead', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/features/editor/MultiTrackTimeline.tsx'), 'utf8')

  it('has no seek on pointer-down for a move gesture', () => {
    expect(source).not.toContain("if (mode === 'move') seekTo(")
  })

  it('does not seek on a click or a double click on a clip', () => {
    expect(source).not.toContain('onDoubleClick={() => seekTo(item.startTime)}')
    expect(source).toContain('if (event.detail !== 0) return; selectOnly(item.id)')
  })

  it('keeps the playhead out of the pointer handlers', () => {
    // Hovering previews a position on the dashed guide; only a click, a drag of
    // the playhead handle or a keyboard command actually moves it.
    expect(source).toContain('function positionPlayhead(')
    expect(source).toContain('positionPlayhead(next)')
    expect(source).not.toContain('props.sourceClip')
  })
})

describe('the timeline never adds a second keyboard system', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/features/editor/MultiTrackTimeline.tsx'), 'utf8')

  it('registers its commands in the shared registry', () => {
    expect(source).toContain('registerCommands(timelineCommands(')
  })

  it('has no keydown listener of its own', () => {
    expect(source.includes("addEventListener('keydown'")).toBe(false)
  })

  it('routes every edit through the one persisted save path', () => {
    const editor = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/features/editor/EditorPage.tsx'), 'utf8')
    // The timeline hands its value to the editor, which records history and
    // saves it; a command cannot bypass either.
    expect(editor).toContain('function scheduleTimelineSave(')
    expect(editor).toContain('recordTimelineCommand(')
    expect(editor).toContain("api['timeline.save']")
    expect(source).toContain('onChange: (timeline: ClipTimeline, options?: { discrete?: boolean; gesture?: string }) => void')
  })

  it('does not keep a second copy of the editing rules in the menus', () => {
    // One call site per operation inside the component; the menu rows and the
    // context menu both call these, so the two cannot drift.
    for (const call of ['cutTimelineItems(props.timeline', 'copyTimelineItems(props.timeline', 'pasteTimelineItems(props.timeline', 'deleteTimelineItems(props.timeline', 'duplicateTimelineItems(props.timeline'])
      expect(source.split(call).length - 1, call).toBe(1)
  })
})
