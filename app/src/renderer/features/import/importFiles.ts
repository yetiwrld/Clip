/**
 * One import path for every way a file can arrive.
 *
 * A file dropped on the Projects page, a file Windows opened from Explorer, and
 * an extension on the command line all end up here. The rules are the same in
 * every case, which is the point: an unsupported file says so once, an empty
 * project is never left behind, and files that belong to a project go into it.
 */

import { api, errMessage } from '../../api/client'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'
import { baseNameOf, classifyPaths, unsupportedNotice, SUPPORTED_COPY } from '@shared/platform/files'

export interface ImportResult {
  imported: number
  failed: number
}

/** A project id is used when one is open; otherwise the first file starts one. */
export async function importDroppedPaths(paths: string[]): Promise<ImportResult> {
  const app = useAppStore.getState()
  const data = useDataStore.getState()
  const result: ImportResult = { imported: 0, failed: 0 }
  if (paths.length === 0) return result

  const openProjectId = app.view === 'project' || app.view === 'editor' ? app.projectId : null
  const classified = classifyPaths(paths, openProjectId ? 'asset' : 'source')

  if (classified.unsupported.length > 0) {
    app.toast({
      level: 'warn',
      message: unsupportedNotice(classified.unsupported),
      hint: `Clipwright imports ${SUPPORTED_COPY}.`
    })
  }

  if (classified.transcripts.length > 0) {
    if (!openProjectId) {
      app.toast({
        level: 'info',
        message: classified.transcripts.length === 1 ? 'Open a project before adding a transcript.' : 'Open a project before adding transcripts.',
        hint: 'A transcript is attached to one project, so pick the project first.'
      })
    } else {
      for (const transcript of classified.transcripts) {
        try {
          const imported = await api['transcript.import']({ projectId: openProjectId, filePath: transcript })
          result.imported += 1
          app.toast({
            level: 'success',
            message: `Added ${baseNameOf(transcript)} as the transcript for this project.`,
            hint: `${imported.segments} segments were read.`
          })
          await data.loadTranscript(openProjectId)
        } catch (err) {
          result.failed += 1
          app.toast({ level: 'error', ...errMessage(err) })
        }
      }
    }
  }

  if (classified.media.length === 0) return result

  if (openProjectId) {
    // Everything dropped while a project is open becomes an asset of it: the
    // source is already imported and must not be replaced by accident.
    try {
      await api['media.assets.import']({ projectId: openProjectId, filePaths: classified.media })
      result.imported += classified.media.length
      app.toast({
        level: 'success',
        message: classified.media.length === 1 ? 'Adding the dropped file to this project.' : `Adding ${classified.media.length} dropped files to this project.`,
        hint: 'They appear in the media panel when they have been read.'
      })
      await data.loadAssets(openProjectId)
    } catch (err) {
      result.failed += classified.media.length
      app.toast({ level: 'error', ...errMessage(err) })
    }
    return result
  }

  // Nothing open: the first file starts a project; the rest join it as assets.
  const [first, ...rest] = classified.media
  let projectId: string | null = null
  try {
    const project = await api['projects.create']({ name: baseNameOf(first) })
    projectId = project.id
    await data.refreshProjects()
    await api['media.importFile']({ projectId: project.id, filePath: first })
    result.imported += 1
    app.openProject(project.id)
  } catch (err) {
    result.failed += 1
    if (projectId) {
      // Never leave an empty shell of a project behind a failed import.
      await api['projects.delete']({ id: projectId, confirm: true }).catch(() => undefined)
      await data.refreshProjects()
    }
    app.toast({ level: 'error', ...errMessage(err) })
    return result
  }

  if (rest.length > 0 && projectId) {
    try {
      await api['media.assets.import']({ projectId, filePaths: rest })
      result.imported += rest.length
      app.toast({
        level: 'info',
        message: `Added the other ${rest.length === 1 ? 'file' : `${rest.length} files`} to the new project.`,
        hint: 'They are in the media panel of that project.'
      })
    } catch (err) {
      result.failed += rest.length
      app.toast({ level: 'error', ...errMessage(err) })
    }
  }

  await data.refreshProjects()
  return result
}
