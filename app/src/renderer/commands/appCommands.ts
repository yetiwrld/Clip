/**
 * Application-level commands: navigation, projects, project tabs, settings
 * sections, and the palette itself.
 *
 * These run against the real stores, so selecting one does exactly what the
 * equivalent button does. Nothing here is decorative.
 */

import { useAppStore } from '../stores/app'
import type { ProjectTab, SettingsSection } from '../stores/app'
import type { Command } from './types'

const app = () => useAppStore.getState()

const PROJECT_TABS: Array<{ id: ProjectTab; title: string; keywords?: string[] }> = [
  { id: 'source', title: 'Go to Source tab', keywords: ['player', 'media'] },
  { id: 'transcript', title: 'Go to Transcript tab', keywords: ['words', 'speakers', 'search'] },
  { id: 'moments', title: 'Go to Moments tab', keywords: ['highlights', 'candidates', 'analysis'] },
  { id: 'clips', title: 'Go to Clips tab', keywords: ['cuts', 'edits'] },
  { id: 'renders', title: 'Go to Renders tab', keywords: ['exports', 'output'] }
]

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; title: string; keywords?: string[] }> = [
  { id: 'ai', title: 'Settings: AI providers', keywords: ['openai', 'anthropic', 'key'] },
  { id: 'transcription', title: 'Settings: Transcription', keywords: ['whisper', 'speakers', 'language'] },
  { id: 'video', title: 'Settings: Video and rendering', keywords: ['ffmpeg', 'concurrency', 'proxy'] },
  { id: 'captions', title: 'Settings: Captions', keywords: ['subtitles', 'fonts'] },
  { id: 'export', title: 'Settings: Export', keywords: ['quality', 'bitrate'] },
  { id: 'storage', title: 'Settings: Storage and privacy', keywords: ['cleanup', 'cache', 'disk'] },
  { id: 'advanced', title: 'Settings: Advanced', keywords: ['logs', 'diagnostics'] }
]

/** Navigation and help. Registered once, always available. */
export function navigationCommands(): Command[] {
  return [
    {
      id: 'palette.open',
      title: 'Command palette',
      category: 'Help',
      keywords: ['commands', 'search', 'actions'],
      hint: 'Search every action in the app',
      shortcut: { key: 'k', mod: true },
      // A palette is exactly the thing you want while typing.
      allowInInput: true,
      run: () => app().openPalette('commands')
    },
    {
      id: 'palette.shortcuts',
      title: 'Keyboard shortcuts',
      category: 'Help',
      keywords: ['reference', 'keys', 'bindings'],
      hint: 'Searchable list of every shortcut',
      shortcut: { key: '/', mod: true },
      allowInInput: true,
      run: () => app().openPalette('shortcuts')
    },
    {
      id: 'help.open',
      title: 'Help and setup',
      category: 'Help',
      keywords: ['documentation', 'faq', 'getting started', 'troubleshooting', 'version'],
      hint: 'What the app does, setup check and common questions',
      run: () => app().navigate('help')
    },
    {
      id: 'help.tour',
      title: 'Take the guided tour',
      category: 'Help',
      keywords: ['onboarding', 'walkthrough', 'learn', 'show me around'],
      hint: 'Six short stops over the controls you need first',
      run: () => {
        app().navigate('dashboard')
        app().startTour()
      }
    },
    {
      id: 'nav.dashboard',
      title: 'Go to Projects',
      category: 'Navigate',
      keywords: ['home', 'library', 'dashboard'],
      shortcut: { key: '1', mod: true },
      run: () => app().navigate('dashboard')
    },
    {
      id: 'nav.queue',
      title: 'Go to Render queue',
      category: 'Navigate',
      keywords: ['jobs', 'renders', 'exports'],
      shortcut: { key: '2', mod: true },
      run: () => app().navigate('queue')
    },
    {
      id: 'nav.settings',
      title: 'Go to Settings',
      category: 'Navigate',
      keywords: ['preferences', 'options'],
      shortcut: { key: '3', mod: true },
      run: () => app().navigate('settings')
    },
    {
      id: 'nav.back',
      title: 'Go back',
      category: 'Navigate',
      keywords: ['previous', 'return', 'history'],
      shortcut: { key: 'arrowleft', alt: true },
      enabled: () => app().canGoBack(),
      hint: 'Return to the screen you came from, with its tab and section',
      run: () => app().back()
    },
    {
      id: 'nav.forward',
      title: 'Go forward',
      category: 'Navigate',
      keywords: ['next', 'redo navigation', 'history'],
      shortcut: { key: 'arrowright', alt: true },
      enabled: () => app().canGoForward(),
      hint: 'Undo a step back',
      run: () => app().forward()
    },
    {
      id: 'dashboard.newProject',
      title: 'New project',
      category: 'Navigate',
      keywords: ['create', 'start', 'import'],
      hint: 'Jump to the new project field',
      enabled: () => app().view === 'dashboard',
      run: () => {
        app().navigate('dashboard')
        window.setTimeout(() => document.getElementById('new-project-name')?.focus(), 0)
      }
    },
    ...PROJECT_TABS.map((tab) => ({
      id: `project.tab.${tab.id}`,
      title: tab.title,
      category: 'Project' as const,
      keywords: tab.keywords,
      enabled: () => app().view === 'project' || app().view === 'editor',
      run: () => {
        if (app().view === 'editor') app().navigate('project', { projectId: app().projectId })
        app().setProjectTab(tab.id)
      }
    })),
    // Settings sections are reachable from anywhere: "storage" or "captions"
    // in the palette should take you there, not tell you to go to Settings
    // first and look again.
    ...SETTINGS_SECTIONS.map((section) => ({
      id: `settings.${section.id}`,
      title: section.title,
      category: 'Settings' as const,
      keywords: section.keywords,
      hint: 'Open this settings section',
      run: () => {
        app().navigate('settings')
        app().setSettingsSection(section.id)
      }
    }))
  ]
}

/** One command per project. Re-registered whenever the project list changes. */
export function projectCommands(projects: Array<{ id: string; name: string }>): Command[] {
  return projects.map((project) => ({
    id: `project.open.${project.id}`,
    title: project.name,
    category: 'Projects' as const,
    keywords: ['open project', project.name.split(/\s+/).join(' ')],
    hint: 'Open this project',
    run: () => app().openProject(project.id)
  }))
}

/** Ids owned by navigationCommands / projectCommands, used when replacing them. */
export function appCommandIds(): string[] {
  return [...navigationCommands(), ...projectCommands([])].map((command) => command.id)
}
