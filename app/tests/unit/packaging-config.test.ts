import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, filePath), 'utf8')) as T
}

describe('self-contained Windows installer configuration', () => {
  it('downloads the Electron runtime before packaging and targets x64 NSIS', () => {
    const pkg = readJson<{
      scripts: Record<string, string>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }>('package.json')
    const config = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')

    expect(pkg.scripts['dist:win']).toContain('install-electron')
    expect(pkg.scripts['dist:win']).toContain('electron-builder --win --x64')
    expect(pkg.devDependencies.electron).toBeDefined()
    expect(pkg.devDependencies['electron-builder']).toBeDefined()
    expect(pkg.dependencies['@ffmpeg-installer/ffmpeg']).toBeDefined()
    expect(pkg.dependencies['@ffprobe-installer/ffprobe']).toBeDefined()
    expect(pkg.dependencies['sql.js']).toBeDefined()
    expect(config).toContain('target: nsis')
    expect(config).toContain('arch: [x64]')
    expect(config).toContain('oneClick: false')
    expect(config).toContain('allowToChangeInstallationDirectory: true')
    expect(config).toContain('asarUnpack:')
    expect(config).toContain('artifactName: ${productName}-${version}-setup-${arch}.${ext}')
  })

  it('keeps all configured runtime resources present in the source package', () => {
    const config = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
    for (const resourcePath of [
      'resources/fonts',
      'scripts/python',
      'resources/bin',
      'build/icon.ico',
      'build/icon.png',
      'src/renderer/public/clipwright-studio-logo.png'
    ]) {
      expect(fs.existsSync(path.join(root, resourcePath)), `${resourcePath} should exist`).toBe(true)
    }
    expect(fs.existsSync(path.join(root, 'src/renderer/public/in-app-logo.png'))).toBe(false)
    for (const entry of ['from: resources/fonts', 'from: scripts/python', 'from: resources/bin']) {
      expect(config).toContain(entry)
    }
    expect(config).toContain('icon: build/icon.ico')
  })
})
