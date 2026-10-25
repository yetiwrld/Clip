import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (filePath: string) => fs.readFileSync(path.join(root, filePath), 'utf8')

describe('opt-in Windows automatic updates', () => {
  it('uses electron-updater and a GitHub Releases feed for NSIS packages', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>
      scripts: Record<string, string>
    }
    const builder = read('electron-builder.yml')

    expect(pkg.dependencies['electron-updater']).toBeDefined()
    expect(builder).toContain('provider: github')
    expect(builder).toContain('owner: yetiwrld')
    expect(builder).toContain('repo: Clip')
    expect(builder).toContain('releaseType: release')
    expect(builder).toContain('target: nsis')
    expect(pkg.scripts['dist:win']).toContain('electron-builder --win --x64')
  })

  it('checks only packaged Windows builds and waits for explicit download/install actions', () => {
    const main = read('src/main/index.ts')
    const preload = read('src/preload/index.ts')
    const contract = read('src/shared/ipc.ts')

    expect(main).toContain('app.isPackaged && process.platform === \'win32\'')
    expect(main).toContain('autoUpdater.autoDownload = false')
    expect(main).toContain('autoUpdater.autoInstallOnAppQuit = false')
    expect(main).toContain("'app:update:download'")
    expect(main).toContain("'app:update:install'")
    expect(main).toContain("autoUpdater.quitAndInstall(false, true)")
    expect(preload).toContain("ipcRenderer.invoke('app:update:check')")
    expect(preload).toContain("ipcRenderer.invoke('app:update:download')")
    expect(preload).toContain("ipcRenderer.invoke('app:update:install')")
    expect(contract).toContain('export type AppUpdateStatus')
    expect(contract).toContain("state: 'downloading'")
  })

  it('prompts before download, shows progress, and offers restart/install when ready', () => {
    const prompt = read('src/renderer/features/updates/UpdatePrompt.tsx')

    expect(prompt).toContain('Download update')
    expect(prompt).toContain('Continue in background')
    expect(prompt).toContain('status.percent / 100')
    expect(prompt).toContain('Restart and install')
    expect(prompt).toContain('isElectron')
  })
})
