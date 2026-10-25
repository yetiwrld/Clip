import { describe, expect, it } from 'vitest'
import { AppError } from '@shared/errors'
import { runProcess } from '../../src/main/services/media/ffmpeg'

describe('runProcess cancellation', () => {
  it('terminates the child process and rejects with PROCESS_CANCELLED', async () => {
    const controller = new AbortController()
    const started = Date.now()
    const running = runProcess(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 30000)'], {
      signal: controller.signal,
      timeoutMs: 35000
    })
    setTimeout(() => controller.abort(), 150)

    await expect(running).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('reports a process timeout separately from user cancellation', async () => {
    const started = Date.now()
    const running = runProcess(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 30000)'], { timeoutMs: 150 })
    await expect(running).rejects.toMatchObject({ code: 'PROCESS_TIMEOUT' })
    expect(Date.now() - started).toBeLessThan(5000)
  })
})
