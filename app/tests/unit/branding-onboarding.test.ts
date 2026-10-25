import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (filePath: string) => fs.readFileSync(path.join(root, filePath), 'utf8')

describe('Clipwright v0.0.4 branding and first-run welcome', () => {
  it('keeps the application and lockfile version aligned at 0.0.4', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string }
    const lock = JSON.parse(read('package-lock.json')) as {
      version: string
      packages: { '': { version: string } }
    }

    expect(pkg.version).toBe('0.0.4')
    expect(lock.version).toBe(pkg.version)
    expect(lock.packages[''].version).toBe(pkg.version)
  })

  it('uses the Clipwright Studio logo consistently throughout the app and installer', () => {
    const app = read('src/renderer/App.tsx')
    const welcome = read('src/renderer/features/onboarding/FirstRunModal.tsx')
    const main = read('src/main/index.ts')
    const html = read('src/renderer/index.html')
    const logoPath = path.join(root, 'src/renderer/public/clipwright-studio-logo.png')
    const rendererLogo = fs.readFileSync(logoPath)
    const packagedAppLogo = fs.readFileSync(path.join(root, 'build/icon.png'))

    expect(fs.existsSync(logoPath)).toBe(true)
    expect(fs.existsSync(path.join(root, 'src/renderer/public/in-app-logo.png'))).toBe(false)
    expect(rendererLogo.equals(packagedAppLogo)).toBe(true)
    for (const surface of [app, welcome, html, main]) {
      expect(surface).toContain('clipwright-studio-logo.png')
      expect(surface).not.toContain('in-app-logo.png')
    }
    expect(app).toContain('Developed by yetiwrld')
  })

  it('explains the core workflow in three steps and preserves optional setup checks', () => {
    const welcome = read('src/renderer/features/onboarding/FirstRunModal.tsx')

    expect(welcome.match(/className="welcome-step"/g)).toHaveLength(3)
    expect(welcome).toContain('Import a video')
    expect(welcome).toContain('Find the moments')
    expect(welcome).toContain('Edit and export')
    expect(welcome).toContain('Check setup')
    expect(welcome).toContain('Start creating')
  })
})
