import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTestContext } from '../helpers/context'
import { getBinaries, inspectMedia } from '../../src/main/services/media/inspect'
import { playbackVerdict } from '../../src/main/services/media/analysis'
import { runProcess } from '../../src/main/services/media/ffmpeg'

let cleanupContext: (() => Promise<void>) | null = null
let audioFile: string | null = null

afterEach(async () => {
  if (cleanupContext) await cleanupContext()
  cleanupContext = null
  if (audioFile) {
    try { fs.rmSync(audioFile, { force: true }) } catch { /* best effort */ }
  }
  audioFile = null
})

describe('audio-first URL source support', () => {
  it('accepts a real audio-only file only when explicitly allowed', async () => {
    const { ctx, cleanup } = await makeTestContext()
    cleanupContext = cleanup
    const { ffmpeg, ffprobe } = await getBinaries(ctx)
    audioFile = path.join(os.tmpdir(), `clipwright-audio-only-${crypto.randomUUID()}.m4a`)
    const generated = await runProcess(ffmpeg.path, [
      '-hide_banner', '-y', '-f', 'lavfi', '-i', 'sine=frequency=700:duration=1',
      '-c:a', 'aac', audioFile
    ])
    expect(generated.code).toBe(0)

    const info = await inspectMedia(ffprobe.path, audioFile, { allowAudioOnly: true })
    expect(info.hasVideo).toBe(false)
    expect(info.hasAudio).toBe(true)
    expect(info.width).toBe(0)
    expect(info.videoCodec).toBeNull()
    expect(playbackVerdict(info).verdict).toBe('audio-only')
    await expect(inspectMedia(ffprobe.path, audioFile)).rejects.toMatchObject({ code: 'NO_VIDEO_STREAM' })
  })
})
