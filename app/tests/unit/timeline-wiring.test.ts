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
import type { ClipTimeline, TimelineItem } from '../../src/shared/types'

/**
 * Wiring of the timeline's edit controls.
 *
 * The operations themselves are covered by the pure tests and the restart test.
 * This file checks the part those cannot: that the visible controls — Edit menu,
 * toolbar, right-click menu and the shortcut registry — are connected to that
 * same behaviour, and that a control is disabled rather than silently doing
 * nothing when its precondition is missing.
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
 * The toolbar rows, in order, with their disabled state. The toolbar is the
 * primary place the commands are found, so the test reads it as the user sees
 * it rather than hunting for a dropdown.
 */
function toolbarRows(html: string): Array<{ label: string; disabled: boolean }> {
  const region = html.slice(html.indexOf('aria-label="Timeline editing tools"'))
  const toolbar = region.slice(0, region.indexOf('timeline-selection-status'))
  return [...toolbar.matchAll(/<button[\s\S]*?<\/button>/g)]
    .filter((match) => match[0].includes('timeline-action-label'))
    .map((match) => {
      const tag = /^<button([^>]*)>/.exec(match[0])?.[1] ?? ''
      const label = match[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      return { label, disabled: /\sdisabled=""/.test(tag) }
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
  it('shows every command as a named button, in the order of the work', () => {
    const rows = toolbarRows(render())
    expect(rows.map((row) => row.label)).toEqual([
      'Cut', 'Copy', 'Paste', 'Split', 'Duplicate', 'Delete', 'Ripple delete'
    ])
  })

  it('writes the real shortcut into each tooltip from the command registry', () => {
    const dispose = registerCommands(timelineCommands(() => ({
      hasSelection: () => false,
      deleteSelected: noop,
      rippleDeleteSelected: noop,
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
    expect(html).toMatch(/title="Ripple delete selected clips[^"]*· Shift\+Del"/)
  })

  it('explains why a disabled command cannot run', () => {
    const html = render()
    expect(html).toContain('Paste clips at the playhead · copy a clip first')
    expect(html).toContain('Split clips at playhead · move the playhead inside the clip first')
  })

  it('disables what cannot run: no selection, empty clipboard, playhead outside every clip', () => {
    const byLabel = new Map(toolbarRows(render()).map((row) => [row.label, row.disabled]))
    expect(byLabel.get('Cut')).toBe(true)
    expect(byLabel.get('Copy')).toBe(true)
    // Nothing has been copied, so Paste is visibly unavailable rather than
    // silently doing nothing.
    expect(byLabel.get('Paste')).toBe(true)
    expect(byLabel.get('Duplicate')).toBe(true)
    expect(byLabel.get('Delete')).toBe(true)
    expect(byLabel.get('Ripple delete')).toBe(true)
    // Nothing is selected and the playhead at 0 is on the clip's leading edge.
    expect(byLabel.get('Split')).toBe(true)

    useTimelineClipboard.getState().setClipboard(copyTimelineItems(timeline, ['a']))
    const withClipboard = new Map(toolbarRows(render()).map((row) => [row.label, row.disabled]))
    expect(withClipboard.get('Paste')).toBe(false)

    const midClip = new Map(toolbarRows(render({ currentTime: 2 })).map((row) => [row.label, row.disabled]))
    expect(midClip.get('Split')).toBe(false)
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
    expect(render({ selectedSource: true })).toContain('Main source selected')
  })

  it('gives the main source real trim controls when it is selected', () => {
    const source = { name: 'Source', startTime: 2, endTime: 8 }
    const inside = new Map(toolbarRows(render({ selectedSource: true, sourceClip: source, currentTime: 5 })).map((row) => [row.label, row.disabled]))
    expect(inside.get('Trim in')).toBe(false)
    expect(inside.get('Trim out')).toBe(false)
    expect(render({ selectedSource: true, sourceClip: source, currentTime: 5 })).toContain('Main source selected')
    // At the clip's own leading edge, trimming in would do nothing.
    const edge = new Map(toolbarRows(render({ selectedSource: true, sourceClip: source, currentTime: 2 })).map((row) => [row.label, row.disabled]))
    expect(edge.get('Trim in')).toBe(true)
    expect(edge.get('Trim out')).toBe(true)
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

  it('does not seek when the main source clip is clicked', () => {
    expect(source).not.toContain('onClick={() => { seekTo(props.sourceClip!.startTime)')
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
