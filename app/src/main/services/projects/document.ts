import { AppError } from '@shared/errors'
import type { ProjectDocument } from '@shared/types'
import type { AppContext } from '../app-context'
import {
  assetsRepo,
  candidatesRepo,
  clipTimelineRepo,
  clipsRepo,
  projectsRepo,
  rendersRepo,
  segmentsRepo
} from '../database/repositories'

/**
 * Assemble the versioned project document from the existing normalized
 * records. This is deliberately read-only: existing databases remain the
 * source of truth while editor consumers migrate to the aggregate boundary.
 */
export function getProjectDocument(ctx: AppContext, projectId: string): ProjectDocument {
  const project = projectsRepo.get(ctx.db, projectId)
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'That project no longer exists.')

  const clips = clipsRepo.listForProject(ctx.db, projectId).map((clip) => ({
    clip,
    timeline: clipTimelineRepo.get(ctx.db, clip.id)
  }))

  return {
    format: 'clipwright-project',
    schemaVersion: 1,
    project,
    assets: assetsRepo.list(ctx.db, projectId),
    transcript: segmentsRepo.listForProject(ctx.db, projectId),
    candidates: candidatesRepo.listForProject(ctx.db, projectId),
    clips,
    renders: rendersRepo.list(ctx.db, projectId)
  }
}
