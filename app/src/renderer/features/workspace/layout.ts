/**
 * Workspace layout: the pure part.
 *
 * Every number the user can drag lives here with its allowed range, its
 * default and the rules that turn a stored value back into something usable.
 * Keeping this JSX-free means the layout can be tested without a browser and
 * the same limits can be reused by the settings screen, the resize handles and
 * the "Reset layout" action without copying numbers into each of them.
 *
 * The CSS owns the layout itself. These values only become custom properties
 * (`--sidebar-w`, `--editor-tool-w`, `--editor-inspector-w`), so the existing
 * grid templates stay in charge of how the shell is arranged.
 */

import type { WorkspaceSettings } from '@shared/types'

export const SIDEBAR_LIMIT = { min: 180, max: 380 } as const
export const TOOL_PANEL_LIMIT = { min: 200, max: 360 } as const
export const INSPECTOR_LIMIT = { min: 260, max: 460 } as const
/** Matches `TIMELINE_HEIGHT_MIN` in the shared editor helpers. */
export const TIMELINE_LIMIT = { min: 220, max: 900 } as const

/** Ids of the collapsible sections in the editor's properties panel. */
export const INSPECTOR_SECTION_IDS = [
  'trim',
  'silence',
  'audio-restoration',
  'captions',
  'crop',
  'camera',
  'text',
  'output',
  'metadata'
] as const

export type InspectorSectionId = (typeof INSPECTOR_SECTION_IDS)[number]

export const DEFAULT_WORKSPACE: WorkspaceSettings = {
  sidebarWidth: 198,
  sidebarCollapsed: false,
  editorToolPanelWidth: 268,
  editorToolPanelCollapsed: false,
  editorInspectorWidth: 316,
  editorInspectorCollapsed: false,
  editorTimelineHeight: null,
  openInspectorSections: ['trim']
}

/** Rounds to whole pixels and keeps the value inside its range. */
export function clampPane(value: number, limit: { min: number; max: number }, fallback = limit.min): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(limit.max, Math.max(limit.min, Math.round(value)))
}

/** Only a real number counts; `null`, `"wide"` and `undefined` are not widths. */
function numberOr(value: unknown, limit: { min: number; max: number }, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clampPane(value, limit, fallback) : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function sectionsOr(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const known = new Set<string>(INSPECTOR_SECTION_IDS)
  const seen = new Set<string>()
  for (const entry of value) {
    // Unknown ids are dropped rather than shown as broken sections: a layout
    // saved by an older build must still open, just without that section open.
    if (typeof entry === 'string' && known.has(entry)) seen.add(entry)
  }
  return [...seen]
}

/**
 * Turns anything (a stored document, an old shape, `undefined`) into a layout
 * that can be rendered as-is. Fields are repaired one at a time so a single bad
 * number never costs the user every other choice they made.
 */
export function normalizeWorkspace(value: unknown): WorkspaceSettings {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const timeline = source.editorTimelineHeight
  return {
    sidebarWidth: numberOr(source.sidebarWidth, SIDEBAR_LIMIT, DEFAULT_WORKSPACE.sidebarWidth),
    sidebarCollapsed: booleanOr(source.sidebarCollapsed, DEFAULT_WORKSPACE.sidebarCollapsed),
    editorToolPanelWidth: numberOr(source.editorToolPanelWidth, TOOL_PANEL_LIMIT, DEFAULT_WORKSPACE.editorToolPanelWidth),
    editorToolPanelCollapsed: booleanOr(source.editorToolPanelCollapsed, DEFAULT_WORKSPACE.editorToolPanelCollapsed),
    editorInspectorWidth: numberOr(source.editorInspectorWidth, INSPECTOR_LIMIT, DEFAULT_WORKSPACE.editorInspectorWidth),
    editorInspectorCollapsed: booleanOr(source.editorInspectorCollapsed, DEFAULT_WORKSPACE.editorInspectorCollapsed),
    editorTimelineHeight:
      typeof timeline === 'number' && Number.isFinite(timeline)
        ? Math.min(TIMELINE_LIMIT.max, Math.max(TIMELINE_LIMIT.min, Math.round(timeline)))
        : null,
    openInspectorSections: sectionsOr(source.openInspectorSections, DEFAULT_WORKSPACE.openInspectorSections)
  }
}

/** Applies a patch, then re-clamps it, so every saved document stays valid. */
export function mergeWorkspace(current: unknown, patch: Partial<WorkspaceSettings>): WorkspaceSettings {
  return normalizeWorkspace({ ...normalizeWorkspace(current), ...patch })
}

export interface WorkspacePreset {
  id: string
  label: string
  hint: string
  layout: WorkspaceSettings
}

/**
 * Only two presets, and only because they answer a real question: do you want
 * the stage big, or the controls big? Everything else is a click away by
 * dragging, so a longer menu would just be clutter.
 */
export const WORKSPACE_PRESETS: WorkspacePreset[] = [
  {
    id: 'stage',
    label: 'Wide stage',
    hint: 'Hides the sidebar and the tool panel. The player and timeline get the room.',
    layout: {
      ...DEFAULT_WORKSPACE,
      sidebarCollapsed: true,
      editorToolPanelCollapsed: true,
      editorInspectorWidth: 300,
      editorInspectorCollapsed: false
    }
  },
  {
    id: 'properties',
    label: 'Wide properties',
    hint: 'Hides the tool panel and opens the properties panel at its widest.',
    layout: {
      ...DEFAULT_WORKSPACE,
      editorToolPanelCollapsed: true,
      editorInspectorCollapsed: false,
      editorInspectorWidth: 420
    }
  }
]

/** One line summary of the saved layout, for the settings screen. */
export function layoutSummary(layout: WorkspaceSettings): string {
  const sidebar = layout.sidebarCollapsed ? 'Sidebar hidden' : `Sidebar ${layout.sidebarWidth} px`
  const toolPanel = layout.editorToolPanelCollapsed ? 'Tool panel hidden' : `Tool panel ${layout.editorToolPanelWidth} px`
  const inspector = layout.editorInspectorCollapsed ? 'Properties hidden' : `Properties ${layout.editorInspectorWidth} px`
  return `${sidebar} · ${toolPanel} · ${inspector}`
}

/** True when the layout is already the default, so "Reset" can be disabled. */
export function isDefaultWorkspace(value: unknown): boolean {
  const layout = normalizeWorkspace(value)
  return (Object.keys(DEFAULT_WORKSPACE) as Array<keyof WorkspaceSettings>).every((key) =>
    key === 'openInspectorSections'
      ? layout.openInspectorSections.length === DEFAULT_WORKSPACE.openInspectorSections.length &&
        layout.openInspectorSections.every((id) => DEFAULT_WORKSPACE.openInspectorSections.includes(id))
      : layout[key] === DEFAULT_WORKSPACE[key]
  )
}
