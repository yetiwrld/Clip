import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { appSettingsSchema } from '../../src/shared/schemas'
import {
  DEFAULT_WORKSPACE,
  INSPECTOR_SECTION_IDS,
  INSPECTOR_LIMIT,
  SIDEBAR_LIMIT,
  TIMELINE_LIMIT,
  TOOL_PANEL_LIMIT,
  WORKSPACE_PRESETS,
  clampPane,
  isDefaultWorkspace,
  layoutSummary,
  mergeWorkspace,
  normalizeWorkspace
} from '../../src/renderer/features/workspace/layout'
import { settingsRepo } from '../../src/main/services/database/repositories'

/**
 * The workspace layout is a preference, so the interesting cases are the ugly
 * ones: a value from an older build, a number from a hand-edited file, a width
 * saved on a big screen and opened on a small one. This file covers those, plus
 * the contract that the CSS and the components keep using the same numbers.
 */

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, 'src', 'renderer', file), 'utf8')
const css = read('styles/global.css')

describe('layout defaults', () => {
  it('matches what the stylesheet renders with no saved layout', () => {
    // --sidebar-w is the shell default; the two editor panels default to the
    // upper bound of their original minmax() tracks.
    expect(css).toContain('--sidebar-w: 198px')
    expect(css).toContain('--editor-tool-w: 268px')
    expect(css).toContain('--editor-inspector-w: 316px')
    expect(DEFAULT_WORKSPACE.sidebarWidth).toBe(198)
    expect(DEFAULT_WORKSPACE.editorToolPanelWidth).toBe(268)
    expect(DEFAULT_WORKSPACE.editorInspectorWidth).toBe(316)
  })

  it('starts with every panel visible and only the trim section open', () => {
    expect(DEFAULT_WORKSPACE.sidebarCollapsed).toBe(false)
    expect(DEFAULT_WORKSPACE.editorToolPanelCollapsed).toBe(false)
    expect(DEFAULT_WORKSPACE.editorInspectorCollapsed).toBe(false)
    expect(DEFAULT_WORKSPACE.openInspectorSections).toEqual(['trim'])
    // A null timeline height means "fit this window" instead of a number
    // remembered from a different screen.
    expect(DEFAULT_WORKSPACE.editorTimelineHeight).toBeNull()
  })

  it('keeps the repository defaults, the schema and the renderer in step', () => {
    const defaults = settingsRepo.defaults()
    expect(defaults.workspace).toEqual(DEFAULT_WORKSPACE)
    expect(appSettingsSchema.safeParse(defaults).success).toBe(true)
    expect(normalizeWorkspace(defaults.workspace)).toEqual(DEFAULT_WORKSPACE)
  })
})

describe('clampPane', () => {
  it('rounds and keeps values inside the range', () => {
    expect(clampPane(210.6, SIDEBAR_LIMIT)).toBe(211)
    expect(clampPane(10, SIDEBAR_LIMIT)).toBe(SIDEBAR_LIMIT.min)
    expect(clampPane(9999, SIDEBAR_LIMIT)).toBe(SIDEBAR_LIMIT.max)
  })

  it('falls back for values that are not numbers', () => {
    expect(clampPane(Number.NaN, TOOL_PANEL_LIMIT, 268)).toBe(268)
    // A value that is not finite is not a width either: use the pane default.
    expect(clampPane(Number.POSITIVE_INFINITY, TOOL_PANEL_LIMIT, 268)).toBe(268)
  })
})

describe('normalizeWorkspace', () => {
  it('repairs one bad field without discarding the others', () => {
    const layout = normalizeWorkspace({
      sidebarWidth: 999,
      sidebarCollapsed: true,
      editorToolPanelWidth: 'wide',
      editorInspectorWidth: 340,
      editorInspectorCollapsed: true,
      editorTimelineHeight: 300,
      openInspectorSections: ['trim', 'captions']
    })
    expect(layout.sidebarWidth).toBe(SIDEBAR_LIMIT.max)
    expect(layout.sidebarCollapsed).toBe(true)
    expect(layout.editorToolPanelWidth).toBe(DEFAULT_WORKSPACE.editorToolPanelWidth)
    expect(layout.editorInspectorWidth).toBe(340)
    expect(layout.editorInspectorCollapsed).toBe(true)
    expect(layout.editorTimelineHeight).toBe(300)
    expect(layout.openInspectorSections).toEqual(['trim', 'captions'])
  })

  it('turns anything that is not a layout into the defaults', () => {
    for (const value of [undefined, null, 42, 'layout', [], { sidebarWidth: null }]) {
      expect(normalizeWorkspace(value)).toMatchObject({
        sidebarCollapsed: false,
        editorToolPanelCollapsed: false,
        editorInspectorCollapsed: false,
        editorTimelineHeight: null
      })
      expect(normalizeWorkspace(value).sidebarWidth).toBe(DEFAULT_WORKSPACE.sidebarWidth)
    }
  })

  it('drops section ids this build does not know', () => {
    const layout = normalizeWorkspace({ openInspectorSections: ['trim', 'gone', 'trim', 42, 'metadata'] })
    expect(layout.openInspectorSections).toEqual(['trim', 'metadata'])
    expect(INSPECTOR_SECTION_IDS).toContain('metadata')
  })

  it('keeps an empty section list, because closed is a real choice', () => {
    expect(normalizeWorkspace({ openInspectorSections: [] }).openInspectorSections).toEqual([])
  })

  it('keeps a timeline height inside the shared editor limits', () => {
    expect(normalizeWorkspace({ editorTimelineHeight: 10 }).editorTimelineHeight).toBe(TIMELINE_LIMIT.min)
    expect(normalizeWorkspace({ editorTimelineHeight: 5000 }).editorTimelineHeight).toBe(TIMELINE_LIMIT.max)
    expect(normalizeWorkspace({ editorTimelineHeight: 300.4 }).editorTimelineHeight).toBe(300)
  })
})

describe('saving a patch', () => {
  it('clamps before the value can reach the schema', () => {
    const next = mergeWorkspace(DEFAULT_WORKSPACE, { sidebarWidth: 5000, editorInspectorWidth: 12 })
    expect(next.sidebarWidth).toBe(SIDEBAR_LIMIT.max)
    expect(next.editorInspectorWidth).toBe(INSPECTOR_LIMIT.min)
    expect(appSettingsSchema.shape.workspace.safeParse(next).success).toBe(true)
  })

  it('ignores keys the layout does not own', () => {
    const next = mergeWorkspace(DEFAULT_WORKSPACE, { nonsense: true } as never)
    expect(next).toEqual(DEFAULT_WORKSPACE)
  })
})

describe('workspace schema', () => {
  const base = settingsRepo.defaults()

  it('rejects a width outside the documented range', () => {
    const tooWide = { ...base, workspace: { ...base.workspace, sidebarWidth: 900 } }
    expect(appSettingsSchema.safeParse(tooWide).success).toBe(false)
    const tooNarrow = { ...base, workspace: { ...base.workspace, editorToolPanelWidth: 40 } }
    expect(appSettingsSchema.safeParse(tooNarrow).success).toBe(false)
  })

  it('rejects a fractional pixel width', () => {
    const fractional = { ...base, workspace: { ...base.workspace, editorInspectorWidth: 300.5 } }
    expect(appSettingsSchema.safeParse(fractional).success).toBe(false)
  })

  it('rejects an unreadable collapsed flag', () => {
    const broken = { ...base, workspace: { ...base.workspace, sidebarCollapsed: 'yes' } }
    expect(appSettingsSchema.safeParse(broken).success).toBe(false)
  })
})

describe('presets', () => {
  it('produce layouts that pass the same schema as a saved document', () => {
    for (const preset of WORKSPACE_PRESETS) {
      const layout = mergeWorkspace(DEFAULT_WORKSPACE, preset.layout)
      expect(layout).toEqual(preset.layout)
      expect(appSettingsSchema.shape.workspace.safeParse(layout).success, preset.id).toBe(true)
    }
  })

  it('answer two different questions instead of repeating the default', () => {
    const ids = WORKSPACE_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    const stage = WORKSPACE_PRESETS.find((preset) => preset.id === 'stage')!
    expect(stage.layout.sidebarCollapsed).toBe(true)
    expect(stage.layout.editorToolPanelCollapsed).toBe(true)
    const properties = WORKSPACE_PRESETS.find((preset) => preset.id === 'properties')!
    expect(properties.layout.editorInspectorCollapsed).toBe(false)
    expect(properties.layout.editorInspectorWidth).toBeGreaterThan(DEFAULT_WORKSPACE.editorInspectorWidth)
    for (const preset of WORKSPACE_PRESETS) expect(preset.hint.length).toBeGreaterThan(10)
  })
})

describe('reset and summary', () => {
  it('knows when the layout is already the default', () => {
    expect(isDefaultWorkspace(undefined)).toBe(true)
    expect(isDefaultWorkspace(DEFAULT_WORKSPACE)).toBe(true)
    expect(isDefaultWorkspace({ ...DEFAULT_WORKSPACE, sidebarCollapsed: true })).toBe(false)
    expect(isDefaultWorkspace({ ...DEFAULT_WORKSPACE, openInspectorSections: [] })).toBe(false)
    expect(isDefaultWorkspace({ ...DEFAULT_WORKSPACE, openInspectorSections: ['trim'] })).toBe(true)
  })

  it('describes hidden panels in plain words', () => {
    expect(layoutSummary(DEFAULT_WORKSPACE)).toBe('Sidebar 198 px · Tool panel 268 px · Properties 316 px')
    expect(layoutSummary(normalizeWorkspace({ sidebarCollapsed: true, editorInspectorCollapsed: true })))
      .toBe('Sidebar hidden · Tool panel 268 px · Properties hidden')
  })
})

describe('the shell and editor read these values, not their own copies', () => {
  const app = read('App.tsx')
  const editor = read('features/editor/EditorPage.tsx')

  it('passes the remembered sidebar width to the grid as a custom property', () => {
    expect(app).toContain("'--sidebar-w': `${sidebarWidth}px`")
    expect(app).toContain('SIDEBAR_LIMIT')
    expect(app).toContain('data-sidebar={sidebarCollapsed')
  })

  it('does not keep a second copy of the layout in localStorage', () => {
    expect(editor).not.toContain('clipwright.editor.timelineHeight')
    expect(app).not.toContain('localStorage')
    expect(editor).toContain('workspaceLayout.editorTimelineHeight')
    expect(editor).toContain('editorTimelineHeight: Math.round(height)')
  })

  it('persists on release, not on every pointer move', () => {
    // The handle reports movement through onChange; each pane saves in onCommit.
    expect(editor).toContain('onCommit={(width) => updateWorkspace({ editorToolPanelWidth: width })}')
    expect(editor).toContain('onCommit={(width) => updateWorkspace({ editorInspectorWidth: width })}')
    expect(app).toContain('onCommit={(width) => updateLayout({ sidebarWidth: width })}')
  })

  it('has a way back from every collapsed panel', () => {
    expect(app).toContain('aria-label={sidebarCollapsed ? \'Show the sidebar\' : \'Hide the sidebar\'}')
    expect(editor).toContain('aria-label={workspaceLayout.editorToolPanelCollapsed ? \'Show the tool panel\' : \'Hide the tool panel\'}')
    expect(editor).toContain('className="btn ghost sm icon inspector-show-toggle"')
  })
})

describe('stylesheet contract', () => {
  it('lets a collapsed panel give its column back', () => {
    expect(css).toContain('.editor-shell[data-tools="collapsed"] .editor-body')
    expect(css).toContain('--editor-tool-track: 0px')
    expect(css).toContain('.editor-shell[data-inspector="collapsed"] .editor-body')
    expect(css).toContain('--editor-inspector-track: 0px')
    expect(css).toContain('.app-shell[data-sidebar="collapsed"]')
  })

  it('keeps the saved width but caps it at every breakpoint', () => {
    for (const cap of ['228px', '212px', '200px']) {
      expect(css).toContain(`min(var(--editor-tool-w), ${cap})`)
    }
    expect(css).toContain('minmax(212px, var(--editor-tool-w))')
    expect(css).toContain('minmax(276px, var(--editor-inspector-w))')
  })

  it('hides a divider that could not change anything', () => {
    expect(css).toMatch(/@media \(max-width: 1100px\) \{\s*\.sidebar-resizer \{\s*display: none;/)
    expect(css).toMatch(/@media \(max-width: 1180px\) \{\s*\.stage-resizer \{\s*display: none;/)
  })

  it('gives the dividers a visible keyboard focus and a drag cursor', () => {
    expect(css).toContain('.pane-resizer:focus-visible {')
    expect(css).toContain('outline: var(--focus-ring) solid var(--accent)')
    expect(css).toContain('body[data-resizing="col"]')
    expect(css).toContain('body[data-resizing="row"]')
  })

  it('keeps the collapsed rail labelled for screen readers', () => {
    expect(css).toContain('.app-shell[data-sidebar="collapsed"] .nav-label')
    expect(css).toContain('clip-path: inset(50%)')
    // The labels are visually hidden, not display:none, so they stay the name.
    expect(css).not.toContain('.app-shell[data-sidebar="collapsed"] .nav-label {\n  display: none;')
  })

  it('animates nothing that a resize did not ask for', () => {
    const block = css.slice(css.indexOf('WORKSPACE LAYOUT'))
    expect((block.match(/transition:/g) ?? []).length).toBe(1)
    expect(block).not.toContain('@keyframes')
    expect(block).not.toContain('infinite')
  })
})
