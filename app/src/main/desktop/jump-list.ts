/**
 * The taskbar jump list: right-click the app icon and jump to a recent project.
 *
 * This is the Windows-native answer to "remember recent projects" that does not
 * need a project-file association (the app stores projects as folders, so there
 * is no document to hand to Explorer). Each entry reopens the app with
 * `--open-project <id>`; a second instance is never started because the app
 * already holds the single-instance lock.
 *
 * Pure and separate from Electron so the list can be built and tested without a
 * Windows machine. Only the recent handful is exposed: a 40-item jump list is a
 * menu nobody reads.
 */

export interface JumpListProject {
  id: string
  name: string
}

export interface JumpListItem {
  type: 'task'
  program: string
  arguments: string
  title: string
  description: string
  iconPath: string
  iconIndex: number
}

export const JUMP_LIST_LIMIT = 5

/** Titles are truncated by Windows; do it here so the cut is at a word. */
function titleFor(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim() || 'Untitled project'
  if (clean.length <= 40) return clean
  const cut = clean.slice(0, 40)
  const space = cut.lastIndexOf(' ')
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * Returns the `Tasks` list for `app.setUserTasks`, or null when the platform
 * cannot use it (or the app is not packaged, where `execPath` is Electron
 * itself and the entry would launch the wrong thing).
 */
export function userTasksForProjects(
  projects: JumpListProject[],
  options: { execPath: string; packaged: boolean; platform?: string; iconPath?: string }
): JumpListItem[] | null {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32' || !options.packaged || !options.execPath) return null
  const items: JumpListItem[] = []
  for (const project of projects.slice(0, JUMP_LIST_LIMIT)) {
    if (!project.id || !project.name) continue
    items.push({
      type: 'task',
      program: options.execPath,
      arguments: `--open-project ${project.id}`,
      title: titleFor(project.name),
      description: `Open “${project.name}” in Clipwright Studio`,
      iconPath: options.iconPath ?? options.execPath,
      iconIndex: 0
    })
  }
  return items.length > 0 ? items : null
}

/**
 * The project id from `--open-project <id>` (also accepts `--open-project=<id>`).
 * Anything else returns null, so a stray flag can never open a random project.
 */
export function projectIdFromArgs(argv: string[]): string | null {
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--open-project') {
      const next = argv[index + 1]
      return next && /^[A-Za-z0-9-]{8,64}$/.test(next) ? next : null
    }
    if (value.startsWith('--open-project=')) {
      const inline = value.slice('--open-project='.length)
      return /^[A-Za-z0-9-]{8,64}$/.test(inline) ? inline : null
    }
  }
  return null
}
