import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAppContext } from '../src/main/services/app-context'
import { createBackend } from '../src/main/ipc/backend'

/**
 * Performance probe.
 *
 * Builds a throwaway workspace, fills it with data sizes a long project can
 * really reach, and reports how long the real IPC methods take. It exists so
 * performance claims in DATA_SAFETY.md / UI_AUDIT_AND_POLISH.md are measured
 * numbers rather than guesses, and so a regression can be re-measured later.
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/perf-probe.ts
 */

const SEGMENTS = Number(process.env.PROBE_SEGMENTS ?? 5000)
const CLIPS = Number(process.env.PROBE_CLIPS ?? 200)
const PROJECTS = Number(process.env.PROBE_PROJECTS ?? 25)

function now(): number {
  return Number(process.hrtime.bigint() / 1000n) / 1000
}

type Row = { label: string; ms: number; note?: string }
const rows: Row[] = []

async function time(label: string, fn: () => Promise<unknown> | unknown, note?: string): Promise<unknown> {
  const started = now()
  const value = await fn()
  rows.push({ label, ms: now() - started, note })
  return value
}

async function main(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-perf-'))
  const ctx = await createAppContext({
    workspaceRoot: root,
    appVersion: '0.0.0-probe',
    isElectron: false,
    moduleDir: path.resolve(__dirname, '..'),
    logLevel: 'error'
  })
  const backend = createBackend(ctx, null)

  const created = (await backend.invoke('projects.create', { name: 'Perf probe' })) as { id: string }
  const projectId = created.id

  // ---- seed a large transcript directly, then measure the read paths -------
  ctx.db.transaction(() => {
    for (let i = 0; i < SEGMENTS; i += 1) {
      const start = i * 2.4
      const words = Array.from({ length: 9 }, (_, w) => ({
        text: `w${w}`,
        start: start + w * 0.24,
        end: start + w * 0.24 + 0.22,
        confidence: 0.92
      }))
      ctx.db.run(
        'INSERT INTO transcript_segments (project_id, start_time, end_time, text, speaker, confidence, words) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [projectId, start, start + 2.2, `Line ${i}: this is what a long interview sounds like when nobody edits it.`, i % 3 === 0 ? 'SPEAKER_00' : 'SPEAKER_01', 0.9, JSON.stringify(words)]
      )
    }
  })

  const transcript = (await time('transcript.get (all segments)', () => backend.invoke('transcript.get', { projectId }), `${SEGMENTS} segments, word timings`)) as unknown[]
  await time('JSON payload of transcript.get', () => JSON.stringify(transcript), `${(JSON.stringify(transcript).length / 1024).toFixed(0)} kB over IPC`)
  await time('transcript.speakers', () => backend.invoke('transcript.speakers', { projectId }))

  // ---- clips: the editor's most-hit list ----------------------------------
  const clipIds: string[] = []
  ctx.db.transaction(() => {
    for (let i = 0; i < CLIPS; i += 1) {
      const id = `perf-clip-${String(i).padStart(3, '0')}`
      clipIds.push(id)
      ctx.db.run(
        'INSERT INTO clips (id, project_id, start_time, end_time, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, projectId, i * 3, i * 3 + 45, `Clip ${i}`, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
      )
      ctx.db.run('INSERT INTO clip_timelines (clip_id, document, updated_at) VALUES (?, ?, ?)', [id, '{"tracks":[],"items":[],"snapEnabled":true}', '2026-01-01T00:00:00.000Z'])
    }
  })
  await time('clips.list', () => backend.invoke('clips.list', { projectId }), `${CLIPS} clips and timelines`)

  const first = clipIds[0]

  // A durable method now exports the whole database, so this is the number that
  // decides whether "save on every edit" is affordable at this data size.
  await time('clips.update (durable: DB export)', () =>
    backend.invoke('clips.update', { id: first, patch: { title: 'Renamed once' } })
  )
  await time('timeline.save (durable: DB export)', () =>
    backend.invoke('timeline.save', { clipId: first, timeline: { tracks: [], items: [], zoom: 1, snapEnabled: true } })
  )
  await time('timeline.get', () => backend.invoke('timeline.get', { clipId: first }))
  await time('storage.flush (no-op)', () => backend.invoke('storage.flush', {}))
  await time('storage.status', () => backend.invoke('storage.status', {}))
  await time('db.persistNow (full export + write)', () => ctx.db.persistNow())

  // ---- many projects: the dashboard list ----------------------------------
  for (let i = 0; i < PROJECTS; i += 1) await backend.invoke('projects.create', { name: `Project ${i}` })
  await time('projects.list', () => backend.invoke('projects.list', {}), `${PROJECTS + 1} projects`)

  // ---- renderer-side maths, measured on the same data ----------------------
  const { buildCues } = await import('../src/shared/captions/segmentation')
  const { computeCrop } = await import('../src/shared/video/crop')
  const segments = (await backend.invoke('transcript.get', { projectId })) as Parameters<typeof buildCues>[0]

  const captionOptions = {
    maxWordsPerCue: 6,
    maxCharsPerLine: 32,
    maxLines: 2,
    textEdits: {},
    splits: [],
    merges: [],
    offsets: {},
    hidden: [],
    duplicates: [],
    fromTime: 0,
    toTime: 60
  }
  await time('buildCues (60 s window, all segments)', () => buildCues(segments, captionOptions as never), `${SEGMENTS} segments to filter`)
  await time('buildCues (whole transcript)', () =>
    buildCues(segments, { ...captionOptions, toTime: 1e6 } as never),
    `${SEGMENTS} segments`
  )
  await time('computeCrop (per render)', () => computeCrop(3840, 2160, 1080, 1920, 'center', 0.5, 1.1, 0.5), 'called on every playhead tick')
  const allCues = buildCues(segments, { ...captionOptions, toTime: 1e6 } as never)
  const { cueAt } = await import('../src/shared/captions/segmentation')
  await time('cueAt lookup x100', () => {
    for (let i = 0; i < 100; i += 1) cueAt(allCues, i * 1.7)
  }, `${allCues.length} cues, linear scan per lookup`)

  await ctx.shutdown()

  const dbPath = path.join(root, 'database', 'app.db')
  const size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0

  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(`\nseed: ${SEGMENTS} segments · ${CLIPS} clips · ${PROJECTS + 1} projects · db ${(size / 1024).toFixed(0)} kB\n`)
  console.log(pad('method', 46) + pad('ms', 10) + 'note')
  for (const row of rows) console.log(pad(row.label, 46) + pad(row.ms.toFixed(2), 10) + (row.note ?? ''))

  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
