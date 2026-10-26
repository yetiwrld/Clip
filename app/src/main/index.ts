import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, protocol, safeStorage, net, screen, Notification, ClipboardItem } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AppEvent } from '@shared/types'
import type { AppNavTarget, AppUpdateStatus } from '@shared/ipc'
import { createAppContext } from './services/app-context'
import { createBackend, type Backend } from './ipc/backend'
import { toStructuredError } from '@shared/errors'
import { DEFAULT_WINDOW_SIZE, MIN_WINDOW_SIZE, normalizeWindowState, serializeWindowState, type StoredWindowState, type WorkArea } from './desktop/window-state'
import { readWindowState, writeWindowState } from './desktop/window-state-file'
import { DesktopNotifier, notificationForEvent } from './desktop/notifications'
import { openablePaths } from './desktop/open-files'
import { projectIdFromArgs, userTasksForProjects } from './desktop/jump-list'

/**
 * Electron bootstrap. This is the ONLY file that imports Electron —
 * everything below the backend boundary is plain Node and shared with the
 * browser preview server and the test suite (ADR-007).
 */

// The workspace directory name is configuration, not a hard-coded product
// identity (spec §8). Override with CLIPWRIGHT_WORKSPACE for dev/tests.
const WORKSPACE_DIR_NAME = 'ClipwrightStudio'

/**
 * Windows shows notifications and taskbar features only for an app with an
 * explicit identity. This must match `appId` in electron-builder.yml, or the
 * toast appears with no name and the taskbar groups the window separately.
 */
if (process.platform === 'win32') app.setAppUserModelId('com.clipwright.studio')

let mainWindow: BrowserWindow | null = null
let backend: Backend | null = null
let updateStatus: AppUpdateStatus = { state: 'idle' }
let updateVersion = ''
let updateCheckInFlight: Promise<AppUpdateStatus> | null = null

// ---------------------------------------------------------------- desktop --
/** Files Windows asked us to open before the renderer was listening. */
let pendingOpenPaths: string[] = []
let pendingProjectId: string | null = null
/** A notification click or jump-list task that needs the window to exist first. */
let pendingNavigation: AppNavTarget | null = null
let rendererReady = false
/** What the renderer last told us; main never guesses about unsaved work. */
let rendererHasUnsavedWork = false
let desktopNotificationsEnabled = true
let notifier: DesktopNotifier | null = null
let windowStateFile = ''
let windowStateSaveTimer: NodeJS.Timeout | null = null
let allowClose = false
let closePromptOpen = false
let flushResolver: ((saved: boolean) => void) | null = null

// The media protocol must be registered as privileged before app ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'clipwright-media',
    privileges: { standard: true, secure: true, corsEnabled: true, bypassCSP: false, stream: true, supportFetchAPI: true }
  }
])

// Files passed on the command line: dropped on the executable, "Open with", or
// a SendTo shortcut. Parsed before the lock so a second instance can hand them
// to the running copy.
pendingOpenPaths = openablePaths(process.argv, {
  cwd: process.cwd(),
  exists: (candidate) => {
    try {
      return fs.statSync(candidate).isFile()
    } catch {
      return false
    }
  }
})
pendingProjectId = projectIdFromArgs(process.argv)

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // The running copy receives these through its own 'second-instance' listener.
  app.quit()
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    bringToFront()
    const paths = openablePaths(argv, {
      cwd: workingDirectory || process.cwd(),
      exists: (candidate) => {
        try {
          return fs.statSync(candidate).isFile()
        } catch {
          return false
        }
      }
    })
    const projectId = projectIdFromArgs(argv)
    if (paths.length > 0) deliverOpenPaths(paths)
    if (projectId) activateNavigation({ view: 'project', projectId })
  })

  // macOS delivers files through an event instead of argv.
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    const paths = openablePaths(['electron', filePath], { exists: (candidate) => fs.existsSync(candidate) })
    if (paths.length > 0) deliverOpenPaths(paths)
  })

  void app.whenReady().then(bootstrap)
}

/** Restore and focus the one window this app owns. */
function bringToFront(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

/** Hand files to the renderer, or hold them until it is listening. */
function deliverOpenPaths(paths: string[]): void {
  if (!paths.length) return
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:open-files', paths)
    return
  }
  pendingOpenPaths = [...new Set([...pendingOpenPaths, ...paths])].slice(0, 20)
}

/** A notification click or jump-list task: show the window, then navigate. */
function activateNavigation(target: AppNavTarget): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingNavigation = target
    return
  }
  bringToFront()
  mainWindow.webContents.send('app:navigate', target)
}

async function bootstrap(): Promise<void> {
  const workspaceRoot =
    process.env.CLIPWRIGHT_WORKSPACE ?? path.join(app.getPath('userData'), WORKSPACE_DIR_NAME)

  const secretCodec = safeStorage.isEncryptionAvailable()
    ? {
        encrypt: (plain: string) => {
          try {
            return `enc:${safeStorage.encryptString(plain).toString('base64')}`
          } catch {
            return null
          }
        },
        decrypt: (payload: string) => {
          if (!payload.startsWith('enc:')) return null
          try {
            return safeStorage.decryptString(Buffer.from(payload.slice(4), 'base64'))
          } catch {
            return null
          }
        }
      }
    : undefined

  const ctx = await createAppContext({
    workspaceRoot,
    appVersion: app.getVersion(),
    isElectron: true,
    moduleDir: __dirname,
    // electron-builder places extraResources (fonts, Python scripts, yt-dlp)
    // under process.resourcesPath; the dev build resolves the repo resources.
    resourcesDir: app.isPackaged ? process.resourcesPath : undefined,
    secretCodec
  })

  backend = createBackend(ctx, {
    pickFile: async (filters) => {
      const result = await dialog.showOpenDialog(mainWindow as BrowserWindow, {
        properties: ['openFile'],
        filters
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    pickFiles: async (filters) => {
      const result = await dialog.showOpenDialog(mainWindow as BrowserWindow, {
        properties: ['openFile', 'multiSelections'],
        filters
      })
      return result.canceled ? [] : result.filePaths
    },
    revealPath: async (target) => {
      if (fs.existsSync(target)) shell.showItemInFolder(target)
    },
    copyToClipboard: async (text: string, html?: string) => {
      // Both flavours at once, so Ctrl+V lands as plain text in an editor and as
      // formatted text in Word. Electron 44's clipboard is the async W3C-shaped
      // API: one atomic write of ClipboardItem entries.
      if (html) await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })])
      else await clipboard.writeText(text)
    },
    saveFileAs: async ({ sourcePath, suggestedName }) => {
      if (!mainWindow || mainWindow.isDestroyed()) return null
      let startDir = app.getPath('documents')
      try {
        startDir = app.getPath('videos')
      } catch {
        /* some profiles have no Videos folder; Documents always exists */
      }
      const extension = path.extname(suggestedName).replace('.', '').toLowerCase() || 'mp4'
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save a copy',
        defaultPath: path.join(startDir, suggestedName),
        buttonLabel: 'Save copy',
        // Windows asks before replacing an existing file. That prompt is the
        // safeguard: the copy below is allowed to overwrite only because the
        // user has just said yes to that specific path.
        properties: ['showOverwriteConfirmation'],
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
      })
      if (result.canceled || !result.filePath) return null
      if (path.resolve(result.filePath) === path.resolve(sourcePath)) {
        throw new Error('That is the same file this render already uses.')
      }
      fs.copyFileSync(sourcePath, result.filePath)
      return { path: result.filePath }
    },
    openLogsFolder: async () => {
      await shell.openPath(ctx.paths.logsDir)
    },
    isPathInsideWorkspace: (target) => isInsideWorkspace(ctx.workspaceRoot, target)
  })

  registerMediaProtocol(ctx.workspaceRoot, ctx.paths.fontsDir)
  registerIpc()
  registerDesktopIpc()
  setupAutoUpdater()
  registerUpdateIpc()
  windowStateFile = path.join(app.getPath('userData'), 'window-state.json')
  notifier = new DesktopNotifier({
    isSupported: () => Notification.isSupported(),
    show: ({ title, body, onClick }) => {
      const notification = new Notification({ title, body })
      notification.on('click', onClick)
      notification.show()
    }
  })
  screen.on('display-removed', keepWindowOnScreen)
  screen.on('display-metrics-changed', keepWindowOnScreen)
  screen.on('display-added', keepWindowOnScreen)
  createWindow()
  refreshJumpList()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

function isInsideWorkspace(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  let resolvedTarget = path.resolve(target)
  try {
    resolvedTarget = fs.realpathSync(resolvedTarget)
  } catch {
    /* keep unresolved — existence checked elsewhere */
  }
  const rel = path.relative(resolvedRoot, resolvedTarget)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * clipwright-media://local/<encoded-abs-path>
 * Streams workspace files and packaged caption TTFs with HTTP Range support.
 * No other paths outside the workspace are served (ADR-010).
 */
function registerMediaProtocol(workspaceRoot: string, fontsDir: string): void {
  const mimeByExt: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.ts': 'video/mp2t',
    '.mpg': 'video/mpeg',
    '.mpeg': 'video/mpeg',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.flac': 'audio/flac',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.ttf': 'font/ttf'
  }

  protocol.handle('clipwright-media', (request) => {
    return handleMediaRequest(request, workspaceRoot, fontsDir, mimeByExt)
  })
}

async function handleMediaRequest(
  request: Request,
  workspaceRoot: string,
  fontsDir: string,
  mimeByExt: Record<string, string>
): Promise<Response> {
  let target: string
  let wantsProxy = false
  try {
    const url = new URL(request.url)
    target = decodeURIComponent(url.pathname.slice(1))
    // ?proxy=1 swaps in the transcoded preview copy when it exists (§8) —
    // used for codecs Chromium cannot decode directly. Renders always read
    // the ORIGINAL file; this only affects preview playback.
    if (url.searchParams.get('proxy') === '1' && path.basename(target).startsWith('source.')) {
      wantsProxy = true
    }
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (wantsProxy) {
    const proxy = path.join(path.dirname(target), 'proxy.mp4')
    if (fs.existsSync(proxy) && fs.statSync(proxy).isFile()) target = proxy
  }
  const isBundledCaptionFont = path.extname(target).toLowerCase() === '.ttf' && isInsideWorkspace(fontsDir, target)
  if (!target || (!isInsideWorkspace(workspaceRoot, target) && !isBundledCaptionFont) || !fs.existsSync(target)) {
    return new Response('Not found', { status: 404 })
  }
  const stat = fs.statSync(target)
  if (!stat.isFile()) return new Response('Not found', { status: 404 })

  const type = mimeByExt[path.extname(target).toLowerCase()] ?? 'application/octet-stream'
  const range = request.headers.get('range')

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (!m || (!m[1] && !m[2])) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
    }
    const suffixLength = m[1] ? null : Number(m[2])
    const start = suffixLength === null ? Number(m[1]) : Math.max(0, stat.size - suffixLength)
    const end = suffixLength === null
      ? (m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1)
      : stat.size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
    }
    const stream = fs.createReadStream(target, { start, end })
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
      }
    })
  }

  const stream = fs.createReadStream(target)
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
    }
  })
}

function supportsAutoUpdates(): boolean {
  // The shipped installer is Windows NSIS. Browser previews, development
  // builds, and other platforms do not have a configured update feed.
  return app.isPackaged && process.platform === 'win32'
}

function publishUpdateStatus(status: AppUpdateStatus): void {
  updateStatus = status
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:update-status', status)
  }
}

function setupAutoUpdater(): void {
  if (!supportsAutoUpdates()) return

  updateVersion = app.getVersion()
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    publishUpdateStatus({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    updateVersion = info.version
    publishUpdateStatus({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    publishUpdateStatus({ state: 'idle' })
  })
  autoUpdater.on('download-progress', (progress) => {
    publishUpdateStatus({
      state: 'downloading',
      version: updateVersion,
      percent: Math.min(100, Math.max(0, Math.round(progress.percent)))
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    updateVersion = info.version
    publishUpdateStatus({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (error) => {
    // Startup checks can fail while offline. Keep that quiet; download errors
    // are surfaced by the corresponding IPC request below.
    console.warn('[updater] Update operation failed:', error.message)
  })
}

function registerUpdateIpc(): void {
  ipcMain.handle('app:update:check', async (): Promise<AppUpdateStatus> => {
    if (!supportsAutoUpdates()) return { state: 'idle' }
    if (updateCheckInFlight) return updateCheckInFlight

    const check = (async (): Promise<AppUpdateStatus> => {
      publishUpdateStatus({ state: 'checking' })
      try {
        await autoUpdater.checkForUpdates()
      } catch (error) {
        console.warn('[updater] Unable to check for updates:', error instanceof Error ? error.message : error)
        publishUpdateStatus({ state: 'idle' })
        return { state: 'error', message: 'Unable to check for updates. Check your internet connection and try again.' }
      }
      return updateStatus
    })()
    updateCheckInFlight = check
    try {
      return await check
    } finally {
      if (updateCheckInFlight === check) updateCheckInFlight = null
    }
  })

  ipcMain.handle('app:update:download', async (): Promise<void> => {
    if (!supportsAutoUpdates() || updateStatus.state !== 'available') {
      throw new Error('There is no available update to download.')
    }

    updateVersion = updateStatus.version
    publishUpdateStatus({ state: 'downloading', version: updateVersion, percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      const message = 'The update could not be downloaded. Check your internet connection and try again.'
      publishUpdateStatus({ state: 'error', message })
      console.warn('[updater] Unable to download update:', error instanceof Error ? error.message : error)
      throw new Error(message)
    }
  })

  ipcMain.handle('app:update:install', (): void => {
    if (!supportsAutoUpdates() || updateStatus.state !== 'downloaded') return
    autoUpdater.quitAndInstall(false, true)
  })
}

function registerIpc(): void {
  ipcMain.handle('api:invoke', async (_event, args: { method: string; payload?: unknown }) => {
    if (!backend) return { ok: false, error: { code: 'NOT_READY', message: 'The backend is still starting.' } as const }
    if (!args || typeof args.method !== 'string') {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'Malformed request.' } }
    }
    try {
      const value = await backend.invoke(args.method, args.payload ?? {})
      return { ok: true as const, value }
    } catch (err) {
      return { ok: false as const, error: toStructuredError(err) }
    }
  })

  backend?.ctx.events.subscribe((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:event', event)
    }
    handleDesktopEvent(event)
  })
}

/**
 * The desktop side of a backend event: a notification for work that finished
 * while the window was not in front, and a refreshed jump list when the project
 * list changes.
 */
function handleDesktopEvent(event: AppEvent): void {
  if (event.type === 'project:update') scheduleJumpListRefresh()
  if (!notifier) return
  const windowInBackground =
    !mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isFocused()
  const copy = notificationForEvent(event, {
    windowInBackground,
    enabled: desktopNotificationsEnabled,
    supported: notifier.supported
  })
  notifier.notify(copy, activateNavigation)
}

let jumpListTimer: NodeJS.Timeout | null = null
function scheduleJumpListRefresh(): void {
  if (jumpListTimer) clearTimeout(jumpListTimer)
  jumpListTimer = setTimeout(() => {
    jumpListTimer = null
    void refreshJumpList()
  }, 1500)
}

/**
 * The small one-way channel between the renderer and the window: what the
 * renderer is holding unsaved, whether the user wants notifications, taskbar
 * progress, and the answer to a "save before quitting" request.
 */
function registerDesktopIpc(): void {
  /**
   * One hand-off, one owner. The renderer announces itself and receives
   * everything Windows passed before it existed — in the reply, not as an event
   * — so a file can never be imported twice by a race between the two.
   */
  ipcMain.handle('app:renderer-ready', () => {
    rendererReady = true
    const pending = { paths: pendingOpenPaths, projectId: pendingProjectId }
    pendingOpenPaths = []
    pendingProjectId = null
    if (pendingNavigation) {
      const target = pendingNavigation
      pendingNavigation = null
      // Navigation is a separate concern and arrives as an event.
      mainWindow?.webContents.send('app:navigate', target)
    }
    return pending
  })

  ipcMain.on('app:close-guard', (_event, value: unknown) => {
    rendererHasUnsavedWork = value === true
  })

  ipcMain.on('app:desktop-preferences', (_event, value: unknown) => {
    const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
    desktopNotificationsEnabled = record.notificationsEnabled !== false
  })

  ipcMain.on('app:taskbar-progress', (_event, value: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (value === null || typeof value !== 'number' || !Number.isFinite(value)) {
      mainWindow.setProgressBar(-1)
      return
    }
    if (value > 1) {
      // A long job with no usable percentage: the taskbar shows a moving bar.
      mainWindow.setProgressBar(2, { mode: 'indeterminate' })
      return
    }
    mainWindow.setProgressBar(Math.min(1, Math.max(0, value)))
  })

  ipcMain.on('app:flush-result', (_event, saved: unknown) => {
    flushResolver?.(saved === true)
  })
}

/** The displays Windows reports, with the primary one first. */
function displayWorkAreas(): WorkArea[] {
  const primary = screen.getPrimaryDisplay()
  const others = screen.getAllDisplays().filter((display) => display.id !== primary.id)
  return [primary, ...others].map((display) => display.workArea)
}

function createWindow(): void {
  const iconRelativePath = app.isPackaged
    ? path.join('out', 'renderer', 'clipwright-studio-logo.png')
    : path.join('src', 'renderer', 'public', 'clipwright-studio-logo.png')
  const appIconPath = path.join(app.getAppPath(), iconRelativePath)
  const restored = normalizeWindowState(readWindowState(windowStateFile), displayWorkAreas())

  mainWindow = new BrowserWindow({
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    ...restored.bounds,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    backgroundColor: '#0a0c10',
    title: 'Clipwright Studio',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  // Paint before showing: no white flash, and no window jumping to its restored
  // position after the first frame.
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    if (restored.maximized) mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.on('resize', scheduleWindowStateSave)
  mainWindow.on('move', scheduleWindowStateSave)
  mainWindow.on('maximize', scheduleWindowStateSave)
  mainWindow.on('unmaximize', scheduleWindowStateSave)

  mainWindow.on('close', (event) => {
    scheduleWindowStateSave(true)
    if (allowClose || !rendererHasUnsavedWork) return
    event.preventDefault()
    void promptBeforeClose()
  })

  // Block navigation away from the app origin; open external links in the
  // system browser (SECURITY.md).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const isLocal = url.startsWith('file://') || (devUrl ? url.startsWith(devUrl) : false)
    if (!isLocal) {
      event.preventDefault()
      if (url.startsWith('http')) void shell.openExternal(url)
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    rendererReady = false
    rendererHasUnsavedWork = false
    allowClose = false
  })
}

/**
 * A window saved on a monitor that has since been unplugged, or one the user
 * dragged mostly off-screen, is pulled back into a usable area. Registered once
 * for the whole session: display changes outlive any one window.
 */
function keepWindowOnScreen(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized() || mainWindow.isFullScreen()) return
  const current = mainWindow.getBounds()
  const safe = normalizeWindowState(current, displayWorkAreas())
  if (safe.bounds.x !== current.x || safe.bounds.y !== current.y || safe.bounds.width !== current.width || safe.bounds.height !== current.height) {
    mainWindow.setBounds(safe.bounds)
  }
}

function scheduleWindowStateSave(immediate = false): void {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer)
    windowStateSaveTimer = null
  }
  if (immediate) {
    saveWindowStateNow()
    return
  }
  // Dragging a window fires hundreds of resize/move events; one write per
  // settled position is enough to remember where it was.
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null
    saveWindowStateNow()
  }, 400)
}

function saveWindowStateNow(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !windowStateFile) return
  const maximized = mainWindow.isMaximized()
  // While maximized the useful position is the one it will return to.
  const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
  writeWindowState(windowStateFile, serializeWindowState(bounds, maximized))
}

/**
 * Closing with unsaved edits asks first, in a native dialog. "Save and quit"
 * asks the renderer to write what it still holds; the draft journal keeps a
 * copy either way, and a renderer that never answers cannot block the quit.
 */
async function promptBeforeClose(): Promise<void> {
  if (!mainWindow || closePromptOpen) return
  closePromptOpen = true
  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Save and quit', 'Quit without saving', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'Unsaved changes',
      message: 'Some changes have not been written to disk yet.',
      detail: 'Save them before closing? A copy is also kept, and offered back the next time you open the app.'
    })
    if (response === 2) return
    if (response === 1) {
      closeWindowNow()
      return
    }
    const saved = await requestRendererFlush()
    if (saved) {
      closeWindowNow()
      return
    }
    const { response: fallback } = await dialog.showMessageBox(mainWindow, {
      type: 'error',
      buttons: ['Quit without saving', 'Keep the app open'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: 'Could not save',
      message: 'The last changes could not be written to disk.',
      detail: 'They are still on screen. Quitting now loses them. The crash journal may still be able to offer them back.'
    })
    if (fallback === 0) closeWindowNow()
  } catch {
    /* a dialog failure must not trap the user in the app */
  } finally {
    closePromptOpen = false
  }
}

function closeWindowNow(): void {
  allowClose = true
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
}

/** Ask the renderer to write its pending edits. Resolves false on failure or silence. */
function requestRendererFlush(): Promise<boolean> {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (saved: boolean) => {
      if (settled) return
      settled = true
      flushResolver = null
      clearTimeout(timer)
      resolve(saved)
    }
    const timer = setTimeout(() => finish(false), 6000)
    flushResolver = finish
    mainWindow?.webContents.send('app:flush-request')
  })
}

/** Recent projects in the taskbar jump list (Windows, packaged builds only). */
async function refreshJumpList(): Promise<void> {
  if (!backend || process.platform !== 'win32' || !app.isPackaged) return
  try {
    const projects = await backend.invoke('projects.list', {})
    const list = Array.isArray(projects) ? (projects as Array<{ id: string; name: string }>) : []
    const tasks = userTasksForProjects(list, {
      execPath: process.execPath,
      packaged: app.isPackaged,
      platform: process.platform
    })
    if (tasks) app.setUserTasks(tasks)
  } catch {
    /* a jump list is a convenience, never a startup dependency */
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  // Quitting from anywhere other than the window's X button (a menu, the
  // updater, an OS session end) reaches this first. Ask the same question the
  // close button asks, before the backend starts shutting down: a prompt after
  // shutdown would leave a half-stopped app if the user chose Cancel.
  if (!allowClose && rendererHasUnsavedWork && !closePromptOpen) {
    event.preventDefault()
    void promptBeforeClose()
    return
  }
  if (backend) {
    event.preventDefault()
    const b = backend
    backend = null
    void b.ctx
      .shutdown()
      .catch(() => undefined)
      .finally(() => app.quit())
  }
})
