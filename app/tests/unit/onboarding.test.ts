import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Onboarding and help contract.
 *
 * What these tests protect:
 *  - help state is real persisted settings, not a one-session flag;
 *  - a dismissed tip stays dismissed, and dismissing twice does not duplicate;
 *  - the tour only offers stops whose target actually exists on this screen;
 *  - every `data-tour` marker the tour asks for is present in the app source, so
 *    a rename cannot silently break the tour;
 *  - the help screen links to things that exist (no dead buttons);
 *  - the welcome screen offers only ways in that the app really has.
 *
 * Geometry, focus rings and window resizing cannot be checked here: there is no
 * browser in this environment. The tour's placement maths is deliberately kept
 * in one function so it can be reviewed by eye.
 */

const saved: Array<Record<string, unknown>> = []

vi.mock('../../src/renderer/api/client', () => ({
  isElectron: false,
  isPreview: true,
  api: {
    'settings.update': async ({ patch }: { patch: Record<string, unknown> }) => {
      saved.push(patch)
      return { general: { firstRunCompleted: false }, help: { tourCompleted: false, dismissedTips: [] }, ...patch }
    }
  },
  errMessage: (error: unknown) => ({ message: String(error) })
}))

const { useAppStore } = await import('../../src/renderer/stores/app')
const { TOUR_STEPS, availableSteps } = await import('../../src/renderer/features/help/tour')
const { appSettingsSchema } = await import('../../src/shared/schemas')

const app = () => useAppStore.getState()
const root = process.cwd()
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8')

beforeEach(() => {
  saved.length = 0
  useAppStore.setState({
    view: 'dashboard',
    projectId: null,
    editorClipId: null,
    history: [],
    future: [],
    tourOpen: false,
    settings: {
      general: { firstRunCompleted: false },
      help: { tourCompleted: false, dismissedTips: [] }
    } as never
  })
})

describe('help settings are persisted', () => {
  it('ships defaults for a brand-new install', () => {
    const defaults = read('src/main/services/database/repositories.ts')
    expect(defaults).toContain('help: { tourCompleted: false, dismissedTips: [] }')
  })

  it('validates the help section like any other setting', () => {
    expect(appSettingsSchema.shape.help.safeParse({ tourCompleted: true, dismissedTips: ['clips.render-queue'] }).success).toBe(true)
    expect(appSettingsSchema.shape.help.safeParse({ tourCompleted: false, dismissedTips: [''] }).success).toBe(false)
    expect(
      appSettingsSchema.shape.help.safeParse({ tourCompleted: false, dismissedTips: Array.from({ length: 101 }, (_, i) => `tip-${i}`) })
        .success
    ).toBe(false)
  })

  it('records completion of the tour', async () => {
    app().startTour()
    expect(app().tourOpen).toBe(true)
    app().closeTour()
    expect(app().tourOpen).toBe(false)
    expect(saved.at(-1)).toEqual({ help: { tourCompleted: true } })
  })

  it('keeps a dismissed tip dismissed, once', async () => {
    expect(app().isTipDismissed('clips.render-queue')).toBe(false)
    await app().dismissTip('clips.render-queue')
    expect(saved.at(-1)).toEqual({ help: { dismissedTips: ['clips.render-queue'] } })
    expect(app().isTipDismissed('clips.render-queue')).toBe(true)

    // The settings write returns the new state; a second dismissal is a no-op.
    saved.length = 0
    await app().dismissTip('clips.render-queue')
    expect(saved).toHaveLength(0)
  })
})

describe('the tour points at things that exist', () => {
  it('has unique stops with unique targets', () => {
    const ids = TOUR_STEPS.map((step) => step.id)
    const targets = TOUR_STEPS.map((step) => step.target)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(targets).size).toBe(targets.length)
  })

  it('only asks for markers the app actually renders', () => {
    const sources = [
      'src/renderer/App.tsx',
      'src/renderer/features/dashboard/DashboardPage.tsx',
      'src/renderer/features/help/HelpPage.tsx',
      'src/renderer/features/settings/SettingsPage.tsx'
    ].map(read)
    const declared = new Set(
      sources.flatMap((source) => [...source.matchAll(/data-tour="([^"]+)"/g)].map((match) => match[1]))
    )
    const wanted = new Set(TOUR_STEPS.map((step) => step.target))
    expect([...wanted].filter((target) => !declared.has(target))).toEqual([])
  })

  it('drops stops for other screens', () => {
    const present = (): boolean => true
    const onDashboard = availableSteps('dashboard', present).map((step) => step.id)
    const inEditor = availableSteps('editor', present).map((step) => step.id)
    expect(onDashboard).toContain('projects')
    expect(onDashboard).toContain('create')
    // The editor has no sidebar stops, so the tour stays quiet there.
    expect(inEditor).toEqual([])
  })

  it('drops a stop whose element is missing', () => {
    const onlySettings = availableSteps('dashboard', (target) => target === 'settings').map((step) => step.id)
    expect(onlySettings).toEqual(['settings'])
  })

  it('never blocks the app: the overlay layer ignores pointer events and only the card takes them', () => {
    const css = read('src/renderer/styles/global.css')
    const layer = css.slice(css.indexOf('.tour-layer {'), css.indexOf('.tour-card {'))
    expect(layer).toContain('pointer-events: none')
    const card = css.slice(css.indexOf('.tour-card {'), css.indexOf('.tour-card:focus-visible'))
    expect(card).toContain('pointer-events: auto')
    expect(css).toContain('--z-tour: 460')
  })
})

describe('the help screen has no dead ends', () => {
  const page = read('src/renderer/features/help/HelpPage.tsx')

  it('only calls IPC methods the app declares', () => {
    const declarations = fs
      .readFileSync(path.join(root, 'src/shared/ipc.ts'), 'utf8')
      .matchAll(/^\s*'([a-zA-Z]+\.[a-zA-Z]+)'/gm)
    const known = new Set([...declarations].map((match) => match[1]))
    const used = [...page.matchAll(/api\['([a-zA-Z]+\.[a-zA-Z]+)'\]/g)].map((match) => match[1])
    expect(used.length).toBeGreaterThan(0)
    expect(used.filter((method) => !known.has(method))).toEqual([])
  })

  it('replays the tour and opens the shortcut list from real store actions', () => {
    expect(page).toContain('startTour')
    expect(page).toContain("openPalette('shortcuts')")
  })

  it('can show the welcome screen again without wiping anything else', () => {
    // Only the first-run flag is reset; projects, clips and tips are untouched.
    expect(page).toContain('saveSettings({ general: { firstRunCompleted: false } })')
    expect(page).not.toContain('help: {')
  })
})

describe('the welcome screen offers only real ways in', () => {
  const modal = read('src/renderer/features/onboarding/FirstRunModal.tsx')

  it('offers a new project, a video import, an existing project and the tour', () => {
    expect(modal).toContain('New project')
    expect(modal).toContain('Import a video')
    expect(modal).toContain('Open a project')
    expect(modal).toContain('Take the tour')
  })

  it('never invents a sample project or a required setup step', () => {
    // Visible copy only: a comment may explain why there is no sample.
    expect(modal).not.toMatch(/>[^<{}]*[Ss]ample/)
    // Skipping is possible from both pages, and nothing is gated on setup.
    expect(modal).toContain('Skip intro')
    expect(modal).not.toMatch(/disabled=\{[^}]*firstRunCompleted/)
  })

  it('closes itself before doing anything else', async () => {
    expect(modal.indexOf('firstRunCompleted: true')).toBeLessThan(modal.indexOf('next?.()'))
  })
})

describe('the help screen stays reachable', () => {
  const shell = read('src/renderer/App.tsx')

  it('is a real view with a sidebar row and a mounted tour', () => {
    expect(shell).toContain("import { HelpPage }")
    expect(shell).toContain("view === 'help'")
    expect(shell).toContain('<TourOverlay />')
    expect(shell).toMatch(/data-tour="help"[\s\S]{0,200}Help/)
  })

  it('can be reached from the command palette', () => {
    const commands = read('src/renderer/commands/appCommands.ts')
    expect(commands).toContain("id: 'help.open'")
    expect(commands).toContain("id: 'help.tour'")
    expect(commands).toContain("category: 'Help'")
  })
})
