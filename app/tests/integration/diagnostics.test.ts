import { afterEach, describe, expect, it } from 'vitest'
import { makeTestContext } from '../helpers/context'
import { buildDiagnostics } from '../../src/main/services/diagnostics'

let cleanup: (() => Promise<void>) | null = null
afterEach(async () => { if (cleanup) await cleanup(); cleanup = null })

describe('diagnostics report', () => {
  it('includes the selected media binary paths and actual filesystem capacity', async () => {
    const { ctx, cleanup: dispose } = await makeTestContext()
    cleanup = dispose
    const report = await buildDiagnostics(ctx)
    expect(report.ffmpeg?.path).toBeTruthy()
    expect(report.ffmpeg?.source).toMatch(/^(setting|path|bundled)$/)
    expect(report.ffprobe?.path).toBeTruthy()
    expect(report.ffprobe?.source).toMatch(/^(setting|path|bundled)$/)
    expect(report.disk?.freeBytes).toBeGreaterThan(0)
    expect(report.disk?.totalBytes).toBeGreaterThan(report.disk?.freeBytes ?? Infinity)
  })
})
