import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppUpdateStatus } from '@shared/ipc'

/**
 * The preload bridge is the ONLY surface between the renderer and the
 * privileged backend: a generic validated invoke plus narrowly typed app and
 * update APIs. No raw ipcRenderer, no Node APIs, no filesystem exposure.
 */

const api = {
  invoke(method: string, payload: unknown): Promise<{ ok: true; value: unknown } | { ok: false; error: { code: string; message: string; hint?: string; details?: string } }> {
    return ipcRenderer.invoke('api:invoke', { method, payload })
  },
  onEvent(callback: (event: unknown) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on('app:event', listener)
    return () => {
      ipcRenderer.removeListener('app:event', listener)
    }
  },
  /** Resolve OS paths for Explorer-dropped File objects without exposing fs/path to the renderer. */
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
  checkForUpdates(): Promise<AppUpdateStatus> {
    return ipcRenderer.invoke('app:update:check')
  },
  downloadUpdate(): Promise<void> {
    return ipcRenderer.invoke('app:update:download')
  },
  installUpdate(): Promise<void> {
    return ipcRenderer.invoke('app:update:install')
  },
  onUpdateStatus(callback: (status: AppUpdateStatus) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus) => callback(status)
    ipcRenderer.on('app:update-status', listener)
    return () => ipcRenderer.removeListener('app:update-status', listener)
  }
}

contextBridge.exposeInMainWorld('clipwright', api)
