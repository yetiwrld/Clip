import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAppStore } from '../../src/renderer/stores/app'
import { navigationCommands } from '../../src/renderer/commands/appCommands'

/**
 * Navigation contract.
 *
 * The app has three primary destinations (Projects, Render queue, Settings),
 * two levels of drill-down (project → tab, project → clip editor) and one
 * command palette that mirrors all of it. These tests pin the behaviour that
 * makes that structure predictable: where Back goes, what each project was
 * showing last time, and that every destination is reachable and named the same
 * way in the palette as on screen.
 */

const app = () => useAppStore.getState()

function reset(): void {
  useAppStore.setState({
    view: 'dashboard',
    projectId: null,
    editorClipId: null,
    history: [],
    future: [],
    projectTab: 'source',
    projectTabs: {},
    settingsSection: 'ai',
    transcriptUi: {}
  })
}

describe('back and forward', () => {
  beforeEach(reset)

  it('starts with nothing to go back to', () => {
    expect(app().canGoBack()).toBe(false)
    expect(app().canGoForward()).toBe(false)
  })

  it('returns to the screen you came from, not to the dashboard', () => {
    app().openProject('p1')
    app().navigate('settings')
    expect(app().view).toBe('settings')

    app().back()
    expect(app().view).toBe('project')
    expect(app().projectId).toBe('p1')
  })

  it('goes forward again after a step back', () => {
    app().openProject('p1')
    app().navigate('settings')
    app().back()
    expect(app().canGoForward()).toBe(true)

    app().forward()
    expect(app().view).toBe('settings')
    expect(app().canGoForward()).toBe(false)
  })

  it('restores the tab and settings section of the place it returns to', () => {
    app().openProject('p1')
    app().setProjectTab('moments')
    app().navigate('settings')
    app().setSettingsSection('storage')
    app().navigate('queue')

    // Queue ← Settings (storage) ← Project (moments)
    app().back()
    expect(app().view).toBe('settings')
    expect(app().settingsSection).toBe('storage')

    app().back()
    expect(app().view).toBe('project')
    expect(app().projectTab).toBe('moments')
  })

  it('does not record a step when you pick the screen you are already on', () => {
    app().navigate('queue')
    const depth = app().history.length
    app().navigate('queue')
    expect(app().history.length).toBe(depth)
  })

  it('keeps the stack bounded', () => {
    for (let i = 0; i < 60; i += 1) {
      app().navigate(i % 2 === 0 ? 'settings' : 'queue')
    }
    expect(app().history.length).toBeLessThanOrEqual(25)
  })

  it('a new navigation drops the forward steps', () => {
    app().navigate('queue')
    app().back()
    expect(app().canGoForward()).toBe(true)
    app().navigate('settings')
    expect(app().canGoForward()).toBe(false)
  })
})

describe('project context', () => {
  beforeEach(reset)

  it('remembers which tab each project was left on', () => {
    app().openProject('p1')
    app().setProjectTab('clips')
    app().navigate('dashboard')

    app().openProject('p2')
    expect(app().projectTab).toBe('source')

    app().openProject('p1')
    expect(app().projectTab).toBe('clips')
  })

  it('opens the editor without forgetting the project tab', () => {
    app().openProject('p1')
    app().setProjectTab('clips')
    app().openEditor('clip-1', 'p1')
    expect(app().view).toBe('editor')

    app().back()
    expect(app().view).toBe('project')
    expect(app().projectTab).toBe('clips')
  })

  it('keeps transcript search and scroll per project', () => {
    app().setTranscriptUi('p1', { query: 'budget', follow: false, scroll: 940 })
    app().setTranscriptUi('p2', { query: 'intro' })

    expect(app().transcriptUi.p1).toEqual({ query: 'budget', follow: false, scroll: 940 })
    expect(app().transcriptUi.p2.query).toBe('intro')
    expect(app().transcriptUi.p2.follow).toBe(true)

    // Writing the same values again must not touch the store.
    const before = app().transcriptUi
    app().setTranscriptUi('p1', { query: 'budget' })
    expect(app().transcriptUi).toBe(before)
  })
})

describe('palette parity with the screens', () => {
  const rendererDir = path.join(process.cwd(), 'src', 'renderer')
  const read = (relative: string) => fs.readFileSync(path.join(rendererDir, relative), 'utf8')
  const commands = navigationCommands()
  const byId = new Map(commands.map((command) => [command.id, command]))

  it('offers a command for every primary destination', () => {
    for (const id of ['nav.dashboard', 'nav.queue', 'nav.settings']) {
      expect(byId.get(id), `${id} must exist`).toBeTruthy()
    }
    expect(byId.get('nav.back')).toBeTruthy()
    expect(byId.get('nav.forward')).toBeTruthy()
  })

  it('uses the same destination names as the sidebar', () => {
    const sidebar = read('App.tsx')
    expect(byId.get('nav.dashboard')?.title).toBe('Go to Projects')
    expect(sidebar).toContain('> Projects')
    expect(byId.get('nav.queue')?.title).toBe('Go to Render queue')
    expect(sidebar).toContain('Render queue')
    expect(byId.get('nav.settings')?.title).toBe('Go to Settings')
    expect(read('features/settings/SettingsPage.tsx')).toContain('>Settings<')
  })

  it('offers a command for every project tab and names it like the tab', () => {
    const projectPage = read('features/project/ProjectPage.tsx')
    for (const label of ['Source', 'Transcript', 'Moments', 'Clips', 'Renders']) {
      expect(projectPage, `the tab ${label} must exist on screen`).toContain(`label="${label}"`)
      expect(byId.get(`project.tab.${label.toLowerCase()}`), `missing command for ${label}`).toBeTruthy()
    }
  })

  it('offers a command for every settings section and names it like the section', () => {
    const settings = read('features/settings/SettingsPage.tsx')
    const labels: Record<string, string> = {
      ai: 'AI providers',
      transcription: 'Transcription',
      video: 'Video & rendering',
      captions: 'Captions',
      export: 'Export',
      storage: 'Storage & privacy',
      advanced: 'Advanced'
    }
    for (const [id, label] of Object.entries(labels)) {
      expect(settings, `the section ${label} must exist on screen`).toContain(`label: '${label}'`)
      const command = byId.get(`settings.${id}`)
      expect(command, `missing command for ${label}`).toBeTruthy()
      // "Settings: Video and rendering" must match the on-screen "Video & rendering".
      expect(command?.title.replace(/ & /g, ' and ')).toBe(`Settings: ${label.replace(/ & /g, ' and ')}`)
    }
  })

  it('is a navigation command set with unique ids', () => {
    const ids = commands.map((command) => command.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('active state is announced, not only coloured', () => {
  const rendererDir = path.join(process.cwd(), 'src', 'renderer')
  const read = (relative: string) => fs.readFileSync(path.join(rendererDir, relative), 'utf8')

  it('marks the current sidebar destination', () => {
    const sidebar = read('App.tsx')
    expect(sidebar).toContain("aria-current={view === 'dashboard' ? 'page' : undefined}")
    expect(sidebar).toContain("aria-current={view === 'queue' ? 'page' : undefined}")
    expect(sidebar).toContain("aria-current={view === 'settings' ? 'page' : undefined}")
  })

  it('marks the current project tab and settings section', () => {
    expect(read('features/project/ProjectPage.tsx')).toContain("aria-current={active ? 'page' : undefined}")
    expect(read('features/settings/SettingsPage.tsx')).toContain("aria-current={section === s.id ? 'page' : undefined}")
  })

  it('has no second navigation row pointing at the render queue', () => {
    const sidebar = read('App.tsx')
    expect(sidebar).not.toContain('interrupted job{interrupted === 1')
  })
})
