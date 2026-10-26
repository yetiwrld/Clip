import { api, isElectron, errMessage } from '../../api/client'
import { pickUpload } from '../../api/upload'
import { useAppStore } from '../../stores/app'
import { useDataStore } from '../../stores/data'

/**
 * Pick a file, create a project named after it and import it.
 *
 * Shared by the Projects page and the welcome screen so both paths behave the
 * same: a cancelled chooser leaves no empty project behind.
 */
export async function importVideoFile(): Promise<void> {
  const app = useAppStore.getState()
  const data = useDataStore.getState()
  try {
    let filePath: string | null = null
    if (isElectron) {
      const picked = await api['media.pickSourceFile']()
      filePath = picked.filePath
    } else {
      filePath = await pickUpload(['video/*', 'audio/*', '.mkv', '.webm'])
    }
    if (!filePath) {
      app.toast({ level: 'warn', message: 'Import cancelled.' })
      return
    }
    const baseName = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Imported video'
    const project = await api['projects.create']({ name: baseName })
    await data.refreshProjects()
    await api['media.importFile']({ projectId: project.id, filePath })
    await data.refreshProjects()
    app.openProject(project.id)
  } catch (err) {
    app.toast({ level: 'error', ...errMessage(err) })
  }
}
