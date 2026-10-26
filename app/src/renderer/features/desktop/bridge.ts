/**
 * The one place the renderer talks to the desktop shell.
 *
 * Everything here is optional: in the browser preview `window.clipwright` does
 * not exist, and each helper then does nothing (or returns an empty result)
 * instead of throwing. Screens call these helpers, never `window.clipwright`
 * directly, so the preview keeps working without a second code path.
 */

import type { AppNavTarget } from '@shared/ipc'

function bridge(): NonNullable<Window['clipwright']> | null {
  if (typeof window === 'undefined') return null
  return window.clipwright ?? null
}

export const isDesktopShell = (): boolean => Boolean(bridge())

/** Announce the renderer and take whatever Windows handed over in the meantime. */
export async function announceRendererReady(): Promise<{ paths: string[]; projectId: string | null }> {
  const shell = bridge()
  if (!shell?.rendererReady) return { paths: [], projectId: null }
  try {
    const result = await shell.rendererReady()
    return { paths: Array.isArray(result?.paths) ? result.paths : [], projectId: result?.projectId ?? null }
  } catch {
    return { paths: [], projectId: null }
  }
}

export function onOpenFiles(callback: (paths: string[]) => void): () => void {
  const shell = bridge()
  if (!shell?.onOpenFiles) return () => undefined
  return shell.onOpenFiles(callback)
}

export function onNavigate(callback: (target: AppNavTarget) => void): () => void {
  const shell = bridge()
  if (!shell?.onNavigate) return () => undefined
  return shell.onNavigate(callback)
}

/** Taskbar progress. null clears it; 0–1 is a real fraction. */
export function setTaskbarProgress(progress: number | null): void {
  bridge()?.setTaskbarProgress?.(progress)
}

export function setCloseGuard(hasUnsavedWork: boolean): void {
  bridge()?.setCloseGuard?.(hasUnsavedWork)
}

export function setDesktopPreferences(preferences: { notificationsEnabled: boolean }): void {
  bridge()?.setDesktopPreferences?.(preferences)
}

export function onFlushRequest(callback: () => void): () => void {
  const shell = bridge()
  if (!shell?.onFlushRequest) return () => undefined
  return shell.onFlushRequest(callback)
}

export function answerFlush(saved: boolean): void {
  bridge()?.flushDone?.(saved)
}
