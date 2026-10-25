import { create } from 'zustand'
import type {
  AppEvent, Clip, ClipCandidate, Project, ProjectAsset, ProjectStorage, ProjectSummary, RenderJob, TaskInfo, TranscriptSegment, Speaker
} from '@shared/types'
import { api } from '../api/client'
import { useAppStore } from './app'

/**
 * Working data for the currently open project + the global render queue and
 * task list. Backend events (project:update, render:progress, render:state,
 * task:update) mutate this store directly so the UI stays live without
 * polling.
 */

interface DataStore {
  projects: ProjectSummary[]
  projectsLoaded: boolean
  refreshProjects(): Promise<void>

  activeProject: Project | null
  loadProject(id: string): Promise<Project | null>

  transcript: TranscriptSegment[]
  transcriptLoaded: boolean
  loadTranscript(projectId: string): Promise<void>

  speakers: Speaker[]
  loadSpeakers(projectId: string): Promise<void>

  candidates: ClipCandidate[]
  candidatesLoaded: boolean
  loadCandidates(projectId: string): Promise<void>

  clips: Clip[]
  loadClips(projectId: string): Promise<void>

  renders: RenderJob[]
  rendersLoaded: boolean
  loadRenders(projectId?: string): Promise<void>

  tasks: TaskInfo[]
  loadTasks(projectId?: string): Promise<void>

  storage: ProjectStorage | null
  loadStorage(projectId: string): Promise<void>

  assets: ProjectAsset[]
  loadAssets(projectId: string): Promise<void>

  handleEvent(event: AppEvent): void
}

export const useDataStore = create<DataStore>((set, get) => ({
  projects: [],
  projectsLoaded: false,

  async refreshProjects() {
    try {
      const projects = await api['projects.list']()
      set({ projects, projectsLoaded: true })
    } catch {
      set({ projectsLoaded: true })
    }
  },

  activeProject: null,
  async loadProject(id) {
    const project = await api['projects.get']({ id })
    set({ activeProject: project, transcript: [], transcriptLoaded: false, speakers: [], candidates: [], candidatesLoaded: false, clips: [], renders: [], storage: null, assets: [] })
    if (project) {
      void get().loadTranscript(id)
      void get().loadSpeakers(id)
      void get().loadCandidates(id)
      void get().loadClips(id)
      void get().loadRenders(id)
      void get().loadStorage(id)
      void get().loadAssets(id)
    }
    return project
  },

  transcript: [],
  transcriptLoaded: false,
  async loadTranscript(projectId) {
    try {
      const transcript = await api['transcript.get']({ projectId })
      set({ transcript, transcriptLoaded: true })
    } catch {
      set({ transcriptLoaded: true })
    }
  },

  speakers: [],
  async loadSpeakers(projectId) {
    try {
      const speakers = await api['transcript.speakers']({ projectId })
      set({ speakers })
    } catch {
      set({ speakers: [] })
    }
  },

  candidates: [],
  candidatesLoaded: false,
  async loadCandidates(projectId) {
    try {
      const candidates = await api['analysis.getCandidates']({ projectId })
      set({ candidates, candidatesLoaded: true })
    } catch {
      set({ candidatesLoaded: true })
    }
  },

  clips: [],
  async loadClips(projectId) {
    const clips = await api['clips.list']({ projectId })
    set({ clips })
  },

  renders: [],
  rendersLoaded: false,
  async loadRenders(projectId) {
    const renders = await api['renders.list'](projectId ? { projectId } : {})
    set({ renders, rendersLoaded: true })
  },

  tasks: [],
  async loadTasks(projectId) {
    const tasks = await api['tasks.list'](projectId ? { projectId } : {})
    set({ tasks })
  },

  storage: null,
  async loadStorage(projectId) {
    try {
      const storage = await api['projects.storage']({ id: projectId })
      set({ storage })
    } catch {
      set({ storage: null })
    }
  },

  assets: [],
  async loadAssets(projectId) {
    try {
      const assets = await api['media.assets.list']({ projectId })
      set({ assets })
    } catch {
      set({ assets: [] })
    }
  },

  handleEvent(event) {
    switch (event.type) {
      case 'project:update': {
        const project = event.project
        set((s) => ({
          activeProject: s.activeProject?.id === project.id ? project : s.activeProject,
          projects: s.projects.map((p) => (p.id === project.id ? { ...p, ...project, candidateCount: p.candidateCount, clipCount: p.clipCount, renderCount: p.renderCount, thumbnail: p.thumbnail } : p))
        }))
        // A successful background transcription saves segments before marking
        // the project transcribed. Refresh the open transcript when that
        // project update arrives so the completed result appears immediately.
        if (project.status === 'transcribed' && get().activeProject?.id === project.id) {
          void get().loadTranscript(project.id)
        }
        break
      }
      case 'task:update': {
        const task = event.task
        set((s) => {
          const existing = s.tasks.findIndex((t) => t.id === task.id)
          const tasks = existing === -1 ? [task, ...s.tasks] : s.tasks.map((t) => (t.id === task.id ? task : t))
          return { tasks }
        })
        // B-012: background task failures (e.g. a URL import that needs
        // yt-dlp) were silent — the reason only lived on the task row.
        if (task.state === 'failed' && task.error) {
          useAppStore.getState().toast({
            level: 'error',
            message: `${task.type === 'download' ? 'Import' : task.type} failed: ${task.error.message}`,
            hint: task.error.hint ?? undefined
          })
        }
        if (task.state === 'completed' && task.type === 'download' && task.result && typeof task.result === 'object') {
          const result = task.result as { kind?: unknown; clipId?: unknown; projectId?: unknown }
          if (result.kind === 'moment-section' && typeof result.clipId === 'string' && typeof result.projectId === 'string') {
            void get().refreshProjects()
            const app = useAppStore.getState()
            if (app.view === 'project' && app.projectId === task.projectId) {
              app.openEditor(result.clipId, result.projectId)
            } else {
              app.toast({ level: 'success', message: 'Selected video section is ready as a new clip project.' })
            }
          }
        }
        if (task.type === 'speaker-identification' && task.state === 'completed' && task.projectId && get().activeProject?.id === task.projectId) {
          void get().loadTranscript(task.projectId)
          void get().loadSpeakers(task.projectId)
        }
        if (task.type === 'asset-import' && ['completed', 'failed', 'cancelled'].includes(task.state)) {
          const projectId = task.projectId
          if (projectId && get().activeProject?.id === projectId) void get().loadAssets(projectId)
        }
        break
      }
      case 'render:progress': {
        set((s) => ({
          renders: s.renders.map((r) =>
            r.id === event.renderId ? { ...r, progress: event.progress, stage: event.stage, status: 'rendering' } : r
          )
        }))
        break
      }
      case 'render:state': {
        const render = event.render
        set((s) => {
          const existing = s.renders.findIndex((r) => r.id === render.id)
          const renders = existing === -1 ? [render, ...s.renders] : s.renders.map((r) => (r.id === render.id ? render : r))
          return { renders }
        })
        if (render.status === 'completed') void get().loadRenders(render.projectId)
        break
      }
    }
  }
}))
