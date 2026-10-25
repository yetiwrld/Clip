import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { AppError } from '@shared/errors'
import type {
  StorageCleanupCategoryId,
  StorageCleanupReport,
  StorageCleanupResult
} from '@shared/types'
import type { AppContext } from '../app-context'

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_MS = 30 * DAY_MS
const STALE_TEMP_AGE_MS = DAY_MS
const OLD_LOG_AGE_MS = 30 * DAY_MS

const CATEGORY_META: Record<StorageCleanupCategoryId, { label: string; description: string }> = {
  'preview-proxies': {
    label: 'Playback proxies',
    description: 'Low-resolution copies used only for playback compatibility. Originals are kept; a proxy is rebuilt if needed.'
  },
  filmstrips: {
    label: 'Timeline filmstrips',
    description: 'Generated timeline frame thumbnails. They are recreated from the original media when needed.'
  },
  waveforms: {
    label: 'Waveform caches',
    description: 'Generated audio waveform data and abandoned intermediate files. They can be rebuilt from project media.'
  },
  'transcription-audio': {
    label: 'Extracted transcription audio',
    description: 'Temporary audio extracted for cloud transcription. It can be extracted again from the original media.'
  },
  'stale-temporary-files': {
    label: 'Stale temporary files',
    description: 'Partial render, proxy, or thumbnail files older than 24 hours. Active project jobs are protected.'
  },
  'old-logs': {
    label: 'Logs older than 30 days',
    description: 'Old application log files. Recent logs and exported diagnostic reports are kept.'
  }
}

interface CleanupCandidate {
  category: StorageCleanupCategoryId
  filePath: string
  size: number
  mtimeMs: number
}

interface ActiveTaskRow {
  project_id: string | null
  state: string
}

interface ScanSnapshot {
  report: StorageCleanupReport
  candidates: CleanupCandidate[]
}

function within(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function safeRegularFile(workspaceRoot: string, filePath: string): fs.Stats | null {
  const root = path.resolve(workspaceRoot)
  const target = path.resolve(filePath)
  if (!within(root, target) || target === root) return null
  const relativeParts = path.relative(root, target).split(path.sep).filter(Boolean)
  let current = root
  try {
    for (const [index, part] of relativeParts.entries()) {
      current = path.join(current, part)
      const stats = fs.lstatSync(current)
      if (stats.isSymbolicLink()) return null
      const isLast = index === relativeParts.length - 1
      if (isLast ? !stats.isFile() : !stats.isDirectory()) return null
      if (isLast) return stats
    }
  } catch {
    return null
  }
  return null
}

function addFile(
  candidates: CleanupCandidate[],
  workspaceRoot: string,
  category: StorageCleanupCategoryId,
  filePath: string,
  predicate: (stats: fs.Stats) => boolean = () => true
): void {
  const stats = safeRegularFile(workspaceRoot, filePath)
  if (!stats || !predicate(stats)) return
  candidates.push({ category, filePath, size: stats.size, mtimeMs: stats.mtimeMs })
}

function walkFiles(
  root: string,
  visit: (filePath: string, name: string) => void,
  maxDepth = 8
): void {
  if (!isDirectory(root)) return
  const walk = (directory: string, depth: number): void => {
    if (depth > maxDepth) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      // Never follow symlinks while scanning user data.
      if (entry.isSymbolicLink()) continue
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(fullPath, depth + 1)
      else if (entry.isFile()) visit(fullPath, entry.name)
    }
  }
  walk(root, 0)
}

function isDirectory(dirPath: string): boolean {
  try {
    const stats = fs.lstatSync(dirPath)
    return stats.isDirectory() && !stats.isSymbolicLink()
  } catch {
    return false
  }
}

function projectDirectories(projectsDir: string): string[] {
  if (!isDirectory(projectsDir)) return []
  try {
    return fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => path.join(projectsDir, entry.name))
  } catch {
    return []
  }
}

function staleTemporaryName(name: string): boolean {
  return /\.tmp(?:\.|$)/i.test(name) || /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.ass$/i.test(name)
}

function fingerprintCandidates(ctx: AppContext, candidates: CleanupCandidate[]): string {
  const entries = candidates.map((candidate) => [
    candidate.category,
    path.relative(ctx.workspaceRoot, candidate.filePath).split(path.sep).join('/'),
    candidate.size,
    candidate.mtimeMs
  ] as const).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex')
}

function scanWorkspace(ctx: AppContext): ScanSnapshot {
  const now = Date.now()
  const candidates: CleanupCandidate[] = []
  const skippedProjectIds = new Set<string>()
  let activeRows: ActiveTaskRow[] = []
  try {
    activeRows = ctx.db.all<ActiveTaskRow>("SELECT project_id, state FROM tasks WHERE state IN ('queued', 'running')")
  } catch {
    // If task state cannot be read, fail closed for project caches below.
    activeRows = [{ project_id: null, state: 'running' }]
  }
  const activeProjects = new Set(activeRows.map((row) => row.project_id).filter((id): id is string => !!id))
  const cannotCheckActivity = activeRows.some((row) => row.project_id === null)

  for (const projectPath of projectDirectories(ctx.paths.projectsDir)) {
    const projectId = path.basename(projectPath)
    const projectCandidates: CleanupCandidate[] = []

    addFile(projectCandidates, ctx.workspaceRoot, 'preview-proxies', path.join(projectPath, 'source', 'proxy.mp4'))

    const filmstripDir = path.join(projectPath, 'thumbnails', 'filmstrip')
    walkFiles(filmstripDir, (filePath, name) => {
      if (name === 'meta.json' || /^f\d{3}\.jpg$/i.test(name)) {
        addFile(projectCandidates, ctx.workspaceRoot, 'filmstrips', filePath)
      }
    })

    const thumbnailsDir = path.join(projectPath, 'thumbnails')
    if (isDirectory(thumbnailsDir)) {
      let entries: fs.Dirent[] = []
      try { entries = fs.readdirSync(thumbnailsDir, { withFileTypes: true }) } catch { /* ignore inaccessible cache */ }
      for (const entry of entries) {
        if (entry.isSymbolicLink() || !entry.isFile()) continue
        if (/^waveform(?:-[a-zA-Z0-9_-]+)?\.(?:json|raw)$/i.test(entry.name)) {
          const filePath = path.join(thumbnailsDir, entry.name)
          // A .raw file is only useful while a waveform is being computed;
          // preserve recent ones in case a media request is still writing it.
          addFile(projectCandidates, ctx.workspaceRoot, 'waveforms', filePath, (stats) =>
            !entry.name.toLowerCase().endsWith('.raw') || now - stats.mtimeMs >= STALE_TEMP_AGE_MS
          )
        }
      }
    }

    addFile(projectCandidates, ctx.workspaceRoot, 'transcription-audio', path.join(projectPath, 'cache', 'audio-for-transcription.m4a'))

    const staleTempCutoff = now - STALE_TEMP_AGE_MS
    for (const directoryName of ['source', 'renders', 'thumbnails', 'cache']) {
      walkFiles(path.join(projectPath, directoryName), (filePath, name) => {
        if (staleTemporaryName(name)) {
          addFile(projectCandidates, ctx.workspaceRoot, 'stale-temporary-files', filePath, (stats) => stats.mtimeMs <= staleTempCutoff)
        }
      })
    }

    if (activeProjects.has(projectId) || cannotCheckActivity) {
      if (projectCandidates.length > 0) skippedProjectIds.add(projectId)
    } else {
      candidates.push(...projectCandidates)
    }
  }

  const logPaths = [ctx.paths.logsDir, ...projectDirectories(ctx.paths.projectsDir).map((dir) => path.join(dir, 'logs'))]
  const oldLogCutoff = now - OLD_LOG_AGE_MS
  for (const logDir of logPaths) {
    walkFiles(logDir, (filePath, name) => {
      if (path.extname(name).toLowerCase() === '.log') {
        addFile(candidates, ctx.workspaceRoot, 'old-logs', filePath, (stats) => stats.mtimeMs <= oldLogCutoff)
      }
    })
  }

  const categories = (Object.keys(CATEGORY_META) as StorageCleanupCategoryId[]).map((id) => {
    const group = candidates.filter((candidate) => candidate.category === id)
    return {
      id,
      ...CATEGORY_META[id],
      fileCount: group.length,
      bytes: group.reduce((total, candidate) => total + candidate.size, 0),
      examples: group.slice(0, 5).map((candidate) => path.relative(ctx.workspaceRoot, candidate.filePath).split(path.sep).join('/')),
      additionalFileCount: Math.max(0, group.length - 5)
    }
  })
  return {
    candidates,
    report: {
      scannedAt: new Date(now).toISOString(),
      scanToken: fingerprintCandidates(ctx, candidates),
      categories,
      reclaimableBytes: categories.reduce((total, category) => total + category.bytes, 0),
      skippedActiveProjects: skippedProjectIds.size
    }
  }
}

/** Scan only generated cache locations; source media, project records, renders, and exports are never candidates. */
export function scanStorageCleanup(ctx: AppContext): StorageCleanupReport {
  return scanWorkspace(ctx).report
}

/** Remove only reviewed allowlisted categories; abort if a fresh scan differs from the UI's reviewed snapshot. */
export function runStorageCleanup(
  ctx: AppContext,
  selectedCategories: StorageCleanupCategoryId[],
  expectedScanToken: string
): StorageCleanupResult {
  const selected = new Set(selectedCategories)
  const snapshot = scanWorkspace(ctx)
  if (snapshot.report.scanToken !== expectedScanToken) {
    throw new AppError(
      'STORAGE_SCAN_STALE',
      'Storage changed after the review scan.',
      'Nothing was removed. Scan again to review the current files before cleaning.'
    )
  }
  let removedFiles = 0
  let removedBytes = 0
  let skippedFiles = 0

  for (const candidate of snapshot.candidates) {
    if (!selected.has(candidate.category)) continue
    if (!within(ctx.workspaceRoot, candidate.filePath)) {
      skippedFiles++
      continue
    }
    try {
      // Refuse symlinks and changed files. The scan never follows symlinks,
      // and the second stat prevents deleting a cache that was replaced after scanning.
      const current = safeRegularFile(ctx.workspaceRoot, candidate.filePath)
      if (!current || current.size !== candidate.size || current.mtimeMs !== candidate.mtimeMs) {
        skippedFiles++
        continue
      }
      fs.unlinkSync(candidate.filePath)
      removedFiles++
      removedBytes += candidate.size
    } catch (error) {
      skippedFiles++
      ctx.logger.warn('storage.cleanup', 'remove', `could not remove ${path.basename(candidate.filePath)}`, String(error))
    }
  }

  const report = scanWorkspace(ctx).report
  ctx.logger.info('storage.cleanup', 'complete', `files=${removedFiles} bytes=${removedBytes} skipped=${skippedFiles}`)
  return {
    removedFiles,
    removedBytes,
    skippedFiles,
    skippedActiveProjects: snapshot.report.skippedActiveProjects,
    report
  }
}
