import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, protocol, safeStorage, net } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AppUpdateStatus } from '@shared/ipc'
import { createAppContext } from './services/app-context'
import { createBackend, type Backend } from './ipc/backend'
import { toStructuredError } from '@shared/errors'

/**
 * Electron bootstrap. This is the ONLY file that imports Electron —
 * everything below the backend boundary is plain Node and shared with the
 * browser preview server and the test suite (ADR-007).
 */

// The workspace directory name is configuration, not a hard-coded product
// identity (spec §8). Override with CLIPWRIGHT_WORKSPACE for dev/tests.
const WORKSPACE_DIR_NAME = 'ClipwrightStudio'

let mainWindow: BrowserWindow | null = null
let backend: Backend | null = null
let updateStatus: AppUpdateStatus = { state: 'idle' }
let updateVersion = ''
let updateCheckInFlight: Promise<AppUpdateStatus> | null = null

// The media protocol must be registered as privileged before app ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'clipwright-media',
    privileges: { standard: true, secure: true, corsEnabled: true, bypassCSP: false, stream: true, supportFetchAPI: true }
  }
])

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(bootstrap)
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
    copyToClipboard: async (text) => {
      clipboard.writeText(text)
    },
    openLogsFolder: async () => {
      await shell.openPath(ctx.paths.logsDir)
    },
    isPathInsideWorkspace: (target) => isInsideWorkspace(ctx.workspaceRoot, target)
  })

  registerMediaProtocol(ctx.workspaceRoot, ctx.paths.fontsDir)
  registerIpc()
  setupAutoUpdater()
  registerUpdateIpc()
  createWindow()

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
  })
}

function createWindow(): void {
  const iconRelativePath = app.isPackaged
    ? path.join('out', 'renderer', 'clipwright-studio-logo.png')
    : path.join('src', 'renderer', 'public', 'clipwright-studio-logo.png')
  const appIconPath = path.join(app.getAppPath(), iconRelativePath)

  mainWindow = new BrowserWindow({
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0a0c10',
    title: 'Clipwright Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
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
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
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
