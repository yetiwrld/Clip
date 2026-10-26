import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { openablePaths } from '../../src/main/desktop/open-files'
import { JUMP_LIST_LIMIT, projectIdFromArgs, userTasksForProjects } from '../../src/main/desktop/jump-list'
import { DEFAULT_WINDOW_SIZE, MIN_WINDOW_SIZE, normalizeWindowState, serializeWindowState } from '../../src/main/desktop/window-state'
import { DesktopNotifier, notificationForEvent, type NotificationContext } from '../../src/main/desktop/notifications'
import { settingsRepo } from '../../src/main/services/database/repositories'
import { appSettingsSchema } from '../../src/shared/schemas'
import {
  baseNameOf,
  classifyPath,
  classifyPaths,
  extensionOf,
  isSupportedSourceMedia,
  unsupportedNotice
} from '../../src/shared/platform/files'
import { flushAllPending, hasFlushHandlers, registerFlushHandler } from '../../src/renderer/persistence/flush-bus'
import { escapeHtml } from '../../src/renderer/api/client'
import type { AppEvent, TaskInfo } from '../../src/shared/types'

/**
 * Desktop integration: what Windows hands the app, where the window belongs,
 * when it may interrupt, and what it does before closing.
 *
 * None of this can be observed through a screenshot, so each rule is exercised
 * as a function with the real inputs Windows would produce — argv lists,
 * display work areas, backend events and a fake notification host.
 */

const root = process.cwd()
const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
const preloadSource = fs.readFileSync(path.join(root, 'src', 'preload', 'index.ts'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles', 'global.css'), 'utf8')

// ------------------------------------------------------------- open files --

describe('files handed to the app by Windows', () => {
  const exists = (candidate: string) => /\.(mp4|mov|mp3|srt|vtt|json|txt)$/i.test(candidate)

  it('takes media and transcript paths and ignores everything else', () => {
    const argv = [
      'C:\\Program Files\\Clipwright\\Clipwright Studio.exe',
      'C:\\Users\\Ada\\Videos\\interview.mp4',
      '--enable-logging',
      'C:\\Users\\Ada\\Documents\\notes.docx',
      '.',
      'C:\\Users\\Ada\\Videos\\episode.srt'
    ]
    expect(openablePaths(argv, { exists })).toEqual([
      path.resolve('C:\\Users\\Ada\\Videos\\interview.mp4'),
      path.resolve('C:\\Users\\Ada\\Videos\\episode.srt')
    ])
  })

  it('resolves relative paths from the working directory Windows reports', () => {
    const paths = openablePaths(['app.exe', 'clips/one.mov'], { cwd: '/home/ada', exists })
    expect(paths).toEqual([path.resolve('/home/ada/clips/one.mov')])
  })

  it('drops paths that no longer exist and repeats of the same file', () => {
    const onDisk = (candidate: string) => exists(candidate) && !candidate.includes('gone')
    const paths = openablePaths(['app.exe', '/media/gone.mp4', '/media/here.mp4', '/media/here.mp4'], { exists: onDisk })
    expect(paths).toEqual([path.resolve('/media/here.mp4')])
  })

  it('is not fooled by a flag that looks like a file', () => {
    expect(openablePaths(['app.exe', '--output=/tmp/x.mp4'], { exists })).toEqual([])
  })

  it('caps a very long hand-off', () => {
    const argv = ['app.exe', ...Array.from({ length: 40 }, (_, index) => `/media/file-${index}.mp4`)]
    expect(openablePaths(argv, { exists })).toHaveLength(20)
    expect(openablePaths(argv, { exists, limit: 3 })).toHaveLength(3)
  })
})

describe('jump list and --open-project', () => {
  const projects = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Episode 42 — Founder Interview' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Short' }
  ]

  it('builds taskbar entries only on packaged Windows builds', () => {
    expect(userTasksForProjects(projects, { execPath: 'C:\\app.exe', packaged: false, platform: 'win32' })).toBeNull()
    expect(userTasksForProjects(projects, { execPath: '/usr/bin/app', packaged: true, platform: 'linux' })).toBeNull()
    const tasks = userTasksForProjects(projects, { execPath: 'C:\\app.exe', packaged: true, platform: 'win32' })
    expect(tasks).toHaveLength(2)
    expect(tasks?.[0].arguments).toBe('--open-project 11111111-1111-1111-1111-111111111111')
    expect(tasks?.[0].program).toBe('C:\\app.exe')
    expect(tasks?.[1].title).toBe('Short')
  })

  it('caps the list and shortens long project names at a word', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      id: `0000000${index}-0000-0000-0000-000000000000`,
      name: `Project ${index} with a fairly long descriptive name`
    }))
    const tasks = userTasksForProjects(many, { execPath: 'C:\\app.exe', packaged: true, platform: 'win32' })
    expect(tasks).toHaveLength(JUMP_LIST_LIMIT)
    expect(tasks?.[0].title.endsWith('…')).toBe(true)
    expect(tasks?.[0].title.length).toBeLessThanOrEqual(41)
  })

  it('reads the project id from either argument form', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    expect(projectIdFromArgs(['app.exe', '--open-project', id])).toBe(id)
    expect(projectIdFromArgs(['app.exe', `--open-project=${id}`])).toBe(id)
    expect(projectIdFromArgs(['app.exe', '--open-project', '../../etc/passwd'])).toBeNull()
    expect(projectIdFromArgs(['app.exe', '--open-project'])).toBeNull()
    expect(projectIdFromArgs(['app.exe'])).toBeNull()
  })
})

// ----------------------------------------------------------- window state --

const primary = { x: 0, y: 0, width: 1920, height: 1040 }
const secondary = { x: 1920, y: 0, width: 2560, height: 1400 }

describe('window position and size', () => {
  it('opens centred at the default size on a first launch', () => {
    const state = normalizeWindowState(null, [primary])
    expect(state.bounds).toEqual({
      x: (1920 - DEFAULT_WINDOW_SIZE.width) / 2,
      y: (1040 - DEFAULT_WINDOW_SIZE.height) / 2,
      width: DEFAULT_WINDOW_SIZE.width,
      height: DEFAULT_WINDOW_SIZE.height
    })
    expect(state.maximized).toBe(false)
  })

  it('restores a position that is still on a screen', () => {
    const saved = { bounds: { x: 120, y: 80, width: 1280, height: 800 }, maximized: false }
    expect(normalizeWindowState(saved, [primary]).bounds).toEqual(saved.bounds)
  })

  it('keeps a window on the second monitor', () => {
    const saved = { bounds: { x: 2200, y: 100, width: 1200, height: 900 }, maximized: false }
    expect(normalizeWindowState(saved, [primary, secondary]).bounds).toEqual(saved.bounds)
  })

  it('re-centres a window whose monitor was unplugged', () => {
    const saved = { bounds: { x: 2400, y: 200, width: 1200, height: 900 }, maximized: false }
    const state = normalizeWindowState(saved, [primary])
    expect(state.bounds.x).toBeGreaterThanOrEqual(0)
    expect(state.bounds.x + state.bounds.width).toBeLessThanOrEqual(primary.width)
    expect(state.bounds.width).toBe(1200)
  })

  it('pulls back a window that was dragged almost off the edge', () => {
    const saved = { bounds: { x: 1880, y: -300, width: 1200, height: 900 }, maximized: false }
    const state = normalizeWindowState(saved, [primary])
    expect(state.bounds.x + state.bounds.width).toBeLessThanOrEqual(primary.width)
    expect(state.bounds.y).toBeGreaterThanOrEqual(0)
  })

  it('grows a window saved below the minimum and shrinks one saved above the screen', () => {
    const tiny = normalizeWindowState({ bounds: { x: 10, y: 10, width: 400, height: 300 } }, [primary])
    expect(tiny.bounds.width).toBe(MIN_WINDOW_SIZE.width)
    expect(tiny.bounds.height).toBe(MIN_WINDOW_SIZE.height)

    const huge = normalizeWindowState({ bounds: { x: 0, y: 0, width: 5000, height: 4000 } }, [primary])
    expect(huge.bounds.width).toBe(primary.width)
    expect(huge.bounds.height).toBe(primary.height)
  })

  it('remembers that the window was maximized without losing its normal size', () => {
    const state = normalizeWindowState({ bounds: { x: 100, y: 60, width: 1300, height: 820 }, maximized: true }, [primary])
    expect(state.maximized).toBe(true)
    expect(state.bounds.width).toBe(1300)
  })

  it('falls back to the defaults for junk, without throwing', () => {
    for (const value of [undefined, null, 'window', 42, [], { bounds: { x: 'left' } }, { bounds: null }]) {
      const state = normalizeWindowState(value, [primary])
      expect(state.bounds.width).toBe(DEFAULT_WINDOW_SIZE.width)
      expect(state.maximized).toBe(false)
    }
    // No displays at all (a session starting before the compositor is ready).
    expect(normalizeWindowState(null, []).bounds.width).toBe(DEFAULT_WINDOW_SIZE.width)
  })

  it('stores whole DIP pixels', () => {
    expect(serializeWindowState({ x: 10.6, y: 20.4, width: 1280.5, height: 800.2 }, false)).toEqual({
      bounds: { x: 11, y: 20, width: 1281, height: 800 },
      maximized: false
    })
  })
})

// ------------------------------------------------------------ notifications --

function task(overrides: Partial<TaskInfo>): TaskInfo {
  return {
    id: 'task-1',
    type: 'transcribe',
    projectId: 'project-1',
    state: 'running',
    stage: null,
    progress: null,
    message: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  } as TaskInfo
}

const background: NotificationContext = { windowInBackground: true, enabled: true, supported: true }

describe('desktop notifications', () => {
  it('announces a finished transcription only while the app is in the background', () => {
    const event: AppEvent = { type: 'task:update', task: task({ state: 'completed' }) }
    expect(notificationForEvent(event, background)?.title).toBe('Transcription finished')
    expect(notificationForEvent(event, { ...background, windowInBackground: false })).toBeNull()
  })

  it('stays quiet for jobs that are over in a moment', () => {
    for (const type of ['thumbnail', 'proxy', 'asset-import'] as const) {
      const event: AppEvent = { type: 'task:update', task: task({ type, state: 'completed' }) }
      expect(notificationForEvent(event, background)).toBeNull()
    }
  })

  it('lets the render queue speak for renders instead of doubling up', () => {
    const event: AppEvent = { type: 'task:update', task: task({ type: 'render', state: 'completed' }) }
    expect(notificationForEvent(event, background)).toBeNull()
    const renderEvent: AppEvent = {
      type: 'render:state',
      render: { id: 'render-1', status: 'completed', clipId: 'clip-1', projectId: 'project-1' } as unknown as Extract<AppEvent, { type: 'render:state' }>['render']
    }
    const copy = notificationForEvent(renderEvent, background)
    expect(copy?.title).toBe('Render finished')
    expect(copy?.target).toEqual({ view: 'queue' })
  })

  it('carries the failure reason, trimmed to something readable', () => {
    const long = 'B'.repeat(400)
    const event: AppEvent = {
      type: 'task:update',
      task: task({ state: 'failed', error: { code: 'X', message: long } as TaskInfo['error'] })
    }
    const copy = notificationForEvent(event, background)
    expect(copy?.title).toBe('Transcription failed')
    expect(copy?.body.length).toBeLessThanOrEqual(140)
    expect(copy?.body.endsWith('…')).toBe(true)
  })

  it('respects the setting and the operating system', () => {
    const event: AppEvent = { type: 'task:update', task: task({ state: 'completed' }) }
    expect(notificationForEvent(event, { ...background, enabled: false })).toBeNull()
    expect(notificationForEvent(event, { ...background, supported: false })).toBeNull()
  })

  it('ignores progress updates and unrelated events', () => {
    expect(notificationForEvent({ type: 'task:update', task: task({ state: 'running' }) }, background)).toBeNull()
    expect(notificationForEvent({ type: 'render:progress', renderId: 'r', clipId: 'c', projectId: 'p', progress: 0.4, stage: 'encoding' }, background)).toBeNull()
    expect(notificationForEvent({ type: 'project:update', project: { id: 'p' } as never }, background)).toBeNull()
  })

  it('shows each job once and survives a host that throws', () => {
    const shown: string[] = []
    const notifier = new DesktopNotifier({
      isSupported: () => true,
      show: ({ title }) => {
        shown.push(title)
      }
    })
    const copy = notificationForEvent({ type: 'task:update', task: task({ state: 'completed' }) }, background)
    expect(notifier.notify(copy, () => undefined)).toBe(true)
    expect(notifier.notify(copy, () => undefined)).toBe(false)
    expect(notifier.hasNotified('task:task-1:done')).toBe(true)
    expect(shown).toEqual(['Transcription finished'])

    const broken = new DesktopNotifier({ isSupported: () => true, show: () => { throw new Error('no tray') } })
    expect(broken.notify(notificationForEvent({ type: 'task:update', task: task({ id: 'task-2', state: 'completed' }) }, background), () => undefined)).toBe(false)
    expect(new DesktopNotifier({ isSupported: () => { throw new Error('nope') }, show: () => undefined }).supported).toBe(false)
  })

  it('sends a click to the queue or the project that owns the job', () => {
    // The fake host keeps the click handler, exactly like a real toast does.
    let click: (() => void) | null = null
    const notifier = new DesktopNotifier({
      isSupported: () => true,
      show: ({ onClick }) => {
        click = onClick
      }
    })
    const copy = notificationForEvent({ type: 'task:update', task: task({ state: 'completed' }) }, background)
    let activated: unknown = null
    notifier.notify(copy, (target) => { activated = target })
    expect(activated).toBeNull()
    ;(click as unknown as () => void)()
    expect(activated).toEqual({ view: 'project', projectId: 'project-1' })
  })
})

// ------------------------------------------------------------- file kinds --

describe('what a dropped path is', () => {
  it('separates source media, assets, transcripts and everything else', () => {
    expect(classifyPath('C:\\v\\a.mp4', 'source')).toBe('media')
    expect(classifyPath('C:\\v\\a.MP3', 'source')).toBe('media')
    expect(classifyPath('C:\\v\\cover.png', 'source')).toBe('unsupported')
    expect(classifyPath('C:\\v\\cover.png', 'asset')).toBe('media')
    expect(classifyPath('/tmp/episode.srt')).toBe('transcript')
    expect(classifyPath('/tmp/notes.docx')).toBe('unsupported')
    expect(classifyPath('/tmp/README')).toBe('unsupported')
    expect(classifyPath('/tmp/.hidden')).toBe('unsupported')
  })

  it('groups a drop and removes duplicates', () => {
    const result = classifyPaths(['/a/one.mp4', '/a/one.mp4', '/a/two.srt', '/a/bad.exe', ''], 'source')
    expect(result.media).toEqual(['/a/one.mp4'])
    expect(result.transcripts).toEqual(['/a/two.srt'])
    expect(result.unsupported).toEqual(['/a/bad.exe'])
  })

  it('names the files it could not take', () => {
    expect(unsupportedNotice([])).toBe('')
    expect(unsupportedNotice(['/x/holiday.movv'])).toBe('“holiday” is not a supported media file.')
    expect(unsupportedNotice(['/x/a.exe', '/x/b.exe', '/x/c.exe', '/x/d.exe'])).toContain('and 1 more')
  })

  it('derives a project name from the file, not the folder', () => {
    expect(baseNameOf('C:\\Users\\Ada\\Videos\\Episode 42.mp4')).toBe('Episode 42')
    expect(baseNameOf('/tmp/.mp4', 'Imported media')).toBe('Imported media')
    expect(extensionOf('/tmp/Clip.MOV')).toBe('mov')
    expect(isSupportedSourceMedia('/tmp/clip.mov')).toBe(true)
    expect(isSupportedSourceMedia('/tmp/clip.gif')).toBe(false)
  })
})

// ----------------------------------------------------------- flush on quit --

describe('asking the renderer to save before quitting', () => {
  it('waits for every registered screen and reports the truth', async () => {
    expect(hasFlushHandlers()).toBe(false)
    const offA = registerFlushHandler(async () => true)
    const offB = registerFlushHandler(async () => true)
    expect(hasFlushHandlers()).toBe(true)
    expect(await flushAllPending()).toBe(true)
    offA()
    offB()
    expect(hasFlushHandlers()).toBe(false)

    // No screens with pending writes: nothing to wait for, and not a failure.
    expect(await flushAllPending()).toBe(true)
  })

  it('treats a failing or throwing screen as unsaved', async () => {
    const offFailure = registerFlushHandler(async () => false)
    const offThrow = registerFlushHandler(async () => { throw new Error('disk gone') })
    expect(await flushAllPending()).toBe(false)
    offFailure()
    offThrow()
  })
})

// ------------------------------------------------------------- clipboard --

describe('rich-text copy', () => {
  it('escapes markup in transcript text so it cannot inject HTML', () => {
    expect(escapeHtml('<b>hi</b> & "quotes"')).toBe('&lt;b&gt;hi&lt;/b&gt; &amp; &quot;quotes&quot;')
  })

  it('is bounded before it reaches the OS clipboard', async () => {
    const { ipcPayloads } = await import('../../src/shared/schemas')
    const schema = ipcPayloads['system.copyToClipboard']
    expect(schema.safeParse({ text: 'ok' }).success).toBe(true)
    expect(schema.safeParse({ text: 'ok', html: '<p>ok</p>' }).success).toBe(true)
    expect(schema.safeParse({ text: 'x'.repeat(1_000_001) }).success).toBe(false)
    expect(schema.safeParse({ text: 'ok', html: 'x'.repeat(4_000_001) }).success).toBe(false)
  })
})

// ------------------------------------------------------------------ wiring --

describe('main process wiring', () => {
  it('gives Windows an app identity so notifications and the taskbar are named', () => {
    expect(mainSource).toContain("app.setAppUserModelId('com.clipwright.studio')")
  })

  it('only closes the window after the user has answered the prompt', () => {
    expect(mainSource).toContain('event.preventDefault()\n    void promptBeforeClose()')
    expect(mainSource).toContain("buttons: ['Save and quit', 'Quit without saving', 'Cancel']")
    // A renderer that never answers must not trap the user in the app.
    expect(mainSource).toContain('setTimeout(() => finish(false), 6000)')
  })

  it('takes the second instance and hands its files to the running window', () => {
    expect(mainSource).toContain("app.on('second-instance'")
    expect(mainSource).toContain('deliverOpenPaths(paths)')
    expect(mainSource).toContain("mainWindow.webContents.send('app:open-files', paths)")
  })

  it('exposes no filesystem or OS surface to the renderer beyond named calls', () => {
    expect(preloadSource).not.toContain('require(')
    for (const call of ['rendererReady', 'onOpenFiles', 'onNavigate', 'setTaskbarProgress', 'setCloseGuard', 'flushDone']) {
      expect(preloadSource).toContain(call)
    }
    // The hand-off arrives in the reply to one call, so a file cannot be
    // imported twice by a race between an event and a fetch.
    expect(mainSource).toContain("ipcMain.handle('app:renderer-ready'")
    expect(mainSource).not.toContain("'app:open-files:take'")
    // Only these two channels are one-way; everything else answers with a result.
    expect(mainSource).toContain("ipcMain.on('app:close-guard'")
    expect(mainSource).toContain("ipcMain.on('app:taskbar-progress'")
  })

  it('keeps saving a copy inside the workspace and out of the way of overwrites', () => {
    const backend = fs.readFileSync(path.join(root, 'src', 'main', 'ipc', 'backend.ts'), 'utf8')
    expect(backend).toContain("if (!host.isPathInsideWorkspace(p.sourcePath))")
    expect(backend).toContain("replace(/[\\\\/:*?\"<>|\\u0000-\\u001F]/g, '-')")
    expect(mainSource).toContain("properties: ['showOverwriteConfirmation']")
  })

  it('ships the notification preference in settings, on by default', () => {
    const defaults = settingsRepo.defaults()
    expect(defaults.appearance.desktopNotifications).toBe(true)
    expect(appSettingsSchema.shape.appearance.safeParse({ ambientEffects: true }).success).toBe(false)
    expect(appSettingsSchema.shape.appearance.safeParse({ ambientEffects: true, desktopNotifications: false }).success).toBe(true)
  })
})

describe('drop overlay', () => {
  it('never takes the pointer, so the drop lands where the user aimed', () => {
    expect(css).toMatch(/\.drop-overlay \{[^}]*pointer-events: none;/)
  })

  it('sits under the toasts and above the page', () => {
    const block = css.slice(css.indexOf('.drop-overlay {'))
    expect(block).toContain('z-index: var(--z-palette)')
  })

  it('uses tokens rather than new colours or sizes', () => {
    const block = css.slice(css.indexOf('.drop-overlay-card {'))
    expect(block).not.toMatch(/font-size:\s*\d/)
    expect(block).toContain('var(--radius-lg)')
    expect(block).toContain('var(--space-8)')
  })
})

describe('pasting into a link field', () => {
  const paste = (text: string) =>
    ({ clipboardData: { getData: () => text } }) as unknown as React.ClipboardEvent<HTMLInputElement>

  it('caps a huge paste instead of putting it into the field', async () => {
    const { pastedUrl, URL_PASTE_LIMIT } = await import('../../src/renderer/lib/paste')
    const huge = 'https://example.com/' + 'a'.repeat(100_000)
    const result = pastedUrl(paste(huge))
    expect(result?.value.length).toBe(URL_PASTE_LIMIT)
    expect(result?.trimmed).toBe(true)
  })

  it('collapses line breaks from a copied link and leaves short links alone', async () => {
    const { pastedUrl } = await import('../../src/renderer/lib/paste')
    expect(pastedUrl(paste('https://example.com/watch?v=1\n'))?.value).toBe('https://example.com/watch?v=1')
    expect(pastedUrl(paste('https://example.com/a'))?.trimmed).toBe(false)
    expect(pastedUrl(paste(''))).toBeNull()
  })
})

describe('window state on disk', () => {
  it('survives a write, a read and a restart with a smaller screen', async () => {
    const os = await import('node:os')
    const filePath = await import('node:path')
    const { writeWindowState, readWindowState } = await import('../../src/main/desktop/window-state-file')
    const dir = fs.mkdtempSync(filePath.join(os.tmpdir(), 'clipwright-window-'))
    const file = filePath.join(dir, 'window-state.json')
    try {
      // Saved while docked to a 2560-wide monitor.
      writeWindowState(file, serializeWindowState({ x: 2200, y: 120, width: 1400, height: 900 }, true))
      const restored = normalizeWindowState(readWindowState(file), [{ x: 0, y: 0, width: 1366, height: 728 }])
      expect(restored.maximized).toBe(true)
      expect(restored.bounds.x + restored.bounds.width).toBeLessThanOrEqual(1366)
      expect(restored.bounds.y).toBeGreaterThanOrEqual(0)
      expect(restored.bounds.height).toBeLessThanOrEqual(728)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ignores a corrupt or oversized file instead of failing to start', async () => {
    const os = await import('node:os')
    const filePath = await import('node:path')
    const { writeWindowState, readWindowState } = await import('../../src/main/desktop/window-state-file')
    const dir = fs.mkdtempSync(filePath.join(os.tmpdir(), 'clipwright-window-'))
    const file = filePath.join(dir, 'window-state.json')
    try {
      fs.writeFileSync(file, '{not json')
      expect(normalizeWindowState(readWindowState(file), [{ x: 0, y: 0, width: 1920, height: 1040 }]).bounds.width).toBe(DEFAULT_WINDOW_SIZE.width)
      fs.writeFileSync(file, 'x'.repeat(9000))
      expect(readWindowState(file)).toBeNull()
      // A write into a folder that cannot be created must not throw either.
      expect(() => writeWindowState(filePath.join(file, 'nested', 'state.json'), serializeWindowState({ x: 0, y: 0, width: 800, height: 600 }, false))).not.toThrow()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('accepts a real file on disk from the command line', async () => {
    const os = await import('node:os')
    const filePath = await import('node:path')
    const dir = fs.mkdtempSync(filePath.join(os.tmpdir(), 'clipwright-open-'))
    const media = filePath.join(dir, 'episode.mp4')
    const other = filePath.join(dir, 'notes.docx')
    try {
      fs.writeFileSync(media, 'x')
      fs.writeFileSync(other, 'x')
      const found = openablePaths(['app.exe', media, other], {
        exists: (candidate) => {
          try {
            return fs.statSync(candidate).isFile()
          } catch {
            return false
          }
        }
      })
      expect(found).toEqual([media])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
