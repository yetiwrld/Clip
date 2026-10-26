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

/** The Edit menu's rows, in order, with their disabled state. */
function menuRows(html: string): Array<{ label: string; disabled: boolean }> {
  const region = html.slice(html.indexOf('aria-label="Timeline edit actions"'))
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

describe('timeline edit menu', () => {
  it('offers the real commands with the real shortcut next to them', () => {
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
    const html = render()
    dispose()

    const rows = menuRows(html)
    expect(rows.map((row) => row.label)).toEqual([
      'Cut', 'Copy', 'Paste at playhead', 'Duplicate', 'Split at playhead',
      'Delete', 'Ripple delete', 'Select all clips', 'Snapping on'
    ])
    // The shortcut shown in the menu is read from the command registry, not
    // typed out a second time.
    expect(html).toContain('Ctrl+X')
    expect(html).toContain('Ctrl+V')
    expect(html).toContain('Shift+S')
  })

  it('disables what cannot run: no selection, empty clipboard, playhead outside every clip', () => {
    const rows = menuRows(render())
    const byLabel = new Map(rows.map((row) => [row.label, row.disabled]))
    expect(byLabel.get('Cut')).toBe(true)
    expect(byLabel.get('Copy')).toBe(true)
    expect(byLabel.get('Paste at playhead')).toBe(true)
    expect(byLabel.get('Duplicate')).toBe(true)
    expect(byLabel.get('Delete')).toBe(true)
    // Nothing is selected and the playhead at 0 is on the clip's leading edge.
    expect(byLabel.get('Split at playhead')).toBe(true)

    useTimelineClipboard.getState().setClipboard(copyTimelineItems(timeline, ['a']))
    const withClipboard = new Map(menuRows(render()).map((row) => [row.label, row.disabled]))
    expect(withClipboard.get('Paste at playhead')).toBe(false)

    const midClip = new Map(menuRows(render({ currentTime: 2 })).map((row) => [row.label, row.disabled]))
    expect(midClip.get('Split at playhead')).toBe(false)
  })

  it('keeps the toolbar buttons connected and named for screen readers', () => {
    const html = render({ currentTime: 2 })
    expect(html).toContain('aria-label="Split clips at playhead"')
    expect(html).toContain('aria-label="Duplicate selected clips"')
    expect(html).toContain('aria-label="Delete selected clips"')
    expect(html).toContain('aria-label="Edit menu"')
    expect(html).toContain('aria-label="Snapping on"')
    expect(html).toContain('aria-pressed="true"')
    // A clip is a real element on its track, not a picture of one.
    expect(html).toContain('class="multi-track-item video')
    expect(html).toContain('data-track-id="video-1"')
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
