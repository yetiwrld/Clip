/**
 * Reads and writes the remembered workspace layout.
 *
 * Persistence goes through the settings document that already exists — the same
 * validated `settings.update` path every other preference uses — so a layout
 * survives a restart without a second storage mechanism.
 *
 * Writes are explicit: a drag updates local state for every pointer move and
 * calls `update` once, when the user lets go. That is the difference between a
 * preference and a stream of writes.
 */

import { useCallback, useMemo } from 'react'
import type { WorkspaceSettings } from '@shared/types'
import { useAppStore } from '../../stores/app'
import { DEFAULT_WORKSPACE, WORKSPACE_PRESETS, mergeWorkspace, normalizeWorkspace, type WorkspacePreset } from './layout'

/** Saves a patch on top of the stored layout. Safe to call before settings load. */
export async function saveWorkspace(patch: Partial<WorkspaceSettings>): Promise<boolean> {
  const store = useAppStore.getState()
  const next = mergeWorkspace(store.settings?.workspace, patch)
  return store.saveSettings({ workspace: next })
}

export function useWorkspaceLayout(): {
  layout: WorkspaceSettings
  update: (patch: Partial<WorkspaceSettings>) => void
} {
  const stored = useAppStore((state) => state.settings?.workspace)
  // Settings objects are replaced on save, so this recomputes exactly when the
  // saved layout changes — never on unrelated re-renders.
  const layout = useMemo(() => normalizeWorkspace(stored), [stored])
  const update = useCallback((patch: Partial<WorkspaceSettings>) => {
    void saveWorkspace(patch)
  }, [])
  return { layout, update }
}

export function resetWorkspaceLayout(): Promise<boolean> {
  return saveWorkspace({ ...DEFAULT_WORKSPACE, openInspectorSections: [...DEFAULT_WORKSPACE.openInspectorSections] })
}

export function applyWorkspacePreset(preset: WorkspacePreset): Promise<boolean> {
  return saveWorkspace(preset.layout)
}

/** Re-exported so screens can use the presets without importing two modules. */
export { WORKSPACE_PRESETS, DEFAULT_WORKSPACE }
