import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type SqlJsDatabase } from 'sql.js'
import type { StorageStatus } from '@shared/types'

/**
 * SQLite database backed by sql.js (WASM). Whole-file atomic persistence:
 * `db.export()` → temp file → rename (ADR-003 / ADR-011).
 *
 * Persistence policy: debounced after writes, plus explicit flush points
 * (after every service transaction the caller may `persistNow()`; shutdown
 * always flushes). At our data scale (metadata + transcripts, MBs) a full
 * export is a few milliseconds.
 *
 * Durability rules (data safety audit):
 *   - `pending` stays true until the bytes are on disk, so a failed write is
 *     retried by the next write, the next flush, or shutdown.
 *   - a failed write never poisons `persistQueue`; the next flush still runs.
 *   - `status()` reports the truth, so the UI can say "Not saved" instead of
 *     guessing.
 *   - an unreadable database file is moved aside at startup instead of
 *     preventing the app from opening.
 */
export class AppDatabase {
  private db!: SqlJsDatabase
  private file!: string
  private timer: NodeJS.Timeout | null = null
  private pending = false
  private closed = false
  private persistQueue: Promise<void> = Promise.resolve()
  private lastPersistedAt: string | null = null
  private lastError: string | null = null
  private corruptBackup: string | null = null

  private constructor() {}

  static async open(file: string, moduleDir: string): Promise<AppDatabase> {
    const impl = new AppDatabase()
    const wasmPath = locateSqlWasm(moduleDir)
    const SQL = await initSqlJs({ locateFile: () => wasmPath })
    impl.file = file
    impl.db = openOrQuarantine(SQL, file, (backup) => {
      impl.corruptBackup = backup
    })
    impl.db.run('PRAGMA foreign_keys = ON')
    return impl
  }

  exec(sql: string): void {
    this.db.exec(sql)
    this.schedulePersist()
  }

  run(sql: string, params: unknown[] = []): { changes: number } {
    this.db.run(sql, params as never)
    this.schedulePersist()
    return { changes: this.db.getRowsModified() }
  }

  all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params as never)
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as T)
      return rows
    } finally {
      stmt.free()
    }
  }

  get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  transaction<T>(fn: () => T): T {
    this.db.run('BEGIN')
    try {
      const result = fn()
      this.db.run('COMMIT')
      this.schedulePersist()
      return result
    } catch (err) {
      try {
        this.db.run('ROLLBACK')
      } catch {
        /* already rolled back */
      }
      throw err
    }
  }

  schedulePersist(): void {
    this.pending = true
    if (this.closed) return
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      // persistNow keeps `pending` set when the write fails, so the next
      // write, flush or shutdown retries the same bytes.
      void this.persistNow().catch(() => undefined)
    }, 250)
    // Do not keep the process alive just for a pending flush.
    this.timer.unref?.()
  }

  /**
   * Write every pending change to disk and resolve only once it is there.
   * Rejects when the write fails, leaving `dirty` true so the caller can retry
   * and the UI can tell the truth.
   */
  async persistNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.closed) {
      await this.persistQueue
      return
    }
    if (!this.pending) {
      await this.persistQueue
      return
    }
    this.pending = false
    const data = Buffer.from(this.db.export())
    const tmp = `${this.file}.tmp`
    const write = this.persistQueue.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
      await fs.promises.writeFile(tmp, data)
      await fs.promises.rename(tmp, this.file)
    })
    // A rejected write must not kill the chain for every later flush.
    this.persistQueue = write.catch(() => undefined)
    try {
      await write
      this.lastPersistedAt = new Date().toISOString()
      this.lastError = null
    } catch (err) {
      this.pending = true
      this.lastError = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  /** The renderer-facing truth about what is on disk. */
  status(): StorageStatus {
    return {
      dirty: this.pending || Boolean(this.timer),
      lastPersistedAt: this.lastPersistedAt,
      lastError: this.lastError,
      recoveredFromCorrupt: this.corruptBackup !== null,
      corruptBackupPath: this.corruptBackup
    }
  }

  get isDirty(): boolean {
    return this.pending || this.timer !== null
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    // A failed final flush still closes cleanly: the bytes stay pending, the
    // caller sees the rejection, and the next launch reports what happened.
    try {
      await this.persistNow()
    } finally {
      this.closed = true
      await this.persistQueue
      this.db.close()
    }
  }

  get isOpen(): boolean {
    return !this.closed
  }
}

/**
 * Open the database file, or move an unreadable one aside and start fresh.
 * A corrupt file must not stop the app from opening — it must be preserved for
 * inspection and the user must be told (see `status().recoveredFromCorrupt`).
 */
function openOrQuarantine(
  SQL: { Database: new (data?: Uint8Array) => SqlJsDatabase },
  file: string,
  onQuarantine: (backupPath: string) => void
): SqlJsDatabase {
  if (!fs.existsSync(file)) return new SQL.Database()
  const bytes = fs.readFileSync(file)
  if (bytes.byteLength === 0) return new SQL.Database()
  try {
    const db = new SQL.Database(bytes)
    // Reading the schema is enough to fail on a truncated or foreign file.
    db.exec('SELECT count(*) FROM sqlite_master')
    return db
  } catch {
    const backup = `${file}.corrupt-${Date.now()}`
    fs.renameSync(file, backup)
    onQuarantine(backup)
    const fresh = new SQL.Database()
    fresh.run('PRAGMA foreign_keys = ON')
    return fresh
  }
}

/** Locate sql-wasm.wasm across dev / packaged / tsx / vitest layouts. */
function locateSqlWasm(moduleDir: string): string {
  const rel = path.join('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')

  // 1. require.resolve (CJS runtime)
  try {
    const req = typeof require === 'function' ? createRequire(__filename) : createRequire(path.join(moduleDir, 'noop.js'))
    return req.resolve('sql.js/dist/sql-wasm.wasm')
  } catch {
    /* try next strategy */
  }

  // 2. walk up from the module dir looking for node_modules
  let dir = moduleDir
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, rel)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  // 3. cwd
  const cwdCandidate = path.join(process.cwd(), rel)
  if (fs.existsSync(cwdCandidate)) return cwdCandidate

  throw new Error(
    `sql-wasm.wasm could not be located (moduleDir=${moduleDir}). ` +
      'Reinstall dependencies or set the workspace to a project checkout.'
  )
}
